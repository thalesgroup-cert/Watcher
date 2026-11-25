import re

from knox.auth import TokenAuthentication
from rest_framework import exceptions
from rest_framework.authentication import CSRFCheck

# The themes a user can pick, in the order the profile page shows them. The ids and labels are the ones of
# frontend/src/styles/themes.ts: change both together.
THEME_CHOICES = [
    ('light', 'Light'),
    ('paper', 'Paper'),
    ('sunrise', 'Sunrise'),
    ('clay_light', 'Clay Light'),
    ('darkly', 'Darkly'),
    ('clay', 'Clay'),
    ('graphite', 'Graphite'),
    ('midnight', 'Midnight'),
    ('slate', 'Slate'),
    ('high_contrast', 'High contrast'),
    ('cyber', 'Cyber'),
    ('the_one', 'The One'),
    ('metal', 'Metal'),
]

THEME_IDS = [theme_id for theme_id, _ in THEME_CHOICES]

# How much the themes with a backdrop (Clay) move: the ids of frontend/src/styles/effects.ts.
EFFECT_LEVELS = ('full', 'calm', 'off')
# The preferences of an account are a small JSON document the interface keeps (effects, blocks of the home page...)
MAX_PREFERENCES_BYTES = 8 * 1024

# The avatar a user builds on their profile: a DiceBear style, a seed and options, drawn by the browser.
# The keys of frontend/src/features/auth/avatar.ts: change both together.
AVATAR_STYLES = ('bottts', 'identicon', 'initials', 'avataaars', 'funEmoji', 'thumbs', 'shapes', 'notionists')

MAX_SEED_LENGTH = 64
MAX_OPTIONS = 40
MAX_VALUES_PER_OPTION = 12
_OPTION_KEY = re.compile(r'^[A-Za-z][A-Za-z0-9]{0,39}$')
# A palette colour (hex, no #) or the name of a part ("variant01", "happy").
_OPTION_VALUE = re.compile(r'^[A-Za-z0-9_-]{1,40}$')


def validate_avatar(value):
    """The avatar config to store, or None to go back to the coloured initials. ValueError for anything else."""
    if value is None:
        return None
    if not isinstance(value, dict):
        raise ValueError("The avatar must be an object")
    style = value.get('style')
    if style not in AVATAR_STYLES:
        raise ValueError(f"Unknown avatar style: {style!r}")
    seed = value.get('seed')
    if not isinstance(seed, str) or not seed.strip() or len(seed) > MAX_SEED_LENGTH:
        raise ValueError(f"The seed must be a text of 1 to {MAX_SEED_LENGTH} characters")
    options = value.get('options')
    if options is None:
        options = {}
    if not isinstance(options, dict) or len(options) > MAX_OPTIONS:
        raise ValueError("The options must be an object")
    clean = {}
    for key, values in options.items():
        if not isinstance(key, str) or not _OPTION_KEY.match(key):
            raise ValueError(f"Invalid option name: {key!r}")
        if not isinstance(values, list) or not values or len(values) > MAX_VALUES_PER_OPTION:
            raise ValueError(f"Option '{key}' must be a short list of values")
        if not all(isinstance(v, str) and _OPTION_VALUE.match(v) for v in values):
            raise ValueError(f"Option '{key}' has an invalid value")
        clean[key] = values
    return {'style': style, 'seed': seed, 'options': clean}


def avatar_of(user):
    """The avatar config of a user, or None (no profile, or still the coloured initials)."""
    try:
        return user.profile.avatar or None
    except Exception:
        return None


# The Knox token of the browser is kept in a cookie the page cannot read, so that a script injected in a page cannot steal it.
# `session_active` only tells the page that there is a session (the interface asks for the user when it is there).
KNOX_COOKIE = 'knox_token'
SESSION_COOKIE = 'session_active'


class KnoxCookieAuthentication(TokenAuthentication):
    """
    The Knox token read from the httpOnly cookie. Without the cookie (a script, an API key) the next class tries the
    `Authorization` header. A cookie the server does not know any more is a visitor, not a refusal, otherwise it would
    lock its owner out of the sign-in page. As a cookie is sent by the browser on its own, a request that changes something
    must carry the CSRF token, as for a session.
    """

    def authenticate(self, request):
        token = request.COOKIES.get(KNOX_COOKIE)
        if not token:
            return None
        try:
            user_auth = self.authenticate_credentials(token.encode('utf-8'))
        except exceptions.AuthenticationFailed:
            return None
        self.enforce_csrf(request)
        return user_auth

    @staticmethod
    def enforce_csrf(request):
        check = CSRFCheck(lambda request: None)
        check.process_request(request)
        reason = check.process_view(request, None, (), {})
        if reason:
            raise exceptions.PermissionDenied(f'CSRF Failed: {reason}')


def set_auth_cookies(request, response, token):
    """The token cookie and the session indicator, kept as long as the token lives; Secure when the request came in HTTPS."""
    from django.conf import settings
    ttl = settings.REST_KNOX.get('TOKEN_TTL')
    options = {'max_age': int(ttl.total_seconds()) if ttl else None, 'secure': request.is_secure(), 'samesite': 'Strict', 'path': '/'}
    response.set_cookie(KNOX_COOKIE, token, httponly=True, **options)
    response.set_cookie(SESSION_COOKIE, '1', httponly=False, **options)


def clear_auth_cookies(response):
    for name in (KNOX_COOKIE, SESSION_COOKIE):
        response.delete_cookie(name, path='/', samesite='Strict')
