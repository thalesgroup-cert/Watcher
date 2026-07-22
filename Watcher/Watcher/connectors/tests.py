from unittest.mock import patch, MagicMock

from django.test import TestCase
from django.contrib.auth.models import User
from rest_framework.test import APITestCase
from rest_framework import status
from knox.models import AuthToken

from connectors.models import ConnectorOverride, ConnectorHealthCheck
from connectors.core import (
    get_all_connectors,
    get_connector_by_id,
    connector_exists,
    save_connector_overrides,
    reset_connector_field,
    get_connector_count,
    test_connector,
    connector_encrypt,
    connector_decrypt,
    _compute_status,
    get_connector_health,
    record_health_check,
    run_weekly_health_checks,
)
from common.models import PendingAction


class ConnectorOverrideModelTest(TestCase):
    """ConnectorOverride model creation and field storage."""

    def test_create_and_retrieve(self):
        obj = ConnectorOverride.objects.create(
            connector_id='test_connector',
            overrides={'HOST': 'localhost', 'PORT': '5432'},
        )
        fetched = ConnectorOverride.objects.get(connector_id='test_connector')
        self.assertEqual(fetched.overrides['HOST'], 'localhost')
        self.assertEqual(str(fetched), 'test_connector')

    def test_default_overrides_is_empty_dict(self):
        obj = ConnectorOverride.objects.create(connector_id='empty_connector')
        self.assertEqual(obj.overrides, {})


class ConnectorEncryptionTest(TestCase):
    """
    connector_encrypt / connector_decrypt round-trip using Fernet (real symmetric
    encryption), and behavior on an invalid/corrupt token.
    """

    def test_roundtrip(self):
        plain = 'super-secret-value'
        encrypted = connector_encrypt(plain)
        self.assertNotEqual(encrypted, plain)
        self.assertEqual(connector_decrypt(encrypted), plain)

    def test_decrypt_invalid_token_returns_raw_and_logs_warning(self):
        with self.assertLogs('watcher.connectors', level='WARNING') as cm:
            result = connector_decrypt('not-a-valid-fernet-token')
        self.assertEqual(result, 'not-a-valid-fernet-token')
        self.assertTrue(any('decryption failed' in msg for msg in cm.output))

    def test_ciphertext_does_not_trivially_reveal_plaintext(self):
        """
        Regression guard for the previous django.core.signing-based scheme: that
        format was base64+HMAC, not encryption, so the plaintext was recoverable
        from the stored value alone without the signing key. Fernet tokens must
        not leak the plaintext through a bare base64 decode.
        """
        import base64
        plain = 'super-secret-value'
        encrypted = connector_encrypt(plain)
        try:
            decoded = base64.urlsafe_b64decode(encrypted + '=' * (-len(encrypted) % 4))
        except Exception:
            decoded = b''
        self.assertNotIn(plain.encode(), decoded)


class ReencryptionMigrationTest(TestCase):
    """
    Migration 0004 re-encrypts sensitive fields that were stored with the old
    django.core.signing scheme (base64+HMAC, not real encryption) into Fernet
    tokens, in place, without touching non-sensitive or already-migrated values.
    """

    def test_legacy_signed_value_is_reencrypted_with_fernet(self):
        from django.core import signing
        import importlib
        migration_module = importlib.import_module(
            'connectors.migrations.0004_reencrypt_sensitive_fields_with_fernet'
        )

        legacy_value = signing.dumps('mail.example.com-password', salt='connectors')
        obj = ConnectorOverride.objects.create(
            connector_id='smtp',
            overrides={'EMAIL_HOST_PASSWORD': legacy_value, 'EMAIL_HOST': 'mail.example.com'},
        )

        class _FakeApps:
            @staticmethod
            def get_model(app_label, model_name):
                return ConnectorOverride

        migration_module.reencrypt_with_fernet(_FakeApps(), None)

        obj.refresh_from_db()
        self.assertEqual(obj.overrides['EMAIL_HOST'], 'mail.example.com')
        self.assertNotEqual(obj.overrides['EMAIL_HOST_PASSWORD'], legacy_value)
        self.assertEqual(connector_decrypt(obj.overrides['EMAIL_HOST_PASSWORD']), 'mail.example.com-password')

    def test_already_migrated_value_is_left_untouched(self):
        import importlib
        migration_module = importlib.import_module(
            'connectors.migrations.0004_reencrypt_sensitive_fields_with_fernet'
        )

        fernet_value = connector_encrypt('already-fernet')
        obj = ConnectorOverride.objects.create(
            connector_id='smtp', overrides={'EMAIL_HOST_PASSWORD': fernet_value},
        )

        class _FakeApps:
            @staticmethod
            def get_model(app_label, model_name):
                return ConnectorOverride

        migration_module.reencrypt_with_fernet(_FakeApps(), None)

        obj.refresh_from_db()
        self.assertEqual(obj.overrides['EMAIL_HOST_PASSWORD'], fernet_value)


class CoreAPITest(TestCase):
    """Tests for core.py public functions - uses the real plugin registry."""

    def setUp(self):
        # Reset registry and seeded flag before each test
        import connectors.core as core_mod
        core_mod._REGISTRY = {}
        core_mod._connectors_seeded = False

    def test_get_connector_count_returns_integer(self):
        count = get_connector_count()
        self.assertIsInstance(count, int)
        self.assertGreater(count, 0)

    def test_get_all_connectors_length_matches_count(self):
        connectors = get_all_connectors()
        self.assertEqual(len(connectors), get_connector_count())

    def test_get_all_connectors_structure(self):
        connectors = get_all_connectors()
        for c in connectors:
            self.assertIn('id', c)
            self.assertIn('name', c)
            self.assertIn('fields', c)
            self.assertIn('readonly', c)

    def test_connector_exists_known(self):
        self.assertTrue(connector_exists('smtp'))

    def test_connector_exists_unknown(self):
        self.assertFalse(connector_exists('does_not_exist_xyz'))

    def test_underscore_prefixed_packages_are_excluded_from_discovery(self):
        """contrib/_template must never be auto-registered as a real connector."""
        self.assertFalse(connector_exists('my_service'))
        self.assertEqual(get_connector_count(), 14)

    def test_get_connector_by_id_returns_correct_connector(self):
        connector = get_connector_by_id('smtp')
        self.assertEqual(connector['id'], 'smtp')
        self.assertEqual(connector['name'], 'SMTP Email')

    def test_get_connector_by_id_raises_key_error_for_unknown(self):
        with self.assertRaises(KeyError):
            get_connector_by_id('does_not_exist_xyz')

    def test_sensitive_fields_masked_by_default(self):
        """Sensitive field values must not appear in plain text in the default list view."""
        # Save a known secret
        save_connector_overrides('smtp', {'EMAIL_HOST_PASSWORD': 'my-secret-password'})
        connector = get_connector_by_id('smtp')
        password_field = next(f for f in connector['fields'] if f['name'] == 'EMAIL_HOST_PASSWORD')
        self.assertNotEqual(password_field['value'], 'my-secret-password')
        self.assertTrue(password_field['sensitive'])

    def test_save_connector_overrides_encrypts_sensitive_field(self):
        """Sensitive values must be encrypted in the DB."""
        save_connector_overrides('smtp', {'EMAIL_HOST_PASSWORD': 'plain-text-secret'})
        db_obj = ConnectorOverride.objects.get(connector_id='smtp')
        stored = db_obj.overrides.get('EMAIL_HOST_PASSWORD', '')
        # The stored value should NOT be the plain-text password
        self.assertNotEqual(stored, 'plain-text-secret')
        # But decrypting it should yield the plain-text password
        self.assertEqual(connector_decrypt(stored), 'plain-text-secret')

    def test_reveal_true_decrypts_sensitive_field(self):
        """get_connector_by_id with reveal=True must return the decrypted value."""
        save_connector_overrides('smtp', {'EMAIL_HOST_PASSWORD': 'revealed-secret'})
        connector = get_connector_by_id('smtp', reveal=True)
        password_field = next(f for f in connector['fields'] if f['name'] == 'EMAIL_HOST_PASSWORD')
        self.assertEqual(password_field['value'], 'revealed-secret')

    def test_mysql_connector_is_readonly(self):
        connector = get_connector_by_id('mysql')
        self.assertTrue(connector['readonly'])

    def test_connector_dict_includes_status(self):
        connector = get_connector_by_id('smtp')
        self.assertIn('status', connector)


class StatusComputationTest(TestCase):
    """_compute_status derives configured/partial/disabled from required fields."""

    def test_no_required_fields_is_configured(self):
        definition = {'fields': [{'name': 'X', 'required': False}]}
        self.assertEqual(_compute_status(definition, {'X': ''}), 'configured')

    def test_no_required_fields_filled_is_disabled(self):
        definition = {'fields': [
            {'name': 'A', 'required': True},
            {'name': 'B', 'required': True},
        ]}
        self.assertEqual(_compute_status(definition, {'A': '', 'B': ''}), 'disabled')

    def test_some_required_fields_filled_is_partial(self):
        definition = {'fields': [
            {'name': 'A', 'required': True},
            {'name': 'B', 'required': True},
        ]}
        self.assertEqual(_compute_status(definition, {'A': 'value', 'B': ''}), 'partial')

    def test_all_required_fields_filled_is_configured(self):
        definition = {'fields': [
            {'name': 'A', 'required': True},
            {'name': 'B', 'required': True},
        ]}
        self.assertEqual(_compute_status(definition, {'A': 'value', 'B': 'value'}), 'configured')


class FieldClearAndResetTest(TestCase):
    """Clearing a field freezes it (no more settings.py fallback); resetting unfreezes it."""

    def setUp(self):
        import connectors.core as core_mod
        core_mod._REGISTRY = {}
        core_mod._connectors_seeded = False

    def test_clearing_a_field_stores_explicit_empty_value(self):
        save_connector_overrides('smtp', {'EMAIL_HOST': 'mail.example.com'})
        save_connector_overrides('smtp', {'EMAIL_HOST': ''})
        db_obj = ConnectorOverride.objects.get(connector_id='smtp')
        self.assertIn('EMAIL_HOST', db_obj.overrides)
        self.assertEqual(db_obj.overrides['EMAIL_HOST'], '')

    def test_cleared_field_does_not_fall_back_to_settings(self):
        from django.test import override_settings
        save_connector_overrides('smtp', {'EMAIL_HOST': 'mail.example.com'})
        save_connector_overrides('smtp', {'EMAIL_HOST': ''})
        with override_settings(EMAIL_HOST='should-not-be-used.example.com'):
            connector = get_connector_by_id('smtp')
        host_field = next(f for f in connector['fields'] if f['name'] == 'EMAIL_HOST')
        self.assertEqual(host_field['value'], '')

    def test_field_marked_overridden_once_saved(self):
        from django.test import override_settings
        # Prime the once-per-process seeding pass with an empty settings.py
        # value first (a no-op backfill), matching how a real process's
        # first dashboard load happens before anyone edits anything.
        with override_settings(EMAIL_HOST=''):
            get_connector_by_id('smtp')

        connector = get_connector_by_id('smtp')
        host_field = next(f for f in connector['fields'] if f['name'] == 'EMAIL_HOST')
        self.assertFalse(host_field['overridden'])

        save_connector_overrides('smtp', {'EMAIL_HOST': 'mail.example.com'})
        connector = get_connector_by_id('smtp')
        host_field = next(f for f in connector['fields'] if f['name'] == 'EMAIL_HOST')
        self.assertTrue(host_field['overridden'])

    def test_reset_field_restores_settings_fallback(self):
        from django.test import override_settings
        # Prime seeding once (per-process flag) so it won't fire again below
        # and immediately re-freeze the field right after we reset it.
        with override_settings(EMAIL_HOST=''):
            get_connector_by_id('smtp')

        save_connector_overrides('smtp', {'EMAIL_HOST': 'mail.example.com'})
        reset_connector_field('smtp', 'EMAIL_HOST')

        db_obj = ConnectorOverride.objects.get(connector_id='smtp')
        self.assertNotIn('EMAIL_HOST', db_obj.overrides)

        with override_settings(EMAIL_HOST='from-settings.example.com'):
            connector = get_connector_by_id('smtp')
        host_field = next(f for f in connector['fields'] if f['name'] == 'EMAIL_HOST')
        self.assertEqual(host_field['value'], 'from-settings.example.com')
        self.assertFalse(host_field['overridden'])

    def test_reset_field_on_readonly_connector_raises(self):
        with self.assertRaises(PermissionError):
            reset_connector_field('mysql', 'DB_HOST')

    def test_reset_unknown_field_raises_key_error(self):
        with self.assertRaises(KeyError):
            reset_connector_field('smtp', 'NOT_A_REAL_FIELD')


class AutoSeededFieldsTest(TestCase):
    """
    A non-empty settings.py/.env default gets auto-copied into `overrides` on
    first load so the resolved value is available right away, but that copy
    is NOT a human decision - the 'From .env' vs 'Manually set' badge must
    stay 'From .env' until a human actually edits the field via the dashboard.
    """

    def setUp(self):
        import connectors.core as core_mod
        core_mod._REGISTRY = {}
        core_mod._connectors_seeded = False

    def test_auto_seeded_non_empty_default_is_not_overridden(self):
        from django.test import override_settings
        with override_settings(EMAIL_PORT='25'):
            connector = get_connector_by_id('smtp')
        port_field = next(f for f in connector['fields'] if f['name'] == 'EMAIL_PORT')
        self.assertEqual(port_field['value'], '25')
        self.assertFalse(port_field['overridden'])

        db_obj = ConnectorOverride.objects.get(connector_id='smtp')
        self.assertIn('EMAIL_PORT', db_obj.overrides)
        self.assertIn('EMAIL_PORT', db_obj.auto_seeded_fields)

    def test_human_save_after_auto_seed_marks_overridden(self):
        from django.test import override_settings
        with override_settings(EMAIL_PORT='25'):
            get_connector_by_id('smtp')

        save_connector_overrides('smtp', {'EMAIL_PORT': '587'})
        connector = get_connector_by_id('smtp')
        port_field = next(f for f in connector['fields'] if f['name'] == 'EMAIL_PORT')
        self.assertTrue(port_field['overridden'])

        db_obj = ConnectorOverride.objects.get(connector_id='smtp')
        self.assertNotIn('EMAIL_PORT', db_obj.auto_seeded_fields)

    def test_reset_after_human_save_returns_to_from_env(self):
        from django.test import override_settings
        with override_settings(EMAIL_PORT='25'):
            get_connector_by_id('smtp')

        save_connector_overrides('smtp', {'EMAIL_PORT': '587'})
        reset_connector_field('smtp', 'EMAIL_PORT')

        with override_settings(EMAIL_PORT='25'):
            connector = get_connector_by_id('smtp')
        port_field = next(f for f in connector['fields'] if f['name'] == 'EMAIL_PORT')
        self.assertEqual(port_field['value'], '25')
        self.assertFalse(port_field['overridden'])


class ConnectorTestEndpointTest(TestCase):
    """test_connector() calls the plugin's health_check."""

    def setUp(self):
        import connectors.core as core_mod
        core_mod._REGISTRY = {}
        core_mod._connectors_seeded = False

    def test_test_connector_returns_dict_with_success_key(self):
        with patch('connectors.contrib.smtp.connector.health_check', return_value={'success': True, 'message': 'ok'}):
            # We test via the core test_connector which calls health_check from the registry
            result = test_connector('smtp')
        self.assertIn('success', result)
        self.assertIn('message', result)

    def test_test_connector_unknown_raises_key_error(self):
        with self.assertRaises(KeyError):
            test_connector('does_not_exist_xyz')


class ConnectorAPITest(APITestCase):
    """REST API endpoint tests - superuser restriction, list, retrieve, patch, test."""

    def setUp(self):
        import connectors.core as core_mod
        core_mod._REGISTRY = {}
        core_mod._connectors_seeded = False

        self.superuser = User.objects.create_superuser('admin', 'admin@test.com', 'password')
        self.regular_user = User.objects.create_user('user', 'user@test.com', 'password')
        _, self.super_token = AuthToken.objects.create(self.superuser)
        _, self.user_token = AuthToken.objects.create(self.regular_user)

    def _auth(self, token):
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token}')

    def test_list_requires_superuser(self):
        self._auth(self.user_token)
        resp = self.client.get('/api/connectors/')
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_list_unauthenticated_forbidden(self):
        resp = self.client.get('/api/connectors/')
        # DRF/knox return 401 for anonymous requests (no credentials) and
        # reserve 403 for authenticated-but-not-permitted requests.
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_list_superuser_returns_connectors(self):
        self._auth(self.super_token)
        resp = self.client.get('/api/connectors/')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertIsInstance(resp.data, list)
        self.assertGreater(len(resp.data), 0)

    def test_retrieve_returns_connector(self):
        self._auth(self.super_token)
        resp = self.client.get('/api/connectors/smtp/')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data['id'], 'smtp')

    def test_retrieve_unknown_returns_404(self):
        self._auth(self.super_token)
        resp = self.client.get('/api/connectors/does_not_exist/')
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)

    def test_reveal_requires_superuser(self):
        """?reveal=true must not work for non-superusers."""
        self._auth(self.user_token)
        resp = self.client.get('/api/connectors/smtp/?reveal=true')
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_reveal_works_for_superuser(self):
        save_connector_overrides('smtp', {'EMAIL_HOST_PASSWORD': 'secret123'})
        self._auth(self.super_token)
        resp = self.client.get('/api/connectors/smtp/?reveal=true')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        password_field = next(f for f in resp.data['fields'] if f['name'] == 'EMAIL_HOST_PASSWORD')
        self.assertEqual(password_field['value'], 'secret123')

    def test_patch_saves_overrides(self):
        self._auth(self.super_token)
        resp = self.client.patch('/api/connectors/smtp/', {'fields': {'EMAIL_HOST': 'mail.example.com'}}, format='json')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

    def test_test_endpoint_calls_health_check(self):
        self._auth(self.super_token)
        with patch('connectors.contrib.smtp.connector.health_check', return_value={'success': True, 'message': 'ok'}):
            resp = self.client.post('/api/connectors/smtp/test/')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertIn('success', resp.data)

    def test_test_endpoint_returns_refreshed_connector_with_updated_health(self):
        """
        The dashboard updates the health badge from this response directly (no
        page reload needed), so it must carry the connector's fresh health
        status right after the test runs.
        """
        self._auth(self.super_token)
        with patch('connectors.contrib.smtp.connector.health_check', return_value={'success': True, 'message': 'ok'}):
            resp = self.client.post('/api/connectors/smtp/test/')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertIn('connector', resp.data)
        self.assertEqual(resp.data['connector']['id'], 'smtp')
        self.assertEqual(resp.data['connector']['health']['status'], 'healthy')

    def test_reset_field_endpoint_clears_override(self):
        self._auth(self.super_token)
        self.client.patch('/api/connectors/smtp/', {'fields': {'EMAIL_HOST': 'mail.example.com'}}, format='json')
        resp = self.client.post('/api/connectors/smtp/reset-field/', {'field': 'EMAIL_HOST'}, format='json')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        host_field = next(f for f in resp.data['fields'] if f['name'] == 'EMAIL_HOST')
        self.assertFalse(host_field['overridden'])

    def test_reset_field_requires_superuser(self):
        self._auth(self.user_token)
        resp = self.client.post('/api/connectors/smtp/reset-field/', {'field': 'EMAIL_HOST'}, format='json')
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_reset_field_on_readonly_connector_returns_403(self):
        self._auth(self.super_token)
        resp = self.client.post('/api/connectors/mysql/reset-field/', {'field': 'DB_HOST'}, format='json')
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)


class ConnectorVersionTest(TestCase):
    """Every connector exposes a version string, defaulting to 1.0.0."""

    def setUp(self):
        import connectors.core as core_mod
        core_mod._REGISTRY = {}
        core_mod._connectors_seeded = False

    def test_connector_includes_version(self):
        connector = get_connector_by_id('smtp')
        self.assertEqual(connector['version'], '1.0.0')

    def test_all_connectors_have_a_version(self):
        for c in get_all_connectors():
            self.assertIn('version', c)
            self.assertTrue(c['version'])

    def test_connector_includes_author(self):
        connector = get_connector_by_id('smtp')
        self.assertEqual(connector['author'], 'Thales CERT')

    def test_all_connectors_have_an_author(self):
        for c in get_all_connectors():
            self.assertIn('author', c)
            self.assertEqual(c['author'], 'Thales CERT')


class ConnectorHealthTest(TestCase):
    """get_connector_health / record_health_check / test_connector persistence."""

    def setUp(self):
        import connectors.core as core_mod
        core_mod._REGISTRY = {}
        core_mod._connectors_seeded = False
        ConnectorHealthCheck.objects.all().delete()

    def test_unknown_before_any_test(self):
        health = get_connector_health('smtp')
        self.assertEqual(health['status'], 'unknown')
        self.assertIsNone(health['checked_at'])

    def test_record_health_check_success(self):
        record_health_check('smtp', True, 'Connected to mail.example.com:25')
        health = get_connector_health('smtp')
        self.assertEqual(health['status'], 'healthy')
        self.assertEqual(health['message'], 'Connected to mail.example.com:25')
        self.assertIsNotNone(health['checked_at'])

    def test_record_health_check_failure(self):
        record_health_check('smtp', False, 'Connection refused')
        health = get_connector_health('smtp')
        self.assertEqual(health['status'], 'unhealthy')
        self.assertEqual(health['message'], 'Connection refused')

    def test_test_connector_persists_health_check_result(self):
        with patch('connectors.contrib.smtp.connector.health_check',
                   return_value={'success': True, 'message': 'all good'}):
            test_connector('smtp')
        connector = get_connector_by_id('smtp')
        self.assertEqual(connector['health']['status'], 'healthy')
        self.assertEqual(connector['health']['message'], 'all good')

    def test_connector_dict_includes_health(self):
        connector = get_connector_by_id('smtp')
        self.assertIn('health', connector)
        self.assertIn('status', connector['health'])


class WeeklyHealthCheckJobTest(TestCase):
    """
    run_weekly_health_checks tests every connector (auto-run only) and only
    queues a PendingAction alert for connectors the user has actually
    finished configuring (status == 'configured') that fail.
    """

    def setUp(self):
        import connectors.core as core_mod
        core_mod._REGISTRY = {}
        core_mod._connectors_seeded = False
        ConnectorOverride.objects.all().delete()
        ConnectorHealthCheck.objects.all().delete()
        PendingAction.objects.filter(action_type='connector_health_check').delete()

    @staticmethod
    def _mock_registry(required=True, success=False, message='Connection refused'):
        return {
            'smtp': {
                'definition': {
                    'id': 'smtp', 'name': 'SMTP Email', 'readonly': False,
                    'fields': [{'name': 'EMAIL_HOST', 'required': required}],
                },
                'health_check': MagicMock(return_value={'success': success, 'message': message}),
            },
        }

    def test_all_healthy_creates_no_pending_action(self):
        with patch('connectors.core._get_registry', return_value=self._mock_registry(success=True)):
            run_weekly_health_checks()
        self.assertEqual(PendingAction.objects.filter(action_type='connector_health_check').count(), 0)

    def test_unconfigured_connector_failure_does_not_create_pending_action(self):
        # Required field with no override => status stays 'disabled', not 'configured'.
        with patch('connectors.core._get_registry', return_value=self._mock_registry(required=True, success=False)):
            run_weekly_health_checks()
        self.assertEqual(PendingAction.objects.filter(action_type='connector_health_check').count(), 0)

    def test_configured_connector_failure_creates_pending_action(self):
        ConnectorOverride.objects.create(connector_id='smtp', overrides={'EMAIL_HOST': 'mail.example.com'})
        with patch('connectors.core._get_registry', return_value=self._mock_registry(required=True, success=False)):
            run_weekly_health_checks()
        actions = PendingAction.objects.filter(action_type='connector_health_check')
        self.assertEqual(actions.count(), 1)
        pa = actions.first()
        self.assertEqual(pa.metadata['connector_id'], 'smtp')
        self.assertIn('Connection refused', pa.description)
        self.assertIn('SMTP Email', pa.title)

    def test_repeated_failure_does_not_duplicate_pending_action(self):
        ConnectorOverride.objects.create(connector_id='smtp', overrides={'EMAIL_HOST': 'mail.example.com'})
        with patch('connectors.core._get_registry', return_value=self._mock_registry(required=True, success=False)):
            run_weekly_health_checks()
            run_weekly_health_checks()
        self.assertEqual(PendingAction.objects.filter(action_type='connector_health_check').count(), 1)

    def test_failure_then_recovery_allows_new_alert_after_resolution(self):
        ConnectorOverride.objects.create(connector_id='smtp', overrides={'EMAIL_HOST': 'mail.example.com'})
        with patch('connectors.core._get_registry', return_value=self._mock_registry(required=True, success=False, message='down')):
            run_weekly_health_checks()

        PendingAction.objects.filter(action_type='connector_health_check').update(status='approved')

        with patch('connectors.core._get_registry', return_value=self._mock_registry(required=True, success=False, message='still down')):
            run_weekly_health_checks()

        actions = PendingAction.objects.filter(action_type='connector_health_check')
        self.assertEqual(actions.count(), 2)

