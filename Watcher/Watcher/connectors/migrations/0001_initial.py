from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = []

    operations = [
        migrations.CreateModel(
            name='ConnectorOverride',
            fields=[
                ('connector_id', models.CharField(max_length=100, primary_key=True, serialize=False)),
                ('overrides', models.JSONField(blank=True, default=dict)),
            ],
            options={
                'verbose_name': 'Connector Override',
                'verbose_name_plural': 'Connector Overrides',
            },
        ),
    ]
