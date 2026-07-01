import requests

DEFINITION = {
    'id': 'slack',
    'name': 'Slack',
    'logo': '💬',
    'category': 'Notifications',
    'description': 'Slack notifications via Bot Token.',
    'readonly': False,
    'fields': [
        {'name': 'SLACK_API_TOKEN', 'label': 'Bot Token',   'type': 'password', 'settings_key': 'SLACK_API_TOKEN', 'required': True},
        {'name': 'SLACK_CHANNEL',   'label': 'Channel ID',  'type': 'text',     'settings_key': 'SLACK_CHANNEL',   'required': True},
    ],
}


def health_check(plain):
    token = plain('SLACK_API_TOKEN')
    if not token:
        return {'success': False, 'message': 'Slack token not configured'}
    try:
        resp = requests.get(
            'https://slack.com/api/auth.test',
            headers={'Authorization': f'Bearer {token}'},
            timeout=5,
        )
        data = resp.json()
        if data.get('ok'):
            return {'success': True, 'message': f"Connected as {data.get('user', '?')} in {data.get('team', '?')}"}
        return {'success': False, 'message': data.get('error', 'Unknown Slack error')}
    except Exception as exc:
        return {'success': False, 'message': str(exc)}
