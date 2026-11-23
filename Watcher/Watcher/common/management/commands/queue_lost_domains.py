from django.core.management.base import BaseCommand

from common.models import LegitimateDomain, PendingAction
from common.utils import registration_actions
from common.utils.rdap import has_subdomain


class Command(BaseCommand):
    help = (
        "Legitimate domains the registry says do not exist, and for which no one has been asked yet: they were found "
        "'not registered' before Watcher queued such domains for a decision. Without --apply it only lists them; with --apply "
        "each one is queued in Pending actions (approving moves it to Website Monitoring, rejecting keeps it)."
    )

    def add_arguments(self, parser):
        parser.add_argument('--apply', action='store_true', help='Queue the domains in Pending actions (without it: only the list).')

    def handle(self, *args, **options):
        decided = {
            pa.metadata.get('domain_id')
            for pa in PendingAction.objects.filter(action_type=registration_actions.DOMAIN_LOST)
        }
        domains = [
            d for d in LegitimateDomain.objects.filter(expiry_check='not_registered').order_by('domain_name')
            if d.pk not in decided and not has_subdomain(d.domain_name)
        ]
        for domain in domains:
            self.stdout.write(f"{domain.domain_name}\t{domain.ticket_id or '-'}\t{'repurchased' if domain.repurchased else '-'}")
        self.stdout.write(f"{len(domains)} domain(s) the registry does not know and nobody has been asked about.")
        if not options['apply']:
            self.stdout.write("Nothing was written. Run again with --apply to queue them in Pending actions.")
            return
        queued = sum(1 for domain in domains if registration_actions.queue_domain_lost(domain))
        self.stdout.write(f"{queued} queued in Pending actions.")
