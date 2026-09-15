# coding=utf-8
"""
Normalization and merge logic for the unified DNS Threats Monitored feed:
combines Alert (dnstwist / certstream_keyword sources) and DanglingAlert
(subdomain_takeover source) into one chronologically-sorted list, since
they live in unrelated tables and the frontend renders them as one table.
"""
from .models import Alert, DanglingAlert
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
    Normalize an Alert (dnstwist or certstream_keyword source) into the
    unified threats-feed item shape.

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
        'status_tag': 'active' if alert.status else 'archived',
        'created_at': alert.created_at,
        'misp_event_uuid': _lookup_misp_uuid(dns_twisted.domain_name, misp_uuid_map),
        'technical_details': {
            'fuzzer': dns_twisted.fuzzer,
            'corporate_dns': corporate_dns,
            'corporate_keyword': corporate_keyword,
            'issuer': dns_twisted.issuer,
            'san_list': dns_twisted.san_list,
            'not_before': dns_twisted.not_before,
            'not_after': dns_twisted.not_after,
            'serial_number': dns_twisted.serial_number,
            'fingerprint_sha256': dns_twisted.fingerprint_sha256,
            'detected_at': alert.created_at,
        },
    }


def serialize_dangling_alert(alert, misp_uuid_map=None):
    """
    Normalize a DanglingAlert (subdomain_takeover source) into the unified
    threats-feed item shape.

    :param alert: DanglingAlert instance, with dangling_subdomain/dns_monitored
        already select_related.
    :param misp_uuid_map: Optional dict[str, list] of pre-fetched MISP UUIDs
        keyed by domain_name/subdomain, to avoid a per-row DB query (see
        get_unified_threats). Falls back to a live get_misp_uuid() call when
        omitted, preserving the original per-call behavior for other callers.
    :rtype: dict
    """
    sub = alert.dangling_subdomain
    corporate_dns = sub.dns_monitored.domain_name if sub.dns_monitored else None

    return {
        'id': alert.id,
        'source': 'subdomain_takeover',
        'domain_name': sub.subdomain,
        'corporate_dns': corporate_dns,
        'corporate_keyword': None,
        'status_tag': sub.status,
        'created_at': alert.created_at,
        'misp_event_uuid': _lookup_misp_uuid(sub.subdomain, misp_uuid_map),
        'technical_details': {
            'provider': sub.provider,
            'cname_target': sub.cname_target,
            'http_status_code': sub.http_status_code,
            'last_checked_at': sub.last_checked_at,
            'corporate_dns': corporate_dns,
            'dangling_subdomain_id': sub.id,
        },
    }


def get_unified_threats(params):
    """
    Build the merged, chronologically-sorted list of DNS Finder threats
    across all three detection sources, applying the requested filters.

    :param params: Query-param-like mapping (request.query_params), all
        values optional: source, corporate_dns, fuzzer, corporate_keyword,
        provider, cname_target, status.
    :rtype: list[dict]
    """
    source = params.get('source') or None
    corporate_dns = params.get('corporate_dns') or None

    items = []
    alerts = []
    dangling_alerts = []

    if source in (None, Alert.SOURCE_DNSTWIST, Alert.SOURCE_CERTSTREAM_KEYWORD):
        alerts_qs = Alert.objects.select_related(
            'dns_twisted', 'dns_twisted__dns_monitored', 'dns_twisted__keyword_monitored'
        )
        if source:
            alerts_qs = alerts_qs.filter(source=source)
        if corporate_dns:
            alerts_qs = alerts_qs.filter(dns_twisted__dns_monitored__domain_name=corporate_dns)
        fuzzer = params.get('fuzzer') or None
        if fuzzer:
            alerts_qs = alerts_qs.filter(dns_twisted__fuzzer=fuzzer)
        corporate_keyword = params.get('corporate_keyword') or None
        if corporate_keyword:
            alerts_qs = alerts_qs.filter(dns_twisted__keyword_monitored__name=corporate_keyword)
        alerts = list(alerts_qs)

    if source in (None, 'subdomain_takeover'):
        dangling_alerts_qs = DanglingAlert.objects.select_related(
            'dangling_subdomain', 'dangling_subdomain__dns_monitored'
        )
        if corporate_dns:
            dangling_alerts_qs = dangling_alerts_qs.filter(dangling_subdomain__dns_monitored__domain_name=corporate_dns)
        provider = params.get('provider') or None
        if provider:
            dangling_alerts_qs = dangling_alerts_qs.filter(dangling_subdomain__provider=provider)
        cname_target = params.get('cname_target') or None
        if cname_target:
            dangling_alerts_qs = dangling_alerts_qs.filter(dangling_subdomain__cname_target=cname_target)
        dangling_status = params.get('status') or None
        if dangling_status:
            dangling_alerts_qs = dangling_alerts_qs.filter(dangling_subdomain__status=dangling_status)
        dangling_alerts = list(dangling_alerts_qs)

    # Batch-fetch every domain/subdomain's MISP UUIDs in a single query instead
    # of letting each serialize_* call hit the DB once per row (N+1).
    domain_names = {alert.dns_twisted.domain_name for alert in alerts}
    domain_names.update(alert.dangling_subdomain.subdomain for alert in dangling_alerts)
    misp_uuid_map = {
        domain_name: (misp_event_uuid or [])
        for domain_name, misp_event_uuid in MISPEventUuidLink.objects.filter(
            domain_name__in=domain_names
        ).values_list('domain_name', 'misp_event_uuid')
    } if domain_names else {}

    items.extend(serialize_alert(alert, misp_uuid_map) for alert in alerts)
    items.extend(serialize_dangling_alert(alert, misp_uuid_map) for alert in dangling_alerts)

    items.sort(key=lambda item: item['created_at'], reverse=True)
    return items
