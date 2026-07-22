DEFINITION = {
    'id': 'ldap',
    'name': 'LDAP',
    'logo': '📂',
    'category': 'Authentication',
    'description': 'LDAP/Active Directory authentication backend, informational only. Django builds its LDAP auth backend from settings.py at startup, so values here cannot be live-overridden; edit settings.py/.env and restart to change them.',
    'readonly': True,
    'version': '1.0.0',
    'author': 'Thales CERT',
    'fields': [
        {'name': 'AUTH_LDAP_SERVER_URI',   'label': 'Server URI',    'type': 'text',     'settings_key': 'AUTH_LDAP_SERVER_URI',   'required': True},
        {'name': 'AUTH_LDAP_BIND_DN',      'label': 'Bind DN',       'type': 'text',     'settings_key': 'AUTH_LDAP_BIND_DN',      'required': False},
        {'name': 'AUTH_LDAP_BIND_PASSWORD','label': 'Bind Password', 'type': 'password', 'settings_key': 'AUTH_LDAP_BIND_PASSWORD','required': False},
        {'name': 'AUTH_LDAP_VERIFY_SSL',   'label': 'Verify SSL',    'type': 'boolean',  'settings_key': 'AUTH_LDAP_VERIFY_SSL',   'required': False, 'default': 'False'},
    ],
}


def health_check(plain):
    uri = plain('AUTH_LDAP_SERVER_URI')
    if not uri:
        return {'success': False, 'message': 'LDAP server URI not configured'}
    try:
        import ldap as ldap_lib
        conn = ldap_lib.initialize(uri)
        conn.set_option(ldap_lib.OPT_TIMEOUT, 5)
        bind_dn = plain('AUTH_LDAP_BIND_DN')
        bind_pw = plain('AUTH_LDAP_BIND_PASSWORD')
        conn.simple_bind_s(bind_dn or '', bind_pw or '')
        return {'success': True, 'message': f'Connected to LDAP at {uri}'}
    except Exception as exc:
        return {'success': False, 'message': str(exc)}
