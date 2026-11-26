import type { LastEvent } from '../timeline/components/LastActor';

export type ThreatSource = 'dnstwist' | 'certstream_keyword' | 'subdomain_takeover';
export type ThreatStatus = 'pending' | 'suspected' | 'confirmed' | 'resolved' | 'false_positive';

/** One item of the threats feed (`/api/dns_finder/threats_monitored/`). */
export interface Threat {
    /** Alert id. */
    id: number;
    source: ThreatSource;
    domain_name: string;
    corporate_dns: string | null;
    corporate_keyword: string | null;
    status: ThreatStatus;
    comments: string | null;
    created_at: string;
    misp_event_uuid: unknown;
    technical_details: {
        fuzzer: string | null;
        issuer: string | null;
        san_list: string[] | null;
        provider: string | null;
        cname_target: string | null;
        http_status_code: number | null;
        last_checked_at: string | null;
        dns_twisted_id: number;
    };
    /** Already in Website Monitoring / Legitimate Domains. */
    monitored: boolean;
    legitimate: boolean;
}

/** `open` = pending, suspected or confirmed. */
export type StatusFilter = ThreatStatus | 'open' | 'all';
export type Period = '' | 'today' | '7d' | '30d';

export interface ThreatFilters {
    status: StatusFilter;
    source: ThreatSource | '';
    search: string;
    /** Watched asset: `d:<domain>` or `k:<keyword>`. */
    asset: string;
    period: Period;
}

export type AssetKind = 'domain' | 'keyword';

/** A watched corporate domain or keyword, with its threat counters. */
export interface Asset {
    id: number;
    name: string;
    created_at: string;
    last_event: LastEvent | null;
    threats_count: number;
    open_threats_count: number;
    /** Domains only: open subdomain takeover risks. */
    takeover_count?: number;
    last_threat_at: string | null;
}

export interface Page<T> {
    count: number;
    next: string | null;
    previous: string | null;
    results: T[];
}

export interface ListQuery {
    page: number;
    pageSize: number;
    ordering: string;
}

export interface DnsStatistics {
    openAlerts: number;
    confirmedAlerts: number;
    openTakeover: number;
    totalAlerts: number;
    newToday: number;
    newThisWeek: number;
    totalDnsMonitored: number;
    totalKeywords: number;
    byStatus: Partial<Record<ThreatStatus, number>>;
    bySource: Partial<Record<ThreatSource, number>>;
    perDay: ({ date: string } & Record<ThreatSource, number>)[];
    topIssuers: { name: string; count: number }[];
    topFuzzers: { name: string; count: number }[];
}
