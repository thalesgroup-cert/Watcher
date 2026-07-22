import requests

WIPO_URL = 'https://www.wipo.int/amc/en/domains/search/domain.jsp'

DEFINITION = {
    'id': 'wipo_udrp',
    'name': 'WIPO UDRP',
    'logo': '⚖️',
    'category': 'Domain Monitoring',
    'description': 'WIPO UDRP case database for domain dispute tracking. URL is fixed.',
    'readonly': False,
    'version': '1.0.0',
    'author': 'Thales CERT',
    'fields': [
        {'name': 'WIPO_SEARCH_URL', 'label': 'WIPO URL', 'type': 'text', 'settings_key': '', 'default': WIPO_URL, 'required': False},
    ],
}


def health_check(plain):
    url = plain('WIPO_SEARCH_URL') or WIPO_URL
    try:
        resp = requests.get(url, timeout=10)
        if resp.status_code == 200:
            return {'success': True, 'message': f'WIPO UDRP portal reachable at {url}'}
        return {'success': False, 'message': f'HTTP {resp.status_code}'}
    except Exception as exc:
        return {'success': False, 'message': str(exc)}
