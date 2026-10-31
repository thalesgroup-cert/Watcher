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
from .mail_template.dns_finder_dangling_template import get_dns_finder_dangling_template
from .mail_template.cyber_watch_template import get_cyber_watch_template
from .utils.send_thehive_alerts import send_thehive_alert
from .utils.job_log import job_count, logged_job, note_channel, report_channel, reported_notification, run_channel
from .utils.update_thehive import search_thehive_for_ticket_id, update_existing_alert_case, create_new_alert, search_thehive_for_observable
from connectors.core import get_thehive_config, get_slack_config, get_citadel_config
# One line: docs/build_the_docs.sh comments out the `from connectors` lines one by one.
from connectors.notifications import email_subject, find_type, is_enabled, render_message, render_per_alert, render_thehive_title, thehive_meta
import tldextract
from apscheduler.schedulers.background import BackgroundScheduler
import tzlocal
from django.db import close_old_connections
from .models import Screenshot
import requests


# Configure logger
logger = logging.getLogger('watcher.common')


def start_scheduler():
    """
    Launch multiple planning tasks in background:
        - Fire WHOIS discovery every 30 minute from Monday to Sunday
        - Fire Legitimate Domains RDAP/WHOIS every 30 minutes
        - Fire Monitored Sites RDAP/WHOIS every hour
        - Fire SSL certificate check every 6 hours
        - Fire Connectors health check every Monday at 06:00
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

    from connectors.core import run_weekly_health_checks
    scheduler.add_job(run_weekly_health_checks, 'cron', day_of_week='mon', hour=6, minute=0, id='connectors_health_check_job',
                      max_instances=1,
                      replace_existing=True)

    scheduler.start()


def generate_ref():
    """
    Generate unique 'sourceRef' for an alert.
    """
    ref = datetime.now().strftime("%y%m%d") + "-" + str(token_hex(3))[:5]
    return ref


# Dangling DNS verdict wording shared by every channel
DANGLING_STATUS_DETAILS = {
    'Confirmed': "Confirmed - takeover verified (NXDOMAIN or provider signature found)",
    'Suspected': "Suspected - vulnerable provider matched, HTTP verification inconclusive",
}

def _join_records(value):
    """DNS records are stored as a list; a message or an observable shows them on one line."""
    if isinstance(value, (list, tuple)):
        return ", ".join(str(item) for item in value) or None
    return value


_DOMAIN_MODULES = ('dns_finder', 'dns_finder_dangling', 'website_monitoring')
# Tags that only make sense on an alert about a domain
_DOMAIN_TAGS = ('impersonation', 'malicious domain', 'typosquatting')
_NO_VALUE = ('', 'none', 'n/a', 'unknown')
_SEVERITY_LEVELS = {'LOW': 1, 'MEDIUM': 2, 'HIGH': 3, 'CRITICAL': 4}


def _clean(value):
    """A value as text, or '' when the module had nothing to say."""
    text = '' if value is None else str(value).strip()
    return '' if text.lower() in _NO_VALUE else text


def _obs(data_type, data, message, ioc=False, tags=None):
    """
    An observable of a TheHive alert. `ioc` is for what Watcher flags as suspicious (a domain, a URL, an address);
    everything else it knows about the detection is context. `message` is the sentence shown in the list of observables.
    """
    return {"dataType": data_type, "data": data, "message": message, "ioc": ioc, "tags": tags or []}


def watcher_object_url(app_name, context_data):
    """
    Link to the object of a detection in Watcher: the page opens on it. None when it cannot be told, and the
    notification then links to the page of the module.
    """
    base = settings.WATCHER_URL.rstrip('/') + '/#/'
    try:
        if app_name == 'data_leak':
            alert = context_data.get('alert')
            return f"{base}data_leak?alert={alert.pk}" if alert else None
        if app_name in ('dns_finder', 'dns_finder_dangling'):
            alert = context_data.get('alert')
            return f"{base}dns_finder?tab=threats&threat={alert.pk}" if alert else None
        if app_name == 'website_monitoring':
            site = context_data.get('site')
            change_id = (context_data.get('alert_data') or {}).get('id')
            if change_id:
                return f"{base}website_monitoring?tab=changes&change={change_id}"
            return f"{base}website_monitoring?site={site.pk}" if site else None
        if app_name == 'cyber_watch':
            from cyber_watch.models import CVEAlert, RansomwareVictim
            kind = context_data.get('notification_type')
            if kind in ('new_cve', 'cve_hit'):
                cve = CVEAlert.objects.filter(cve_id=context_data.get('cve_id')).first()
                return f"{base}cyber_watch?tab=cves&cve={cve.pk}" if cve else None
            if kind in ('new_victim', 'victim_hit'):
                victim = RansomwareVictim.objects.filter(
                    victim_name=context_data.get('victim_name'), group__name=context_data.get('group_name')).first()
                return f"{base}cyber_watch?tab=ransomware&victim={victim.pk}" if victim else None
    except Exception as exc:
        logger.warning(f"Could not build the link to the {app_name} object: {exc}")
    return None


def _defang(value):
    """A domain written so that no client turns it into a link: example[.]com. None when there is none."""
    text = _clean(value)
    return text.replace('.', '[.]') if text else None


def _cve_title_parts(severity, cvss_score=None):
    """The pieces of a CVE title that exist: a severity or a score the source does not give is left out."""
    severity, cvss_score = _clean(severity), _clean(cvss_score)
    return {
        'severity_suffix': f" ({severity})" if severity else '',
        'severity_bracket': f" [{severity}]" if severity else '',
        'severity_part': f" | Severity: {severity}" if severity else '',
        'cvss_part': f" | CVSS: {cvss_score}" if cvss_score else '',
    }


def thehive_alert_tags(app_name, context_data, base_tags):
    """
    Tags of a TheHive alert: the configured ones (the domain ones only on alerts about a domain), the module, and what
    Watcher knows about the detection.
    """
    tags = [tag for tag in base_tags if app_name in _DOMAIN_MODULES or tag.lower() not in _DOMAIN_TAGS]
    tags.append(f"module:{app_name.replace('_dangling', '')}")

    def add(prefix, value):
        value = _clean(value)
        if value:
            tags.append(f"{prefix}:{value}")

    if app_name == 'cyber_watch':
        for prefix, key in (('severity', 'severity'), ('group', 'group_name'), ('sector', 'sector'),
                            ('country', 'country'), ('rule', 'rule_name'), ('keyword', 'keyword')):
            add(prefix, context_data.get(key))
    elif app_name == 'data_leak':
        alert = context_data.get('alert')
        add('keyword', alert.keyword.name if alert and alert.keyword else None)
    elif app_name in ('dns_finder', 'dns_finder_dangling'):
        twisted = getattr(context_data.get('alert'), 'dns_twisted', None)
        if twisted is not None:
            add('fuzzer', twisted.fuzzer)
            add('keyword', twisted.keyword_monitored.name if twisted.keyword_monitored else None)
            add('corporate_domain', twisted.dns_monitored.domain_name if twisted.dns_monitored else None)
            add('provider', getattr(twisted, 'provider', None))

    unique = []
    for tag in tags:
        if tag and tag not in unique:
            unique.append(tag)
    return unique


def thehive_severity_for(app_name, context_data, default):
    """Severity of a TheHive alert (1 low to 4 critical): the notification's, raised when the detection is worse."""
    if app_name == 'cyber_watch':
        level = _SEVERITY_LEVELS.get(str(context_data.get('severity', '')).upper())
        return max(default, level) if level else default
    if app_name == 'website_monitoring':
        legitimacy = getattr(context_data.get('site'), 'legitimacy', None) or 0
        if legitimacy >= 5:
            return max(default, 3)
        if legitimacy >= 3:
            return max(default, 2)
    return default


def thehive_comment(app_name, context_data):
    """What changed, for the comment added to an alert that already exists. None when there is nothing to say."""
    if app_name != 'website_monitoring':
        return None
    site = context_data.get('site')
    alert_data = context_data.get('alert_data') or {}
    if not site:
        return None
    lines = [f"**{alert_data.get('type') or 'Change detected'}** on {site.domain_name.replace('.', '[.]')}"]
    for label, key in (('IP address', 'ip'), ('Second IP address', 'ip_second'),
                       ('Mail server address', 'mail_A_record_ip'), ('MX records', 'MX_records')):
        old = _clean(_join_records(alert_data.get('old_' + key)))
        new = _clean(_join_records(alert_data.get('new_' + key)))
        if old and new:
            lines.append(f"- {label}: {old} -> {new}")
        elif new:
            lines.append(f"- {label}: {new} (new)")
        elif old:
            lines.append(f"- {label}: {old} (no longer there)")
    score = _clean(alert_data.get('difference_score'))
    if score:
        lines.append(f"- Content difference score: {score}")
    return '\n'.join(lines)


def collect_observables(app_name, context_data):
    """
    Observables of a TheHive alert. Only a suspicious domain, URL or address is an indicator; the victim, group,
    sector, country or keyword of a detection are context and go in the tags of the alert instead.
    """
    observables = []

    if app_name == 'threats_watcher':
        email_words = context_data.get('email_words', [])
        for word in email_words:
            clean_word = re.sub(r'<[^>]*>', '', word)
            if re.match(r'^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$', clean_word):
                observables.append(_obs("domain", clean_word, "Domain trending in the monitored sources"))
            else:
                observables.append(_obs("other", clean_word, "Word trending in the monitored sources"))

    elif app_name == 'website_monitoring':
        site = context_data.get('site')
        alert_data = context_data.get('alert_data', {})
        alert_type = alert_data.get('type')
        if site:
            domain = site.domain_name
            domain_tag = f"domain_name:{domain}"
            legitimacy = site.get_legitimacy_display() if site.legitimacy else 'legitimacy not assessed'
            observables.append(_obs("domain", domain, f"Domain under surveillance ({legitimacy})",
                                    ioc=(site.legitimacy or 0) >= 3, tags=[domain_tag]))
            # (key of the alert, type, what it is, is it an indicator)
            changes = (
                ('new_ip', 'ip', f"New IP address of {domain}", True),
                ('old_ip', 'ip', f"Previous IP address of {domain}", False),
                ('new_ip_second', 'ip', f"New second IP address of {domain}", True),
                ('old_ip_second', 'ip', f"Previous second IP address of {domain}", False),
                ('new_MX_records', 'other', f"New MX records of {domain}", False),
                ('old_MX_records', 'other', f"Previous MX records of {domain}", False),
                ('new_mail_A_record_ip', 'ip', f"New mail server address of {domain}", True),
                ('old_mail_A_record_ip', 'ip', f"Previous mail server address of {domain}", False),
            )
            for key, data_type, message, ioc in changes:
                value = _join_records(alert_data.get(key))
                if value:
                    observables.append(_obs(data_type, value, message, ioc=ioc,
                                            tags=[domain_tag, f"type:{alert_type}", f"details:{key}"]))

    elif app_name == 'data_leak':
        alert = context_data.get('alert')
        if alert:
            keyword = alert.keyword.name if alert.keyword else None
            observables.append(_obs("url", alert.url, f"Page matching the keyword '{keyword}'" if keyword
                                    else "Page matching a monitored keyword",
                                    tags=[f"keyword:{keyword}"] if keyword else []))

    elif app_name == 'dns_finder':
        alert = context_data.get('alert')
        if alert and alert.dns_twisted:
            twisted = alert.dns_twisted
            subdomain = twisted.domain_name

            extracted = tldextract.extract(subdomain)
            domain_part = extracted.domain
            suffix_part = extracted.suffix

            if domain_part and suffix_part:
                parent_domain = f"{domain_part}.{suffix_part}"

                reasons = []
                if twisted.keyword_monitored:
                    reasons.append(f"contains the corporate keyword '{twisted.keyword_monitored.name}'")
                if twisted.dns_monitored:
                    reasons.append(f"looks like {twisted.dns_monitored.domain_name}")
                if twisted.fuzzer:
                    reasons.append(f"generated by the '{twisted.fuzzer}' permutation")
                message = "Suspicious domain" + (": " + ", ".join(reasons) if reasons else "")

                subdomain_observable = _obs("domain", subdomain, message, ioc=True)
                if twisted.fuzzer:
                    subdomain_observable["tags"].append(f"fuzzer:{twisted.fuzzer}")
                if twisted.dns_monitored:
                    subdomain_observable["tags"].append(f"corporate_dns:{twisted.dns_monitored.domain_name}")
                if twisted.keyword_monitored:
                    subdomain_observable["tags"].append(f"corporate_keyword:{twisted.keyword_monitored.name}")

                subdomain_observable["tags"].append(f"parent_domain:{parent_domain}")
                subdomain_observable["tags"].append(f"subdomain:{subdomain}")

                observables.append(subdomain_observable)

                if subdomain != parent_domain:
                    observables.append(_obs("domain", parent_domain, f"Registrable domain of {subdomain}",
                                            tags=[f"parent_domain:{parent_domain}", "domain_type:parent"]))

    elif app_name == 'dns_finder_dangling':
        alert = context_data.get('alert')
        if alert and alert.dns_twisted:
            dns_twisted = alert.dns_twisted
            message = "Corporate subdomain whose CNAME points to a resource that may be claimed"
            if dns_twisted.cname_target:
                message += f" ({dns_twisted.cname_target})"
            observable = _obs("domain", dns_twisted.domain_name, message)
            if dns_twisted.provider:
                observable["tags"].append(f"provider:{dns_twisted.provider}")
            if dns_twisted.cname_target:
                observable["tags"].append(f"cname_target:{dns_twisted.cname_target}")
            if dns_twisted.dns_monitored:
                observable["tags"].append(f"corporate_dns:{dns_twisted.dns_monitored.domain_name}")
            observables.append(observable)

    elif app_name == 'cyber_watch':
        notification_type = context_data.get('notification_type', '')
        if notification_type in ('new_cve', 'cve_hit'):
            cve_id = context_data.get('cve_id', '')
            severity = context_data.get('severity', 'N/A')
            if cve_id:
                observables.append(_obs("other", cve_id, f"{cve_id} ({severity})", tags=["cve", f"severity:{severity}"]))
        elif notification_type in ('new_victim', 'victim_hit'):
            victim_name = context_data.get('victim_name', '')
            group_name = _clean(context_data.get('group_name', ''))
            if victim_name:
                message = "Ransomware victim" + (f" claimed by {group_name}" if group_name else "")
                observables.append(_obs("other", victim_name, message,
                                        tags=["ransomware-victim"] + ([f"group:{group_name}"] if group_name else [])))

    observables = [observable for observable in observables if observable['data'] is not None and observable['data'] != 'None']

    return observables


def remove_html_tags(text):
    """
    Remove HTML tags from a string.
    """
    clean = re.compile('<.*?>')
    return re.sub(clean, '', text)


def _notification_label(app_name, context_data):
    """Names the alert a notification is about, for the line of the log that reports how it went."""
    alert = context_data.get('alert')
    if app_name == 'data_leak':
        return f"data_leak #{alert.pk} ({alert.keyword})"
    if app_name in ('dns_finder', 'dns_finder_dangling'):
        return f"{app_name} #{alert.pk} ({alert.dns_twisted.domain_name})"
    if app_name == 'website_monitoring':
        site, change = context_data.get('site'), (context_data.get('alert_data') or {}).get('id')
        return f"website_monitoring {'#%s ' % change if change else ''}({site.domain_name})"
    if app_name == 'cyber_watch':
        subject = context_data.get('cve_id') or context_data.get('victim_name') or ''
        return f"cyber_watch {context_data.get('notification_type', '')} ({subject})"
    if app_name == 'threats_watcher':
        return f"threats_watcher {context_data.get('notification_type', 'regular')}"
    if app_name == 'data_leak_group':
        return f"data_leak_group ({context_data.get('keyword')}, {context_data.get('alerts_number')} alerts)"
    if app_name == 'dns_finder_group':
        return f"dns_finder_group ({getattr(context_data.get('dns_monitored'), 'domain_name', '')})"
    return app_name


def citadel_content(type_id, ctx):
    """
    A Citadel (Matrix) message: the HTML of the notification, and the same text without markup in `body`, which is what
    a client or a notification preview shows when it does not display HTML.
    """
    html = render_message(type_id, 'citadel', ctx).replace('\n', '<br>')
    text = (html.replace('</td><td>', ': ').replace('</tr>', '\n').replace('</h4>', '\n')
            .replace('</p>', '\n').replace('<br>', '\n'))
    return {
        "msgtype": "m.text",
        "format": "org.matrix.custom.html",
        "body": remove_html_tags(unescape(text)).strip(),
        "formatted_body": html,
    }


def _send_channel(type_id, channel, app_name, send):
    """
    Run `send` when the instance has `channel` switched on for this notification (Connectors > Notifications).
    A failing channel is logged and does not stop the next one.
    """
    try:
        # The gate is inside the try: before the notification tables are migrated the query fails, and that must not
        # reach the scheduler job that called us.
        if not is_enabled(type_id, channel):
            report_channel(channel, 'off')
            return
        run_channel(channel, send)
    except Exception as exc:
        logger.error(f"Could not read the setting or send the {type_id} notification on {channel} for {app_name}: {exc}")


@reported_notification(_notification_label, logger)
def send_app_specific_notifications(app_name, context_data, subscribers):
    """
    Send notifications based on app type (Slack, Citadel, TheHive, Email).
    Collect observables, format content, and send to respective channels.

    Slack, Citadel and TheHive go out when the instance has them switched on for this notification. The email goes
    out when its switch is on, to the `subscribers` who ticked E-mail.
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

    ntype = find_type(template_key)
    if ntype is None:
        return

    # A certstream alert has its own email layout, and its own email switch.
    email_type = template_key
    object_link = watcher_object_url(app_name, context_data)

    observables = collect_observables(app_name, context_data)

    _thehive_cfg = get_thehive_config()
    thehive_url = _thehive_cfg['url']
    api_key = _thehive_cfg['key']

    thehive_severity = ntype.thehive_meta.get('severity', 1)

    try:
        common_data = {}

        if app_name == 'threats_watcher':
            notification_type = context_data.get('notification_type', 'regular')

            if notification_type == 'weeklysummary':
                summary_text = context_data.get('summary_text', '')
                if not summary_text:
                    return
                email_body = get_threats_watcher_weeklysummary_template(summary_text)
                common_data = {
                    'summary_text': summary_text,
                    'details_url': settings.WATCHER_URL + ntype.url_suffix,
                    'app_name': 'threats_watcher'
                }

            elif notification_type == 'breakingnews':
                keyword = context_data.get('keyword', '')
                occurrences = context_data.get('occurrences', 0)
                summary_text = context_data.get('summary_text', '')
                if not keyword or not summary_text:
                    return
                email_body = get_threats_watcher_breakingnews_template(summary_text)
                common_data = {
                    'keyword': keyword,
                    'occurrences': occurrences,
                    'summary_text': summary_text,
                    'details_url': settings.WATCHER_URL + ntype.url_suffix,
                    'app_name': 'threats_watcher'
                }

            else:
                words_list = '\n'.join([remove_html_tags(unescape(word)) for word in context_data.get('email_words', [])])
                if not words_list:
                    return
                email_words = context_data.get('email_words', [])
                email_body = get_threats_watcher_template(settings.WORDS_OCCURRENCE, email_words)
                common_data = {
                    'words_list': words_list,
                    'details_url': settings.WATCHER_URL + ntype.url_suffix,
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
                'new_mx_records': _join_records(alert_data.get('new_MX_records')),
                'old_mx_records': _join_records(alert_data.get('old_MX_records')),
                'new_mail_A_record_ip': alert_data.get('new_mail_A_record_ip', None),
                'old_mail_A_record_ip': alert_data.get('old_mail_A_record_ip', None),
                'details_url': settings.WATCHER_URL + ntype.url_suffix,
                'app_name': 'website_monitoring'
            }

            website_url = site.domain_name
            alert_id = alert_data.get('id', '-')
            email_body = get_site_monitoring_template(website_url, alert_id, alert_data, link_url=object_link)


        elif app_name == 'data_leak':
            alert = context_data.get('alert')

            if not alert:
                return

            common_data = {
                'alert_pk': alert.pk,
                'keyword_name': alert.keyword.name,
                'url': alert.url,
                'content': alert.content[:200],
                'details_url': settings.WATCHER_URL + ntype.url_suffix,
                'app_name': 'data_leak'
            }
            email_body = get_data_leak_template(alert, link_url=object_link)


        elif app_name == 'dns_finder':
            alert = context_data.get('alert')

            if not alert or not alert.dns_twisted or not alert.dns_twisted.domain_name:
                logger.warning("No valid alert data found or DNS Twisted information missing.")
                return

            subdomain = alert.dns_twisted.domain_name
            dns_domain_name_sanitized = (
                getattr(alert.dns_twisted, 'dns_domain_name_sanitized', None) or
                alert.dns_twisted.domain_name.replace('.', '[.]')
            )

            # Its own closure: a failure here (or a domain without a valid suffix) must not cancel the other channels.
            def send_dns_finder_thehive():
                current_time = timezone.now()
                extracted = tldextract.extract(subdomain)
                domain_part = extracted.domain
                suffix_part = extracted.suffix

                if not suffix_part:
                    logger.warning(f"No valid suffix found for domain: {subdomain}")
                    return

                parent_domain = f"{domain_part}.{suffix_part}"

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
                        ticket_id, thehive_url, api_key, "alert"
                    )
                    if isinstance(alert_item, list):
                        alert_item = alert_item[0] if alert_item else None
                    case_type, case_item = search_thehive_for_ticket_id(
                        ticket_id, thehive_url, api_key, "case"
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
                        parent_domain, thehive_url, api_key
                    )
                    if item_obj:
                        existing_item = item_obj
                        item_type = item_type

                # Step 3: If still not found, use generated ticket_id
                if not ticket_id:
                    ticket_id = generate_ref()

                current_time_str = current_time.strftime("%H:%M:%S")
                current_date_str = current_time.strftime("%Y-%m-%d")

                twisted = alert.dns_twisted
                comment_lines = [
                    f"New suspicious domain: **{subdomain.replace('.', '[.]')}** "
                    f"(parent domain {parent_domain.replace('.', '[.]')}), {current_date_str} {current_time_str}."
                ]
                if twisted.keyword_monitored:
                    comment_lines.append(f"- Matches the corporate keyword: {twisted.keyword_monitored.name}")
                if twisted.dns_monitored:
                    comment_lines.append(f"- Matches the corporate domain: {_defang(twisted.dns_monitored.domain_name)}")
                if twisted.fuzzer:
                    comment_lines.append(f"- Detection method: {twisted.fuzzer}")
                comment = "\n".join(comment_lines)

                # Update or create
                if existing_item:
                    logger.info(f"Updating existing {item_type} for parent domain {parent_domain}")
                    update_existing_alert_case(
                        item_type=item_type,
                        existing_item=existing_item,
                        observables=observables_dns,
                        comment=comment,
                        thehive_url=thehive_url,
                        api_key=api_key,
                        parent_domain=parent_domain,
                        subdomain=subdomain
                    )
                else:
                    logger.info(f"Creating new alert for parent domain {parent_domain}")
                    meta = thehive_meta('dns_finder')
                    thehive_ctx = {
                        'subdomain': subdomain,
                        'subdomain_sanitized': subdomain.replace('.', '[.]'),
                        'parent_domain': parent_domain,
                        'parent_domain_sanitized': parent_domain.replace('.', '[.]'),
                        'keyword': alert.dns_twisted.keyword_monitored.name if alert.dns_twisted.keyword_monitored else None,
                        'corporate_dns_sanitized': _defang(getattr(alert.dns_twisted.dns_monitored, 'domain_name', None)),
                        'fuzzer': alert.dns_twisted.fuzzer or None,
                        'details_url': settings.WATCHER_URL + ntype.url_suffix,
                        'object_url': watcher_object_url('dns_finder', context_data) or settings.WATCHER_URL + ntype.url_suffix,
                    }
                    create_new_alert(
                        ticket_id=ticket_id,
                        title=render_thehive_title('dns_finder', thehive_ctx),
                        description=render_message('dns_finder', 'thehive', thehive_ctx),
                        severity=meta['severity'],
                        tlp=meta['tlp'],
                        pap=meta['pap'],
                        tags=thehive_alert_tags('dns_finder', context_data, _thehive_cfg['tags']),
                        app_name='dns_finder',
                        observables=observables_dns,
                        customFields={
                            _thehive_cfg['custom_field']: {"string": ticket_id},
                            "email-sender": {"string": _thehive_cfg['email_sender']},
                        },
                        # The description says it all; the comment is for the follow-ups of an existing alert
                        comment=None,
                        external_link=thehive_ctx['object_url'],
                        thehive_url=thehive_url,
                        api_key=api_key,
                        parent_domain=parent_domain,
                        subdomain=subdomain
                    )

            _send_channel('dns_finder', 'thehive', app_name, send_dns_finder_thehive)

            source = context_data.get('source')
            if source in ('certstream_keyword', 'print_callback'):
                email_body = get_dns_finder_cert_transparency_template(alert, link_url=object_link)
                email_type = 'dns_finder_cert_transparency'
            elif source in ('dnstwist', 'check_dnstwist'):
                email_body = get_dns_finder_template(alert, link_url=object_link)
            else:
                logger.warning(f"Unknown source '{source}' for alert.")
                email_body = "Alert with no specific model defined."

            common_data = {
                'alert': alert,
                'dns_domain_name_sanitized': dns_domain_name_sanitized,
                'corporate_dns_sanitized': _defang(getattr(alert.dns_twisted.dns_monitored, 'domain_name', None)),
                'details_url': settings.WATCHER_URL + ntype.url_suffix,
                'app_name': 'dns_finder'
            }

        elif app_name == 'cyber_watch':
            notification_type = context_data.get('notification_type', '')
            details_url = settings.WATCHER_URL + ntype.url_suffix
            email_body = get_cyber_watch_template(context_data, link_url=object_link)

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
                    **_cve_title_parts(severity, cvss_score),
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
                    **_cve_title_parts(severity),
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

        elif app_name == 'dns_finder_dangling':
            alert = context_data.get('alert')

            if not alert or not alert.dns_twisted or not alert.dns_twisted.domain_name:
                logger.warning("No valid alert data found or DnsTwisted information missing.")
                return

            dns_twisted = alert.dns_twisted
            takeover_status = 'Suspected' if alert.status == 'suspected' else 'Confirmed'
            common_data = {
                'alert': alert,
                'subdomain': dns_twisted.domain_name,
                'subdomain_sanitized': _defang(dns_twisted.domain_name),
                'parent_domain': dns_twisted.dns_monitored.domain_name if dns_twisted.dns_monitored else 'N/A',
                'parent_domain_sanitized': _defang(getattr(dns_twisted.dns_monitored, 'domain_name', None)),
                'cname_target': dns_twisted.cname_target or 'N/A',
                'cname_target_sanitized': _defang(dns_twisted.cname_target),
                'provider': dns_twisted.provider or 'Unknown',
                'takeover_status': takeover_status,
                'takeover_status_detail': DANGLING_STATUS_DETAILS[takeover_status],
                'details_url': settings.WATCHER_URL + ntype.url_suffix,
                'app_name': 'dns_finder_dangling'
            }
            # An unverified (suspected) takeover is filed below a proven one
            if takeover_status == 'Suspected':
                thehive_severity = 1
            email_body = get_dns_finder_dangling_template(alert, link_url=object_link)

    except Exception as e:
        logger.error(f"Error sending notifications for {app_name}: {str(e)}")
        return

    common_data['object_url'] = object_link or common_data.get('details_url')

    _send_channel(template_key, 'slack', app_name, lambda: send_slack_message(
        render_message(template_key, 'slack', common_data), get_slack_config()['channel'], app_name))

    _send_channel(template_key, 'citadel', app_name, lambda: send_citadel_message(
        content=citadel_content(template_key, common_data),
        room_id=get_citadel_config()['room_id'],
        app_name=common_data.get('app_name')
    ))

    def send_thehive():
        formatted_title = render_thehive_title(template_key, common_data)
        th_tags = thehive_alert_tags(app_name, context_data, _thehive_cfg['tags'])
        th_severity = thehive_severity_for(app_name, context_data, thehive_severity)
        th_comment = thehive_comment(app_name, context_data)
        th_link = common_data.get('object_url') or common_data.get('details_url')
        description = render_message(template_key, 'thehive', common_data)
        domain_name = common_data.get('domain_name')
        if domain_name:
            site = Site.objects.filter(domain_name=domain_name).first()
            if site is None:
                logger.error(f"Site with domain_name {domain_name} not found.")
                return
            send_thehive_alert(
                title=formatted_title,
                description=description,
                severity=th_severity,
                tlp=ntype.thehive_meta['tlp'],
                pap=ntype.thehive_meta['pap'],
                tags=th_tags,
                customFields=None,
                app_name=app_name,
                domain_name=site.domain_name,
                observables=observables,
                comment=th_comment,
                external_link=th_link
            )
        else:
            send_thehive_alert(
                title=formatted_title,
                description=description,
                severity=th_severity,
                tlp=ntype.thehive_meta['tlp'],
                pap=ntype.thehive_meta['pap'],
                tags=th_tags,
                app_name=app_name,
                domain_name=None,
                observables=observables,
                customFields=None,
                thehive_url=thehive_url,
                api_key=api_key,
                external_link=th_link
            )

    # DNS Finder opens its own TheHive alert above (with the search for the parent domain).
    if 'thehive' in ntype.channels and app_name != 'dns_finder':
        _send_channel(template_key, 'thehive', app_name, send_thehive)

    def send_email():
        email_list = [subscriber.user_rec.email for subscriber in subscribers.filter(email=True)]
        if not email_list:
            note_channel('no recipients')
            return
        send_email_notifications(email_subject(email_type, common_data), email_body, email_list, app_name)

    _send_channel(email_type, 'email', app_name, send_email)


@reported_notification(_notification_label, logger)
def send_app_specific_notifications_group(app_name, context_data, subscribers):
    """
    Send group notifications based on app type (Slack, Citadel, Email), when the instance has them switched on.
    """
    ntype = find_type(app_name)
    if ntype is None:
        return

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
                'details_url': settings.WATCHER_URL + ntype.url_suffix,
                'app_name': 'data_leak_group'
            }

        elif app_name == 'dns_finder_group':
            dns_monitored = context_data.get('dns_monitored')
            alerts_number = context_data.get('alerts_number')

            if not dns_monitored or not alerts_number or not dns_monitored.domain_name:
                return

            common_data = {
                'alerts_number': alerts_number,
                'dns_domain_name_sanitized_group': dns_monitored.domain_name.replace('.', '[.]'),
                'details_url': settings.WATCHER_URL + ntype.url_suffix,
                'app_name': 'dns_finder_group',
            }

    except Exception as e:
        logger.error(f"Error sending group notifications for {app_name}: {str(e)}")
        return

    _send_channel(app_name, 'slack', app_name, lambda: send_slack_message(
        render_message(app_name, 'slack', common_data), get_slack_config()['channel'], app_name))

    _send_channel(app_name, 'citadel', app_name, lambda: send_citadel_message(
        content=citadel_content(app_name, common_data),
        room_id=get_citadel_config()['room_id'],
        app_name=common_data.get('app_name')
    ))

    def send_email():
        email_list = [subscriber.user_rec.email for subscriber in subscribers.filter(email=True)]
        if not email_list:
            note_channel('no recipients')
            return
        if app_name == 'data_leak_group':
            email_body = get_data_leak_group_template(common_data['keyword'], common_data['alerts_number'])
        else:
            email_body = get_dns_finder_group_template(context_data['dns_monitored'], common_data['alerts_number'])
        send_email_notifications(email_subject(app_name, common_data), email_body, email_list, app_name)

    _send_channel(app_name, 'email', app_name, send_email)


def send_only_thehive_notifications(app_name, context_data, subscribers):
    """
    Open one TheHive alert for an alert of a group notification (the group message itself goes out on the other
    channels). Only when the instance has TheHive switched on for this notification; `subscribers` is not used, it is
    kept so the callers do not change.
    """
    ntype = find_type(app_name)
    if ntype is None or 'thehive' not in ntype.channels:
        return
    try:
        if not is_enabled(app_name, 'thehive'):
            return
    except Exception as exc:
        logger.error(f"Could not read the TheHive setting of the {app_name} notification: {exc}")
        return

    observables = collect_observables(app_name, context_data)
    _thehive_cfg = get_thehive_config()

    try:
        alert = context_data.get('alert')

        if app_name == 'data_leak':
            if not alert:
                return
            common_data = {
                'alert_pk': alert.pk,
                'keyword_name': alert.keyword.name,
                'url': alert.url,
                'content': alert.content[:200],
                'details_url': settings.WATCHER_URL,
                'object_url': watcher_object_url('data_leak', context_data) or settings.WATCHER_URL,
                'app_name': 'data_leak'
            }
            title = render_thehive_title(app_name, common_data)
            description = render_message(app_name, 'thehive', common_data)

        elif app_name == 'dns_finder':
            if not alert or not alert.dns_twisted or not alert.dns_twisted.domain_name:
                return
            common_data = {
                'alert': alert,
                'dns_domain_name_sanitized': alert.dns_twisted.domain_name.replace('.', '[.]'),
                'corporate_dns_sanitized': _defang(getattr(alert.dns_twisted.dns_monitored, 'domain_name', None)),
                'details_url': settings.WATCHER_URL,
                'object_url': watcher_object_url('dns_finder', context_data) or settings.WATCHER_URL,
                'app_name': 'dns_finder'
            }
            title, description = render_per_alert(app_name, common_data)

        else:
            return

        meta = thehive_meta(app_name)
        send_thehive_alert(
            title=title,
            description=description,
            severity=meta['severity'],
            tlp=meta['tlp'],
            pap=meta['pap'],
            tags=thehive_alert_tags(app_name, context_data, _thehive_cfg['tags']),
            app_name=app_name,
            domain_name=None,
            observables=observables,
            customFields=None,
            thehive_url=_thehive_cfg['url'],
            api_key=_thehive_cfg['key'],
            external_link=common_data.get('object_url') or common_data.get('details_url')
        )

    except Exception as e:
        logger.error(f"Error sending TheHive notifications for {app_name}: {str(e)}")


@logged_job("RDAP/WHOIS lookup for legitimate domains", logger)
def update_legitimate_domains_rdap_data():
    """
    Update RDAP/WHOIS data for legitimate domains.
    """
    close_old_connections()
    logger.info("CRON TASK: RDAP/WHOIS Lookup for Legitimate Domains")

    domains = LegitimateDomain.objects.all()

    for domain in domains:
        try:
            job_count('domains')
            from .utils.rdap import RDAPDiscovery
            rdap = RDAPDiscovery(domain.domain_name)
            method = "RDAP"

            if not rdap.fetch_rdap_data():
                from .utils.whois import WhoisDiscovery
                whois = WhoisDiscovery(domain.domain_name)
                if not whois.fetch_whois_data():
                    # An unregistered domain has no record: counted in the summary of the job
                    job_count('without_data')
                    logger.debug(f"No RDAP/WHOIS data found for {domain.domain_name}")
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
                job_count('updated')
                logger.info(f"Successfully updated {domain.domain_name}: {', '.join(updated_fields)}")

        except Exception as e:
            job_count('errors')
            logger.error(f"Error processing {domain.domain_name}: {str(e)}")


@logged_job("RDAP/WHOIS lookup for monitored sites", logger)
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
            job_count('sites')
            rdap = RDAPDiscovery(site.domain_name)
            method = "RDAP"

            if not rdap.fetch_rdap_data():
                from .utils.whois import WhoisDiscovery
                whois = WhoisDiscovery(site.domain_name)
                if not whois.fetch_whois_data():
                    job_count('without_data')
                    logger.debug(f"No RDAP/WHOIS data found for {site.domain_name}")
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
                job_count('updated')
                logger.info(f"Successfully updated {method} data for {site.domain_name}: {', '.join(update_info)}")
            else:
                logger.debug(f"No updates needed for {site.domain_name}")

        except Exception as e:
            job_count('errors')
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


# Screenshots of web pages, for every module: the client of the `screenshotter` container (a headless browser on its own
# network that refuses everything that is not a public http(s) address) and the keeping of what it answers.
# A screenshot bigger than this is not kept: the service already limits the height of the page it captures
SCREENSHOT_MAX_BYTES = 3 * 1024 * 1024


def screenshots_configured():
    return bool(getattr(settings, 'SCREENSHOT_SERVICE_URL', ''))


def screenshots_kept_per_object():
    return max(1, int(getattr(settings, 'SCREENSHOT_KEEP', 10)))


def capture_page(url):
    """The JPEG of a page, or None when the service is off, refuses the address or fails (said in the log)."""
    if not screenshots_configured():
        return None
    try:
        # The service is on a private network: no proxy between it and Watcher
        response = requests.post(settings.SCREENSHOT_SERVICE_URL.rstrip('/') + '/screenshot', json={'url': url},
                                 timeout=settings.SCREENSHOT_TIMEOUT, proxies={'http': None, 'https': None})
    except requests.exceptions.RequestException as exc:
        logger.warning(f"Screenshot of {url}: the service did not answer ({type(exc).__name__})")
        return None
    if response.status_code != 200:
        logger.warning(f"Screenshot of {url}: the service answered {response.status_code} ({response.text[:60]})")
        return None
    if len(response.content) > SCREENSHOT_MAX_BYTES:
        logger.warning(f"Screenshot of {url}: {len(response.content) // 1024} KB, too big to keep")
        return None
    return response.content


def take_screenshot(target, target_id, url, user=None):
    """
    Take a screenshot of a page for an object and keep it; only the newest ones of an object are kept. Every capture is a
    visit from Watcher: it is logged with who asked for it.

    :param target: kind of object, `app.model` (e.g. `data_leak.alert`).
    :return: the Screenshot, or None when it could not be taken.
    """
    image = capture_page(url)
    if image is None:
        return None
    user = user if getattr(user, 'pk', None) else None
    shot = Screenshot.objects.create(target=target, target_id=target_id, url=url[:1000], image=image, size=len(image),
                                     taken_by=user)
    old = list(Screenshot.objects.filter(target=target, target_id=target_id).values_list('id', flat=True)[screenshots_kept_per_object():])
    if old:
        Screenshot.objects.filter(id__in=old).delete()
    logger.info(f"Screenshot of {url} ({target} #{target_id}) taken by {user.get_username() if user else '-'}")
    return shot


def forget_screenshots(target, target_id):
    """Delete the screenshots of an object that goes away."""
    Screenshot.objects.filter(target=target, target_id=target_id).delete()
