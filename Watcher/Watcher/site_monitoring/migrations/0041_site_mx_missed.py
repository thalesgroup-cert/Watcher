from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('site_monitoring', '0040_site_domain_expiry_alerted'),
    ]

    operations = [
        migrations.AddField(
            model_name='site',
            name='mx_missed',
            field=models.PositiveSmallIntegerField(default=0, editable=False),
        ),
    ]
