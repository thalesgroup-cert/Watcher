"""All the migrations of 4.0.0 for this module, in one (they replace the 2 made while it was prepared)."""
from django.db import migrations, models


# The themes the picker offers (accounts.core.THEME_CHOICES when this migration was written). Any other value is a
# former Bootswatch id and is cleared; 'darkly' and 'slate' stay, they are still offered.
CURRENT_THEMES = [
    'light', 'paper', 'sunrise', 'darkly', 'graphite', 'midnight',
    'slate', 'high_contrast', 'cyber', 'the_one', 'metal', 'clay', 'clay_light',
]


def clear_legacy_themes(apps, schema_editor):
    UserProfile = apps.get_model('accounts', 'UserProfile')
    UserProfile.objects.exclude(theme__in=CURRENT_THEMES).update(theme='')


class Migration(migrations.Migration):

    replaces = [('accounts', '0009_userprofile_theme_not_chosen'), ('accounts', '0010_userprofile_avatar')]

    dependencies = [
        ('accounts', '0008_remove_userprofile_preferred_llm'),
    ]

    operations = [
        migrations.AlterField(
            model_name='userprofile',
            name='theme',
            field=models.CharField(blank=True, default='', max_length=50),
        ),
        migrations.RunPython(
            code=clear_legacy_themes,
            reverse_code=migrations.RunPython.noop,
        ),
        migrations.AddField(
            model_name='userprofile',
            name='avatar',
            field=models.JSONField(blank=True, default=None, null=True),
        ),
    ]
