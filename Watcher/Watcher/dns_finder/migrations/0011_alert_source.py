from django.db import migrations, models


def backfill_alert_source(apps, schema_editor):
    """
    Heuristic backfill for pre-existing rows: a populated DnsTwisted.fuzzer
    can only come from the dnstwist engine (print_callback never sets it),
    so anything with a fuzzer is 'dnstwist' and everything else is
    'certstream_keyword'. Two bulk UPDATEs, no per-row Python loop.
    """
    Alert = apps.get_model('dns_finder', 'Alert')
    Alert.objects.filter(dns_twisted__fuzzer__isnull=False).exclude(
        dns_twisted__fuzzer=''
    ).update(source='dnstwist')
    Alert.objects.filter(
        models.Q(dns_twisted__fuzzer__isnull=True) | models.Q(dns_twisted__fuzzer='')
    ).update(source='certstream_keyword')


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('dns_finder', '0010_danglingsubdomain_danglingalert'),
    ]

    operations = [
        migrations.AddField(
            model_name='alert',
            name='source',
            field=models.CharField(
                choices=[('dnstwist', 'Dnstwist Algorithm'), ('certstream_keyword', 'Certificate Transparency Stream')],
                default='certstream_keyword',
                max_length=30,
            ),
        ),
        migrations.RunPython(backfill_alert_source, noop_reverse),
    ]
