import requests

DEFINITION = {
    'id': 'misp',
    'name': 'MISP',
    'logo': '🧩',
    'category': 'Threat Intelligence',
    'description': 'MISP Threat Intelligence Sharing Platform.',
    'readonly': False,
    'fields': [
        {'name': 'MISP_URL',          'label': 'MISP URL',         'type': 'text',     'settings_key': 'MISP_URL',          'required': True, 'default': 'https://127.0.0.1'},
        {'name': 'MISP_KEY',          'label': 'API Key',          'type': 'password', 'settings_key': 'MISP_KEY',          'required': True},
        {'name': 'MISP_VERIFY_SSL',   'label': 'Verify SSL',       'type': 'boolean',  'settings_key': 'MISP_VERIFY_SSL',   'required': False, 'default': 'False'},
        {'name': 'MISP_TICKETING_URL','label': 'Ticketing URL',    'type': 'text',     'settings_key': 'MISP_TICKETING_URL','required': False},
        {'name': 'MISP_TAGS',         'label': 'Tags (comma-sep)', 'type': 'text',     'settings_key': 'MISP_TAGS',         'required': False},
    ],
}


def health_check(plain):
    url = plain('MISP_URL').rstrip('/')
    key = plain('MISP_KEY')
    verify = plain('MISP_VERIFY_SSL').lower() not in ('false', '0', 'no')
    if not url or not key:
        return {'success': False, 'message': 'MISP URL or key not configured'}
    try:
        resp = requests.get(
            f'{url}/servers/getPyMISPVersion',
            headers={'Authorization': key, 'Accept': 'application/json'},
            verify=verify,
            timeout=5,
        )
        if resp.status_code == 200:
            return {'success': True, 'message': f'Connected to MISP at {url}'}
        return {'success': False, 'message': f'HTTP {resp.status_code}'}
    except Exception as exc:
        return {'success': False, 'message': str(exc)}
