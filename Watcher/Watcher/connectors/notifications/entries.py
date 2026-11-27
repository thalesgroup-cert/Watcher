"""
The notifications Watcher sends: one entry per type, with its message on each channel.

A message is `head` + one line per selected field + `tail`. With every field selected it is the text Watcher sent
before the messages became configurable (checked against test_data/notification_golden.json).
"""
from django.conf import settings

from . import samples
from .catalogue import EmailSpec, Field, Layout, NotificationType, register

TAG = getattr(settings, 'SUBJECT_TAG_SITE_MONITORING', '')

def _slack_tail(label):
    """The link back to the object, named for what it opens."""
    return "\n<{object_url}|" + label + ">"


def _citadel_tail(label):
    return "<br><p><a href='{object_url}'>" + label + "</a></p>"


def _bullet(label, key):
    """Slack line."""
    return f"• *{label}:* {{{key}}}\n"


def _item(label, key):
    """Citadel line."""
    return f"<strong>{label}</strong>: {{{key}}}<br>"


def _star(label, key):
    """TheHive line in italics."""
    return f"*{label}:* {{{key}}}\n"


def _plain(label, key):
    """TheHive line without markup."""
    return f"{label}: {{{key}}}\n"


def _row(label, key):
    """TheHive row of a markdown table."""
    return f"| **{label}** | {{{key}}} |\n"


def _slack_head(title, tag, intro=''):
    """A headline, the module (and what it is) in small under it, then a sentence when there is something to explain."""
    return "*" + title + "*\n_" + tag + " · {sent_at}_\n\n" + (intro + "\n\n" if intro else "")


def _citadel_head(title, tag, intro=''):
    return "<h4>" + title + "</h4><p><em>" + tag + " · {sent_at}</em></p>" + ("<p>" + intro + "</p>" if intro else "")


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
            head="*🔥 Trendy threats detected*\n_Threats Watcher · {sent_at}_\n\n"
                 "Please find the new trendy word(s) detected below:\n\n{words_list}\n\n"
                 "<{object_url}|See the trendy words in Watcher>"),
        'citadel': Layout(
            head="<h4>🔥 Trendy threats detected</h4><p><em>Threats Watcher · {sent_at}</em></p>"
                 "<p>Please find the new trendy word(s) detected below:</p>"
                 "<p><strong>{words_list}</strong></p>"
                 "<br><p><a href='{object_url}'>See the trendy words in Watcher</a></p>"),
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
            head="*📊 Weekly report*\n_Threats Watcher · {sent_at}_\n\nHere is the weekly report summary:\n\n"
                 "{summary_text}\n\n<{object_url}|Read the full report in Watcher>"),
        'citadel': Layout(
            head="<h4>📊 Weekly report</h4><p><em>Threats Watcher · {sent_at}</em></p>"
                 "<p>Here is the weekly report summary:</p><p>{summary_text}</p>"
                 "<br><p><a href='{object_url}'>Read the full report in Watcher</a></p>"),
    },
    email=EmailSpec('[REPORT] Weekly Cyber Threat Intelligence Summary', samples.email_threats_watcher_weeklysummary),
)

THREATS_WATCHER_BREAKING = NotificationType(
    id='threats_watcher_breakingnews', label='Breaking news', module='threats_watcher', url_suffix='#/',
    sample=samples.threats_watcher_breakingnews,
    layouts={
        'slack': Layout(
            head="*🚨 Breaking news*\n_Threats Watcher · {sent_at}_\n\nWatcher has detected a new breaking news:\n\n{summary_text}\n\n"
                 "<{object_url}|Read it in Watcher>"),
        'citadel': Layout(
            head="<h4>🚨 Breaking news</h4><p><em>Threats Watcher · {sent_at}</em></p>"
                 "<p>Watcher has detected a new breaking news:</p><p>{summary_text}</p>"
                 "<br><p><a href='{object_url}'>Read it in Watcher</a></p>"),
    },
    email=EmailSpec('[ALERT] Breaking News - Critical Threat Detected', samples.email_threats_watcher_breakingnews),
)

_LEAK_TITLE = "🔔 Data leak detected: {keyword_name}"
_LEAK_TAG = "Data Leak · alert #{alert_pk}"

DATA_LEAK = NotificationType(
    id='data_leak', label='Data leak alert', module='data_leak', url_suffix='#data_leak',
    sample=samples.data_leak,
    fields=(
        _field('keyword_name', 'Keyword', 'keyword_name', thehive=_row('Keyword', 'keyword_name')),
        _field('url', 'Source', 'url', thehive=_row('Source', 'url'), required=True),
    ),
    layouts={
        'slack': Layout(head=_slack_head(_LEAK_TITLE, _LEAK_TAG), tail=_slack_tail('Open the leak alert in Watcher')),
        'citadel': Layout(head=_citadel_head(_LEAK_TITLE, _LEAK_TAG), tail=_citadel_tail('Open the leak alert in Watcher')),
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
            head="*🚨 {alerts_number} data leak alerts*\n_Data Leak · grouped · {sent_at}_\n\n"
                 "*{alerts_number}* new data leakage alerts have been detected for the keyword *{keyword}*\n\n"
                 "<{object_url}|Open the leak alerts in Watcher>"),
        'citadel': Layout(
            head="<h4>🚨 {alerts_number} data leak alerts</h4><p><em>Data Leak · grouped · {sent_at}</em></p>"
                 "<p><strong>{alerts_number}</strong> new data leakage alerts have been detected for the keyword "
                 "<strong>{keyword}</strong>.</p>"
                 "<br><p><a href='{object_url}'>Open the leak alerts in Watcher</a></p>"),
    },
    email=EmailSpec('[{alerts_number} ALERTS] Data Leak', samples.email_data_leak_group),
)


def _change(id, label, key, th_label=None):
    """A value that only exists when it changed: its line is left out of the message otherwise."""
    shown = th_label or label
    return Field(id, label, slack=_bullet(shown, key), citadel=_item(shown, key), thehive=_row(shown, key),
                 optional=True)


_SITE_TITLE = "🔔 {alert_type} on {domain_name_sanitized}"
_SITE_TAG = "Website Monitoring · " + TAG + "{ticket_id}"

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
        'slack': Layout(head=_slack_head(_SITE_TITLE, _SITE_TAG), tail=_slack_tail('Open the website in Watcher')),
        'citadel': Layout(head=_citadel_head(_SITE_TITLE, _SITE_TAG), tail=_citadel_tail('Open the website in Watcher')),
        'thehive': Layout(
            head=_th_head("Website monitoring - {alert_type}", "**{domain_name_sanitized}** is under surveillance."),
            tail=_TH_TAIL, title="Website Monitoring Detected - {alert_type} on {domain_name_sanitized}"),
    },
    email=EmailSpec('[' + TAG + '{ticket_id}] {alert_type} on {domain_name_sanitized}', samples.email_website_monitoring),
    thehive_meta={'severity': 1, 'tlp': 1, 'pap': 1},
)

_DNS_TITLE = "🚨 Suspicious domain: {dns_domain_name_sanitized}"
_DNS_TAG = "DNS Threats · alert #{alert.pk}"

DNS_FINDER = NotificationType(
    id='dns_finder', label='Suspicious domain', module='dns_finder', url_suffix='#/dns_finder/',
    sample=samples.dns_finder,
    fields=(
        Field('twisted_dns', 'Twisted DNS', slack=_bullet('Suspicious domain', 'dns_domain_name_sanitized'),
              citadel=_item('Suspicious domain', 'dns_domain_name_sanitized'), required=True),
        Field('subdomain', 'Subdomain', thehive=_row('Suspicious domain', 'subdomain_sanitized'), required=True),
        Field('source', 'Source', slack=_bullet('Source', 'source_label'), citadel=_item('Source', 'source_label'),
              thehive=_row('Source', 'source_label'), optional=True),
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
        'slack': Layout(head=_slack_head(_DNS_TITLE, _DNS_TAG), tail=_slack_tail('Open the alert in Watcher')),
        'citadel': Layout(head=_citadel_head(_DNS_TITLE, _DNS_TAG), tail=_citadel_tail('Open the alert in Watcher')),
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
             "{{#if source_label}}| **Source** | {source_label} |\n{{/if}}"
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
            head="*🚨 {alerts_number} suspicious domains*\n_DNS Threats · grouped · {sent_at}_\n\n"
                 "*{alerts_number}* new DNS twisted alerts for *{dns_domain_name_sanitized_group}* asset.\n\n"
                 "<{object_url}|Open the alerts in Watcher>"),
        'citadel': Layout(
            head="<h4>🚨 {alerts_number} suspicious domains</h4><p><em>DNS Threats · grouped · {sent_at}</em></p>"
                 "<p><strong>{alerts_number}</strong> new DNS twisted alerts for "
                 "<strong>{dns_domain_name_sanitized_group}</strong> asset.</p>"
                 "<br><p><a href='{object_url}'>Open the alerts in Watcher</a></p>"),
    },
    email=EmailSpec('[{alerts_number} ALERTS] DNS Threats Monitored', samples.email_dns_finder_group),
)

_DANGLING_TITLE = "⚠️ {takeover_status} Subdomain Takeover: {subdomain_sanitized}"
_DANGLING_TAG = "DNS Threats · dangling alert #{alert.pk}"

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
        'slack': Layout(head=_slack_head(_DANGLING_TITLE, _DANGLING_TAG), tail=_slack_tail('Open the takeover alert in Watcher')),
        'citadel': Layout(head=_citadel_head(_DANGLING_TITLE, _DANGLING_TAG), tail=_citadel_tail('Open the takeover alert in Watcher')),
        'thehive': Layout(
            head=_th_head("Possible subdomain takeover",
                          "A monitored subdomain points to a resource that someone else may be able to claim."),
            tail=_TH_TAIL, title="{takeover_status} Subdomain Takeover - {subdomain_sanitized}"),
    },
    email=EmailSpec(
        '[ALERT #{alert.pk}] DNS Threats Monitored - Dangling Subdomain ({takeover_status})', samples.email_dns_finder_dangling),
    thehive_meta={'severity': 2, 'tlp': 2, 'pap': 2},
)

_NEW_CVE_TITLE = "{severity_dot}{cve_id} detected"
_NEW_CVE_TAG = "Cyber Watch · new CVE"

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
        'slack': Layout(head=_slack_head(_NEW_CVE_TITLE, _NEW_CVE_TAG), tail=_slack_tail('Open the CVE in Watcher')),
        'citadel': Layout(head=_citadel_head(_NEW_CVE_TITLE, _NEW_CVE_TAG), tail=_citadel_tail('Open the CVE in Watcher')),
        'thehive': Layout(
            head=_table_head("New CVE Detected"), tail=_TH_TAIL,
            title="New CVE - {cve_id}{severity_part}{cvss_part}"),
    },
    email=EmailSpec('New CVE - {cve_id}{severity_suffix}', samples.email_cyber_watch),
    thehive_meta={'severity': 1, 'tlp': 1, 'pap': 1},
)

_CVE_HIT_TITLE = "{severity_dot}🎯 Rule '{rule_name}' matched {cve_id}"
_CVE_HIT_TAG = "Cyber Watch · CVE hit"

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
        'slack': Layout(head=_slack_head(_CVE_HIT_TITLE, _CVE_HIT_TAG), tail=_slack_tail('Open the CVE in Watcher')),
        'citadel': Layout(head=_citadel_head(_CVE_HIT_TITLE, _CVE_HIT_TAG), tail=_citadel_tail('Open the CVE in Watcher')),
        'thehive': Layout(
            head=_table_head("CVE Watch Rule Triggered"), tail=_TH_TAIL,
            title="CVE Rule Hit - {rule_name} matched {cve_id}{severity_bracket}"),
    },
    email=EmailSpec('Rule Hit - {rule_name} matched {cve_id}{severity_bracket}', samples.email_cyber_watch),
    thehive_meta={'severity': 2, 'tlp': 2, 'pap': 2},
)

_EXPLOITED_TITLE = "{severity_dot}🔥 {cve_id} is exploited in the wild"
_EXPLOITED_TAG = "Cyber Watch · exploited CVE"
_EXPLOITED_INTRO = "CISA has added a CVE to its catalogue of the vulnerabilities exploited in the wild:"

CYBER_WATCH_CVE_EXPLOITED = NotificationType(
    id='cyber_watch_cve_exploited', label='CVE exploited in the wild', module='cyber_watch', url_suffix='#/cyber_watch',
    sample=samples.cyber_watch_cve_exploited,
    fields=(
        _field('cve_id', 'CVE ID', 'cve_id', thehive=_row('CVE ID', 'cve_id'), required=True),
        _field('severity', 'Severity', 'severity', thehive=_row('Severity', 'severity'), optional=True),
        _field('cvss_score', 'CVSS Score', 'cvss_score', thehive=_row('CVSS Score', 'cvss_score'), optional=True),
        _field('epss', 'EPSS', 'epss', thehive=_row('EPSS', 'epss'), optional=True),
        _field('fix_by', 'Fix by', 'fix_by', thehive=_row('Fix by', 'fix_by'), optional=True),
        _field('ransomware', 'Ransomware', 'ransomware', thehive=_row('Ransomware', 'ransomware'), optional=True),
        _field('description', 'Description', 'description', thehive="\n### Description\n\n{description}\n\n", optional=True),
    ),
    layouts={
        'slack': Layout(head=_slack_head(_EXPLOITED_TITLE, _EXPLOITED_TAG, _EXPLOITED_INTRO), tail=_slack_tail('Open the CVE in Watcher')),
        'citadel': Layout(head=_citadel_head(_EXPLOITED_TITLE, _EXPLOITED_TAG, _EXPLOITED_INTRO), tail=_citadel_tail('Open the CVE in Watcher')),
        'thehive': Layout(
            head=_table_head("CVE Exploited in the Wild"), tail=_TH_TAIL,
            title="Exploited CVE - {cve_id}{severity_part}{cvss_part}"),
    },
    email=EmailSpec('Exploited CVE - {cve_id}{severity_suffix}', samples.email_cyber_watch),
    thehive_meta={'severity': 3, 'tlp': 2, 'pap': 2},
)

_NEW_VICTIM_TITLE = "🏴‍☠️ {victim_name} ({group_name})"
_NEW_VICTIM_TAG = "Cyber Watch · new ransomware victim"

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
        'slack': Layout(head=_slack_head(_NEW_VICTIM_TITLE, _NEW_VICTIM_TAG), tail=_slack_tail('Open the victim in Watcher')),
        'citadel': Layout(head=_citadel_head(_NEW_VICTIM_TITLE, _NEW_VICTIM_TAG), tail=_citadel_tail('Open the victim in Watcher')),
        'thehive': Layout(
            head=_table_head("New Ransomware Victim Detected"), tail=_TH_TAIL,
            title="New Ransomware Victim - {victim_name} | {group_name} | {sector}"),
    },
    email=EmailSpec('New Ransomware Victim - {victim_name} | {group_name}', samples.email_cyber_watch),
    thehive_meta={'severity': 1, 'tlp': 1, 'pap': 1},
)

_VICTIM_HIT_TITLE = "🎯 Rule '{rule_name}' matched {victim_name} ({group_name})"
_VICTIM_HIT_TAG = "Cyber Watch · victim hit"

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
        'slack': Layout(head=_slack_head(_VICTIM_HIT_TITLE, _VICTIM_HIT_TAG), tail=_slack_tail('Open the victim in Watcher')),
        'citadel': Layout(head=_citadel_head(_VICTIM_HIT_TITLE, _VICTIM_HIT_TAG), tail=_citadel_tail('Open the victim in Watcher')),
        'thehive': Layout(
            head=_table_head("Ransomware Victim Watch Rule Triggered"), tail=_TH_TAIL,
            title="Victim Rule Hit - {rule_name} matched {victim_name} ({group_name})"),
    },
    email=EmailSpec('Rule Hit - {rule_name} matched {victim_name} ({group_name})', samples.email_cyber_watch),
    thehive_meta={'severity': 2, 'tlp': 2, 'pap': 2},
)

_UDRP_TITLE = "⚖️ UDRP decision: {domain_name_sanitized}"
_UDRP_TAG = "Website Monitoring · UDRP"

UDRP_DECISION = NotificationType(
    id='udrp_decision', label='UDRP decision', module='website_monitoring', url_suffix='#/website_monitoring/',
    sample=samples.udrp_decision,
    fields=(
        _field('domain', 'Domain', 'domain_name_sanitized', required=True),
        _field('decision', 'Decision', 'decision_label'),
        _field('date', 'Date', 'date'),
        _field('ticket', 'Ticket', 'ticket'),
        Field('source', 'Source', slack="• *Source:* udrpsearch.com\n", citadel="<strong>Source</strong>: udrpsearch.com<br>"),
    ),
    layouts={
        'slack': Layout(head=_slack_head(_UDRP_TITLE, _UDRP_TAG), tail=_slack_tail('Open the decision in Watcher')),
        'citadel': Layout(head=_citadel_head(_UDRP_TITLE, _UDRP_TAG), tail=_citadel_tail('Open the decision in Watcher')),
    },
    email=EmailSpec('[UDRP DECISION] {domain_name_sanitized}', samples.email_udrp_decision),
)

_PAGE_TITLE = "📄 {page_name} changed"
_PAGE_TAG = "Website Monitoring · page change"

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
        'slack': Layout(head=_slack_head(_PAGE_TITLE, _PAGE_TAG), tail=_slack_tail('Open the page in Watcher')),
        'citadel': Layout(head=_citadel_head(_PAGE_TITLE, _PAGE_TAG), tail=_citadel_tail('Open the page in Watcher')),
    },
    email=EmailSpec('[PAGE CHANGE] {page_name}', samples.email_page_change),
)

_RULE_TITLE = "🧩 {rule_name}"
_RULE_TAG = "Threats Watcher · keyword rule"

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
        'slack': Layout(head=_slack_head(_RULE_TITLE, _RULE_TAG), tail=_slack_tail('Open the article in Watcher')),
        'citadel': Layout(head=_citadel_head(_RULE_TITLE, _RULE_TAG), tail=_citadel_tail('Open the article in Watcher')),
    },
    email=EmailSpec('[KEYWORD RULE] {rule_name}', samples.email_article_rule_hit),
)

_EXPIRING_TITLE = "⏳ {domain_name_sanitized} expires {days_text}"
_EXPIRING_TAG = "Legitimate Domains · expiry"
_EXPIRING_INTRO = "A legitimate domain is about to expire. Its date was confirmed by the registry:"

LEGITIMATE_DOMAIN_EXPIRING = NotificationType(
    id='legitimate_domain_expiring', label='Legitimate domain close to expiry', module='legitimate_domains',
    url_suffix='#/legitimate_domains',
    sample=samples.legitimate_domain_expiring,
    fields=(
        _field('domain', 'Domain', 'domain_name_sanitized', required=True),
        _field('expiry', 'Expires on', 'expiry'),
        _field('days', 'Days left', 'days_left'),
        _field('checked', 'Checked with the registry', 'checked'),
    ),
    layouts={
        'slack': Layout(head=_slack_head(_EXPIRING_TITLE, _EXPIRING_TAG, _EXPIRING_INTRO), tail=_slack_tail('Open the domain in Watcher')),
        'citadel': Layout(head=_citadel_head(_EXPIRING_TITLE, _EXPIRING_TAG, _EXPIRING_INTRO), tail=_citadel_tail('Open the domain in Watcher')),
    },
    email=EmailSpec('[DOMAIN EXPIRY] {domain_name_sanitized} expires {days_text}', samples.email_legitimate_domain_expiring),
)

_REGRESSION_TITLE = "⚠️ {domain_name_sanitized}: the registry gave an earlier date"
_REGRESSION_TAG = "Legitimate Domains · expiry"
_REGRESSION_INTRO = "The registry gave the same earlier expiry date twice, so Watcher wrote it. Check the domain:"

LEGITIMATE_DOMAIN_EXPIRY_REGRESSION = NotificationType(
    id='legitimate_domain_expiry_regression', label='Legitimate domain expiry date moved earlier',
    module='legitimate_domains', url_suffix='#/legitimate_domains',
    sample=samples.legitimate_domain_expiry_regression,
    fields=(
        _field('domain', 'Domain', 'domain_name_sanitized', required=True),
        _field('old', 'Previous date', 'old_expiry'),
        _field('new', 'New date', 'new_expiry'),
        _field('status', 'Now', 'status_text'),
    ),
    layouts={
        'slack': Layout(head=_slack_head(_REGRESSION_TITLE, _REGRESSION_TAG, _REGRESSION_INTRO), tail=_slack_tail('Open the domain in Watcher')),
        'citadel': Layout(head=_citadel_head(_REGRESSION_TITLE, _REGRESSION_TAG, _REGRESSION_INTRO), tail=_citadel_tail('Open the domain in Watcher')),
    },
    email=EmailSpec('[DOMAIN EXPIRY] {domain_name_sanitized}: earlier expiry date', samples.email_legitimate_domain_expiry_regression),
)

_SITE_EXPIRING_TITLE = "⏳ {domain_name_sanitized} expires {days_text}"
_SITE_EXPIRING_TAG = "Website Monitoring · expiry"
_SITE_EXPIRING_INTRO = (
    "The domain of a monitored website is about to expire. Once it lapses it may become available: "
    "decide whether to register it before someone else does.")

SITE_DOMAIN_EXPIRING = NotificationType(
    id='site_domain_expiring', label='Monitored website close to expiry', module='website_monitoring',
    url_suffix='#/website_monitoring/',
    sample=samples.site_domain_expiring,
    fields=(
        _field('domain', 'Domain', 'domain_name_sanitized', required=True),
        _field('legitimacy', 'Legitimacy', 'legitimacy_label'),
        _field('expiry', 'Expires on', 'expiry'),
        _field('days', 'Days left', 'days_left'),
        _field('registrar', 'Registrar', 'registrar', optional=True),
        _field('actions', 'Actions in progress', 'actions'),
        _field('ticket', 'Ticket', 'ticket', optional=True),
        _field('checked', 'Checked with the registry', 'checked'),
    ),
    layouts={
        'slack': Layout(head=_slack_head(_SITE_EXPIRING_TITLE, _SITE_EXPIRING_TAG, _SITE_EXPIRING_INTRO), tail=_slack_tail('Open the website in Watcher')),
        'citadel': Layout(head=_citadel_head(_SITE_EXPIRING_TITLE, _SITE_EXPIRING_TAG, _SITE_EXPIRING_INTRO), tail=_citadel_tail('Open the website in Watcher')),
    },
    email=EmailSpec('[SITE EXPIRY] {domain_name_sanitized} expires {days_text}', samples.email_site_domain_expiring),
)

_SITE_AVAILABLE_TITLE = "🔓 {domain_name_sanitized} is no longer registered"
_SITE_AVAILABLE_TAG = "Website Monitoring · domain available"
_SITE_AVAILABLE_INTRO = (
    "The registry no longer knows the domain of a monitored website: it was registered and now it is available. "
    "Register it now if you want to keep it out of the attacker's hands.")

SITE_DOMAIN_AVAILABLE = NotificationType(
    id='site_domain_available', label='Monitored website domain now available', module='website_monitoring',
    url_suffix='#/website_monitoring/',
    sample=samples.site_domain_available,
    fields=(
        _field('domain', 'Domain', 'domain_name_sanitized', required=True),
        _field('legitimacy', 'Legitimacy', 'legitimacy_label'),
        _field('registrar', 'Last registrar', 'registrar', optional=True),
        _field('expiry', 'Last expiry date', 'expiry', optional=True),
        _field('actions', 'Actions in progress', 'actions'),
        _field('ticket', 'Ticket', 'ticket', optional=True),
        _field('checked', 'Checked with the registry', 'checked'),
    ),
    layouts={
        'slack': Layout(head=_slack_head(_SITE_AVAILABLE_TITLE, _SITE_AVAILABLE_TAG, _SITE_AVAILABLE_INTRO), tail=_slack_tail('Open the website in Watcher')),
        'citadel': Layout(head=_citadel_head(_SITE_AVAILABLE_TITLE, _SITE_AVAILABLE_TAG, _SITE_AVAILABLE_INTRO), tail=_citadel_tail('Open the website in Watcher')),
    },
    email=EmailSpec('[SITE AVAILABLE] {domain_name_sanitized} is no longer registered', samples.email_site_domain_available),
)

register(
    SITE_DOMAIN_AVAILABLE, SITE_DOMAIN_EXPIRING,
    LEGITIMATE_DOMAIN_EXPIRING, LEGITIMATE_DOMAIN_EXPIRY_REGRESSION,
    THREATS_WATCHER, THREATS_WATCHER_WEEKLY, THREATS_WATCHER_BREAKING,
    DATA_LEAK, DATA_LEAK_GROUP, WEBSITE_MONITORING,
    DNS_FINDER, DNS_FINDER_GROUP, DNS_FINDER_DANGLING, DNS_FINDER_CERT_TRANSPARENCY,
    CYBER_WATCH_NEW_CVE, CYBER_WATCH_CVE_HIT, CYBER_WATCH_CVE_EXPLOITED, CYBER_WATCH_NEW_VICTIM, CYBER_WATCH_VICTIM_HIT,
    UDRP_DECISION, PAGE_CHANGE, ARTICLE_RULE_HIT,
)
