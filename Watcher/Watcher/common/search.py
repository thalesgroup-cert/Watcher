"""
Global search: one query, every module. A provider describes one kind of object (its module, who may see it and how to
find it); `run_search` asks the providers the user may use and groups what they return by module. Each provider runs
on its own: a slow or broken one costs its module's group, never the whole answer.
"""
import logging
from dataclasses import dataclass
from typing import Callable

logger = logging.getLogger('watcher.common')

MIN_LENGTH = 2
MAX_LENGTH = 100
LIMIT = 5   # results shown per module

# Who may search a provider: everyone ('public'), any signed-in user ('user'), superusers only, or a permission codename.
PUBLIC, USER, SUPERUSER = 'public', 'user', 'superuser'


@dataclass(frozen=True)
class Provider:
    module: str
    label: str
    type: str
    access: str
    fetch: Callable   # (query, limit, user) -> list of hit()


def hit(type_, object_id, title, subtitle, to):
    return {'id': object_id, 'type': type_, 'title': title, 'subtitle': subtitle or '', 'to': to}


def allowed(user, access):
    if access == PUBLIC:
        return True
    if not user.is_authenticated:
        return False
    if access == USER:
        return True
    if access == SUPERUSER:
        return user.is_superuser
    return user.has_perm(access)


def _short(text, size=110):
    text = ' '.join((text or '').split())
    return text if len(text) <= size else text[:size - 1] + '…'


# --- Threats Watcher (public, like the page) ---------------------------------------------------------------------

def _trending_words(q, limit, user):
    from threats_watcher.models import TrendyWord
    rows = TrendyWord.objects.filter(name__icontains=q).order_by('-occurrences', '-id')[:limit]
    return [hit('word', w.id, w.name, f'{w.occurrences} mentions', f'/threats_watcher?word={w.id}') for w in rows]


def _monitored_keywords(q, limit, user):
    from threats_watcher.models import MonitoredKeyword
    rows = MonitoredKeyword.objects.filter(name__icontains=q).order_by('-occurrences', 'name')[:limit]
    return [hit('keyword', k.id, k.name, f'Monitored keyword · {k.get_level_display()}',
                f'/threats_watcher?tab=keywords&keyword={k.id}') for k in rows]


# --- Legitimate domains (public; ticket ids are internal) --------------------------------------------------------

def _legitimate_domains(q, limit, user):
    from django.db.models import Q
    from common.models import LegitimateDomain
    condition = Q(domain_name__icontains=q)
    if user.is_authenticated:
        condition |= Q(ticket_id__icontains=q)
    rows = LegitimateDomain.objects.filter(condition).order_by('domain_name')[:limit]
    return [hit('domain', d.id, d.domain_name, f'Expires {d.expiry}' if d.expiry else '', f'/legitimate_domains?domain={d.id}')
            for d in rows]


# --- Cyber Watch (signed-in users, like the page; rules need their own permission, like the tab) -----------------

def _cves(q, limit, user):
    from django.db.models import Q
    from cyber_watch.models import CVEAlert
    rows = CVEAlert.objects.filter(Q(cve_id__icontains=q) | Q(description__icontains=q)).order_by('-published', '-id')[:limit]
    return [hit('cve', c.id, c.cve_id, _short(c.description), f'/cyber_watch?tab=cves&cve={c.id}') for c in rows]


def _victims(q, limit, user):
    from django.db.models import Q
    from cyber_watch.models import RansomwareVictim
    rows = (RansomwareVictim.objects.select_related('group')
            .filter(Q(victim_name__icontains=q) | Q(group__name__icontains=q)).order_by('-attacked_at', '-id')[:limit])
    return [hit('victim', v.id, v.victim_name, ' · '.join(p for p in (v.group.name, v.country) if p),
                f'/cyber_watch?tab=ransomware&victim={v.id}') for v in rows]


def _watch_rules(q, limit, user):
    from django.db.models import Q
    from cyber_watch.models import WatchRule
    rows = WatchRule.objects.filter(Q(name__icontains=q) | Q(keywords__icontains=q)).order_by('name')[:limit]
    return [hit('rule', r.id, r.name, ', '.join(str(k) for k in (r.keywords or [])[:5]), f'/cyber_watch?tab=rules&rule={r.id}')
            for r in rows]


# --- Data Leak ----------------------------------------------------------------------------------------------------

def _leak_alerts(q, limit, user):
    from django.db.models import Q
    from data_leak.models import Alert
    # The captured content is not searched: it is long text, and the url and pattern are what people look for.
    rows = (Alert.objects.select_related('keyword').filter(Q(url__icontains=q) | Q(keyword__name__icontains=q))
            .order_by('-created_at', '-id')[:limit])
    return [hit('alert', a.id, a.url, f'Pattern: {a.keyword.name}', f'/data_leak?alert={a.id}') for a in rows]


def _leak_patterns(q, limit, user):
    from data_leak.models import Keyword
    rows = Keyword.objects.filter(name__icontains=q).order_by('name')[:limit]
    return [hit('pattern', k.id, k.name, 'Regular expression' if k.is_regex else 'Keyword', f'/data_leak?tab=patterns&pattern={k.id}')
            for k in rows]


# --- DNS Threats --------------------------------------------------------------------------------------------------
# "Contains" inside the ~425 000 detected domains reads the whole table (measured: 1.5 to 1.7 s per search on the local
# data); "starts with" uses the domain name index. The monitored domains and keywords above stay "contains": small tables.
THREAT_MATCH = 'istartswith'


def _dns_domains(q, limit, user):
    from dns_finder.models import DnsMonitored
    rows = DnsMonitored.objects.filter(domain_name__icontains=q).order_by('domain_name')[:limit]
    return [hit('domain', d.id, d.domain_name, 'Monitored domain', f'/dns_finder?tab=domains&did={d.id}') for d in rows]


def _dns_keywords(q, limit, user):
    from dns_finder.models import KeywordMonitored
    rows = KeywordMonitored.objects.filter(name__icontains=q).order_by('name')[:limit]
    return [hit('keyword', k.id, k.name, 'Monitored keyword', f'/dns_finder?tab=keywords&kid={k.id}') for k in rows]


def _dns_threats(q, limit, user):
    from dns_finder.models import Alert
    rows = (Alert.objects.select_related('dns_twisted').filter(**{f'dns_twisted__domain_name__{THREAT_MATCH}': q})
            .order_by('-created_at', '-id')[:limit])
    return [hit('threat', a.id, a.dns_twisted.domain_name, f'{a.get_status_display()} · {a.get_source_display()}',
                f'/dns_finder?threat={a.id}') for a in rows]


# --- Website Monitoring -------------------------------------------------------------------------------------------

def _sites(q, limit, user):
    from django.db.models import Q
    from site_monitoring.models import Site
    rows = Site.objects.filter(Q(domain_name__icontains=q) | Q(ticket_id__icontains=q)).order_by('domain_name')[:limit]
    return [hit('site', s.id, s.domain_name, s.ticket_id or s.registrar, f'/website_monitoring?site={s.id}') for s in rows]


# --- Connectors (superusers; the page has no object in its URL, so the link opens the list) -----------------------

def _connectors(q, limit, user):
    from connectors.core import get_all_connectors
    needle = q.lower()
    found = [c for c in get_all_connectors() if needle in str(c.get('name', '')).lower() or needle in str(c.get('id', '')).lower()]
    return [hit('connector', c['id'], c.get('name', c['id']), _short(c.get('description', '')), '/connectors') for c in found[:limit]]


# In the order of the menu.
PROVIDERS = [
    Provider('threats_watcher', 'Threats Watcher', 'word', PUBLIC, _trending_words),
    Provider('threats_watcher', 'Threats Watcher', 'keyword', PUBLIC, _monitored_keywords),
    Provider('cyber_watch', 'Cyber Watch', 'cve', USER, _cves),
    Provider('cyber_watch', 'Cyber Watch', 'victim', USER, _victims),
    Provider('cyber_watch', 'Cyber Watch', 'rule', 'cyber_watch.view_watchrule', _watch_rules),
    Provider('data_leak', 'Data Leak', 'alert', USER, _leak_alerts),
    Provider('data_leak', 'Data Leak', 'pattern', USER, _leak_patterns),
    Provider('dns_finder', 'DNS Threats', 'domain', USER, _dns_domains),
    Provider('dns_finder', 'DNS Threats', 'keyword', USER, _dns_keywords),
    Provider('dns_finder', 'DNS Threats', 'threat', USER, _dns_threats),
    Provider('website_monitoring', 'Website Monitoring', 'site', USER, _sites),
    Provider('legitimate_domains', 'Legitimate Domains', 'domain', PUBLIC, _legitimate_domains),
    Provider('connectors', 'Connectors', 'connector', SUPERUSER, _connectors),
]


def _merge(lists, limit):
    """Take turns between the providers of a module so the first one cannot fill the whole group."""
    merged, rank = [], 0
    while len(merged) < limit and any(rank < len(rows) for rows in lists):
        merged.extend(rows[rank] for rows in lists if rank < len(rows))
        rank += 1
    return merged[:limit]


def run_search(user, query, limit=LIMIT):
    query = (query or '').strip()[:MAX_LENGTH]
    if len(query) < MIN_LENGTH:
        return {'query': query, 'groups': []}

    modules = {}   # keeps the order of PROVIDERS
    for provider in PROVIDERS:
        if allowed(user, provider.access):
            modules.setdefault(provider.module, []).append(provider)

    groups = []
    for module, providers in modules.items():
        lists, failed = [], False
        for provider in providers:
            try:
                # One more than shown tells "there is more" without a COUNT over a large table.
                lists.append(provider.fetch(query, limit + 1, user))
            except Exception:
                logger.exception("Global search: provider '%s' failed", provider.type)
                failed = True
        results = _merge(lists, limit)
        if not results and not failed:
            continue
        groups.append({
            'module': module,
            'label': providers[0].label,
            'results': results,
            'more': sum(len(rows) for rows in lists) > len(results),
            'error': failed,
        })
    return {'query': query, 'groups': groups}
