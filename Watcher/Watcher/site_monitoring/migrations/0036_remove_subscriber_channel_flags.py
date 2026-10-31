from django.db import migrations


class Migration(migrations.Migration):
    """
    Slack, Citadel and TheHive are set once for the instance (Connectors > Notifications); only the e-mail box stays on
    the subscriber. connectors.0006 still reads these boxes to build those instance settings, so it must run first.
    """

    dependencies = [
        ('site_monitoring', '0035_site_network_history'),
        ('connectors', '0006_seed_notification_settings'),
    ]

    operations = [
        migrations.RemoveField(model_name='subscriber', name='citadel'),
        migrations.RemoveField(model_name='subscriber', name='slack'),
        migrations.RemoveField(model_name='subscriber', name='thehive'),
    ]
