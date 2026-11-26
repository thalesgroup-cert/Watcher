import type { CyberStatistics } from '../cyberWatch/types';
import type { DataLeakStatistics } from '../dataLeak/types';
import type { DnsStatistics } from '../dnsFinder/types';
import type { SiteStatistics } from '../siteMonitoring/types';

const DAY = 86_400_000;

/** The last `n` days, oldest first, as `YYYY-MM-DD`. */
export function lastDays(n: number, now = Date.now()): string[] {
    return Array.from({ length: n }, (_, i) => new Date(now - (n - 1 - i) * DAY).toISOString().slice(0, 10));
}

/** One count per day for the given days, from series that carry a date: days a series does not mention count for 0. */
export function perDay(days: string[], ...series: ({ date: string; count: number }[] | undefined)[]): number[] {
    const totals = new Map<string, number>();
    for (const list of series) for (const row of list ?? []) totals.set(row.date.slice(0, 10), (totals.get(row.date.slice(0, 10)) ?? 0) + row.count);
    return days.map((day) => totals.get(day) ?? 0);
}

/** The new DNS threats per day, all sources together (the statistics split them by source). */
export function dnsPerDay(stats: DnsStatistics | undefined): { date: string; count: number }[] {
    return (stats?.perDay ?? []).map((row) => ({ date: row.date, count: (row.dnstwist ?? 0) + (row.certstream_keyword ?? 0) + (row.subdomain_takeover ?? 0) }));
}

/** The new watch rule matches per day (the statistics split them by kind). */
export function hitsPerDay(stats: CyberStatistics | undefined): { date: string; count: number }[] {
    return (stats?.hits.perDay ?? []).map((row) => ({ date: row.date, count: (row.cve ?? 0) + (row.ransomware_victim ?? 0) }));
}

interface Sources {
    cyber?: CyberStatistics;
    leaks?: DataLeakStatistics;
    dns?: DnsStatistics;
    sites?: SiteStatistics;
}

/**
 * Everything new per day over the last `n` days. For a signed-in person: what concerns the organisation (leaks, DNS threats,
 * website changes, watch rule matches). For a visitor: the news of the world, CVEs and ransomware victims.
 */
export function detectionsPerDay(days: string[], { cyber, leaks, dns, sites }: Sources, organisation: boolean): number[] {
    if (!organisation) return perDay(days, cyber?.cves.perDay, cyber?.victims.perDay);
    return perDay(days, leaks?.perDay, dnsPerDay(dns), sites?.alertsPerDay, hitsPerDay(cyber));
}
