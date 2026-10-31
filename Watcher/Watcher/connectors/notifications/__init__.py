"""The notifications Watcher sends: what each one says on each channel, and what the instance has switched on."""
from . import registry
from .catalogue import CHANNELS, EmailSpec, Field, Layout, NotificationType, render_text, render_title
from .registry import all_types, find_type, get_type, register
from .store import (
    UNSET, describe, describe_all, email_subject, get_setting, is_enabled, preview, render_message, render_per_alert,
    render_thehive_title, save_setting, thehive_meta,
)

from . import entries  # noqa: E402,F401  (registers the notification types)
