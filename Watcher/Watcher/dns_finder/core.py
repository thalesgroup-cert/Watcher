import os
import six
import subprocess
import json
from django.utils import timezone
from django.conf import settings
from .mail_template.default_template import get_template
from .mail_template.group_template import get_group_template
from apscheduler.schedulers.background import BackgroundScheduler
from .models import Alert, DnsMonitored, DnsTwisted, Subscriber
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
import smtplib


def start_scheduler():
    """
    Launch multiple planning tasks in background:
        - Fire main_dns_twist from Monday to Sunday : Every 2 hours.
    """
    scheduler = BackgroundScheduler()

    scheduler.add_job(main_dns_twist, 'cron', day_of_week='mon-sun', hour='*/2', id='weekend_job',
                      max_instances=10,
                      replace_existing=True)

    scheduler.start()


def main_dns_twist():
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
                if 'dns-a' in twisted_website_dict:
                    if twisted_website_dict['dns-a'] != ['!ServFail']:
                        dns_a = True
                if 'dns-aaaa' in twisted_website_dict:
                    if twisted_website_dict['dns-aaaa'] != ['!ServFail']:
                        dns_aaaa = True
                if 'dns-mx' in twisted_website_dict:
                    if twisted_website_dict['dns-mx'] != ['!ServFail']:
                        dns_mx = True
                if 'dns-ns' in twisted_website_dict:
                    if twisted_website_dict['dns-ns'] != ['!ServFail']:
                        dns_ns = True
                # Check if there is at least one DNS entry
                if dns_ns or dns_a or dns_aaaa or dns_mx:
                    if twisted_website_dict['domain-name'] != dns_monitored.domain_name:
                        # If it is a new domain name, we create it
                        if not DnsTwisted.objects.filter(domain_name=twisted_website_dict['domain-name']):
                            dns_twisted = DnsTwisted.objects.create(domain_name=twisted_website_dict['domain-name'],
                                                                    dns_monitored=dns_monitored,
                                                                    fuzzer=twisted_website_dict['fuzzer'])
                            alert = Alert.objects.create(dns_twisted=dns_twisted)
                            alerts_list.append(alert)
            # Send email alerts
            if len(alerts_list) < 6:
                for alert in alerts_list:
                    send_email(alert)
            if len(alerts_list) >= 6:
                send_group_email(dns_monitored, len(alerts_list))
        except ValueError:
            print('Decoding JSON has failed')

    print(str(timezone.now()) + " - " + "dnstwist: Successfully processed: ", dns_monitored.domain_name)


def send_email(alert):
    """
    Send e-mail alert.

    :param alert: Alert Object.
    """
    emails_to = list()
    # Get all subscribers email
    for subscriber in Subscriber.objects.all():
        emails_to.append(subscriber.user_rec.email)

    # If there is at least one subscriber
    if len(emails_to) > 0:
        try:
            msg = MIMEMultipart()
            msg['From'] = settings.EMAIL_FROM
            msg['To'] = ','.join(emails_to)
            msg['Subject'] = str("[ALERT #" + str(alert.pk) + "] DNS Finder")
            body = get_template(alert)
            msg.attach(MIMEText(body, 'html', _charset='utf-8'))
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


def send_group_email(dns_monitored, alerts_number):
    """
    Send group e-mail for a specific dns_monitored.

    :param dns_monitored: DnsMonitored Object.
    :param alerts_number: Number of alerts.
    """
    emails_to = list()
    # Get all subscribers email
    for subscriber in Subscriber.objects.all():
        emails_to.append(subscriber.user_rec.email)

    # If there is at least one subscriber
    if len(emails_to) > 0:
        try:
            msg = MIMEMultipart()
            msg['From'] = settings.EMAIL_FROM
            msg['To'] = ','.join(emails_to)
            msg['Subject'] = str("[" + str(alerts_number) + " ALERTS] DNS Finder")
            body = get_group_template(dns_monitored, alerts_number)
            msg.attach(MIMEText(body, 'html', _charset='utf-8'))
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
