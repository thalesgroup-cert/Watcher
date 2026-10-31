import type { LastEvent } from '../timeline/components/LastActor';

/** `CVEAlert.severity`; empty while cve.circl.lu has no CVSS score for it yet. */
export type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | '';
/** Severity filter value: "NONE" stands for the CVEs not scored yet. */
export type SeverityFilter = Exclude<Severity, ''> | 'NONE';
export type Scope = 'cve' | 'ransomware' | 'both';
export type HitType = 'cve' | 'ransomware_victim';
export type ArchiveState = 'active' | 'archived' | 'all';
export type Period = '' | 'today' | '7d' | '30d';

/** A CVE reference as cve.circl.lu gives it (OSV: {url, type}), or a bare URL. */
export type Reference = string | { url: string; type?: string };

export interface Cve {
    id: number;
    cve_id: string;
    description: string;
    cvss_score: number | null;
    severity: Severity;
    published: string | null;
    references: Reference[];
    fetched_at: string;
    is_archived: boolean;
    /** Watch rule hits still to review. */
    hits_count: number;
}

export interface Victim {
    id: number;
    group: number;
    group_name: string;
    victim_name: string;
    /** ISO code (sometimes empty). */
    country: string;
    sector: string;
    attacked_at: string | null;
    url: string;
    fetched_at: string;
    is_archived: boolean;
    hits_count: number;
}

export interface Group {
    id: number;
    name: string;
    description: string;
    source: string;
    first_seen: string | null;
    victim_count: number;
    last_attack_at: string | null;
}

export interface Rule {
    id: number;
    name: string;
    keywords: string[];
    exceptions: string[];
    scope: Scope;
    is_active: boolean;
    created_at: string;
    hits_count: number;
    open_hits_count: number;
    last_hit_at: string | null;
    last_event: LastEvent | null;
}

export type RuleInput = Pick<Rule, 'name' | 'keywords' | 'exceptions' | 'scope' | 'is_active'>;

export interface CveTarget {
    kind: 'cve';
    id: number;
    cve_id: string;
    severity: Severity;
    cvss_score: number | null;
    published: string | null;
    is_archived: boolean;
}

export interface VictimTarget {
    kind: 'victim';
    id: number;
    victim_name: string;
    group_id: number;
    group_name: string;
    country: string;
    sector: string;
    attacked_at: string | null;
    url: string;
    is_archived: boolean;
}

/** What a watch rule matched (`WatchRuleHit`), with the CVE or victim it points at when it still exists. */
export interface Match {
    id: number;
    rule: number;
    rule_name: string;
    rule_scope: Scope;
    hit_type: HitType;
    /** CVE id, or "group::victim". */
    object_id: string;
    hit_display: string;
    matched_keyword: string;
    hit_at: string;
    is_archived: boolean;
    target: CveTarget | VictimTarget | null;
}

export interface PreviewSample {
    id: number;
    label: string;
    detail: string;
    keyword: string;
    severity?: Severity;
    country?: string;
    date: string | null;
}

export interface RulePreview {
    cves: number;
    victims: number;
    cveSamples: PreviewSample[];
    victimSamples: PreviewSample[];
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

export interface MatchFilters {
    status: ArchiveState;
    search: string;
    type: '' | HitType;
    rule: string;
    period: Period;
}

export interface CveFilters {
    status: ArchiveState;
    search: string;
    severity: SeverityFilter[];
    period: Period;
    matched: '' | 'yes' | 'no';
}

export interface VictimFilters {
    status: ArchiveState;
    search: string;
    group: string;
    country: string;
    sector: string;
    period: Period;
    matched: '' | 'yes' | 'no';
}

interface Day {
    date: string;
    count: number;
}

export interface CyberStatistics {
    cves: {
        total: number;
        critical7d: number;
        newToday: number;
        new7d: number;
        archived: number;
        /** Active CVEs a watch rule matched. */
        matched: number;
        bySeverity: Partial<Record<SeverityFilter, number>>;
        perDay: Day[];
    };
    victims: {
        total: number;
        newToday: number;
        new7d: number;
        archived: number;
        matched: number;
        groups: number;
        activeGroups7d: number;
        perDay: Day[];
        topGroups: { id: number; name: string; count: number }[];
        topSectors: { name: string; count: number }[];
        topCountries: { name: string; count: number }[];
        /** Every country (ISO code), for the world map. */
        byCountry: { name: string; count: number }[];
    };
    hits: {
        open: number;
        openCve: number;
        openVictims: number;
        new7d: number;
        archived: number;
        perDay: (Day & { cve?: number; ransomware_victim?: number })[];
    };
    /** Only for users who can see the watch rules. */
    rules?: {
        total: number;
        active: number;
        byRule: { id: number; name: string; open: number; total: number; active: boolean }[];
    };
}
