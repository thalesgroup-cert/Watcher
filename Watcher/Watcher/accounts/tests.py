import importlib
from unittest.mock import patch

from django.apps import apps
from django.test import RequestFactory, TestCase, override_settings, SimpleTestCase
from django.contrib.auth.models import User
from rest_framework.test import APIClient, APITestCase
from rest_framework import status
from knox.models import AuthToken
from accounts.models import UserProfile, _AVATAR_COLORS
from accounts.serializers import UserProfileSerializer
from accounts.oidc import WatcherOIDCBackend
from accounts.oidc_views import SSOCallbackView
from accounts.core import THEME_IDS, AVATAR_STYLES, KNOX_COOKIE, SESSION_COOKIE, avatar_of, validate_avatar
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


class UserThemeTest(TestCase):
    """The theme is chosen per user: one list of ids, blank means not chosen yet."""

    def setUp(self):
        self.user = User.objects.create_user(username='themer', password='testpass123')
        self.profile = UserProfile.objects.get(user=self.user)
        self.client = APIClient()
        self.client.force_authenticate(self.user)

    def test_theme_ids_are_the_thirteen_palettes(self):
        self.assertEqual(THEME_IDS, [
            'light', 'paper', 'sunrise', 'clay_light', 'darkly', 'clay', 'graphite', 'midnight',
            'slate', 'high_contrast', 'cyber', 'the_one', 'metal',
        ])

    def test_patch_saves_the_effects_level_and_keeps_the_other_preferences(self):
        response = self.client.patch('/api/auth/profile', {'preferences': {'effects': 'calm', 'home': {'blocks': ['kpis']}}}, format='json')
        self.assertEqual(response.status_code, 200)
        self.profile.refresh_from_db()
        self.assertEqual(self.profile.preferences, {'effects': 'calm', 'home': {'blocks': ['kpis']}})

    def test_patch_rejects_an_unknown_effects_level(self):
        response = self.client.patch('/api/auth/profile', {'preferences': {'effects': 'extreme'}}, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertIn('effects', response.json()['preferences'][0] if isinstance(response.json()['preferences'], list) else response.json()['preferences'])

    def test_patch_rejects_preferences_that_are_not_an_object_or_too_large(self):
        self.assertEqual(self.client.patch('/api/auth/profile', {'preferences': ['effects']}, format='json').status_code, 400)
        big = {'home': {'blocks': ['x' * 100] * 100}}
        self.assertEqual(self.client.patch('/api/auth/profile', {'preferences': big}, format='json').status_code, 400)

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
        UserProfile.objects.filter(pk=self.profile.pk).update(theme='yeti')
        other = User.objects.create_user(username='keeper', password='testpass123')
        UserProfile.objects.filter(user=other).update(theme='paper')
        classic = User.objects.create_user(username='classic', password='testpass123')
        UserProfile.objects.filter(user=classic).update(theme='darkly')
        migration = importlib.import_module('accounts.migrations.0009_theme_and_avatar')
        migration.clear_legacy_themes(apps, None)
        self.profile.refresh_from_db()
        self.assertEqual(self.profile.theme, '')
        self.assertEqual(UserProfile.objects.get(user=other).theme, 'paper')
        self.assertEqual(UserProfile.objects.get(user=classic).theme, 'darkly')


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


class KnoxCookieAuthTest(APITestCase):
    """The browser keeps its Knox token in an httpOnly cookie; scripts keep using the Authorization header."""

    def setUp(self):
        self.user = User.objects.create_user(username='cookie-user', password='pass12345')

    def login(self, client=None, **extra):
        client = client or self.client
        return client.post('/api/auth/login', {'username': 'cookie-user', 'password': 'pass12345'}, format='json', **extra)

    def test_login_sets_the_cookie_the_page_cannot_read_and_still_answers_the_token(self):
        response = self.login()
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()['token'])
        token_cookie, indicator = response.cookies[KNOX_COOKIE], response.cookies[SESSION_COOKIE]
        self.assertTrue(token_cookie['httponly'])
        self.assertEqual(token_cookie['samesite'], 'Strict')
        self.assertFalse(indicator['httponly'])
        self.assertEqual(token_cookie.value, response.json()['token'])

    def test_the_cookie_is_secure_only_when_the_request_is(self):
        self.assertFalse(self.login().cookies[KNOX_COOKIE]['secure'])
        self.assertTrue(self.login(secure=True).cookies[KNOX_COOKIE]['secure'])

    def test_the_cookie_alone_authenticates(self):
        self.login()
        response = self.client.get('/api/auth/user')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['username'], 'cookie-user')

    def test_the_header_still_authenticates(self):
        token = AuthToken.objects.create(self.user)[1]
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f'Token {token}')
        self.assertEqual(client.get('/api/auth/user').status_code, 200)

    def test_a_cookie_the_server_does_not_know_is_a_visitor_and_does_not_lock_the_sign_in(self):
        self.client.cookies[KNOX_COOKIE] = 'a' * 64
        self.assertEqual(self.client.get('/api/auth/user').status_code, 401)
        self.assertEqual(self.client.get('/api/overview/').status_code, 200)
        self.assertEqual(self.login().status_code, 200)

    def test_a_request_that_changes_something_needs_the_csrf_token_with_the_cookie(self):
        client = APIClient(enforce_csrf_checks=True)
        self.login(client)
        client.cookies['csrftoken'] = 'x' * 32
        refused = client.post('/api/auth/logout/')
        self.assertEqual(refused.status_code, 403)
        self.assertIn('CSRF', str(refused.json()))
        accepted = client.post('/api/auth/logout/', HTTP_X_CSRFTOKEN='x' * 32)
        self.assertEqual(accepted.status_code, 204)

    def test_logout_clears_the_cookies_and_deletes_the_token(self):
        response = self.login()
        token = response.json()['token']
        out = self.client.post('/api/auth/logout/')
        self.assertEqual(out.status_code, 204)
        self.assertEqual(out.cookies[KNOX_COOKIE].value, '')
        self.assertEqual(out.cookies[SESSION_COOKIE].value, '')
        replay = APIClient()
        replay.credentials(HTTP_AUTHORIZATION=f'Token {token}')
        self.assertEqual(replay.get('/api/auth/user').status_code, 401)

    def test_logout_with_the_header_answers_what_it_answered_before(self):
        token = AuthToken.objects.create(self.user)[1]
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f'Token {token}')
        self.assertEqual(client.post('/api/auth/logout/').status_code, 204)
        self.assertEqual(client.get('/api/auth/user').status_code, 401)

    def test_logoutall_ends_every_session_of_the_user(self):
        AuthToken.objects.create(self.user)
        self.login()
        self.assertEqual(self.client.post('/api/auth/logoutall/').status_code, 204)
        self.assertFalse(AuthToken.objects.filter(user=self.user).exists())

    def test_the_page_comes_with_the_csrf_cookie(self):
        self.assertIn('csrftoken', self.client.get('/').cookies)

    def test_the_sso_callback_hands_the_token_in_the_cookie_and_not_in_the_address(self):
        view = SSOCallbackView()
        view.request = RequestFactory().get('/api/auth/oidc/callback/')
        view.user = self.user
        response = view.login_success()
        self.assertEqual(response.url, '/?sso=1')
        self.assertTrue(response.cookies[KNOX_COOKIE]['httponly'])
        self.assertEqual(AuthToken.objects.filter(user=self.user).count(), 1)
