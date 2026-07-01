import requests

DEFINITION = {
    'id': 'certstream',
    'name': 'CertStream',
    'logo': '🔒',
    'category': 'Certificate Monitoring',
    'description': 'Real-time certificate transparency log stream.',
    'readonly': False,
    'fields': [
        {'name': 'CERT_STREAM_URL', 'label': 'WebSocket URL', 'type': 'text', 'settings_key': 'CERT_STREAM_URL', 'required': True, 'default': 'wss://certstream.calidog.io'},
    ],
}


def health_check(plain):
    url = plain('CERT_STREAM_URL')
    if not url:
        return {'success': False, 'message': 'CertStream URL not configured'}
    # Convert wss:// to https:// for a quick HTTP reachability check
    http_url = url.replace('wss://', 'https://').replace('ws://', 'http://')
    try:
        resp = requests.get(http_url, timeout=5)
        if resp.status_code < 500:
            return {'success': True, 'message': f'CertStream endpoint reachable at {url}'}
        return {'success': False, 'message': f'HTTP {resp.status_code}'}
    except Exception as exc:
        return {'success': False, 'message': str(exc)}
