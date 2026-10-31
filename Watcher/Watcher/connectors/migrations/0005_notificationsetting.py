from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('connectors', '0004_reencrypt_sensitive_fields_with_fernet'),
    ]

    operations = [
        migrations.CreateModel(
            name='NotificationSetting',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('notification_type', models.CharField(max_length=64)),
                ('channel', models.CharField(max_length=16)),
                ('enabled', models.BooleanField(default=False)),
                ('selected_fields', models.JSONField(blank=True, default=None, null=True)),
            ],
            options={
                'verbose_name': 'Notification Setting',
                'verbose_name_plural': 'Notification Settings',
                'unique_together': {('notification_type', 'channel')},
            },
        ),
    ]
