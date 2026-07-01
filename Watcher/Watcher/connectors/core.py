import importlib
import logging
import os
import pkgutil

from django.core import signing
from django.conf import settings

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


def connector_encrypt(value: str) -> str:
    return signing.dumps(value, salt='connectors')


def connector_decrypt(value: str) -> str:
    try:
        return signing.loads(value, salt='connectors')
    except signing.BadSignature:
        logger.warning(
            'connector_decrypt: decryption failed (SECRET_KEY may have changed) — returning raw value'
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
    """Copy settings.py defaults into DB for connectors not yet present."""
    global _connectors_seeded
    if _connectors_seeded:
        return

    from .models import ConnectorOverride

    registry = _get_registry()
    for connector_id, entry in registry.items():
        definition = entry['definition']
        defaults = {}
        for field in definition.get('fields', []):
            value = _get_settings_value(field)
            if value:
                if _is_sensitive(field['name']):
                    value = connector_encrypt(value)
                defaults[field['name']] = value

        ConnectorOverride.objects.update_or_create(
            connector_id=connector_id,
            defaults={'overrides': defaults} if not ConnectorOverride.objects.filter(connector_id=connector_id).exists() else {},
        )

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
    """Derive a connected/partial/disabled status from which required fields are filled."""
    required = [f['name'] for f in definition.get('fields', []) if f.get('required', False)]
    if not required:
        return 'connected'
    filled = [name for name in required if filled_map.get(name)]
    if not filled:
        return 'disabled'
    if len(filled) < len(required):
        return 'partial'
    return 'connected'


def _build_connector_dict(connector_id: str, reveal: bool = False) -> dict:
    registry = _get_registry()
    entry = registry[connector_id]
    definition = entry['definition']

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
        })

    return {
        'id': connector_id,
        'name': definition.get('name', connector_id),
        'logo': definition.get('logo', '🔌'),
        'category': definition.get('category', 'Other'),
        'description': definition.get('description', ''),
        'readonly': definition.get('readonly', False),
        'status': _compute_status(definition, filled_map),
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
    known_names = {f['name'] for f in definition.get('fields', [])}

    to_store = {}
    for name, value in fields.items():
        if name not in known_names:
            continue
        if value in ('', None):
            continue
        # Don't re-encrypt already-masked placeholder
        if value == '••••••••':
            # Keep existing stored value for this field
            try:
                existing = ConnectorOverride.objects.get(connector_id=connector_id)
                if name in existing.overrides:
                    to_store[name] = existing.overrides[name]
                    continue
            except ConnectorOverride.DoesNotExist:
                continue
            continue
        if _is_sensitive(name):
            to_store[name] = connector_encrypt(value)
        else:
            to_store[name] = value

    obj, created = ConnectorOverride.objects.get_or_create(connector_id=connector_id)
    obj.overrides.update(to_store)
    obj.save()


def test_connector(connector_id: str) -> dict:
    """Call the plugin's health_check. Returns {'success': bool, 'message': str}."""
    registry = _get_registry()
    if connector_id not in registry:
        raise KeyError(f"Connector '{connector_id}' not found")

    entry = registry[connector_id]
    definition = entry['definition']

    def plain(field_name: str) -> str:
        for field in definition.get('fields', []):
            if field['name'] == field_name:
                raw = _resolve_raw(connector_id, field)
                if _is_sensitive(field_name) and raw:
                    return connector_decrypt(raw)
                return raw
        return ''

    try:
        return entry['health_check'](plain)
    except Exception as exc:
        logger.error("health_check failed for connector '%s': %s", connector_id, exc)
        return {'success': False, 'message': str(exc)}
