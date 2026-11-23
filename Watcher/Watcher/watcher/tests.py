import os
from unittest.mock import patch
from django.test import SimpleTestCase, TestCase, override_settings
from django.conf import settings


class SettingsConfigurationTest(TestCase):
    """Test Django settings configuration and environment variable handling."""

    def test_secret_key_default_value(self):
        """Test SECRET_KEY has a default value."""
        self.assertIsNotNone(settings.SECRET_KEY)
        self.assertTrue(len(settings.SECRET_KEY) > 0)

    def test_debug_mode_configuration(self):
        """Test DEBUG mode configuration from environment."""
        with patch.dict(os.environ, {'DJANGO_DEBUG': 'False'}):
            debug_value = os.environ.get('DJANGO_DEBUG', '') != 'False'
            self.assertFalse(debug_value)
        
        with patch.dict(os.environ, {'DJANGO_DEBUG': 'True'}):
            debug_value = os.environ.get('DJANGO_DEBUG', '') != 'False'
            self.assertTrue(debug_value)

    def test_installed_apps_configuration(self):
        """Test installed apps are properly configured."""
        self.assertIn('django.contrib.admin', settings.INSTALLED_APPS)
        self.assertIn('django.contrib.auth', settings.INSTALLED_APPS)
        self.assertIn('threats_watcher', settings.INSTALLED_APPS)
        self.assertIn('rest_framework', settings.INSTALLED_APPS)
        self.assertIn('knox', settings.INSTALLED_APPS)

    def test_middleware_configuration(self):
        """Test middleware is properly configured."""
        self.assertIn('django.middleware.security.SecurityMiddleware', settings.MIDDLEWARE)
        self.assertIn('django.contrib.auth.middleware.AuthenticationMiddleware', settings.MIDDLEWARE)
        self.assertIn('django.middleware.csrf.CsrfViewMiddleware', settings.MIDDLEWARE)

    def test_rest_framework_configuration(self):
        """Test REST framework configuration."""
        self.assertIn('DEFAULT_AUTHENTICATION_CLASSES', settings.REST_FRAMEWORK)
        auth_classes = settings.REST_FRAMEWORK['DEFAULT_AUTHENTICATION_CLASSES']
        self.assertIn('knox.auth.TokenAuthentication', auth_classes)

    def test_ldap_configuration(self):
        """Test LDAP configuration."""
        self.assertIn('django_auth_ldap.backend.LDAPBackend', settings.AUTHENTICATION_BACKENDS)
        self.assertIn('django.contrib.auth.backends.ModelBackend', settings.AUTHENTICATION_BACKENDS)

    def test_time_zone_configuration(self):
        """Test time zone configuration."""
        self.assertEqual(settings.TIME_ZONE, 'Europe/Paris')

    def test_static_files_configuration(self):
        """Test static files configuration."""
        self.assertEqual(settings.STATIC_URL, '/static/')
        self.assertTrue(settings.STATIC_ROOT.endswith('static'))

    def test_posts_depth_and_words_occurrence(self):
        """Test feed parser configuration values."""
        self.assertEqual(settings.POSTS_DEPTH, 30)
        self.assertIn(settings.WORDS_OCCURRENCE, [5])
        self.assertIsInstance(settings.POSTS_DEPTH, int)
        self.assertIsInstance(settings.WORDS_OCCURRENCE, int)

    def test_default_auto_field_configuration(self):
        """Test default auto field configuration."""
        self.assertEqual(settings.DEFAULT_AUTO_FIELD, 'django.db.models.BigAutoField')

    def test_wsgi_application_configuration(self):
        """Test WSGI application configuration."""
        self.assertEqual(settings.WSGI_APPLICATION, 'watcher.wsgi.application')

    def test_root_urlconf_configuration(self):
        """Test root URL configuration."""
        self.assertEqual(settings.ROOT_URLCONF, 'watcher.urls')

    def test_language_and_internationalization(self):
        """Test language and internationalization settings."""
        self.assertEqual(settings.LANGUAGE_CODE, 'en-us')
        self.assertTrue(settings.USE_I18N)
        self.assertTrue(settings.USE_L10N)
        self.assertFalse(settings.USE_TZ)


class EnvironmentVariableConfigTest(TestCase):
    """Test environment variable configuration without reloading Django settings."""
    
    def test_email_ssl_tls_boolean_conversion_logic(self):
        """Test email SSL/TLS boolean conversion logic."""
        test_cases = [
            ('True', True),
            ('False', False),
            ('true', 'true'),
            ('false', 'false'),
            ('', ''),
            (None, False),
        ]
        
        for input_val, expected in test_cases:
            with self.subTest(input_val=input_val):
                if input_val is not None:
                    with patch.dict(os.environ, {'EMAIL_USE_TLS': input_val}, clear=True):
                        email_use_tls = os.environ.get('EMAIL_USE_TLS', False)
                        if email_use_tls == "True":
                            email_use_tls = True
                        elif email_use_tls == "False":
                            email_use_tls = False
                        self.assertEqual(email_use_tls, expected, f"Failed for input: {input_val}")
                else:
                    with patch.dict(os.environ, {}, clear=True):
                        email_use_tls = os.environ.get('EMAIL_USE_TLS', False)
                        if email_use_tls == "True":
                            email_use_tls = True
                        elif email_use_tls == "False":
                            email_use_tls = False
                        self.assertEqual(email_use_tls, expected, f"Failed for input: {input_val}")

    def test_ssl_verification_boolean_conversion_logic(self):
        """Test SSL verification boolean conversion logic."""
        test_cases = [
            ('True', True),
            ('False', False),
            ('anything_else', 'anything_else'),
        ]
        
        for input_val, expected in test_cases:
            misp_verify_ssl = os.environ.get('MISP_VERIFY_SSL', False) if input_val else False
            if input_val:
                misp_verify_ssl = input_val
                if misp_verify_ssl == "True":
                    misp_verify_ssl = True
                elif misp_verify_ssl == "False":
                    misp_verify_ssl = False
            
            if input_val in ['True', 'False']:
                self.assertEqual(misp_verify_ssl, expected, f"Failed for input: {input_val}")

    def test_tags_splitting_logic(self):
        """Test tags splitting logic."""
        test_input = "Custom,Tag1,Tag2,Tag3"
        result = test_input.split(",")
        expected = ["Custom", "Tag1", "Tag2", "Tag3"]
        self.assertEqual(result, expected)
        
        default_hive_tags = "Watcher,Impersonation,Malicious Domain,Typosquatting".split(",")
        expected_hive = ["Watcher", "Impersonation", "Malicious Domain", "Typosquatting"]
        self.assertEqual(default_hive_tags, expected_hive)

    def test_email_port_integer_conversion(self):
        """Test email port integer conversion logic."""
        test_cases = [
            ('587', 587),
            ('25', 25),
            ('465', 465),
        ]
        
        for input_val, expected in test_cases:
            with patch.dict(os.environ, {'EMAIL_PORT': input_val}):
                result = int(os.environ.get('EMAIL_PORT', 25))
            self.assertEqual(result, expected)
            self.assertIsInstance(result, int)

    def test_allowed_hosts_splitting_logic(self):
        """Test ALLOWED_HOSTS splitting logic."""
        base_hosts = ['0.0.0.0', '127.0.0.1', 'localhost']
        additional_hosts = 'example.com,test.com'
        final_hosts = base_hosts + additional_hosts.split(',')
        
        self.assertIn('example.com', final_hosts)
        self.assertIn('test.com', final_hosts)
        self.assertIn('localhost', final_hosts)

    def test_csrf_trusted_origins_logic(self):
        """Test CSRF_TRUSTED_ORIGINS logic."""
        domain = 'example.com'
        csrf_origins = [
            'https://' + domain,
            'http://' + domain
        ]
        
        self.assertIn('https://example.com', csrf_origins)
        self.assertIn('http://example.com', csrf_origins)


class SettingsValidationTest(TestCase):
    """Test settings validation and required configurations."""
    
    def test_required_installed_apps_present(self):
        """Test that all required Django apps are installed."""
        required_apps = [
            'django.contrib.contenttypes',
            'django.contrib.admin', 
            'django.contrib.auth',
            'django.contrib.sessions',
            'django.contrib.messages',
            'django.contrib.staticfiles',
            'threats_watcher',
            'rest_framework',
            'knox',
        ]
        
        for app in required_apps:
            with self.subTest(app=app):
                self.assertIn(app, settings.INSTALLED_APPS)

    def test_required_middleware_present(self):
        """Test that all required middleware is configured."""
        required_middleware = [
            'django.middleware.security.SecurityMiddleware',
            'django.contrib.sessions.middleware.SessionMiddleware',
            'django.middleware.common.CommonMiddleware',
            'django.middleware.csrf.CsrfViewMiddleware',
            'django.contrib.auth.middleware.AuthenticationMiddleware',
            'django.contrib.messages.middleware.MessageMiddleware',
        ]
        
        for middleware in required_middleware:
            with self.subTest(middleware=middleware):
                self.assertIn(middleware, settings.MIDDLEWARE)

    def test_database_engine_is_mysql(self):
        """Test that MySQL is configured as database engine."""
        self.assertEqual(
            settings.DATABASES['default']['ENGINE'],
            'django.db.backends.mysql'
        )

    def test_rest_framework_authentication(self):
        """Test REST framework authentication configuration."""
        self.assertIn('DEFAULT_AUTHENTICATION_CLASSES', settings.REST_FRAMEWORK)
        auth_classes = settings.REST_FRAMEWORK['DEFAULT_AUTHENTICATION_CLASSES']
        self.assertIn('knox.auth.TokenAuthentication', auth_classes)

    def test_password_validators_configured(self):
        """Test that password validators are properly configured."""
        self.assertTrue(len(settings.AUTH_PASSWORD_VALIDATORS) > 0)
        
        validator_names = [
            validator['NAME'] for validator in settings.AUTH_PASSWORD_VALIDATORS
        ]
        
        expected_validators = [
            'django.contrib.auth.password_validation.UserAttributeSimilarityValidator',
            'django.contrib.auth.password_validation.MinimumLengthValidator',
            'django.contrib.auth.password_validation.CommonPasswordValidator',
            'django.contrib.auth.password_validation.NumericPasswordValidator',
        ]
        
        for validator in expected_validators:
            with self.subTest(validator=validator):
                self.assertIn(validator, validator_names)

    def test_template_configuration(self):
        """Test template configuration."""
        self.assertEqual(len(settings.TEMPLATES), 1)
        template_config = settings.TEMPLATES[0]
        self.assertEqual(template_config['BACKEND'], 'django.template.backends.django.DjangoTemplates')
        self.assertTrue(template_config['APP_DIRS'])

    def test_knox_configuration(self):
        """Test Knox token authentication configuration."""
        self.assertTrue(hasattr(settings, 'REST_KNOX'))
        self.assertIn('SECURE_HASH_ALGORITHM', settings.REST_KNOX)
        self.assertIn('TOKEN_TTL', settings.REST_KNOX)


class FrontendBundleVersionTest(TestCase):
    """The bundle is served with a version in its address, so that a browser never mixes an old script with a new page."""

    def _bundle(self, directory, mtime):
        os.makedirs(os.path.join(directory, 'frontend'))
        for name in ('main.js', 'main.css'):
            path = os.path.join(directory, 'frontend', name)
            open(path, 'w').close()
            os.utime(path, (mtime, mtime))

    def test_the_page_asks_for_the_bundle_with_its_version(self):
        html = self.client.get('/').content.decode()
        self.assertRegex(html, r'frontend/main\.js\?v=\d+')
        self.assertRegex(html, r'frontend/main\.css\?v=\d+')

    def test_the_version_follows_the_files_of_the_bundle(self):
        import tempfile
        from frontend import views
        with tempfile.TemporaryDirectory() as first, tempfile.TemporaryDirectory() as second:
            self._bundle(first, 1_700_000_000)
            with patch.object(views, 'STATIC_DIRS', (first,)):
                before = views.asset_version()
                os.utime(os.path.join(first, 'frontend', 'main.js'), (1_700_000_500, 1_700_000_500))
                after = views.asset_version()
            self.assertEqual(before, '1700000000')
            self.assertEqual(after, '1700000500')
            # The directory the files are served from wins; the source one is the fallback
            self._bundle(second, 1_600_000_000)
            with patch.object(views, 'STATIC_DIRS', (first, second)):
                self.assertEqual(views.asset_version(), '1700000500')
            with patch.object(views, 'STATIC_DIRS', (os.path.join(first, 'missing'), second)):
                self.assertEqual(views.asset_version(), '1600000000')

    def test_without_a_bundle_the_version_is_zero(self):
        from frontend import views
        with patch.object(views, 'STATIC_DIRS', ('/nonexistent',)):
            self.assertEqual(views.asset_version(), '0')


class UnknownAddressTest(SimpleTestCase):
    """An address the server does not know: the interface says so for a browser, the plain 404 for anything else."""

    HTML = {'HTTP_ACCEPT': 'text/html,application/xhtml+xml'}

    @override_settings(DEBUG=False)
    def test_a_browser_is_sent_to_the_not_found_page_of_the_interface(self):
        response = self.client.get('/dededee', **self.HTML)
        self.assertRedirects(response, '/#/dededee', fetch_redirect_response=False)

    @override_settings(DEBUG=False)
    def test_the_address_asked_is_kept(self):
        response = self.client.get('/some/deep/page', **self.HTML)
        self.assertEqual(response['Location'], '/#/some/deep/page')

    @override_settings(DEBUG=False)
    def test_the_api_and_the_files_keep_the_plain_404(self):
        for path in ('/api/nothing/', '/static/frontend/nothing.js', '/media/nothing.png'):
            self.assertEqual(self.client.get(path, **self.HTML).status_code, 404, path)

    @override_settings(DEBUG=False)
    def test_a_script_that_does_not_ask_for_html_gets_the_plain_404(self):
        self.assertEqual(self.client.get('/dededee', HTTP_ACCEPT='application/json').status_code, 404)
        self.assertEqual(self.client.post('/dededee', **self.HTML).status_code, 404)
