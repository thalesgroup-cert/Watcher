from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('common', '0010_legitimatedomain_expiry_alerted'),
    ]

    operations = [
        migrations.AlterField(
            model_name='pendingaction',
            name='action_type',
            field=models.CharField(choices=[('udrp_transfer', 'UDRP - Transfer domain to Legitimate Domains'), ('connector_health_check', 'Connector - Health check failed'), ('site_domain_available', 'Website Monitoring - Domain now available'), ('legitimate_domain_lost', 'Legitimate Domains - Domain no longer registered')], max_length=50),
        ),
    ]
