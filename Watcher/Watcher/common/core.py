import logging
from .utils.send_slack_messages import send_slack_message
from .utils.send_citadel_messages import send_citadel_message
from .utils.send_email_notifications import send_email_notifications
from .utils.rdap import update_domain_registrar_info
from django.utils import timezone
from django.conf import settings
import re
from html import unescape
from site_monitoring.models import Site
from common.models import LegitimateDomain
from datetime import datetime  
from secrets import token_hex  
from .mail_template.threats_watcher_template import get_threats_watcher_template
from .mail_template.threats_watcher_weeklysummary_template import get_threats_watcher_weeklysummary_template
from .mail_template.threats_watcher_breakingnews_template import get_threats_watcher_breakingnews_template
from .mail_template.data_leak_template import get_data_leak_template
from .mail_template.data_leak_group_template import get_data_leak_group_template
from .mail_template.site_monitoring_template import get_site_monitoring_template
from .mail_template.dns_finder_template import get_dns_finder_template
from .mail_template.dns_finder_cert_transparency import get_dns_finder_cert_transparency_template
from .mail_template.dns_finder_group_template import get_dns_finder_group_template
from .mail_template.cyber_watch_template import get_cyber_watch_template
from .mail_template.udrp_template import get_udrp_template
from .utils.send_thehive_alerts import send_thehive_alert
from .utils.update_thehive import search_thehive_for_ticket_id, update_existing_alert_case, create_new_alert, search_thehive_for_observable
import tldextract
from apscheduler.schedulers.background import BackgroundScheduler
import tzlocal
from django.db import close_old_connections


# Configure logger
logger = logging.getLogger('watcher.common')


def start_scheduler():
    """
    Launch multiple planning tasks in background:
        - Fire WHOIS discovery every 30 minute from Monday to Sunday
        - Fire Legitimate Domains RDAP/WHOIS every 30 minutes
        - Fire Monitored Sites RDAP/WHOIS every hour
        - Fire SSL certificate check every 6 hours
    """
    scheduler = BackgroundScheduler(timezone=str(tzlocal.get_localzone()))

    scheduler.add_job(update_domain_registrar_info, 'cron', day_of_week='mon-sun', minute='*/30', id='whois_job',
                      max_instances=10,
                      replace_existing=True)

    scheduler.add_job(update_legitimate_domains_rdap_data, 'cron', day_of_week='mon-sun', minute='*/30', id='legitimate_rdap_job',
                      max_instances=1,
                      replace_existing=True)

    scheduler.add_job(update_monitored_sites_rdap_data, 'cron', day_of_week='mon-sun', hour='*/1', id='monitored_sites_rdap_job',
                      max_instances=1,
                      replace_existing=True)

    scheduler.add_job(update_all_ssl_certificates, 'cron', day_of_week='mon-sun', hour='*/6', id='ssl_check_job',
                      max_instances=1,
                      replace_existing=True)

    from site_monitoring.udrp import check_udrp_statuses
    scheduler.add_job(check_udrp_statuses, 'cron', day_of_week='mon-sun', hour='*/6', id='udrp_check_job',
                      max_instances=1,
                      replace_existing=True)

    scheduler.start()


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
    'threats_watcher_weeklysummary': {
        'content_template': (
            "*📊 Cyber Threat Intelligence Report 📊*\n\n"
            "Dear team, here is the weekly threat intelligence summary:\n\n"
            "{summary_text}\n\n"
            "Please, find more details <{details_url}|here>."
        ),
        'channel': SLACK_CHANNEL,
        'url_suffix': '#/',
    },

    'threats_watcher_breakingnews': {
        'content_template': (
            "*🚨 Critical Threat Alert 🚨*\n\n"
            "Dear team, Watcher has detected a new critical threat alert. Please review the breaking news summary below:\n\n"
            "{summary_text}\n\n"
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
    'cyber_watch_new_cve': {
        'content_template': (
            "*[CYBER WATCH - NEW CVE] 🛡️ {cve_id} detected ({severity})*\n\n"
            "Dear team,\n\n"
            "A new CVE has been fetched:\n\n"
            "*• CVE ID:* {cve_id}\n"
            "*• Severity:* {severity}\n"
            "*• CVSS Score:* {cvss_score}\n"
            "*• Description:* {description}\n\n"
            "Please, find more details <{details_url}|here>."
        ),
        'channel': SLACK_CHANNEL,
        'url_suffix': '#/cyber_watch',
    },
    'cyber_watch_cve_hit': {
        'content_template': (
            "*[CYBER WATCH - CVE HIT] 🎯 Rule '{rule_name}' matched {cve_id}*\n\n"
            "Dear team,\n\n"
            "A CVE watch rule has been triggered:\n\n"
            "*• Rule:* {rule_name}\n"
            "*• CVE ID:* {cve_id}\n"
            "*• Keyword:* {keyword}\n"
            "*• Severity:* {severity}\n\n"
            "Please, find more details <{details_url}|here>."
        ),
        'channel': SLACK_CHANNEL,
        'url_suffix': '#/cyber_watch',
    },
    'cyber_watch_new_victim': {
        'content_template': (
            "*[CYBER WATCH - NEW VICTIM] 🏴‍☠️ {victim_name} ({group_name})*\n\n"
            "Dear team,\n\n"
            "A new ransomware victim has been detected:\n\n"
            "*• Victim:* {victim_name}\n"
            "*• Group:* {group_name}\n"
            "*• Country:* {country}\n"
            "*• Sector:* {sector}\n\n"
            "Please, find more details <{details_url}|here>."
        ),
        'channel': SLACK_CHANNEL,
        'url_suffix': '#/cyber_watch',
    },
    'cyber_watch_victim_hit': {
        'content_template': (
            "*[CYBER WATCH - VICTIM HIT] 🎯 Rule '{rule_name}' matched {victim_name} ({group_name})*\n\n"
            "Dear team,\n\n"
            "A ransomware victim watch rule has been triggered:\n\n"
            "*• Rule:* {rule_name}\n"
            "*• Victim:* {victim_name}\n"
            "*• Group:* {group_name}\n"
            "*• Sector:* {sector}\n"
            "*• Country:* {country}\n"
            "*• Matched Keyword:* {keyword}\n\n"
            "Please, find more details <{details_url}|here>."
        ),
        'channel': SLACK_CHANNEL,
        'url_suffix': '#/cyber_watch',
    },
    'udrp_decision': {
        'content_template': (
            "*[UDRP DECISION] ⚖️ {domain_name_sanitized}*\n\n"
            "Dear team,\n\n"
            "A UDRP decision has been detected for a monitored domain:\n\n"
            "*• Domain:* {domain_name_sanitized}\n"
            "*• Decision:* {decision_label}\n"
            "*• Date:* {date}\n"
            "*• Ticket:* {ticket}\n"
            "*• Source:* udrpsearch.com\n\n"
            "Please, find more details <{details_url}|here>."
        ),
        'channel': SLACK_CHANNEL,
        'url_suffix': '#/website_monitoring/',
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
    'threats_watcher_weeklysummary': {
        'content_template': (
            "<p><strong><h4>📊 Cyber Threat Intelligence Report 📊</h4></strong></p>"
            "<p>Dear team, here is the weekly threat intelligence summary:</p>"
            "<p>{summary_text}</p>"
            "<p>Please, find more details <a href='{details_url}'>here</a>.</p>"
        ),
        'citadel_room_id': CITADEL_ROOM_ID,
        'url_suffix': '#/',
    },
    'threats_watcher_breakingnews': {
        'content_template': (
            "<p><strong><h4>🚨 Critical Threat Alert 🚨</h4></strong></p>"
            "<p>Dear team, Watcher has detected a new critical threat alert. Please review the breaking news summary below:</p>"
            "<p>{summary_text}</p>"
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
    'cyber_watch_new_cve': {
        'content_template': (
            "<p><strong><h4>[CYBER WATCH - NEW CVE] 🛡️ {cve_id} detected ({severity})</h4></strong></p>"
            "<p>Dear team,</p>"
            "<p>A new CVE has been fetched:</p>"
            "<ul>"
            "<li><strong>CVE ID:</strong> {cve_id}</li>"
            "<li><strong>Severity:</strong> {severity}</li>"
            "<li><strong>CVSS Score:</strong> {cvss_score}</li>"
            "<li><strong>Description:</strong> {description}</li>"
            "</ul>"
            "<p>Please, find more details <a href='{details_url}'>here</a>.</p>"
        ),
        'citadel_room_id': CITADEL_ROOM_ID,
        'url_suffix': '#/cyber_watch',
    },
    'cyber_watch_cve_hit': {
        'content_template': (
            "<p><strong><h4>[CYBER WATCH - CVE HIT] 🎯 Rule '{rule_name}' matched {cve_id}</h4></strong></p>"
            "<p>Dear team,</p>"
            "<p>A CVE watch rule has been triggered:</p>"
            "<ul>"
            "<li><strong>Rule:</strong> {rule_name}</li>"
            "<li><strong>CVE ID:</strong> {cve_id}</li>"
            "<li><strong>Keyword:</strong> {keyword}</li>"
            "<li><strong>Severity:</strong> {severity}</li>"
            "</ul>"
            "<p>Please, find more details <a href='{details_url}'>here</a>.</p>"
        ),
        'citadel_room_id': CITADEL_ROOM_ID,
        'url_suffix': '#/cyber_watch',
    },
    'cyber_watch_new_victim': {
        'content_template': (
            "<p><strong><h4>[CYBER WATCH - NEW VICTIM] 🏴‍☠️ {victim_name} ({group_name})</h4></strong></p>"
            "<p>Dear team,</p>"
            "<p>A new ransomware victim has been detected:</p>"
            "<ul>"
            "<li><strong>Victim:</strong> {victim_name}</li>"
            "<li><strong>Group:</strong> {group_name}</li>"
            "<li><strong>Country:</strong> {country}</li>"
            "<li><strong>Sector:</strong> {sector}</li>"
            "</ul>"
            "<p>Please, find more details <a href='{details_url}'>here</a>.</p>"
        ),
        'citadel_room_id': CITADEL_ROOM_ID,
        'url_suffix': '#/cyber_watch',
    },
    'cyber_watch_victim_hit': {
        'content_template': (
            "<p><strong><h4>[CYBER WATCH - VICTIM HIT] 🎯 Rule '{rule_name}' matched {victim_name} ({group_name})</h4></strong></p>"
            "<p>Dear team,</p>"
            "<p>A ransomware victim watch rule has been triggered:</p>"
            "<ul>"
            "<li><strong>Rule:</strong> {rule_name}</li>"
            "<li><strong>Victim:</strong> {victim_name}</li>"
            "<li><strong>Group:</strong> {group_name}</li>"
            "<li><strong>Sector:</strong> {sector}</li>"
            "<li><strong>Country:</strong> {country}</li>"
            "<li><strong>Matched Keyword:</strong> {keyword}</li>"
            "</ul>"
            "<p>Please, find more details <a href='{details_url}'>here</a>.</p>"
        ),
        'citadel_room_id': CITADEL_ROOM_ID,
        'url_suffix': '#/cyber_watch',
    },
    'udrp_decision': {
        'content_template': (
            "<p><strong><h4>[UDRP DECISION] ⚖️ {domain_name_sanitized}</h4></strong></p>"
            "<p>Dear team,</p>"
            "<p>A UDRP decision has been detected for a monitored domain:</p>"
            "<ul>"
            "<li><strong>Domain:</strong> {domain_name_sanitized}</li>"
            "<li><strong>Decision:</strong> {decision_label}</li>"
            "<li><strong>Date:</strong> {date}</li>"
            "<li><strong>Ticket:</strong> {ticket}</li>"
            "<li><strong>Source:</strong> udrpsearch.com</li>"
            "</ul>"
            "<p>Please, find more details <a href='{details_url}'>here</a>.</p>"
        ),
        'citadel_room_id': CITADEL_ROOM_ID,
        'url_suffix': '#/website_monitoring/',
    },
    'udrp_decision': {
        'content_template': (
            "<p><strong><h4>[UDRP DECISION] ⚖️ {domain_name_sanitized}</h4></strong></p>"
            "<p>Dear team,</p>"
            "<p>A UDRP decision has been detected for a monitored domain:</p>"
            "<ul>"
            "<li><strong>Domain:</strong> {domain_name_sanitized}</li>"
            "<li><strong>Decision:</strong> {decision_label}</li>"
            "<li><strong>Date:</strong> {date}</li>"
            "<li><strong>Ticket:</strong> {ticket}</li>"
            "<li><strong>Source:</strong> udrpsearch.com</li>"
            "</ul>"
            "<p>Please, find more details <a href='{details_url}'>here</a>.</p>"
        ),
        'citadel_room_id': CITADEL_ROOM_ID,
        'url_suffix': '#/website_monitoring/',
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
    'cyber_watch_new_cve': {
        'title': "New CVE - {cve_id} | Severity: {severity} | CVSS: {cvss_score}",
        'description_template': (
            "## CyberWatch - New CVE Detected\n\n"
            "| Field | Value |\n"
            "|-------|-------|\n"
            "| **CVE ID** | {cve_id} |\n"
            "| **Severity** | {severity} |\n"
            "| **CVSS Score** | {cvss_score} |\n\n"
            "### Description\n\n"
            "{description}\n\n"
        ),
        'severity': 1,
        'tlp': 1,
        'pap': 1,
        'tags': settings.THE_HIVE_TAGS
    },
    'cyber_watch_cve_hit': {
        'title': "CVE Rule Hit - {rule_name} matched {cve_id} [{severity}]",
        'description_template': (
            "## CyberWatch - CVE Watch Rule Triggered\n\n"
            "| Field | Value |\n"
            "|-------|-------|\n"
            "| **Rule** | {rule_name} |\n"
            "| **CVE ID** | {cve_id} |\n"
            "| **Matched Keyword** | {keyword} |\n"
            "| **Severity** | {severity} |\n\n"
        ),
        'severity': 2,
        'tlp': 2,
        'pap': 2,
        'tags': settings.THE_HIVE_TAGS
    },
    'cyber_watch_new_victim': {
        'title': "New Ransomware Victim - {victim_name} | {group_name} | {sector}",
        'description_template': (
            "## CyberWatch - New Ransomware Victim Detected\n\n"
            "| Field | Value |\n"
            "|-------|-------|\n"
            "| **Victim** | {victim_name} |\n"
            "| **Group** | {group_name} |\n"
            "| **Country** | {country} |\n"
            "| **Sector** | {sector} |\n\n"
        ),
        'severity': 1,
        'tlp': 1,
        'pap': 1,
        'tags': settings.THE_HIVE_TAGS
    },
    'cyber_watch_victim_hit': {
        'title': "Victim Rule Hit - {rule_name} matched {victim_name} ({group_name})",
        'description_template': (
            "## CyberWatch - Ransomware Victim Watch Rule Triggered\n\n"
            "| Field | Value |\n"
            "|-------|-------|\n"
            "| **Rule triggered** | {rule_name} |\n"
            "| **Victim** | {victim_name} |\n"
            "| **Group** | {group_name} |\n"
            "| **Sector** | {sector} |\n"
            "| **Country** | {country} |\n"
            "| **Matched keyword** | {keyword} |\n\n"
        ),
        'severity': 2,
        'tlp': 2,
        'pap': 2,
        'tags': settings.THE_HIVE_TAGS
    },
}


# Configuration for Email
APP_CONFIG_EMAIL = {
    'threats_watcher': {
        'subject': "[WARNING] Threats Watcher buzzword detected",
        'template_func': get_threats_watcher_template,
    },
    'threats_watcher_weeklysummary': {
        'subject': "[REPORT] Weekly Cyber Threat Intelligence Summary",
        'template_func': get_threats_watcher_weeklysummary_template,
    },
    'threats_watcher_breakingnews': {
        'subject': "[ALERT] Breaking News – Critical Threat Detected",
        'template_func': get_threats_watcher_breakingnews_template,
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
    'cyber_watch_new_cve': {
        'subject': "New CVE - {cve_id} ({severity})",
        'template_func': get_cyber_watch_template,
    },
    'cyber_watch_cve_hit': {
        'subject': "Rule Hit - {rule_name} matched {cve_id} [{severity}]",
        'template_func': get_cyber_watch_template,
    },
    'cyber_watch_new_victim': {
        'subject': "New Ransomware Victim - {victim_name} | {group_name}",
        'template_func': get_cyber_watch_template,
    },
    'cyber_watch_victim_hit': {
        'subject': "Rule Hit - {rule_name} matched {victim_name} ({group_name})",
        'template_func': get_cyber_watch_template,
    },
    'udrp_decision': {
        'subject': "[UDRP DECISION] {domain_name_sanitized}",
        'template_func': get_udrp_template,
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
        if alert and alert.dns_twisted:
            subdomain = alert.dns_twisted.domain_name
            
            extracted = tldextract.extract(subdomain)
            domain_part = extracted.domain
            suffix_part = extracted.suffix
            
            if domain_part and suffix_part:
                parent_domain = f"{domain_part}.{suffix_part}"
                
                subdomain_observable = {"dataType": "domain", "data": subdomain, "tags": []}
                
                if alert.dns_twisted.fuzzer:
                    subdomain_observable["tags"].append(f"fuzzer:{alert.dns_twisted.fuzzer}")
                if alert.dns_twisted.dns_monitored:
                    subdomain_observable["tags"].append(f"corporate_dns:{alert.dns_twisted.dns_monitored.domain_name}")
                if alert.dns_twisted.keyword_monitored:
                    subdomain_observable["tags"].append(f"corporate_keyword:{alert.dns_twisted.keyword_monitored.name}")
                
                subdomain_observable["tags"].append(f"parent_domain:{parent_domain}")
                subdomain_observable["tags"].append(f"subdomain:{subdomain}")

                observables.append(subdomain_observable)
                
                if subdomain != parent_domain:
                    parent_observable = {
                        "dataType": "domain", 
                        "data": parent_domain, 
                        "tags": [
                            f"parent_domain:{parent_domain}",
                            "domain_type:parent"
                        ]
                    }
                    observables.append(parent_observable)

    elif app_name == 'cyber_watch':
        notification_type = context_data.get('notification_type', '')
        if notification_type in ('new_cve', 'cve_hit'):
            cve_id = context_data.get('cve_id', '')
            severity = context_data.get('severity', 'N/A')
            if cve_id:
                observables.append({"dataType": "other", "data": cve_id, "tags": ["cve", f"severity:{severity}"]})
            keyword = context_data.get('keyword', '')
            if keyword and notification_type == 'cve_hit':
                observables.append({"dataType": "other", "data": keyword, "tags": ["matched-keyword", "cve-watch-rule"]})
        elif notification_type in ('new_victim', 'victim_hit'):
            victim_name = context_data.get('victim_name', '')
            group_name = context_data.get('group_name', '')
            sector = context_data.get('sector', '')
            country = context_data.get('country', '')
            keyword = context_data.get('keyword', '')
            if victim_name:
                observables.append({"dataType": "other", "data": victim_name, "tags": ["ransomware-victim", f"group:{group_name}"]})
            if group_name:
                observables.append({"dataType": "other", "data": group_name, "tags": ["ransomware-group"]})
            if sector and sector != 'N/A':
                observables.append({"dataType": "other", "data": sector, "tags": ["victim-sector"]})
            if country and country != 'N/A':
                observables.append({"dataType": "other", "data": country, "tags": ["victim-country"]})
            if keyword and notification_type == 'victim_hit':
                observables.append({"dataType": "other", "data": keyword, "tags": ["matched-keyword", "victim-watch-rule"]})

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
    template_key = app_name

    # Special handling for threats_watcher to detect notification type
    if app_name == 'threats_watcher':
        notification_type = context_data.get('notification_type', 'regular')
        if notification_type == 'weeklysummary':
            template_key = 'threats_watcher_weeklysummary'
        elif notification_type == 'breakingnews':
            template_key = 'threats_watcher_breakingnews'
        else:
            template_key = 'threats_watcher'

    # Special handling for cyber_watch to detect notification sub-type
    elif app_name == 'cyber_watch':
        notification_type = context_data.get('notification_type', '')
        if notification_type == 'new_cve':
            template_key = 'cyber_watch_new_cve'
        elif notification_type == 'cve_hit':
            template_key = 'cyber_watch_cve_hit'
        elif notification_type == 'new_victim':
            template_key = 'cyber_watch_new_victim'
        elif notification_type == 'victim_hit':
            template_key = 'cyber_watch_victim_hit'
        else:
            template_key = 'cyber_watch_new_cve'

    app_config_slack = APP_CONFIG_SLACK.get(template_key)
    app_config_citadel = APP_CONFIG_CITADEL.get(template_key)
    app_config_thehive = APP_CONFIG_THEHIVE.get(template_key) or APP_CONFIG_THEHIVE.get(app_name)
    app_config_email = APP_CONFIG_EMAIL.get(template_key) or APP_CONFIG_EMAIL.get(app_name)

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
            notification_type = context_data.get('notification_type', 'regular')

            if notification_type == 'weeklysummary':
                summary_text = context_data.get('summary_text', '')
                if not summary_text:
                    return
                email_conf = APP_CONFIG_EMAIL['threats_watcher_weeklysummary']
                subject = email_conf['subject']
                template_func = email_conf['template_func']
                email_body = template_func(summary_text)
                common_data = {
                    'summary_text': summary_text,
                    'details_url': settings.WATCHER_URL + app_config_slack['url_suffix'],
                    'app_name': 'threats_watcher'
                }

            elif notification_type == 'breakingnews':
                keyword = context_data.get('keyword', '')
                occurrences = context_data.get('occurrences', 0)
                summary_text = context_data.get('summary_text', '')
                if not keyword or not summary_text:
                    return
                email_conf = APP_CONFIG_EMAIL['threats_watcher_breakingnews']
                subject = email_conf['subject']
                template_func = email_conf['template_func']
                email_body = template_func(summary_text)
                common_data = {
                    'keyword': keyword,
                    'occurrences': occurrences,
                    'summary_text': summary_text,
                    'details_url': settings.WATCHER_URL + app_config_slack['url_suffix'],
                    'app_name': 'threats_watcher'
                }

            else:
                words_list = '\n'.join([remove_html_tags(unescape(word)) for word in context_data.get('email_words', [])])
                if not words_list:
                    return
                email_conf = APP_CONFIG_EMAIL['threats_watcher']
                subject = email_conf['subject']
                template_func = email_conf['template_func']
                email_words = context_data.get('email_words', [])
                email_body = template_func(settings.WORDS_OCCURRENCE, email_words)
                common_data = {
                    'words_list': words_list,
                    'details_url': settings.WATCHER_URL + app_config_slack['url_suffix'],
                    'app_name': 'threats_watcher'
                }


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

            if not alert or not alert.dns_twisted or not alert.dns_twisted.domain_name:
                logger.warning(f"No valid alert data found or DNS Twisted information missing.")
                return

            subdomain = alert.dns_twisted.domain_name
            dns_domain_name_sanitized = (
                getattr(alert.dns_twisted, 'dns_domain_name_sanitized', None) or 
                alert.dns_twisted.domain_name.replace('.', '[.]')
            )

            if subscribers.filter(thehive=True).exists() and app_config_thehive:
                current_time = timezone.now()
                extracted = tldextract.extract(subdomain)
                subdomain_part = extracted.subdomain
                domain_part = extracted.domain
                suffix_part = extracted.suffix

                if not suffix_part:
                    logger.warning(f"No valid suffix found for domain: {subdomain}")
                    return

                parent_domain = f"{domain_part}.{suffix_part}"
                is_parent_domain = (not subdomain_part)

                observables_dns = collect_observables('dns_finder', context_data)
                parent_site = Site.objects.filter(domain_name=parent_domain).first()
                ticket_id = None
                existing_item = None
                item_type = None

                # Step 1: Search for parent domain in Site model
                if parent_site and parent_site.ticket_id:
                    ticket_id = parent_site.ticket_id
                    logger.info(f"Found parent domain {parent_domain} in Site model with ticket_id: {ticket_id}")
                    
                    alert_type, alert_item = search_thehive_for_ticket_id(
                        ticket_id, settings.THE_HIVE_URL, settings.THE_HIVE_KEY, "alert"
                    )
                    if isinstance(alert_item, list):
                        alert_item = alert_item[0] if alert_item else None
                    case_type, case_item = search_thehive_for_ticket_id(
                        ticket_id, settings.THE_HIVE_URL, settings.THE_HIVE_KEY, "case"
                    )
                    if isinstance(case_item, list):
                        case_item = case_item[0] if case_item else None
                    
                    if case_item:
                        existing_item = case_item
                        item_type = "case"
                    elif alert_item:
                        existing_item = alert_item
                        item_type = "alert"
                
                # Step 2: Search by observables in TheHive
                if not existing_item:
                    item_type, item_obj = search_thehive_for_observable(
                        parent_domain, settings.THE_HIVE_URL, settings.THE_HIVE_KEY
                    )
                    if item_obj:
                        existing_item = item_obj
                        item_type = item_type

                # Step 3: If still not found, use generated ticket_id
                if not ticket_id:
                    ticket_id = generate_ref() 

                current_time_str = current_time.strftime("%H:%M:%S")
                current_date_str = current_time.strftime("%Y-%m-%d")

                comment = (
                    f"A change was processed by dns_finder at {current_time_str} on {current_date_str}.\n\n"
                    f"A new subdomain has been detected: {subdomain}, associated with the parent domain {parent_domain}.\n\n"
                    "The associated observables have been handled in the dedicated section."
                )

                # Update or create
                if existing_item:
                    logger.info(f"Updating existing {item_type} for parent domain {parent_domain}")
                    update_existing_alert_case(
                        item_type=item_type,
                        existing_item=existing_item,
                        observables=observables_dns,
                        comment=comment,
                        thehive_url=settings.THE_HIVE_URL,
                        api_key=settings.THE_HIVE_KEY,
                        parent_domain=parent_domain,
                        subdomain=subdomain
                    )
                else:
                    logger.info(f"Creating new alert for parent domain {parent_domain}")
                    create_new_alert(
                        ticket_id=ticket_id,
                        title=f"New Twisted DNS found - {parent_domain}",
                        description=(
                            f"**Alert:**\n"
                            f"**New Twisted DNS Found:**\n"
                            f"Subdomain: {subdomain}\n"
                            f"Parent Domain: {parent_domain}\n"
                            f"Corporate Keyword: {getattr(alert.dns_twisted, 'keyword_monitored', 'N/A')}\n"
                            f"Corporate DNS: {getattr(alert.dns_twisted, 'dns_monitored', 'N/A')}\n"
                            f"Fuzzer: {getattr(alert.dns_twisted, 'fuzzer', 'N/A')}\n"
                        ),
                        severity=app_config_thehive['severity'],
                        tlp=app_config_thehive['tlp'],
                        pap=app_config_thehive['pap'],
                        tags=[
                            f"Detected fuzzer: {getattr(alert.dns_twisted, 'fuzzer', 'unknown')}",
                            f"Detected keyword: {getattr(alert.dns_twisted.keyword_monitored, 'name', 'unknown') if alert.dns_twisted.keyword_monitored else 'unknown'}",
                        ] + (app_config_thehive.get('tags', []) or []),
                        app_name='dns_finder',
                        observables=observables_dns,
                        customFields={
                            settings.THE_HIVE_CUSTOM_FIELD: {"string": ticket_id},
                            "email-sender": {"string": settings.THE_HIVE_EMAIL_SENDER},
                        },
                        comment=comment,
                        thehive_url=settings.THE_HIVE_URL,
                        api_key=settings.THE_HIVE_KEY,
                        parent_domain=parent_domain,
                        subdomain=subdomain
                    )

            source = context_data.get('source')
            if source == 'print_callback':
                email_body = get_dns_finder_cert_transparency_template(alert)
            elif source == 'check_dnstwist':
                email_body = get_dns_finder_template(alert)
            else:
                logger.warning(f"Unknown source '{source}' for alert.")
                email_body = "Alert with no specific model defined."

            common_data = {
                'alert': alert,
                'dns_domain_name_sanitized': dns_domain_name_sanitized,
                'details_url': settings.WATCHER_URL + app_config_slack['url_suffix'],
                'app_name': 'dns_finder'
            }

        elif app_name == 'cyber_watch':
            notification_type = context_data.get('notification_type', '')
            details_url = settings.WATCHER_URL + app_config_slack['url_suffix']
            email_body = get_cyber_watch_template(context_data)

            if notification_type == 'new_cve':
                cve_id = context_data.get('cve_id', 'N/A')
                severity = context_data.get('severity', 'N/A')
                cvss_score = context_data.get('cvss_score', 'N/A')
                description = context_data.get('description', '')[:300]
                event_summary = f"CVE {cve_id} - {severity}"
                common_data = {
                    'cve_id': cve_id,
                    'severity': severity,
                    'cvss_score': cvss_score,
                    'description': description,
                    'notification_type': notification_type,
                    'event_summary': event_summary,
                    'details_url': details_url,
                    'app_name': 'cyber_watch',
                }
            elif notification_type == 'cve_hit':
                cve_id = context_data.get('cve_id', 'N/A')
                rule_name = context_data.get('rule_name', 'N/A')
                keyword = context_data.get('keyword', 'N/A')
                severity = context_data.get('severity', 'N/A')
                event_summary = f"Rule '{rule_name}' matched {cve_id}"
                common_data = {
                    'cve_id': cve_id,
                    'rule_name': rule_name,
                    'keyword': keyword,
                    'severity': severity,
                    'notification_type': notification_type,
                    'event_summary': event_summary,
                    'details_url': details_url,
                    'app_name': 'cyber_watch',
                }
            elif notification_type == 'new_victim':
                victim_name = context_data.get('victim_name', 'N/A')
                group_name = context_data.get('group_name', 'N/A')
                country = context_data.get('country', 'N/A')
                sector = context_data.get('sector', 'N/A')
                event_summary = f"{victim_name} ({group_name})"
                common_data = {
                    'victim_name': victim_name,
                    'group_name': group_name,
                    'country': country,
                    'sector': sector,
                    'notification_type': notification_type,
                    'event_summary': event_summary,
                    'details_url': details_url,
                    'app_name': 'cyber_watch',
                }
            elif notification_type == 'victim_hit':
                victim_name = context_data.get('victim_name', 'N/A')
                group_name = context_data.get('group_name', 'N/A')
                rule_name = context_data.get('rule_name', 'N/A')
                keyword = context_data.get('keyword', 'N/A')
                sector = context_data.get('sector', 'N/A')
                country = context_data.get('country', 'N/A')
                event_summary = f"Rule '{rule_name}' matched {victim_name} ({group_name})"
                common_data = {
                    'victim_name': victim_name,
                    'group_name': group_name,
                    'rule_name': rule_name,
                    'keyword': keyword,
                    'sector': sector,
                    'country': country,
                    'notification_type': notification_type,
                    'event_summary': event_summary,
                    'details_url': details_url,
                    'app_name': 'cyber_watch',
                }
            else:
                logger.warning(f"Unknown cyber_watch notification_type: {notification_type}")
                return


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
                    logger.error(f"Site with domain_name {domain_name} not found.")
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
                if app_name == 'threats_watcher':
                    notification_type = context_data.get('notification_type', 'regular')
                    if notification_type in ('weeklysummary', 'breakingnews'):
                        email_subject = subject.format(**common_data)
                    else:
                        email_subject = app_config_email['subject'].format(**common_data)
                else:
                    email_subject = app_config_email['subject'].format(**common_data)

                send_email_notifications(email_subject, email_body, email_list, app_name)
            else:
                pass

    except Exception as e:
        logger.error(f"Error sending notifications for {app_name}: {str(e)}")


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
                        logger.warning(f"Unknown app_name for group email: {app_name}")
                        return

                    if not isinstance(email_body, str):
                        logger.error(f"Email body is not a string for {app_name}: {type(email_body)}")
                        return

                    send_email_notifications(email_subject, email_body, email_list, app_name)

                except Exception as e:
                    logger.error(f"Error sending group email for {app_name}: {e}")
                    return

    except Exception as e:
        logger.error(f"Error sending group notifications for {app_name}: {str(e)}")


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
                    logger.error(f"Site with domain_name {domain_name} not found.")
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
        logger.error(f"Error sending TheHive notifications for {app_name}: {str(e)}")


def update_legitimate_domains_rdap_data():
    """
    Update RDAP/WHOIS data for legitimate domains.
    """
    close_old_connections()
    logger.info("CRON TASK: RDAP/WHOIS Lookup for Legitimate Domains")

    domains = LegitimateDomain.objects.all()

    for domain in domains:
        try:
            from .utils.rdap import RDAPDiscovery
            rdap = RDAPDiscovery(domain.domain_name)
            method = "RDAP"

            if not rdap.fetch_rdap_data():
                from .utils.whois import WhoisDiscovery
                whois = WhoisDiscovery(domain.domain_name)
                if not whois.fetch_whois_data():
                    logger.warning(f"No RDAP/WHOIS data found for {domain.domain_name}")
                    continue

                rdap = whois
                method = "WHOIS"

            expiration_date = rdap.get_expiration_date()
            registration_date = rdap.get_registration_date()
            
            updated_fields = []

            # Update expiration date
            if expiration_date:
                try:
                    new_expiry = datetime.strptime(expiration_date, '%Y-%m-%d').date()
                except Exception:
                    logger.warning(f"Could not parse expiry '{expiration_date}' for {domain.domain_name}")
                    new_expiry = None

                if new_expiry and domain.expiry != new_expiry:
                    old_expiry = domain.expiry
                    domain.expiry = new_expiry
                    updated_fields.append('expiry')
                    logger.info(
                        f"{method} update for {domain.domain_name}: expiry changed from {old_expiry} to {new_expiry}"
                    )
            else:
                logger.warning(f"No expiration date available for {domain.domain_name}")

            # Update registration date
            if registration_date:
                try:
                    new_registered_at = datetime.strptime(registration_date, '%Y-%m-%d').date()
                except Exception:
                    logger.warning(f"Could not parse registration date '{registration_date}' for {domain.domain_name}")
                    new_registered_at = None

                if new_registered_at:
                    # Convert existing domain_created_at to date if it's a datetime
                    existing_registered_at = domain.domain_created_at
                    if isinstance(existing_registered_at, datetime):
                        existing_registered_at = existing_registered_at.date()
                    
                    if existing_registered_at != new_registered_at:
                        old_registered_at = existing_registered_at
                        domain.domain_created_at = new_registered_at
                        updated_fields.append('domain_created_at')
                        logger.info(
                            f"{method} update for {domain.domain_name}: registration date changed from {old_registered_at} to {new_registered_at}"
                        )
            else:
                logger.warning(f"No registration date available for {domain.domain_name}")

            # Save only if there are updates
            if updated_fields:
                domain.save(update_fields=updated_fields)
                logger.info(f"Successfully updated {domain.domain_name}: {', '.join(updated_fields)}")

        except Exception as e:
            logger.error(f"Error processing {domain.domain_name}: {str(e)}")


def update_legitimate_domains_ssl_data():
    """
    Update SSL certificate expiry for all legitimate domains.

    Runs every 6 hours via the scheduler (separate from the 2-minute RDAP job
    so SSL checks do not flood logs or timeout unnecessarily).
    """
    close_old_connections()
    logger.info("CRON TASK: SSL Certificate Check for Legitimate Domains")
    from .utils.ssl_checker import SSLCertificateChecker
    
    for domain in domains:
        try:
            checker = SSLCertificateChecker(domain.domain_name)
            
            if checker.fetch_certificate():
                ssl_expiry = checker.get_expiration_date()
                
                if ssl_expiry:
                    # Only update if different
                    if str(domain.ssl_expiry) != ssl_expiry:
                        old_ssl_expiry = domain.ssl_expiry
                        domain.ssl_expiry = ssl_expiry
                        domain.save(update_fields=['ssl_expiry'])
                        
                        logger.info(f"Updated SSL expiry for {domain.domain_name}: {old_ssl_expiry} → {ssl_expiry}")
                else:
                    logger.warning(f"Could not extract SSL expiry date for {domain.domain_name}")
            else:
                logger.debug(f"No SSL certificate found for {domain.domain_name}")
                
        except Exception as e:
            logger.error(f"Error checking SSL for {domain.domain_name}: {str(e)}")



def update_monitored_sites_rdap_data():
    """
    Update RDAP/WHOIS data for monitored sites.
    """
    close_old_connections()
    logger.info("CRON TASK: RDAP/WHOIS Lookup for Monitored Sites")

    sites = Site.objects.filter(monitored=True)

    for site in sites:
        try:
            from .utils.rdap import RDAPDiscovery
            rdap = RDAPDiscovery(site.domain_name)
            method = "RDAP"

            if not rdap.fetch_rdap_data():
                from .utils.whois import WhoisDiscovery
                whois = WhoisDiscovery(site.domain_name)
                if not whois.fetch_whois_data():
                    logger.warning(f"No RDAP/WHOIS data found for {site.domain_name}")
                    continue

                rdap = whois
                method = "WHOIS"

            registrar = rdap.get_registrar()
            expiration_date = rdap.get_expiration_date()
            registration_date = rdap.get_registration_date()
            
            updated = False
            update_info = []
            old_legitimacy = site.legitimacy

            # Update registrar
            if registrar and site.registrar != registrar:
                old_registrar = site.registrar
                site.registrar = registrar
                updated = True
                update_info.append(f"registrar: {old_registrar} → {registrar}")
                
                # Auto-update legitimacy based on registration status
                if site.auto_update_legitimacy_on_registration():
                    update_info.append(f"legitimacy: {old_legitimacy} → {site.legitimacy} (now registered)")
                    logger.info(f"Auto-updated legitimacy for {site.domain_name}: available/disabled → registered")
                
                # Create alert for registrar change
                if old_registrar:
                    from site_monitoring.models import Alert
                    Alert.objects.create(
                        site=site,
                        type="Registrar Changed",
                        old_registrar=old_registrar,
                        new_registrar=registrar
                    )

            # Update expiration date
            if expiration_date:
                try:
                    new_expiry = datetime.strptime(expiration_date, '%Y-%m-%d').date()
                    
                    if site.domain_expiry != new_expiry:
                        old_expiry = site.domain_expiry
                        site.domain_expiry = new_expiry
                        updated = True
                        update_info.append(f"domain_expiry: {old_expiry} → {new_expiry}")
                        
                        # Create alert for expiry change
                        if old_expiry:
                            from site_monitoring.models import Alert
                            Alert.objects.create(
                                site=site,
                                type="Domain Expiry Changed",
                                old_expiry_date=old_expiry,
                                new_expiry_date=new_expiry
                            )
                except Exception as e:
                    logger.warning(f"Could not parse expiry '{expiration_date}' for {site.domain_name}: {str(e)}")

            # Update registration date
            if registration_date:
                try:
                    new_registered_at = datetime.strptime(registration_date, '%Y-%m-%d').date()
                    
                    if site.domain_created_at != new_registered_at:
                        old_registered_at = site.domain_created_at
                        site.domain_created_at = new_registered_at
                        updated = True
                        update_info.append(f"domain_created_at: {old_registered_at} → {new_registered_at}")
                except Exception as e:
                    logger.warning(f"Could not parse registration date '{registration_date}' for {site.domain_name}: {str(e)}")

            if updated:
                site.save()
                logger.info(f"Successfully updated {method} data for {site.domain_name}: {', '.join(update_info)}")
            else:
                logger.debug(f"No updates needed for {site.domain_name}")

        except Exception as e:
            logger.error(f"Error processing {site.domain_name}: {str(e)}")


def update_all_ssl_certificates():
    """
    Update SSL certificate information for all monitored sites.
    """
    close_old_connections()
    logger.info("CRON TASK: SSL Certificate Check for Monitored Sites")
    
    from .utils.ssl_checker import update_all_sites_ssl_certificates
    
    success_count = update_all_sites_ssl_certificates()
    logger.info(f"SSL certificate check completed: {success_count} sites updated")
