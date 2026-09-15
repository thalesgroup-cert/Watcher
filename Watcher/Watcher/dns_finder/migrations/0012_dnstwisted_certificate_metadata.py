from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('dns_finder', '0011_alert_source'),
    ]

    operations = [
        migrations.AddField(
            model_name='dnstwisted', name='issuer',
            field=models.CharField(blank=True, max_length=255, null=True),
        ),
        migrations.AddField(
            model_name='dnstwisted', name='san_list',
            field=models.JSONField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='dnstwisted', name='not_before',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='dnstwisted', name='not_after',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='dnstwisted', name='serial_number',
            field=models.CharField(blank=True, max_length=100, null=True),
        ),
        migrations.AddField(
            model_name='dnstwisted', name='fingerprint_sha256',
            field=models.CharField(blank=True, max_length=100, null=True),
        ),
    ]
