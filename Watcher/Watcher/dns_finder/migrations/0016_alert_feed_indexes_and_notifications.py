"""All the migrations of 4.0.0 for this module, in one (they replace the 2 made while it was prepared)."""
from django.db import migrations, models


class Migration(migrations.Migration):

    replaces = [('dns_finder', '0016_alert_feed_indexes'), ('dns_finder', '0017_remove_subscriber_channel_flags')]

    dependencies = [
        ('connectors', '0007_notification_settings_and_events'),
        ('dns_finder', '0015_remove_dnstwisted_detection_status_alert_comments_and_more'),
    ]

    operations = [
        migrations.AddIndex(
            model_name='alert',
            index=models.Index(fields=['created_at'], name='dns_alert_created_idx'),
        ),
        migrations.AddIndex(
            model_name='alert',
            index=models.Index(fields=['status', 'created_at'], name='dns_alert_status_created_idx'),
        ),
        migrations.AddIndex(
            model_name='alert',
            index=models.Index(fields=['source', 'created_at'], name='dns_alert_source_created_idx'),
        ),
        migrations.RemoveField(
            model_name='subscriber',
            name='citadel',
        ),
        migrations.RemoveField(
            model_name='subscriber',
            name='slack',
        ),
        migrations.RemoveField(
            model_name='subscriber',
            name='thehive',
        ),
    ]
