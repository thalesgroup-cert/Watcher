# coding=utf-8
"""
Normalization for the unified DNS Threats Monitored feed: Alert now covers
all three detection sources (dnstwist, certstream_keyword, subdomain_takeover)
directly via its `source` field, so this is a single query + a single
serializer, not a merge of two separate tables.
"""
from datetime import timedelta
from django.utils import timezone
from .models import Alert
from common.misp import get_misp_uuid
from common.models import MISPEventUuidLink


def _lookup_misp_uuid(domain_name, misp_uuid_map):
    """
    Resolve a domain's MISP event UUID list either from a pre-fetched batch
    map (see get_unified_threats) or, if none was supplied, by falling back
    to the original one-query-per-domain lookup.

    :param domain_name: Domain/subdomain name to resolve.
    :param misp_uuid_map: Optional dict[str, list] pre-fetched via a single
        batched MISPEventUuidLink query, keyed the same way get_misp_uuid
        keys its lookups (by domain_name).
    :rtype: list
    """
    if misp_uuid_map is not None:
        return misp_uuid_map.get(domain_name, [])
    return get_misp_uuid(domain_name)


def serialize_alert(alert, misp_uuid_map=None):
    """
    Normalize an Alert into the unified threats-feed item shape, for any of
    the three sources.

    :param alert: Alert instance, with dns_twisted/dns_monitored/keyword_monitored
        already select_related.
    :param misp_uuid_map: Optional dict[str, list] of pre-fetched MISP UUIDs
        keyed by domain_name, to avoid a per-row DB query (see
        get_unified_threats). Falls back to a live get_misp_uuid() call when
        omitted, preserving the original per-call behavior for other callers.
    :rtype: dict
    """
    dns_twisted = alert.dns_twisted
    corporate_dns = dns_twisted.dns_monitored.domain_name if dns_twisted.dns_monitored else None
    corporate_keyword = dns_twisted.keyword_monitored.name if dns_twisted.keyword_monitored else None

    return {
        'id': alert.id,
        'source': alert.source,
        'domain_name': dns_twisted.domain_name,
        'corporate_dns': corporate_dns,
        'corporate_keyword': corporate_keyword,
        'status': alert.status,
        'comments': alert.comments,
        'created_at': alert.created_at,
        'misp_event_uuid': _lookup_misp_uuid(dns_twisted.domain_name, misp_uuid_map),
        'technical_details': {
            'fuzzer': dns_twisted.fuzzer,
            'corporate_dns': corporate_dns,
            'corporate_keyword': corporate_keyword,
            'issuer': dns_twisted.issuer,
            'san_list': dns_twisted.san_list,
            'provider': dns_twisted.provider,
            'cname_target': dns_twisted.cname_target,
            'http_status_code': dns_twisted.http_status_code,
            'last_checked_at': dns_twisted.last_checked_at,
            'detected_at': alert.created_at,
            'dns_twisted_id': dns_twisted.id,
        },
    }


OPEN_STATUSES = (Alert.STATUS_PENDING, Alert.STATUS_SUSPECTED, Alert.STATUS_CONFIRMED)

# ?period= : threats detected since (0 = today)
PERIODS = {'today': 0, '7d': 7, '30d': 30}

# ?ordering= : feed field -> model field
ORDERINGS = {
    'created_at': 'created_at',
    'status': 'status',
    'source': 'source',
}


def threats_queryset(params):
    """
    Alerts of the DNS Threats Monitored feed, all three detection sources, filtered and ordered as requested.

    :param params: Query-param-like mapping (request.query_params), all values optional: source,
        corporate_dns, corporate_keyword, fuzzer, provider, cname_target, status (one of
        Alert.STATUS_CHOICES, or `open` for pending / suspected / confirmed), search (domain name),
        period (today, 7d, 30d), ordering (created_at, status, source; `-` for descending).
    """
    source = params.get('source') or None
    corporate_dns = params.get('corporate_dns') or None
    status_param = params.get('status') or None

    # No select_related here: joining the related tables makes MySQL sort the whole alert table before
    # paginating. serialize_threats loads the relations for the page only.
    alerts_qs = Alert.objects.all()

    ordering = params.get('ordering') or '-created_at'
    field = ORDERINGS.get(ordering.lstrip('-'), 'created_at')
    descending = ordering.startswith('-')
    # Ties are broken by date, so status / source orderings read the (field, created_at) indexes.
    keys = [field] + (['created_at'] if field != 'created_at' else []) + ['id']
    alerts_qs = alerts_qs.order_by(*(f'-{k}' if descending else k for k in keys))

    if source:
        alerts_qs = alerts_qs.filter(source=source)
    if corporate_dns:
        alerts_qs = alerts_qs.filter(dns_twisted__dns_monitored__domain_name=corporate_dns)
    if status_param == 'open':
        alerts_qs = alerts_qs.filter(status__in=OPEN_STATUSES)
    elif status_param:
        alerts_qs = alerts_qs.filter(status=status_param)
    search = (params.get('search') or '').strip()
    if search:
        alerts_qs = alerts_qs.filter(dns_twisted__domain_name__icontains=search)
    if params.get('period') in PERIODS:
        since = timezone.now().date() - timedelta(days=PERIODS[params['period']])
        alerts_qs = alerts_qs.filter(created_at__date__gte=since)
    fuzzer = params.get('fuzzer') or None
    if fuzzer:
        alerts_qs = alerts_qs.filter(dns_twisted__fuzzer=fuzzer)
    corporate_keyword = params.get('corporate_keyword') or None
    if corporate_keyword:
        alerts_qs = alerts_qs.filter(dns_twisted__keyword_monitored__name=corporate_keyword)
    provider = params.get('provider') or None
    if provider:
        alerts_qs = alerts_qs.filter(dns_twisted__provider=provider)
    cname_target = params.get('cname_target') or None
    if cname_target:
        alerts_qs = alerts_qs.filter(dns_twisted__cname_target=cname_target)
    return alerts_qs


def serialize_threats(alerts):
    """
    Serialize a page of alerts. MISP UUIDs, Website Monitoring and Legitimate Domains membership are
    fetched in one query each for the whole page instead of once per row (N+1).
    """
    from site_monitoring.models import Site
    from common.models import LegitimateDomain

    ids = [alert.pk for alert in alerts]
    by_id = Alert.objects.select_related(
        'dns_twisted', 'dns_twisted__dns_monitored', 'dns_twisted__keyword_monitored'
    ).in_bulk(ids)
    alerts = [by_id[pk] for pk in ids if pk in by_id]
    domain_names = {alert.dns_twisted.domain_name for alert in alerts}
    if not domain_names:
        return []
    misp_uuid_map = {
        domain_name: (misp_event_uuid or [])
        for domain_name, misp_event_uuid in MISPEventUuidLink.objects.filter(
            domain_name__in=domain_names
        ).values_list('domain_name', 'misp_event_uuid')
    }
    monitored = set(Site.objects.filter(domain_name__in=domain_names).values_list('domain_name', flat=True))
    legitimate = set(LegitimateDomain.objects.filter(domain_name__in=domain_names).values_list('domain_name', flat=True))
    items = []
    for alert in alerts:
        item = serialize_alert(alert, misp_uuid_map)
        item['monitored'] = item['domain_name'] in monitored
        item['legitimate'] = item['domain_name'] in legitimate
        items.append(item)
    return items


def get_unified_threats(params):
    """
    The whole filtered feed, serialized (no pagination): prefer threats_queryset + serialize_threats on a
    page, the feed holds hundreds of thousands of alerts on a busy instance.

    :rtype: list[dict]
    """
    return serialize_threats(threats_queryset(params))
