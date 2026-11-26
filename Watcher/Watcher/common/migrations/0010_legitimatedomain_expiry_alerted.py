from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('common', '0009_legitimatedomain_expiry_check'),
    ]

    operations = [
        migrations.AddField(
            model_name='legitimatedomain',
            name='expiry_alerted',
            field=models.DateField(blank=True, editable=False, null=True),
        ),
    ]
