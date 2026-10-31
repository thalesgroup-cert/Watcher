import type { AssetKind, Threat, ThreatSource, ThreatStatus } from './types';

export const STATUSES: { value: ThreatStatus; label: string; color: 'default' | 'warning' | 'error' | 'success'; open: boolean }[] = [
    { value: 'pending', label: 'Pending', color: 'default', open: true },
    { value: 'suspected', label: 'Suspected', color: 'warning', open: true },
    { value: 'confirmed', label: 'Confirmed', color: 'error', open: true },
    { value: 'resolved', label: 'Resolved', color: 'success', open: false },
    { value: 'false_positive', label: 'False positive', color: 'default', open: false },
];
export const statusMeta = (status: ThreatStatus) => STATUSES.find((s) => s.value === status) ?? STATUSES[0];

export const SOURCES: { value: ThreatSource; label: string; description: string }[] = [
    { value: 'dnstwist', label: 'Look-alike', description: 'Typo-squatted variant of a monitored domain (dnstwist)' },
    { value: 'certstream_keyword', label: 'Certificate', description: 'New TLS certificate matching a monitored keyword (Certificate Transparency)' },
    { value: 'subdomain_takeover', label: 'Takeover risk', description: 'Subdomain pointing to a resource that can be claimed by someone else' },
];
export const sourceMeta = (source: ThreatSource) => SOURCES.find((s) => s.value === source) ?? SOURCES[0];

export const ASSET_KINDS: Record<AssetKind, { one: string; many: string; endpoint: string; contentType: string; filterPrefix: 'd' | 'k' }> = {
    domain: { one: 'monitored domain', many: 'monitored domains', endpoint: '/api/dns_finder/dns_monitored/', contentType: 'dns_finder.dnsmonitored', filterPrefix: 'd' },
    keyword: { one: 'keyword', many: 'keywords', endpoint: '/api/dns_finder/keyword_monitored/', contentType: 'dns_finder.keywordmonitored', filterPrefix: 'k' },
};

/** What a threat is about, in a few words: the fuzzer, the certificate issuer or the dangling target. */
export function threatDetail(t: Threat): string {
    const d = t.technical_details;
    if (t.source === 'subdomain_takeover') return [d.provider, d.cname_target && `CNAME ${d.cname_target}`].filter(Boolean).join(' - ');
    if (t.source === 'dnstwist') return d.fuzzer ? `${d.fuzzer} variant` : '';
    const sans = d.san_list?.length ?? 0;
    return [d.issuer, sans > 1 && `${sans} names on the certificate`].filter(Boolean).join(' - ');
}

/** The asset a threat was matched on. */
export const threatAsset = (t: Threat) => t.corporate_dns ?? t.corporate_keyword ?? '';
