import importlib
from unittest.mock import patch

from django.apps import apps
from django.test import TestCase, override_settings, SimpleTestCase
from django.contrib.auth.models import User
from rest_framework.test import APIClient, APITestCase
from accounts.models import UserProfile, _AVATAR_COLORS
from accounts.serializers import UserProfileSerializer
from accounts.oidc import WatcherOIDCBackend
from accounts.core import THEME_IDS, AVATAR_STYLES, avatar_of, validate_avatar
from django.contrib.contenttypes.models import ContentType
from timeline.models import TimelineEvent
from timeline.serializers import TimelineEventSerializer


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


class UserThemeTest(TestCase):
    """The theme is chosen per user: one list of ids, blank means not chosen yet."""

    def setUp(self):
        self.user = User.objects.create_user(username='themer', password='testpass123')
        self.profile = UserProfile.objects.get(user=self.user)
        self.client = APIClient()
        self.client.force_authenticate(self.user)

    def test_theme_ids_are_the_eleven_palettes(self):
        self.assertEqual(THEME_IDS, [
            'light', 'paper', 'sunrise', 'darkly', 'graphite', 'midnight',
            'slate', 'high_contrast', 'cyber', 'the_one', 'metal',
        ])

    def test_new_profile_has_no_theme_chosen(self):
        self.assertEqual(self.profile.theme, '')

    def test_patch_saves_a_known_theme(self):
        response = self.client.patch('/api/auth/profile', {'theme': 'midnight'}, format='json')
        self.assertEqual(response.status_code, 200)
        self.profile.refresh_from_db()
        self.assertEqual(self.profile.theme, 'midnight')

    def test_patch_rejects_an_unknown_theme(self):
        response = self.client.patch('/api/auth/profile', {'theme': 'flatly'}, format='json')
        self.assertEqual(response.status_code, 400)
        self.profile.refresh_from_db()
        self.assertEqual(self.profile.theme, '')

    def test_patch_accepts_a_blank_theme(self):
        UserProfile.objects.filter(pk=self.profile.pk).update(theme='paper')
        response = self.client.patch('/api/auth/profile', {'theme': ''}, format='json')
        self.assertEqual(response.status_code, 200)
        self.profile.refresh_from_db()
        self.assertEqual(self.profile.theme, '')

    def test_migration_blanks_legacy_themes_and_keeps_current_ones(self):
        UserProfile.objects.filter(pk=self.profile.pk).update(theme='darkly')
        other = User.objects.create_user(username='keeper', password='testpass123')
        UserProfile.objects.filter(user=other).update(theme='paper')
        migration = importlib.import_module('accounts.migrations.0004_userprofile_theme_not_chosen')
        migration.clear_legacy_themes(apps, None)
        self.profile.refresh_from_db()
        self.assertEqual(self.profile.theme, '')
        self.assertEqual(UserProfile.objects.get(user=other).theme, 'paper')


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


# Avatar of the profile
class ValidateAvatarTest(SimpleTestCase):
    def test_none_goes_back_to_the_coloured_initials(self):
        self.assertIsNone(validate_avatar(None))

    def test_a_good_config_is_kept(self):
        config = {'style': 'bottts', 'seed': 'abc123', 'options': {'primaryColor': ['1e88e5'], 'eyes': ['bulging']}}
        self.assertEqual(validate_avatar(config), config)

    def test_options_are_optional(self):
        self.assertEqual(validate_avatar({'style': 'thumbs', 'seed': 's'}), {'style': 'thumbs', 'seed': 's', 'options': {}})

    def test_every_style_is_accepted(self):
        for style in AVATAR_STYLES:
            validate_avatar({'style': style, 'seed': 'x'})

    def test_what_is_refused(self):
        for bad in (
            'bottts',
            {'style': 'nope', 'seed': 'x'},
            {'style': 'bottts'},
            {'style': 'bottts', 'seed': ''},
            {'style': 'bottts', 'seed': 'x' * 65},
            {'style': 'bottts', 'seed': 'x', 'options': []},
            {'style': 'bottts', 'seed': 'x', 'options': {'a b': ['1']}},
            {'style': 'bottts', 'seed': 'x', 'options': {'eyes': 'bulging'}},
            {'style': 'bottts', 'seed': 'x', 'options': {'eyes': []}},
            {'style': 'bottts', 'seed': 'x', 'options': {'eyes': ['<script>']}},
            {'style': 'bottts', 'seed': 'x', 'options': {'eyes': ['a'] * 13}},
        ):
            with self.assertRaises(ValueError, msg=str(bad)):
                validate_avatar(bad)


class AvatarAPITest(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user('avatar_user', 'a@test.com', 'password')
        self.client = APIClient()
        self.client.force_authenticate(self.user)

    def _fresh(self):
        return User.objects.get(pk=self.user.pk)

    def test_new_profile_has_no_avatar_but_keeps_its_colour(self):
        data = self.client.get('/api/auth/profile').data
        self.assertIsNone(data['avatar'])
        self.assertTrue(data['avatar_color'])

    def test_saving_and_clearing_the_avatar(self):
        config = {'style': 'notionists', 'seed': 'zzz', 'options': {'backgroundColor': ['d1d4f9']}}
        resp = self.client.patch('/api/auth/profile', {'avatar': config}, format='json')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['avatar'], config)
        self.user.profile.refresh_from_db()
        self.assertEqual(self.user.profile.avatar, config)
        self.assertEqual(avatar_of(self._fresh()), config)
        resp = self.client.patch('/api/auth/profile', {'avatar': None}, format='json')
        self.assertEqual(resp.status_code, 200)
        self.assertIsNone(avatar_of(self._fresh()))

    def test_a_bad_avatar_saves_nothing(self):
        resp = self.client.patch('/api/auth/profile', {'avatar': {'style': 'nope', 'seed': 'x'}}, format='json')
        self.assertEqual(resp.status_code, 400)
        self.user.profile.refresh_from_db()
        self.assertIsNone(self.user.profile.avatar)

    def test_changing_the_theme_keeps_the_avatar(self):
        config = {'style': 'thumbs', 'seed': 'k', 'options': {}}
        self.client.patch('/api/auth/profile', {'avatar': config}, format='json')
        self.client.patch('/api/auth/profile', {'theme': 'darkly'}, format='json')
        self.assertEqual(avatar_of(self._fresh()), config)

    def test_other_people_see_it_in_the_activity_feed(self):
        config = {'style': 'shapes', 'seed': 'feed', 'options': {}}
        self.client.patch('/api/auth/profile', {'avatar': config}, format='json')
        event = TimelineEvent.objects.create(user=self.user, action='create', content_type=ContentType.objects.get_for_model(User), object_id=self.user.pk)
        event = TimelineEvent.objects.get(pk=event.pk)
        self.assertEqual(TimelineEventSerializer(event).data['avatar'], config)
