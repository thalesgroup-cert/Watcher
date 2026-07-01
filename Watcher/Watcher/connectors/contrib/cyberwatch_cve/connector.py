import requests

DEFINITION = {
    'id': 'cyberwatch_cve',
    'name': 'CyberWatch CVE API',
    'logo': '🛡️',
    'category': 'Threat Intelligence',
    'description': 'CVE data feed from CIRCL CVE API.',
    'readonly': False,
    'fields': [
        {'name': 'CYBER_WATCH_CVE_API_URL', 'label': 'CVE API URL', 'type': 'text', 'settings_key': 'CYBER_WATCH_CVE_API_URL', 'required': True, 'default': 'https://cve.circl.lu/api/last'},
    ],
}


def health_check(plain):
    url = plain('CYBER_WATCH_CVE_API_URL')
    if not url:
        return {'success': False, 'message': 'CVE API URL not configured'}
    try:
        resp = requests.get(url, timeout=5)
        if resp.status_code == 200:
            return {'success': True, 'message': f'CVE API reachable at {url}'}
        return {'success': False, 'message': f'HTTP {resp.status_code}'}
    except Exception as exc:
        return {'success': False, 'message': str(exc)}
