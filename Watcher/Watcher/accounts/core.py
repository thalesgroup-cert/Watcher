import re

# The themes a user can pick, in the order the profile page shows them. The ids and labels are the ones of
# frontend/src/styles/themes.ts: change both together.
THEME_CHOICES = [
    ('light', 'Light'),
    ('paper', 'Paper'),
    ('sunrise', 'Sunrise'),
    ('darkly', 'Darkly'),
    ('graphite', 'Graphite'),
    ('midnight', 'Midnight'),
    ('slate', 'Slate'),
    ('high_contrast', 'High contrast'),
    ('cyber', 'Cyber'),
    ('the_one', 'The One'),
    ('metal', 'Metal'),
]

THEME_IDS = [theme_id for theme_id, _ in THEME_CHOICES]

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
