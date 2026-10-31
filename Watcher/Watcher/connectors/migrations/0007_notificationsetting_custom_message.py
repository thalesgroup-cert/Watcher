from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('connectors', '0006_seed_notification_settings'),
    ]

    operations = [
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
    ]
