from django.core import signing
from django.db import migrations


def _is_sensitive(field_name: str) -> bool:
    # Duplicated from connectors.core._is_sensitive: migrations must not
    # import application code that can change shape over time.
    substrings = ('password', 'secret', 'token', 'key', 'api_key', '_pw', '_pass')
    lower = field_name.lower()
    return any(s in lower for s in substrings)


def reencrypt_with_fernet(apps, schema_editor):
    from cryptography.fernet import Fernet
    from django.conf import settings

    ConnectorOverride = apps.get_model('connectors', 'ConnectorOverride')
    fernet = Fernet(settings.CONNECTORS_ENCRYPTION_KEY)

    for obj in ConnectorOverride.objects.all():
        changed = False
        for name, value in list(obj.overrides.items()):
            if not value or not _is_sensitive(name):
                continue
            try:
                plaintext = signing.loads(value, salt='connectors')
            except signing.BadSignature:
                # Already migrated (or not a legacy signed value) - leave as-is.
                continue
            obj.overrides[name] = fernet.encrypt(plaintext.encode()).decode()
            changed = True
        if changed:
            obj.save(update_fields=['overrides'])


def reverse_noop(apps, schema_editor):
    # Rolling back a key-format migration isn't meaningful; the previous
    # signing-based format is insecure by design (see the encryption change
    # this migration is part of) and shouldn't be restored.
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('connectors', '0003_connectoroverride_auto_seeded_fields'),
    ]

    operations = [
        migrations.RunPython(reencrypt_with_fernet, reverse_noop),
    ]
