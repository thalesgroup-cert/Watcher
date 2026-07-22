import importlib
import logging
import os
import pkgutil

from cryptography.fernet import Fernet, InvalidToken
from django.conf import settings
from django.utils import timezone

logger = logging.getLogger('watcher.connectors')

# Module-level cache. Populated lazily on first call to _get_registry().
# Note: these are process-level globals. In multi-process deployments each
# worker holds its own copy. _connectors_seeded guards a one-time DB seed
# per process; a short race window exists between the flag check and the
# update_or_create call, but update_or_create is atomic on the DB side so
# the worst outcome is two identical upserts, which is harmless.
_REGISTRY = {}
_connectors_seeded = False

_SENSITIVE_SUBSTRINGS = ('password', 'secret', 'token', 'key', 'api_key', '_pw', '_pass')


def _is_sensitive(field_name: str) -> bool:
    lower = field_name.lower()
    return any(s in lower for s in _SENSITIVE_SUBSTRINGS)


def _get_settings_value(field: dict) -> str:
    """Return the settings.py / env fallback value for a field definition."""
    settings_key = field.get('settings_key', '')
    if not settings_key:
        return str(field.get('default', ''))
    # Special case: DATABASES_* keys map to settings.DATABASES['default'][key]
    if settings_key.startswith('DATABASES_'):
        db_key = settings_key[len('DATABASES_'):]  # e.g. 'HOST', 'PORT', 'NAME', 'USER'
        return str(getattr(settings, 'DATABASES', {}).get('default', {}).get(db_key, field.get('default', '')))
    return str(getattr(settings, settings_key, field.get('default', '')))


def _get_fernet() -> Fernet:
    return Fernet(settings.CONNECTORS_ENCRYPTION_KEY)


def connector_encrypt(value: str) -> str:
    return _get_fernet().encrypt(value.encode()).decode()


def connector_decrypt(value: str) -> str:
    try:
        return _get_fernet().decrypt(value.encode()).decode()
    except InvalidToken:
        logger.warning(
            'connector_decrypt: decryption failed (CONNECTORS_ENCRYPTION_KEY may have changed) - returning raw value'
        )
        return value


def _get_registry() -> dict:
    global _REGISTRY
    if _REGISTRY:
        return _REGISTRY

    import connectors.contrib as contrib_pkg
    contrib_path = os.path.dirname(contrib_pkg.__file__)

    for finder, name, ispkg in pkgutil.iter_modules([contrib_path]):
        if not ispkg:
            continue
        if name.startswith('_'):
            # Documentation-only packages (e.g. contrib/_template) are never
            # auto-registered as real connectors.
            continue
        module_path = f'connectors.contrib.{name}.connector'
        try:
            mod = importlib.import_module(module_path)
            definition = getattr(mod, 'DEFINITION', None)
            health_check = getattr(mod, 'health_check', None)
            if definition and health_check and 'id' in definition:
                _REGISTRY[definition['id']] = {
                    'definition': definition,
                    'health_check': health_check,
                    'module': mod,
                }
                logger.debug("Loaded connector plugin: %s", definition['id'])
        except Exception as exc:
            logger.error("Failed to load connector plugin '%s': %s", name, exc)

    return _REGISTRY


def _ensure_connectors_seeded() -> None:
    """
    Backfill DB rows with settings.py/env values for any connector fields not
    yet present, once per process. This means values added to settings.py
    after a connector's DB row already exists still get picked up on the next
    dashboard/API call, without ever overwriting an existing override.
    """
    global _connectors_seeded
    if _connectors_seeded:
        return

    from .models import ConnectorOverride

    registry = _get_registry()
    for connector_id, entry in registry.items():
        definition = entry['definition']
        obj, _ = ConnectorOverride.objects.get_or_create(connector_id=connector_id)
        changed = False
        for field in definition.get('fields', []):
            if field['name'] in obj.overrides:
                continue
            value = _get_settings_value(field)
            if not value:
                continue
            if _is_sensitive(field['name']):
                value = connector_encrypt(value)
            obj.overrides[field['name']] = value
            if field['name'] not in obj.auto_seeded_fields:
                obj.auto_seeded_fields.append(field['name'])
            changed = True
        if changed:
            obj.save()

    _connectors_seeded = True


def _resolve_raw(connector_id: str, field: dict) -> str:
    """Return the stored (possibly encrypted) raw value for a field."""
    from .models import ConnectorOverride
    try:
        override = ConnectorOverride.objects.get(connector_id=connector_id)
        stored = override.overrides.get(field['name'])
        if stored is not None:
            return stored
    except ConnectorOverride.DoesNotExist:
        pass
    # Fallback to settings.py / env
    value = _get_settings_value(field)
    if value and _is_sensitive(field['name']):
        return connector_encrypt(value)
    return value


def _compute_status(definition: dict, filled_map: dict) -> str:
    """
    Derive a configured/partial/disabled status from which required fields
    are filled. This reflects configuration completeness only - it says
    nothing about whether the connector can actually reach the external
    service; that's what the separate health status (see get_connector_health)
    is for.
    """
    required = [f['name'] for f in definition.get('fields', []) if f.get('required', False)]
    if not required:
        return 'configured'
    filled = [name for name in required if filled_map.get(name)]
    if not filled:
        return 'disabled'
    if len(filled) < len(required):
        return 'partial'
    return 'configured'


def _get_override_and_auto_seeded(connector_id: str) -> tuple:
    """Return (overrides dict, set of field names that were auto-seeded rather than human-chosen)."""
    from .models import ConnectorOverride
    try:
        obj = ConnectorOverride.objects.get(connector_id=connector_id)
        return obj.overrides, set(obj.auto_seeded_fields)
    except ConnectorOverride.DoesNotExist:
        return {}, set()


def _build_connector_dict(connector_id: str, reveal: bool = False) -> dict:
    registry = _get_registry()
    entry = registry[connector_id]
    definition = entry['definition']
    override_dict, auto_seeded = _get_override_and_auto_seeded(connector_id)

    fields_out = []
    filled_map = {}
    for field in definition.get('fields', []):
        raw = _resolve_raw(connector_id, field)
        sensitive = _is_sensitive(field['name'])
        filled_map[field['name']] = bool(raw)
        if sensitive and not reveal:
            display_value = '••••••••' if raw else ''
        elif sensitive and reveal:
            display_value = connector_decrypt(raw) if raw else ''
        else:
            display_value = raw

        fields_out.append({
            'name': field['name'],
            'label': field.get('label', field['name']),
            'type': field.get('type', 'text'),
            'value': display_value,
            'sensitive': sensitive,
            'required': field.get('required', False),
            'overridden': field['name'] in override_dict and field['name'] not in auto_seeded,
        })

    return {
        'id': connector_id,
        'name': definition.get('name', connector_id),
        'logo': definition.get('logo', '🔌'),
        'category': definition.get('category', 'Other'),
        'description': definition.get('description', ''),
        'readonly': definition.get('readonly', False),
        'version': definition.get('version', '1.0.0'),
        'author': definition.get('author', ''),
        'status': _compute_status(definition, filled_map),
        'health': get_connector_health(connector_id),
        'fields': fields_out,
    }


def get_all_connectors() -> list:
    _ensure_connectors_seeded()
    return [_build_connector_dict(cid) for cid in sorted(_get_registry().keys())]


def get_connector_by_id(connector_id: str, reveal: bool = False) -> dict:
    _ensure_connectors_seeded()
    registry = _get_registry()
    if connector_id not in registry:
        raise KeyError(f"Connector '{connector_id}' not found")
    return _build_connector_dict(connector_id, reveal=reveal)


def connector_exists(connector_id: str) -> bool:
    return connector_id in _get_registry()


def get_connector_count() -> int:
    return len(_get_registry())


def save_connector_overrides(connector_id: str, fields: dict) -> None:
    """
    Save field overrides for a connector. Sensitive fields are encrypted before storage.
    `fields` is a dict {field_name: plain_value}.
    """
    from .models import ConnectorOverride

    registry = _get_registry()
    if connector_id not in registry:
        raise KeyError(f"Connector '{connector_id}' not found")

    definition = registry[connector_id]['definition']
    if definition.get('readonly'):
        raise PermissionError(f"Connector '{connector_id}' is read-only and cannot be overridden")
    known_names = {f['name'] for f in definition.get('fields', [])}

    obj, created = ConnectorOverride.objects.get_or_create(connector_id=connector_id)

    to_store = {}
    for name, value in fields.items():
        if name not in known_names:
            continue
        # Untouched masked placeholder - keep the existing stored value as-is.
        if value == '••••••••':
            continue
        # Explicit clear - store an empty string rather than dropping the key.
        # A present-but-empty key means "initialized, deliberately empty" and
        # must never fall back to settings.py/env again; an absent key means
        # "never initialized yet", which is the only case that should still
        # read from settings.py (see _resolve_raw and _ensure_connectors_seeded).
        if value in ('', None):
            to_store[name] = ''
            continue
        if _is_sensitive(name):
            to_store[name] = connector_encrypt(value)
        else:
            to_store[name] = value

    obj.overrides.update(to_store)
    # Any field touched in this save (set or cleared) is now a deliberate
    # human choice, not an auto-seeded settings.py default.
    obj.auto_seeded_fields = [f for f in obj.auto_seeded_fields if f not in to_store]
    obj.save()


def reset_connector_field(connector_id: str, field_name: str) -> None:
    """
    Remove a field's override entirely so it goes back to tracking
    settings.py/env live, instead of staying frozen at whatever value (even
    empty) was last saved for it.
    """
    from .models import ConnectorOverride

    registry = _get_registry()
    if connector_id not in registry:
        raise KeyError(f"Connector '{connector_id}' not found")

    definition = registry[connector_id]['definition']
    if definition.get('readonly'):
        raise PermissionError(f"Connector '{connector_id}' is read-only and cannot be overridden")
    known_names = {f['name'] for f in definition.get('fields', [])}
    if field_name not in known_names:
        raise KeyError(f"Field '{field_name}' not found on connector '{connector_id}'")

    try:
        obj = ConnectorOverride.objects.get(connector_id=connector_id)
    except ConnectorOverride.DoesNotExist:
        return
    changed = False
    if field_name in obj.overrides:
        del obj.overrides[field_name]
        changed = True
    if field_name in obj.auto_seeded_fields:
        obj.auto_seeded_fields = [f for f in obj.auto_seeded_fields if f != field_name]
        changed = True
    if changed:
        obj.save()


def get_connector_health(connector_id: str) -> dict:
    """
    Return the outcome of the most recent connectivity test for a connector:
    {'status': 'healthy' | 'unhealthy' | 'unknown', 'message': str, 'checked_at': str|None}.
    'unknown' means it has never been tested yet (neither manually nor by the
    weekly scheduled job).
    """
    from .models import ConnectorHealthCheck
    try:
        hc = ConnectorHealthCheck.objects.get(connector_id=connector_id)
    except ConnectorHealthCheck.DoesNotExist:
        return {'status': 'unknown', 'message': '', 'checked_at': None}

    if hc.healthy is None:
        status_str = 'unknown'
    else:
        status_str = 'healthy' if hc.healthy else 'unhealthy'
    return {
        'status': status_str,
        'message': hc.message,
        'checked_at': hc.checked_at.isoformat() if hc.checked_at else None,
    }


def record_health_check(connector_id: str, success: bool, message: str) -> None:
    """Persist the outcome of a connectivity test (manual or scheduled)."""
    from .models import ConnectorHealthCheck
    ConnectorHealthCheck.objects.update_or_create(
        connector_id=connector_id,
        defaults={'healthy': success, 'message': message, 'checked_at': timezone.now()},
    )


def test_connector(connector_id: str) -> dict:
    """Call the plugin's health_check, persist the outcome, and return {'success': bool, 'message': str}."""
    registry = _get_registry()
    if connector_id not in registry:
        raise KeyError(f"Connector '{connector_id}' not found")

    entry = registry[connector_id]

    def plain(field_name: str) -> str:
        try:
            return get_config_value(connector_id, field_name)
        except KeyError:
            return ''

    try:
        result = entry['health_check'](plain)
    except Exception as exc:
        logger.error("health_check failed for connector '%s': %s", connector_id, exc)
        result = {'success': False, 'message': str(exc)}

    record_health_check(connector_id, bool(result.get('success')), result.get('message', ''))
    return result


def run_weekly_health_checks() -> None:
    """
    Scheduled job (auto-run only, never triggered by the manual Test button):
    test every connector so its health badge stays current. A PendingAction
    alert is only queued when a connector the user has actually finished
    configuring (status == 'configured') fails - a failure on a connector
    nobody has set up yet isn't actionable, so it's tested but not alerted on.
    """
    from common.models import PendingAction

    registry = _get_registry()
    for connector_id in sorted(registry.keys()):
        connector = get_connector_by_id(connector_id)
        result = test_connector(connector_id)

        if result.get('success') or connector['status'] != 'configured':
            continue

        already_queued = any(
            pa.metadata.get('connector_id') == connector_id
            for pa in PendingAction.objects.filter(
                action_type='connector_health_check', status='pending'
            )
        )
        if already_queued:
            continue

        connector_name = connector['name']
        message = result.get('message', 'Health check failed')
        PendingAction.objects.create(
            action_type='connector_health_check',
            title=f"⚠️ {connector_name} is unhealthy",
            description=(
                f"The weekly automatic health check for '{connector_name}' failed, even though it's fully "
                f"configured:\n\n"
                f"{message}\n\n"
                f"This usually means the external service is unreachable, or a credential has expired or been "
                f"rotated. Check its configuration on the /connectors page, then resolve this alert."
            ),
            metadata={'connector_id': connector_id, 'connector_name': connector_name, 'message': message},
        )
        logger.warning(
            "Connector '%s' is configured but failed its weekly health check: %s", connector_id, message,
        )


def get_config_value(connector_id: str, field_name: str) -> str:
    """
    Return the live, decrypted value for one connector field: the DB override if
    present, else the settings.py/env fallback. This is the single source of truth
    the rest of the app should use instead of reading settings.<NAME> directly, so
    that overrides saved via the /connectors page actually take effect app-wide.
    """
    registry = _get_registry()
    if connector_id not in registry:
        raise KeyError(f"Connector '{connector_id}' not found")
    definition = registry[connector_id]['definition']
    for field in definition.get('fields', []):
        if field['name'] == field_name:
            raw = _resolve_raw(connector_id, field)
            if _is_sensitive(field_name) and raw:
                return connector_decrypt(raw)
            return raw
    raise KeyError(f"Field '{field_name}' not found on connector '{connector_id}'")


def _as_bool(value: str) -> bool:
    return str(value).lower() in ('true', '1', 'yes')


def get_smtp_config() -> dict:
    return {
        'host': get_config_value('smtp', 'EMAIL_HOST'),
        'port': int(get_config_value('smtp', 'EMAIL_PORT') or 25),
        'use_tls': _as_bool(get_config_value('smtp', 'EMAIL_USE_TLS')),
        'use_ssl': _as_bool(get_config_value('smtp', 'EMAIL_USE_SSL')),
        'user': get_config_value('smtp', 'EMAIL_HOST_USER'),
        'password': get_config_value('smtp', 'EMAIL_HOST_PASSWORD'),
        'from_email': get_config_value('smtp', 'EMAIL_FROM'),
    }


def get_slack_config() -> dict:
    return {
        'token': get_config_value('slack', 'SLACK_API_TOKEN'),
        'channel': get_config_value('slack', 'SLACK_CHANNEL'),
    }


def get_citadel_config() -> dict:
    return {
        'url': get_config_value('citadel', 'CITADEL_URL'),
        'token': get_config_value('citadel', 'CITADEL_API_TOKEN'),
        'room_id': get_config_value('citadel', 'CITADEL_ROOM_ID'),
    }


def get_thehive_config() -> dict:
    tags = get_config_value('thehive', 'THE_HIVE_TAGS')
    return {
        'url': get_config_value('thehive', 'THE_HIVE_URL'),
        'key': get_config_value('thehive', 'THE_HIVE_KEY'),
        'verify_ssl': _as_bool(get_config_value('thehive', 'THE_HIVE_VERIFY_SSL')),
        'custom_field': get_config_value('thehive', 'THE_HIVE_CUSTOM_FIELD'),
        'email_sender': get_config_value('thehive', 'THE_HIVE_EMAIL_SENDER'),
        'tags': tags.split(',') if tags else [],
    }


def get_misp_config() -> dict:
    tags = get_config_value('misp', 'MISP_TAGS')
    return {
        'url': get_config_value('misp', 'MISP_URL'),
        'key': get_config_value('misp', 'MISP_KEY'),
        'verify_ssl': _as_bool(get_config_value('misp', 'MISP_VERIFY_SSL')),
        'ticketing_url': get_config_value('misp', 'MISP_TICKETING_URL'),
        'tags': tags.split(',') if tags else [],
    }


def get_certstream_config() -> dict:
    return {'url': get_config_value('certstream', 'CERT_STREAM_URL')}


def get_searxng_config() -> dict:
    return {'url': get_config_value('searxng', 'DATA_LEAK_SEARX_URL')}


def get_cyberwatch_cve_config() -> dict:
    return {'cve_api_url': get_config_value('cyberwatch_cve', 'CYBER_WATCH_CVE_API_URL')}


def get_ransomware_live_config() -> dict:
    return {
        'groups_url': get_config_value('ransomware_live', 'CYBER_WATCH_RANSOMWARE_GROUPS_URL'),
        'victims_url': get_config_value('ransomware_live', 'CYBER_WATCH_RANSOMWARE_VICTIMS_URL'),
    }


def get_ransomlook_config() -> dict:
    return {
        'groups_url': get_config_value('ransomlook', 'CYBER_WATCH_RANSOMLOOK_GROUPS_URL'),
        'recent_url': get_config_value('ransomlook', 'CYBER_WATCH_RANSOMLOOK_RECENT_URL'),
        'actors_url': get_config_value('ransomlook', 'CYBER_WATCH_RANSOMLOOK_ACTORS_URL'),
    }
