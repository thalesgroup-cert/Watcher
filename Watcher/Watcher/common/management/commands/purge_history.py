from django.conf import settings
from django.core.management.base import BaseCommand

from common.core import purge_history


class Command(BaseCommand):
    help = (
        'Take out the AI summaries and the activity journal lines older than the retention (SUMMARY_RETENTION_DAYS and '
        'TIMELINE_RETENTION_DAYS, 0 keeps everything): what the scheduled job does every night. The latest summary of each '
        'kind stays. Run it with --dry-run first to see how many would go.'
    )

    def add_arguments(self, parser):
        parser.add_argument('--dry-run', action='store_true', help='count what would be removed, remove nothing')

    def handle(self, *args, dry_run, **options):
        self.stdout.write(
            f"Retention: summaries {settings.SUMMARY_RETENTION_DAYS} days, activity {settings.TIMELINE_RETENTION_DAYS} days (0 = keep)"
        )
        counts = purge_history(dry_run=dry_run)
        verb = 'would be removed' if dry_run else 'removed'
        self.stdout.write(f"{counts['summaries']} summaries and {counts['timeline']} activity lines {verb}")
