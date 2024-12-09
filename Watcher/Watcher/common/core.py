from .utils.send_slack_messages import send_slack_message
from .utils.send_citadel_messages import send_citadel_message
from .utils.send_email_notifications import send_email_notifications
from django.utils import timezone
from django.conf import settings
import re
from html import unescape
from site_monitoring.models import Site
from datetime import datetime  
from secrets import token_hex  
from .mail_template.threats_watcher_template import get_threats_watcher_template
from .mail_template.data_leak_template import get_data_leak_template
from .mail_template.site_monitoring_template import get_site_monitoring_template
from .mail_template.dns_finder_template import get_dns_finder_template
from .mail_template.dns_finder_cert_transparency import get_dns_finder_cert_transparency_template


def generate_ref():
    """
    Generates a unique 'sourceRef' identifier for an alert.
    
    :return: Unique identifier as a string.
    """
    ref = datetime.now().strftime("%y%m%d") + "-" + str(token_hex(3))[:5]
    return ref


# Configuration for Slack
APP_CONFIG_SLACK = {
    'threats_watcher': {
        'content_template': (
            "*[THREATS WATCHER - WARNING] 🔥 Trendy Threats Detected 🔥*\n\n"
            "Dear team,\n\n"
            "Please find the new trendy word(s) detected below:\n\n"
            "{words_list}\n\n"
            "Please, find more details <{details_url}|here>."
        ),
        'channel': settings.SLACK_CHANNEL,
        'url_suffix': '#/',
    },
    'data_leak': {
        'content_template': (
            "*[DATA LEAK - ALERT #{alert_pk}] 🔔 Data Leak Detected: {keyword_name} 🔔*\n\n"
            "Dear team,\n\n"
            "New Data Leakage Alert for {keyword_name} keyword:\n\n"
            "*• Keyword:* {keyword_name}\n"
            "*• Source:* {url}\n\n"
            "Please, find more details <{details_url}|here>."
        ),
        'channel': settings.SLACK_CHANNEL,
        'url_suffix': '#data_leak',
    },
    'website_monitoring': {
        'content_template': (
            "*[SITE MONITORING - INCIDENT] 🔔 {alert_type} on {domain_name} 🔔*\n\n"
            "Dear team,\n\n"
            "Please find the new incident detected below:\n\n"
            "*• Type of alert:* {alert_type}\n"
            "*• Domain name:* {domain_name}\n"
            "*• Difference Score:* {difference_score}\n"
            "*• New Ip:* {new_ip}\n"
            "*• Old Ip:* {old_ip}\n"
            "*• New Ip Second:* {new_ip_second}\n"
            "*• Old IP Second:* {old_ip_second}\n"
            "*• New MX Records:* {new_mx_records}\n"
            "*• Old MX Records:* {old_mx_records}\n"            
            "*• New Mail Server:* {new_mail_A_record_ip}\n"
            "*• Old Mail Server:* {old_mail_A_record_ip}\n\n"
            "Please, find more details <{details_url}|here>."
        ),
        'channel': settings.SLACK_CHANNEL,
        'url_suffix': '#/website_monitoring/',
    },
    'dns_finder': {
        'content_template': (
            "*[DNS FINDER - ALERT #{alert.pk}] 🚨 Suspicious DNS Detected: {alert.dns_twisted.domain_name} 🚨*\n\n"
            "Dear team,\n\n"
            "New Twisted DNS found: \n\n"
            "*• Twisted DNS:* {alert.dns_twisted.domain_name}\n"
            "*• Corporate Keyword:* {alert.dns_twisted.keyword_monitored}\n"
            "*• Corporate DNS:* {alert.dns_twisted.dns_monitored}\n"
            "*• Fuzzer:* {alert.dns_twisted.fuzzer}\n\n"
            "Please, find more details <{details_url}|here>."
        ),
        'channel': settings.SLACK_CHANNEL,
        'url_suffix': '#/dns_finder/',
    },
}

# Configuration for Citadel
APP_CONFIG_CITADEL = {
    'threats_watcher': {
        'content_template': (
            "<p><strong>[THREATS WATCHER - WARNING] 🔥 Trendy Threats Detected 🔥</strong></p>"
            "<p>Dear team,</p>"
            "<p>Please find the new trendy word(s) detected below:\n</p>"
            "<ul><strong>{words_list}</strong></ul>\n"
            "<p>Please, find more details <a href='{details_url}'>here</a>.</p>"
        ),
        'citadel_room_id': settings.CITADEL_ROOM_ID,
        'url_suffix': '#/',
    },
    'data_leak': {
        'content_template': (
            "<p><strong>[DATA LEAK - ALERT #{alert_pk}] 🔔 Data Leak Detected: {keyword_name} 🔔</strong></p>"
            "<p>Dear team,</p>"
            "<p>New Data Leakage Alert for {keyword_name} keyword:</p>\n"
            "<ul>"
            "<li><strong>Keyword:</strong> {keyword_name}</li>"
            "<li><strong>Source:</strong> {url}</li>\n"
            "</ul>"
            "<p>Please, find more details <a href='{details_url}'>here</a>.</p>"
        ),
        'citadel_room_id': settings.CITADEL_ROOM_ID,
        'url_suffix': '#data_leak',
    },
    'website_monitoring': {
        'content_template': (
            "<p><strong>[SITE MONITORING - INCIDENT] 🔔 {alert_type} on {domain_name} 🔔</strong></p>"
            "<p>Dear team,</p>"
            "<p>Please find the new incident detected below:</p>\n"
            "<ul>"
            "<li><strong>Type of alert:</strong> {alert_type}</li>"
            "<li><strong>Domain name:</strong> {domain_name}</li>"
            "<li><strong>Difference Score:</strong> {difference_score}</li>"
            "<li><strong>New Ip:</strong> {new_ip}</li>"
            "<li><strong>Old Ip:</strong> {old_ip}</li>"
            "<li><strong>New Ip Second:</strong> {new_ip_second}</li>"
            "<li><strong>Old IP Second:</strong> {old_ip_second}</li>"
            "<li><strong>New MX Records:</strong> {new_mx_records}</li>"
            "<li><strong>Old MX Records:</strong> {old_mx_records}</li>"            
            "<li><strong>New Mail Server:</strong> {new_mail_A_record_ip}</li>"
            "<li><strong>Old Mail Server:</strong> {old_mail_A_record_ip}</li>\n"
            "</ul>"
            "<p>Please, find more details <a href='{details_url}'>here</a>.</p>"
        ),
        'citadel_room_id': settings.CITADEL_ROOM_ID,
        'url_suffix': '#/website_monitoring/',
    },
    'dns_finder': {
        'content_template': (
            "<p><strong>[DNS FINDER - ALERT #{alert.pk}] 🚨 Suspicious DNS Detected: {alert.dns_twisted.domain_name} 🚨</strong></p>"
            "<p>Dear team,</p>"
            "<p>New Twisted DNS found:</p>\n"
            "<ul>"
            "<li><strong>Twisted DNS:</strong> {alert.dns_twisted.domain_name}</li>"
            "<li><strong>Corporate Keyword:</strong> {alert.dns_twisted.keyword_monitored}</li>"
            "<li><strong>Corporate DNS:</strong> {alert.dns_twisted.dns_monitored}</li>"
            "<li><strong>Fuzzer:</strong> {alert.dns_twisted.fuzzer}</li>"
            "</ul>"
            "<p>Please, find more details <a href='{details_url}'>here</a>.</p>"
        ),
        'citadel_room_id': settings.CITADEL_ROOM_ID,
        'url_suffix': '#/dns_finder/',
    },
}

# Configuration for TheHive
APP_CONFIG_THEHIVE = {
    'threats_watcher': {
        'title': "Threats Watcher buzzword detected",
        'description_template': (
            "**Alert:**\n"
            "**The following trendy words were detected:**\n"
            "{words_list}"
        ),
        'severity': 2,
        'tags': ["Threats Watcher", "Watcher", "Buzzword", "Trendy Words", "Threat Detection"]
    },
    'data_leak': {
        'title': "New Data Leakage - Alert #{alert_pk} for {keyword_name} keyword",
        'description_template': (
            "**Alert:**\n"
            "**New data leak detected:**\n"
            "*Keyword:* {keyword_name}\n"
            "*Source:* {url}\n"
        ),
        'severity': 3,
        'tags': ["Data Leak", "Watcher", "Sensitive Data", "Leak Detection"]
    },
    'website_monitoring': {
        'title': "Website Monitoring Detected - {alert_type} on {domain_name}",
        'description_template': (
            "**Alert:**\n"
            "**New website monitoring incident detected:**\n"
            "*Type of alert:* {alert_type}\n"
            "*Domain name:* {domain_name}\n"
            "*• Difference Score:* {difference_score}\n"
            "*• New Ip:* {new_ip}\n"
            "*• Old Ip:* {old_ip}\n"
            "*• New Ip Second:* {new_ip_second}\n"
            "*• Old IP Second:* {old_ip_second}\n"
            "*• New MX Records:* {new_mx_records}\n"
            "*• Old MX Records:* {old_mx_records}\n"            
            "*• New Mail Server:* {new_mail_A_record_ip}\n"
            "*• Old Mail Server:* {old_mail_A_record_ip}\n"
        ),
        'severity': 2,
        'tags': ["Website Monitoring", "Watcher", "Incident", "Website", "Domain Name"]
    },
    'dns_finder': {
        'title': "New Twisted DNS found - {alert.dns_twisted.domain_name}",
        'description_template': (
            "**Alert:**\n"
            "**New Twisted DNS found:**\n"
            "*Corporate Keyword:* {alert.dns_twisted.domain_name}\n"
            "*Twisted DNS:* {alert.dns_twisted.keyword_monitored}\n"
            "*Corporate DNS:* {alert.dns_twisted.dns_monitored}\n"
            "*Fuzzer:* {alert.dns_twisted.fuzzer}\n"
        ),
        'severity': 3,
        'tags': ["DNS Finder", "Watcher", "Twisted DNS", "Corporate Keywords", "Corporate DNS Assets"]
    },
}


# Configuration for Email
APP_CONFIG_EMAIL = {
    'threats_watcher': {
        'subject': "[WARNING] Threats Watcher buzzword detected",
        'template_func': get_threats_watcher_template,
    },
    'data_leak': {
        'subject': "[ALERT] Data Leak Detected",
        'template_func': get_data_leak_template,
    },
    'website_monitoring': {
        'subject': "[ALERT] Website Monitoring Detected",
        'template_func': get_site_monitoring_template,
    },
    'dns_finder': {
        'subject': "[ALERT] DNS Finder",
        'template_func': get_dns_finder_template,
    },
    'dns_finder_cert_transparency': {
        'subject': "[ALERT] DNS Finder",
        'template_func': get_dns_finder_cert_transparency_template,
    },
}



def collect_observables(app_name, context_data):
    """
    Collect observables specific to each app based on the context data provided.
    """
    observables = []

    if app_name == 'threats_watcher':
        for word in context_data.get('email_words', []):
            if re.match(r'^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$', word): 
                observables.append({"dataType": "domain", "data": word})
            else:
                observables.append({"dataType": "other", "data": word})

    elif app_name == 'website_monitoring':
        site = context_data.get('site')
        alert_data = context_data.get('alert_data', {})
        if site:
            observables.append({"dataType": "domain", "data": site.domain_name})
            if alert_data.get('new_ip'):
                observables.append({"dataType": "ip", "data": alert_data['new_ip']})
            if alert_data.get('old_ip'):
                observables.append({"dataType": "ip", "data": alert_data['old_ip']})
            if alert_data.get('new_ip_second'):
                observables.append({"dataType": "ip", "data": alert_data['new_ip_second']})
            if alert_data.get('old_ip_second'):
                observables.append({"dataType": "ip", "data": alert_data['old_ip_second']})     
            if alert_data.get('new_mx_records'):
                for mx_record in alert_data['new_mx_records']:
                    observables.append({"dataType": "domain", "data": mx_record})
            if alert_data.get('old_mx_records'):
                for mx_record in alert_data['old_mx_records']:
                    observables.append({"dataType": "domain", "data": mx_record})
            if alert_data.get('new_mail_A_record_ip'):
                observables.append({"dataType": "ip", "data": alert_data['new_mail_A_record_ip']})
            if alert_data.get('old_mail_A_record_ip'):
                observables.append({"dataType": "ip", "data": alert_data['old_mail_A_record_ip']})

    elif app_name == 'data_leak':
        alert = context_data.get('alert')
        if alert:
            observables.append({"dataType": "url", "data": alert.url})
            observables.append({"dataType": "other", "data": alert.keyword.name})

    elif app_name == 'dns_finder':
        alert = context_data.get('alert')
        if alert:
            observables.append({"dataType": "domain", "data": alert.dns_twisted.domain_name})
            if alert.dns_twisted.keyword_monitored:
                observables.append({"dataType": "other", "data": alert.dns_twisted.keyword_monitored.name})
            if alert.dns_twisted.dns_monitored:
                observables.append({"dataType": "domain", "data": alert.dns_twisted.dns_monitored.domain_name})
            if alert.dns_twisted.fuzzer:
                observables.append({"dataType": "other", "data": alert.dns_twisted.fuzzer})

    return observables


def remove_html_tags(text):
    """Remove HTML tags from a text."""
    clean = re.compile('<.*?>')
    return re.sub(clean, '', text)


def send_app_specific_notifications(app_name, context_data, subscribers):
    from .utils.send_thehive_alerts import send_thehive_alert

    """
    Send notifications based on the application type (Slack, Citadel, TheHive cases & alerts, Email).
    Collect observables, format the notification content, and send them to respective channels.
    """
    app_config_slack = APP_CONFIG_SLACK.get(app_name)
    app_config_citadel = APP_CONFIG_CITADEL.get(app_name)
    app_config_thehive = APP_CONFIG_THEHIVE.get(app_name)
    app_config_email = APP_CONFIG_EMAIL.get(app_name)

    if not app_config_slack or not app_config_citadel or not app_config_thehive or not app_config_email:
        return

    if not subscribers.exists():
        return
    
    observables = collect_observables(app_name, context_data)

    thehive_url = settings.THE_HIVE_URL
    api_key = settings.THE_HIVE_KEY

    def send_notification(channel, content_template, subscribers_filter, send_func, **kwargs):
        """Helper to format and send notification based on the channel."""
        if subscribers.filter(**subscribers_filter).exists():
            content = content_template.format(**kwargs)
            send_func(content)

    try:
        common_data = {}
        if app_name == 'threats_watcher':
            words_list = '\n'.join([remove_html_tags(unescape(word)) for word in context_data.get('email_words', [])])
            if not words_list:
                return
            common_data = {
                'words_list': words_list,
                'details_url': settings.WATCHER_URL + app_config_slack['url_suffix'],
                'app_name': 'threats_watcher'
            }

            email_words = context_data.get('email_words', [])
            email_body = get_threats_watcher_template(settings.WORDS_OCCURRENCE, email_words)


        elif app_name == 'website_monitoring':
            site = context_data.get('site')
            alert_data = context_data.get('alert_data', {})
            if not site:
                return
            common_data = {
                'alert_type': alert_data.get('type', 'None'),
                'domain_name': site.domain_name,
                'difference_score': alert_data.get('difference_score', 'None'),
                'new_ip': alert_data.get('new_ip', 'None'),
                'old_ip': alert_data.get('old_ip', 'None'),
                'new_ip_second': alert_data.get('new_ip_second', 'None'),
                'old_ip_second': alert_data.get('old_ip_second', 'None'),
                'new_mx_records': alert_data.get('new_MX_records', 'None'),
                'old_mx_records': alert_data.get('old_MX_records', 'None'),
                'new_mail_A_record_ip': alert_data.get('new_mail_A_record_ip', 'None'),
                'old_mail_A_record_ip': alert_data.get('old_mail_A_record_ip', 'None'),
                'web_status': alert_data.get('web_status', 'N/A'),
                'timestamp': timezone.now().isoformat(),
                'details_url': settings.WATCHER_URL + app_config_slack['url_suffix'],
                'app_name': 'website_monitoring'
            }

            email_words = context_data.get('alert', [])
            website_url = site.domain_name
            alert_id = alert_data.get('id', '-')
            email_body = get_site_monitoring_template(website_url, alert_id, alert_data)
            print(f"alert_data: {alert_data}") 


        elif app_name == 'data_leak':
            alert = context_data.get('alert')
            if not alert:
                return
            common_data = {
                'alert_pk': alert.pk,
                'keyword_name': alert.keyword.name,
                'url': alert.url,
                'content': alert.content[:200],
                'timestamp': alert.created_at.isoformat(),
                'details_url': settings.WATCHER_URL + app_config_slack['url_suffix'],
                'app_name': 'data_leak'
            }
            email_words = context_data.get('alert', [])
            email_body = get_data_leak_template(alert)


        elif app_name == 'dns_finder':
            alert = context_data.get('alert')
            if not alert:
                print("Error: Alert object is None in context_data")
                return
            if not alert.dns_twisted:
                print(f"Error: dns_twisted is missing in alert {alert.pk if alert.pk else 'Unknown'}")
                return
            if not alert.dns_twisted.domain_name:
                print(f"Error: domain_name is missing in dns_twisted for alert {alert.pk if alert.pk else 'Unknown'}")
                return

            source = context_data.get('source')
            if source == 'print_callback':
                email_body = get_dns_finder_cert_transparency_template(alert)
            elif source == 'check_dnstwist':
                email_body = get_dns_finder_template(alert)
            else:
                print(f"Warning: Unknown source '{source}' for alert.")
                email_body = "Alert with no specific model defined."

            common_data = {
                'alert': alert,
                'details_url': settings.WATCHER_URL + app_config_slack['url_suffix'],
                'app_name': 'dns_finder'
            }

        send_notification(
            channel="slack",
            content_template=app_config_slack['content_template'],
            subscribers_filter={'slack': True},
            send_func=lambda content: send_slack_message(content, app_config_slack['channel'], app_name),
            **common_data
        )

        citadel_title = app_config_citadel.get('title', f"[{app_name.upper()}] Incident Alert")
        send_notification(
            channel="citadel",
            content_template=app_config_citadel['content_template'],
            subscribers_filter={'citadel': True},
            send_func=lambda content: send_citadel_message(
                content={  
                    "msgtype": "m.text",
                    "format": "org.matrix.custom.html",
                    "body": citadel_title + " - New Incident Alert", 
                    "formatted_body": content.replace('\n', '<br>')  
                },
                room_id=app_config_citadel['citadel_room_id'], 
                app_name=common_data.get('app_name')  
            ),
            title=citadel_title,
            **common_data
        )

        if app_config_thehive:
            formatted_title = app_config_thehive['title'].format(**common_data)

            domain_name = common_data.get('domain_name')
            if domain_name:
                try:
                    site = Site.objects.get(domain_name=domain_name)
                except Site.DoesNotExist:
                    print(f"{timezone.now()} - Site with domain_name {domain_name} not found.")
                    return

                ticket_id = site.ticket_id

                send_notification(
                    channel="thehive",
                    content_template=app_config_thehive['description_template'],
                    subscribers_filter={'thehive': True},
                    send_func=lambda content: send_thehive_alert(
                        title=formatted_title,
                        description=content,
                        severity=app_config_thehive['severity'],
                        tags=app_config_thehive['tags'],
                        customFields=app_config_thehive.get('customFields'),
                        app_name=app_name,
                        domain_name=site.domain_name,
                        observables=observables
                    ),
                    **common_data
                )
            else:
                if subscribers.filter(thehive=True).exists():
                    send_thehive_alert(
                        title=formatted_title,
                        description=app_config_thehive['description_template'].format(**common_data),
                        severity=app_config_thehive['severity'],
                        tags=app_config_thehive['tags'],
                        app_name=app_name,
                        domain_name=None,
                        observables=observables,
                        customFields=app_config_thehive.get('customFields'),
                        thehive_url=thehive_url,
                        api_key=api_key
                    )

        if app_config_email:
            email_list = [subscriber.user_rec.email for subscriber in subscribers.filter(email=True)]
            
            if email_list:
                email_subject = app_config_email['subject'].format(**common_data)
                send_email_notifications(email_subject, email_body, email_list, app_name)
            else:
                pass

        if app_config_email:
            email_list = [subscriber.user_rec.email for subscriber in subscribers.filter(email=True)]

    except Exception as e:
        print(f"Error sending notifications for {app_name}: {str(e)}")