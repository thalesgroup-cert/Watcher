"""
The notifications Watcher sends: one entry per type, with its message on each channel.

A message is `head` + one line per selected field + `tail`. With every field selected it is the text Watcher sent
before the messages became configurable (checked against test_data/notification_golden.json).
"""
from django.conf import settings

from . import samples
from .catalogue import EmailSpec, Field, Layout, NotificationType
from .registry import register

TAG = getattr(settings, 'SUBJECT_TAG_SITE_MONITORING', '')

SLACK_TAIL = "\n<{object_url}|Open in Watcher>"
CITADEL_LIST_TAIL = "</table><p><a href='{object_url}'>Open in Watcher</a></p>"


def _bullet(label, key):
    """Slack line."""
    return f"• *{label}:* {{{key}}}\n"


def _item(label, key):
    """Citadel table row."""
    return f"<tr><td><strong>{label}</strong></td><td>{{{key}}}</td></tr>"


def _star(label, key):
    """TheHive line in italics."""
    return f"*{label}:* {{{key}}}\n"


def _plain(label, key):
    """TheHive line without markup."""
    return f"{label}: {{{key}}}\n"


def _row(label, key):
    """TheHive row of a markdown table."""
    return f"| **{label}** | {{{key}}} |\n"


def _slack_head(title, intro):
    return "*" + title + "*\n\n" + intro + "\n\n"


def _citadel_head(title, intro):
    return "<h4>" + title + "</h4><p>" + intro + "</p><table>"


def _field(id, label, key, *, thehive=None, required=False, optional=False):
    """A line shown the same way on Slack and Citadel; `thehive` is its TheHive line (None: not on TheHive)."""
    return Field(id, label, slack=_bullet(label, key), citadel=_item(label, key), thehive=thehive, required=required,
                 optional=optional)


def _th_head(title, summary=''):
    """TheHive description: a heading, one sentence on what happened, then the start of a two-column table."""
    intro = f"{summary}\n\n" if summary else ''
    return f"## {title}\n\n{intro}| Field | Value |\n|-------|-------|\n"


def _table_head(title):
    return _th_head(f"CyberWatch - {title}")


# Every TheHive description ends with the way back to the object in Watcher.
_TH_TAIL = "\n[Open in Watcher]({object_url})\n"


THREATS_WATCHER = NotificationType(
    id='threats_watcher', label='Trendy words detected', module='threats_watcher', url_suffix='#/',
    sample=samples.threats_watcher,
    layouts={
        'slack': Layout(
            head="*[THREATS WATCHER - WARNING] 🔥 Trendy Threats Detected 🔥*\n\n"
                 "Please find the new trendy word(s) detected below:\n\n{words_list}\n\n"
                 "<{object_url}|Open in Watcher>"),
        'citadel': Layout(
            head="<h4>[THREATS WATCHER - WARNING] 🔥 Trendy Threats Detected 🔥</h4>"
                 "<p>Please find the new trendy word(s) detected below:</p>"
                 "<ul><strong>{words_list}</strong></ul>"
                 "<p><a href='{object_url}'>Open in Watcher</a></p>"),
        'thehive': Layout(
            head="## Threats Watcher - Trendy words\n\nThese words are trending in the monitored sources:\n\n"
                 "```\n{words_list}\n```\n",
            tail=_TH_TAIL, title="Threats Watcher buzzword detected"),
    },
    email=EmailSpec('[WARNING] Threats Watcher buzzword detected', samples.email_threats_watcher),
    thehive_meta={'severity': 1, 'tlp': 1, 'pap': 1},
)

THREATS_WATCHER_WEEKLY = NotificationType(
    id='threats_watcher_weeklysummary', label='Weekly threat summary', module='threats_watcher', url_suffix='#/',
    sample=samples.threats_watcher_weeklysummary,
    layouts={
        'slack': Layout(
            head="*📊 Cyber Threat Intelligence Report 📊*\n\nHere is the weekly threat intelligence summary:\n\n"
                 "{summary_text}\n\n<{object_url}|Open in Watcher>"),
        'citadel': Layout(
            head="<h4>📊 Cyber Threat Intelligence Report 📊</h4>"
                 "<p>Here is the weekly threat intelligence summary:</p><p>{summary_text}</p>"
                 "<p><a href='{object_url}'>Open in Watcher</a></p>"),
    },
    email=EmailSpec('[REPORT] Weekly Cyber Threat Intelligence Summary', samples.email_threats_watcher_weeklysummary),
)

THREATS_WATCHER_BREAKING = NotificationType(
    id='threats_watcher_breakingnews', label='Breaking news', module='threats_watcher', url_suffix='#/',
    sample=samples.threats_watcher_breakingnews,
    layouts={
        'slack': Layout(
            head="*🚨 Critical Threat Alert 🚨*\n\nWatcher has detected a new critical threat alert. "
                 "Please review the breaking news summary below:\n\n{summary_text}\n\n"
                 "<{object_url}|Open in Watcher>"),
        'citadel': Layout(
            head="<h4>🚨 Critical Threat Alert 🚨</h4>"
                 "<p>Watcher has detected a new critical threat alert. "
                 "Please review the breaking news summary below:</p><p>{summary_text}</p>"
                 "<p><a href='{object_url}'>Open in Watcher</a></p>"),
    },
    email=EmailSpec('[ALERT] Breaking News – Critical Threat Detected', samples.email_threats_watcher_breakingnews),
)

_LEAK_TITLE = "[DATA LEAK - ALERT #{alert_pk}] 🔔 Data Leak Detected: {keyword_name} 🔔"
_LEAK_INTRO = "New Data Leakage Alert for {keyword_name} keyword:"

DATA_LEAK = NotificationType(
    id='data_leak', label='Data leak alert', module='data_leak', url_suffix='#data_leak',
    sample=samples.data_leak,
    fields=(
        _field('keyword_name', 'Keyword', 'keyword_name', thehive=_row('Keyword', 'keyword_name')),
        _field('url', 'Source', 'url', thehive=_row('Source', 'url'), required=True),
    ),
    layouts={
        'slack': Layout(head=_slack_head(_LEAK_TITLE, _LEAK_INTRO), tail=SLACK_TAIL),
        'citadel': Layout(head=_citadel_head(_LEAK_TITLE, _LEAK_INTRO), tail=CITADEL_LIST_TAIL),
        'thehive': Layout(
            head=_th_head("Data leak detected", "A page matching a monitored keyword was found."),
            tail=_TH_TAIL, title="New Data Leakage - Alert #{alert_pk} for {keyword_name} keyword"),
    },
    email=EmailSpec('[ALERT #{alert_pk}] Data Leak', samples.email_data_leak),
    thehive_meta={'severity': 1, 'tlp': 1, 'pap': 1},
)

DATA_LEAK_GROUP = NotificationType(
    id='data_leak_group', label='Data leak alerts, grouped', module='data_leak', url_suffix='#data_leak',
    sample=samples.data_leak_group,
    layouts={
        'slack': Layout(
            head="*[{alerts_number} ALERTS] 🚨 Data Leak 🚨*\n\n"
                 "*{alerts_number}* new data leakage alerts have been detected for the keyword *{keyword}*\n\n"
                 "<{object_url}|Open in Watcher>"),
        'citadel': Layout(
            head="<h4>[{alerts_number} ALERTS] 🚨 Data Leak 🚨</h4>"
                 "<p><strong>{alerts_number}</strong> new data leakage alerts have been detected for the keyword "
                 "<strong>{keyword}</strong>.</p>"
                 "<p><a href='{object_url}'>Open in Watcher</a></p>"),
    },
    email=EmailSpec('[{alerts_number} ALERTS] Data Leak', samples.email_data_leak_group),
)


def _change(id, label, key, th_label=None):
    """A value that only exists when it changed: its line is left out of the message otherwise."""
    shown = th_label or label
    return Field(id, label, slack=_bullet(shown, key), citadel=_item(shown, key), thehive=_row(shown, key),
                 optional=True)


_SITE_TITLE = "[" + TAG + "{ticket_id}] 🔔 {alert_type} on {domain_name_sanitized} 🔔"
_SITE_INTRO = "What changed on this monitored domain:"

WEBSITE_MONITORING = NotificationType(
    id='website_monitoring', label='Website change', module='website_monitoring', url_suffix='#/website_monitoring/',
    sample=samples.website_monitoring,
    fields=(
        _change('difference_score', 'Difference Score', 'difference_score', 'Content difference score'),
        _change('new_ip', 'New Ip', 'new_ip', 'New IP address'),
        _change('old_ip', 'Old Ip', 'old_ip', 'Previous IP address'),
        _change('new_ip_second', 'New Ip Second', 'new_ip_second', 'New second IP address'),
        _change('old_ip_second', 'Old IP Second', 'old_ip_second', 'Previous second IP address'),
        _change('new_mx_records', 'New MX Records', 'new_mx_records', 'New MX records'),
        _change('old_mx_records', 'Old MX Records', 'old_mx_records', 'Previous MX records'),
        _change('new_mail_server', 'New Mail Server', 'new_mail_A_record_ip', 'New mail server address'),
        _change('old_mail_server', 'Old Mail Server', 'old_mail_A_record_ip', 'Previous mail server address'),
    ),
    layouts={
        'slack': Layout(head=_slack_head(_SITE_TITLE, _SITE_INTRO), tail=SLACK_TAIL),
        'citadel': Layout(head=_citadel_head(_SITE_TITLE, _SITE_INTRO), tail=CITADEL_LIST_TAIL),
        'thehive': Layout(
            head=_th_head("Website monitoring - {alert_type}", "**{domain_name_sanitized}** is under surveillance."),
            tail=_TH_TAIL, title="Website Monitoring Detected - {alert_type} on {domain_name_sanitized}"),
    },
    email=EmailSpec('[' + TAG + '{ticket_id}] {alert_type} on {domain_name_sanitized}', samples.email_website_monitoring),
    thehive_meta={'severity': 1, 'tlp': 1, 'pap': 1},
)

_DNS_TITLE = "[DNS Threats Monitored - ALERT #{alert.pk}] 🚨 Suspicious DNS Detected: {dns_domain_name_sanitized} 🚨"

DNS_FINDER = NotificationType(
    id='dns_finder', label='Suspicious domain', module='dns_finder', url_suffix='#/dns_finder/',
    sample=samples.dns_finder,
    fields=(
        Field('twisted_dns', 'Twisted DNS', slack=_bullet('Suspicious domain', 'dns_domain_name_sanitized'),
              citadel=_item('Suspicious domain', 'dns_domain_name_sanitized'), required=True),
        Field('subdomain', 'Subdomain', thehive=_row('Suspicious domain', 'subdomain_sanitized'), required=True),
        Field('parent_domain', 'Parent domain', thehive=_row('Parent domain', 'parent_domain_sanitized')),
        Field('keyword', 'Corporate keyword', slack=_bullet('Matches corporate keyword', 'alert.dns_twisted.keyword_monitored'),
              citadel=_item('Matches corporate keyword', 'alert.dns_twisted.keyword_monitored'),
              thehive=_row('Matches corporate keyword', 'keyword'), optional=True),
        Field('corporate_dns', 'Corporate DNS', slack=_bullet('Matches corporate domain', 'corporate_dns_sanitized'),
              citadel=_item('Matches corporate domain', 'corporate_dns_sanitized'),
              thehive=_row('Matches corporate domain', 'corporate_dns_sanitized'), optional=True),
        Field('fuzzer', 'Fuzzer', slack=_bullet('Detection method', 'alert.dns_twisted.fuzzer'),
              citadel=_item('Detection method', 'alert.dns_twisted.fuzzer'), thehive=_row('Detection method', 'fuzzer'),
              optional=True),
    ),
    layouts={
        'slack': Layout(head=_slack_head(_DNS_TITLE, "A domain that looks like a corporate asset was detected:"), tail=SLACK_TAIL),
        'citadel': Layout(head=_citadel_head(_DNS_TITLE, "A domain that looks like a corporate asset was detected:"), tail=CITADEL_LIST_TAIL),
        # The text of the alert Watcher opens for a new suspicious domain (with the parent-domain search).
        'thehive': Layout(
            head=_th_head("New suspicious domain", "A domain that looks like a corporate asset was detected."),
            tail=_TH_TAIL, title="New Twisted DNS found - {parent_domain_sanitized}"),
    },
    email=EmailSpec('[ALERT #{alert.pk}] DNS Threats Monitored', samples.email_dns_finder),
    thehive_meta={'severity': 1, 'tlp': 1, 'pap': 1},
    thehive_per_alert=Layout(
        head=_th_head("New suspicious domain", "A domain that looks like a corporate asset was detected.")
             + "| **Suspicious domain** | {dns_domain_name_sanitized} |\n"
             "{{#if alert.dns_twisted.keyword_monitored}}| **Matches corporate keyword** | "
             "{alert.dns_twisted.keyword_monitored} |\n{{/if}}"
             "{{#if corporate_dns_sanitized}}| **Matches corporate domain** | "
             "{corporate_dns_sanitized} |\n{{/if}}"
             "{{#if alert.dns_twisted.fuzzer}}| **Detection method** | {alert.dns_twisted.fuzzer} |\n{{/if}}"
             "\n[Open in Watcher]({object_url})\n",
        title="New Twisted DNS found - {dns_domain_name_sanitized}"),
)

DNS_FINDER_CERT_TRANSPARENCY = NotificationType(
    id='dns_finder_cert_transparency', label='Suspicious domain from certificate transparency (email)',
    module='dns_finder', url_suffix='#/dns_finder/', sample=samples.dns_finder_cert_transparency,
    email=EmailSpec('[ALERT #{alert.pk}] DNS Threats Monitored', samples.email_dns_finder_cert_transparency),
)

DNS_FINDER_GROUP = NotificationType(
    id='dns_finder_group', label='Suspicious domains, grouped', module='dns_finder', url_suffix='#/dns_finder/',
    sample=samples.dns_finder_group,
    layouts={
        'slack': Layout(
            head="*[{alerts_number} ALERTS] 🚨 DNS Threats Monitored 🚨*\n\n"
                 "*{alerts_number}* New DNS Twisted Alerts for *{dns_domain_name_sanitized_group}* asset.\n\n"
                 "<{object_url}|Open in Watcher>"),
        'citadel': Layout(
            head="<h4>[{alerts_number} ALERTS] 🚨 DNS Threats Monitored 🚨</h4>"
                 "<p><strong>{alerts_number}</strong> New DNS Twisted Alerts for "
                 "<strong>{dns_domain_name_sanitized_group}</strong> asset.</p>"
                 "<p><a href='{object_url}'>Open in Watcher</a></p>"),
    },
    email=EmailSpec('[{alerts_number} ALERTS] DNS Threats Monitored', samples.email_dns_finder_group),
)

_DANGLING_TITLE = ("[DNS Threats Monitored - DANGLING DNS ALERT #{alert.pk}] ⚠️ {takeover_status} "
                   "Subdomain Takeover: {subdomain_sanitized} ⚠️")
_DANGLING_INTRO = "A monitored subdomain may be vulnerable to takeover:"

DNS_FINDER_DANGLING = NotificationType(
    id='dns_finder_dangling', label='Subdomain takeover', module='dns_finder', url_suffix='#/dns_finder/',
    sample=samples.dns_finder_dangling,
    fields=(
        _field('status', 'Status', 'takeover_status_detail', thehive=_row('Status', 'takeover_status_detail')),
        _field('subdomain', 'Subdomain', 'subdomain_sanitized', thehive=_row('Subdomain', 'subdomain_sanitized'),
               required=True),
        _field('parent_domain', 'Corporate DNS', 'parent_domain_sanitized',
               thehive=_row('Corporate domain', 'parent_domain_sanitized'), optional=True),
        _field('cname_target', 'CNAME Target', 'cname_target_sanitized',
               thehive=_row('CNAME target', 'cname_target_sanitized'), optional=True),
        _field('provider', 'Provider', 'provider', thehive=_row('Provider', 'provider'), optional=True),
    ),
    layouts={
        'slack': Layout(head=_slack_head(_DANGLING_TITLE, _DANGLING_INTRO), tail=SLACK_TAIL),
        'citadel': Layout(head=_citadel_head(_DANGLING_TITLE, _DANGLING_INTRO), tail=CITADEL_LIST_TAIL),
        'thehive': Layout(
            head=_th_head("Possible subdomain takeover",
                          "A monitored subdomain points to a resource that someone else may be able to claim."),
            tail=_TH_TAIL, title="{takeover_status} Subdomain Takeover - {subdomain_sanitized}"),
    },
    email=EmailSpec(
        '[ALERT #{alert.pk}] DNS Threats Monitored - Dangling Subdomain ({takeover_status})', samples.email_dns_finder_dangling),
    thehive_meta={'severity': 2, 'tlp': 2, 'pap': 2},
)

_NEW_CVE_TITLE = "[CYBER WATCH - NEW CVE] 🛡️ {cve_id} detected{severity_suffix}"
_NEW_CVE_INTRO = "A new CVE has been fetched:"

CYBER_WATCH_NEW_CVE = NotificationType(
    id='cyber_watch_new_cve', label='New CVE', module='cyber_watch', url_suffix='#/cyber_watch',
    sample=samples.cyber_watch_new_cve,
    fields=(
        _field('cve_id', 'CVE ID', 'cve_id', thehive=_row('CVE ID', 'cve_id'), required=True),
        _field('severity', 'Severity', 'severity', thehive=_row('Severity', 'severity'), optional=True),
        _field('cvss_score', 'CVSS Score', 'cvss_score', thehive=_row('CVSS Score', 'cvss_score'), optional=True),
        _field('description', 'Description', 'description', thehive="\n### Description\n\n{description}\n\n",
               optional=True),
    ),
    layouts={
        'slack': Layout(head=_slack_head(_NEW_CVE_TITLE, _NEW_CVE_INTRO), tail=SLACK_TAIL),
        'citadel': Layout(head=_citadel_head(_NEW_CVE_TITLE, _NEW_CVE_INTRO), tail=CITADEL_LIST_TAIL),
        'thehive': Layout(
            head=_table_head("New CVE Detected"), tail=_TH_TAIL,
            title="New CVE - {cve_id}{severity_part}{cvss_part}"),
    },
    email=EmailSpec('New CVE - {cve_id}{severity_suffix}', samples.email_cyber_watch),
    thehive_meta={'severity': 1, 'tlp': 1, 'pap': 1},
)

_CVE_HIT_TITLE = "[CYBER WATCH - CVE HIT] 🎯 Rule '{rule_name}' matched {cve_id}"
_CVE_HIT_INTRO = "A CVE watch rule has been triggered:"

CYBER_WATCH_CVE_HIT = NotificationType(
    id='cyber_watch_cve_hit', label='CVE watch rule hit', module='cyber_watch', url_suffix='#/cyber_watch',
    sample=samples.cyber_watch_cve_hit,
    fields=(
        Field('rule_name', 'Rule', slack=_bullet('Rule', 'rule_name'), citadel=_item('Rule', 'rule_name'),
              thehive=_row('Rule', 'rule_name')),
        _field('cve_id', 'CVE ID', 'cve_id', thehive=_row('CVE ID', 'cve_id'), required=True),
        Field('keyword', 'Keyword', slack=_bullet('Keyword', 'keyword'), citadel=_item('Keyword', 'keyword'),
              thehive=_row('Matched Keyword', 'keyword')),
        _field('severity', 'Severity', 'severity', thehive=_row('Severity', 'severity'), optional=True),
    ),
    layouts={
        'slack': Layout(head=_slack_head(_CVE_HIT_TITLE, _CVE_HIT_INTRO), tail=SLACK_TAIL),
        'citadel': Layout(head=_citadel_head(_CVE_HIT_TITLE, _CVE_HIT_INTRO), tail=CITADEL_LIST_TAIL),
        'thehive': Layout(
            head=_table_head("CVE Watch Rule Triggered"), tail=_TH_TAIL,
            title="CVE Rule Hit - {rule_name} matched {cve_id}{severity_bracket}"),
    },
    email=EmailSpec('Rule Hit - {rule_name} matched {cve_id}{severity_bracket}', samples.email_cyber_watch),
    thehive_meta={'severity': 2, 'tlp': 2, 'pap': 2},
)

_NEW_VICTIM_TITLE = "[CYBER WATCH - NEW VICTIM] 🏴‍☠️ {victim_name} ({group_name})"
_NEW_VICTIM_INTRO = "A new ransomware victim has been detected:"

CYBER_WATCH_NEW_VICTIM = NotificationType(
    id='cyber_watch_new_victim', label='New ransomware victim', module='cyber_watch', url_suffix='#/cyber_watch',
    sample=samples.cyber_watch_new_victim,
    fields=(
        _field('victim_name', 'Victim', 'victim_name', thehive=_row('Victim', 'victim_name'), required=True),
        _field('group_name', 'Group', 'group_name', thehive=_row('Group', 'group_name'), optional=True),
        _field('country', 'Country', 'country', thehive=_row('Country', 'country'), optional=True),
        _field('sector', 'Sector', 'sector', thehive=_row('Sector', 'sector'), optional=True),
    ),
    layouts={
        'slack': Layout(head=_slack_head(_NEW_VICTIM_TITLE, _NEW_VICTIM_INTRO), tail=SLACK_TAIL),
        'citadel': Layout(head=_citadel_head(_NEW_VICTIM_TITLE, _NEW_VICTIM_INTRO), tail=CITADEL_LIST_TAIL),
        'thehive': Layout(
            head=_table_head("New Ransomware Victim Detected"), tail=_TH_TAIL,
            title="New Ransomware Victim - {victim_name} | {group_name} | {sector}"),
    },
    email=EmailSpec('New Ransomware Victim - {victim_name} | {group_name}', samples.email_cyber_watch),
    thehive_meta={'severity': 1, 'tlp': 1, 'pap': 1},
)

_VICTIM_HIT_TITLE = "[CYBER WATCH - VICTIM HIT] 🎯 Rule '{rule_name}' matched {victim_name} ({group_name})"
_VICTIM_HIT_INTRO = "A ransomware victim watch rule has been triggered:"

CYBER_WATCH_VICTIM_HIT = NotificationType(
    id='cyber_watch_victim_hit', label='Ransomware victim watch rule hit', module='cyber_watch',
    url_suffix='#/cyber_watch', sample=samples.cyber_watch_victim_hit,
    fields=(
        Field('rule_name', 'Rule', slack=_bullet('Rule', 'rule_name'), citadel=_item('Rule', 'rule_name'),
              thehive=_row('Rule triggered', 'rule_name')),
        _field('victim_name', 'Victim', 'victim_name', thehive=_row('Victim', 'victim_name'), required=True),
        _field('group_name', 'Group', 'group_name', thehive=_row('Group', 'group_name'), optional=True),
        _field('sector', 'Sector', 'sector', thehive=_row('Sector', 'sector'), optional=True),
        _field('country', 'Country', 'country', thehive=_row('Country', 'country'), optional=True),
        Field('keyword', 'Matched keyword', slack=_bullet('Matched Keyword', 'keyword'),
              citadel=_item('Matched Keyword', 'keyword'), thehive=_row('Matched keyword', 'keyword')),
    ),
    layouts={
        'slack': Layout(head=_slack_head(_VICTIM_HIT_TITLE, _VICTIM_HIT_INTRO), tail=SLACK_TAIL),
        'citadel': Layout(head=_citadel_head(_VICTIM_HIT_TITLE, _VICTIM_HIT_INTRO), tail=CITADEL_LIST_TAIL),
        'thehive': Layout(
            head=_table_head("Ransomware Victim Watch Rule Triggered"), tail=_TH_TAIL,
            title="Victim Rule Hit - {rule_name} matched {victim_name} ({group_name})"),
    },
    email=EmailSpec('Rule Hit - {rule_name} matched {victim_name} ({group_name})', samples.email_cyber_watch),
    thehive_meta={'severity': 2, 'tlp': 2, 'pap': 2},
)

_UDRP_TITLE = "[UDRP DECISION] ⚖️ {domain_name_sanitized}"
_UDRP_INTRO = "A UDRP decision has been detected for a monitored domain:"

UDRP_DECISION = NotificationType(
    id='udrp_decision', label='UDRP decision', module='website_monitoring', url_suffix='#/website_monitoring/',
    sample=samples.udrp_decision,
    fields=(
        _field('domain', 'Domain', 'domain_name_sanitized', required=True),
        _field('decision', 'Decision', 'decision_label'),
        _field('date', 'Date', 'date'),
        _field('ticket', 'Ticket', 'ticket'),
        Field('source', 'Source', slack="• *Source:* udrpsearch.com\n", citadel="<tr><td><strong>Source</strong></td><td>udrpsearch.com</td></tr>"),
    ),
    layouts={
        'slack': Layout(head=_slack_head(_UDRP_TITLE, _UDRP_INTRO), tail=SLACK_TAIL),
        'citadel': Layout(head=_citadel_head(_UDRP_TITLE, _UDRP_INTRO), tail=CITADEL_LIST_TAIL),
    },
    email=EmailSpec('[UDRP DECISION] {domain_name_sanitized}', samples.email_udrp_decision),
)

_PAGE_TITLE = "[PAGE CHANGE] 📄 {page_name}"
_PAGE_INTRO = "A monitored page changed:"

PAGE_CHANGE = NotificationType(
    id='page_change', label='Monitored page change', module='website_monitoring', url_suffix='#/website_monitoring/',
    sample=samples.page_change,
    fields=(
        _field('page', 'Page', 'page_name', required=True),
        _field('url', 'URL', 'page_url'),
        _field('change', 'Change', 'change_percent'),
        _field('added', 'Added', 'added_text', optional=True),
        _field('removed', 'Removed', 'removed_text', optional=True),
    ),
    layouts={
        'slack': Layout(head=_slack_head(_PAGE_TITLE, _PAGE_INTRO), tail=SLACK_TAIL),
        'citadel': Layout(head=_citadel_head(_PAGE_TITLE, _PAGE_INTRO), tail=CITADEL_LIST_TAIL),
    },
    email=EmailSpec('[PAGE CHANGE] {page_name}', samples.email_page_change),
)

_RULE_TITLE = "[ARTICLE RULE] 🧩 {rule_name}"
_RULE_INTRO = "An article of the RSS feeds matched a monitored keyword rule:"

ARTICLE_RULE_HIT = NotificationType(
    id='article_rule_hit', label='Keyword rule match', module='threats_watcher', url_suffix='#/',
    sample=samples.article_rule_hit,
    fields=(
        _field('rule', 'Rule', 'rule_name', required=True),
        _field('article', 'Article', 'article_title'),
        _field('url', 'URL', 'article_url'),
        _field('words', 'Words found', 'matched_words'),
    ),
    layouts={
        'slack': Layout(head=_slack_head(_RULE_TITLE, _RULE_INTRO), tail=SLACK_TAIL),
        'citadel': Layout(head=_citadel_head(_RULE_TITLE, _RULE_INTRO), tail=CITADEL_LIST_TAIL),
    },
    email=EmailSpec('[KEYWORD RULE] {rule_name}', samples.email_article_rule_hit),
)

register(
    THREATS_WATCHER, THREATS_WATCHER_WEEKLY, THREATS_WATCHER_BREAKING,
    DATA_LEAK, DATA_LEAK_GROUP, WEBSITE_MONITORING,
    DNS_FINDER, DNS_FINDER_GROUP, DNS_FINDER_DANGLING, DNS_FINDER_CERT_TRANSPARENCY,
    CYBER_WATCH_NEW_CVE, CYBER_WATCH_CVE_HIT, CYBER_WATCH_NEW_VICTIM, CYBER_WATCH_VICTIM_HIT,
    UDRP_DECISION, PAGE_CHANGE, ARTICLE_RULE_HIT,
)
