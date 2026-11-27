"""All the migrations of 4.0.0 for this module, in one (they replace the 1 made while it was prepared)."""
from django.db import migrations


class Migration(migrations.Migration):


    dependencies = [
        ('connectors', '0007_notification_settings_and_events'),
        ('data_leak', '0013_alter_keyword_options'),
    ]

    operations = [
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
