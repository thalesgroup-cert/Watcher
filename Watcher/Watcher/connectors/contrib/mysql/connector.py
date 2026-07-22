DEFINITION = {
    'id': 'mysql',
    'name': 'MySQL Database',
    'logo': '🗄️',
    'category': 'Database',
    'description': 'Primary MySQL database, informational only. Settings are managed in settings.py.',
    'readonly': True,   # Fields are display-only; overrides have no effect on the Django DB connection.
    'version': '1.0.0',
    'author': 'Thales CERT',
    'fields': [
        {'name': 'DB_HOST', 'label': 'Host', 'type': 'text', 'settings_key': 'DATABASES_HOST', 'required': False},
        {'name': 'DB_PORT', 'label': 'Port', 'type': 'text', 'settings_key': 'DATABASES_PORT', 'required': False},
        {'name': 'DB_NAME', 'label': 'Database', 'type': 'text', 'settings_key': 'DATABASES_NAME', 'required': False},
        {'name': 'DB_USER', 'label': 'User',     'type': 'text', 'settings_key': 'DATABASES_USER', 'required': False},
    ],
}


def health_check(plain):
    try:
        import django.db
        django.db.connection.ensure_connection()
        return {'success': True, 'message': 'MySQL connection is healthy'}
    except Exception as exc:
        return {'success': False, 'message': str(exc)}
