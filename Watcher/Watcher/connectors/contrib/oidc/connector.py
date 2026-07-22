DEFINITION = {
    'id': 'oidc',
    'name': 'OIDC / SSO',
    'logo': '🔑',
    'category': 'Authentication',
    'description': 'OpenID Connect Single Sign-On integration, informational only. mozilla-django-oidc and the LOGIN_MODE-based URL routing are configured from settings.py at startup, so values here cannot be live-overridden; edit settings.py/.env and restart to change them.',
    'readonly': True,
    'version': '1.0.0',
    'author': 'Thales CERT',
    'fields': [
        {'name': 'OIDC_RP_CLIENT_ID',             'label': 'Client ID',             'type': 'text',     'settings_key': 'OIDC_RP_CLIENT_ID',             'required': True},
        {'name': 'OIDC_RP_CLIENT_SECRET',         'label': 'Client Secret',         'type': 'password', 'settings_key': 'OIDC_RP_CLIENT_SECRET',         'required': True},
        {'name': 'OIDC_OP_AUTHORIZATION_ENDPOINT','label': 'Authorization Endpoint','type': 'text',     'settings_key': 'OIDC_OP_AUTHORIZATION_ENDPOINT', 'required': False},
        {'name': 'OIDC_OP_TOKEN_ENDPOINT',        'label': 'Token Endpoint',        'type': 'text',     'settings_key': 'OIDC_OP_TOKEN_ENDPOINT',         'required': False},
        {'name': 'OIDC_OP_USER_ENDPOINT',         'label': 'User Endpoint',         'type': 'text',     'settings_key': 'OIDC_OP_USER_ENDPOINT',          'required': False},
        {'name': 'OIDC_OP_JWKS_ENDPOINT',         'label': 'JWKS Endpoint',         'type': 'text',     'settings_key': 'OIDC_OP_JWKS_ENDPOINT',          'required': False},
        {'name': 'OIDC_OP_ISSUER',                'label': 'Issuer',                'type': 'text',     'settings_key': 'OIDC_OP_ISSUER',                 'required': False},
        {'name': 'OIDC_COMPANY_NAME',             'label': 'Company Name',          'type': 'text',     'settings_key': 'OIDC_COMPANY_NAME',              'required': False},
    ],
}


def health_check(plain):
    import requests
    jwks = plain('OIDC_OP_JWKS_ENDPOINT')
    issuer = plain('OIDC_OP_ISSUER')
    if not jwks and not issuer:
        return {'success': False, 'message': 'OIDC endpoints not configured'}
    try:
        url = jwks or issuer
        resp = requests.get(url, timeout=5)
        if resp.status_code == 200:
            return {'success': True, 'message': f'OIDC endpoint reachable at {url}'}
        return {'success': False, 'message': f'HTTP {resp.status_code}'}
    except Exception as exc:
        return {'success': False, 'message': str(exc)}
