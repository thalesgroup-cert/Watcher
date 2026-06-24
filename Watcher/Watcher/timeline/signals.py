from django.db.models.signals import pre_save, post_save, post_delete
from django.dispatch import receiver
from django.contrib.contenttypes.models import ContentType

from .middleware import get_current_user
from .models import TimelineEvent

# Fields to track per model
TRACKED_FIELDS = {
    'common.legitimatedomain': [
        'domain_name', 'ticket_id', 'contact', 'expiry', 'ssl_expiry',
        'domain_created_at', 'repurchased', 'comments', 'misp_event_uuid',
    ],
    'threats_watcher.source': ['url', 'confident', 'country', 'country_code'],
    'threats_watcher.monitoredkeyword': ['name', 'level', 'threshold'],
    'threats_watcher.bannedword': ['name'],
    'cyber_watch.watchrule': ['name', 'keywords', 'exceptions', 'scope', 'is_active'],
    'data_leak.keyword': ['name', 'is_regex'],
    'site_monitoring.site': [
        'domain_name', 'ticket_id', 'legitimacy', 'takedown_request', 'legal_team',
        'blocking_request', 'expiry', 'ip_monitoring', 'mail_monitoring',
        'content_monitoring', 'monitored', 'udrp_status',
    ],
    'dns_finder.dnsmonitored': ['domain_name'],
    'dns_finder.keywordmonitored': ['name'],
}

_pre_save_cache = {}


def _get_field_value(instance, field_name):
    value = getattr(instance, field_name, None)
    if hasattr(value, 'isoformat'):
        return value.isoformat()
    return value


def _model_label(instance):
    return f'{instance._meta.app_label}.{instance._meta.model_name}'


def connect_tracking(sender):
    """Register pre_save / post_save / post_delete signals for a given model class."""

    @receiver(pre_save, sender=sender, weak=False)
    def capture_old_values(instance, **kwargs):
        label = _model_label(instance)
        if label not in TRACKED_FIELDS or not instance.pk:
            return
        try:
            old = sender.objects.get(pk=instance.pk)
            _pre_save_cache[(label, instance.pk)] = {
                f: _get_field_value(old, f) for f in TRACKED_FIELDS[label]
            }
        except sender.DoesNotExist:
            pass

    @receiver(post_save, sender=sender, weak=False)
    def record_save(instance, created, **kwargs):
        label = _model_label(instance)
        if label not in TRACKED_FIELDS:
            return

        user = get_current_user()
        ct = ContentType.objects.get_for_model(instance)

        if created:
            TimelineEvent.objects.create(
                content_type=ct,
                object_id=instance.pk,
                action=TimelineEvent.ACTION_CREATED,
                user=user,
                diff={},
                object_repr=str(instance),
            )
        else:
            old_values = _pre_save_cache.pop((label, instance.pk), {})
            diff = {}
            for field in TRACKED_FIELDS[label]:
                new_val = _get_field_value(instance, field)
                old_val = old_values.get(field)
                if old_val != new_val:
                    diff[field] = {'old': old_val, 'new': new_val}

            if diff:
                TimelineEvent.objects.create(
                    content_type=ct,
                    object_id=instance.pk,
                    action=TimelineEvent.ACTION_UPDATED,
                    user=user,
                    diff=diff,
                    object_repr=str(instance),
                )

    @receiver(post_delete, sender=sender, weak=False)
    def record_delete(instance, **kwargs):
        label = _model_label(instance)
        if label not in TRACKED_FIELDS:
            return

        user = get_current_user()
        ct = ContentType.objects.get_for_model(instance)

        TimelineEvent.objects.create(
            content_type=ct,
            object_id=instance.pk,
            action=TimelineEvent.ACTION_DELETED,
            user=user,
            diff={},
            object_repr=str(instance),
        )
