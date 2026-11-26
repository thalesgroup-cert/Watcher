import { api } from '../../api/client';
import type { Cve, CyberStatistics, Victim } from '../cyberWatch/types';
import type { Alert, DataLeakStatistics } from '../dataLeak/types';
import type { DnsStatistics, Threat } from '../dnsFinder/types';
import type { DomainStatistics } from '../legitimateDomains/types';
import type { SiteChange, SiteStatistics } from '../siteMonitoring/types';
import type { Summary, ThreatsStatistics, WordGraph } from '../threatsWatcher/types';

/**
 * Everything the Overview shows, in one answer. A part the person may not read is null (figures) or empty (lists): the server
 * asks each module with the person's own rights.
 */
export interface OverviewData {
    threats: ThreatsStatistics | null;
    cyber: CyberStatistics | null;
    domains: DomainStatistics | null;
    graph: WordGraph | null;
    brief: { breaking_news: Summary | null; weekly_summary: Summary | null };
    /** The five best scored CVEs of the last 30 days, or of all time when none is that recent. */
    topCves: Cve[];
    /** The approvals waiting for someone (signed-in people only). */
    pending: { count: number } | null;
    leaks: DataLeakStatistics | null;
    dns: DnsStatistics | null;
    sites: SiteStatistics | null;
    latest: { cves: Cve[]; victims: Victim[]; leaks: Alert[]; threats: Threat[]; changes: SiteChange[] };
}

export const fetchOverview = () => api.get<OverviewData>('/api/overview/').then((res) => res.data);
