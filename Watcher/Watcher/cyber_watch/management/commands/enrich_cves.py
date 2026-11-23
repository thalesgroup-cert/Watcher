import time

from django.core.management.base import BaseCommand
from django.utils import timezone

from cyber_watch.core import enrich_batch
from cyber_watch.models import CVEAlert


class Command(BaseCommand):
    help = (
        'Ask the CVE source again for the CVEs that have no score yet (the fetch job does a few at every pass; this catches up '
        'the whole list at once). One request per CVE, with a pause between them: the source is a public service, and when it '
        'says "too many requests" the command waits as long as it asks, then goes on.'
    )

    def add_arguments(self, parser):
        parser.add_argument('--batch', type=int, default=25, help='CVEs asked before the next report (default 25)')
        parser.add_argument('--pause', type=float, default=0.6, help='seconds between two requests (default 0.6)')
        parser.add_argument('--max', type=int, default=0, help='stop after this many CVEs (default: all of them)')

    def handle(self, *args, batch, pause, max, **options):
        started = timezone.now()
        todo = CVEAlert.objects.filter(cvss_score__isnull=True)
        self.stdout.write(f'{todo.count()} CVEs without a score')
        asked = scored = 0
        # A CVE asked during this run (whatever the answer) is not asked again: the loop ends when none is left
        while (not max or asked < max) and todo.filter(fetched_at__lt=started).exists():
            before = todo.filter(fetched_at__lt=started).count()
            # No more than what is left to ask: a longer batch would come back to the CVEs asked a moment ago
            step = min(batch, before, max - asked) if max else min(batch, before)
            done, wait = enrich_batch(limit=step, pause=pause)
            scored += done
            asked += before - todo.filter(fetched_at__lt=started).count()
            self.stdout.write(f'  {asked} asked, {scored} scored so far')
            if wait:
                self.stdout.write(f'  the source asks to wait {wait} s')
                time.sleep(wait)
        left = todo.count()
        self.stdout.write(self.style.SUCCESS(f'Done: {scored} CVEs scored, {left} still without a score (not scored by the source yet)'))
