from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('site_monitoring', '0041_site_mx_missed'),
    ]

    operations = [
        migrations.AddField(
            model_name='site',
            name='comments',
            field=models.TextField(blank=True, max_length=300, null=True),
        ),
    ]
