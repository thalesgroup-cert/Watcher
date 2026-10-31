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
import socket
import ipaddress
from dns import resolver
from dns.exception import DNSException, Timeout as DNSTimeout
import shadow_useragent
from common.core import send_app_specific_notifications, capture_page, screenshots_configured
from django.db.models import Q
import time
import random
from common.utils.rdap import RDAPDiscovery
from common.utils.whois import WhoisDiscovery
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


try:
    shadow_useragent = shadow_useragent.ShadowUserAgent()
    # The library logs its own state as ERROR/WARNING at every use ("{'last_update': …}"): nothing to act on
    logging.getLogger('shadow-useragent').setLevel(logging.CRITICAL)
except Exception as e:
    logger.error(str(e))
    logger.info("Using default User-Agent")
    shadow_useragent = False


def start_scheduler():
    """
    Launch multiple planning tasks in background:
        - Fire `monitoring_check` every 15 minutes from Monday to Sunday
        - Fire `update_site_monitoring_rdap_data` every 15 minute for RDAP/WHOIS lookup
    """
    scheduler = BackgroundScheduler(timezone=str(tzlocal.get_localzone()))

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


def perform_site_rdap_lookup(site):
    """
    Perform RDAP lookup for a single site with WHOIS fallback.
    """
    try:
        # Try RDAP first
        rdap = RDAPDiscovery(site.domain_name)
        method = "RDAP"
        
        if not rdap.fetch_rdap_data():
            # Fallback to WHOIS
            logger.debug(f"RDAP lookup failed for domain {site.domain_name}, falling back to WHOIS")
            whois = WhoisDiscovery(site.domain_name)
            if not whois.fetch_whois_data():
                # An unregistered domain has no record: counted in the summary of the job
                job_log.job_count('without_data')
                logger.debug(f"No RDAP/WHOIS data found for domain {site.domain_name}")
                return False
            
            rdap = whois
            method = "WHOIS"

        registrar = rdap.get_registrar()
        expiration_date = rdap.get_expiration_date()
        
        if not registrar and not expiration_date:
            return False

        
        new_data = {
            'registrar': registrar,
            'expiry': datetime.strptime(expiration_date, '%Y-%m-%d').date() if expiration_date else None
        }

        # Detect changes and create individual alerts
        registrar_changed = (registrar and site.registrar and site.registrar != registrar)
        expiry_changed = (new_data['expiry'] and site.domain_expiry and site.domain_expiry != new_data['expiry'])
        
        if registrar_changed:
            create_rdap_alert(
                site=site,
                alert_code=17,
                registrar_data={'old': site.registrar, 'new': registrar}
            )
            logger.info(f"{method} Alert: Registrar change for {site.domain_name}")
            
        if expiry_changed:
            create_rdap_alert(
                site=site,
                alert_code=18,
                expiry_data={'old': site.domain_expiry, 'new': new_data['expiry']}
            )
            logger.info(f"{method} Alert: Expiration change for {site.domain_name}")
            
        if not site.registrar or not site.domain_expiry:
            create_rdap_alert(
                site=site,
                alert_code=20,
                registrar_data={'old': site.registrar, 'new': registrar} if registrar else None,
                expiry_data={'old': site.domain_expiry, 'new': new_data['expiry']} if expiration_date else None
            )
            logger.info(f"Successfully updated {method} data for {site.domain_name}: registrar='{registrar}', expiration='{expiration_date}'")

        # Update site data
        updated = False
        legitimacy_updated = False
        old_legitimacy = site.legitimacy
        
        if registrar:
            site.registrar = registrar
            updated = True
            
            legitimacy_updated = site.auto_update_legitimacy_on_registration()
            
        if new_data['expiry']:
            site.domain_expiry = new_data['expiry']
            updated = True

        if updated:
            site.save()
            
            # Create additional alert if legitimacy was auto-updated
            if legitimacy_updated:
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
            
            return True

        return False

    except Exception as e:
        logger.error(f"Error processing RDAP/WHOIS for {site.domain_name}: {str(e)}")
        return False


@job_log.logged_job("RDAP/WHOIS lookup for site monitoring", logger)
def update_site_monitoring_rdap_data():
    """
    Update RDAP/WHOIS data for all sites in Site Monitoring.
    """
    close_old_connections()
    logger.info("CRON TASK : RDAP/WHOIS Lookup for Site Monitoring")

    sites = Site.objects.all()
    
    for site in sites:
        try:
            job_log.job_count('sites')
            perform_site_rdap_lookup(site)
            time.sleep(1)  # Rate limiting
        except Exception as e:
            job_log.job_count('errors')
            logger.error(f"Error processing RDAP/WHOIS for {site.domain_name}: {str(e)}")

    logger.info("RDAP/WHOIS lookup process completed for Site Monitoring")


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
            Site.objects.filter(pk=site.pk).update(MX_records=mx_records_list)
        else:
            is_mx = False
            if mx_records_list != site.MX_records:
                is_mx = True
            if is_mx:
                alert_mx = True
                Site.objects.filter(pk=site.pk).update(MX_records=mx_records_list)
    except DNSTimeout:
        pass  # a timeout says nothing about the records
    except(resolver.NoAnswer, resolver.NXDOMAIN, resolver.NoNameservers, DNSException):
        known_mx = Site.objects.get(pk=site.pk).MX_records
        if known_mx != []:
            Site.objects.filter(pk=site.pk).update(MX_records=[])
            # None means the site was never checked: recording "no MX" is the baseline, not a change
            alert_mx = known_mx is not None

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
def _is_public(host):
    """True when every address the host resolves to is a public one (Watcher must not be used to reach its network)."""
    try:
        addresses = {info[4][0] for info in socket.getaddrinfo(host, None)}
    except socket.gaierror:
        return False
    return bool(addresses) and all(ipaddress.ip_address(address.split('%')[0]).is_global for address in addresses)


def fetch_page(url):
    """
    Download a page, following at most PAGE_MAX_REDIRECTS redirects, each one checked.

    :return: (status code, body bytes or None when the answer is not text)
    :raises PageError: not http(s), private address, too many redirects, unreachable
    """
    headers = {'User-Agent': PAGE_USER_AGENT, 'Accept': 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5'}
    current = url
    for _ in range(PAGE_MAX_REDIRECTS + 1):
        parsed = urlparse(current)
        if parsed.scheme not in ('http', 'https') or not parsed.hostname:
            raise PageError("not an http(s) address")
        if not _is_public(parsed.hostname):
            raise PageError("the address is not public")
        try:
            response = requests.get(current, headers=headers, timeout=PAGE_REQUEST_TIMEOUT, allow_redirects=False,
                                    stream=True)
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
            patterns.append(re.compile(line, re.IGNORECASE))
        except re.error as exc:
            raise ValueError(f"Invalid pattern '{line[:40]}': {exc}") from exc
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
