from unittest.mock import patch, MagicMock

from django.test import TestCase, SimpleTestCase, TransactionTestCase, override_settings
from django.contrib.auth.models import User
from rest_framework.test import APITestCase
from rest_framework import status
from knox.models import AuthToken

import connectors.core as core_mod

from connectors.core import record_event
from connectors.models import ConnectorEvent, ConnectorOverride, ConnectorHealthCheck, NotificationSetting
from connectors.core import (get_all_connectors, get_connector_by_id, connector_exists, save_connector_overrides,
                             reset_connector_field, get_connector_count, test_connector, connector_encrypt,
                             connector_decrypt, _compute_status, get_connector_health, record_health_check,
                             run_weekly_health_checks, get_misp_config, get_thehive_config)
from common.models import PendingAction
from connectors.notifications import (all_types, get_type, render_per_alert, render_text, render_title, EmailSpec,
                                      Field, Layout, NotificationType, email_subject, get_setting, is_enabled,
                                      catalogue, render_message, render_thehive_title, save_setting, thehive_meta,
                                      template)
from common.core import (send_app_specific_notifications, send_app_specific_notifications_group,
                         send_only_thehive_notifications)
from data_leak.models import Alert, Keyword, Subscriber
from dns_finder.models import Alert as DnsAlert, DnsMonitored, DnsTwisted
from django.db import connection
from django.db.migrations.executor import MigrationExecutor
import json
import os
import importlib


class ConnectorOverrideModelTest(TestCase):
    """ConnectorOverride model creation and field storage."""

    def test_create_and_retrieve(self):
        ConnectorOverride.objects.create(
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
        self.assertEqual(get_connector_count(), 21)  # 16 before the LLM gateway + OpenAI, Anthropic, Gemini, Ollama and the generic provider

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


# Notifications API
BASE = '/api/connectors/notifications/'


class NotificationAPITest(APITestCase):
    def setUp(self):
        NotificationSetting.objects.all().delete()
        self.superuser = User.objects.create_superuser('notif_admin', 'admin@test.com', 'password')
        self.regular_user = User.objects.create_user('notif_user', 'user@test.com', 'password')
        _, self.super_token = AuthToken.objects.create(self.superuser)
        _, self.user_token = AuthToken.objects.create(self.regular_user)

    def _auth(self, token):
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token}')

    def test_every_endpoint_requires_a_superuser(self):
        self._auth(self.user_token)
        self.assertEqual(self.client.get(BASE).status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(self.client.patch(BASE + 'data_leak/slack/', {'enabled': True}, format='json').status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(self.client.post(BASE + 'data_leak/slack/preview/', {}, format='json').status_code, status.HTTP_403_FORBIDDEN)

    def test_anonymous_is_refused(self):
        self.assertEqual(self.client.get(BASE).status_code, status.HTTP_401_UNAUTHORIZED)

    def test_list_describes_every_type_and_channel(self):
        self._auth(self.super_token)
        resp = self.client.get(BASE)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(len(resp.data), 22)
        leak = next(t for t in resp.data if t['id'] == 'data_leak')
        self.assertEqual(leak['module'], 'data_leak')
        self.assertEqual(list(leak['channels']), ['slack', 'citadel', 'thehive', 'email'])
        slack = leak['channels']['slack']
        self.assertFalse(slack['enabled'])
        self.assertEqual(slack['fields'], ['keyword_name', 'url'])
        self.assertEqual(slack['available'], [
            {'id': 'keyword_name', 'label': 'Keyword', 'required': False},
            {'id': 'url', 'label': 'Source', 'required': True},
        ])
        self.assertEqual(slack['connector']['id'], 'slack')
        self.assertIn(slack['connector']['status'], ('configured', 'partial', 'disabled'))
        self.assertEqual(leak['channels']['email']['connector']['id'], 'smtp')
        self.assertEqual(leak['channels']['email']['available'], [])
        weekly = next(t for t in resp.data if t['id'] == 'threats_watcher_weeklysummary')
        self.assertNotIn('thehive', weekly['channels'])

    def test_switching_a_channel_on(self):
        self._auth(self.super_token)
        resp = self.client.patch(BASE + 'data_leak/slack/', {'enabled': True}, format='json')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertTrue(resp.data['channels']['slack']['enabled'])
        self.assertFalse(resp.data['channels']['citadel']['enabled'])

    def test_choosing_the_fields(self):
        self._auth(self.super_token)
        resp = self.client.patch(BASE + 'data_leak/slack/', {'fields': ['url']}, format='json')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data['channels']['slack']['fields'], ['url'])

    def test_bad_requests_save_nothing(self):
        self._auth(self.super_token)
        cases = [
            ('data_leak/slack/', {'fields': ['keyword_name']}),        # required field missing
            ('data_leak/slack/', {'fields': ['url', 'nope']}),         # unknown field
            ('data_leak/slack/', {'fields': 'url'}),                   # not a list
            ('data_leak/slack/', {'enabled': 'yes'}),                  # not a boolean
            ('data_leak/email/', {'fields': ['url']}),                 # nothing to choose on email
            ('threats_watcher_weeklysummary/thehive/', {'enabled': True}),  # no TheHive message
        ]
        for path, body in cases:
            with self.subTest(path=path, body=body):
                resp = self.client.patch(BASE + path, body, format='json')
                self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
                self.assertIn('error', resp.data)
        self.assertFalse(NotificationSetting.objects.exists())

    def test_unknown_type_and_channel_are_404(self):
        self._auth(self.super_token)
        self.assertEqual(self.client.patch(BASE + 'nope/slack/', {'enabled': True}, format='json').status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(self.client.patch(BASE + 'data_leak/sms/', {'enabled': True}, format='json').status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(self.client.post(BASE + 'nope/slack/preview/', {}, format='json').status_code, status.HTTP_404_NOT_FOUND)

    @patch('common.utils.send_citadel_messages.send_citadel_message')
    def test_a_test_goes_to_citadel_marked_as_a_test(self, send):
        send.return_value = (True, '')
        self._auth(self.super_token)
        resp = self.client.post(BASE + 'cyber_watch_cve_hit/citadel/test/')
        self.assertEqual((resp.status_code, resp.data['success']), (status.HTTP_200_OK, True))
        content = send.call_args.args[0]
        self.assertTrue(content['body'].startswith('[TEST] '))
        self.assertTrue(content['formatted_body'].startswith('<strong>[TEST]</strong>'))
        self.assertIn('CVE-2026-12345', content['body'])

    @patch('common.utils.send_slack_messages.send_slack_message')
    def test_a_test_goes_to_slack_marked_as_a_test(self, send):
        send.return_value = (True, '')
        self._auth(self.super_token)
        resp = self.client.post(BASE + 'data_leak/slack/test/')
        self.assertTrue(resp.data['success'])
        self.assertTrue(send.call_args.args[0].startswith('[TEST] '))

    @patch('common.utils.send_citadel_messages.send_citadel_message')
    def test_a_test_that_fails_says_why_and_is_kept_in_the_deliveries(self, send):
        from connectors.models import ConnectorEvent
        send.return_value = (False, '429')
        self._auth(self.super_token)
        resp = self.client.post(BASE + 'data_leak/citadel/test/')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertFalse(resp.data['success'])
        self.assertIn('429', resp.data['message'])
        event = ConnectorEvent.objects.filter(connector_id='citadel').first()
        self.assertEqual((event.ok, event.subject), (False, 'data_leak (test)'))

    def test_a_test_is_only_for_slack_and_citadel_and_for_a_superuser(self):
        self._auth(self.super_token)
        self.assertEqual(self.client.post(BASE + 'data_leak/thehive/test/').status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(self.client.post(BASE + 'data_leak/email/test/').status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(self.client.post(BASE + 'nope/slack/test/').status_code, status.HTTP_404_NOT_FOUND)
        self._auth(self.user_token)
        self.assertEqual(self.client.post(BASE + 'data_leak/slack/test/').status_code, status.HTTP_403_FORBIDDEN)

    def test_the_words_of_threats_watcher_are_a_valid_paragraph_on_citadel(self):
        from common.core import citadel_content
        from connectors.notifications import get_type
        content = citadel_content('threats_watcher', get_type('threats_watcher').sample())
        self.assertNotIn('<ul>', content['formatted_body'])
        self.assertIn('<p><strong>ransomware<br>phishing kit</strong></p>', content['formatted_body'])
        # The link is on its own line in the text version
        self.assertIn('phishing kit\n\nSee the trendy words in Watcher', content['body'])

    def test_preview_of_a_text_channel_uses_the_fields_sent(self):
        self._auth(self.super_token)
        resp = self.client.post(BASE + 'data_leak/slack/preview/', {'fields': ['url']}, format='json')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data['kind'], 'text')
        self.assertIn('• *Source:* https://pastebin.com/abc123', resp.data['content'])
        self.assertNotIn('*• Keyword:*', resp.data['content'])
        self.assertFalse(NotificationSetting.objects.exists())

    def test_preview_without_fields_uses_the_saved_ones(self):
        self._auth(self.super_token)
        self.client.patch(BASE + 'data_leak/slack/', {'fields': ['url']}, format='json')
        resp = self.client.post(BASE + 'data_leak/slack/preview/', {}, format='json')
        self.assertNotIn('*• Keyword:*', resp.data['content'])

    def test_preview_of_citadel_thehive_and_email(self):
        self._auth(self.super_token)
        citadel = self.client.post(BASE + 'data_leak/citadel/preview/', {}, format='json').data
        self.assertEqual(citadel['kind'], 'html')
        self.assertIn('<strong>Source</strong>: https://pastebin.com/abc123<br>', citadel['content'])
        thehive = self.client.post(BASE + 'data_leak/thehive/preview/', {}, format='json').data
        self.assertEqual(thehive['kind'], 'text')
        self.assertTrue(thehive['title'].startswith('New Data Leakage - Alert #'))
        email = self.client.post(BASE + 'data_leak/email/preview/', {}, format='json').data
        self.assertEqual(email['kind'], 'html')
        self.assertEqual(email['title'], '[ALERT #42] Data Leak')
        self.assertIn('<html', email['content'])

    def test_preview_refuses_what_the_save_refuses(self):
        self._auth(self.super_token)
        self.assertEqual(self.client.post(BASE + 'data_leak/slack/preview/', {'fields': ['nope']}, format='json').status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(self.client.post(BASE + 'threats_watcher_weeklysummary/thehive/preview/', {}, format='json').status_code, status.HTTP_400_BAD_REQUEST)

    def test_every_type_previews_on_every_channel(self):
        self._auth(self.super_token)
        for item in self.client.get(BASE).data:
            for channel in item['channels']:
                with self.subTest(type=item['id'], channel=channel):
                    resp = self.client.post(f"{BASE}{item['id']}/{channel}/preview/", {}, format='json')
                    self.assertEqual(resp.status_code, status.HTTP_200_OK)
                    self.assertTrue(resp.data['content'])


# Notification catalogue
with open(os.path.join(os.path.dirname(__file__), 'test_data', 'notification_golden.json'), encoding='utf-8') as _f:
    GOLDEN = json.load(_f)

MODULES = {'threats_watcher', 'cyber_watch', 'data_leak', 'dns_finder', 'website_monitoring', 'legitimate_domains'}


class CatalogueShapeTest(SimpleTestCase):
    def test_twenty_two_types_and_seventy_four_channel_pairs(self):
        types = all_types()
        self.assertEqual(len(types), 22)
        self.assertEqual(sum(len(t.channels) for t in types), 74)
        per_channel = {c: sum(1 for t in types if c in t.channels) for c in ('slack', 'citadel', 'thehive', 'email')}
        self.assertEqual(per_channel, {'slack': 21, 'citadel': 21, 'thehive': 10, 'email': 22})

    def test_every_type_has_a_module_and_a_link(self):
        for ntype in all_types():
            with self.subTest(type=ntype.id):
                self.assertIn(ntype.module, MODULES)
                self.assertTrue(ntype.url_suffix.startswith('#'))
                self.assertTrue(ntype.label)

    def test_field_ids_are_unique_within_a_type(self):
        for ntype in all_types():
            ids = [f.id for f in ntype.fields]
            self.assertEqual(len(ids), len(set(ids)), ntype.id)


@patch('connectors.notifications.catalogue.stamp', new=lambda: '27 Nov 16:42')
class GoldenMessagesTest(SimpleTestCase):
    """With every field selected, the messages are the ones the hardcoded APP_CONFIG_* dicts produced."""

    def test_default_messages_equal_the_legacy_text(self):
        for ntype in all_types():
            ctx = ntype.sample()
            for channel in ('slack', 'citadel'):
                if channel in ntype.layouts:
                    with self.subTest(type=ntype.id, channel=channel):
                        self.assertEqual(render_text(ntype, channel, ctx), GOLDEN[f'{ntype.id}/{channel}'])
            if 'thehive' in ntype.layouts:
                with self.subTest(type=ntype.id, channel='thehive'):
                    self.assertEqual(render_text(ntype, 'thehive', ctx), GOLDEN[f'{ntype.id}/thehive'])
                    self.assertEqual(render_title(ntype, ctx), GOLDEN[f'{ntype.id}/thehive_title'])
            if ntype.email:
                with self.subTest(type=ntype.id, channel='email'):
                    self.assertEqual(ntype.email.subject.format(**ctx), GOLDEN[f'{ntype.id}/email_subject'])

    def test_the_fixed_alert_of_a_group_notification_is_unchanged(self):
        ntype = get_type('dns_finder')
        ctx = ntype.sample()
        layout = ntype.thehive_per_alert
        self.assertEqual(layout.title.format(**ctx), GOLDEN['dns_finder/per_alert_title'])
        self.assertEqual(render_per_alert("dns_finder", ctx)[1], GOLDEN["dns_finder/per_alert"])


class FieldChoiceTest(SimpleTestCase):
    def test_every_field_can_be_left_out_on_its_own(self):
        for ntype in all_types():
            ctx = ntype.sample()
            for channel in ('slack', 'citadel', 'thehive'):
                if channel not in ntype.layouts:
                    continue
                full = render_text(ntype, channel, ctx)
                for f in ntype.fields_for(channel):
                    if f.required:
                        continue
                    with self.subTest(type=ntype.id, channel=channel, field=f.id):
                        shown = [i for i in ntype.default_fields(channel) if i != f.id]
                        self.assertNotEqual(render_text(ntype, channel, ctx, shown), full)

    def test_only_the_required_fields_still_make_a_message(self):
        for ntype in all_types():
            ctx = ntype.sample()
            for channel in ('slack', 'citadel', 'thehive'):
                if channel not in ntype.layouts:
                    continue
                required = [f.id for f in ntype.fields_for(channel) if f.required]
                with self.subTest(type=ntype.id, channel=channel):
                    self.assertTrue(render_text(ntype, channel, ctx, required))


class EmailPreviewTest(SimpleTestCase):
    def test_every_sample_email_renders(self):
        for ntype in all_types():
            if not ntype.email:
                continue
            ctx = ntype.sample()
            with self.subTest(type=ntype.id):
                body = ntype.email.sample_body(ctx)
                self.assertIn('<html', body)
                self.assertTrue(ntype.email.subject.format(**ctx))


# Notification settings
def _sample():
    return {'name': 'example.com', 'count': 3, 'details_url': 'https://watcher.test/#/x'}


TYPE = NotificationType(
    id='test_type', label='Test type', module='data_leak', url_suffix='#/x', sample=_sample,
    fields=(
        Field('name', 'Name', slack='*• Name:* {name}\n', citadel='<li>Name: {name}</li>', thehive='Name: {name}\n', required=True),
        Field('count', 'Count', slack='*• Count:* {count}\n', citadel='<li>Count: {count}</li>', thehive='Count: {count}\n'),
        Field('note', 'Note', thehive='Note: fixed\n'),
    ),
    layouts={
        'slack': Layout(head='*Test {name}*\n\n', tail='\nMore: {details_url}'),
        'citadel': Layout(head='<ul>', tail='</ul>'),
        'thehive': Layout(head='**Alert**\n', title='Test - {name}'),
    },
    email=EmailSpec(subject='[TEST] {name}', sample_body=lambda ctx: '<html></html>'),
    thehive_meta={'severity': 2, 'tlp': 1, 'pap': 1},
    thehive_per_alert=Layout(head='per alert {name}', title='Per alert {name}'),
)

ONLY_SLACK = NotificationType(
    id='only_slack', label='Only Slack', module='data_leak', url_suffix='#/x', sample=_sample,
    layouts={'slack': Layout(head='fixed {name}')},
)


class RenderTest(SimpleTestCase):
    def test_every_field_is_shown_by_default(self):
        self.assertEqual(
            render_text(TYPE, 'slack', _sample()),
            '*Test example.com*\n\n*• Name:* example.com\n*• Count:* 3\n\nMore: https://watcher.test/#/x',
        )

    def test_only_the_selected_fields_are_shown(self):
        self.assertEqual(
            render_text(TYPE, 'slack', _sample(), ['name']),
            '*Test example.com*\n\n*• Name:* example.com\n\nMore: https://watcher.test/#/x',
        )

    def test_lines_follow_the_catalogue_order_not_the_selection_order(self):
        self.assertEqual(render_text(TYPE, 'slack', _sample(), ['count', 'name']), render_text(TYPE, 'slack', _sample()))

    def test_a_field_without_a_line_for_the_channel_is_skipped(self):
        self.assertEqual(render_text(TYPE, 'citadel', _sample()), '<ul><li>Name: example.com</li><li>Count: 3</li></ul>')
        self.assertEqual(render_text(TYPE, 'thehive', _sample()), '**Alert**\nName: example.com\nCount: 3\nNote: fixed\n')

    def test_values_that_contain_braces_are_not_formatted_again(self):
        ctx = {**_sample(), 'name': '{oops}'}
        self.assertIn('{oops}', render_text(TYPE, 'slack', ctx))

    def test_thehive_title(self):
        self.assertEqual(render_title(TYPE, _sample()), 'Test - example.com')

    def test_channels_and_fields_of_a_type(self):
        self.assertEqual(TYPE.channels, ('slack', 'citadel', 'thehive', 'email'))
        self.assertEqual(ONLY_SLACK.channels, ('slack',))
        self.assertEqual(TYPE.fields_for('email'), ())
        self.assertEqual(TYPE.default_fields('slack'), ['name', 'count'])
        self.assertEqual(TYPE.default_fields('thehive'), ['name', 'count', 'note'])


class StoreTest(TestCase):
    def setUp(self):
        self.enterContext(patch.dict(catalogue._TYPES, {'test_type': TYPE, 'only_slack': ONLY_SLACK}))

    def test_no_row_means_off_with_every_field(self):
        self.assertEqual(get_setting('test_type', 'slack'), (False, ['name', 'count']))
        self.assertFalse(is_enabled('test_type', 'slack'))

    def test_switching_on_keeps_the_default_fields(self):
        self.assertEqual(save_setting('test_type', 'slack', enabled=True), (True, ['name', 'count']))
        self.assertTrue(is_enabled('test_type', 'slack'))
        self.assertIsNone(NotificationSetting.objects.get(notification_type='test_type', channel='slack').selected_fields)

    def test_choosing_fields(self):
        save_setting('test_type', 'slack', fields=['name'])
        self.assertEqual(get_setting('test_type', 'slack'), (False, ['name']))
        self.assertEqual(NotificationSetting.objects.get(notification_type='test_type', channel='slack').selected_fields, ['name'])

    def test_choosing_every_field_is_stored_as_not_chosen(self):
        save_setting('test_type', 'slack', fields=['count', 'name'])
        self.assertIsNone(NotificationSetting.objects.get(notification_type='test_type', channel='slack').selected_fields)

    def test_the_two_settings_are_independent(self):
        save_setting('test_type', 'slack', enabled=True, fields=['name'])
        save_setting('test_type', 'slack', enabled=False)
        self.assertEqual(get_setting('test_type', 'slack'), (False, ['name']))

    def test_a_required_field_cannot_be_removed(self):
        with self.assertRaisesMessage(ValueError, 'name'):
            save_setting('test_type', 'slack', fields=['count'])

    def test_an_unknown_field_is_refused(self):
        with self.assertRaisesMessage(ValueError, 'nope'):
            save_setting('test_type', 'slack', fields=['name', 'nope'])

    def test_fields_must_be_a_list_of_strings(self):
        with self.assertRaises(ValueError):
            save_setting('test_type', 'slack', fields='name')
        with self.assertRaises(ValueError):
            save_setting('test_type', 'slack', fields=[1])

    def test_enabled_must_be_a_boolean(self):
        with self.assertRaises(ValueError):
            save_setting('test_type', 'slack', enabled='yes')

    def test_unknown_type_and_unknown_channel(self):
        with self.assertRaises(KeyError):
            save_setting('missing', 'slack', enabled=True)
        with self.assertRaises(KeyError):
            save_setting('test_type', 'sms', enabled=True)

    def test_a_channel_the_type_does_not_have(self):
        with self.assertRaisesMessage(ValueError, 'no citadel message'):
            save_setting('only_slack', 'citadel', enabled=True)

    def test_email_has_no_fields_to_choose(self):
        with self.assertRaises(ValueError):
            save_setting('test_type', 'email', fields=['name'])
        self.assertEqual(save_setting('test_type', 'email', enabled=True), (True, []))

    def test_stale_field_ids_are_ignored_and_required_fields_always_shown(self):
        NotificationSetting.objects.create(notification_type='test_type', channel='slack', selected_fields=['gone'])
        self.assertEqual(get_setting('test_type', 'slack'), (False, ['name']))
        NotificationSetting.objects.filter(notification_type='test_type', channel='slack').update(selected_fields=['count'])
        self.assertEqual(get_setting('test_type', 'slack'), (False, ['name', 'count']))

    def test_render_message_uses_the_saved_fields(self):
        save_setting('test_type', 'slack', fields=['name'])
        self.assertNotIn('Count', render_message('test_type', 'slack', _sample()))
        self.assertIn('Name', render_message('test_type', 'slack', _sample()))

    def test_title_subject_meta_and_per_alert_text(self):
        self.assertEqual(render_thehive_title('test_type', _sample()), 'Test - example.com')
        self.assertEqual(email_subject('test_type', _sample()), '[TEST] example.com')
        self.assertEqual(thehive_meta('test_type'), {'severity': 2, 'tlp': 1, 'pap': 1})
        self.assertEqual(render_per_alert('test_type', _sample()), ('Per alert example.com', 'per alert example.com'))


# Notification delivery
class DeliveryTest(TestCase):
    def setUp(self):
        # The test database starts with every setting seeded (off): the tests switch on what they need.
        NotificationSetting.objects.all().delete()
        self.alert = Alert.objects.create(
            keyword=Keyword.objects.create(name='example.com'), url='https://pastebin.com/abc', content='leaked')
        self.user = User.objects.create_user('recipient', 'recipient@test.com', 'pass')
        self.slack = self.enterContext(patch('common.core.send_slack_message'))
        self.citadel = self.enterContext(patch('common.core.send_citadel_message'))
        self.thehive = self.enterContext(patch('common.core.send_thehive_alert'))
        self.email = self.enterContext(patch('common.core.send_email_notifications'))

    def _send(self, subscribers=None):
        send_app_specific_notifications(
            'data_leak', {'alert': self.alert}, Subscriber.objects.all() if subscribers is None else subscribers)

    def test_nothing_is_sent_until_a_channel_is_switched_on(self):
        Subscriber.objects.create(user_rec=self.user, email=True)
        self._send()
        for mock in (self.slack, self.citadel, self.thehive, self.email):
            mock.assert_not_called()

    def test_slack_goes_out_without_any_subscriber(self):
        save_setting('data_leak', 'slack', enabled=True)
        self._send(Subscriber.objects.none())
        self.slack.assert_called_once()
        self.assertIn('https://pastebin.com/abc', self.slack.call_args[0][0])

    def test_the_message_shows_only_the_chosen_fields(self):
        save_setting('data_leak', 'slack', enabled=True, fields=['url'])
        self._send()
        text = self.slack.call_args[0][0]
        self.assertNotIn('*• Keyword:*', text)
        self.assertIn('• *Source:* https://pastebin.com/abc', text)

    def test_citadel_and_thehive_follow_their_own_switch(self):
        save_setting('data_leak', 'citadel', enabled=True)
        save_setting('data_leak', 'thehive', enabled=True)
        self._send()
        self.citadel.assert_called_once()
        self.assertIn('https://pastebin.com/abc', self.citadel.call_args.kwargs['content']['formatted_body'])
        self.thehive.assert_called_once()
        self.assertTrue(self.thehive.call_args.kwargs['title'].startswith('New Data Leakage - Alert #'))

    def test_email_needs_the_switch_and_a_recipient(self):
        Subscriber.objects.create(user_rec=self.user, email=True)
        self._send()
        self.email.assert_not_called()

        save_setting('data_leak', 'email', enabled=True)
        Subscriber.objects.all().update(email=False)
        self._send()
        self.email.assert_not_called()

        Subscriber.objects.all().update(email=True)
        self._send()
        self.email.assert_called_once()
        self.assertEqual(self.email.call_args[0][2], ['recipient@test.com'])

    def test_a_failing_channel_does_not_stop_the_others(self):
        Subscriber.objects.create(user_rec=self.user, email=True)
        save_setting('data_leak', 'slack', enabled=True)
        save_setting('data_leak', 'email', enabled=True)
        self.slack.side_effect = RuntimeError('Slack is down')
        self._send()
        self.email.assert_called_once()

    def test_a_failing_setting_read_does_not_raise_and_sends_nothing(self):
        Subscriber.objects.create(user_rec=self.user, email=True)
        with patch('common.core.is_enabled', side_effect=RuntimeError('db down')):
            self._send()
        for mock in (self.slack, self.citadel, self.thehive, self.email):
            mock.assert_not_called()

    def test_a_failing_setting_read_on_one_channel_does_not_stop_the_others(self):
        from connectors.notifications import is_enabled as real_is_enabled
        Subscriber.objects.create(user_rec=self.user, email=True)
        save_setting('data_leak', 'slack', enabled=True)
        save_setting('data_leak', 'email', enabled=True)

        def flaky(type_id, channel):
            if channel == 'slack':
                raise RuntimeError('db down')
            return real_is_enabled(type_id, channel)

        with patch('common.core.is_enabled', side_effect=flaky):
            self._send()
        self.slack.assert_not_called()
        self.email.assert_called_once()

    def test_group_notification_follows_the_settings(self):
        context = {'keyword': 'example.com', 'alerts_number': 3}
        send_app_specific_notifications_group('data_leak_group', context, Subscriber.objects.none())
        self.slack.assert_not_called()

        save_setting('data_leak_group', 'slack', enabled=True)
        send_app_specific_notifications_group('data_leak_group', context, Subscriber.objects.none())
        self.slack.assert_called_once()
        self.assertIn('*3*', self.slack.call_args[0][0])

    def test_a_failing_setting_read_does_not_raise_for_the_group_thehive_alert(self):
        with patch('common.core.is_enabled', side_effect=RuntimeError('db down')):
            send_only_thehive_notifications('data_leak', {'alert': self.alert}, Subscriber.objects.none())
        self.thehive.assert_not_called()

    def test_one_thehive_alert_per_alert_of_a_group(self):
        send_only_thehive_notifications('data_leak', {'alert': self.alert}, Subscriber.objects.none())
        self.thehive.assert_not_called()

        save_setting('data_leak', 'thehive', enabled=True)
        send_only_thehive_notifications('data_leak', {'alert': self.alert}, Subscriber.objects.none())
        self.thehive.assert_called_once()
        self.assertEqual(self.thehive.call_args.kwargs['severity'], 1)


class DnsFinderTheHiveTest(TestCase):
    """DNS Finder opens its own TheHive alert (search for the parent domain first) inside the generic sender."""

    def setUp(self):
        NotificationSetting.objects.all().delete()
        monitored = DnsMonitored.objects.create(domain_name='example.com')
        twisted = DnsTwisted.objects.create(domain_name='evil.example.com', dns_monitored=monitored)
        self.alert = DnsAlert.objects.create(
            dns_twisted=twisted, source=DnsAlert.SOURCE_DNSTWIST, trigger='dnstwist')
        self.context = {'alert': self.alert, 'source': DnsAlert.SOURCE_DNSTWIST}
        self.slack = self.enterContext(patch('common.core.send_slack_message'))
        self.email = self.enterContext(patch('common.core.send_email_notifications'))
        self.search_ticket = self.enterContext(
            patch('common.core.search_thehive_for_ticket_id', return_value=(None, None)))
        self.search_observable = self.enterContext(
            patch('common.core.search_thehive_for_observable', return_value=(None, None)))
        self.update_alert = self.enterContext(patch('common.core.update_existing_alert_case'))
        self.create_alert = self.enterContext(patch('common.core.create_new_alert'))

    def _send(self):
        send_app_specific_notifications('dns_finder', self.context, Subscriber.objects.none())

    def test_a_new_thehive_alert_carries_the_catalogue_title_and_meta(self):
        save_setting('dns_finder', 'thehive', enabled=True)
        self._send()
        self.create_alert.assert_called_once()
        kwargs = self.create_alert.call_args.kwargs
        self.assertEqual(kwargs['title'], 'New Twisted DNS found - example[.]com')
        self.assertEqual((kwargs['severity'], kwargs['tlp'], kwargs['pap']), (1, 1, 1))

    def test_nothing_goes_to_thehive_while_it_is_switched_off(self):
        self._send()
        self.create_alert.assert_not_called()
        self.search_observable.assert_not_called()

    def test_a_failing_thehive_block_does_not_stop_slack(self):
        save_setting('dns_finder', 'thehive', enabled=True)
        save_setting('dns_finder', 'slack', enabled=True)
        self.create_alert.side_effect = RuntimeError('TheHive is down')
        self._send()
        self.slack.assert_called_once()

    def test_an_error_before_the_thehive_calls_does_not_stop_slack(self):
        save_setting('dns_finder', 'thehive', enabled=True)
        save_setting('dns_finder', 'slack', enabled=True)
        with patch('common.core.generate_ref', side_effect=RuntimeError('no reference available')):
            self._send()
        self.slack.assert_called_once()
        self.create_alert.assert_not_called()


class UdrpDeliveryTest(TestCase):
    """UDRP decisions: Slack and Citadel raised KeyError before (the legacy dicts had no channel or room)."""

    def setUp(self):
        from types import SimpleNamespace
        NotificationSetting.objects.all().delete()
        self.site = SimpleNamespace(domain_name='example.com', ticket_id='T-1')
        # The TheHive comment is not part of this feature and would call the real TheHive if it is configured.
        self.enterContext(patch('site_monitoring.udrp._notify_thehive'))
        self.slack = self.enterContext(patch('common.utils.send_slack_messages.send_slack_message'))
        self.citadel = self.enterContext(patch('common.utils.send_citadel_messages.send_citadel_message'))
        self.email = self.enterContext(patch('common.utils.send_email_notifications.send_email_notifications'))
        self.enterContext(patch('connectors.core.get_slack_config', return_value={'token': 't', 'channel': 'C1'}))
        self.enterContext(patch(
            'connectors.core.get_citadel_config', return_value={'url': 'https://c', 'token': 't', 'room_id': '!room'}))

    def _notify(self):
        from site_monitoring.udrp import notify_udrp_decision
        notify_udrp_decision(self.site, 'won')

    def test_nothing_goes_out_until_a_channel_is_switched_on(self):
        self._notify()
        for mock in (self.slack, self.citadel, self.email):
            mock.assert_not_called()

    def test_slack_uses_the_configured_channel(self):
        save_setting('udrp_decision', 'slack', enabled=True)
        self._notify()
        self.slack.assert_called_once()
        content, channel = self.slack.call_args[0][:2]
        self.assertEqual(channel, 'C1')
        self.assertIn('example[.]com', content)

    def test_citadel_uses_the_configured_room(self):
        save_setting('udrp_decision', 'citadel', enabled=True)
        self._notify()
        self.citadel.assert_called_once()
        self.assertEqual(self.citadel.call_args.kwargs['room_id'], '!room')
        self.assertIn('example[.]com', self.citadel.call_args.kwargs['content']['formatted_body'])

    def _switch_on_all_channels(self):
        from site_monitoring.models import Subscriber as SiteSubscriber
        user = User.objects.create_user('udrp_recipient', 'udrp@test.com', 'pass')
        SiteSubscriber.objects.create(user_rec=user, email=True)
        for channel in ('slack', 'citadel', 'email'):
            save_setting('udrp_decision', channel, enabled=True)

    def test_a_failing_slack_does_not_stop_citadel_and_email(self):
        self._switch_on_all_channels()
        self.slack.side_effect = RuntimeError('Slack is down')
        self._notify()
        self.citadel.assert_called_once()
        self.email.assert_called_once()

    def test_a_failing_citadel_does_not_stop_email(self):
        self._switch_on_all_channels()
        self.citadel.side_effect = RuntimeError('Citadel is down')
        self._notify()
        self.slack.assert_called_once()
        self.email.assert_called_once()

    def test_email_goes_to_the_site_monitoring_subscribers(self):
        from site_monitoring.models import Subscriber as SiteSubscriber
        user = User.objects.create_user('udrp_recipient', 'udrp@test.com', 'pass')
        SiteSubscriber.objects.create(user_rec=user, email=True)
        save_setting('udrp_decision', 'email', enabled=True)
        self._notify()
        self.email.assert_called_once()
        subject, _body, recipients = self.email.call_args[0][:3]
        self.assertEqual(subject, '[UDRP DECISION] example[.]com')
        self.assertEqual(recipients, ['udrp@test.com'])


migration = importlib.import_module('connectors.migrations.0007_notification_settings_and_events')

# The last migration (3.8.0) of each app before it dropped the slack / citadel / thehive boxes of its subscribers, and the
# migration of 4.0.0 of Connectors that holds the seed. The seed reads those boxes, so it is tested on the schema it was
# written for, not on the current models.
BEFORE_THE_DROP = [
    ('threats_watcher', '0022_watcherconfiguration'),
    ('cyber_watch', '0001_initial'),
    ('data_leak', '0013_alter_keyword_options'),
    ('dns_finder', '0015_remove_dnstwisted_detection_status_alert_comments_and_more'),
    ('site_monitoring', '0035_site_network_history'),
    ('connectors', '0007_notification_settings_and_events'),
]


def _enabled(type_id, channel):
    return NotificationSetting.objects.get(notification_type=type_id, channel=channel).enabled


class SeedTest(TransactionTestCase):
    def setUp(self):
        executor = MigrationExecutor(connection)
        executor.migrate(BEFORE_THE_DROP)
        self.apps = MigrationExecutor(connection).loader.project_state(BEFORE_THE_DROP).apps
        NotificationSetting.objects.all().delete()
        self.user = self.apps.get_model('auth', 'User').objects.create(username='seed_user', email='seed@test.com')

    def tearDown(self):
        executor = MigrationExecutor(connection)
        executor.migrate(executor.loader.graph.leaf_nodes())

    def subscriber(self, app_label, **flags):
        return self.apps.get_model(app_label, 'Subscriber').objects.create(user_rec=self.user, **flags)

    def seed(self):
        migration.seed(self.apps, None)

    def test_one_row_per_supported_pair_all_off_without_subscribers(self):
        self.seed()
        self.assertEqual(NotificationSetting.objects.count(), 52)
        self.assertFalse(NotificationSetting.objects.filter(enabled=True).exists())
        self.assertFalse(NotificationSetting.objects.exclude(selected_fields=None).exists())

    def test_a_channel_is_on_when_a_subscriber_of_the_module_ticked_it(self):
        self.subscriber('data_leak', slack=True, email=True)
        self.seed()
        self.assertTrue(_enabled('data_leak', 'slack'))
        self.assertTrue(_enabled('data_leak_group', 'slack'))
        self.assertTrue(_enabled('data_leak', 'email'))
        self.assertFalse(_enabled('data_leak', 'citadel'))
        self.assertFalse(_enabled('data_leak', 'thehive'))
        self.assertFalse(_enabled('dns_finder', 'slack'))

    def test_threats_watcher_opt_in_flags_are_respected(self):
        self.subscriber(
            'threats_watcher', slack=True, notify_weekly_summary=False, notify_breaking_news=True,
            notify_trendy_words=False, notify_monitored_keywords=True)
        self.seed()
        self.assertFalse(_enabled('threats_watcher_weeklysummary', 'slack'))
        self.assertTrue(_enabled('threats_watcher_breakingnews', 'slack'))
        self.assertTrue(_enabled('threats_watcher', 'slack'))

    def test_cyber_watch_opt_in_flags_are_respected(self):
        self.subscriber('cyber_watch', thehive=True, notify_cve_hits=False)
        self.seed()
        self.assertFalse(_enabled('cyber_watch_cve_hit', 'thehive'))
        self.assertTrue(_enabled('cyber_watch_new_cve', 'thehive'))
        self.assertFalse(_enabled('cyber_watch_new_cve', 'slack'))

    def test_site_monitoring_subscribers_also_seed_udrp(self):
        self.subscriber('site_monitoring', citadel=True)
        self.seed()
        self.assertTrue(_enabled('website_monitoring', 'citadel'))
        self.assertTrue(_enabled('udrp_decision', 'citadel'))

    def test_running_it_twice_changes_nothing(self):
        self.subscriber('data_leak', slack=True)
        self.seed()
        self.seed()
        self.assertEqual(NotificationSetting.objects.count(), 52)

    def test_the_frozen_channel_map_matches_the_catalogue(self):
        frozen = {type_id: set(channels) for type_id, (_, _, channels) in migration.SEEDS.items()}
        # Types added after the seed have no row: they are off until a superuser switches them on
        added_since_seed = {'cyber_watch_cve_exploited', 'page_change', 'article_rule_hit', 'legitimate_domain_expiring', 'legitimate_domain_expiry_regression', 'site_domain_expiring', 'site_domain_available'}
        live = {t.id: set(t.channels) for t in all_types() if t.id not in added_since_seed}
        self.assertEqual(frozen, live)

class TemplateEngineTest(SimpleTestCase):
    def test_variables_and_dotted_names(self):
        ctx = {'a': 'x', 'obj': type('O', (), {'pk': 7})()}
        self.assertEqual(template.render('{a}-{obj.pk}-{missing}', ctx), 'x-7-')

    def test_block_shows_only_when_the_variable_has_a_value(self):
        text = 'A{{#if mx}} MX: {mx}{{/if}}.'
        self.assertEqual(template.render(text, {'mx': 'mx1'}), 'A MX: mx1.')
        for empty in (None, '', '  ', []):
            self.assertEqual(template.render(text, {'mx': empty}), 'A.')
        self.assertEqual(template.render(text, {'mx': 0}), 'A MX: 0.')

    def test_else_and_nesting(self):
        text = '{{#if a}}{{#if b}}ab{{else}}a{{/if}}{{else}}none{{/if}}'
        self.assertEqual(template.render(text, {'a': 1, 'b': 1}), 'ab')
        self.assertEqual(template.render(text, {'a': 1}), 'a')
        self.assertEqual(template.render(text, {}), 'none')

    def test_braces_inside_a_value_are_not_read_again(self):
        self.assertEqual(template.render('{a}', {'a': '{b} {{#if c}}'}), '{b} {{#if c}}')

    def test_validation(self):
        template.validate('{a} {{#if b}}x{{/if}}', {'a', 'b'})
        for bad in ('', '   ', '{{#if a}}', '{{/if}}', '{{else}}', '{nope}', '{{#if nope}}x{{/if}}'):
            with self.assertRaises(ValueError, msg=bad):
                template.validate(bad, {'a', 'b'})
        with self.assertRaises(ValueError):
            template.validate('x' * (template.MAX_LENGTH + 1), set())


class CustomMessageAPITest(APITestCase):
    def setUp(self):
        NotificationSetting.objects.all().delete()
        admin = User.objects.create_superuser('tpl_admin', 'a@test.com', 'password')
        _, token = AuthToken.objects.create(admin)
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token}')

    def _patch(self, type_id, channel, body):
        return self.client.patch(f'{BASE}{type_id}/{channel}/', body, format='json')

    def test_describe_offers_the_default_message_and_the_variables(self):
        channel = self.client.get(BASE).data[0]['channels']['slack']
        self.assertIsNone(channel['template'])
        self.assertTrue(channel['default_template'].startswith('*'))
        self.assertIn('details_url', [v['name'] for v in channel['variables']])

    def test_saving_and_resetting_a_message(self):
        resp = self._patch('cyber_watch_cve_hit', 'slack', {'template': 'Hit {cve_id}{{#if keyword}} on {keyword}{{/if}}'})
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data['channels']['slack']['template'], 'Hit {cve_id}{{#if keyword}} on {keyword}{{/if}}')
        ctx = {'cve_id': 'CVE-1', 'keyword': ''}
        self.assertEqual(render_message('cyber_watch_cve_hit', 'slack', ctx), 'Hit CVE-1')
        self.assertEqual(self._patch('cyber_watch_cve_hit', 'slack', {'template': None}).status_code, 200)
        self.assertIsNone(NotificationSetting.objects.get(notification_type='cyber_watch_cve_hit', channel='slack').custom_template)

    def test_website_monitoring_shows_the_mx_line_only_when_it_changed(self):
        text = 'Site {domain_name_sanitized}{{#if new_mx_records}}\nMX: {old_mx_records} -> {new_mx_records}{{/if}}'
        self.assertEqual(self._patch('website_monitoring', 'slack', {'template': text}).status_code, 200)
        base = {'domain_name_sanitized': 'example[.]com', 'old_mx_records': 'a', 'new_mx_records': None}
        self.assertEqual(render_message('website_monitoring', 'slack', base), 'Site example[.]com')
        base['new_mx_records'] = 'b'
        self.assertEqual(render_message('website_monitoring', 'slack', base), 'Site example[.]com\nMX: a -> b')

    def test_title_and_subject(self):
        self.assertEqual(self._patch('data_leak', 'thehive', {'title': 'Leak {keyword_name}'}).status_code, 200)
        self.assertEqual(render_thehive_title('data_leak', {'keyword_name': 'k', 'alert_pk': 1}), 'Leak k')
        self.assertEqual(self._patch('data_leak', 'email', {'title': 'Subject {alert_pk}'}).status_code, 200)
        self.assertEqual(email_subject('data_leak', {'alert_pk': 9}), 'Subject 9')

    def test_what_cannot_be_saved(self):
        for type_id, channel, body in (
            ('data_leak', 'slack', {'template': '{nope}'}),
            ('data_leak', 'slack', {'template': '{{#if url}}'}),
            ('data_leak', 'slack', {'template': ''}),
            ('data_leak', 'email', {'template': 'body'}),
            ('data_leak', 'slack', {'title': 'x'}),
            ('data_leak', 'thehive', {'title': 'two\nlines'}),
        ):
            resp = self._patch(type_id, channel, body)
            self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST, msg=str(body))
        self.assertFalse(NotificationSetting.objects.exclude(selected_fields=None).exists())
        self.assertFalse(NotificationSetting.objects.filter(custom_template__isnull=False).exists())

    def test_preview_of_an_unsaved_message(self):
        url = f'{BASE}data_leak/thehive/preview/'
        resp = self.client.post(url, {'template': '# {keyword_name}', 'title': 'T {alert_pk}'}, format='json')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['format'], 'markdown')
        self.assertTrue(resp.data['content'].startswith('# '))
        self.assertTrue(resp.data['title'].startswith('T '))
        self.assertEqual(self.client.post(url, {'template': '{nope}'}, format='json').status_code, 400)
        self.assertFalse(NotificationSetting.objects.filter(custom_template__isnull=False).exists())


# TheHive tags
class TagSettingsTest(TestCase):
    """Tags are typed as `a,b,c` but were also saved as the text of a Python list."""

    def _thehive_tags(self, value):
        ConnectorOverride.objects.update_or_create(connector_id='thehive', defaults={'overrides': {'THE_HIVE_TAGS': value}})
        return get_thehive_config()['tags']

    def _misp_tags(self, value):
        ConnectorOverride.objects.update_or_create(connector_id='misp', defaults={'overrides': {'MISP_TAGS': value}})
        return get_misp_config()['tags']

    def test_comma_separated_tags(self):
        self.assertEqual(self._thehive_tags('Watcher,Impersonation,Malicious Domain'),
                         ['Watcher', 'Impersonation', 'Malicious Domain'])

    def test_tags_saved_as_the_text_of_a_list_lose_their_brackets_and_quotes(self):
        self.assertEqual(self._thehive_tags("['Watcher', 'Impersonation', 'Typosquatting']"),
                         ['Watcher', 'Impersonation', 'Typosquatting'])

    def test_no_tags(self):
        self.assertEqual(self._thehive_tags(''), [])
        self.assertEqual(self._thehive_tags('[]'), [])

    def test_misp_reads_tags_the_same_way(self):
        self.assertEqual(self._misp_tags("['Watcher', 'tlp:amber']"), ['Watcher', 'tlp:amber'])


class EnvironmentIgnoredWarningTest(TestCase):
    """The environment seeds a connector once, then the value saved in Connectors wins: when they differ, say it once."""

    FIELD = 'DATA_LEAK_SEARX_URL'

    def setUp(self):
        from connectors import core as connectors_core
        self.core = connectors_core
        self.core._environment_warned.clear()
        self.addCleanup(self.core._environment_warned.clear)

    def _saved(self, value):
        ConnectorOverride.objects.update_or_create(connector_id='searxng', defaults={'overrides': {self.FIELD: value}})

    def _read(self):
        return self.core.get_config_value('searxng', self.FIELD)

    def test_a_different_environment_value_is_reported_once_without_the_values(self):
        self._saved('http://saved.example/')
        with patch.dict('os.environ', {self.FIELD: 'http://secret-user:secret-pw@env.example/'}):
            with self.assertLogs('watcher.connectors', level='WARNING') as logs:
                self.assertEqual(self._read(), 'http://saved.example/')  # the saved value is the one used
                self._read()
                self._read()
        self.assertEqual(len(logs.output), 1, logs.output)
        self.assertIn(self.FIELD, logs.output[0])
        self.assertIn('Connectors > searxng', logs.output[0])
        self.assertNotIn('secret-pw', logs.output[0])
        self.assertNotIn('env.example', logs.output[0])
        self.assertNotIn('saved.example', logs.output[0])

    def test_nothing_is_said_when_both_agree(self):
        self._saved('http://same.example/')
        with patch.dict('os.environ', {self.FIELD: 'http://same.example/'}):
            with self.assertNoLogs('watcher.connectors', level='WARNING'):
                self._read()

    def test_nothing_is_said_when_the_environment_does_not_set_it(self):
        self._saved('http://saved.example/')
        with patch.dict('os.environ', {}, clear=False) as env:
            env.pop(self.FIELD, None)
            with self.assertNoLogs('watcher.connectors', level='WARNING'):
                self._read()

    def test_the_fields_that_hold_a_secret_are_not_compared(self):
        field = {'name': 'SOME_API_KEY', 'settings_key': 'SOME_API_KEY'}
        with patch.dict('os.environ', {'SOME_API_KEY': 'from-env'}):
            with self.assertNoLogs('watcher.connectors', level='WARNING'):
                self.core._warn_if_environment_ignored('x', field, 'something-else')


class ConnectorLogoTest(TestCase):
    """Every connector has its brand image, in the size of the others (the page falls back on an emoji without one)."""

    def folder(self):
        from pathlib import Path
        from django.conf import settings
        return Path(settings.BASE_DIR) / 'frontend' / 'static' / 'frontend' / 'images' / 'connectors'

    def test_every_connector_has_a_png_logo(self):
        from connectors.core import get_all_connectors
        missing = [c['id'] for c in get_all_connectors() if not (self.folder() / f"{c['id']}.png").is_file()]
        self.assertEqual(missing, [], 'drop <id>.png in frontend/static/frontend/images/connectors/')

    def test_the_logos_are_real_pngs_no_bigger_than_the_others(self):
        import struct
        for path in sorted(self.folder().glob('*.png')):
            with self.subTest(logo=path.name):
                data = path.read_bytes()
                self.assertEqual(data[:8], b'\x89PNG\r\n\x1a\n')
                width, height = struct.unpack('>II', data[16:24])
                # 420 pixels at most, 150 kB at most: the page shows them at 72 pixels
                self.assertLessEqual(max(width, height), 420)
                self.assertLessEqual(len(data), 150_000)

    def test_no_logo_is_left_behind_for_a_connector_that_no_longer_exists(self):
        from connectors.core import get_all_connectors
        ids = {c['id'] for c in get_all_connectors()}
        self.assertEqual(sorted(p.stem for p in self.folder().glob('*.png') if p.stem not in ids), [])


class DefaultLLMConfigurationTest(TestCase):
    """Tests for default AI selection exclusivity and API endpoint."""

    def setUp(self):
        import connectors.core as core_mod
        core_mod._REGISTRY = {}
        core_mod._connectors_seeded = False

    def test_default_llm_exclusivity(self):
        """Setting a connector as default AI must automatically unset others."""
        c1 = ConnectorOverride.objects.create(connector_id='openai', is_default_llm=True)
        c2 = ConnectorOverride.objects.create(connector_id='anthropic', is_default_llm=False)
        
        c2.is_default_llm = True
        c2.save()
        
        c1.refresh_from_db()
        self.assertFalse(c1.is_default_llm)
        self.assertTrue(c2.is_default_llm)


class DefaultLLMAPITest(APITestCase):
    """Tests for the set-default-llm REST API endpoint."""

    def setUp(self):
        import connectors.core as core_mod
        core_mod._REGISTRY = {}
        core_mod._connectors_seeded = False

        self.superuser = User.objects.create_superuser('admin_llm', 'admin_llm@test.com', 'password')
        self.regular_user = User.objects.create_user('user_llm', 'user_llm@test.com', 'password')
        _, self.super_token = AuthToken.objects.create(self.superuser)
        _, self.user_token = AuthToken.objects.create(self.regular_user)

    def _auth(self, token):
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token}')

    def test_set_default_llm_requires_superuser(self):
        """Regular users cannot change the default AI."""
        self._auth(self.user_token)
        resp = self.client.post('/api/connectors/openai/set-default-llm/', {'is_default_llm': True}, format='json')
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_set_default_llm_works_for_superuser(self):
        """Superusers can set a connector as the default AI successfully."""
        self._auth(self.super_token)
        resp = self.client.post('/api/connectors/openai/set-default-llm/', {'is_default_llm': True}, format='json')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        
        obj = ConnectorOverride.objects.get(connector_id='openai')
        self.assertTrue(obj.is_default_llm)


class CommonLLMHealthCheckTest(TestCase):
    """common_health_check is shared by every LiteLLM connector (openai, anthropic, gemini, ollama, generic)."""

    DEFINITION = {
        'id': 'openai',
        'name': 'Test Provider',
        'fields': [
            {'name': 'OPENAI_API_KEY', 'label': 'API Key', 'required': True},
            {'name': 'OPENAI_MODEL', 'label': 'Model Name', 'required': True},
            {'name': 'OPENAI_BASE_URL', 'label': 'Base URL', 'required': False},
        ],
    }

    @staticmethod
    def _plain(values):
        return lambda name: values.get(name, '')

    def _run(self, values, **completion_kwargs):
        from connectors.contrib.common_llm import common_health_check
        with patch('connectors.contrib.common_llm.litellm.completion', **completion_kwargs) as mock_completion:
            return common_health_check(self._plain(values), self.DEFINITION), mock_completion

    def test_missing_required_field_does_not_call_the_api(self):
        result, mock_completion = self._run({'OPENAI_API_KEY': 'key'})
        self.assertFalse(result['success'])
        self.assertIn('Model Name', result['message'])
        mock_completion.assert_not_called()

    def test_success_with_valid_response(self):
        result, _ = self._run({'OPENAI_API_KEY': 'key', 'OPENAI_MODEL': 'gpt-test'}, return_value=MagicMock())
        self.assertTrue(result['success'])
        self.assertIn('Test Provider', result['message'])
        self.assertIn('gpt-test', result['message'])

    def test_base_url_is_passed_only_when_set(self):
        _, mock_completion = self._run({'OPENAI_API_KEY': 'key', 'OPENAI_MODEL': 'm'}, return_value=MagicMock())
        self.assertNotIn('api_base', mock_completion.call_args.kwargs)
        _, mock_completion = self._run(
            {'OPENAI_API_KEY': 'key', 'OPENAI_MODEL': 'm', 'OPENAI_BASE_URL': 'http://llm.local'}, return_value=MagicMock()
        )
        self.assertEqual(mock_completion.call_args.kwargs['api_base'], 'http://llm.local')

    def test_empty_response_is_a_failure(self):
        result, _ = self._run({'OPENAI_API_KEY': 'key', 'OPENAI_MODEL': 'm'}, return_value=None)
        self.assertFalse(result['success'])
        self.assertIn('Empty response', result['message'])

    def test_authentication_error_message(self):
        import litellm
        error = litellm.AuthenticationError(message="bad key", llm_provider="openai", model="m")
        result, _ = self._run({'OPENAI_API_KEY': 'key', 'OPENAI_MODEL': 'm'}, side_effect=error)
        self.assertFalse(result['success'])
        self.assertIn('Invalid API Key', result['message'])

    def test_connection_error_message(self):
        import litellm
        error = litellm.APIConnectionError(message="unreachable", llm_provider="openai", model="m")
        result, _ = self._run({'OPENAI_API_KEY': 'key', 'OPENAI_MODEL': 'm'}, side_effect=error)
        self.assertFalse(result['success'])
        self.assertIn('Connection error', result['message'])

    def test_unexpected_error_is_reported(self):
        result, _ = self._run({'OPENAI_API_KEY': 'key', 'OPENAI_MODEL': 'm'}, side_effect=Exception("boom"))
        self.assertFalse(result['success'])
        self.assertIn('boom', result['message'])

    def test_every_llm_connector_delegates_to_common_health_check(self):
        import importlib
        for connector in ('openai', 'anthropic', 'gemini', 'ollama', 'generic_llm_provider'):
            module = importlib.import_module(f'connectors.contrib.{connector}.connector')
            with patch(f'connectors.contrib.{connector}.connector.common_health_check',
                       return_value={'success': True, 'message': 'ok'}) as mock_common:
                result = module.health_check(self._plain({}))
            self.assertTrue(result['success'], connector)
            mock_common.assert_called_once()

    def test_litellm_default_url_is_not_sent(self):
        with patch('connectors.contrib.common_llm.litellm_default_api_base', return_value='https://api.openai.com/v1'):
            _, mock_completion = self._run(
                {'OPENAI_API_KEY': 'key', 'OPENAI_MODEL': 'm', 'OPENAI_BASE_URL': 'https://api.openai.com/v1'},
                return_value=MagicMock(),
            )
        self.assertNotIn('api_base', mock_completion.call_args.kwargs)


class CitadelHealthCheckTest(TestCase):
    """The Citadel health check validates the token with the Matrix whoami endpoint."""

    VALUES = {'CITADEL_URL': 'https://citadel.example/', 'CITADEL_API_TOKEN': 'tok'}

    @staticmethod
    def _plain(values):
        return lambda name: values.get(name, '')

    def _run(self, **get_kwargs):
        from connectors.contrib.citadel.connector import health_check
        with patch('connectors.contrib.citadel.connector.requests.get', **get_kwargs) as mock_get:
            return health_check(self._plain(self.VALUES)), mock_get

    def test_calls_matrix_whoami_with_bearer_token(self):
        _, mock_get = self._run(return_value=MagicMock(status_code=200))
        args, kwargs = mock_get.call_args
        self.assertEqual(args[0], 'https://citadel.example/_matrix/client/r0/account/whoami')
        self.assertEqual(kwargs['headers']['Authorization'], 'Bearer tok')

    def test_success_on_200(self):
        result, _ = self._run(return_value=MagicMock(status_code=200))
        self.assertTrue(result['success'])
        self.assertIn('https://citadel.example', result['message'])

    def test_invalid_token_gives_explicit_message(self):
        result, _ = self._run(return_value=MagicMock(status_code=401))
        self.assertFalse(result['success'])
        self.assertIn('token', result['message'].lower())

    def test_other_http_status_is_reported(self):
        result, _ = self._run(return_value=MagicMock(status_code=404))
        self.assertEqual(result, {'success': False, 'message': 'HTTP 404'})

    def test_network_error_is_reported(self):
        result, _ = self._run(side_effect=Exception('Read timed out'))
        self.assertFalse(result['success'])
        self.assertIn('timed out', result['message'])

    def test_missing_configuration_does_not_call_the_network(self):
        from connectors.contrib.citadel.connector import health_check
        with patch('connectors.contrib.citadel.connector.requests.get') as mock_get:
            result = health_check(self._plain({}))
        self.assertFalse(result['success'])
        mock_get.assert_not_called()


LITELLM_OPENAI_URL = 'https://api.openai.com/v1'


class LiteLLMDefaultBaseUrlTest(TestCase):
    """BASE_URL of an LLM connector falls back to the official API URL known by LiteLLM."""

    def setUp(self):
        core_mod._REGISTRY = {}
        core_mod._connectors_seeded = False
        ConnectorOverride.objects.filter(connector_id='openai').delete()
        patcher = patch.object(core_mod, 'litellm_default_api_base', return_value=LITELLM_OPENAI_URL)
        patcher.start()
        self.addCleanup(patcher.stop)

    def _base_url(self):
        connector = core_mod.get_connector_by_id('openai')
        return next(f for f in connector['fields'] if f['name'] == 'OPENAI_BASE_URL')

    @override_settings(OPENAI_BASE_URL='')
    def test_shows_litellm_default_when_nothing_is_configured(self):
        field = self._base_url()
        self.assertEqual(field['value'], LITELLM_OPENAI_URL)
        self.assertTrue(field['from_default'])

    @override_settings(OPENAI_BASE_URL='https://env.example.com/v1')
    def test_env_value_takes_precedence(self):
        field = self._base_url()
        self.assertEqual(field['value'], 'https://env.example.com/v1')
        self.assertFalse(field['from_default'])

    @override_settings(OPENAI_BASE_URL='')
    def test_manual_value_takes_precedence(self):
        core_mod.save_connector_overrides('openai', {'OPENAI_BASE_URL': 'https://custom.example.com/v1'})
        field = self._base_url()
        self.assertEqual(field['value'], 'https://custom.example.com/v1')
        self.assertFalse(field['from_default'])

    @override_settings(OPENAI_BASE_URL='')
    def test_cleared_value_stays_empty(self):
        core_mod.save_connector_overrides('openai', {'OPENAI_BASE_URL': ''})
        field = self._base_url()
        self.assertEqual(field['value'], '')
        self.assertFalse(field['from_default'])

    @override_settings(OPENAI_BASE_URL='')
    def test_unchanged_default_is_not_stored(self):
        core_mod.save_connector_overrides('openai', {'OPENAI_BASE_URL': LITELLM_OPENAI_URL})
        overrides = ConnectorOverride.objects.get(connector_id='openai').overrides
        self.assertNotIn('OPENAI_BASE_URL', overrides)

    @override_settings(OPENAI_BASE_URL='')
    def test_reset_restores_litellm_default(self):
        core_mod.save_connector_overrides('openai', {'OPENAI_BASE_URL': 'https://custom.example.com/v1'})
        core_mod.reset_connector_field('openai', 'OPENAI_BASE_URL')
        field = self._base_url()
        self.assertEqual(field['value'], LITELLM_OPENAI_URL)
        self.assertTrue(field['from_default'])


class LiteLLMDefaultApiBaseFunctionTest(TestCase):
    """litellm_default_api_base itself, against the installed LiteLLM version."""

    def setUp(self):
        core_mod.litellm_default_api_base.cache_clear()
        self.addCleanup(core_mod.litellm_default_api_base.cache_clear)

    def test_returns_empty_string_when_litellm_lookup_fails(self):
        with patch('litellm.utils.ProviderConfigManager.get_provider_model_info', side_effect=RuntimeError):
            self.assertEqual(core_mod.litellm_default_api_base('openai'), '')


class LLMFieldsTableTest(TestCase):
    """LLM_FIELDS must match the field names declared by each LLM connector."""

    def setUp(self):
        core_mod._REGISTRY = {}
        core_mod._connectors_seeded = False

    def test_llm_fields_match_connector_definitions(self):
        from connectors.contrib.common_llm import LLM_FIELDS
        for connector_id, fields in LLM_FIELDS.items():
            names = {f['name'] for f in get_connector_by_id(connector_id)['fields']}
            for name in fields.values():
                self.assertIn(name, names, f"{connector_id}: field {name} not found")


class RenameLLMFieldsMigrationTest(TestCase):
    """Migration 0006 renames the LLM connector fields stored before 3.8.0."""

    def setUp(self):
        import importlib
        self.migration = importlib.import_module('connectors.migrations.0006_rename_llm_connector_fields')

        class _FakeApps:
            @staticmethod
            def get_model(app_label, model_name):
                return ConnectorOverride

        self.apps = _FakeApps()

    def test_old_names_are_renamed_and_values_kept(self):
        secret = connector_encrypt('sk-old')
        ConnectorOverride.objects.create(
            connector_id='openai',
            overrides={'API_KEY': secret, 'MODEL_NAME': 'openai/gpt-4o-mini', 'BASE_URL': 'https://custom.example.com/v1'},
            auto_seeded_fields=['MODEL_NAME'],
        )
        self.migration.rename_llm_fields(self.apps, None)

        obj = ConnectorOverride.objects.get(connector_id='openai')
        self.assertEqual(obj.overrides, {
            'OPENAI_API_KEY': secret,
            'OPENAI_MODEL': 'openai/gpt-4o-mini',
            'OPENAI_BASE_URL': 'https://custom.example.com/v1',
        })
        self.assertEqual(obj.auto_seeded_fields, ['OPENAI_MODEL'])

    def test_value_already_saved_under_new_name_is_kept(self):
        ConnectorOverride.objects.create(
            connector_id='ollama',
            overrides={'BASE_URL': 'http://old:11434', 'OLLAMA_API_URL': 'http://new:11434'},
        )
        self.migration.rename_llm_fields(self.apps, None)

        obj = ConnectorOverride.objects.get(connector_id='ollama')
        self.assertEqual(obj.overrides, {'OLLAMA_API_URL': 'http://new:11434'})

    def test_reverse_restores_old_names(self):
        ConnectorOverride.objects.create(connector_id='gemini', overrides={'GEMINI_MODEL': 'gemini/gemini-2.5-flash'})
        self.migration.restore_llm_fields(self.apps, None)

        obj = ConnectorOverride.objects.get(connector_id='gemini')
        self.assertEqual(obj.overrides, {'MODEL_NAME': 'gemini/gemini-2.5-flash'})


class ConnectorEventTest(APITestCase):
    """The Deliveries tab: what a connector did, kept by connector, readable by a superuser only."""

    def setUp(self):
        core_mod._REGISTRY = {}
        core_mod._connectors_seeded = False
        self.superuser = User.objects.create_superuser('admin_events', 'admin_events@test.com', 'password')
        self.regular_user = User.objects.create_user('user_events', 'user_events@test.com', 'password')
        _, self.super_token = AuthToken.objects.create(self.superuser)
        _, self.user_token = AuthToken.objects.create(self.regular_user)

    def _auth(self, token):
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token}')

    def test_an_event_is_kept_with_what_it_was_about(self):
        record_event('slack', 'notification', True, '', subject='data_leak', duration=0.4)
        event = ConnectorEvent.objects.get()
        self.assertEqual((event.connector_id, event.kind, event.ok, event.subject), ('slack', 'notification', True, 'data_leak'))

    def test_only_the_last_events_of_a_connector_are_kept_and_the_others_are_left_alone(self):
        record_event('citadel', 'test', True)
        with patch.object(ConnectorEvent, 'KEEP', 3):
            for i in range(5):
                record_event('slack', 'test', True, f'pass {i}')
        self.assertEqual(ConnectorEvent.objects.filter(connector_id='slack').count(), 3)
        self.assertEqual(list(ConnectorEvent.objects.filter(connector_id='slack').values_list('message', flat=True)), ['pass 4', 'pass 3', 'pass 2'])
        self.assertEqual(ConnectorEvent.objects.filter(connector_id='citadel').count(), 1)

    def test_a_journal_that_cannot_be_written_never_stops_what_it_is_a_journal_of(self):
        with patch.object(ConnectorEvent.objects, 'create', side_effect=RuntimeError('database is gone')):
            record_event('slack', 'test', True)  # does not raise

    def test_the_test_button_and_the_weekly_check_are_told_apart(self):
        entry = core_mod._get_registry()['slack']
        with patch.dict(entry, {'health_check': lambda plain: {'success': False, 'message': 'no token'}}):
            test_connector('slack')
            test_connector('slack', kind='health')
        kinds = list(ConnectorEvent.objects.filter(connector_id='slack').order_by('id').values_list('kind', 'ok', 'message'))
        self.assertEqual(kinds, [('test', False, 'no token'), ('health', False, 'no token')])

    def test_the_api_lists_newest_first_and_can_keep_one_kind(self):
        record_event('slack', 'test', True, 'first')
        record_event('slack', 'notification', False, 'failed (timeout)', subject='cyber_watch_new_cve')
        record_event('citadel', 'test', True, 'other connector')
        self._auth(self.super_token)
        events = self.client.get('/api/connectors/slack/deliveries/').json()
        self.assertEqual([e['message'] for e in events], ['failed (timeout)', 'first'])
        self.assertEqual(events[0]['subject'], 'cyber_watch_new_cve')
        only = self.client.get('/api/connectors/slack/deliveries/?kind=test').json()
        self.assertEqual([e['message'] for e in only], ['first'])

    def test_the_api_is_for_a_superuser_and_knows_its_connectors(self):
        self._auth(self.user_token)
        self.assertEqual(self.client.get('/api/connectors/slack/deliveries/').status_code, status.HTTP_403_FORBIDDEN)
        self.client.credentials()
        self.assertIn(self.client.get('/api/connectors/slack/deliveries/').status_code, (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN))
        self._auth(self.super_token)
        self.assertEqual(self.client.get('/api/connectors/nope/deliveries/').status_code, status.HTTP_404_NOT_FOUND)

    def test_a_notification_is_kept_on_the_connector_its_channel_goes_through(self):
        from common.core import _keep_delivery
        _keep_delivery('data_leak', 'email', 'ok', 0.2)
        _keep_delivery('data_leak', 'slack', 'failed (HTTP 500)', None)
        _keep_delivery('data_leak', 'citadel', 'no recipients', None)
        by = {e.connector_id: e for e in ConnectorEvent.objects.all()}
        self.assertTrue(by['smtp'].ok and by['smtp'].message == '' and by['smtp'].subject == 'data_leak')
        self.assertFalse(by['slack'].ok)
        self.assertEqual(by['slack'].message, 'failed (HTTP 500)')
        self.assertTrue(by['citadel'].ok)  # nobody to send to is not a failure of the connector

    def test_the_fields_say_the_setting_they_come_from(self):
        fields = {f['name']: f for f in get_connector_by_id('anthropic')['fields']}
        self.assertEqual(fields['ANTHROPIC_API_KEY']['settings_key'], 'ANTHROPIC_API_KEY')
        self.assertEqual(fields['ANTHROPIC_BASE_URL']['litellm_provider'], 'anthropic')

    def test_an_ai_call_is_kept_with_its_model_whether_it_worked_or_not(self):
        import litellm
        from llm_gateway.router import LLMAuthenticationError
        from llm_gateway.router import LLMRouter
        config = {'api_key': 'k', 'model': 'anthropic/claude-test', 'base_url': ''}
        answer = MagicMock()
        answer.choices = [MagicMock(message=MagicMock(content='a summary'))]
        with patch.object(LLMRouter, '_get_llm_config', return_value=config):
            with patch('litellm.completion', return_value=answer):
                self.assertEqual(LLMRouter()._call_litellm('write', 'anthropic'), 'a summary')
            with patch('litellm.completion', side_effect=litellm.AuthenticationError('bad key', 'anthropic', 'claude')):
                with self.assertRaises(LLMAuthenticationError):
                    LLMRouter()._call_litellm('write', 'anthropic')
        worked, failed = ConnectorEvent.objects.filter(connector_id='anthropic').order_by('id')
        self.assertEqual((worked.kind, worked.ok, worked.subject), ('ai', True, 'anthropic/claude-test'))
        self.assertEqual((failed.kind, failed.ok), ('ai', False))
        self.assertIn('AuthenticationError', failed.message)
