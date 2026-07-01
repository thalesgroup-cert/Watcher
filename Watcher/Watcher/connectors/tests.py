from unittest.mock import patch, MagicMock

from django.test import TestCase
from django.contrib.auth.models import User
from rest_framework.test import APITestCase
from rest_framework import status
from knox.models import AuthToken

from connectors.models import ConnectorOverride
from connectors.core import (
    get_all_connectors,
    get_connector_by_id,
    connector_exists,
    save_connector_overrides,
    get_connector_count,
    test_connector,
    connector_encrypt,
    connector_decrypt,
    _compute_status,
)


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
    """connector_encrypt / connector_decrypt round-trip and warning on bad signature."""

    def test_roundtrip(self):
        plain = 'super-secret-value'
        encrypted = connector_encrypt(plain)
        self.assertNotEqual(encrypted, plain)
        self.assertEqual(connector_decrypt(encrypted), plain)

    def test_decrypt_bad_signature_returns_raw_and_logs_warning(self):
        with self.assertLogs('watcher.connectors', level='WARNING') as cm:
            result = connector_decrypt('not-a-valid-signed-value')
        self.assertEqual(result, 'not-a-valid-signed-value')
        self.assertTrue(any('decryption failed' in msg for msg in cm.output))


class CoreAPITest(TestCase):
    """Tests for core.py public functions — uses the real plugin registry."""

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
    """_compute_status derives connected/partial/disabled from required fields."""

    def test_no_required_fields_is_connected(self):
        definition = {'fields': [{'name': 'X', 'required': False}]}
        self.assertEqual(_compute_status(definition, {'X': ''}), 'connected')

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

    def test_all_required_fields_filled_is_connected(self):
        definition = {'fields': [
            {'name': 'A', 'required': True},
            {'name': 'B', 'required': True},
        ]}
        self.assertEqual(_compute_status(definition, {'A': 'value', 'B': 'value'}), 'connected')


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
    """REST API endpoint tests — superuser restriction, list, retrieve, patch, test."""

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
