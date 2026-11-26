from django.conf import settings
from django.core.management.base import BaseCommand

from cyber_watch.core import purge_old_data


class Command(BaseCommand):
    help = (
        'Take out the CVEs and the ransomware victims older than the retention (CYBER_WATCH_CVE_RETENTION_DAYS and '
        'CYBER_WATCH_VICTIM_RETENTION_DAYS, 0 keeps everything): what the scheduled job does every night. The CVEs exploited in the '
        'wild and what a watch rule matched stay. Run it with --dry-run first to see how many would go.'
    )

    def add_arguments(self, parser):
        parser.add_argument('--dry-run', action='store_true', help='count what would be removed, remove nothing')

    def handle(self, *args, dry_run, **options):
        self.stdout.write(
            f"Retention: CVEs {settings.CYBER_WATCH_CVE_RETENTION_DAYS} days, victims {settings.CYBER_WATCH_VICTIM_RETENTION_DAYS} days (0 = keep)"
        )
        counts = purge_old_data(dry_run=dry_run)
        verb = 'would be removed' if dry_run else 'removed'
        self.stdout.write(f"{counts['cves']} CVEs and {counts['victims']} ransomware victims {verb}")
