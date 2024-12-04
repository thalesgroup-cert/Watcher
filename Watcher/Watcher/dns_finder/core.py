# coding=utf-8
import os
import six
import subprocess
import json
from django.utils import timezone
from django.conf import settings
from apscheduler.schedulers.background import BackgroundScheduler
import tzlocal
from .models import Alert, DnsMonitored, DnsTwisted, Subscriber, KeywordMonitored
import certstream
from common.core import send_app_specific_notifications
from django.db.models import Q


def start_scheduler():
    """
    Launch multiple planning tasks in background:
        - Fire main_dns_twist from Monday to Sunday: every 2 hours.
        - Fire main_certificate_transparency from Monday to Sunday: every hour.
    """
    scheduler = BackgroundScheduler(timezone=str(tzlocal.get_localzone()))
    scheduler.add_job(main_dns_twist, 'cron', day_of_week='mon-sun', hour='*/2', id='main_dns_twist',
                      max_instances=10,
                      replace_existing=True)
    scheduler.add_job(main_certificate_transparency, 'cron', day_of_week='mon-sun', hour='*/1',
                      id='main_certificate_transparency',
                      max_instances=2,
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


def print_callback(message, context):
    """
    Runs CertStream scan.

    :param message: event from CertStream.
    :param context: parameter from CertStream.
    """
    domain = str(message['data']['leaf_cert']['subject']['CN'])
    for keyword_monitored in KeywordMonitored.objects.all():
        if keyword_monitored.name in domain and not DnsTwisted.objects.filter(domain_name=domain) and \
                not in_dns_monitored(domain):
            print(str(timezone.now()) + " - " + "Keyword", keyword_monitored.name, "detected in :", domain)
            dns_twisted = DnsTwisted.objects.create(domain_name=domain, keyword_monitored=keyword_monitored)
            alert = Alert.objects.create(dns_twisted=dns_twisted)
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
    print(str(timezone.now()) + " - " + 'Runs dnstwist for: ', dns_monitored.domain_name)
    print('-----------------------------')
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
                        # If it is a new domain name, we create it
                        if not DnsTwisted.objects.filter(domain_name=twisted_website_dict['domain']):
                            dns_twisted = DnsTwisted.objects.create(domain_name=twisted_website_dict['domain'],
                                                                    dns_monitored=dns_monitored,
                                                                    fuzzer=twisted_website_dict['fuzzer'])
                            alert = Alert.objects.create(dns_twisted=dns_twisted)
                            alerts_list.append(alert)

            for alert in alerts_list:
                send_dns_finder_notifications(alert)

        except ValueError:
            print('Decoding JSON has failed')

    print(str(timezone.now()) + " - " + "dnstwist: Successfully processed: ", dns_monitored.domain_name)


def send_dns_finder_notifications(alert):
    """
    Sends notifications to Slack, Citadel, or TheHive based on dns_finder.
    
    :param alert: Alert Object.
    """
    subscribers = Subscriber.objects.filter(
        (Q(slack=True) | Q(citadel=True) | Q(thehive=True) | Q(email=True))
    )

    if not subscribers.exists():
        print(f"{timezone.now()} - No subscribers for DNS Finder, no message sent.")
        return

    if not alert or not alert.dns_twisted or not alert.dns_twisted.domain_name:
        print(f"Error: Invalid alert object or missing domain_name in dns_twisted for alert: {alert}")
        return

    context_data = {
        'alert': alert,  
    }

    send_app_specific_notifications('dns_finder', context_data, subscribers)