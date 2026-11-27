"""All the migrations of 4.0.0 for this module, in one (they replace the 4 made while it was prepared)."""
import django.utils.timezone
from django.db import migrations, models
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

    replaces = [('connectors', '0007_notificationsetting'), ('connectors', '0008_seed_notification_settings'), ('connectors', '0009_notificationsetting_custom_message'), ('connectors', '0010_connectorevent')]

    dependencies = [
        ('connectors', '0006_rename_llm_connector_fields'),
        ('cyber_watch', '0001_initial'),
        ('data_leak', '0013_alter_keyword_options'),
        ('dns_finder', '0015_remove_dnstwisted_detection_status_alert_comments_and_more'),
        ('site_monitoring', '0035_site_network_history'),
        ('threats_watcher', '0022_watcherconfiguration'),
    ]

    operations = [
        migrations.CreateModel(
            name='NotificationSetting',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('notification_type', models.CharField(max_length=64)),
                ('channel', models.CharField(max_length=16)),
                ('enabled', models.BooleanField(default=False)),
                ('selected_fields', models.JSONField(blank=True, default=None, null=True)),
            ],
            options={
                'verbose_name': 'Notification Setting',
                'verbose_name_plural': 'Notification Settings',
                'unique_together': {('notification_type', 'channel')},
            },
        ),
        migrations.RunPython(
            code=seed,
            reverse_code=migrations.RunPython.noop,
        ),
        migrations.AddField(
            model_name='notificationsetting',
            name='custom_template',
            field=models.TextField(blank=True, default=None, null=True),
        ),
        migrations.AddField(
            model_name='notificationsetting',
            name='custom_title',
            field=models.CharField(blank=True, default=None, max_length=500, null=True),
        ),
        migrations.CreateModel(
            name='ConnectorEvent',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('connector_id', models.CharField(db_index=True, max_length=100)),
                ('kind', models.CharField(choices=[('test', 'Test'), ('health', 'Weekly check'), ('notification', 'Notification'), ('ai', 'AI call')], max_length=16)),
                ('ok', models.BooleanField()),
                ('message', models.CharField(blank=True, default='', max_length=300)),
                ('subject', models.CharField(blank=True, default='', max_length=150)),
                ('duration', models.FloatField(blank=True, help_text='Seconds', null=True)),
                ('created_at', models.DateTimeField(db_index=True, default=django.utils.timezone.now)),
            ],
            options={
                'verbose_name': 'Connector Event',
                'verbose_name_plural': 'Connector Events',
                'ordering': ['-created_at', '-id'],
                'indexes': [models.Index(fields=['connector_id', '-created_at'], name='connectors__connect_32e28b_idx')],
            },
        ),
    ]
