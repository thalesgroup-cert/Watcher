from unittest.mock import patch

from django.test import TestCase, override_settings
from django.contrib.auth.models import User
from rest_framework.test import APITestCase
from rest_framework import status
from knox.models import AuthToken
from accounts.models import UserProfile, _AVATAR_COLORS
from accounts.serializers import UserProfileSerializer
from accounts.oidc import WatcherOIDCBackend


class UserProfileTest(TestCase):
    """Test UserProfile model and related signals."""

    def test_avatar_color_assigned_on_user_creation(self):
        """Creating a User triggers the signal which assigns an avatar_color."""
        user = User.objects.create_user(
            username='colortest', password='testpass123'
        )
        # Profile should have been created by the signal
        profile = UserProfile.objects.get(user=user)
        self.assertIsNotNone(
            profile.avatar_color,
            "avatar_color should not be None after user creation"
        )
        self.assertIn(
            profile.avatar_color,
            _AVATAR_COLORS,
            f"avatar_color '{profile.avatar_color}' must be one of the palette colours"
        )

    def test_avatar_color_in_serializer(self):
        """UserProfileSerializer must expose the avatar_color field."""
        user = User.objects.create_user(
            username='serializertest', password='testpass123'
        )
        profile = UserProfile.objects.get(user=user)
        serializer = UserProfileSerializer(profile)
        self.assertIn(
            'avatar_color',
            serializer.data,
            "UserProfileSerializer must include avatar_color in its fields"
        )

    def test_ui_preferences_defaults(self):
        """New users get the default typewriter and zoom preferences."""
        user = User.objects.create_user(
            username='uidefaults', password='testpass123'
        )
        profile = UserProfile.objects.get(user=user)
        self.assertTrue(profile.typewriter_enabled)
        self.assertEqual(profile.ui_zoom_level, 1.0)

    def test_ui_preferences_in_serializer(self):
        """UserProfileSerializer must expose typewriter_enabled and ui_zoom_level."""
        user = User.objects.create_user(
            username='uiserializer', password='testpass123'
        )
        profile = UserProfile.objects.get(user=user)
        data = UserProfileSerializer(profile).data
        self.assertIn('typewriter_enabled', data)
        self.assertIn('ui_zoom_level', data)


class ProfileAPITest(APITestCase):
    """Test that UI preferences can be read and updated through the profile API."""

    def setUp(self):
        self.user = User.objects.create_user(username='profileuser', password='testpass123')
        _, token = AuthToken.objects.create(self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token}')

    def test_get_profile_returns_ui_preferences(self):
        response = self.client.get('/api/auth/profile')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data['typewriter_enabled'])
        self.assertEqual(response.data['ui_zoom_level'], 1.0)

    def test_patch_updates_ui_preferences(self):
        response = self.client.patch(
            '/api/auth/profile',
            {'typewriter_enabled': False, 'ui_zoom_level': 0.8},
            format='json'
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        profile = UserProfile.objects.get(user=self.user)
        self.assertFalse(profile.typewriter_enabled)
        self.assertEqual(profile.ui_zoom_level, 0.8)

    def test_profile_requires_auth(self):
        self.client.credentials()
        response = self.client.get('/api/auth/profile')
        self.assertIn(response.status_code, [status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN])


class WatcherOIDCBackendTest(TestCase):
    """Test the OIDC_CREATE_USER toggle on SSO login (see GitHub issue #309)."""

    @override_settings(OIDC_CREATE_USER=False)
    def test_unknown_user_not_created_when_create_user_disabled(self):
        backend = WatcherOIDCBackend()
        claims = {'email': 'unknown@example.com', 'sub': 'unknown-sub'}
        with patch.object(backend, 'get_userinfo', return_value=claims):
            user = backend.get_or_create_user('token', 'id_token', {})
        self.assertIsNone(user)
        self.assertFalse(User.objects.filter(email='unknown@example.com').exists())

    @override_settings(OIDC_CREATE_USER=True)
    def test_unknown_user_created_when_create_user_enabled(self):
        backend = WatcherOIDCBackend()
        claims = {
            'email': 'newuser@example.com',
            'sub': 'new-sub',
            'given_name': 'New',
            'family_name': 'User',
        }
        with patch.object(backend, 'get_userinfo', return_value=claims):
            user = backend.get_or_create_user('token', 'id_token', {})
        self.assertIsNotNone(user)
        self.assertEqual(user.email, 'newuser@example.com')

    @override_settings(OIDC_CREATE_USER=False)
    def test_existing_user_can_still_login_when_create_user_disabled(self):
        User.objects.create_user(username='existing-sub', email='existing@example.com', password='x')
        backend = WatcherOIDCBackend()
        claims = {'email': 'existing@example.com', 'sub': 'existing-sub'}
        with patch.object(backend, 'get_userinfo', return_value=claims):
            user = backend.get_or_create_user('token', 'id_token', {})
        self.assertIsNotNone(user)
        self.assertEqual(user.email, 'existing@example.com')
