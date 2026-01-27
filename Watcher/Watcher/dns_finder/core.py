# coding=utf-8
import os
import six
import subprocess
import json
import logging
from django.utils import timezone
from django.conf import settings
from apscheduler.schedulers.background import BackgroundScheduler
import tzlocal
from .models import Alert, DnsMonitored, DnsTwisted, Subscriber, KeywordMonitored
from common.models import LegitimateDomain
import certstream
from common.core import send_app_specific_notifications
from common.core import send_app_specific_notifications_group
from common.core import send_only_thehive_notifications
from django.db.models import Q
from .dangling_dns import (
    update_dangling_fingerprints,
    detect_dangling_dns,
    check_all_dangling_dns
)

# Configure logger
logger = logging.getLogger('watcher.dns_finder')


def start_scheduler():
    """
    Launch multiple planning tasks in background:
        - Fire main_dns_twist from Monday to Sunday: every 2 hours.
        - Fire main_certificate_transparency from Monday to Sunday: every hour.
        - Fire check_all_dangling_dns from Monday to Sunday: every 6 hours.
        - Fire update_dangling_fingerprints from Monday to Sunday: every day at 3AM.
    """
    scheduler = BackgroundScheduler(timezone=str(tzlocal.get_localzone()))
    # scheduler.add_job(main_dns_twist, 'cron', day_of_week='mon-sun', hour='*/2', id='main_dns_twist',
    scheduler.add_job(main_dns_twist, 'cron', day_of_week='mon-sun', minute='*/2', id='main_dns_twist',
                      max_instances=10,
                      replace_existing=True)
    # scheduler.add_job(main_certificate_transparency, 'cron', day_of_week='mon-sun', hour='*/1',
    scheduler.add_job(main_certificate_transparency, 'cron', day_of_week='mon-sun', minute='*/2',
                      id='main_certificate_transparency',
                      max_instances=2,
                      replace_existing=True)
    
    # Dangling DNS checking every 6 hours
    # scheduler.add_job(check_all_dangling_dns, 'cron', day_of_week='mon-sun', hour='*/6',
    scheduler.add_job(check_all_dangling_dns, 'cron', day_of_week='mon-sun', minute='*/2',
                      id='check_all_dangling_dns',
                      max_instances=1,
                      replace_existing=True)
    
    # Update fingerprints daily at 3 AM
    scheduler.add_job(update_dangling_fingerprints, 'cron', day_of_week='mon-sun', hour='3',
                      id='update_dangling_fingerprints',
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
    
    Example:
        - domain = "subdomain.thalesgroup.com"
        - If "thalesgroup.com" is in LegitimateDomain -> return True
        - If "subdomain.thalesgroup.com" is in LegitimateDomain -> return True
    
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
    """Remove leading '*.' from domain names."""
    if domain.startswith('*.'):
        return domain[2:]
    return domain


def print_callback(message, context):
    """
    Runs CertStream scan.

    :param message: event from CertStream.
    :param context: parameter from CertStream.
    """
    domain = str(message['data']['leaf_cert']['subject']['CN'])
    domain = clean_wildcard_domain(domain)

    for keyword_monitored in KeywordMonitored.objects.all():
        if keyword_monitored.name in domain and not DnsTwisted.objects.filter(domain_name=domain) and \
                not in_dns_monitored(domain):
            
            # Check if domain is legitimate before creating alert
            if is_legitimate_domain(domain):
                logger.info(f"Skipping alert for {domain} - domain is in Legitimate Domains")
                continue
            
            logger.info(f"Keyword {keyword_monitored.name} detected in: {domain}")
            dns_twisted = DnsTwisted.objects.create(domain_name=domain, keyword_monitored=keyword_monitored)
            
            # Check dangling DNS immediately on creation
            try:
                dangling_result = detect_dangling_dns(dns_twisted.domain_name)
                dns_twisted.dangling_status = dangling_result['status']
                dns_twisted.dangling_cname = dangling_result['cname']
                dns_twisted.dangling_info = dangling_result['info']
                dns_twisted.dangling_checked_at = timezone.now()
                dns_twisted.save(update_fields=['dangling_status', 'dangling_cname', 'dangling_info', 'dangling_checked_at'])
            except Exception as e:
                logger.error(f'Error checking dangling DNS for {dns_twisted.domain_name}: {str(e)}')
            
            alert = Alert.objects.create(dns_twisted=dns_twisted)
            alert.source = 'print_callback'
            alert.save()
            send_dns_finder_notifications(alert)


def main_certificate_transparency():
    """
    Launch CertStream scan.
    """
    certstream.listen_for_events(print_callback, url=settings.CERT_STREAM_URL)


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
                            
                            # Check dangling DNS immediately on creation
                            try:
                                dangling_result = detect_dangling_dns(dns_twisted.domain_name)
                                dns_twisted.dangling_status = dangling_result['status']
                                dns_twisted.dangling_cname = dangling_result['cname']
                                dns_twisted.dangling_info = dangling_result['info']
                                dns_twisted.dangling_checked_at = timezone.now()
                                dns_twisted.save(update_fields=['dangling_status', 'dangling_cname', 'dangling_info', 'dangling_checked_at'])
                            except Exception as e:
                                logger.error(f'Error checking dangling DNS for {dns_twisted.domain_name}: {str(e)}')
                            
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