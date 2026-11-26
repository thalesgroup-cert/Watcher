"""
The two notifications about the expiry date of a legitimate domain (both off until a superuser switches them on, in
Connectors > Notifications): a domain close to expiry, and a date the registry moved earlier.
"""
import logging

from django.conf import settings
from django.utils import timezone

logger = logging.getLogger('watcher.common')

EXPIRING_DAYS = 30  # the threshold the interface uses for "expiring soon"
EXPIRING = 'legitimate_domain_expiring'
REGRESSION = 'legitimate_domain_expiry_regression'


def _days_text(days):
    return 'today' if days == 0 else 'tomorrow' if days == 1 else f'in {days} days'


def _checked_text(domain, prefix='expiry'):
    at = getattr(domain, f'{prefix}_checked_at')
    if at is None:
        return 'never'
    hours = max(0, int((timezone.now() - at).total_seconds() // 3600))
    return f"{getattr(domain, f'{prefix}_source') or 'registry'}, " + ('less than an hour ago' if hours < 1 else f'{hours} h ago')


def _details_url(type_id):
    from connectors.notifications import get_type
    return settings.WATCHER_URL.rstrip('/') + '/' + get_type(type_id).url_suffix


def expiring_context(domain, today):
    days = (domain.expiry - today).days
    return {
        'domain_name_sanitized': domain.domain_name.replace('.', '[.]'), 'expiry': domain.expiry.isoformat(),
        'days_left': str(days), 'days_text': _days_text(days), 'checked': _checked_text(domain),
        'details_url': _details_url(EXPIRING),
    }


def regression_context(domain, old_expiry, today):
    return {
        'domain_name_sanitized': domain.domain_name.replace('.', '[.]'), 'old_expiry': old_expiry.isoformat(),
        'new_expiry': domain.expiry.isoformat(), 'status_text': 'Expired' if domain.expiry < today else 'Still valid',
        'details_url': _details_url(REGRESSION),
    }


def _send(type_id, ctx, domain_name):
    """Every channel the instance switched on for this notification; a failing one does not stop the next."""
    from common.utils.job_log import run_channel
    from common.utils.send_citadel_messages import send_citadel_message
    from common.utils.send_email_notifications import send_email_notifications
    from common.utils.send_slack_messages import send_slack_message
    from connectors.core import get_citadel_config, get_slack_config
    from connectors.notifications import email_subject, get_type, is_enabled, render_message
    from site_monitoring.models import Subscriber

    ntype = get_type(type_id)

    def slack():
        send_slack_message(render_message(type_id, 'slack', ctx), get_slack_config()['channel'], app_name=type_id)

    def citadel():
        body = render_message(type_id, 'citadel', ctx)
        send_citadel_message(
            content={'msgtype': 'm.text', 'body': body, 'format': 'org.matrix.custom.html', 'formatted_body': body},
            room_id=get_citadel_config()['room_id'], app_name=type_id)

    def email():
        recipients = [s.user_rec.email for s in Subscriber.objects.filter(email=True) if s.user_rec.email]
        if recipients:
            send_email_notifications(email_subject(type_id, ctx), ntype.email.sample_body(ctx), recipients, app_name=type_id)

    sent = False
    for channel, send in (('slack', slack), ('citadel', citadel), ('email', email)):
        try:
            if not is_enabled(type_id, channel):
                continue
            run_channel(channel, send)
            sent = True
        except Exception as exc:
            logger.error("%s notification on %s failed for %s: %s", type_id, channel, domain_name, exc)
    return sent


def notify_expiring(domain, today=None):
    """
    Tell that a domain is close to expiry, once per expiry date. Only a date the registry gave lately counts: a date typed
    by hand may be what is wrong. Returns True when a notification went out.
    """
    from common.models import LegitimateDomain
    today = today or timezone.now().date()
    if domain.expiry is None or not domain.expiry_confirmed or domain.expiry_alerted == domain.expiry:
        return False
    if not 0 <= (domain.expiry - today).days <= EXPIRING_DAYS:
        return False
    try:
        sent = _send(EXPIRING, expiring_context(domain, today), domain.domain_name)
    except Exception as exc:
        logger.error("Could not notify that %s expires soon: %s", domain.domain_name, exc)
        return False
    if sent:
        # Marked only when something went out: with every channel off, switching one on later still alerts
        LegitimateDomain.objects.filter(pk=domain.pk).update(expiry_alerted=domain.expiry)
        domain.expiry_alerted = domain.expiry
    return sent


def notify_regression(domain, old_expiry, today=None):
    """Tell that the registry moved the expiry date of a domain earlier (twice the same answer). True when sent."""
    today = today or timezone.now().date()
    try:
        return _send(REGRESSION, regression_context(domain, old_expiry, today), domain.domain_name)
    except Exception as exc:
        logger.error("Could not notify the earlier expiry date of %s: %s", domain.domain_name, exc)
        return False


SITE_EXPIRING = 'site_domain_expiring'


def _site_actions(site):
    names = [label for flag, label in ((site.takedown_request, 'Takedown requested'), (site.legal_team, 'Legal team'),
                                       (site.blocking_request, 'Blocking requested')) if flag]
    return ', '.join(names) or 'None'


def site_expiring_context(site, today):
    days = (site.domain_expiry - today).days
    return {
        'domain_name_sanitized': site.domain_name.replace('.', '[.]'), 'legitimacy_label': site.get_legitimacy_display() or 'Unknown',
        'expiry': site.domain_expiry.isoformat(), 'days_left': str(days), 'days_text': _days_text(days),
        'registrar': site.registrar, 'actions': _site_actions(site), 'ticket': site.ticket_id,
        'checked': _checked_text(site, prefix='domain_expiry'), 'details_url': _details_url(SITE_EXPIRING),
    }


def notify_site_expiring(site, today=None):
    """
    Tell that the domain of a monitored website is close to expiry, once per expiry date: once it lapses it may become
    available, and the team decides whether to register it. Same conditions as for a legitimate domain: only a date the
    registry gave lately counts. Returns True when a notification went out.
    """
    from site_monitoring.models import Site
    today = today or timezone.now().date()
    if site.domain_expiry is None or not site.domain_expiry_confirmed or site.domain_expiry_alerted == site.domain_expiry:
        return False
    if not 0 <= (site.domain_expiry - today).days <= EXPIRING_DAYS:
        return False
    try:
        sent = _send(SITE_EXPIRING, site_expiring_context(site, today), site.domain_name)
    except Exception as exc:
        logger.error("Could not notify that the domain of %s expires soon: %s", site.domain_name, exc)
        return False
    if sent:
        Site.objects.filter(pk=site.pk).update(domain_expiry_alerted=site.domain_expiry)
        site.domain_expiry_alerted = site.domain_expiry
    return sent


SITE_AVAILABLE = 'site_domain_available'


def site_was_registered(site):
    """
    The registry has known this domain: it answered with a record (with or without a date) or a registrar was stored.
    A domain that never was registered has nothing to announce when the registry says it does not exist.
    """
    return site.domain_expiry_check in ('ok', 'contradicted', 'no_date') or bool(site.registrar)


def site_available_context(site):
    return {
        'domain_name_sanitized': site.domain_name.replace('.', '[.]'), 'legitimacy_label': site.get_legitimacy_display() or 'Unknown',
        'registrar': site.registrar, 'expiry': site.domain_expiry.isoformat() if site.domain_expiry else None,
        'actions': _site_actions(site), 'ticket': site.ticket_id,
        'checked': _checked_text(site, prefix='domain_expiry'), 'details_url': _details_url(SITE_AVAILABLE),
    }


def notify_site_available(site):
    """Tell that the domain of a monitored website, registered until now, is available. True when it went out."""
    try:
        return _send(SITE_AVAILABLE, site_available_context(site), site.domain_name)
    except Exception as exc:
        logger.error("Could not notify that the domain of %s is available: %s", site.domain_name, exc)
        return False
