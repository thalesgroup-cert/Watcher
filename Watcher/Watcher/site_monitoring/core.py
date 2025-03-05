# coding=utf-8
from __future__ import unicode_literals
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from django.db import close_old_connections
from django.db import transaction
from django.conf import settings
from django.utils import timezone
from datetime import timedelta, datetime
from apscheduler.schedulers.background import BackgroundScheduler
import tzlocal
from .models import Site, Alert, Subscriber
import tlsh
import requests
import socket
import ipaddress
from dns import resolver
from dns.exception import DNSException
import shadow_useragent
from common.core import send_app_specific_notifications
from django.db.models import Q
import time
import random

try:
    shadow_useragent = shadow_useragent.ShadowUserAgent()
except Exception as e:
    print(str(timezone.now()) + " - ", e)
    print(str(timezone.now()) + " - ", "Using default User-Agent")
    shadow_useragent = False


def start_scheduler():
    """
    Launch multiple planning tasks in background:
        - Fire monitoring_check from Monday to Sunday : minute='*/6'
    """
    scheduler = BackgroundScheduler(timezone=str(tzlocal.get_localzone()))

    scheduler.add_job(monitoring_check, 'cron', day_of_week='mon-sun', minute='*/1', id='weekend_job',
                      max_instances=10,
                      replace_existing=True)
    
    scheduler.start()


def monitoring_init(site):
    """
    Init the monitoring for a specific website.

    :param site: Site Object.
    :return:
    """
    if site.expiry is None or (site.expiry - timezone.now()) > timedelta(days=0):
        alert = 0
        print(str(timezone.now()) + " - " + "Init Monitoring: ", site.domain_name)
        check_content(site, alert, shadow_useragent)

        if Site.objects.get(pk=site.pk).web_status is not None:
            check_ip(site, alert)
            check_mail(site, alert)

        Site.objects.filter(pk=site.pk).update(monitored=True)
    else:
        Site.objects.filter(pk=site.pk).update(monitored=False)


def monitoring_check():
    """
        Main monitoring function.

    """
    close_old_connections()
    print(str(timezone.now()) + " - CRON TASK : Suspicious Website Monitoring")

    sites = Site.objects.all()

    for site in sites:
        alert = 0
        new_ip = ""
        new_ip_second = ""

        if site.expiry is None or (site.expiry - timezone.now()) > timedelta(days=0):

            print(str(timezone.now()) + " - " + "Monitoring: ", site.domain_name)

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
            if site.content_monitoring:
                if site.content_fuzzy_hash:
                    result = tlsh_score(response, site, alert)
                    alert = result[0]
                    score = result[1]
                else:
                    fuzzy_hash = tlsh.hash(bytes(response.text, 'utf-8'))
                    Site.objects.filter(pk=site.pk).update(content_fuzzy_hash=fuzzy_hash, web_status=200)
        else:
            print(str(timezone.now()) + " - " + "Status code: ", str(response.status_code))
            Site.objects.filter(pk=site.pk).update(web_status=response.status_code)
    except requests.exceptions.RequestException:
        try:
            response = requests.get("http://" + site.domain_name, headers=headers, timeout=10)
            if response.status_code == 200:
                Site.objects.filter(pk=site.pk).update(web_status=200)
                if site.content_monitoring:
                    if site.content_fuzzy_hash:
                        result = tlsh_score(response, site, alert)
                        alert = result[0]
                        score = result[1]
                    else:
                        fuzzy_hash = tlsh.hash(bytes(response.text, 'utf-8'))
                        Site.objects.filter(pk=site.pk).update(content_fuzzy_hash=fuzzy_hash, web_status=200)
            else:
                print(str(timezone.now()) + " - " + "Status code: ", str(response.status_code))
                Site.objects.filter(pk=site.pk).update(web_status=response.status_code)
        except requests.exceptions.RequestException:
            Site.objects.filter(pk=site.pk).update(web_status=None)
            print(str(timezone.now()) + " - ", site.domain_name, " is unreachable.")

    return alert, score


def tlsh_score(response, site, alert):
    """
    Caculate TLSH Score.

    :param response: Http response.
    :param site: Site Object.
    :param alert: Alert Integer.
    :return: alert, score
    :rtype: int, int
    """
    fuzzy_hash = tlsh.hash(bytes(response.text, 'utf-8'))
    score = tlsh.diffxlen(site.content_fuzzy_hash, fuzzy_hash)
    if score > 160:
        alert += 4
        Site.objects.filter(pk=site.pk).update(content_fuzzy_hash=fuzzy_hash)
    return alert, score


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

        if site.ip_monitoring:
            # Check if the first ip is in the same subnet
            if len(addrs) >= 1 and (site.ip and ipaddress.ip_address(addrs[0][4][0]) not in ipaddress.ip_network(
                    site.ip + "/16", strict=False)) or site.ip is None:
                alert += 1

            if len(addrs) >= 2:
                # Check if the second ip is in the same subnet
                if (site.ip_second and ipaddress.ip_address(addrs[1][4][0]) not in ipaddress.ip_network(
                        site.ip_second + "/16", strict=False)) or site.ip_second is None:
                    alert += 2
            elif site.ip_second:
                alert += 2
                new_ip_second = None
                Site.objects.filter(pk=site.pk).update(ip_second=new_ip_second)

            if len(addrs) == 3:
                print(str(timezone.now()) + " - ", "Found third ip (", addrs[2][4][0], ") for => ",
                      str(site.domain_name))

        # Even if the new first/second ip are in the same subnet we change it in database
        if len(addrs) >= 1:
            new_ip = addrs[0][4][0]
            Site.objects.filter(pk=site.pk).update(ip=new_ip)

        if len(addrs) >= 2:
            new_ip_second = addrs[1][4][0]
            Site.objects.filter(pk=site.pk).update(ip_second=new_ip_second)
        else:
            Site.objects.filter(pk=site.pk).update(ip_second=None)

    except socket.gaierror:
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
    except(resolver.NoAnswer, resolver.NXDOMAIN, resolver.NoNameservers, DNSException):
        if Site.objects.get(pk=site.pk).MX_records != []:
            Site.objects.filter(pk=site.pk).update(MX_records=[])
            alert_mx = True

    try:
        mail_ip = str(resolv.resolve('mail.' + site.domain_name, 'A')[0])
        if site.mail_A_record_ip is None or ipaddress.ip_address(mail_ip) not in ipaddress.ip_network(
                site.mail_A_record_ip + "/16", strict=False):
            alert_a_ip = True
        Site.objects.filter(pk=site.pk).update(mail_A_record_ip=mail_ip)
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
                    
        send_website_monitoring_notifications(site, alert_data)


def send_website_monitoring_notifications(site, alert_data):
    """
    Sends notifications to Slack, Citadel, TheHive or Email based on Site Monitoring.
    
    Args:
        site (Site): The object representing the site to monitor.
        alert_data (dict): The alert data associated with the site.
    """
    subscribers = Subscriber.objects.filter(
        (Q(slack=True) | Q(citadel=True) | Q(thehive=True) | Q(email=True))
    )

    if not subscribers.exists():
        print(f"{timezone.now()} - No subscribers for Site Monitoring, no message sent.")
        return


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