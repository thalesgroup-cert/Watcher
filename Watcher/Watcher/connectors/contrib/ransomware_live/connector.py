import requests

DEFINITION = {
    'id': 'ransomware_live',
    'name': 'Ransomware.live',
    'logo': '💀',
    'category': 'Threat Intelligence',
    'description': 'Ransomware.live victim and group tracking API.',
    'readonly': False,
    'version': '1.0.0',
    'author': 'Thales CERT',
    'fields': [
        {'name': 'CYBER_WATCH_RANSOMWARE_GROUPS_URL',  'label': 'Groups URL',  'type': 'text', 'settings_key': 'CYBER_WATCH_RANSOMWARE_GROUPS_URL',  'required': True, 'default': 'https://api.ransomware.live/v2/groups'},
        {'name': 'CYBER_WATCH_RANSOMWARE_VICTIMS_URL', 'label': 'Victims URL', 'type': 'text', 'settings_key': 'CYBER_WATCH_RANSOMWARE_VICTIMS_URL', 'required': False, 'default': 'https://api.ransomware.live/v2/recentvictims'},
    ],
}


def health_check(plain):
    url = plain('CYBER_WATCH_RANSOMWARE_GROUPS_URL')
    if not url:
        return {'success': False, 'message': 'Ransomware.live URL not configured'}
    try:
        resp = requests.get(url, timeout=5)
        if resp.status_code == 200:
            return {'success': True, 'message': f'Ransomware.live API reachable at {url}'}
        return {'success': False, 'message': f'HTTP {resp.status_code}'}
    except Exception as exc:
        return {'success': False, 'message': str(exc)}
