from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
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
    ]
