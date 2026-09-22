# coding=utf-8
"""
Normalization for the unified DNS Threats Monitored feed: Alert now covers
all three detection sources (dnstwist, certstream_keyword, subdomain_takeover)
directly via its `source` field, so this is a single query + a single
serializer, not a merge of two separate tables.
"""
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


def get_unified_threats(params):
    """
    Build the chronologically-sorted list of DNS Finder threats across all
    three detection sources, applying the requested filters.

    :param params: Query-param-like mapping (request.query_params), all
        values optional: source, corporate_dns, fuzzer, corporate_keyword,
        provider, cname_target, status (one of Alert.STATUS_CHOICES).
    :rtype: list[dict]
    """
    source = params.get('source') or None
    corporate_dns = params.get('corporate_dns') or None
    status_param = params.get('status') or None

    alerts_qs = Alert.objects.select_related(
        'dns_twisted', 'dns_twisted__dns_monitored', 'dns_twisted__keyword_monitored'
    ).order_by('-created_at')

    if source:
        alerts_qs = alerts_qs.filter(source=source)
    if corporate_dns:
        alerts_qs = alerts_qs.filter(dns_twisted__dns_monitored__domain_name=corporate_dns)
    if status_param:
        alerts_qs = alerts_qs.filter(status=status_param)
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

    alerts = list(alerts_qs)

    # Batch-fetch every domain's MISP UUIDs in a single query instead of
    # letting serialize_alert hit the DB once per row (N+1).
    domain_names = {alert.dns_twisted.domain_name for alert in alerts}
    misp_uuid_map = {
        domain_name: (misp_event_uuid or [])
        for domain_name, misp_event_uuid in MISPEventUuidLink.objects.filter(
            domain_name__in=domain_names
        ).values_list('domain_name', 'misp_event_uuid')
    } if domain_names else {}

    return [serialize_alert(alert, misp_uuid_map) for alert in alerts]
