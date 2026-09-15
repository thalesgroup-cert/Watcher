# coding=utf-8
"""
Normalization and merge logic for the unified DNS Threats Monitored feed:
combines Alert (dnstwist / certstream_keyword sources) and DanglingAlert
(subdomain_takeover source) into one chronologically-sorted list, since
they live in unrelated tables and the frontend renders them as one table.
"""
from .models import Alert, DanglingAlert
from common.misp import get_misp_uuid


def serialize_alert(alert):
    """
    Normalize an Alert (dnstwist or certstream_keyword source) into the
    unified threats-feed item shape.

    :param alert: Alert instance, with dns_twisted/dns_monitored/keyword_monitored
        already select_related.
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
        'misp_event_uuid': get_misp_uuid(dns_twisted.domain_name),
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


def serialize_dangling_alert(alert):
    """
    Normalize a DanglingAlert (subdomain_takeover source) into the unified
    threats-feed item shape.

    :param alert: DanglingAlert instance, with dangling_subdomain/dns_monitored
        already select_related.
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
        'misp_event_uuid': get_misp_uuid(sub.subdomain),
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

    if source in (None, Alert.SOURCE_DNSTWIST, Alert.SOURCE_CERTSTREAM_KEYWORD):
        alerts = Alert.objects.select_related(
            'dns_twisted', 'dns_twisted__dns_monitored', 'dns_twisted__keyword_monitored'
        )
        if source:
            alerts = alerts.filter(source=source)
        if corporate_dns:
            alerts = alerts.filter(dns_twisted__dns_monitored__domain_name=corporate_dns)
        fuzzer = params.get('fuzzer') or None
        if fuzzer:
            alerts = alerts.filter(dns_twisted__fuzzer=fuzzer)
        corporate_keyword = params.get('corporate_keyword') or None
        if corporate_keyword:
            alerts = alerts.filter(dns_twisted__keyword_monitored__name=corporate_keyword)
        items.extend(serialize_alert(alert) for alert in alerts)

    if source in (None, 'subdomain_takeover'):
        dangling_alerts = DanglingAlert.objects.select_related(
            'dangling_subdomain', 'dangling_subdomain__dns_monitored'
        )
        if corporate_dns:
            dangling_alerts = dangling_alerts.filter(dangling_subdomain__dns_monitored__domain_name=corporate_dns)
        provider = params.get('provider') or None
        if provider:
            dangling_alerts = dangling_alerts.filter(dangling_subdomain__provider=provider)
        cname_target = params.get('cname_target') or None
        if cname_target:
            dangling_alerts = dangling_alerts.filter(dangling_subdomain__cname_target=cname_target)
        dangling_status = params.get('status') or None
        if dangling_status:
            dangling_alerts = dangling_alerts.filter(dangling_subdomain__status=dangling_status)
        items.extend(serialize_dangling_alert(alert) for alert in dangling_alerts)

    items.sort(key=lambda item: item['created_at'], reverse=True)
    return items
