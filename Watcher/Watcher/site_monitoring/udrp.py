# coding=utf-8
"""
UDRP automatic tracking for the Site Monitoring module.

Scheduled every 6 hours by the APScheduler job registered in common/core.py.
For each Site with legal_team=True and udrp_status in (None, 'pending'), the job
queries the official WIPO UDRP case database, parses the HTML response and:
  - Updates udrp_status / udrp_last_checked on the Site record.
  - If the decision is favourable ('won'), creates a LegitimateDomain entry.
  - Sends notifications via TheHive (comment on existing case/alert), Slack, Citadel and Email.
"""

import logging
import re
from datetime import date
from html.parser import HTMLParser

import requests
from django.conf import settings
from django.db import models
from django.utils import timezone

logger = logging.getLogger('watcher.common')

WIPO_SEARCH_URL = 'https://www.wipo.int/amc/en/domains/search/domain.jsp'

_WON_PATTERNS = re.compile(r'\b(transfer(red)?|cancel(l?ed)?)\b', re.I)
_LOST_PATTERNS = re.compile(r'\bdenied\b', re.I)


# HTML table extractor
class _TableCellExtractor(HTMLParser):
    """Collects the visible text of every <td> and <th> cell in a document."""

    def __init__(self):
        super().__init__()
        self._in_cell = False
        self._buffer = []
        self.cells = []

    def handle_starttag(self, tag, attrs):
        if tag in ('td', 'th'):
            self._in_cell = True
            self._buffer = []

    def handle_endtag(self, tag):
        if tag in ('td', 'th') and self._in_cell:
            text = ' '.join(self._buffer).strip()
            if text:
                self.cells.append(text)
            self._in_cell = False
            self._buffer = []

    def handle_data(self, data):
        if self._in_cell:
            token = data.strip()
            if token:
                self._buffer.append(token)


def _strip_tld(domain):
    """
    Return the domain name without its TLD, as expected by WIPO's search form.
    """
    return domain.rsplit('.', 1)[0]


# UDRPDiscovery class
class UDRPDiscovery:
    """
    UDRP (Uniform Domain-Name Dispute-Resolution Policy) discovery client.

    Queries the official WIPO UDRP case database for a given domain name
    and parses the HTML response to determine the current case status.

    Usage::

        udrp = UDRPDiscovery('be-thalesaleniaspaces.com')
        if udrp.fetch():
            status = udrp.get_decision()   # 'won' | 'lost' | 'pending'
    """

    def __init__(self, domain):
        self.domain = domain
        self.html = None
        self._session = None

    # Network layer
    def fetch(self):
        """
        Fetch WIPO case search results for the domain.

        A session GET is performed first to obtain the JSESSIONID cookie
        required by the WIPO server, then a POST submits the domain name.

        :return: True if results were fetched successfully, False otherwise.
        :rtype: bool
        """
        try:
            self._session = requests.Session()
            self._session.headers.update({
                'User-Agent': 'Watcher-UDRP-Client/2.0',
            })

            self._session.get(WIPO_SEARCH_URL, timeout=15)

            # Submit the domain search
            search_term = _strip_tld(self.domain)
            resp = self._session.post(
                WIPO_SEARCH_URL,
                data={'domain': search_term},
                headers={'Referer': WIPO_SEARCH_URL},
                timeout=15,
            )
            resp.raise_for_status()
            self.html = resp.text
            return True
        except requests.exceptions.RequestException as exc:
            logger.error("UDRP fetch error for %s: %s", self.domain, exc)
            return False

    # Parsing
    def get_decision(self):
        """
        Parse the fetched HTML and return the UDRP decision status.

        Scans the case result table for outcome keywords in the Decision column:
        - 'won' - at least one Transfer or Cancel outcome found.
        - 'lost' - only Denied outcomes found.
        - 'pending' - no conclusive outcome found (case ongoing or not indexed).

        :return: 'won', 'lost', or 'pending'.
        :rtype: str
        :raises RuntimeError: If fetch() has not been called yet.
        """
        if self.html is None:
            raise RuntimeError("No HTML available - call fetch() first.")

        if re.search(r'\b0 case\(s\)', self.html):
            return 'pending'

        parser = _TableCellExtractor()
        parser.feed(self.html)

        won_found = any(_WON_PATTERNS.search(cell) for cell in parser.cells)
        lost_found = any(_LOST_PATTERNS.search(cell) for cell in parser.cells)

        if won_found:
            return 'won'
        if lost_found:
            return 'lost'
        return 'pending'

    def get_case_url(self):
        """
        Return the direct WIPO case URL if a case number is found in the results.

        :return: URL string or None.
        :rtype: str or None
        """
        if not self.html:
            return None
        match = re.search(r'([Dd]\d{4}-\d{4})', self.html)
        if match:
            case_id = match.group(1).upper()
            return f"https://www.wipo.int/amc/en/domains/search/text.jsp?case={case_id}"
        return None


# Transfer to Legitimate Domains
def transfer_to_legitimate_domains(site):
    """
    Create a LegitimateDomain entry for *site* after a favourable UDRP decision.

    :return: True if a new entry was created, False if it already existed.
    :rtype: bool
    """
    from common.models import LegitimateDomain

    today = date.today().isoformat()
    comment = (
        f"Domain transferred from Website Monitoring following a favourable "
        f"UDRP decision. (Date: {today}, Source: WIPO)"
    )

    _, created = LegitimateDomain.objects.get_or_create(
        domain_name=site.domain_name,
        defaults={
            "ticket_id": site.ticket_id,
            "comments": comment,
        },
    )

    if created:
        logger.info("LegitimateDomain created for %s after UDRP win.", site.domain_name)
    else:
        logger.info(
            "LegitimateDomain for %s already exists - skipping creation.", site.domain_name
        )

    return created


def _queue_udrp_transfer(site):
    """
    Create a PendingAction for a favourable UDRP decision instead of transferring
    the domain immediately. A user must approve the action before the domain is
    moved to Legitimate Domains.
    """
    from common.models import PendingAction

    today = date.today().isoformat()

    already_queued = any(
        pa.metadata.get('site_id') == site.id
        for pa in PendingAction.objects.filter(
            action_type='udrp_transfer', status='pending'
        )
    )
    if already_queued:
        logger.info(
            "PendingAction (udrp_transfer) already queued for %s - skipping.",
            site.domain_name,
        )
        return

    comment = (
        f"Domain transferred from Website Monitoring following a favourable "
        f"UDRP decision. (Date: {today}, Source: WIPO)"
    )

    PendingAction.objects.create(
        action_type='udrp_transfer',
        title=f"UDRP Transfer: {site.domain_name}",
        description=(
            f"A favourable UDRP decision (Transfer/Cancel) was detected for "
            f"{site.domain_name}.\n\n"
            f"Approving this action will add the domain to Legitimate Domains "
            f"with the following comment:\n{comment}"
        ),
        metadata={
            'site_id':       site.id,
            'domain_name':   site.domain_name,
            'ticket_id':     site.ticket_id,
            'decision_date': today,
            'source':        'wipo.int',
            'comment':       comment,
        },
    )
    logger.info(
        "PendingAction (udrp_transfer) queued for %s - awaiting user approval.",
        site.domain_name,
    )


# Notifications
def notify_udrp_decision(site, decision):
    """
    Send UDRP decision notifications via TheHive, Slack, Citadel and Email.
    """
    today = date.today().isoformat()
    ticket = site.ticket_id or 'N/A'
    label = "favourable (Transfer/Cancel)" if decision == 'won' else "unfavourable (Denied)"
    domain_sanitized = site.domain_name.replace('.', '[.]')

    _notify_thehive(site, domain_sanitized, today, ticket, label)
    _notify_slack(domain_sanitized, today, ticket, label)
    _notify_citadel(domain_sanitized, today, ticket, label)
    _notify_email(site, decision, label, today, domain_sanitized)


def _notify_thehive(site, domain_sanitized, today, ticket, label):
    from common.utils.update_thehive import (
        search_thehive_for_ticket_id,
        add_comment_to_item,
    )
    from connectors.core import get_thehive_config

    thehive_cfg = get_thehive_config()
    thehive_url = thehive_cfg['url']
    api_key = thehive_cfg['key']

    if not thehive_url or not api_key:
        logger.warning(
            "TheHive not configured - UDRP notification skipped for %s.", site.domain_name
        )
        return

    if not site.ticket_id:
        logger.info("No ticket_id on site %s - TheHive comment skipped.", site.domain_name)
        return

    comment = (
        "**[UDRP DECISION]**\n"
        f"*Domain:* {domain_sanitized}\n"
        f"*Decision:* {label}\n"
        f"*Date:* {today}\n"
        "*Source:* WIPO (wipo.int)\n"
        f"*Ticket:* {ticket}"
    )

    for item_type in ('case', 'alert'):
        found_type, item = search_thehive_for_ticket_id(
            site.ticket_id, thehive_url, api_key, item_type=item_type
        )
        if item:
            item_id = item.get('_id') or item.get('id')
            add_comment_to_item(found_type, item_id, comment, thehive_url, api_key)
            logger.info(
                "TheHive comment added on %s %s for UDRP decision on %s.",
                found_type, item_id, site.domain_name,
            )
            return

    logger.warning(
        "No TheHive case/alert found for ticket %s (domain %s).",
        site.ticket_id, site.domain_name,
    )


def _notify_slack(domain_sanitized, today, ticket, label):
    from common.core import APP_CONFIG_SLACK
    from common.utils.send_slack_messages import send_slack_message

    config = APP_CONFIG_SLACK.get('udrp_decision')
    if not config:
        return

    watcher_url = getattr(settings, 'WATCHER_URL', '')
    content = config['content_template'].format(
        domain_name_sanitized=domain_sanitized,
        decision_label=label,
        date=today,
        ticket=ticket,
        details_url=watcher_url + config['url_suffix'],
    )
    send_slack_message(content, config['channel'], app_name='udrp_checker')


def _notify_citadel(domain_sanitized, today, ticket, label):
    from common.core import APP_CONFIG_CITADEL
    from common.utils.send_citadel_messages import send_citadel_message

    config = APP_CONFIG_CITADEL.get('udrp_decision')
    if not config:
        return

    watcher_url = getattr(settings, 'WATCHER_URL', '')
    formatted_body = config['content_template'].format(
        domain_name_sanitized=domain_sanitized,
        decision_label=label,
        date=today,
        ticket=ticket,
        details_url=watcher_url + config['url_suffix'],
    )
    send_citadel_message(
        content={
            'msgtype': 'm.text',
            'body': formatted_body,
            'format': 'org.matrix.custom.html',
            'formatted_body': formatted_body,
        },
        room_id=config['citadel_room_id'],
        app_name='udrp_checker',
    )


def _notify_email(site, decision, label, today, domain_sanitized):
    from common.core import APP_CONFIG_EMAIL
    from common.utils.send_email_notifications import send_email_notifications
    from site_monitoring.models import Subscriber
    from common.mail_template.udrp_template import get_udrp_template

    config = APP_CONFIG_EMAIL.get('udrp_decision')
    if not config:
        return

    email_list = [
        subscriber.user_rec.email
        for subscriber in Subscriber.objects.filter(email=True)
        if subscriber.user_rec.email
    ]

    if not email_list:
        logger.debug("UDRP email: no subscribers with email=True found.")
        return

    subject = config['subject'].format(domain_name_sanitized=domain_sanitized)
    body = get_udrp_template(site, decision, label, today)
    send_email_notifications(subject, body, email_list, app_name='udrp_checker')


# Scheduled job entry-point
def check_udrp_statuses():
    """
    Main scheduled job - runs every 6 hours (registered in common/core.py).

    Processes every Site where legal_team=True and udrp_status is None or 'pending'.
    For each candidate:
      1. Queries WIPO via UDRPDiscovery.
      2. Updates udrp_status and udrp_last_checked.
      3. On a status change to 'won' or 'lost', fires notifications.
      4. On 'won', queues a PendingAction for user approval before transfer.
    """
    from django.db import close_old_connections
    from site_monitoring.models import Site

    close_old_connections()

    candidates = Site.objects.filter(
        legal_team=True,
    ).filter(
        models.Q(udrp_status__isnull=True) | models.Q(udrp_status='pending')
    )

    if not candidates.exists():
        logger.debug("UDRP check: no pending candidates found.")
        return

    logger.info("UDRP check: %d candidate(s) to process.", candidates.count())

    for site in candidates:
        logger.info("Checking UDRP status for: %s", site.domain_name)

        udrp = UDRPDiscovery(site.domain_name)
        if not udrp.fetch():
            continue

        new_status = udrp.get_decision()
        old_status = site.udrp_status

        site.udrp_status = new_status
        site.udrp_last_checked = timezone.now()
        site.save(update_fields=['udrp_status', 'udrp_last_checked'])

        logger.info(
            "UDRP status for %s: %s -> %s", site.domain_name, old_status, new_status
        )

        if new_status == old_status:
            continue

        if new_status in ('won', 'lost'):
            notify_udrp_decision(site, new_status)

        if new_status == 'won':
            _queue_udrp_transfer(site)
