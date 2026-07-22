import requests

DEFINITION = {
    'id': 'citadel',
    'name': 'Citadel',
    'logo': '🏰',
    'category': 'Notifications',
    'description': 'Citadel messaging platform notifications.',
    'readonly': False,
    'version': '1.0.0',
    'author': 'Thales CERT',
    'fields': [
        {'name': 'CITADEL_URL',       'label': 'URL',       'type': 'text',     'settings_key': 'CITADEL_URL',       'required': True},
        {'name': 'CITADEL_API_TOKEN', 'label': 'API Token', 'type': 'password', 'settings_key': 'CITADEL_API_TOKEN', 'required': True},
        {'name': 'CITADEL_ROOM_ID',   'label': 'Room ID',   'type': 'text',     'settings_key': 'CITADEL_ROOM_ID',   'required': True},
    ],
}


def health_check(plain):
    url = plain('CITADEL_URL').rstrip('/')
    token = plain('CITADEL_API_TOKEN')
    if not url or not token:
        return {'success': False, 'message': 'Citadel URL or token not configured'}
    try:
        resp = requests.get(
            f'{url}/api/v2/rooms',
            headers={'Authorization': f'Bearer {token}'},
            timeout=5,
        )
        if resp.status_code in (200, 204):
            return {'success': True, 'message': f'Connected to Citadel at {url}'}
        return {'success': False, 'message': f'HTTP {resp.status_code}'}
    except Exception as exc:
        return {'success': False, 'message': str(exc)}
