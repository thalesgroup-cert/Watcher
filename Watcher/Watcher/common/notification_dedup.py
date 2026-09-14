from datetime import timedelta
from django.conf import settings
from django.utils import timezone

from .models import NotificationDedupEntry


def was_recently_notified(app_name, notification_type, dedup_key, window_hours=None):
    """
    Check whether a notification with this exact (app_name, notification_type,
    dedup_key) was already sent within the sliding window.

    :param app_name: App identifier, e.g. 'cyber_watch'.
    :param notification_type: Event sub-type, e.g. 'new_cve', 'cve_hit'.
    :param dedup_key: Stable identity of the real-world entity being notified
        (already normalized by the caller — e.g. a CVE ID or "group::victim").
    :param window_hours: Overrides settings.NOTIFICATION_DEDUP_WINDOW_HOURS.
    :return: True if a matching entry exists within the window.
    :rtype: bool
    """
    window_hours = window_hours if window_hours is not None else settings.NOTIFICATION_DEDUP_WINDOW_HOURS
    threshold = timezone.now() - timedelta(hours=window_hours)
    return NotificationDedupEntry.objects.filter(
        app_name=app_name,
        notification_type=notification_type,
        dedup_key=dedup_key,
        sent_at__gte=threshold,
    ).exists()


def record_notification(app_name, notification_type, dedup_key):
    """
    Record that a notification was sent for this (app_name, notification_type,
    dedup_key), so a subsequent was_recently_notified() call within the window
    skips re-notifying it.
    """
    NotificationDedupEntry.objects.create(
        app_name=app_name,
        notification_type=notification_type,
        dedup_key=dedup_key,
    )
