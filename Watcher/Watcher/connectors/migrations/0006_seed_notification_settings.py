from django.db import migrations
from django.db.models import Q

CHAT = ('slack', 'citadel', 'email')
ALL = ('slack', 'citadel', 'thehive', 'email')

# type id -> (app that holds the subscribers, opt-in flags of the subscriber: one of them is enough, channels of the type).
# Frozen on purpose: a migration must not follow the catalogue as it changes later.
SEEDS = {
    'threats_watcher': ('threats_watcher', ('notify_trendy_words', 'notify_monitored_keywords'), ALL),
    'threats_watcher_weeklysummary': ('threats_watcher', ('notify_weekly_summary',), CHAT),
    'threats_watcher_breakingnews': ('threats_watcher', ('notify_breaking_news',), CHAT),
    'data_leak': ('data_leak', (), ALL),
    'data_leak_group': ('data_leak', (), CHAT),
    'website_monitoring': ('site_monitoring', (), ALL),
    'udrp_decision': ('site_monitoring', (), CHAT),
    'dns_finder': ('dns_finder', (), ALL),
    'dns_finder_group': ('dns_finder', (), CHAT),
    'dns_finder_dangling': ('dns_finder', (), ALL),
    'dns_finder_cert_transparency': ('dns_finder', (), ('email',)),
    'cyber_watch_new_cve': ('cyber_watch', ('notify_all_cves',), ALL),
    'cyber_watch_cve_hit': ('cyber_watch', ('notify_cve_hits',), ALL),
    'cyber_watch_new_victim': ('cyber_watch', ('notify_all_victims',), ALL),
    'cyber_watch_victim_hit': ('cyber_watch', ('notify_victim_hits',), ALL),
}


def seed(apps, schema_editor):
    """
    Keep today's behaviour: a channel starts on for a notification when at least one subscriber of its module had
    the channel box ticked (and asked for that kind of notification, where the module has such a choice).
    """
    NotificationSetting = apps.get_model('connectors', 'NotificationSetting')
    for type_id, (app_label, opt_in_flags, channels) in SEEDS.items():
        subscribers = apps.get_model(app_label, 'Subscriber').objects.all()
        if opt_in_flags:
            opted_in = Q()
            for flag in opt_in_flags:
                opted_in |= Q(**{flag: True})
            subscribers = subscribers.filter(opted_in)
        for channel in channels:
            NotificationSetting.objects.update_or_create(
                notification_type=type_id, channel=channel,
                defaults={'enabled': subscribers.filter(**{channel: True}).exists()},
            )


class Migration(migrations.Migration):

    dependencies = [
        ('connectors', '0005_notificationsetting'),
        ('threats_watcher', '0020_source_last_checked_source_last_status_code'),
        ('cyber_watch', '0001_initial'),
        ('data_leak', '0013_alter_keyword_options'),
        ('dns_finder', '0016_alert_feed_indexes'),
        ('site_monitoring', '0035_site_network_history'),
    ]

    operations = [
        migrations.RunPython(seed, migrations.RunPython.noop),
    ]
