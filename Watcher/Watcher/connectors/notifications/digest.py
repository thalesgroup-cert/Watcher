"""
One Slack or Citadel message for the many alerts of a single job run.

A job that finds a dozen suspicious domains used to post a dozen messages. From `NOTIFICATION_DIGEST_THRESHOLD` alerts of the
same notification in one run (0 turns this off), the chat gets one message that lists them, `MAX_LINES` at most. Below the
threshold the messages go out one by one, as before. TheHive and the e-mail are not grouped.
"""
from html import escape

from django.conf import settings

from .catalogue import get_type, stamp

MAX_LINES = 10


def _join(*parts):
    return ' '.join(str(p) for p in parts if p)


def _dot(ctx):
    return ctx.get('severity_dot') or ''


def _dns(ctx):
    detail = ' - '.join(str(p) for p in (ctx.get('keyword') or ctx.get('alert_keyword'), ctx.get('fuzzer')) if p)
    return _join(ctx.get('dns_domain_name_sanitized') or ctx.get('subdomain_sanitized'), f'({detail})' if detail else '')


def _site(ctx):
    return ' - '.join(str(p) for p in (ctx.get('domain_name_sanitized'), ctx.get('alert_type')) if p)


def _cve_hit(ctx):
    return _join(_dot(ctx) + str(ctx.get('cve_id') or ''), f"- rule {ctx['rule_name']}" if ctx.get('rule_name') else '')


def _victim_hit(ctx):
    group = f"({ctx['group_name']})" if ctx.get('group_name') else ''
    return _join(ctx.get('victim_name'), group, f"- rule {ctx['rule_name']}" if ctx.get('rule_name') else '')


def _new_cve(ctx):
    return _join(_dot(ctx) + str(ctx.get('cve_id') or ''), f"CVSS {ctx['cvss_score']}" if ctx.get('cvss_score') else '')


def _new_victim(ctx):
    return _join(ctx.get('victim_name'), f"({ctx['group_name']})" if ctx.get('group_name') else '')


# notification -> (headline with the number of alerts, what it is, the line of one alert)
DIGESTS = {
    'dns_finder': ('🚨 {n} suspicious domains', 'DNS Threats · this run', _dns),
    'website_monitoring': ('🔔 {n} changes on monitored websites', 'Website Monitoring · this run', _site),
    'cyber_watch_cve_hit': ('🎯 {n} CVEs matched your rules', 'Cyber Watch · CVE hits', _cve_hit),
    'cyber_watch_victim_hit': ('🎯 {n} ransomware victims matched your rules', 'Cyber Watch · victim hits', _victim_hit),
    'cyber_watch_new_cve': ('{n} new CVEs', 'Cyber Watch · new CVEs', _new_cve),
    'cyber_watch_new_victim': ('🏴‍☠️ {n} new ransomware victims', 'Cyber Watch · new ransomware victims', _new_victim),
}


# What the link at the end of a grouped message opens
LINK_LABELS = {
    'dns_finder': 'Open the alerts in Watcher',
    'website_monitoring': 'Open the websites in Watcher',
    'cyber_watch_cve_hit': 'Open the CVEs in Watcher',
    'cyber_watch_victim_hit': 'Open the victims in Watcher',
    'cyber_watch_new_cve': 'Open the CVEs in Watcher',
    'cyber_watch_new_victim': 'Open the victims in Watcher',
}


def threshold():
    return int(getattr(settings, 'NOTIFICATION_DIGEST_THRESHOLD', 4) or 0)


def is_digestable(type_id):
    return type_id in DIGESTS and threshold() > 0


def _lines(type_id, contexts):
    line = DIGESTS[type_id][2]
    lines = [line(c) for c in contexts[:MAX_LINES]]
    more = len(contexts) - MAX_LINES
    return lines, (f'… and {more} more' if more > 0 else '')


def _link(type_id):
    return settings.WATCHER_URL + get_type(type_id).url_suffix


def render_digest(type_id, channel, contexts):
    """The text of the grouped message for `channel` ('slack': Slack text, 'citadel': (HTML, plain text))."""
    headline, tag, _ = DIGESTS[type_id]
    headline = headline.format(n=len(contexts))
    tag = f'{tag} · {stamp()}'
    lines, more = _lines(type_id, contexts)
    link, label = _link(type_id), LINK_LABELS[type_id]
    if channel == 'slack':
        body = ''.join(f'• {line}\n' for line in lines) + (more + '\n' if more else '')
        return f'*{headline}*\n_{tag}_\n\n{body}\n<{link}|{label}>'
    html = (f'<h4>{escape(headline)}</h4><p><em>{escape(tag)}</em></p>' + ''.join(f'{escape(line)}<br>' for line in lines)
            + (f'{escape(more)}<br>' if more else '') + f"<br><p><a href='{link}'>{escape(label)}</a></p>")
    text = '\n'.join([headline, tag, *lines, *([more] if more else []), '', label])
    return html, text
