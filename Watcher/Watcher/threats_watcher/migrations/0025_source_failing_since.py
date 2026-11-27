from django.db import migrations, models


def start_the_clock(apps, schema_editor):
    """A source that already answers with an error starts its series at its last check (the 45 days count from there)."""
    Source = apps.get_model('threats_watcher', 'Source')
    Source.objects.exclude(last_status_code=200).exclude(last_status_code=None).exclude(last_checked=None).update(
        failing_since=models.F('last_checked'))


class Migration(migrations.Migration):

    dependencies = [
        ('threats_watcher', '0024_keyword_rules'),
    ]

    operations = [
        migrations.AddField(
            model_name='source',
            name='failing_since',
            field=models.DateTimeField(blank=True, help_text='First error of the current series of errors (empty when the last answer was good)', null=True),
        ),
        migrations.RunPython(start_the_clock, migrations.RunPython.noop),
    ]
