"""All the migrations of 4.0.0 for this module, in one (they replace the 7 made while it was prepared)."""
import django.db.models.deletion
import django.utils.timezone
from django.db import migrations, models


class Migration(migrations.Migration):

    replaces = [('site_monitoring', '0036_remove_subscriber_channel_flags'), ('site_monitoring', '0037_monitored_pages'), ('site_monitoring', '0038_page_screenshots'), ('site_monitoring', '0039_site_domain_expiry_check'), ('site_monitoring', '0040_site_domain_expiry_alerted'), ('site_monitoring', '0041_site_mx_missed'), ('site_monitoring', '0042_site_comments')]

    dependencies = [
        ('connectors', '0007_notification_settings_and_events'),
        ('site_monitoring', '0035_site_network_history'),
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
        migrations.CreateModel(
            name='MonitoredPage',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('url', models.URLField(max_length=700, unique=True)),
                ('name', models.CharField(blank=True, default='', max_length=150)),
                ('css_selector', models.CharField(blank=True, default='', help_text="Only the text of this part of the page is compared (e.g. 'article', '#content'); empty: the whole page", max_length=200)),
                ('ignore_patterns', models.TextField(blank=True, default='', help_text='One regular expression per line: matching text is ignored (counters, dates…)')),
                ('threshold', models.PositiveSmallIntegerField(default=5, help_text='Share of the text (in %) that has to change for a notification')),
                ('check_interval', models.PositiveIntegerField(default=60, help_text='Minutes between two checks')),
                ('retention', models.PositiveIntegerField(default=50, help_text='Number of versions kept')),
                ('is_active', models.BooleanField(default=True)),
                ('last_checked', models.DateTimeField(blank=True, null=True)),
                ('last_status', models.IntegerField(blank=True, help_text='HTTP status of the last check, None: unreachable', null=True)),
                ('last_changed', models.DateTimeField(blank=True, null=True)),
                ('created_at', models.DateTimeField(default=django.utils.timezone.now)),
                ('capture_screenshots', models.BooleanField(default=True, help_text='Take a screenshot of the page at each new version (needs the screenshot service)')),
            ],
            options={
                'ordering': ['name', 'url'],
            },
        ),
        migrations.CreateModel(
            name='PageVersion',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('created_at', models.DateTimeField(default=django.utils.timezone.now)),
                ('text', models.TextField()),
                ('content_hash', models.CharField(max_length=64)),
                ('size', models.PositiveIntegerField(default=0)),
                ('change_ratio', models.FloatField(blank=True, null=True)),
                ('notified', models.BooleanField(default=False)),
                ('page', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='versions', to='site_monitoring.monitoredpage')),
            ],
            options={
                'ordering': ['-created_at', '-id'],
            },
        ),
        migrations.CreateModel(
            name='PageScreenshot',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('image', models.BinaryField()),
                ('size', models.PositiveIntegerField(default=0)),
                ('created_at', models.DateTimeField(default=django.utils.timezone.now)),
                ('version', models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name='screenshot', to='site_monitoring.pageversion')),
            ],
        ),
        migrations.AddField(
            model_name='site',
            name='domain_expiry_pending',
            field=models.DateField(blank=True, editable=False, null=True),
        ),
        migrations.AddField(
            model_name='site',
            name='domain_expiry_pending_source',
            field=models.CharField(blank=True, editable=False, max_length=10, null=True),
        ),
        migrations.AddField(
            model_name='site',
            name='domain_expiry_pending_at',
            field=models.DateTimeField(blank=True, editable=False, null=True),
        ),
        migrations.AddField(
            model_name='site',
            name='domain_expiry_source',
            field=models.CharField(blank=True, editable=False, max_length=10, null=True),
        ),
        migrations.AddField(
            model_name='site',
            name='domain_expiry_checked_at',
            field=models.DateTimeField(blank=True, editable=False, null=True),
        ),
        migrations.AddField(
            model_name='site',
            name='domain_expiry_check',
            field=models.CharField(blank=True, editable=False, max_length=16, null=True),
        ),
        migrations.AddField(
            model_name='site',
            name='domain_expiry_alerted',
            field=models.DateField(blank=True, editable=False, null=True),
        ),
        migrations.AddField(
            model_name='site',
            name='mx_missed',
            field=models.PositiveSmallIntegerField(default=0, editable=False),
        ),
        migrations.AddField(
            model_name='site',
            name='comments',
            field=models.TextField(blank=True, max_length=300, null=True),
        ),
    ]
