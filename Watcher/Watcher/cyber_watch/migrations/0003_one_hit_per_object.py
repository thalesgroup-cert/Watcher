from django.db import migrations, models


def merge_hits(apps, schema_editor):
    """
    A rule that matched an object on several keywords left one hit per keyword: the same CVE twice, for "NetScaler" and for
    "Citrix". One hit per rule and object now, with the list of its keywords. The oldest hit is kept (with the date of the
    first one), it is still to review while any of the merged ones was, and the others are removed.
    """
    Hit = apps.get_model('cyber_watch', 'WatchRuleHit')
    groups = {}
    for hit in Hit.objects.order_by('id'):
        groups.setdefault((hit.rule_id, hit.hit_type, hit.object_id), []).append(hit)
    for hits in groups.values():
        keep = hits[0]
        keywords = []
        for hit in hits:
            if hit.matched_keyword and hit.matched_keyword not in keywords:
                keywords.append(hit.matched_keyword)
        keep.matched_keywords = keywords
        keep.hit_at = min(hit.hit_at for hit in hits)
        keep.is_archived = all(hit.is_archived for hit in hits)
        keep.save(update_fields=['matched_keywords', 'hit_at', 'is_archived'])
        Hit.objects.filter(pk__in=[hit.pk for hit in hits[1:]]).delete()


def first_keyword(apps, schema_editor):
    """Back to one keyword per hit: the first one (the others cannot be told apart any more)."""
    Hit = apps.get_model('cyber_watch', 'WatchRuleHit')
    for hit in Hit.objects.all():
        hit.matched_keyword = (hit.matched_keywords or [''])[0][:200]
        hit.save(update_fields=['matched_keyword'])


class Migration(migrations.Migration):

    dependencies = [
        ('cyber_watch', '0002_remove_subscriber_channel_flags'),
    ]

    operations = [
        migrations.AddField(
            model_name='watchrulehit',
            name='matched_keywords',
            field=models.JSONField(default=list),
        ),
        migrations.RunPython(merge_hits, first_keyword),
        migrations.AlterUniqueTogether(
            name='watchrulehit',
            unique_together={('rule', 'hit_type', 'object_id')},
        ),
        # Reversible: the column comes back with an empty default, then is filled from the keywords
        migrations.AlterField(
            model_name='watchrulehit',
            name='matched_keyword',
            field=models.CharField(default='', max_length=200),
        ),
        migrations.RemoveField(
            model_name='watchrulehit',
            name='matched_keyword',
        ),
    ]
