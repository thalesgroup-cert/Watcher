import requests

DEFINITION = {
    'id': 'thehive',
    'name': 'TheHive',
    'logo': '🐝',
    'category': 'Incident Response',
    'description': 'TheHive security incident management platform.',
    'readonly': False,
    'version': '1.0.0',
    'author': 'Thales CERT',
    'fields': [
        {'name': 'THE_HIVE_URL',          'label': 'URL',              'type': 'text',     'settings_key': 'THE_HIVE_URL',          'required': True},
        {'name': 'THE_HIVE_KEY',          'label': 'API Key',          'type': 'password', 'settings_key': 'THE_HIVE_KEY',          'required': True},
        {'name': 'THE_HIVE_VERIFY_SSL',   'label': 'Verify SSL',       'type': 'boolean',  'settings_key': 'THE_HIVE_VERIFY_SSL',   'required': False, 'default': 'False'},
        {'name': 'THE_HIVE_CUSTOM_FIELD', 'label': 'Custom Field',     'type': 'text',     'settings_key': 'THE_HIVE_CUSTOM_FIELD', 'required': False, 'default': 'watcher-id'},
        {'name': 'THE_HIVE_EMAIL_SENDER', 'label': 'Email Sender',     'type': 'text',     'settings_key': 'THE_HIVE_EMAIL_SENDER', 'required': False},
        {'name': 'THE_HIVE_TAGS',         'label': 'Tags (comma-sep)', 'type': 'text',     'settings_key': 'THE_HIVE_TAGS',         'required': False},
    ],
}


def health_check(plain):
    url = plain('THE_HIVE_URL').rstrip('/')
    key = plain('THE_HIVE_KEY')
    verify = plain('THE_HIVE_VERIFY_SSL').lower() not in ('false', '0', 'no')
    if not url or not key:
        return {'success': False, 'message': 'TheHive URL or API key not configured'}
    try:
        resp = requests.get(
            f'{url}/api/status',
            headers={'Authorization': f'Bearer {key}'},
            verify=verify,
            timeout=5,
        )
        if resp.status_code == 200:
            return {'success': True, 'message': f'Connected to TheHive at {url}'}
        return {'success': False, 'message': f'HTTP {resp.status_code}'}
    except Exception as exc:
        return {'success': False, 'message': str(exc)}
