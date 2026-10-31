from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('timeline', '0001_initial'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddIndex(
            model_name='timelineevent',
            index=models.Index(fields=['timestamp'], name='timeline_ev_ts_idx'),
        ),
        migrations.AddIndex(
            model_name='timelineevent',
            index=models.Index(fields=['user', 'timestamp'], name='timeline_ev_user_ts_idx'),
        ),
    ]
