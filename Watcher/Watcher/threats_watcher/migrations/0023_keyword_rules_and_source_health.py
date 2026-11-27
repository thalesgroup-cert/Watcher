"""All the migrations of 4.0.0 for this module, in one (they replace the 3 made while it was prepared)."""
import django.db.models.deletion
import django.utils.timezone
from django.db import migrations, models


def start_the_clock(apps, schema_editor):
    """A source that already answers with an error starts its series at its last check (the 45 days count from there)."""
    Source = apps.get_model('threats_watcher', 'Source')
    Source.objects.exclude(last_status_code=200).exclude(last_status_code=None).exclude(last_checked=None).update(
        failing_since=models.F('last_checked'))


class Migration(migrations.Migration):

    replaces = [('threats_watcher', '0023_remove_subscriber_channel_flags'), ('threats_watcher', '0024_keyword_rules'), ('threats_watcher', '0025_source_failing_since')]

    dependencies = [
        ('connectors', '0007_notification_settings_and_events'),
        ('threats_watcher', '0022_watcherconfiguration'),
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
        migrations.AddField(
            model_name='monitoredkeyword',
            name='all_of',
            field=models.JSONField(blank=True, default=list, help_text='Rule: words that must ALL be in the article'),
        ),
        migrations.AddField(
            model_name='monitoredkeyword',
            name='any_of',
            field=models.JSONField(blank=True, default=list, help_text='Rule: when given, at least one of these must be in the article too'),
        ),
        migrations.AddField(
            model_name='monitoredkeyword',
            name='exceptions',
            field=models.JSONField(blank=True, default=list, help_text='Words whose presence cancels a match'),
        ),
        migrations.AddField(
            model_name='monitoredkeyword',
            name='is_active',
            field=models.BooleanField(default=True),
        ),
        migrations.AddField(
            model_name='monitoredkeyword',
            name='whole_words',
            field=models.BooleanField(default=False, help_text="Match whole words only ('apt' does not match 'adapt')"),
        ),
        migrations.CreateModel(
            name='KeywordHit',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('url', models.URLField(max_length=1000)),
                ('url_hash', models.CharField(max_length=64)),
                ('title', models.CharField(blank=True, default='', max_length=500)),
                ('matched', models.JSONField(default=list)),
                ('hit_at', models.DateTimeField(default=django.utils.timezone.now)),
                ('is_archived', models.BooleanField(default=False)),
                ('keyword', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='hits', to='threats_watcher.monitoredkeyword')),
            ],
            options={
                'ordering': ['-hit_at', '-id'],
                'unique_together': {('keyword', 'url_hash')},
            },
        ),
        migrations.AddField(
            model_name='source',
            name='failing_since',
            field=models.DateTimeField(blank=True, help_text='First error of the current series of errors (empty when the last answer was good)', null=True),
        ),
        migrations.RunPython(
            code=start_the_clock,
            reverse_code=migrations.RunPython.noop,
        ),
    ]
