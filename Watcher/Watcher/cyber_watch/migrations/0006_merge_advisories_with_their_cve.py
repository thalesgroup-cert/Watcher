import re

from django.db import migrations

EMBEDDED = re.compile(r'CVE-\d{4}-\d{4,}', re.I)


def merge(apps, schema_editor):
    """
    An advisory whose id holds a CVE ("DEBIAN-CVE-2026-1234") is that CVE, seen by someone else: it must not be counted
    twice. When the CVE is already there the advisory is merged into it (it only gives what the CVE lacks), else the
    advisory becomes the CVE. The watch rule hits that pointed at the advisory follow.
    """
    CVE = apps.get_model('cyber_watch', 'CVEAlert')
    Hit = apps.get_model('cyber_watch', 'WatchRuleHit')
    for advisory in CVE.objects.exclude(cve_id__startswith='CVE-').order_by('id'):
        found = EMBEDDED.search(advisory.cve_id)
        if not found:
            continue
        old_id, real_id = advisory.cve_id, found.group(0).upper()
        real = CVE.objects.filter(cve_id=real_id).first()
        if real is None:
            advisory.cve_id = real_id
            advisory.save(update_fields=['cve_id'])
        else:
            for field in ('description', 'cvss_score', 'severity', 'published', 'epss', 'epss_percentile'):
                if getattr(real, field) in (None, '') and getattr(advisory, field) not in (None, ''):
                    setattr(real, field, getattr(advisory, field))
            real.exploited = real.exploited or advisory.exploited
            real.save()
            advisory.delete()
        for hit in Hit.objects.filter(hit_type='cve', object_id=old_id):
            twin = Hit.objects.filter(rule_id=hit.rule_id, hit_type='cve', object_id=real_id).first()
            if twin:
                twin.matched_keywords = twin.matched_keywords + [k for k in hit.matched_keywords if k not in twin.matched_keywords]
                twin.is_archived = twin.is_archived and hit.is_archived
                twin.save(update_fields=['matched_keywords', 'is_archived'])
                hit.delete()
            else:
                hit.object_id = real_id
                hit.save(update_fields=['object_id'])


class Migration(migrations.Migration):

    dependencies = [
        ('cyber_watch', '0005_subscriber_notify_exploited_cves'),
    ]

    operations = [
        # Nothing to undo: the merged advisories are not brought back
        migrations.RunPython(merge, migrations.RunPython.noop),
    ]
