# Generated manually on 2026-04-29

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('site_monitoring', '0032_alert_new_ssl_expiry_alert_old_ssl_expiry_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='site',
            name='udrp_status',
            field=models.CharField(
                blank=True,
                null=True,
                max_length=20,
                choices=[
                    ('pending', 'Pending'),
                    ('won', 'Won (transferred/cancelled)'),
                    ('lost', 'Lost'),
                    ('unknown', 'Unknown'),
                ],
                help_text='UDRP case status - populated automatically when legal_team=True.',
            ),
        ),
        migrations.AddField(
            model_name='site',
            name='udrp_last_checked',
            field=models.DateTimeField(
                blank=True,
                null=True,
                help_text='Timestamp of the last automatic UDRP status check.',
            ),
        ),
    ]
