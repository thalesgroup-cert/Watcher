"""
Actions that wait for a person when the registry stops knowing a domain Watcher follows (Pending actions):

  - a monitored website whose domain goes from registered to not registered: approving moves its legitimacy to the matching
    "available/disabled" level (the domain is free to register, and its owner is gone);
  - a legitimate domain that goes from registered to not registered (a lost domain): approving moves it to Website Monitoring,
    so that a re-registration by someone else is seen, and removes it from Legitimate Domains.

Both are queued once the registry said so on two passes of the job (see `site_monitoring.core._record_not_registered` and
`common.core._record_domain_not_registered`). Between the request and the approval the domain may be registered again: the
action then does nothing and says so.
"""
import logging

from django.db import transaction

from common.utils import auto_comments

logger = logging.getLogger('watcher.common')

SITE_AVAILABLE = 'site_domain_available'
DOMAIN_LOST = 'legitimate_domain_lost'

# Registered -> available/disabled, in the levels of Site.legitimacy; the others have no "available" twin
AVAILABLE_LEVEL = {5: 6, 3: 4}
# Where a lost legitimate domain goes: "Suspicious, likely harmful (available/disabled)"
LOST_DOMAIN_LEVEL = 4

REGISTERED_CHECKS = ('ok', 'contradicted', 'no_date')  # the registry answered with a record


def domain_was_registered(obj, prefix='expiry'):
    """
    The registry has known this domain: it answered with a record (with or without a date), or the registry gave its date.
    A domain that never was registered has nothing to announce when the registry says it does not exist.
    """
    return getattr(obj, f'{prefix}_check') in REGISTERED_CHECKS or getattr(obj, f'{prefix}_source') == 'RDAP'


def _already_queued(action_type, key, value):
    from common.models import PendingAction
    return any(pa.metadata.get(key) == value for pa in PendingAction.objects.filter(action_type=action_type, status='pending'))


def _level_labels():
    from site_monitoring.models import Site
    return dict(Site._meta.get_field('legitimacy').choices)


# A monitored website whose domain is now available

def queue_site_available(site):
    """Queue the action for a monitored website whose domain is no longer registered. None when one already waits."""
    from common.models import PendingAction
    if _already_queued(SITE_AVAILABLE, 'site_id', site.pk):
        return None
    labels = _level_labels()
    new = AVAILABLE_LEVEL.get(site.legitimacy)
    if new:
        effect = f"Approving moves its legitimacy from '{labels[site.legitimacy]}' to '{labels[new]}'."
    else:
        effect = (f"Its legitimacy ('{labels.get(site.legitimacy, 'Unknown')}') has no \"available\" level: approving only "
                  "acknowledges it and changes nothing.")
    action = PendingAction.objects.create(
        action_type=SITE_AVAILABLE,
        title=f"Domain available: {site.domain_name}",
        description=(f"The registry no longer knows {site.domain_name}, a domain of Website Monitoring that was registered "
                     f"until now (it said so on two checks in a row).\n\n{effect}\n\n"
                     "Register the domain yourself if you want to keep it out of the attacker's hands."),
        metadata={'site_id': site.pk, 'domain_name': site.domain_name, 'legitimacy': site.legitimacy, 'new_legitimacy': new,
                  'last_registrar': site.registrar, 'last_expiry': site.domain_expiry.isoformat() if site.domain_expiry else None,
                  'ticket_id': site.ticket_id},
    )
    logger.info("PendingAction (%s) queued for %s - awaiting user approval.", SITE_AVAILABLE, site.domain_name)
    return action


def execute_site_available(pa):
    """Approved: the legitimacy of the site moves to the "available" level, unless the domain is registered again."""
    from site_monitoring.models import Site
    site = (Site.objects.filter(pk=pa.metadata.get('site_id')).first()
            or Site.objects.filter(domain_name=pa.metadata.get('domain_name')).first())
    if site is None:
        logger.warning("PendingAction %d: '%s' no longer exists in Website Monitoring - nothing to do.", pa.id, pa.metadata.get('domain_name'))
        return
    if site.domain_expiry_check != 'not_registered':
        logger.warning("PendingAction %d: %s is registered again - its legitimacy is left as it is.", pa.id, site.domain_name)
        return
    new = AVAILABLE_LEVEL.get(site.legitimacy)
    if new:
        site.legitimacy = new
        site.save(update_fields=['legitimacy'])
        auto_comments.add_note(Site, site.pk, f'Legitimacy set to "{_level_labels().get(new, new)}": the domain is not registered.')
        logger.info("PendingAction %d: legitimacy of %s moved to level %d (available).", pa.id, site.domain_name, new)


# A legitimate domain that is lost

def queue_domain_lost(domain):
    """Queue the action for a legitimate domain the registry no longer knows. None when one already waits."""
    from common.models import PendingAction
    if _already_queued(DOMAIN_LOST, 'domain_id', domain.pk):
        return None
    labels = _level_labels()
    action = PendingAction.objects.create(
        action_type=DOMAIN_LOST,
        title=f"Domain lost: {domain.domain_name}",
        description=(f"The registry says {domain.domain_name} does not exist (on two checks in a row), yet it is listed as a "
                     "legitimate domain. It may have been dropped by mistake, never have been registered, or someone else may "
                     "register it next.\n\n"
                     f"Approving moves it to Website Monitoring, at the level '{labels[LOST_DOMAIN_LEVEL]}', so that a "
                     "re-registration is seen, and removes it from Legitimate Domains. Reject it if you know the domain is still "
                     "yours (a renewal or a transfer under way)."),
        metadata={'domain_id': domain.pk, 'domain_name': domain.domain_name,
                  'last_expiry': domain.expiry.isoformat() if domain.expiry else None, 'ticket_id': domain.ticket_id},
    )
    logger.warning("PendingAction (%s) queued for %s - awaiting user approval.", DOMAIN_LOST, domain.domain_name)
    return action


def _lost_comment(domain):
    """Where the website comes from, above what was written about the legitimate domain (never cut: see auto_comments)."""
    return auto_comments.combine("Moved from Legitimate Domains: not registered.", domain.comments)


def execute_domain_lost(pa):
    """Approved: the domain goes to Website Monitoring and leaves Legitimate Domains, unless it is registered again."""
    from common.models import LegitimateDomain
    from site_monitoring.models import Site
    domain = (LegitimateDomain.objects.filter(pk=pa.metadata.get('domain_id')).first()
              or LegitimateDomain.objects.filter(domain_name=pa.metadata.get('domain_name')).first())
    if domain is None:
        logger.warning("PendingAction %d: '%s' is no longer in Legitimate Domains - nothing to do.", pa.id, pa.metadata.get('domain_name'))
        return
    if domain.expiry_check != 'not_registered':
        logger.warning("PendingAction %d: %s is registered again - it stays in Legitimate Domains.", pa.id, domain.domain_name)
        return
    created_at = getattr(domain, 'domain_created_at', None)
    with transaction.atomic():
        _, created = Site.objects.get_or_create(domain_name=domain.domain_name, defaults={
            'ticket_id': domain.ticket_id, 'legitimacy': LOST_DOMAIN_LEVEL, 'domain_expiry': domain.expiry,
            'comments': _lost_comment(domain),
            'domain_created_at': created_at.date() if hasattr(created_at, 'date') else created_at,
            'domain_expiry_check': 'not_registered', 'domain_expiry_checked_at': domain.expiry_checked_at})
        name = domain.domain_name
        domain.delete()
    logger.info("PendingAction %d: %s moved from Legitimate Domains to Website Monitoring%s.", pa.id, name,
                '' if created else ' (it already was there)')
