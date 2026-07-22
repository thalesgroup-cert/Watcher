import smtplib

DEFINITION = {
    'id': 'smtp',
    'name': 'SMTP Email',
    'logo': '📧',
    'category': 'Notifications',
    'description': 'Email notifications via SMTP.',
    'readonly': False,
    'version': '1.0.0',
    'author': 'Thales CERT',
    'fields': [
        {'name': 'EMAIL_HOST',     'label': 'SMTP Server',  'type': 'text',     'settings_key': 'EMAIL_HOST',     'required': True},
        {'name': 'EMAIL_PORT',     'label': 'Port',         'type': 'number',   'settings_key': 'EMAIL_PORT',     'required': True, 'default': '25'},
        {'name': 'EMAIL_USE_TLS',  'label': 'Use TLS',      'type': 'boolean',  'settings_key': 'EMAIL_USE_TLS',  'required': False, 'default': 'False'},
        {'name': 'EMAIL_USE_SSL',  'label': 'Use SSL',      'type': 'boolean',  'settings_key': 'EMAIL_USE_SSL',  'required': False, 'default': 'False'},
        {'name': 'EMAIL_HOST_USER',     'label': 'Username',  'type': 'text',     'settings_key': 'EMAIL_HOST_USER',     'required': False},
        {'name': 'EMAIL_HOST_PASSWORD', 'label': 'Password',  'type': 'password', 'settings_key': 'EMAIL_HOST_PASSWORD', 'required': False},
        {'name': 'EMAIL_FROM',     'label': 'From Address', 'type': 'text',     'settings_key': 'EMAIL_FROM',     'required': False},
    ],
}


def health_check(plain):
    host = plain('EMAIL_HOST')
    port = int(plain('EMAIL_PORT') or 25)
    use_ssl = plain('EMAIL_USE_SSL').lower() in ('true', '1', 'yes')
    if not host:
        return {'success': False, 'message': 'SMTP host not configured'}
    try:
        cls = smtplib.SMTP_SSL if use_ssl else smtplib.SMTP
        with cls(host, port, timeout=5) as srv:
            srv.noop()
        return {'success': True, 'message': f'Connected to {host}:{port}'}
    except Exception as exc:
        return {'success': False, 'message': str(exc)}
