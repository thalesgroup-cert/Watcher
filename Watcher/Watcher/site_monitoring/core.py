# coding=utf-8
from __future__ import unicode_literals

import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from django.db import close_old_connections
from django.conf import settings
from django.utils import timezone
from datetime import timedelta
from apscheduler.schedulers.background import BackgroundScheduler
from .models import Site, Alert, Subscriber
import tlsh
import requests
import socket
import ipaddress
from dns import resolver
from dns.exception import DNSException
import shadow_useragent

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
    scheduler = BackgroundScheduler()

    scheduler.add_job(monitoring_check, 'cron', day_of_week='mon-sun', minute='*/6', id='weekend_job',
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
             'old_ip': site.ip, 'old_ip_second': site.ip_second}
    }

    if site.monitored and alert != 0:
        alert_data = alert_types[alert]
        new_alert = Alert.objects.create(site=site, **alert_data)

        if not previous_alert(site, alert_data['type'], new_alert.pk):
            send_email(alert_data['type'] + " on " + site.domain_name, site.rtir, new_alert.pk)

            # Handle Mail record for mail changes
            if 'Mail' in alert_data['type']:
                if site.MX_records != Site.objects.get(pk=site.pk).MX_records:
                    Alert.objects.filter(pk=new_alert.pk).update(old_MX_records=site.MX_records,
                                                                 new_MX_records=Site.objects.get(pk=site.pk).MX_records)
                try:
                    if ipaddress.ip_address(site.mail_A_record_ip) not in ipaddress.ip_network(
                            Site.objects.get(pk=site.pk).mail_A_record_ip + "/16", strict=False):
                        Alert.objects.filter(pk=new_alert.pk).update(old_mail_A_record_ip=site.mail_A_record_ip,
                                                                     new_mail_A_record_ip=Site.objects.get(
                                                                         pk=site.pk).mail_A_record_ip)
                except Exception:
                    if Site.objects.get(pk=site.pk).mail_A_record_ip is not None or site.mail_A_record_ip is not None:
                        Alert.objects.filter(pk=new_alert.pk).update(old_mail_A_record_ip=site.mail_A_record_ip,
                                                                     new_mail_A_record_ip=Site.objects.get(
                                                                         pk=site.pk).mail_A_record_ip)


def send_email(message, rtir, alert_id):
    """
    Send Email alert.

    :param alert_id: Alert ID.
    :param message: Subject email end message.
    :param rtir: Identification number of RTIR.
    :return:
    """
    emails_to = list()
    # Get all subscribers email
    for subscriber in Subscriber.objects.all():
        emails_to.append(subscriber.user_rec.email)

    # If there is at least one subscriber
    if len(emails_to) > 0:
        # RTIR Ticket
        try:
            msg = MIMEMultipart()
            msg['From'] = settings.EMAIL_FROM
            msg['To'] = ','.join(emails_to)
            msg['Subject'] = "[" + settings.EMAIL_SUBJECT_TAG_SITE_MONITORING + " #" + str(rtir) + "] " + message
            body = message
            body += u"""\
            Alert ID: """ + str(alert_id)
            body += u"""\
            Link: """ + settings.WATCHER_URL + "/#/website_monitoring"
            msg.attach(MIMEText(body))
            text = msg.as_string()
            smtp_server = smtplib.SMTP(settings.SMTP_SERVER)
            smtp_server.sendmail(settings.EMAIL_FROM, emails_to, text)
            smtp_server.quit()

        except Exception as e:
            # Print any error messages to stdout
            print(str(timezone.now()) + " - Email Error : ", e)
        finally:
            for email in emails_to:
                print(str(timezone.now()) + " - Email sent to ", email)
    else:
        print(str(timezone.now()) + " - No subscriber, no email sent.")
