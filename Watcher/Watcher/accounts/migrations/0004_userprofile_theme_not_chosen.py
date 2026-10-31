from django.db import migrations, models

# The themes the picker offers. Any other value is a former Bootswatch id and is cleared.
CURRENT_THEMES = [
    'light', 'paper', 'sunrise', 'graphite', 'midnight',
    'slate', 'high_contrast', 'cyber', 'the_one', 'metal',
]


def clear_legacy_themes(apps, schema_editor):
    UserProfile = apps.get_model('accounts', 'UserProfile')
    UserProfile.objects.exclude(theme__in=CURRENT_THEMES).update(theme='')


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0003_userprofile_avatar_color'),
    ]

    operations = [
        migrations.AlterField(
            model_name='userprofile',
            name='theme',
            field=models.CharField(blank=True, default='', max_length=50),
        ),
        migrations.RunPython(clear_legacy_themes, migrations.RunPython.noop),
    ]
