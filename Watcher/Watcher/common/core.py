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
from .mail_template.data_leak_group_template import get_data_leak_group_template
from .mail_template.site_monitoring_template import get_site_monitoring_template
from .mail_template.dns_finder_template import get_dns_finder_template
from .mail_template.dns_finder_cert_transparency import get_dns_finder_cert_transparency_template
from .mail_template.dns_finder_group_template import get_dns_finder_group_template
from .utils.send_thehive_alerts import send_thehive_alert
from .utils.update_thehive import search_thehive_for_ticket_id, update_existing_alert_case, create_new_alert


def generate_ref():
    """
    Generate unique 'sourceRef' for an alert.
    """
    ref = datetime.now().strftime("%y%m%d") + "-" + str(token_hex(3))[:5]
    return ref

SLACK_CHANNEL = getattr(settings, 'SLACK_CHANNEL', '')
CITADEL_ROOM_ID = getattr(settings, 'CITADEL_ROOM_ID', '')
SUBJECT_TAG_SITE_MONITORING = getattr(settings, 'SUBJECT_TAG_SITE_MONITORING', '')

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
        'channel': SLACK_CHANNEL,
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
        'channel': SLACK_CHANNEL,
        'url_suffix': '#data_leak',
    },
    'data_leak_group': {
        'content_template': (
            "*[{alerts_number} ALERTS] 🚨 Data Leak 🚨*\n\n"
            "Dear team,\n\n"
            "*{alerts_number}* new data leakage alerts have been detected for the keyword *{keyword}*\n\n"
            "Please, find more details <{details_url}|here>."
        ),
        'channel': SLACK_CHANNEL,
        'url_suffix': '#data_leak',
    },
    'website_monitoring': {
        'content_template': (
            f"*[{SUBJECT_TAG_SITE_MONITORING}" "{ticket_id}] 🔔 {alert_type} on {domain_name_sanitized} 🔔*\n\n"
            "Dear team,\n\n"
            "Please find the new incident detected below:\n\n"
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
        'channel': SLACK_CHANNEL,
        'url_suffix': '#/website_monitoring/',
    },
    'dns_finder': {
        'content_template': (
            "*[DNS FINDER - ALERT #{alert.pk}] 🚨 Suspicious DNS Detected: {dns_domain_name_sanitized} 🚨*\n\n"
            "Dear team,\n\n"
            "New Twisted DNS found: \n\n"
            "*• Twisted DNS:* {dns_domain_name_sanitized}\n"
            "*• Corporate Keyword:* {alert.dns_twisted.keyword_monitored}\n"
            "*• Corporate DNS:* {alert.dns_twisted.dns_monitored}\n"
            "*• Fuzzer:* {alert.dns_twisted.fuzzer}\n\n"
            "Please, find more details <{details_url}|here>."
        ),
        'channel': SLACK_CHANNEL,
        'url_suffix': '#/dns_finder/',
    },
    'dns_finder_group': {
        'content_template': (
            "*[{alerts_number} ALERTS] 🚨 DNS Finder 🚨*\n\n"
            "Dear team,\n\n"
            "*{alerts_number}* New DNS Twisted Alerts for *{dns_domain_name_sanitized_group}* asset.\n\n"
            "Please, find more details <{details_url}|here>."
        ),
        'channel': SLACK_CHANNEL,
        'url_suffix': '#/dns_finder/',
    },
}

# Configuration for Citadel
APP_CONFIG_CITADEL = {
    'threats_watcher': {
        'content_template': (
            "<p><strong><h4>[THREATS WATCHER - WARNING] 🔥 Trendy Threats Detected 🔥</h4></strong></p>"
            "<p>Dear team,</p>"
            "<p>Please find the new trendy word(s) detected below:</p>"
            "<ul><strong>{words_list}</strong></ul>"
            "<p>Please, find more details <a href='{details_url}'>here</a>.</p>"
        ),
        'citadel_room_id': CITADEL_ROOM_ID,
        'url_suffix': '#/',
    },
    'data_leak': {
        'content_template': (
            "<p><strong><h4>[DATA LEAK - ALERT #{alert_pk}] 🔔 Data Leak Detected: {keyword_name} 🔔</h4></strong></p>"
            "<p>Dear team,</p>"
            "<p>New Data Leakage Alert for {keyword_name} keyword:</p>"
            "<ul>"
            "<li><strong>Keyword:</strong> {keyword_name}</li>"
            "<li><strong>Source:</strong> {url}</li>"
            "</ul>"
            "<p>Please, find more details <a href='{details_url}'>here</a>.</p>"
        ),
        'citadel_room_id': CITADEL_ROOM_ID,
        'url_suffix': '#data_leak',
    },
    'data_leak_group': {
        'content_template': (
            "<p><strong><h4>[{alerts_number} ALERTS] 🚨 Data Leak 🚨</h4></strong></p>"
            "<p>Dear team,</p>"
            "<p><strong>{alerts_number}</strong> new data leakage alerts have been detected for the keyword <strong>{keyword}</strong>.</p>"
            "<p>Please, find more details <a href='{details_url}'>here</a>.</p>"
        ),
        'citadel_room_id': CITADEL_ROOM_ID,
        'url_suffix': '#data_leak',
    },
    'website_monitoring': {
        'content_template': (
            f"<p><strong><h4>[{SUBJECT_TAG_SITE_MONITORING}{{ticket_id}}] 🔔 {{alert_type}} on {{domain_name_sanitized}} 🔔</h4></strong></p>"
            "<p>Dear team,</p>"
            "<p>Please find the new incident detected below:</p>"
            "<ul>"
            "<li><strong>Difference Score:</strong> {difference_score}</li>"
            "<li><strong>New Ip:</strong> {new_ip}</li>"
            "<li><strong>Old Ip:</strong> {old_ip}</li>"
            "<li><strong>New Ip Second:</strong> {new_ip_second}</li>"
            "<li><strong>Old IP Second:</strong> {old_ip_second}</li>"
            "<li><strong>New MX Records:</strong> {new_mx_records}</li>"
            "<li><strong>Old MX Records:</strong> {old_mx_records}</li>"            
            "<li><strong>New Mail Server:</strong> {new_mail_A_record_ip}</li>"
            "<li><strong>Old Mail Server:</strong> {old_mail_A_record_ip}</li>"
            "</ul>"
            "<p>Please, find more details <a href='{details_url}'>here</a>.</p>"
        ),
        'citadel_room_id': CITADEL_ROOM_ID,
        'url_suffix': '#/website_monitoring/',
    },
    'dns_finder': {
        'content_template': (
            "<p><strong><h4>[DNS FINDER - ALERT #{alert.pk}] 🚨 Suspicious DNS Detected: {dns_domain_name_sanitized} 🚨</h4></strong></p>"
            "<p>Dear team,</p>"
            "<p>New Twisted DNS found:</p>"
            "<ul>"
            "<li><strong>Twisted DNS:</strong> {dns_domain_name_sanitized}</li>"
            "<li><strong>Corporate Keyword:</strong> {alert.dns_twisted.keyword_monitored}</li>"
            "<li><strong>Corporate DNS:</strong> {alert.dns_twisted.dns_monitored}</li>"
            "<li><strong>Fuzzer:</strong> {alert.dns_twisted.fuzzer}</li>"
            "</ul>"
            "<p>Please, find more details <a href='{details_url}'>here</a>.</p>"
        ),
        'citadel_room_id': CITADEL_ROOM_ID,
        'url_suffix': '#/dns_finder/',
    },
    'dns_finder_group': {
        'content_template': (
            "<p><strong><h4>[{alerts_number} ALERTS] 🚨 DNS Finder 🚨</h4></strong></p>"
            "<p>Dear team,</p>"
            "<p><strong>{alerts_number}</strong> New DNS Twisted Alerts for <strong>{dns_domain_name_sanitized_group}</strong> asset.</p>"
            "<p>Please, find more details <a href='{details_url}'>here</a>.</p>"
        ),
        'citadel_room_id': CITADEL_ROOM_ID,
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
        'severity': 1,
        'tlp': 1,
        'pap': 1,
        'tags': settings.THE_HIVE_TAGS
    },
    'data_leak': {
        'title': "New Data Leakage - Alert #{alert_pk} for {keyword_name} keyword",
        'description_template': (
            "**Alert:**\n"
            "**New data leak detected:**\n"
            "*Keyword:* {keyword_name}\n"
            "*Source:* {url}\n"
        ),
        'severity': 1,
        'tlp': 1,
        'pap': 1,
        'tags': settings.THE_HIVE_TAGS
    },
    'website_monitoring': {
        'title': "Website Monitoring Detected - {alert_type} on {domain_name_sanitized}",
        'description_template': (
            "**Alert:**\n"
            "**New website monitoring incident detected:**\n"
            "*Type of alert:* {alert_type}\n"
            "*Domain name:* {domain_name_sanitized}\n"
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
        'severity': 1,
        'tlp': 1,
        'pap': 1,
        'tags': settings.THE_HIVE_TAGS
    },
    'dns_finder': {
        'title': "New Twisted DNS found - {dns_domain_name_sanitized}",
        'description_template': (
            "**Alert:**\n"
            "**New Twisted DNS found:**\n"
            "*Twisted DNS:* {dns_domain_name_sanitized}\n"
            "*Corporate Keyword:* {alert.dns_twisted.keyword_monitored}\n"
            "*Corporate DNS:* {alert.dns_twisted.dns_monitored}\n"
            "*Fuzzer:* {alert.dns_twisted.fuzzer}\n"
        ),
        'severity': 1,
        'tlp': 1,
        'pap': 1,
        'tags': settings.THE_HIVE_TAGS
    },
}


# Configuration for Email
APP_CONFIG_EMAIL = {
    'threats_watcher': {
        'subject': "[WARNING] Threats Watcher buzzword detected",
        'template_func': get_threats_watcher_template,
    },
    'data_leak': {
        'subject': "[ALERT #{alert_pk}] Data Leak",
        'template_func': get_data_leak_template,
    },
    'data_leak_group': {
        'subject': "[{alerts_number} ALERTS] Data Leak",
        'template_func': get_data_leak_group_template,
    },
    'website_monitoring': {
        'subject': '[' + SUBJECT_TAG_SITE_MONITORING + '{ticket_id}] {alert_type} on {domain_name_sanitized}',
        'template_func': get_site_monitoring_template,
    },
    'dns_finder': {
        'subject': "[ALERT #{alert.pk}] DNS Finder",
        'template_func': get_dns_finder_template,
    },
    'dns_finder_cert_transparency': {
        'subject': "[ALERT #{alert.pk}] DNS Finder",
        'template_func': get_dns_finder_cert_transparency_template,
    },
    'dns_finder_group': {
        'subject': "[{alerts_number} ALERTS] DNS Finder",
        'template_func': get_dns_finder_group_template,
    },
}


def collect_observables(app_name, context_data):
    """
    Collect observables based on app and context data.
    """
    observables = []

    if app_name == 'threats_watcher':
        email_words = context_data.get('email_words', [])
        for word in email_words:
            clean_word = re.sub(r'<[^>]*>', '', word) 
            if re.match(r'^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$', clean_word): 
                observables.append({"dataType": "domain", "data": clean_word})
            else:
                observables.append({"dataType": "other", "data": clean_word})

    elif app_name == 'website_monitoring':
        site = context_data.get('site')
        alert_data = context_data.get('alert_data', {})
        alert_type = alert_data.get('type') 
        if site:
            domain_tag = f"domain_name:{site.domain_name}" 
            observable = {"dataType": "domain", "data": site.domain_name, "tags": [domain_tag]}
            observables.append(observable)
            if alert_data.get('new_ip'):
                observable = {"dataType": "ip", "data": alert_data['new_ip'], "tags": [domain_tag, f"type:{alert_type}", "details:new_ip"]}
                observables.append(observable)
            if alert_data.get('old_ip'):
                observable = {"dataType": "ip", "data": alert_data['old_ip'], "tags": [domain_tag, f"type:{alert_type}", "details:old_ip"]}
                observables.append(observable)
            if alert_data.get('new_ip_second'):
                observable = {"dataType": "ip", "data": alert_data['new_ip_second'], "tags": [domain_tag, f"type:{alert_type}", "details:new_ip_second"]}
                observables.append(observable)
            if alert_data.get('old_ip_second'):
                observable = {"dataType": "ip", "data": alert_data['old_ip_second'], "tags": [domain_tag, f"type:{alert_type}", "details:old_ip_second"]}
                observables.append(observable)
            if alert_data.get('new_MX_records'):
                observable = {"dataType": "other", "data": alert_data['new_MX_records'], "tags": [domain_tag, f"type:{alert_type}", "details:new_MX_records"]}
                observables.append(observable)
            if alert_data.get('old_MX_records'):
                observable = {"dataType": "other", "data": alert_data['old_MX_records'], "tags": [domain_tag, f"type:{alert_type}", "details:old_MX_records"]}
                observables.append(observable)
            if alert_data.get('new_mail_A_record_ip'):
                observable = {"dataType": "ip", "data": alert_data['new_mail_A_record_ip'], "tags": [domain_tag, f"type:{alert_type}", "details:new_mail_A_record_ip"]}
                observables.append(observable)
            if alert_data.get('old_mail_A_record_ip'):
                observable = {"dataType": "ip", "data": alert_data['old_mail_A_record_ip'], "tags": [domain_tag, f"type:{alert_type}", "details:old_mail_A_record_ip"]}
                observables.append(observable)

    elif app_name == 'data_leak':
        alert = context_data.get('alert')
        if alert:
            observable = {"dataType": "url", "data": alert.url, "tags": []}
            if alert.keyword:
                observable["tags"].append(f"keyword:{alert.keyword.name}")
            observables.append(observable)

    elif app_name == 'dns_finder':
        alert = context_data.get('alert')
        if alert:
            observable = {"dataType": "domain", "data": alert.dns_twisted.domain_name, "tags": []}
            if alert.dns_twisted.fuzzer:
                observable["tags"].append(f"fuzzer:{alert.dns_twisted.fuzzer}")
            if alert.dns_twisted.dns_monitored:
                observable["tags"].append(f"corporate_dns:{alert.dns_twisted.dns_monitored.domain_name}")
            if alert.dns_twisted.keyword_monitored:
                observable["tags"].append(f"corporate_keyword:{alert.dns_twisted.keyword_monitored.name}")

            observables.append(observable)

    observables = [observable for observable in observables if observable['data'] is not None and observable['data'] != 'None']

    return observables


def remove_html_tags(text):
    """
    Remove HTML tags from a string.
    """
    clean = re.compile('<.*?>')
    return re.sub(clean, '', text)


def send_app_specific_notifications(app_name, context_data, subscribers):
    """
    Send notifications based on app type (Slack, Citadel, TheHive, Email).
    Collect observables, format content, and send to respective channels.
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
                'ticket_id': f" - #{site.ticket_id}" if site.ticket_id else '',
                'alert_type': alert_data.get('type', None),
                'domain_name': site.domain_name,
                'domain_name_sanitized': site.domain_name.replace('.', '[.]'),
                'difference_score': alert_data.get('difference_score', None),
                'new_ip': alert_data.get('new_ip', None),
                'old_ip': alert_data.get('old_ip', None),
                'new_ip_second': alert_data.get('new_ip_second', None),
                'old_ip_second': alert_data.get('old_ip_second', None),
                'new_mx_records': alert_data.get('new_MX_records', None),
                'old_mx_records': alert_data.get('old_MX_records', None),
                'new_mail_A_record_ip': alert_data.get('new_mail_A_record_ip', None),
                'old_mail_A_record_ip': alert_data.get('old_mail_A_record_ip', None),
                'details_url': settings.WATCHER_URL + app_config_slack['url_suffix'],
                'app_name': 'website_monitoring'
            }

            email_words = context_data.get('alert', [])
            website_url = site.domain_name
            alert_id = alert_data.get('id', '-')
            email_body = get_site_monitoring_template(website_url, alert_id, alert_data)


        elif app_name == 'data_leak':
            alert = context_data.get('alert')

            if not alert:
                return
            
            common_data = {
                'alert_pk': alert.pk,
                'keyword_name': alert.keyword.name,
                'url': alert.url,
                'content': alert.content[:200],
                'details_url': settings.WATCHER_URL + app_config_slack['url_suffix'],
                'app_name': 'data_leak'
            }
            email_words = context_data.get('alert', [])
            email_body = get_data_leak_template(alert)


        elif app_name == 'dns_finder':
            alert = context_data.get('alert')
            parent_ticket_id = context_data.get('parent_ticket_id')

            if not alert or not alert.dns_twisted or not alert.dns_twisted.domain_name:
                print(f"{timezone.now()} - No valid alert data found or DNS Twisted information missing.")
                return

            current_time = timezone.now()
            subdomain = alert.dns_twisted.domain_name
            parent_domain = '.'.join(subdomain.split('.')[-2:])
            is_parent_domain = subdomain == parent_domain

            dns_domain_name_sanitized = (
                getattr(alert.dns_twisted, 'dns_domain_name_sanitized', None) or 
                alert.dns_twisted.domain_name.replace('.', '[.]')
            )

            if subscribers.filter(thehive=True).exists():
                source = context_data.get('source')

                parent_site = Site.objects.filter(domain_name=parent_domain).first()
                ticket_id = parent_site.ticket_id if parent_site else None
                relevant_ticket_id = ticket_id if ticket_id else parent_ticket_id

                observables = collect_observables(app_name, context_data)

            if is_parent_domain:

                if app_config_thehive:
                    common_data = {
                        'alert': alert,
                        'dns_domain_name_sanitized': dns_domain_name_sanitized,
                        'details_url': settings.WATCHER_URL + app_config_slack['url_suffix'],
                        'app_name': 'dns_finder'
                    }

                    formatted_title = app_config_thehive['title'].format(**common_data)

                    send_notification(
                        channel="thehive",
                        content_template=app_config_thehive['description_template'],
                        subscribers_filter={'thehive': True},
                        send_func=lambda content: send_thehive_alert(
                            title=formatted_title,
                            description=content,
                            severity=app_config_thehive['severity'],
                            tlp=app_config_thehive['tlp'],
                            pap=app_config_thehive['pap'],
                            tags=app_config_thehive['tags'] + [
                                f"Detected fuzzer: {alert.dns_twisted.fuzzer}",
                                f"Detected keyword: {alert.dns_twisted.keyword_monitored}",
                                f"Domain name: {dns_domain_name_sanitized}"
                            ],
                            app_name=app_name,
                            domain_name=parent_domain,
                            observables=observables
                        ),
                        **common_data
                    )

            else:
                for observable in observables:
                    if parent_domain:
                        observable["tags"].append(f"parent_domain:{parent_domain}")

                current_time_str = current_time.strftime("%H:%M:%S")
                current_date_str = current_time.strftime("%Y-%m-%d")

                comment = (
                    f"A change was processed by {app_name} at {current_time_str} on {current_date_str}.\n\n"
                    f"A new subdomain has been detected: {subdomain}, associated with the parent domain {parent_domain}.\n\n"
                    "The associated observables have been handled in the dedicated section."
                )

                if relevant_ticket_id:
                    alert_type, alert_item = search_thehive_for_ticket_id(
                        relevant_ticket_id,
                        thehive_url=settings.THE_HIVE_URL,
                        api_key=settings.THE_HIVE_KEY,
                        item_type="alert"
                    )
                    case_type, case_item = search_thehive_for_ticket_id(
                        relevant_ticket_id,
                        thehive_url=settings.THE_HIVE_URL,
                        api_key=settings.THE_HIVE_KEY,
                        item_type="case"
                    )

                    if case_item:
                        print(f"{timezone.now()} - Updating existing case for ticket_id {relevant_ticket_id}")
                        update_existing_alert_case(
                            item_type="case",
                            existing_item=case_item,
                            observables=observables,
                            comment=comment,
                            thehive_url=settings.THE_HIVE_URL,
                            api_key=settings.THE_HIVE_KEY
                        )
                    elif alert_item:
                        print(f"{timezone.now()} - Updating existing alert for ticket_id {relevant_ticket_id}")
                        update_existing_alert_case(
                            item_type="alert",
                            existing_item=alert_item,
                            observables=observables,
                            comment=comment,
                            thehive_url=settings.THE_HIVE_URL,
                            api_key=settings.THE_HIVE_KEY
                        )
                    else:
                        print(f"{timezone.now()} - No existing alert or case found for ticket_id {relevant_ticket_id}. Creating new alert.")
                        create_new_alert(
                            ticket_id=relevant_ticket_id,
                            title=f"New Twisted DNS found - {parent_domain}",
                            description=(
                                f"**Alert:**\n"
                                f"**New Twisted DNS Found:**\n"
                                f"Subdomain: {subdomain}\n"
                                f"Parent Domain: {parent_domain}\n"
                                f"Corporate Keyword: {alert.dns_twisted.keyword_monitored}\n"
                                f"Corporate DNS: {alert.dns_twisted.dns_monitored}\n"
                                f"Fuzzer: {alert.dns_twisted.fuzzer}\n"
                            ),
                            severity=app_config_thehive['severity'],
                            tlp=app_config_thehive['tlp'],
                            pap=app_config_thehive['pap'],
                            tags=app_config_thehive['tags'] + [
                                f"Detected fuzzer: {alert.dns_twisted.fuzzer}",
                                f"Detected keyword: {alert.dns_twisted.keyword_monitored}",
                                f"Domain name: {dns_domain_name_sanitized}"
                            ],
                            app_name='dns_finder',
                            observables=observables,
                            customFields={
                                settings.THE_HIVE_CUSTOM_FIELD: {"string": relevant_ticket_id},
                                "email-sender": {"string": settings.THE_HIVE_EMAIL_SENDER},
                            },
                            comment=comment,
                            thehive_url=settings.THE_HIVE_URL,
                            api_key=settings.THE_HIVE_KEY
                        )

                else:
                    print(f"{timezone.now()} - Parent domain {parent_domain} is not monitored, following standard DNS Finder process.")

                    send_thehive_alert(
                        title=f"New Twisted DNS found - {subdomain}",
                        description=(
                            f"**Alert:**\n"
                            f"**New Twisted DNS Found:**\n"
                            f"Subdomain: {subdomain}\n"
                            f"Parent Domain: {parent_domain}\n"
                            f"Corporate Keyword: {alert.dns_twisted.keyword_monitored}\n"
                            f"Corporate DNS: {alert.dns_twisted.dns_monitored}\n"
                            f"Fuzzer: {alert.dns_twisted.fuzzer}\n"
                        ),
                        severity=app_config_thehive['severity'],
                        tlp=app_config_thehive['tlp'],
                        pap=app_config_thehive['pap'],
                        tags=app_config_thehive['tags'] + [
                            f"Detected fuzzer: {alert.dns_twisted.fuzzer}",
                            f"Detected keyword: {alert.dns_twisted.keyword_monitored}",
                            f"Domain name: {dns_domain_name_sanitized}"
                        ],
                        app_name='dns_finder',
                        domain_name=subdomain,
                        observables=observables,
                        customFields=app_config_thehive.get('customFields'),
                    )

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
                'dns_domain_name_sanitized': dns_domain_name_sanitized,
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

        if app_config_thehive and app_name != 'dns_finder':
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
                        tlp=app_config_thehive['tlp'],
                        pap=app_config_thehive['pap'],
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
                        tlp=app_config_thehive['tlp'],
                        pap=app_config_thehive['pap'],
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

    except Exception as e:
        print(f"{datetime.now()} - Error sending notifications for {app_name}: {str(e)}")


def send_app_specific_notifications_group(app_name, context_data, subscribers):
    """
    Send group notifications based on app type (Slack, Citadel, Email).
    """
    app_config_slack = APP_CONFIG_SLACK.get(app_name)
    app_config_citadel = APP_CONFIG_CITADEL.get(app_name)
    app_config_email = APP_CONFIG_EMAIL.get(app_name)

    if not (app_config_slack or app_config_citadel or app_config_email):
        return

    if not subscribers.exists():
        return

    def send_notification(channel, content_template, subscribers_filter, send_func, **kwargs):
        """Helper to format and send notification based on the channel."""
        if subscribers.filter(**subscribers_filter).exists():
            content = content_template.format(**kwargs)
            send_func(content)

    try:
        common_data = {}

        if app_name == 'data_leak_group':
            alerts_number = context_data.get('alerts_number')
            keyword = context_data.get('keyword')

            if not keyword:
                return
            
            common_data = {
                'alerts_number': alerts_number,
                'keyword': keyword,
                'details_url': settings.WATCHER_URL + app_config_slack['url_suffix'],
                'app_name': 'data_leak_group'
            }
            email_words = [keyword, alerts_number]
            email_body = get_data_leak_group_template

        elif app_name == 'dns_finder_group':
            dns_monitored = context_data.get('dns_monitored')
            alerts_number = context_data.get('alerts_number')
            
            if not dns_monitored or not alerts_number or not dns_monitored.domain_name:
                return

            common_data = {
                'alerts_number': alerts_number,
                'dns_domain_name_sanitized_group': dns_monitored.domain_name.replace('.', '[.]'),
                'details_url': settings.WATCHER_URL + app_config_slack['url_suffix'],
                'app_name': 'dns_finder_group',
            }
            email_words = [dns_monitored, alerts_number]
            email_body = get_dns_finder_group_template

        # Sending Slack notifications
        send_notification(
            channel="slack",
            content_template=app_config_slack['content_template'],
            subscribers_filter={'slack': True},
            send_func=lambda content: send_slack_message(content, app_config_slack['channel'], app_name),
            **common_data
        )

        # Sending Citadel notifications
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

        if app_config_email:
            email_list = [subscriber.user_rec.email for subscriber in subscribers.filter(email=True)]

            if email_list:
                try:
                    email_subject = app_config_email['subject'].format(**common_data)

                    if app_name == 'data_leak_group':
                        email_body = get_data_leak_group_template(keyword, alerts_number)  
                    elif app_name == 'dns_finder_group':
                        email_body = get_dns_finder_group_template(dns_monitored, alerts_number)
                    else:
                        print(f"Unsupported app_name: {app_name}")
                        return

                    if not isinstance(email_body, str):
                        return

                    send_email_notifications(email_subject, email_body, email_list, app_name)

                except Exception as e:
                    print(f"Error sending email: {e}")
                    return

    except Exception as e:
        print(f"{datetime.now()} - Error sending notifications for {app_name}: {str(e)}")


def send_only_thehive_notifications(app_name, context_data, subscribers):
    """
    Send notifications only to TheHive based on app type.
    Collect observables, format the notification content, and send them to respective channels.
    """
    app_config_thehive = APP_CONFIG_THEHIVE.get(app_name)

    if not app_config_thehive:
        return

    if not subscribers.exists():
        return
    
    observables = collect_observables(app_name, context_data)

    thehive_url = settings.THE_HIVE_URL
    api_key = settings.THE_HIVE_KEY

    def send_notification(channel, content_template, subscribers_filter, send_func, **kwargs):
        if subscribers.filter(**subscribers_filter).exists():
            content = content_template.format(**kwargs)
            send_func(content)

    try:
        common_data = {}
        if app_name == 'data_leak':
            alert = context_data.get('alert')

            if not alert:
                return
            
            common_data = {
                'alert_pk': alert.pk,
                'keyword_name': alert.keyword.name,
                'url': alert.url,
                'content': alert.content[:200],
                'details_url': settings.WATCHER_URL,
                'app_name': 'data_leak'
            }

        elif app_name == 'dns_finder':
            alert = context_data.get('alert')

            if not alert or not alert.dns_twisted or not alert.dns_twisted.domain_name:
                return

            common_data = {
                'alert': alert,
                'dns_domain_name_sanitized': alert.dns_twisted.domain_name.replace('.', '[.]'),
                'details_url': settings.WATCHER_URL,
                'app_name': 'dns_finder'
            }

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
                        tlp=app_config_thehive['tlp'],
                        pap=app_config_thehive['pap'],
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
                        tlp=app_config_thehive['tlp'],
                        pap=app_config_thehive['pap'],
                        tags=app_config_thehive['tags'],
                        app_name=app_name,
                        domain_name=None,
                        observables=observables,
                        customFields=app_config_thehive.get('customFields'),
                        thehive_url=thehive_url,
                        api_key=api_key
                    )

    except Exception as e:
        print(f"{datetime.now()} - Error sending notifications for {app_name}: {str(e)}")