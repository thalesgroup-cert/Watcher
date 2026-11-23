import requests

DEFINITION = {
    'id': 'first_epss',
    'name': 'FIRST EPSS',
    'logo': '📈',
    'category': 'Threat Intelligence',
    'description': 'EPSS scores of FIRST.org: the probability that a CVE is exploited in the next 30 days, read once a day. Leave the URL empty to switch it off.',
    'readonly': False,
    'version': '1.0.0',
    'author': 'Thales CERT',
    'fields': [
        {'name': 'CYBER_WATCH_EPSS_API_URL', 'label': 'EPSS API URL', 'type': 'text', 'settings_key': 'CYBER_WATCH_EPSS_API_URL', 'required': False, 'default': 'https://api.first.org/data/v1/epss'},
    ],
}


def health_check(plain):
    url = plain('CYBER_WATCH_EPSS_API_URL')
    if not url:
        return {'success': False, 'message': 'EPSS API URL not configured (CVEs get no EPSS score)'}
    try:
        # A well-known CVE: the answer holds its score when the service works
        resp = requests.get(url, params={'cve': 'CVE-2021-44228'}, timeout=5)
        if resp.status_code != 200:
            return {'success': False, 'message': f'HTTP {resp.status_code}'}
        if not (resp.json().get('data') or []):
            return {'success': False, 'message': 'The service answered without a score'}
        return {'success': True, 'message': f'EPSS API reachable at {url}'}
    except Exception as exc:
        return {'success': False, 'message': str(exc)}
