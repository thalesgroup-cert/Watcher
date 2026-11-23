from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('site_monitoring', '0039_site_domain_expiry_check'),
    ]

    operations = [
        migrations.AddField(
            model_name='site',
            name='domain_expiry_alerted',
            field=models.DateField(blank=True, editable=False, null=True),
        ),
    ]
