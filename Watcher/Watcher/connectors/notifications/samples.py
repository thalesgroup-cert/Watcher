"""Fictional data for the previews and the tests: what a message of each notification looks like."""
from types import SimpleNamespace

from django.conf import settings

# Fixed on purpose: a preview must not depend on this instance's URL.
URL = 'https://watcher.example.com/'

SUMMARY = (
    "Ransomware activity rose this week.\n\n"
    "- A new loader targets healthcare providers.\n"
    "- Two critical CVEs are exploited in the wild."
)


class _Domain(SimpleNamespace):
    """A monitored domain: templates print it with str() or read `.domain_name`."""

    def __str__(self):
        return self.domain_name


def _dns_alert(status='confirmed'):
    twisted = SimpleNamespace(
        domain_name='examp1e.com',
        keyword_monitored='example',
        dns_monitored=_Domain(domain_name='example.com'),
        fuzzer='homoglyph',
        cname_target='bucket.s3.amazonaws.com',
        provider='Amazon S3',
    )
    return SimpleNamespace(pk=17, dns_twisted=twisted, status=status)


def threats_watcher():
    return {'words_list': 'ransomware\nphishing kit', 'details_url': URL + '#/', 'app_name': 'threats_watcher'}


def threats_watcher_weeklysummary():
    return {'summary_text': SUMMARY, 'details_url': URL + '#/', 'app_name': 'threats_watcher'}


def threats_watcher_breakingnews():
    return {
        'keyword': 'ransomware', 'occurrences': 12, 'summary_text': SUMMARY,
        'details_url': URL + '#/', 'app_name': 'threats_watcher',
    }


def data_leak():
    return {
        'alert_pk': 42, 'keyword_name': 'example.com', 'url': 'https://pastebin.com/abc123',
        'content': 'user@example.com:hunter2', 'details_url': URL + '#data_leak', 'app_name': 'data_leak',
    }


def data_leak_group():
    return {'alerts_number': 5, 'keyword': 'example.com', 'details_url': URL + '#data_leak', 'app_name': 'data_leak_group'}


def website_monitoring():
    alert_data = {
        'type': 'IP address change', 'new_ip': '203.0.113.7', 'old_ip': '198.51.100.4',
        'new_ip_second': '203.0.113.8', 'old_ip_second': '198.51.100.5',
    }
    return {
        'ticket_id': ' - #T-1042', 'alert_type': 'IP address change', 'domain_name': 'example.com',
        'domain_name_sanitized': 'example[.]com', 'difference_score': 12,
        'new_ip': '203.0.113.7', 'old_ip': '198.51.100.4', 'new_ip_second': '203.0.113.8', 'old_ip_second': '198.51.100.5',
        'new_mx_records': 'mx2.example.com', 'old_mx_records': 'mx1.example.com',
        'new_mail_A_record_ip': '203.0.113.20', 'old_mail_A_record_ip': '198.51.100.20',
        'details_url': URL + '#/website_monitoring/', 'app_name': 'website_monitoring', 'alert_data': alert_data,
    }


def dns_finder():
    return {
        'alert': _dns_alert(), 'dns_domain_name_sanitized': 'examp1e[.]com',
        'subdomain': 'examp1e.com', 'subdomain_sanitized': 'examp1e[.]com', 'parent_domain': 'example.com',
        'parent_domain_sanitized': 'example[.]com', 'keyword': 'example',
        'corporate_dns': 'example.com', 'corporate_dns_sanitized': 'example[.]com', 'fuzzer': 'homoglyph',
        'details_url': URL + '#/dns_finder/', 'app_name': 'dns_finder',
    }


def dns_finder_group():
    return {
        'alerts_number': 8, 'dns_domain_name_sanitized_group': 'example[.]com',
        'dns_monitored': _Domain(domain_name='example.com'),
        'details_url': URL + '#/dns_finder/', 'app_name': 'dns_finder_group',
    }


def dns_finder_dangling():
    return {
        'alert': _dns_alert(), 'subdomain': 'old.example.com', 'subdomain_sanitized': 'old[.]example[.]com',
        'parent_domain': 'example.com', 'parent_domain_sanitized': 'example[.]com',
        'cname_target': 'bucket.s3.amazonaws.com', 'cname_target_sanitized': 'bucket[.]s3[.]amazonaws[.]com', 'provider': 'Amazon S3', 'takeover_status': 'Confirmed',
        'takeover_status_detail': 'Confirmed - takeover verified (NXDOMAIN or provider signature found)',
        'details_url': URL + '#/dns_finder/', 'app_name': 'dns_finder_dangling',
    }


def _cyber_watch(notification_type):
    return {
        'notification_type': notification_type, 'cve_id': 'CVE-2026-12345', 'severity': 'CRITICAL', 'cvss_score': 9.8,
        'description': 'Remote code execution in the example product.', 'rule_name': 'Our stack',
        'keyword': 'example', 'victim_name': 'Example Corp', 'group_name': 'LockBit', 'country': 'FR',
        'sector': 'Manufacturing', 'details_url': URL + '#/cyber_watch', 'app_name': 'cyber_watch',
        'severity_suffix': ' (CRITICAL)', 'severity_bracket': ' [CRITICAL]', 'severity_part': ' | Severity: CRITICAL',
        'cvss_part': ' | CVSS: 9.8',
    }


def cyber_watch_new_cve():
    return _cyber_watch('new_cve')


def cyber_watch_cve_hit():
    return _cyber_watch('cve_hit')


def cyber_watch_new_victim():
    return _cyber_watch('new_victim')


def cyber_watch_victim_hit():
    return _cyber_watch('victim_hit')


def udrp_decision():
    return {
        'domain_name_sanitized': 'example[.]com', 'decision_label': 'favourable (Transfer/Cancel)',
        'date': '2026-10-21', 'ticket': 'T-1042', 'details_url': URL + '#/website_monitoring/',
        'site': SimpleNamespace(domain_name='example.com', ticket_id='T-1042'),
    }


def article_rule_hit():
    return {
        'rule_name': 'Actor and partner', 'article_title': 'Threat actor targets a partner of the group',
        'article_url': 'https://blog.example.org/post', 'matched_words': 'Example actor, Example partner',
        'details_url': URL,
    }


def page_change():
    return {
        'page_name': 'Example researcher blog', 'page_url': 'https://blog.example.org/', 'change_percent': '12.5 %',
        'added_text': '• A new write-up on a loader family', 'removed_text': '• Draft (coming soon)',
        'added_lines': ['A new write-up on a loader family'], 'removed_lines': ['Draft (coming soon)'],
        'more_added': 0, 'more_removed': 0, 'details_url': URL + '#/website_monitoring/',
    }


# Sample email bodies: the existing HTML templates, fed with the sample data. Imported when called, because the
# template modules and common.core import this package.
def email_threats_watcher(ctx):
    from common.mail_template.threats_watcher_template import get_threats_watcher_template
    return get_threats_watcher_template(settings.WORDS_OCCURRENCE, ctx['words_list'].split('\n'))


def email_threats_watcher_weeklysummary(ctx):
    from common.mail_template.threats_watcher_weeklysummary_template import get_threats_watcher_weeklysummary_template
    return get_threats_watcher_weeklysummary_template(ctx['summary_text'])


def email_threats_watcher_breakingnews(ctx):
    from common.mail_template.threats_watcher_breakingnews_template import get_threats_watcher_breakingnews_template
    return get_threats_watcher_breakingnews_template(ctx['summary_text'])


def email_article_rule_hit(ctx):
    from common.mail_template.article_rule_template import get_article_rule_template
    return get_article_rule_template(ctx)


def email_page_change(ctx):
    from common.mail_template.page_change_template import get_page_change_template
    return get_page_change_template(ctx)


def email_data_leak(ctx):
    from common.mail_template.data_leak_template import get_data_leak_template
    return get_data_leak_template(SimpleNamespace(pk=ctx['alert_pk'], keyword=ctx['keyword_name'], url=ctx['url']))


def email_data_leak_group(ctx):
    from common.mail_template.data_leak_group_template import get_data_leak_group_template
    return get_data_leak_group_template(ctx['keyword'], ctx['alerts_number'])


def email_website_monitoring(ctx):
    from common.mail_template.site_monitoring_template import get_site_monitoring_template
    return get_site_monitoring_template(ctx['domain_name'], '-', ctx['alert_data'])


def email_dns_finder(ctx):
    from common.mail_template.dns_finder_template import get_dns_finder_template
    return get_dns_finder_template(ctx['alert'])


def email_dns_finder_cert_transparency(ctx):
    from common.mail_template.dns_finder_cert_transparency import get_dns_finder_cert_transparency_template
    return get_dns_finder_cert_transparency_template(ctx['alert'])


def email_dns_finder_group(ctx):
    from common.mail_template.dns_finder_group_template import get_dns_finder_group_template
    return get_dns_finder_group_template(ctx['dns_monitored'], ctx['alerts_number'])


def email_dns_finder_dangling(ctx):
    from common.mail_template.dns_finder_dangling_template import get_dns_finder_dangling_template
    return get_dns_finder_dangling_template(ctx['alert'])


def email_cyber_watch(ctx):
    from common.mail_template.cyber_watch_template import get_cyber_watch_template
    return get_cyber_watch_template(ctx)


def email_udrp_decision(ctx):
    from common.mail_template.udrp_template import get_udrp_template
    return get_udrp_template(ctx['site'], 'won', ctx['decision_label'], ctx['date'])


def dns_finder_cert_transparency():
    return dns_finder()
