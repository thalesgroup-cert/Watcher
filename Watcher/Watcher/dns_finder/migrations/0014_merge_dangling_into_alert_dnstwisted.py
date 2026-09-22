from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('dns_finder', '0013_danglingalert_rename_source_trigger'),
    ]

    operations = [
        migrations.RemoveField(
            model_name='danglingsubdomain',
            name='dns_monitored',
        ),
        migrations.AlterModelOptions(
            name='alert',
            options={'ordering': ['-created_at'], 'verbose_name': 'Alert', 'verbose_name_plural': 'Alerts'},
        ),
        migrations.AlterModelOptions(
            name='dnstwisted',
            options={'ordering': ['-created_at'], 'verbose_name': 'Detected Domain', 'verbose_name_plural': 'Detected Domains'},
        ),
        migrations.AlterModelOptions(
            name='subscriber',
            options={'verbose_name': 'Subscriber', 'verbose_name_plural': 'Subscribers'},
        ),
        migrations.RemoveField(
            model_name='dnstwisted',
            name='fingerprint_sha256',
        ),
        migrations.RemoveField(
            model_name='dnstwisted',
            name='not_after',
        ),
        migrations.RemoveField(
            model_name='dnstwisted',
            name='not_before',
        ),
        migrations.RemoveField(
            model_name='dnstwisted',
            name='serial_number',
        ),
        migrations.AddField(
            model_name='alert',
            name='trigger',
            field=models.CharField(blank=True, max_length=50, null=True),
        ),
        migrations.AddField(
            model_name='dnstwisted',
            name='cname_target',
            field=models.CharField(blank=True, max_length=255, null=True),
        ),
        migrations.AddField(
            model_name='dnstwisted',
            name='detection_status',
            field=models.CharField(blank=True, choices=[('pending', 'Pending check'), ('ok', 'OK'), ('dangling_suspected', 'Dangling suspected'), ('dangling_confirmed', 'Dangling confirmed'), ('resolved', 'Resolved'), ('false_positive', 'False positive')], max_length=20, null=True),
        ),
        migrations.AddField(
            model_name='dnstwisted',
            name='http_status_code',
            field=models.IntegerField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='dnstwisted',
            name='last_checked_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='dnstwisted',
            name='provider',
            field=models.CharField(blank=True, max_length=100, null=True),
        ),
        migrations.AlterField(
            model_name='alert',
            name='source',
            field=models.CharField(choices=[('dnstwist', 'Dnstwist Algorithm'), ('certstream_keyword', 'Certificate Transparency Stream'), ('subdomain_takeover', 'Subdomain Takeover Detection')], default='certstream_keyword', max_length=30),
        ),
        migrations.DeleteModel(
            name='DanglingAlert',
        ),
        migrations.DeleteModel(
            name='DanglingSubdomain',
        ),
    ]
