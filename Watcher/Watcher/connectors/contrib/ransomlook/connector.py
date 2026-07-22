import requests

DEFINITION = {
    'id': 'ransomlook',
    'name': 'RansomLook',
    'logo': '👁️',
    'category': 'Threat Intelligence',
    'description': 'RansomLook ransomware group and victim tracking API.',
    'readonly': False,
    'version': '1.0.0',
    'author': 'Thales CERT',
    'fields': [
        {'name': 'CYBER_WATCH_RANSOMLOOK_GROUPS_URL', 'label': 'Groups URL',  'type': 'text', 'settings_key': 'CYBER_WATCH_RANSOMLOOK_GROUPS_URL', 'required': True, 'default': 'https://www.ransomlook.io/api/groups'},
        {'name': 'CYBER_WATCH_RANSOMLOOK_RECENT_URL', 'label': 'Recent URL',  'type': 'text', 'settings_key': 'CYBER_WATCH_RANSOMLOOK_RECENT_URL', 'required': False, 'default': 'https://www.ransomlook.io/api/recent'},
        {'name': 'CYBER_WATCH_RANSOMLOOK_ACTORS_URL', 'label': 'Actors URL',  'type': 'text', 'settings_key': 'CYBER_WATCH_RANSOMLOOK_ACTORS_URL', 'required': False, 'default': 'https://www.ransomlook.io/api/actors'},
    ],
}


def health_check(plain):
    url = plain('CYBER_WATCH_RANSOMLOOK_GROUPS_URL')
    if not url:
        return {'success': False, 'message': 'RansomLook URL not configured'}
    try:
        resp = requests.get(url, timeout=5)
        if resp.status_code == 200:
            return {'success': True, 'message': f'RansomLook API reachable at {url}'}
        return {'success': False, 'message': f'HTTP {resp.status_code}'}
    except Exception as exc:
        return {'success': False, 'message': str(exc)}
