# coding=utf-8
import os
import six
import subprocess
import json
import logging
import re
import time
import dns.resolver
import dns.exception
import requests
from django.utils import timezone
from django.db import close_old_connections
from connectors.core import get_certstream_config
from apscheduler.schedulers.background import BackgroundScheduler
import tzlocal
from .models import Alert, DnsMonitored, DnsTwisted, Subscriber, KeywordMonitored, \
    DanglingSubdomain, DanglingAlert
from common.models import LegitimateDomain
from . import certstream_client
from common.core import send_app_specific_notifications
from common.core import send_app_specific_notifications_group
from common.core import send_only_thehive_notifications
from django.db.models import Q

# Configure logger
logger = logging.getLogger('watcher.dns_finder')

def start_scheduler():
    """
    Launch multiple planning tasks in background:
        - Fire main_dns_twist from Monday to Sunday: every 2 hours.
        - Fire main_certificate_transparency from Monday to Sunday: every hour.
        - Fire recheck_dangling_subdomains from Monday to Sunday: every 6 hours.
    """
    scheduler = BackgroundScheduler(timezone=str(tzlocal.get_localzone()))
    scheduler.add_job(main_dns_twist, 'cron', day_of_week='mon-sun', hour='*/2', id='main_dns_twist',
                      max_instances=10,
                      replace_existing=True)
    scheduler.add_job(main_certificate_transparency, 'cron', day_of_week='mon-sun', hour='*/1',
                      id='main_certificate_transparency',
                      max_instances=2,
                      replace_existing=True)
    scheduler.add_job(recheck_dangling_subdomains, 'cron', day_of_week='mon-sun', hour='*/6',
                      id='recheck_dangling_subdomains',
                      max_instances=1,
                      replace_existing=True)

    scheduler.start()


def in_dns_monitored(domain):
    """
    Check if domain is a subdomain of one domain of the DnsMonitored list.

    :param domain: Domain to search (Str).
    :rtype: bool
    """
    is_in = False
    for dns_monitored in DnsMonitored.objects.all():
        if dns_monitored.domain_name in domain:
            is_in = True
    return is_in


def is_legitimate_domain(domain):
    """
    Check if domain or its parent domain is in the Legitimate Domains list.
    
    :param domain: Domain to check (Str).
    :rtype: bool
    """
    # Get all legitimate domains
    legitimate_domains = LegitimateDomain.objects.values_list('domain_name', flat=True)
    
    # Check exact match
    if domain in legitimate_domains:
        logger.info(f"Domain {domain} is in Legitimate Domains (exact match)")
        return True
    
    # Check if any legitimate domain is the parent of this domain
    for legit_domain in legitimate_domains:
        if domain.endswith('.' + legit_domain) or domain == legit_domain:
            logger.info(f"Domain {domain} is a subdomain of legitimate domain {legit_domain}")
            return True
    
    return False


def clean_wildcard_domain(domain):
    """Remove leading ``*.`` from domain names."""
    if domain.startswith('*.'):
        return domain[2:]
    return domain


_FINGERPRINTS_PATH = "./dns_finder/data/dangling_fingerprints.json"
_fingerprints_cache = None

# Maximum number of body bytes read from a (possibly attacker-controlled)
# dangling-subdomain HTTP probe before matching the fingerprint signature.
_HTTP_BODY_READ_LIMIT = 65536

# Strict hostname validation for domains coming from CertStream certificate
# CN fields, before they are used to build a DB row and an HTTPS URL.
_HOSTNAME_REGEX = re.compile(
    r"^(?=.{1,253}$)([a-zA-Z0-9_](?:[a-zA-Z0-9_-]{0,61}[a-zA-Z0-9])?\.)+"
    r"[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$"
)


def load_dangling_fingerprints():
    """
    Load (and cache) the dangling-DNS provider fingerprint list.

    :rtype: list[dict]
    """
    global _fingerprints_cache
    if _fingerprints_cache is None:
        with open(_FINGERPRINTS_PATH) as fingerprints_file:
            _fingerprints_cache = json.load(fingerprints_file)
    return _fingerprints_cache


def match_fingerprint(cname_target):
    """
    Find the fingerprint entry whose cname_pattern is contained in cname_target.

    :param cname_target: Terminal CNAME hostname (Str) or None.
    :rtype: dict or None
    """
    if not cname_target:
        return None
    for fingerprint in load_dangling_fingerprints():
        if fingerprint['cname_pattern'] in cname_target:
            return fingerprint
    return None


def resolve_cname_chain(subdomain, max_hops=5):
    """
    Follow the CNAME chain for a subdomain up to max_hops, returning the
    terminal target hostname, or None if there is no CNAME record.

    :param subdomain: Subdomain to resolve (Str).
    :param max_hops: Maximum CNAME hops to follow (Int).
    :rtype: str or None
    """
    current = subdomain
    target = None
    for _ in range(max_hops):
        try:
            answer = dns.resolver.resolve(current, 'CNAME')
            target = str(answer[0].target).rstrip('.')
            current = target
        except (dns.resolver.NoAnswer, dns.resolver.NXDOMAIN,
                dns.resolver.NoNameservers, dns.exception.Timeout):
            break
    return target


def check_dangling_status(dangling_subdomain):
    """
    Resolve a DanglingSubdomain's CNAME chain, match it against known
    takeover-able provider fingerprints, and confirm via DNS/HTTP.
    Updates the DanglingSubdomain row in place.

    :param dangling_subdomain: DanglingSubdomain Object.
    :return: The subdomain's status *before* this check ran (Str).
    """
    previous_status = dangling_subdomain.status
    cname_target = resolve_cname_chain(dangling_subdomain.subdomain)
    fingerprint = match_fingerprint(cname_target)

    new_status = 'ok'
    http_status_code = None
    provider = None

    if fingerprint:
        provider = fingerprint['provider']
        terminal_resolves = True
        try:
            dns.resolver.resolve(cname_target, 'A')
        except (dns.resolver.NXDOMAIN, dns.resolver.NoNameservers):
            terminal_resolves = False
        except (dns.resolver.NoAnswer, dns.exception.Timeout):
            pass  # inconclusive at the DNS level, fall through to the HTTP probe

        if not terminal_resolves and fingerprint.get('nxdomain_is_vulnerable'):
            new_status = 'dangling_confirmed'
        else:
            try:
                # The probed host is attacker-controlled in the true-positive
                # case: bound the connect/read time, refuse redirects and cap
                # how much of the body we are willing to read into memory.
                response = requests.get(
                    f"https://{dangling_subdomain.subdomain}",
                    timeout=(3, 5),
                    verify=False,
                    allow_redirects=False,
                    stream=True,
                )
                http_status_code = response.status_code
                body = response.raw.read(_HTTP_BODY_READ_LIMIT, decode_content=True)
                body_text = body.decode('utf-8', errors='ignore')
                if fingerprint['http_body_signature'] in body_text:
                    new_status = 'dangling_confirmed'
                else:
                    new_status = 'ok'
            except requests.exceptions.RequestException:
                new_status = 'dangling_suspected'

    DanglingSubdomain.objects.filter(pk=dangling_subdomain.pk).update(
        last_checked_at=timezone.now(),
        cname_target=cname_target,
        provider=provider,
        status=new_status,
        http_status_code=http_status_code,
    )
    dangling_subdomain.status = new_status

    return previous_status


def evaluate_dangling_subdomain(dangling_subdomain, source):
    """
    Runs check_dangling_status and creates + notifies a DanglingAlert only if
    the subdomain just transitioned INTO 'dangling_confirmed' from some other
    status (avoids re-alerting on every periodic recheck of an already-confirmed
    subdomain).

    'dangling_suspected' is deliberately silent: it is reached on a transient
    network/DNS error during the HTTP probe, so alerting on it would page the
    SOC on every blip and make a flapping subdomain spam the channels. It is
    still persisted and surfaced in the UI/statistics, and escalating from
    'dangling_suspected' to 'dangling_confirmed' does alert.

    :param dangling_subdomain: DanglingSubdomain Object.
    :param source: 'certstream' or 'periodic_recheck' (Str).
    """
    previous_status = check_dangling_status(dangling_subdomain)
    dangling_subdomain.refresh_from_db()

    newly_confirmed = (
        dangling_subdomain.status == 'dangling_confirmed'
        and previous_status != 'dangling_confirmed'
    )

    if newly_confirmed:
        alert = DanglingAlert.objects.create(dangling_subdomain=dangling_subdomain, source=source)
        send_dangling_dns_notifications(alert)


def send_dangling_dns_notifications(alert):
    """
    Sends notifications to Slack, Citadel, TheHive or Email for a Dangling
    DNS alert.

    :param alert: DanglingAlert Object.
    """
    subscribers = Subscriber.objects.filter(
        (Q(slack=True) | Q(citadel=True) | Q(thehive=True) | Q(email=True))
    )

    if not subscribers.exists():
        logger.info("No subscribers for DNS Finder, no dangling DNS message sent.")
        return

    if not alert or not alert.dangling_subdomain or not alert.dangling_subdomain.subdomain:
        logger.error(f"Invalid alert object or missing subdomain in dangling_subdomain for alert: {alert}")
        return

    context_data = {
        'alert': alert,
    }

    send_app_specific_notifications('dns_finder_dangling', context_data, subscribers)


def track_dangling_subdomain(domain):
    """
    If domain is a genuine subdomain (not the root itself) of a monitored
    corporate root domain, catalog it for dangling-DNS tracking.

    Discovery is catalog-only in real time: the row is created with its
    default 'pending' status and nothing else happens here. Verification
    (DNS resolution + HTTP probe, up to ~35s of blocking I/O) is left to the
    periodic recheck_dangling_subdomains job, which already picks up 'pending'
    rows. This runs on CertStream's single-threaded message-reader callback,
    which has no queue: blocking it would make the feed drop (not buffer)
    certificate-transparency events, degrading the pre-existing typosquat
    detection that shares this callback.

    Uses a strict suffix check (rather than in_dns_monitored's substring
    check, which would also match unrelated domains sharing a substring)
    since correctness matters here: this path writes a new DB row.

    :param domain: Domain from a CertStream event (Str).
    """
    if not _HOSTNAME_REGEX.match(domain):
        logger.warning(f"Skipping invalid hostname from CertStream: {domain}")
        return

    for dns_monitored in DnsMonitored.objects.all():
        if domain != dns_monitored.domain_name and domain.endswith('.' + dns_monitored.domain_name):
            DanglingSubdomain.objects.get_or_create(
                subdomain=domain,
                defaults={'dns_monitored': dns_monitored}
            )
            break


def recheck_dangling_subdomains():
    """
    Re-check every catalogued DanglingSubdomain that hasn't been triaged as
    resolved/false_positive, to catch takeovers that appear long after the
    subdomain was first discovered.
    """
    close_old_connections()
    logger.info("CRON TASK: Dangling DNS re-check")

    subdomains = DanglingSubdomain.objects.exclude(status__in=['resolved', 'false_positive'])

    for dangling_subdomain in subdomains:
        try:
            evaluate_dangling_subdomain(dangling_subdomain, 'periodic_recheck')
            time.sleep(1)  # Rate limiting
        except Exception as e:
            logger.error(f"Error rechecking dangling subdomain {dangling_subdomain.subdomain}: {str(e)}")

    logger.info("Dangling DNS re-check completed")


def print_callback(message, context):
    """
    Runs CertStream scan.

    :param message: event from CertStream.
    :param context: parameter from CertStream.
    """
    domain = str(message['data']['leaf_cert']['subject']['CN'])
    domain = clean_wildcard_domain(domain)

    try:
        track_dangling_subdomain(domain)
    except Exception as e:
        logger.error(f"Dangling DNS tracking failed for {domain}: {str(e)}")

    for keyword_monitored in KeywordMonitored.objects.all():
        if keyword_monitored.name in domain and not DnsTwisted.objects.filter(domain_name=domain) and \
                not in_dns_monitored(domain):
            
            # Check if domain is legitimate before creating alert
            if is_legitimate_domain(domain):
                logger.info(f"Skipping alert for {domain} - domain is in Legitimate Domains")
                continue
            
            logger.info(f"Keyword {keyword_monitored.name} detected in: {domain}")
            dns_twisted = DnsTwisted.objects.create(domain_name=domain, keyword_monitored=keyword_monitored)
            alert = Alert.objects.create(dns_twisted=dns_twisted)
            alert.source = 'print_callback'
            alert.save()
            send_dns_finder_notifications(alert)


def main_certificate_transparency():
    """
    Launch CertStream scan using internal certstream-server-go.
    """
    certstream_url = get_certstream_config()['url']
    logger.info(f"Starting CertStream monitoring on {certstream_url}")
    try:
        certstream_client.listen_for_events(print_callback, url=certstream_url)
    except Exception as e:
        logger.error(f"CertStream connection failed: {e}")
        raise


def main_dns_twist():
    """
    Launch dnstwist algorithm.
    """
    for dns_monitored in DnsMonitored.objects.all():
        check_dnstwist(dns_monitored)


def check_dnstwist(dns_monitored):
    """
    Runs dnstwist.

    :param dns_monitored: DnsMonitored Object.
    :return:
    """
    logger.info(f'Runs dnstwist for: {dns_monitored.domain_name}')
    logger.info('-----------------------------')
    alerts_list = list()
    filepath_out = "./dns_finder/data/list.json"
    filepath_tlds = "./dns_finder/data/abused_tlds.dict"

    if os.path.exists(filepath_out):
        os.remove(filepath_out)

    subprocess.check_output(map(six.text_type, [
        'dnstwist',
        '--registered',
        '--format={}'.format("json"),
        '--output={}'.format(filepath_out),
        '--tld={}'.format(filepath_tlds),
        '{}'.format(dns_monitored.domain_name),
    ]))

    with open('dns_finder/data/list.json') as json_file:
        try:
            domains = json.load(json_file)
            for twisted_website_dict in domains:
                twisted_domain = clean_wildcard_domain(twisted_website_dict['domain'])
                dns_ns = False
                dns_a = False
                dns_aaaa = False
                dns_mx = False
                if 'dns_a' in twisted_website_dict:
                    if twisted_website_dict['dns_a'] != ['!ServFail']:
                        dns_a = True
                if 'dns_aaaa' in twisted_website_dict:
                    if twisted_website_dict['dns_aaaa'] != ['!ServFail']:
                        dns_aaaa = True
                if 'dns_mx' in twisted_website_dict:
                    if twisted_website_dict['dns_mx'] != ['!ServFail']:
                        dns_mx = True
                if 'dns_ns' in twisted_website_dict:
                    if twisted_website_dict['dns_ns'] != ['!ServFail']:
                        dns_ns = True
                # Check if there is at least one DNS entry
                if dns_ns or dns_a or dns_aaaa or dns_mx:
                    if twisted_website_dict['domain'] != dns_monitored.domain_name:
                        # Check if domain is legitimate before creating alert
                        if is_legitimate_domain(twisted_domain):
                            logger.info(f"Skipping alert for {twisted_domain} - domain is in Legitimate Domains")
                            continue
                        
                        # If it is a new domain name, we create it
                        if not DnsTwisted.objects.filter(domain_name=twisted_website_dict['domain']):
                            dns_twisted = DnsTwisted.objects.create(domain_name=twisted_website_dict['domain'],
                                                                    dns_monitored=dns_monitored,
                                                                    fuzzer=twisted_website_dict['fuzzer'])
                            alert = Alert.objects.create(dns_twisted=dns_twisted)
                            alert.source = 'check_dnstwist'
                            alert.save()
                            alerts_list.append(alert)

            # Send email alerts
            if len(alerts_list) < 6:
                for alert in alerts_list:
                    send_dns_finder_notifications(alert)
            if len(alerts_list) >= 6:
                send_dns_finder_notifications_group(dns_monitored, len(alerts_list), alerts_list)
        except ValueError:
            logger.error('Decoding JSON has failed')

    logger.info(f"dnstwist: Successfully processed: {dns_monitored.domain_name}")


def send_dns_finder_notifications(alert):
    """
    Sends notifications to Slack, Citadel, TheHive or Email based on DNS Finder.
    
    :param alert: Alert Object.
    """
    subscribers = Subscriber.objects.filter(
        (Q(slack=True) | Q(citadel=True) | Q(thehive=True) | Q(email=True))
    )

    if not subscribers.exists():
        logger.info("No subscribers for DNS Finder, no message sent.")
        return

    if not alert or not alert.dns_twisted or not alert.dns_twisted.domain_name:
        logger.error(f"Invalid alert object or missing domain_name in dns_twisted for alert: {alert}")
        return

    source = None
    if hasattr(alert, 'source'):
        source = alert.source 

    context_data = {
        'alert': alert,
        'source': source 
    }

    send_app_specific_notifications('dns_finder', context_data, subscribers)


def send_dns_finder_notifications_group(dns_monitored, alerts_number, alerts):
    """
    Sends grouped notifications to Slack, Citadel, TheHive or Email based on dns_finder_group.
    If the application is TheHive, individual notifications are sent for each alert.

    :param keyword: The keyword or term associated with the dns finder.
    :param alerts_number: The total number of alerts in the group.
    :param alerts: The list of individual alerts to be processed and sent to TheHive.
    """
    subscribers = Subscriber.objects.filter(
        Q(slack=True) | Q(citadel=True) | Q(thehive=True) | Q(email=True)
    )

    if not subscribers.exists():
        logger.info("No subscribers for DNS Finder group, no message sent.")
        return

    context_data_group = {
        'dns_monitored': dns_monitored,
        'alerts_number': alerts_number,
    }

    send_app_specific_notifications_group('dns_finder_group', context_data_group, subscribers)

    for alert in alerts:

        context_data_thehive = {
            'alert': alert,  
        }

        send_only_thehive_notifications('dns_finder', context_data_thehive, subscribers)