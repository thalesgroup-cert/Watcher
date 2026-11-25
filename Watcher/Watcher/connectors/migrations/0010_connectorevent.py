from django.db import migrations, models
import django.utils.timezone


class Migration(migrations.Migration):

    dependencies = [
        ('connectors', '0009_notificationsetting_custom_message'),
    ]

    operations = [
        migrations.CreateModel(
            name='ConnectorEvent',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('connector_id', models.CharField(db_index=True, max_length=100)),
                ('kind', models.CharField(choices=[('test', 'Test'), ('health', 'Weekly check'), ('notification', 'Notification'), ('ai', 'AI call')], max_length=16)),
                ('ok', models.BooleanField()),
                ('message', models.CharField(blank=True, default='', max_length=300)),
                ('subject', models.CharField(blank=True, default='', max_length=150)),
                ('duration', models.FloatField(blank=True, help_text='Seconds', null=True)),
                ('created_at', models.DateTimeField(db_index=True, default=django.utils.timezone.now)),
            ],
            options={
                'verbose_name': 'Connector Event',
                'verbose_name_plural': 'Connector Events',
                'ordering': ['-created_at', '-id'],
                'indexes': [models.Index(fields=['connector_id', '-created_at'], name='connectors__connect_32e28b_idx')],
            },
        ),
    ]
