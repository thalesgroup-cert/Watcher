import requests

DEFINITION = {
    'id': 'cisa_kev',
    'name': 'CISA KEV',
    'logo': '🔥',
    'category': 'Threat Intelligence',
    'description': "CISA's catalogue of the vulnerabilities known to be exploited in the wild (Known Exploited Vulnerabilities), read once a day. Leave the URL empty to switch it off.",
    'readonly': False,
    'version': '1.0.0',
    'author': 'Thales CERT',
    'fields': [
        {'name': 'CYBER_WATCH_KEV_URL', 'label': 'Catalogue URL', 'type': 'text', 'settings_key': 'CYBER_WATCH_KEV_URL', 'required': False, 'default': 'https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json'},
    ],
}


def health_check(plain):
    url = plain('CYBER_WATCH_KEV_URL')
    if not url:
        return {'success': False, 'message': 'CISA KEV catalogue URL not configured (exploited CVEs are not flagged)'}
    try:
        # The catalogue is a file of a few megabytes: only its start is asked for
        with requests.get(url, timeout=5, stream=True) as resp:
            if resp.status_code != 200:
                return {'success': False, 'message': f'HTTP {resp.status_code}'}
            return {'success': True, 'message': f'CISA KEV catalogue reachable at {url}'}
    except Exception as exc:
        return {'success': False, 'message': str(exc)}
