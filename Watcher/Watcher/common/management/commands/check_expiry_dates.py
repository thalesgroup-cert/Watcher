import time

from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from common.models import LegitimateDomain
from common.utils import expiry_check


# What the registry said when it gave no date (see RDAPDiscovery.status)
RDAP_STATUS_TEXT = {
    'not_found': 'not registered: the registry says it does not exist',
    'unsupported': 'no RDAP server for this extension',
    'rate_limited': 'the registry asked to slow down',
    'error': 'no answer',
}


class Command(BaseCommand):
    help = (
        "Compare the expiry date Watcher keeps for legitimate domains with what their registry (RDAP) answers now. "
        "Read-only: nothing is written. Use it to see why a domain shows as Expired when it still belongs to you."
    )

    def add_arguments(self, parser):
        parser.add_argument('domains', nargs='*', help='Domains to check (a domain that is not in Watcher is checked too).')
        parser.add_argument('--all', action='store_true', help='Check every legitimate domain (one lookup each, slow).')
        parser.add_argument('--expired', action='store_true',
                            help='Check only the legitimate domains Watcher shows as expired: the likely wrong ones.')
        parser.add_argument('--delay', type=float, default=1.0, help='Seconds between two domains (default 1).')

    def handle(self, *args, **options):
        today = timezone.now().date()
        if options['all']:
            domains = list(LegitimateDomain.objects.order_by('domain_name').values_list('domain_name', flat=True))
        elif options['expired']:
            domains = list(LegitimateDomain.objects.filter(expiry__lt=today).order_by('domain_name')
                           .values_list('domain_name', flat=True))
        elif options['domains']:
            domains = [d.strip().lower() for d in options['domains']]
        else:
            raise CommandError('Give some domains, or --all, or --expired.')

        rows = list(LegitimateDomain.objects.filter(domain_name__in=domains).values_list('domain_name', 'expiry', 'expiry_pending'))
        stored = {name: expiry for name, expiry, _ in rows}
        waiting = {name: pending for name, _, pending in rows if pending}
        counts = {}
        problems = []
        for index, domain in enumerate(domains):
            if index and options['delay']:
                time.sleep(options['delay'])
            found = expiry_check.lookup(domain)
            code, text, source = expiry_check.verdict(stored.get(domain), found['rdap'], today)
            counts[code] = counts.get(code, 0) + 1
            line = (f"{domain}: stored={stored.get(domain) or '-'}"
                    # An earlier date a registry gave once: the job keeps the stored date until a second pass confirms it
                    + (f" (waiting for confirmation: {waiting[domain]})" if domain in waiting else '')
                    + f"  rdap={found['rdap'] or '-'}"
                    + ('' if found['rdap'] else ' (' + RDAP_STATUS_TEXT.get(found.get('rdap_status'), 'answered, no expiry date' if found['rdap_source'] else 'no answer')
                       + (f": {found['rdap_detail']}" if found.get('rdap_detail') else '') + ')')
                    + f"  -> {code}: {text}")
            style = self.style.SUCCESS if code == expiry_check.OK else (self.style.ERROR if code == expiry_check.EXPIRED_BUT_REGISTERED else self.style.WARNING)
            self.stdout.write(style(line))
            if code in (expiry_check.EXPIRED_BUT_REGISTERED, expiry_check.STALE):
                problems.append(domain)
        self.stdout.write('')
        self.stdout.write(f"{len(domains)} domain(s) checked: " + ', '.join(f"{n} {code}" for code, n in sorted(counts.items())))
        if problems:
            self.stdout.write(self.style.ERROR("To correct: " + ', '.join(problems)
                                               + " (the job 'RDAP lookup for legitimate domains' rewrites them every 30 minutes when the registry answers)."))
