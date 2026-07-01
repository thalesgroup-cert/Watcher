import requests

DEFINITION = {
    'id': 'searxng',
    'name': 'SearxNG',
    'logo': '🔍',
    'category': 'Search',
    'description': 'SearxNG metasearch engine for data leak detection.',
    'readonly': False,
    'fields': [
        {'name': 'DATA_LEAK_SEARX_URL', 'label': 'SearxNG URL', 'type': 'text', 'settings_key': 'DATA_LEAK_SEARX_URL', 'required': True, 'default': 'http://searxng:8080/'},
    ],
}


def health_check(plain):
    url = plain('DATA_LEAK_SEARX_URL').rstrip('/')
    if not url:
        return {'success': False, 'message': 'SearxNG URL not configured'}
    try:
        resp = requests.get(f'{url}/', timeout=5)
        if resp.status_code == 200:
            return {'success': True, 'message': f'SearxNG reachable at {url}'}
        return {'success': False, 'message': f'HTTP {resp.status_code}'}
    except Exception as exc:
        return {'success': False, 'message': str(exc)}
