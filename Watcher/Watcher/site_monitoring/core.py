# coding=utf-8
from __future__ import unicode_literals
import logging
from django.db import close_old_connections
from django.db import transaction
from django.conf import settings
from django.utils import timezone
from datetime import timedelta, datetime
from apscheduler.schedulers.background import BackgroundScheduler
import tzlocal
from .models import Site, Alert, Subscriber, PageScreenshot, MonitoredPage, PageVersion
import tlsh
import requests
from requests.adapters import HTTPAdapter
from urllib3.connection import HTTPConnection, HTTPSConnection
from urllib3.connectionpool import HTTPConnectionPool, HTTPSConnectionPool
import socket
import ipaddress
from dns import resolver
from dns.exception import DNSException, Timeout as DNSTimeout
from common.core import send_app_specific_notifications, capture_page, screenshots_configured
from django.db.models import Q
import time
import random
from common.utils.rdap import RDAPDiscovery
from common.utils import expiry_alerts, expiry_check, registration_actions
import common.utils.job_log as job_log  # not a "from common" line: the documentation build keeps it
from urllib.parse import urljoin, urlparse
from bs4 import BeautifulSoup, Comment
import difflib
import hashlib
import re
import html

# Configure logger
logger = logging.getLogger('watcher.site_monitoring')


LEGITIMACY_LABELS = {
    1: "Unknown",
    2: "Suspicious, not harmful",
    3: "Suspicious, likely harmful (registered)",
    4: "Suspicious, likely harmful (available/disabled)",
    5: "Malicious (registered)",
    6: "Malicious (available/disabled)",
}

DESKTOP_USER_AGENTS = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36 Edg/138.0.0.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0",
    "Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0",
)


class DesktopUserAgents:
    """Picks a desktop User-Agent without any network call (same `random_nomobile` as the library it replaces)."""

    @property
    def random_nomobile(self):
        return random.choice(DESKTOP_USER_AGENTS)


shadow_useragent = DesktopUserAgents()


def start_scheduler():
    """
    Launch multiple planning tasks in background:
        - Fire `monitoring_check` every 15 minutes from Monday to Sunday
        - Fire `update_site_monitoring_rdap_data` every 15 minute for the RDAP lookup
    """
    scheduler = BackgroundScheduler(timezone=str(tzlocal.get_localzone()))
    # Tells the Scheduled jobs page when each job runs next
    from common.utils.job_log import register_scheduler
    register_scheduler(scheduler)

    scheduler.add_job(monitoring_check, 'cron', day_of_week='mon-sun', minute='*/15', id='weekend_job',
                      max_instances=10,
                      replace_existing=True)
    
    scheduler.add_job(update_site_monitoring_rdap_data, 'cron', day_of_week='mon-sun', minute='*/15', id='site_rdap_job',
                      max_instances=1,
                      replace_existing=True)

    # The pages are checked at the pace of their own interval: the job only looks at the ones that are due
    scheduler.add_job(check_monitored_pages, 'cron', day_of_week='mon-sun', minute='*/15', id='monitored_pages_job',
                      max_instances=1, coalesce=True, replace_existing=True)

    scheduler.start()


# A site is "initializing" until monitoring_init has finished its first check. The window keeps a site whose
# check crashed (it would stay unmonitored forever) from being reported as initializing for ever.
SITE_INIT_WINDOW = timedelta(hours=6)


def sites_initializing():
    """
    Sites whose first monitoring check (monitoring_init) is not finished yet.

    :return: Queryset of Site.
    """
    now = timezone.now()
    return Site.objects.filter(monitored=False, created_at__gte=now - SITE_INIT_WINDOW).filter(
        Q(expiry__isnull=True) | Q(expiry__gt=now))


def monitoring_init(site):
    """
    Init the monitoring for a specific website.

    :param site: Site Object.
    :return:
    """
    if site.expiry is None or (site.expiry - timezone.now()) > timedelta(days=0):
        alert = 0
        logger.info(f"Init Monitoring: {site.domain_name}")
        check_content(site, alert, shadow_useragent)

        if Site.objects.filter(pk=site.pk, web_status__isnull=False).exists():
            check_ip(site, alert)
            check_mail(site, alert)

        Site.objects.filter(pk=site.pk).update(monitored=True)
    else:
        Site.objects.filter(pk=site.pk).update(monitored=False)


def create_rdap_alert(site, alert_code, registrar_data=None, expiry_data=None):
    """
    Create RDAP alerts using the same system as monitoring alerts.
    """
    try:
        message_registrar = "RDAP registrar change detected"
        message_expiry = "RDAP domain expiration change detected"
        message_registrar_expiry = "RDAP registrar and expiration changes detected"
        message_rdap_update = "RDAP data update detected"

        rdap_alert_types = {
            17: {'type': message_registrar, 'new_registrar': None, 'old_registrar': None},
            18: {'type': message_expiry, 'new_expiry_date': None, 'old_expiry_date': None},
            19: {'type': message_registrar_expiry, 'new_registrar': None, 'old_registrar': None, 
                 'new_expiry_date': None, 'old_expiry_date': None},
            20: {'type': message_rdap_update, 'new_registrar': None, 'old_registrar': None, 
                 'new_expiry_date': None, 'old_expiry_date': None},
        }

        if alert_code not in rdap_alert_types:
            logger.error(f"Invalid RDAP alert code: {alert_code}")
            return None

        alert_data = rdap_alert_types[alert_code].copy()

        if registrar_data:
            alert_data['new_registrar'] = registrar_data.get('new')
            alert_data['old_registrar'] = registrar_data.get('old')

        if expiry_data:
            alert_data['new_expiry_date'] = expiry_data.get('new')
            alert_data['old_expiry_date'] = expiry_data.get('old')

        recent_alerts = Alert.objects.filter(
            site=site,
            type=alert_data['type'],
            created_at__gte=timezone.now() - timedelta(hours=1)
        )

        if recent_alerts.exists():
            logger.debug(f"Similar RDAP alert already exists for {site.domain_name}, skipping")
            return None

        with transaction.atomic():
            alert = Alert.objects.create(site=site, **alert_data)

        logger.info(f"Created RDAP alert #{alert.id}: {alert_data['type']} for {site.domain_name}")
        return alert

    except Exception as e:
        logger.error(f"Error creating RDAP alert for {site.domain_name}: {str(e)}")
        return None


def create_banner_alert(site, old_server, new_server, old_xpb, new_xpb):
    """
    Create a banner-change alert and notify subscribers.
    Returns the Alert instance, or None if a duplicate was found within the last hour.
    """
    try:
        recent = Alert.objects.filter(
            site=site,
            type="Server banner change detected",
            created_at__gte=timezone.now() - timedelta(hours=1),
        )
        if recent.exists():
            logger.debug(f"Duplicate banner alert suppressed for {site.domain_name}")
            return None

        with transaction.atomic():
            alert = Alert.objects.create(
                site=site,
                type="Server banner change detected",
                old_server_banner=old_server,
                new_server_banner=new_server,
                old_x_powered_by=old_xpb,
                new_x_powered_by=new_xpb,
            )

        logger.info(f"Banner alert #{alert.id}: server banner change for {site.domain_name}")

        alert_data = {
            'type': "Server banner change detected",
            'old_server_banner': old_server,
            'new_server_banner': new_server,
            'old_x_powered_by': old_xpb,
            'new_x_powered_by': new_xpb,
        }
        send_website_monitoring_notifications(site, alert_data)
        return alert

    except Exception as e:
        logger.error(f"Error creating banner alert for {site.domain_name}: {e}")
        return None


def _record_not_registered(site):
    """
    The registry says the domain does not exist. When it was registered until now, that is news (the domain is available), but
    one answer is not enough: it has to say so on two passes in a row ("vanished" in between), as for a date that goes back.
    A domain that never was registered is only noted. A name with a part before its registrable domain ("www.example.com") is
    left out: the registry does not know it.
    """
    from common.utils.rdap import has_subdomain
    if has_subdomain(site.domain_name):
        # The registry only knows registrable domains: its "does not exist" says nothing about this name
        expiry_check.record_check(site, 'subdomain', answered=False, prefix='domain_expiry')
        return
    before = site.domain_expiry_check
    if before == 'vanished':
        expiry_check.record_check(site, 'not_registered', prefix='domain_expiry')
        job_log.job_count('became_available')
        logger.warning(f"{site.domain_name} is no longer registered: the registry said so twice in a row")
        expiry_alerts.notify_site_available(site)
        registration_actions.queue_site_available(site)  # a person decides what it changes (Pending actions)
    elif before != 'not_registered' and expiry_alerts.site_was_registered(site):
        expiry_check.record_check(site, 'vanished', prefix='domain_expiry')
        logger.warning(f"The registry does not know {site.domain_name} any more: waiting for a second answer")
    else:
        expiry_check.record_check(site, 'not_registered', prefix='domain_expiry')


def perform_site_rdap_lookup(site):
    """
    Perform the RDAP lookup of a single site and keep its registrar, registration date and expiry date up to date.

    The expiry date follows the rules of the legitimate domains (common.utils.expiry_check): the registry lowers it only with
    the same earlier date on two passes less than a day apart, and in between the stored date stays. Returns True when something
    about the site was updated.
    """
    try:
        rdap = RDAPDiscovery(site.domain_name)

        if not rdap.fetch_rdap_data():
            if rdap.status == 'not_found':
                # The registry of the extension says the domain does not exist: that is an answer.
                job_log.job_count('not_registered')
                _record_not_registered(site)
                return False
            # Nobody answered: no RDAP server for this extension, or the registry did not reply. Counted in the summary of the job.
            job_log.job_count('rdap_unsupported' if rdap.status == 'unsupported' else 'without_data')
            logger.debug(f"No RDAP data found for domain {site.domain_name}")
            expiry_check.record_check(site, 'unsupported' if rdap.status == 'unsupported' else 'unreachable',
                                      answered=False, prefix='domain_expiry')
            return False

        job_log.job_count('via_rdap')
        registrar = rdap.get_registrar()
        expiration_date = rdap.get_expiration_date()
        registration_date = rdap.get_registration_date()

        if not registrar and not expiration_date:
            expiry_check.record_check(site, 'no_date', prefix='domain_expiry')
            job_log.job_count('no_date_in_answer')
            return False

        # The expiry date: what to do with the answer is decided by common.utils.expiry_check.decide
        action, old_expiry = None, site.domain_expiry
        if expiration_date:
            new_expiry = datetime.strptime(expiration_date, '%Y-%m-%d').date()
            action, old_expiry = expiry_check.apply_answer(site, new_expiry, datetime.now(), prefix='domain_expiry')
            compare = f"Compare with the registry: python manage.py check_expiry_dates {site.domain_name}"
            if action == expiry_check.HOLD:
                job_log.job_count('held')
                logger.warning(f"RDAP gave {site.domain_name} an expiry date EARLIER than the one stored "
                               f"({old_expiry} -> {new_expiry}): the stored date is kept until a second pass confirms it. {compare}")
            elif action == expiry_check.CONFIRM:
                job_log.job_count('regressed')
                logger.warning(f"RDAP gave {site.domain_name} the same earlier expiry date twice ({old_expiry} -> {new_expiry}): "
                               f"written. {compare}")
            elif action == expiry_check.KEEP:
                job_log.job_count('unchanged')
        else:
            expiry_check.record_check(site, 'no_date', prefix='domain_expiry')
            job_log.job_count('no_date_in_answer')

        expiry_written = action in (expiry_check.FILL, expiry_check.RENEW, expiry_check.CONFIRM)
        registrar_changed = bool(registrar and site.registrar and site.registrar != registrar)
        registrar_filled = bool(registrar and not site.registrar)

        # Detect changes and create individual alerts. An earlier date still waiting for its second answer is not a change.
        if registrar_changed:
            create_rdap_alert(
                site=site,
                alert_code=17,
                registrar_data={'old': site.registrar, 'new': registrar}
            )
            logger.info(f"RDAP Alert: Registrar change for {site.domain_name}")

        if expiry_written and old_expiry and old_expiry != site.domain_expiry:
            create_rdap_alert(
                site=site,
                alert_code=18,
                expiry_data={'old': old_expiry, 'new': site.domain_expiry}
            )
            logger.info(f"RDAP Alert: Expiration change for {site.domain_name}")

        # The first time the registry tells something about the site is the starting point of what is compared later, not a change
        if registrar_filled or action == expiry_check.FILL:
            logger.info(f"First RDAP data for {site.domain_name}: registrar='{registrar}', expiration='{expiration_date}'")

        # The registration date (a domain registered again after it lapsed has a new one)
        created_changed = False
        if registration_date:
            try:
                new_registered_at = datetime.strptime(registration_date, '%Y-%m-%d').date()
                if site.domain_created_at != new_registered_at:
                    logger.info(f"RDAP update for {site.domain_name}: registration date changed from {site.domain_created_at} to {new_registered_at}")
                    site.domain_created_at = new_registered_at
                    created_changed = True
            except (ValueError, TypeError):
                logger.warning(f"Could not parse registration date '{registration_date}' for {site.domain_name}")

        # Update site data
        updated = expiry_written or created_changed
        legitimacy_updated = False
        old_legitimacy = site.legitimacy

        if registrar:
            updated = updated or site.registrar != registrar
            site.registrar = registrar

            legitimacy_updated = site.auto_update_legitimacy_on_registration()
            updated = updated or legitimacy_updated

        if updated:
            # Only what this lookup learned: the site was read at the start of a pass that lasts long, and a full save
            # would put back what the monitoring wrote meanwhile (addresses, mail records, hash, banner), then report it.
            site.save(update_fields=['domain_expiry', 'domain_created_at', 'registrar', 'legitimacy'])
            job_log.job_count('updated')

            # Create additional alert if legitimacy was auto-updated
            if legitimacy_updated:
                from common.utils import auto_comments
                auto_comments.add_note(Site, site.pk, f'Legitimacy raised to "{LEGITIMACY_LABELS.get(site.legitimacy, site.legitimacy)}": the domain is registered.')
                old_legitimacy_label = LEGITIMACY_LABELS.get(old_legitimacy, f"Level {old_legitimacy}")
                new_legitimacy_label = LEGITIMACY_LABELS.get(site.legitimacy, f"Level {site.legitimacy}")

                create_rdap_alert(
                    site=site,
                    alert_code=17,
                    registrar_data={
                        'old': f"{old_legitimacy_label}" if old_legitimacy else "Status auto-updated due to registration",
                        'new': f"{new_legitimacy_label}"
                    }
                )

        # Close to expiry (off until switched on in Connectors > Notifications): never stops the lookup
        if expiry_alerts.notify_site_expiring(site):
            job_log.job_count('alerts_expiring')

        return bool(updated)

    except Exception as e:
        job_log.job_count('errors')
        logger.error(f"Error processing RDAP for {site.domain_name}: {str(e)}")
        return False


@job_log.logged_job("RDAP lookup for site monitoring", logger)
def update_site_monitoring_rdap_data():
    """
    Update the registry data (registrar, registration and expiry dates) of all sites in Site Monitoring.
    """
    close_old_connections()
    logger.info("CRON TASK : RDAP Lookup for Site Monitoring")

    sites = Site.objects.all()
    
    for site in sites:
        try:
            job_log.job_count('sites')
            perform_site_rdap_lookup(site)
            time.sleep(1)  # Rate limiting
        except Exception as e:
            job_log.job_count('errors')
            logger.error(f"Error processing RDAP for {site.domain_name}: {str(e)}")

    logger.info("RDAP lookup process completed for Site Monitoring")


@job_log.logged_job("Suspicious website monitoring", logger)
def monitoring_check():
    """
        Main monitoring function.

    """
    close_old_connections()
    logger.info("CRON TASK : Suspicious Website Monitoring")

    sites = Site.objects.all()

    for site in sites:
        # One site that fails must not stop the ones after it: the order is fixed (-rtir), so
        # they would never be checked again.
        try:
            alert = 0
            new_ip = ""
            new_ip_second = ""

            if site.expiry is None or (site.expiry - timezone.now()) > timedelta(days=0):

                job_log.job_count('sites')
                logger.debug(f"Monitoring: {site.domain_name}")

                result = check_content(site, alert, shadow_useragent)
                alert = result[0]
                score = result[1]

                results = check_ip(site, alert)
                alert = results[0]
                new_ip = results[1]
                new_ip_second = results[2]

                alert = check_mail(site, alert)

                create_alert(alert, site, new_ip, new_ip_second, score)

                Site.objects.filter(pk=site.pk).update(monitored=True)

            else:
                Site.objects.filter(pk=site.pk).update(monitored=False)
        except Exception as e:
            logger.error(f"Monitoring failed for {site.domain_name}: {e}")


def banner_key(banner):
    """
    What counts in a Server / X-Powered-By header: the products and their major version. A patch of the same major
    version, a distribution in brackets ("nginx/1.28.3 (Ubuntu)") or the order of the products is not a change.
    """
    key = set()
    for token in re.sub(r'\([^)]*\)', ' ', banner or '').lower().split():
        name, _, version = token.partition('/')
        key.add((name, version.split('.')[0]))
    return frozenset(key)


def _handle_banner_change(site, response):
    """Extract Server/X-Powered-By from response and act on changes."""
    new_server = response.headers.get('Server', '')
    new_xpb = response.headers.get('X-Powered-By', '')

    if site.server_banner is None:
        Site.objects.filter(pk=site.pk).update(
            server_banner=new_server,
            x_powered_by=new_xpb,
        )
        logger.info(f"Initial banner stored for {site.domain_name}: Server={new_server!r}")
        return

    if new_server != site.server_banner or new_xpb != site.x_powered_by:
        Site.objects.filter(pk=site.pk).update(
            server_banner=new_server,
            x_powered_by=new_xpb,
        )
        if banner_key(new_server) == banner_key(site.server_banner) and banner_key(new_xpb) == banner_key(site.x_powered_by):
            logger.debug(f"Banner of {site.domain_name} updated without alert: {site.server_banner!r} -> {new_server!r}")
            return
        create_banner_alert(
            site,
            old_server=site.server_banner,
            new_server=new_server,
            old_xpb=site.x_powered_by,
            new_xpb=new_xpb,
        )


def check_content(site, alert, ua):
    """
    Monitor Website Content.

    :param site: Site Object.
    :param alert: Alert Integer.
    :param ua: User Agent.
    :return: alert, score
    :rtype: int, int
    """
    if not ua:
        headers = {
            'User-Agent': "Mozilla/5.0 (Windows NT 6.1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/75.0.3770.142 Safari/537.36"
        }
    else:
        try:
            headers = {
                'User-Agent': ua.random_nomobile  # Mobile-UA excluded
            }
        except Exception:
            headers = {
                'User-Agent': "Mozilla/5.0 (Windows NT 6.1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/75.0.3770.142 Safari/537.36"
            }

    score = 0
    try:
        response = requests.get("https://" + site.domain_name, headers=headers, timeout=10)
        if response.status_code == 200:
            Site.objects.filter(pk=site.pk).update(web_status=200)
            _handle_banner_change(site, response)
            if site.content_monitoring:
                if site.content_fuzzy_hash:
                    result = tlsh_score(response, site, alert)
                    alert = result[0]
                    score = result[1]
                else:
                    fuzzy_hash = content_fingerprint(response)
                    Site.objects.filter(pk=site.pk).update(content_fuzzy_hash=fuzzy_hash, web_status=200)
        else:
            logger.warning(f"{site.domain_name} answered HTTP {response.status_code}")
            Site.objects.filter(pk=site.pk).update(web_status=response.status_code)
    except requests.exceptions.RequestException:
        try:
            response = requests.get("http://" + site.domain_name, headers=headers, timeout=10)
            if response.status_code == 200:
                Site.objects.filter(pk=site.pk).update(web_status=200)
                _handle_banner_change(site, response)
                if site.content_monitoring:
                    if site.content_fuzzy_hash:
                        result = tlsh_score(response, site, alert)
                        alert = result[0]
                        score = result[1]
                    else:
                        fuzzy_hash = content_fingerprint(response)
                        Site.objects.filter(pk=site.pk).update(content_fuzzy_hash=fuzzy_hash, web_status=200)
            else:
                logger.warning(f"{site.domain_name} answered HTTP {response.status_code}")
                Site.objects.filter(pk=site.pk).update(web_status=response.status_code)
        except requests.exceptions.RequestException:
            Site.objects.filter(pk=site.pk).update(web_status=None)
            job_log.job_count('unreachable')
            # Said once, when the site goes down; a domain that never answered is only counted in the summary
            if site.web_status is not None:
                logger.info(f"{site.domain_name} is no longer reachable (it answered HTTP {site.web_status}).")
            else:
                logger.debug(f"{site.domain_name} is unreachable.")

    return alert, score


def content_fingerprint(response):
    """
    TLSH hash of a page.

    :param response: Http response.
    :return: The hash, or None when the page is too short or too uniform to fingerprint
        (tlsh.hash returns the string 'TNULL' for those, which is not a hash).
    :rtype: str or None
    """
    fuzzy_hash = tlsh.hash(bytes(response.text, 'utf-8'))
    return None if fuzzy_hash == 'TNULL' else fuzzy_hash


def tlsh_score(response, site, alert):
    """
    Caculate TLSH Score.

    :param response: Http response.
    :param site: Site Object.
    :param alert: Alert Integer.
    :return: alert, score
    :rtype: int, int
    """
    fuzzy_hash = content_fingerprint(response)
    if fuzzy_hash is None:
        return alert, 0  # nothing to compare: keep the stored hash
    try:
        score = tlsh.diffxlen(site.content_fuzzy_hash, fuzzy_hash)
    except ValueError:
        # The stored value is not a TLSH hash (older versions stored 'TNULL' for short pages): replace it.
        Site.objects.filter(pk=site.pk).update(content_fuzzy_hash=fuzzy_hash)
        return alert, 0
    if score > 160:
        alert += 4
        Site.objects.filter(pk=site.pk).update(content_fuzzy_hash=fuzzy_hash)
    return alert, score


# How long a /16 network stays known after the site was last seen in it.
KNOWN_NETWORKS_MEMORY = timedelta(days=30)


def _network(ip):
    return ipaddress.ip_network(ip + "/16", strict=False)


def _seen_since(seen, cutoff):
    try:
        return datetime.fromisoformat(seen) >= cutoff
    except (TypeError, ValueError):
        return False


def known_networks(site, stored_ips):
    """
    /16 networks a site was seen in during the last KNOWN_NETWORKS_MEMORY, plus those of the
    addresses stored on it. A rotating pool of addresses is a change of hosting only when it
    brings a network the site was never seen in.

    :param site: Site Object.
    :param stored_ips: IP addresses stored on the site (Iterable of Str or None).
    :rtype: set
    """
    cutoff = timezone.now() - KNOWN_NETWORKS_MEMORY
    known = {ipaddress.ip_network(network) for network, seen in (site.network_history or {}).items()
             if _seen_since(seen, cutoff)}
    known.update(_network(ip) for ip in stored_ips if ip)
    return known


def remember_networks(site, networks):
    """
    Record in Site.network_history the networks the site was seen in (dates refreshed once a day
    at most) and forget the ones not seen for KNOWN_NETWORKS_MEMORY.

    :param site: Site Object.
    :param networks: Networks the site was seen in (Iterable of ip_network).
    """
    now = timezone.now()
    cutoff = now - KNOWN_NETWORKS_MEMORY
    previous = site.network_history or {}
    history = {network: seen for network, seen in previous.items() if _seen_since(seen, cutoff)}
    for network in networks:
        seen = history.get(str(network))
        if seen is None or not _seen_since(seen, now - timedelta(days=1)):
            history[str(network)] = now.isoformat(timespec='seconds')
    if history != previous:
        site.network_history = history
        Site.objects.filter(pk=site.pk).update(network_history=history)


def check_ip(site, alert):
    """
    Monitor IP Address.

    :param site: Site Object.
    :param alert: Alert Integer.
    :return: alert, new_ip, new_ip_second
    :rtype: int, str, str
    """
    new_ip = ""
    new_ip_second = ""

    try:
        # DNS QUERY to get IP
        results = socket.getaddrinfo(site.domain_name, 0, proto=socket.IPPROTO_TCP, family=socket.AF_INET)
        addrs = sorted(results, key=lambda item: socket.inet_aton(item[4][0]))
        answer_networks = {_network(addr[4][0]) for addr in addrs}
        known = known_networks(site, (site.ip, site.ip_second))

        if site.ip_monitoring:
            ip_alert = 0
            # Check if the first ip is in the same subnet
            if len(addrs) >= 1 and (site.ip and ipaddress.ip_address(addrs[0][4][0]) not in ipaddress.ip_network(
                    site.ip + "/16", strict=False)) or site.ip is None:
                ip_alert += 1

            if len(addrs) >= 2:
                # Check if the second ip is in the same subnet
                if (site.ip_second and ipaddress.ip_address(addrs[1][4][0]) not in ipaddress.ip_network(
                        site.ip_second + "/16", strict=False)) or site.ip_second is None:
                    ip_alert += 2
            elif site.ip_second:
                ip_alert += 2
                new_ip_second = None
                Site.objects.filter(pk=site.pk).update(ip_second=new_ip_second)

            if len(addrs) == 3:
                logger.info(f"Found third ip ({addrs[2][4][0]}) for => {site.domain_name}")

            # A rotating pool changes the first two addresses at every answer: only a network the
            # site was never seen in is a change (the content bit of alert is left untouched).
            if answer_networks <= known:
                ip_alert = 0
            alert += ip_alert

        remember_networks(site, known | answer_networks)

        # Even if the new first/second ip are in the same subnet we change it in database
        if len(addrs) >= 1:
            new_ip = addrs[0][4][0]
            Site.objects.filter(pk=site.pk).update(ip=new_ip)

        if len(addrs) >= 2:
            new_ip_second = addrs[1][4][0]
            Site.objects.filter(pk=site.pk).update(ip_second=new_ip_second)
        else:
            Site.objects.filter(pk=site.pk).update(ip_second=None)

    except (socket.gaierror, UnicodeError):
        # UnicodeError: getaddrinfo cannot encode an empty or over-long DNS label
        pass

    return alert, new_ip, new_ip_second


# Passes in a row that must find no MX record before the records are said to be gone
MX_MISSES_TO_CONFIRM = 2


def check_mail(site, alert):
    """
    Monitor Mail (MX Records + mail.example.com).

    :param site: Site Object.
    :param alert: Alert Integer.
    :return: alert
    :rtype: int
    """
    alert_mx = False
    alert_a_ip = False
    resolv = resolver.Resolver()
    resolv.timeout = 2.5
    resolv.lifetime = 5

    try:
        mx_records_list = list()
        mx_records = resolv.resolve(site.domain_name, 'MX')
        for record in mx_records:
            mx_records_list.append(str(record))
        mx_records_list.sort()
        if site.MX_records is None:
            alert_mx = True
            Site.objects.filter(pk=site.pk).update(MX_records=mx_records_list, mx_missed=0)
        else:
            is_mx = False
            if mx_records_list != site.MX_records:
                is_mx = True
            if is_mx:
                alert_mx = True
                Site.objects.filter(pk=site.pk).update(MX_records=mx_records_list, mx_missed=0)
            elif site.mx_missed:
                Site.objects.filter(pk=site.pk).update(mx_missed=0)  # they are back: the empty answer was not a change
    except (DNSTimeout, resolver.NoNameservers):
        pass  # a timeout or servers that do not answer say nothing about the records
    except (resolver.NoAnswer, resolver.NXDOMAIN):
        stored = Site.objects.get(pk=site.pk)
        if stored.MX_records is None:
            # None means the site was never checked: recording "no MX" is the baseline, not a change
            Site.objects.filter(pk=site.pk).update(MX_records=[], mx_missed=0)
        elif stored.MX_records != []:
            # A record that vanishes is told only when the next pass says the same: one empty answer can be a failing resolver
            if stored.mx_missed + 1 >= MX_MISSES_TO_CONFIRM:
                Site.objects.filter(pk=site.pk).update(MX_records=[], mx_missed=0)
                alert_mx = True
            else:
                Site.objects.filter(pk=site.pk).update(mx_missed=stored.mx_missed + 1)
    except DNSException:
        pass  # anything else the resolver raises: unknown, not "no records"

    try:
        # The answer holds a few addresses of a pool spread over many networks: a change only
        # counts when it brings a network this site was never seen in.
        mail_ips = sorted({str(record) for record in resolv.resolve('mail.' + site.domain_name, 'A')},
                          key=ipaddress.ip_address)
        mail_networks = {_network(ip) for ip in mail_ips}
        known = known_networks(site, (site.ip, site.ip_second, site.mail_A_record_ip))
        mail_ip = site.mail_A_record_ip
        if mail_ip is None or _network(mail_ip) not in mail_networks:
            alert_a_ip = not mail_networks <= known
            mail_ip = mail_ips[0]
        if mail_ip != site.mail_A_record_ip:
            Site.objects.filter(pk=site.pk).update(mail_A_record_ip=mail_ip)
        remember_networks(site, known | mail_networks)
    except DNSTimeout:
        pass  # a timeout says nothing about the records
    except(resolver.NoAnswer, resolver.NXDOMAIN, resolver.NoNameservers, DNSException):
        if Site.objects.get(pk=site.pk).mail_A_record_ip != None:
            Site.objects.filter(pk=site.pk).update(mail_A_record_ip=None)
            alert_a_ip = True

    if (alert_mx or alert_a_ip) and site.mail_monitoring:
        alert += 8

    return alert


def previous_alert(site, alert_type, alert_pk):
    """
    Check if there was a previous Alert created for the same website in the last hour.

    :param alert_pk: Bypass Alert ID.
    :param site: Site Object.
    :param alert_type: Alert type.
    :return: True if there is a previous Alert.
    :rtype: bool
    """
    alerts = Alert.objects.filter(site=site.pk, type=alert_type)
    alert = None
    is_previous = False

    if len(alerts) > 0:
        alert = alerts[0]

    if alert is not None and ((timezone.now() - alert.created_at) < timedelta(hours=1)) and alert.pk != alert_pk:
        is_previous = True

    return is_previous


def create_alert(alert, site, new_ip, new_ip_second, score):
    """
    Create Alerts & Emails.

    :param alert: Alert Integer.
    :param site: Site Object.
    :param new_ip: New IP.
    :param new_ip_second: New Second IP.
    :param score: TLSH Score.
    :return:
    """
    message_web = "Web content change detected"
    message_web_ip = "Web content + IP address changes detected"
    message_mail = "Mail record detected"
    message_mail_web = "Mail record + Web content changes detected"
    message_mail_ip = "Mail record + IP address changes detected"
    message_mail_ip_web = "Mail record + Web content + IP address changes detected"
    message_ip = "IP address change detected"
    message_ips = "IP address changes detected"

    alert_types = {
        1: {'type': message_ip, 'new_ip': new_ip, 'old_ip': site.ip},
        2: {'type': message_ip, 'new_ip_second': new_ip_second, 'old_ip_second': site.ip_second},
        3: {'type': message_ips, 'new_ip': new_ip, 'new_ip_second': new_ip_second, 'old_ip': site.ip,
            'old_ip_second': site.ip_second},
        4: {'type': message_web, 'difference_score': score},
        5: {'type': message_web_ip, 'difference_score': score, 'new_ip': new_ip, 'old_ip': site.ip},
        6: {'type': message_web_ip, 'difference_score': score, 'new_ip_second': new_ip_second,
            'old_ip_second': site.ip_second},
        7: {'type': message_web_ip, 'difference_score': score, 'new_ip': new_ip, 'new_ip_second': new_ip_second,
            'old_ip': site.ip, 'old_ip_second': site.ip_second},
        8: {'type': message_mail},
        9: {'type': message_mail_ip, 'new_ip': new_ip, 'old_ip': site.ip},
        10: {'type': message_mail_ip, 'new_ip_second': new_ip_second, 'old_ip_second': site.ip_second},
        11: {'type': message_mail_ip, 'new_ip': new_ip, 'new_ip_second': new_ip_second, 'old_ip': site.ip,
             'old_ip_second': site.ip_second},
        12: {'type': message_mail_web, 'difference_score': score},
        13: {'type': message_mail_ip_web, 'difference_score': score, 'new_ip': new_ip, 'old_ip': site.ip},
        14: {'type': message_mail_ip_web, 'difference_score': score, 'new_ip_second': new_ip_second,
             'old_ip_second': site.ip_second},
        15: {'type': message_mail_ip_web, 'difference_score': score, 'new_ip': new_ip, 'new_ip_second': new_ip_second,
             'old_ip': site.ip, 'old_ip_second': site.ip_second},
        16: {'type': message_mail_ip_web, 'old_MX_records': site.MX_records, 'old_mail_A_record_ip': site.mail_A_record_ip},
    }


    if site.monitored and alert != 0:
        alert_data = alert_types[alert]

        now = datetime.now()

        one_hour_ago = now - timedelta(hours=3)
        last_two_alerts = Alert.objects.filter(site=site, created_at__gte=one_hour_ago).order_by('-created_at')[:2]

        for previous_alert in last_two_alerts:
            if all(getattr(previous_alert, key) == value for key, value in alert_data.items()):
                return


        alert_data.update({
            'new_ip': new_ip if new_ip else None,
            'old_ip': site.ip if site.ip else None,
            'new_ip_second': new_ip_second if new_ip_second else None,
            'old_ip_second': site.ip_second if site.ip_second else None,
            'old_MX_records': site.MX_records if site.MX_records else None,
            'old_mail_A_record_ip': site.mail_A_record_ip if site.mail_A_record_ip else None,
            'difference_score': score if score else None,
        })

        with transaction.atomic():
            new_alert = Alert.objects.create(site=site, **alert_data)
        job_log.job_count('changes')

        time.sleep(random.uniform(1, 3))

        # Manage MX records for mail changes
        if 'Mail' in alert_data['type']:
            current_site = Site.objects.get(pk=site.pk)
            if site.MX_records != current_site.MX_records:
                Alert.objects.filter(pk=new_alert.pk).update(old_MX_records=site.MX_records,
                                                             new_MX_records=current_site.MX_records)
            try:
                if ipaddress.ip_address(site.mail_A_record_ip) not in ipaddress.ip_network(
                        current_site.mail_A_record_ip + "/16", strict=False):
                    Alert.objects.filter(pk=new_alert.pk).update(old_mail_A_record_ip=site.mail_A_record_ip,
                                                                 new_mail_A_record_ip=current_site.mail_A_record_ip)
            except Exception:
                if current_site.mail_A_record_ip is not None or site.mail_A_record_ip is not None:
                    Alert.objects.filter(pk=new_alert.pk).update(old_mail_A_record_ip=site.mail_A_record_ip,
                                                                 new_mail_A_record_ip=current_site.mail_A_record_ip)

            if 'Web' not in alert_data['type']:
                if site.monitored and alert != 8:
                    Site.objects.filter(pk=site.pk).update(MX_records=site.MX_records,
                                                            mail_A_record_ip=site.mail_A_record_ip)

        # The mail fields are filled in the database after the alert is created: send what is stored
        new_alert.refresh_from_db()
        alert_data['id'] = new_alert.pk
        for field in ('new_MX_records', 'old_MX_records', 'new_mail_A_record_ip', 'old_mail_A_record_ip'):
            stored = getattr(new_alert, field)
            if stored:
                alert_data[field] = stored

        send_website_monitoring_notifications(site, alert_data)


def send_website_monitoring_notifications(site, alert_data):
    """
    Sends notifications to Slack, Citadel, TheHive or Email based on Site Monitoring.
    Slack, Citadel and TheHive follow the instance settings (Connectors > Notifications); the email goes to the
    subscribers who ticked E-mail.

    Args:
        site (Site): The object representing the site to monitor.
        alert_data (dict): The alert data associated with the site.
    """
    subscribers = Subscriber.objects.all()

    ip_changes = f"New IP: {alert_data.get('new_ip', 'N/A')} | Old IP: {alert_data.get('old_ip', 'N/A')}"
    ip_second_changes = f"New Second IP: {alert_data.get('new_ip_second', 'N/A')} | Old Second IP: {alert_data.get('old_ip_second', 'N/A')}"
    mx_changes = f"MX Records: {', '.join(alert_data.get('new_mx_records', []))}"
    content_score_info = f"TLSH Score: {alert_data.get('difference_score', 'N/A')}"
    alert_type_info = f"Alert Type: {alert_data.get('type', 'N/A')}"


    required_keys = ['new_ip', 'old_ip', 'new_ip_second', 'old_ip_second', 'new_MX_records', 'old_MX_records', 'new_mail_A_record_ip', 'old_mail_A_record_ip']
    for key in required_keys:
        if key not in alert_data:
            alert_data[key] = 'None'


    if alert_data['type'] == 'Web content change detected':
        alert_data['new_ip'] = alert_data.get('new_ip')
        alert_data['old_ip'] = alert_data.get('old_ip')
        alert_data['new_ip_second'] = alert_data.get('new_ip_second')
        alert_data['old_ip_second'] = alert_data.get('old_ip_second')
        alert_data['new_MX_records'] = alert_data.get('new_MX_records')
        alert_data['old_MX_records'] = alert_data.get('old_MX_records')
        alert_data['new_mail_A_record_ip'] = alert_data.get('new_mail_A_record_ip')
        alert_data['old_mail_A_record_ip'] = alert_data.get('old_mail_A_record_ip')


    context_data = {
        'site': site,
        'alert_data': alert_data,
        'ip_changes': ip_changes,
        'ip_second_changes': ip_second_changes,
        'mx_changes': mx_changes,
        'content_score_info': content_score_info,
        'alert_type_info': alert_type_info,
    }

    send_app_specific_notifications('website_monitoring', context_data, subscribers)


# Screenshots of the monitored pages: one is kept with each version of a page (the client is `common.core`).
def capture_for_version(page, version):
    """
    Take the screenshot of a page and keep it with a version, replacing the one it had.

    :return: True when a screenshot was kept.
    """
    image = capture_page(page.url)
    if image is None:
        return False
    PageScreenshot.objects.update_or_create(version=version, defaults={'image': image, 'size': len(image)})
    logger.debug(f"Screenshot of {page.url} kept ({len(image) // 1024} KB)")
    return True


# Monitoring of precise web pages (MonitoredPage): the text of each page is kept when it changes, and a change that is
# big enough is notified.
PAGE_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
PAGE_REQUEST_TIMEOUT = (5, 15)
PAGE_MAX_BYTES = 2 * 1024 * 1024
PAGE_MAX_REDIRECTS = 5
# The extracted text kept in a version: a page bigger than this is cut (the end of a very long page is not worth a row)
PAGE_MAX_TEXT = 500_000
# Lines of the summary of a change, and their length
PAGE_SUMMARY_LINES = 6
PAGE_SUMMARY_WIDTH = 200

_REMOVED_TAGS = ('head', 'script', 'style', 'noscript', 'template', 'iframe', 'svg', 'canvas', 'nav', 'footer', 'form',
                 'button', 'select')
_MONTHS = ('jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec|january|february|march|april|june|july|august|'
           'september|october|november|december|janv|fév|févr|avr|juin|juil|août|déc|janvier|février|mars|avril|mai|'
           'juillet|septembre|octobre|novembre|décembre')
# What changes on a page without the page having changed: dates, hours, "3 hours ago", "1,204 views"
_NOISE = [re.compile(pattern, re.IGNORECASE) for pattern in (
    r'\b\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:?\d{2})?)?\b',
    r'\b\d{1,2}[/.]\d{1,2}[/.]\d{2,4}\b',
    r'\b\d{1,2}:\d{2}(:\d{2})?(\s?[ap]\.?m\.?)?\b',
    rf'\b\d{{1,2}}(st|nd|rd|th|er)?\s+(de\s+)?({_MONTHS})\.?,?\s+\d{{4}}\b',
    rf'\b({_MONTHS})\.?\s+\d{{1,2}}(st|nd|rd|th)?,?(\s+\d{{4}})?\b',
    r'\b\d+\s+(second|minute|hour|day|week|month|year|seconde|heure|jour|semaine|mois|an)s?\s+(ago|auparavant)\b',
    r'\bil y a\s+\d+\s+\w+\b',
    r'\b[\d,. ]+\s*(views?|vues?|comments?|commentaires?|shares?|likes?|reads?)\b',
)]


class PageError(Exception):
    """The page could not be downloaded; the message says why in a few words."""


# Download
def _public_addresses(host):
    """The addresses the host resolves to. Empty when it does not resolve or when one of them is not public."""
    try:
        addresses = {info[4][0] for info in socket.getaddrinfo(host, None)}
    except (socket.gaierror, UnicodeError):
        return []
    try:
        if addresses and all(ipaddress.ip_address(address.split('%')[0]).is_global for address in addresses):
            return sorted(addresses)
    except ValueError:
        pass
    return []


def is_public(host):
    """True when every address the host resolves to is a public one (Watcher must not be used to reach its network)."""
    return bool(_public_addresses(host))


class _PublicOnlyMixin:
    """
    Connects to an address checked at the moment of the connection: the name is resolved once, here, and the socket is
    opened on that address. Checking the name first and letting the library resolve it again would let a server answer
    a public address to the check and a private one to the connection (DNS rebinding).
    """
    def _new_conn(self):
        addresses = _public_addresses(self._dns_host)
        if not addresses:
            raise PageError("the address is not public")
        name = self._dns_host
        self._dns_host = addresses[0]
        try:
            return super()._new_conn()
        finally:
            self._dns_host = name  # the name stays the one of the certificate and of the Host header


class _PublicOnlyHTTPConnection(_PublicOnlyMixin, HTTPConnection):
    pass


class _PublicOnlyHTTPSConnection(_PublicOnlyMixin, HTTPSConnection):
    pass


class _PublicOnlyHTTPPool(HTTPConnectionPool):
    ConnectionCls = _PublicOnlyHTTPConnection


class _PublicOnlyHTTPSPool(HTTPSConnectionPool):
    ConnectionCls = _PublicOnlyHTTPSConnection


class _PublicOnlyAdapter(HTTPAdapter):
    def init_poolmanager(self, *args, **kwargs):
        super().init_poolmanager(*args, **kwargs)
        self.poolmanager.pool_classes_by_scheme = {'http': _PublicOnlyHTTPPool, 'https': _PublicOnlyHTTPSPool}


def page_session():
    session = requests.Session()
    adapter = _PublicOnlyAdapter()
    session.mount('http://', adapter)
    session.mount('https://', adapter)
    return session


def fetch_page(url):
    """
    Download a page, following at most PAGE_MAX_REDIRECTS redirects, each one checked.

    :return: (status code, body bytes or None when the answer is not text)
    :raises PageError: not http(s), private address, too many redirects, unreachable
    """
    headers = {'User-Agent': PAGE_USER_AGENT, 'Accept': 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5'}
    current = url
    session = page_session()
    for _ in range(PAGE_MAX_REDIRECTS + 1):
        parsed = urlparse(current)
        if parsed.scheme not in ('http', 'https') or not parsed.hostname:
            raise PageError("not an http(s) address")
        if not is_public(parsed.hostname):
            raise PageError("the address is not public")
        try:
            response = session.get(current, headers=headers, timeout=PAGE_REQUEST_TIMEOUT, allow_redirects=False,
                                   stream=True)
        except PageError:
            raise
        except requests.exceptions.RequestException as exc:
            raise PageError(f"unreachable ({type(exc).__name__})") from exc
        try:
            if response.is_redirect and response.headers.get('Location'):
                current = urljoin(current, response.headers['Location'])
                continue
            if response.status_code != 200:
                return response.status_code, None
            content_type = response.headers.get('Content-Type', '').lower()
            if content_type and not any(kind in content_type for kind in ('text/', 'html', 'xml', 'json')):
                return response.status_code, None
            body = b''
            for chunk in response.iter_content(65536):
                body += chunk
                if len(body) >= PAGE_MAX_BYTES:
                    break
            return response.status_code, body
        except requests.exceptions.RequestException as exc:
            raise PageError(f"unreachable ({type(exc).__name__})") from exc
        finally:
            response.close()
    raise PageError("too many redirects")


# Text
# A pattern runs in the only worker, which also runs the scheduler: one that backtracks without end (ReDoS) would freeze
# Watcher. The shape that does it is a repeat without limit inside another one, as in (a+)+ ; those are refused, and
# the patterns of a page only look at the first characters of a line.
PAGE_PATTERN_LINE_LIMIT = 5000
_UNBOUNDED = 1000


def _has_nested_repeat(parsed, inside=False):
    for opcode, argument in parsed:
        name = str(opcode)
        if name in ('MAX_REPEAT', 'MIN_REPEAT', 'POSSESSIVE_REPEAT'):
            _, high, body = argument
            unbounded = high >= _UNBOUNDED
            if unbounded and inside:
                return True
            if _has_nested_repeat(body, inside or unbounded):
                return True
        elif name == 'SUBPATTERN':
            if _has_nested_repeat(argument[-1], inside):
                return True
        elif name == 'BRANCH':
            if any(_has_nested_repeat(branch, inside) for branch in argument[1]):
                return True
        elif name in ('ASSERT', 'ASSERT_NOT', 'ATOMIC_GROUP'):
            if _has_nested_repeat(argument[-1], inside):
                return True
    return False


def compile_ignore_patterns(source):
    """The regular expressions of a page, one per line. ValueError (with the line) when one is not valid."""
    patterns = []
    for line in (source or '').splitlines():
        line = line.strip()
        if not line:
            continue
        if len(line) > 200:
            raise ValueError(f"Pattern too long: {line[:30]}…")
        try:
            compiled = re.compile(line, re.IGNORECASE)
            nested = _has_nested_repeat(re._parser.parse(line, re.IGNORECASE))
        except re.error as exc:
            raise ValueError(f"Invalid pattern '{line[:40]}': {exc}") from exc
        if nested:
            raise ValueError(f"Pattern too slow (a repeat inside a repeat): {line[:30]}… Use a bounded repeat such as {{1,5}}.")
        patterns.append(compiled)
    return patterns


def extract_page_text(body, css_selector='', ignore_patterns=''):
    """
    The text of a page, one line per block, without what changes by itself.

    :param body: HTML (bytes: the parser reads the charset) or text.
    :param css_selector: only this part of the page; the whole page when empty or when nothing matches.
    :param ignore_patterns: regular expressions, one per line, removed from the text.
    """
    soup = BeautifulSoup(body, 'html.parser')
    for comment in soup.find_all(string=lambda node: isinstance(node, Comment)):
        comment.extract()
    root = soup
    if css_selector.strip():
        try:
            root = soup.select_one(css_selector.strip()) or soup
        except Exception:  # an invalid selector: compare the whole page rather than nothing
            root = soup
    for tag in root.find_all(list(_REMOVED_TAGS)):
        tag.decompose()
    for tag in root.find_all(attrs={'hidden': True}):
        tag.decompose()

    patterns = _NOISE + compile_patterns_quietly(ignore_patterns)
    lines = []
    for raw in root.get_text('\n').splitlines():
        line = ' '.join(raw.split())
        for pattern in patterns:
            line = pattern.sub('', line)
        line = ' '.join(line.split())
        if line:
            lines.append(line)
    return '\n'.join(lines)[:PAGE_MAX_TEXT]


def compile_patterns_quietly(source):
    """The valid patterns only: an invalid one (edited in the admin) must not stop the checks."""
    patterns = []
    for line in (source or '').splitlines():
        try:
            patterns += compile_ignore_patterns(line)
        except ValueError:
            logger.debug("Ignoring an invalid ignore pattern")
    return patterns


# Comparison
def compare_texts(old_text, new_text):
    """
    How much the text changed.

    :return: (ratio in %, lines added, lines removed). The ratio is the number of characters of the lines that were
        removed or added, over the characters of both texts: 0 for the same text, 100 for a completely different one.
    """
    old_lines, new_lines = old_text.split('\n'), new_text.split('\n')
    added, removed = [], []
    for tag, i1, i2, j1, j2 in difflib.SequenceMatcher(None, old_lines, new_lines, autojunk=False).get_opcodes():
        if tag in ('replace', 'delete'):
            removed += old_lines[i1:i2]
        if tag in ('replace', 'insert'):
            added += new_lines[j1:j2]
    total = len(old_text) + len(new_text)
    changed = sum(len(line) + 1 for line in added + removed)
    return (round(min(100.0, 100.0 * changed / total), 1) if total else 0.0), added, removed


def diff_rows(old_text, new_text, context=3):
    """
    The difference between two versions for display: rows {'kind': 'same'|'add'|'remove'|'skip', 'text'}. Runs of
    unchanged lines longer than twice `context` are cut to `context` lines on each side, with a 'skip' row that says how
    many lines were left out.
    """
    old_lines, new_lines = old_text.split('\n'), new_text.split('\n')
    rows = []
    opcodes = difflib.SequenceMatcher(None, old_lines, new_lines, autojunk=False).get_opcodes()
    for index, (tag, i1, i2, j1, j2) in enumerate(opcodes):
        if tag == 'equal':
            lines = new_lines[j1:j2]
            first, last = index == 0, index == len(opcodes) - 1
            # Keep `context` lines next to a change: after the one before (head), before the one after (tail)
            head = 0 if first else context
            tail = 0 if last else context
            if len(lines) > head + tail + 1:
                rows += [{'kind': 'same', 'text': t} for t in lines[:head]]
                rows.append({'kind': 'skip', 'text': str(len(lines) - head - tail)})
                rows += [{'kind': 'same', 'text': t} for t in (lines[len(lines) - tail:] if tail else [])]
            else:
                rows += [{'kind': 'same', 'text': t} for t in lines]
        else:
            rows += [{'kind': 'remove', 'text': t} for t in old_lines[i1:i2]]
            rows += [{'kind': 'add', 'text': t} for t in new_lines[j1:j2]]
    return rows


def summarize_change(added, removed):
    """A few lines of a change, shortened: what the notification shows (the page text is never sent whole)."""
    def shorten(lines):
        return [line if len(line) <= PAGE_SUMMARY_WIDTH else line[:PAGE_SUMMARY_WIDTH - 1] + '…' for line in lines[:PAGE_SUMMARY_LINES]]
    return {'added': shorten(added), 'removed': shorten(removed),
            'more_added': max(0, len(added) - PAGE_SUMMARY_LINES), 'more_removed': max(0, len(removed) - PAGE_SUMMARY_LINES)}


# Check
def _record_status(page, status):
    """Say once, when the page changes of state, that it stops or starts answering. `status` 0: unreachable."""
    status = status or None
    if page.last_status != status:
        if status == 200:
            if page.last_checked is not None:
                logger.info(f"Page {page.url} answers again")
        elif page.last_status == 200 or page.last_checked is None:
            logger.warning(f"Page {page.url} did not answer 200 ({status or 'unreachable'})")
        else:
            logger.debug(f"Page {page.url}: {status or 'unreachable'}")
    MonitoredPage.objects.filter(pk=page.pk).update(last_status=status, last_checked=timezone.now())
    page.last_status = status


def trim_versions(page):
    """Keep the newest `retention` versions (at least two: a change needs a version to be compared with)."""
    keep = max(2, page.retention)
    old_ids = list(page.versions.order_by('-created_at', '-id').values_list('id', flat=True)[keep:])
    if old_ids:
        PageVersion.objects.filter(id__in=old_ids).delete()


def check_page(page):
    """
    Check one page.

    :return: the new PageVersion when the text changed (or the first one), None otherwise.
    """
    try:
        status, body = fetch_page(page.url)
    except PageError as exc:
        job_log.job_count('unreachable')
        _record_status(page, 0)
        logger.debug(f"Page {page.url}: {exc}")
        return None
    _record_status(page, status)
    if body is None:
        return None

    text = extract_page_text(body, page.css_selector, page.ignore_patterns)
    if not text:
        return None
    content_hash = hashlib.sha256(text.encode('utf-8')).hexdigest()
    previous = page.versions.first()
    if previous and previous.content_hash == content_hash:
        return None

    ratio, added, removed = compare_texts(previous.text, text) if previous else (None, [], [])
    version = PageVersion.objects.create(page=page, text=text, content_hash=content_hash, size=len(text),
                                         change_ratio=ratio)
    MonitoredPage.objects.filter(pk=page.pk).update(last_changed=version.created_at)
    job_log.job_count('changes' if previous else 'new_pages')
    trim_versions(page)
    if page.capture_screenshots and screenshots_configured():
        try:
            if capture_for_version(page, version):
                job_log.job_count('screenshots')
        except Exception as exc:  # a screenshot that fails must not lose the version nor the notification
            logger.error(f"Page {page.url}: screenshot failed ({type(exc).__name__}: {exc})")

    if previous and ratio >= page.threshold:
        logger.info(f"Page {page.url} changed by {ratio}% (threshold {page.threshold}%)")
        notify_page_change(page, version, summarize_change(added, removed))
        PageVersion.objects.filter(pk=version.pk).update(notified=True)
    elif previous:
        logger.debug(f"Page {page.url} changed by {ratio}%, under the threshold of {page.threshold}%")
    return version


def due_pages(now=None):
    """The active pages whose last check is older than their interval."""
    now = now or timezone.now()
    return [page for page in MonitoredPage.objects.filter(is_active=True)
            if page.last_checked is None or now - page.last_checked >= timedelta(minutes=page.check_interval)]


@job_log.logged_job("Monitored pages", logger)
def check_monitored_pages():
    """Scheduled job: check the pages that are due."""
    close_old_connections()
    for page in due_pages():
        job_log.job_count('pages')
        try:
            check_page(page)
        except Exception as exc:  # one page must not stop the next ones
            logger.error(f"Page {page.url}: check failed ({type(exc).__name__}: {exc})")


# Notification of a change of a monitored page (Slack, Citadel, e-mail). The text of a page is not trusted: it is escaped
# for each channel and only a few shortened lines of the change are sent.
PAGE_NOTIFICATION = 'page_change'


def _slack_escape(text):
    return text.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')


def _page_list(lines, more, escape, bullet, separator):
    """The changed lines as one value of a message; empty (so the line is left out) when there are none."""
    if not lines:
        return ''
    items = [bullet + escape(line) for line in lines]
    if more:
        items.append(f"{bullet}… and {more} more")
    return separator.join(items)


def _page_context(page, version, summary, channel):
    """Values of the message on a channel. `channel`: 'slack', 'citadel' or 'email'."""
    from connectors.notifications import get_type

    name = (page.name or page.url).replace('\r', ' ').replace('\n', ' ')
    escape = {'slack': _slack_escape, 'citadel': html.escape}.get(channel, lambda text: text)
    separator, bullet = ('<br>', '• ') if channel == 'citadel' else ('\n', '• ')
    return {
        'page_name': escape(name),
        'page_url': escape(page.url),
        'change_percent': f"{version.change_ratio:g} %",
        'added_text': _page_list(summary['added'], summary['more_added'], escape, bullet, separator),
        'removed_text': _page_list(summary['removed'], summary['more_removed'], escape, bullet, separator),
        'added_lines': summary['added'], 'removed_lines': summary['removed'],
        'more_added': summary['more_added'], 'more_removed': summary['more_removed'],
        'details_url': getattr(settings, 'WATCHER_URL', '') + get_type(PAGE_NOTIFICATION).url_suffix,
    }


def _send_page_slack(page, version, summary):
    from common.utils.send_slack_messages import send_slack_message
    from connectors.core import get_slack_config
    from connectors.notifications import is_enabled, render_message

    if not is_enabled(PAGE_NOTIFICATION, 'slack'):
        return
    content = render_message(PAGE_NOTIFICATION, 'slack', _page_context(page, version, summary, 'slack'))
    send_slack_message(content, get_slack_config()['channel'], app_name='page_monitoring')


def _send_page_citadel(page, version, summary):
    from common.utils.send_citadel_messages import send_citadel_message
    from connectors.core import get_citadel_config
    from connectors.notifications import is_enabled, render_message

    if not is_enabled(PAGE_NOTIFICATION, 'citadel'):
        return
    body = render_message(PAGE_NOTIFICATION, 'citadel', _page_context(page, version, summary, 'citadel'))
    send_citadel_message(
        content={'msgtype': 'm.text', 'body': body, 'format': 'org.matrix.custom.html', 'formatted_body': body},
        room_id=get_citadel_config()['room_id'],
        app_name='page_monitoring',
    )


def _send_page_email(page, version, summary):
    from common.mail_template.page_change_template import get_page_change_template
    from common.utils.send_email_notifications import send_email_notifications
    from connectors.notifications import email_subject, is_enabled
    from .models import Subscriber

    if not is_enabled(PAGE_NOTIFICATION, 'email'):
        return
    recipients = [s.user_rec.email for s in Subscriber.objects.filter(email=True) if s.user_rec.email]
    if not recipients:
        job_log.note_channel('no recipients')
        return
    context = _page_context(page, version, summary, 'email')
    subject = email_subject(PAGE_NOTIFICATION, {'page_name': context['page_name']})
    send_email_notifications(subject, get_page_change_template(context), recipients, app_name='page_monitoring')


def notify_page_change(page, version, summary):
    """
    Tell the channels that a page changed. A channel that fails does not stop the next ones; how each went is logged
    in one line (a warning when one failed).
    """
    report = {}
    for channel, send in (('slack', _send_page_slack), ('citadel', _send_page_citadel), ('email', _send_page_email)):
        try:
            report[channel] = job_log.run_channel(channel, lambda send=send: send(page, version, summary))
        except Exception as exc:
            report[channel] = f"failed ({str(exc)[:110]})"
    problems = any(status.startswith('failed') for status in report.values())
    logger.log(logging.WARNING if problems else logging.INFO,
               f"Notification page change #{page.pk}: " + ', '.join(f"{c}={s}" for c, s in report.items()))
