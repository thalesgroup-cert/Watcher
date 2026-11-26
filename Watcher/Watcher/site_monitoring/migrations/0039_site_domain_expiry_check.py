from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('site_monitoring', '0038_page_screenshots'),
    ]

    operations = [
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
    ]
