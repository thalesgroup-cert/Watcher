# Template for a new Connectors plugin.
#
# This package is intentionally excluded from auto-discovery (its folder name
# starts with "_", see connectors/core.py:_get_registry). Copy this file into
# a new folder named after your connector's id, e.g.
# connectors/contrib/my_service/connector.py, and remove the leading
# underscore from the folder name to make it a real, auto-discovered
# connector.
#
# A connector plugin is just a module that exports two things:
#   - DEFINITION: dict describing the connector and its configurable fields
#   - health_check(plain): a function that performs a real connectivity test
#
# Nothing else is required. connectors/core.py handles everything else:
# encrypted storage of sensitive fields, DB-override-over-settings.py
# resolution, the "Configured" status, and the Healthy/Unhealthy history
# from both the manual Test button and the weekly scheduled health check.

import requests

DEFINITION = {
    # Unique, stable identifier. Used everywhere internally (URLs, DB keys,
    # metadata). Never change it once a connector has shipped - that would
    # orphan any saved overrides. Lowercase, snake_case.
    'id': 'my_service',

    # Display name shown in the dashboard.
    'name': 'My Service',

    # A single emoji used as a visual fallback if no brand PNG exists at
    # frontend/static/frontend/images/connectors/<id>.png (that's the
    # preferred way to show a real logo - drop a PNG there named after the
    # id above and the dashboard will pick it up automatically).
    'logo': '🔌',

    # Groups connectors on the dashboard. Reuse an existing category where it
    # makes sense: 'Notifications', 'Incident Response', 'Threat Intelligence',
    # 'Certificate Monitoring', 'Domain Monitoring', 'Search', 'Authentication',
    # 'Database', or 'Other'.
    'category': 'Other',

    # One sentence shown under the connector's name.
    'description': 'Describe what this connector integrates with.',

    # True only for connectors whose configuration cannot be changed from
    # this page (e.g. because it's baked into settings.py at Django startup,
    # like LDAP/OIDC, or because it's purely informational, like MySQL).
    # Readonly connectors reject save_connector_overrides / reset_connector_field
    # with a PermissionError (surfaced as HTTP 403), and the Save button is
    # hidden in the UI. Leave this False for a normal, editable connector.
    'readonly': False,

    # Plugin version - a static, manually-maintained string for this
    # connector definition itself (bump it when you change the plugin code).
    # It has nothing to do with the version of the external service.
    'version': '1.0.0',

    # Who maintains this connector.
    'author': 'Thales CERT',

    # One dict per configurable value. Each field maps 1:1 to a Django
    # settings.py constant via 'settings_key', so existing .env-based
    # deployments keep working unchanged the first time this connector is
    # loaded (see connectors/core.py:_get_settings_value /
    # _ensure_connectors_seeded for exactly how that fallback/seeding works).
    'fields': [
        {
            'name': 'MY_SERVICE_URL',      # Also the key used in the DB overrides dict.
            'label': 'Service URL',        # Shown as the form label.
            'type': 'text',                # 'text' | 'password' | 'boolean' | 'number'.
            'settings_key': 'MY_SERVICE_URL',  # Matching attribute in watcher/settings.py.
            'required': True,              # Required fields drive the Configured/Incomplete/
                                            # Disabled status (see _compute_status).
            'default': 'https://api.example.com',  # Used only if settings_key is empty/unset.
        },
        {
            'name': 'MY_SERVICE_API_KEY',
            'label': 'API Key',
            'type': 'password',
            'settings_key': 'MY_SERVICE_API_KEY',
            'required': True,
            # No 'default' for secrets. Any field name containing "password",
            # "secret", "token", "key", "api_key", "_pw" or "_pass" is
            # automatically treated as sensitive: encrypted at rest, masked
            # in the UI, and only decrypted for a superuser who clicks reveal
            # or passes ?reveal=true (see connectors/core.py:_is_sensitive).
        },
        {
            'name': 'MY_SERVICE_VERIFY_SSL',
            'label': 'Verify SSL',
            'type': 'boolean',
            'settings_key': 'MY_SERVICE_VERIFY_SSL',
            'required': False,
            'default': 'True',  # Booleans are stored/compared as the strings 'True'/'False'.
        },
    ],
}


def health_check(plain):
    """
    Run a real connectivity check using the connector's *current* values
    (DB override if the user has saved one, else the settings.py/.env
    fallback - plain() resolves that for you and decrypts sensitive fields
    automatically).

    Called from three places, all equivalent from this function's point of
    view: the dashboard's manual Test button, and the weekly scheduled job
    (which additionally persists the outcome and, only for connectors
    marked Configured, raises a Pending Action alert on failure).

    Must return {'success': bool, 'message': str}. Never raise - any
    exception is caught by the caller and reported as a generic failure, but
    a specific, human-readable message here is much more useful for
    diagnosing a real incident.
    """
    url = plain('MY_SERVICE_URL')
    api_key = plain('MY_SERVICE_API_KEY')
    verify_ssl = plain('MY_SERVICE_VERIFY_SSL').lower() not in ('false', '0', 'no')

    if not url or not api_key:
        return {'success': False, 'message': 'Service URL or API key not configured'}

    try:
        resp = requests.get(
            url,
            headers={'Authorization': f'Bearer {api_key}'},
            verify=verify_ssl,
            timeout=5,
        )
        if resp.status_code == 200:
            return {'success': True, 'message': f'Connected to {url}'}
        return {'success': False, 'message': f'HTTP {resp.status_code}'}
    except Exception as exc:
        return {'success': False, 'message': str(exc)}
