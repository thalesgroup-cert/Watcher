"""What every notification says on every channel, and which parts of it a superuser can choose."""
import re
from dataclasses import dataclass, field
from typing import Callable

from .template import has_value, resolve

CHANNELS = ('slack', 'citadel', 'thehive', 'email')
# Channels whose message is assembled from fields (email keeps its own HTML layout).
TEXT_CHANNELS = ('slack', 'citadel', 'thehive')
# The connector that carries each channel: its status and health are shown next to the switch.
CHANNEL_CONNECTORS = {'slack': 'slack', 'citadel': 'citadel', 'thehive': 'thehive', 'email': 'smtp'}


@dataclass(frozen=True)
class Field:
    """One line of a message. A channel the field has no line for does not show it."""
    id: str
    label: str
    slack: str | None = None
    citadel: str | None = None
    thehive: str | None = None
    required: bool = False
    # A line that is left out of the message when the value it shows is missing.
    optional: bool = False

    def line(self, channel):
        return getattr(self, channel, None)


@dataclass(frozen=True)
class Layout:
    """Message of one channel: `head`, then one line per selected field, then `tail`. TheHive also has a `title`."""
    head: str
    tail: str = ''
    title: str = ''


@dataclass(frozen=True)
class EmailSpec:
    """Subject of the email (a format string) and a function that builds the sample body with the existing template."""
    subject: str
    sample_body: Callable[[dict], str]


@dataclass(frozen=True)
class NotificationType:
    id: str
    label: str
    module: str
    url_suffix: str
    sample: Callable[[], dict]
    fields: tuple = ()
    layouts: dict = field(default_factory=dict)
    email: EmailSpec | None = None
    thehive_meta: dict = field(default_factory=dict)
    # DNS Finder opens one TheHive alert per alert of a group notification, with its own fixed description.
    thehive_per_alert: Layout | None = None

    @property
    def channels(self):
        found = [c for c in TEXT_CHANNELS if c in self.layouts]
        if self.email:
            found.append('email')
        return tuple(found)

    def fields_for(self, channel):
        return tuple(f for f in self.fields if f.line(channel) is not None)

    def default_fields(self, channel):
        return [f.id for f in self.fields_for(channel)]


_PLACEHOLDER = re.compile(r'\{([A-Za-z_][\w.]*)\}')
# What the modules put in a message when they have nothing to say.
_NO_VALUE = ('', 'none', 'n/a', 'unknown', '-')


def _is_blank(line, ctx):
    """True when every value a line shows is missing (a line with no value at all is never blank)."""
    names = _PLACEHOLDER.findall(line)
    if not names:
        return False
    for name in names:
        value = resolve(ctx, name)
        if has_value(value) and str(value).strip().lower() not in _NO_VALUE:
            return False
    return True


def render_text(ntype, channel, ctx, selected=None):
    """Message of a type on a text channel. `selected` are the field ids to show (None: every field)."""
    layout = ntype.layouts[channel]
    # Without a link to the object itself, a message links to the page of its module
    ctx = {'object_url': ctx.get('details_url'), **ctx}
    ids = ntype.default_fields(channel) if selected is None else selected
    lines = ''.join(f.line(channel) for f in ntype.fields_for(channel)
                    if f.id in ids and not (f.optional and _is_blank(f.line(channel), ctx)))
    # One format call over the whole text: values that contain braces are inserted as they are.
    return (layout.head + lines + layout.tail).format(**ctx)


def render_title(ntype, ctx):
    return ntype.layouts['thehive'].title.format(**ctx)
