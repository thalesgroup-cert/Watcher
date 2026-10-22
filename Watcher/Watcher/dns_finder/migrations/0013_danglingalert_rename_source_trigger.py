from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('dns_finder', '0012_dnstwisted_certificate_metadata'),
    ]

    operations = [
        migrations.RenameField(
            model_name='danglingalert',
            old_name='source',
            new_name='trigger',
        ),
    ]
