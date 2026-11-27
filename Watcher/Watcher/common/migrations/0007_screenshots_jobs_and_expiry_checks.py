"""All the migrations of 4.0.0 for this module, in one (they replace the 7 made while it was prepared)."""
import django.db.models.deletion
import django.utils.timezone
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    replaces = [('common', '0007_screenshot'), ('common', '0008_legitimatedomain_expiry_pending'), ('common', '0009_legitimatedomain_expiry_check'), ('common', '0010_legitimatedomain_expiry_alerted'), ('common', '0011_alter_pendingaction_action_type'), ('common', '0012_jobrun'), ('common', '0013_alter_pendingaction_action_type')]

    dependencies = [
        ('common', '0006_alter_pendingaction_action_type'),
    ]

    operations = [
        migrations.CreateModel(
            name='Screenshot',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('target', models.CharField(max_length=60)),
                ('target_id', models.PositiveIntegerField()),
                ('url', models.URLField(max_length=1000)),
                ('image', models.BinaryField()),
                ('size', models.PositiveIntegerField(default=0)),
                ('created_at', models.DateTimeField(default=django.utils.timezone.now)),
                ('taken_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='+', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'ordering': ['-created_at', '-id'],
                'indexes': [models.Index(fields=['target', 'target_id'], name='common_scre_target_1e2536_idx')],
            },
        ),
        migrations.AddField(
            model_name='legitimatedomain',
            name='expiry_pending',
            field=models.DateField(blank=True, editable=False, null=True),
        ),
        migrations.AddField(
            model_name='legitimatedomain',
            name='expiry_pending_at',
            field=models.DateTimeField(blank=True, editable=False, null=True),
        ),
        migrations.AddField(
            model_name='legitimatedomain',
            name='expiry_pending_source',
            field=models.CharField(blank=True, editable=False, max_length=10, null=True),
        ),
        migrations.AddField(
            model_name='legitimatedomain',
            name='expiry_check',
            field=models.CharField(blank=True, editable=False, max_length=16, null=True),
        ),
        migrations.AddField(
            model_name='legitimatedomain',
            name='expiry_checked_at',
            field=models.DateTimeField(blank=True, editable=False, null=True),
        ),
        migrations.AddField(
            model_name='legitimatedomain',
            name='expiry_source',
            field=models.CharField(blank=True, editable=False, max_length=10, null=True),
        ),
        migrations.AddField(
            model_name='legitimatedomain',
            name='expiry_alerted',
            field=models.DateField(blank=True, editable=False, null=True),
        ),
        migrations.CreateModel(
            name='JobRun',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('job', models.CharField(db_index=True, help_text='app.function of the job, e.g. threats_watcher.main_watch', max_length=100)),
                ('label', models.CharField(help_text='Name of the job as the interface shows it', max_length=150)),
                ('started_at', models.DateTimeField(db_index=True)),
                ('duration', models.FloatField(help_text='Seconds')),
                ('failed', models.BooleanField(default=False)),
                ('counts', models.JSONField(blank=True, default=dict, help_text="What the job counted, e.g. {'feeds': 217}")),
                ('error', models.CharField(blank=True, default='', max_length=300)),
            ],
            options={
                'ordering': ['-started_at', '-id'],
                'indexes': [models.Index(fields=['job', '-started_at'], name='common_jobr_job_4c3a14_idx')],
            },
        ),
        migrations.AlterField(
            model_name='pendingaction',
            name='action_type',
            field=models.CharField(choices=[('udrp_transfer', 'UDRP - Transfer domain to Legitimate Domains'), ('connector_health_check', 'Connector - Health check failed'), ('site_domain_available', 'Website Monitoring - Domain now available'), ('legitimate_domain_lost', 'Legitimate Domains - Domain no longer registered'), ('source_failing', 'RSS source - Failing for weeks')], max_length=50),
        ),
    ]
