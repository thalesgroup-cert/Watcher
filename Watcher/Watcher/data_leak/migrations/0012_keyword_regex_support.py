# Generated manually for regex support enhancement

from django.db import migrations, models
import data_leak.models


class Migration(migrations.Migration):

    dependencies = [
        ('data_leak', '0011_alter_subscriber_options_subscriber_citadel_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='keyword',
            name='is_regex',
            field=models.BooleanField(default=False, verbose_name='Use as Regex Pattern'),
        ),
        migrations.AddField(
            model_name='keyword',
            name='regex_pattern',
            field=models.CharField(
                blank=True, 
                help_text='Optional regex pattern. If provided and "Use as Regex Pattern" is checked, this will be used instead of the name field.', 
                max_length=500, 
                null=True, 
                validators=[data_leak.models.validate_regex], 
                verbose_name='Regex Pattern'
            ),
        ),
        migrations.AlterField(
            model_name='keyword',
            name='name',
            field=models.CharField(max_length=100, unique=True),
        ),
        migrations.AlterModelOptions(
            name='keyword',
            options={'ordering': ['name'], 'verbose_name_plural': 'Keywords Monitored'},
        ),
    ]