import type { LastEvent } from '../timeline/components/LastActor';

export interface Site {
    id: number;
    domain_name: string;
    ticket_id: string | null;
    rtir: number | null;
    ip: string | null;
    ip_second: string | null;
    ip_monitoring: boolean;
    mail_A_record_ip: string | null;
    /** See catalog.mxList. */
    MX_records: string[] | string | null;
    mail_monitoring: boolean;
    content_monitoring: boolean;
    /** First check done. */
    monitored: boolean | null;
    /** HTTP status of the last check, `null` when the site did not answer. */
    web_status: number | null;
    server_banner: string | null;
    x_powered_by: string | null;
    registrar: string | null;
    legitimacy: number | null;
    takedown_request: boolean;
    legal_team: boolean;
    blocking_request: boolean;
    created_at: string;
    /** End of monitoring (date-time). */
    expiry: string | null;
    /** `YYYY-MM-DD` */
    domain_expiry: string | null;
    domain_created_at: string | null;
    ssl_expiry: string | null;
    udrp_status: string | null;
    udrp_last_checked: string | null;
    misp_event_uuid: unknown;
    last_event: LastEvent | null;
    alerts_count: number;
    open_alerts_count: number;
    last_alert_at: string | null;
}

export type SiteInput = Partial<
    Pick<
        Site,
        | 'domain_name'
        | 'ticket_id'
        | 'registrar'
        | 'legitimacy'
        | 'expiry'
        | 'domain_expiry'
        | 'domain_created_at'
        | 'ssl_expiry'
        | 'ip_monitoring'
        | 'content_monitoring'
        | 'mail_monitoring'
        | 'takedown_request'
        | 'legal_team'
        | 'blocking_request'
    >
>;

/** A change detected on a site (`site_monitoring.Alert`). */
export interface SiteChange {
    id: number;
    /** Light in the list; the detail carries the whole site. */
    site: Pick<Site, 'id' | 'domain_name' | 'legitimacy'> & Partial<Site>;
    type: string;
    difference_score: number | null;
    new_ip: string | null;
    old_ip: string | null;
    new_ip_second: string | null;
    old_ip_second: string | null;
    new_MX_records: string[] | string | null;
    old_MX_records: string[] | string | null;
    new_mail_A_record_ip: string | null;
    old_mail_A_record_ip: string | null;
    new_registrar: string | null;
    old_registrar: string | null;
    new_expiry_date: string | null;
    old_expiry_date: string | null;
    new_ssl_expiry: string | null;
    old_ssl_expiry: string | null;
    new_server_banner: string | null;
    old_server_banner: string | null;
    new_x_powered_by: string | null;
    old_x_powered_by: string | null;
    /** `true` = to review, `false` = archived. */
    status: boolean;
    created_at: string;
}

export type ChangeKind = 'hosting' | 'mail' | 'content' | 'registration' | 'certificate' | 'server';
export type Web = '' | 'online' | 'error' | 'offline' | 'pending';
export type ExpiryFilter = '' | 'expired' | 'expiring_soon' | 'valid' | 'none';
export type ActionFilter = '' | 'takedown' | 'legal' | 'blocking' | 'none';
export type Period = '' | 'today' | '7d' | '30d';

export interface SiteFilters {
    search: string;
    /** Legitimacy levels, e.g. [5, 6]. */
    legitimacy: number[];
    web: Web;
    expiry: ExpiryFilter;
    action: ActionFilter;
}

export interface ChangeFilters {
    status: 'active' | 'archived' | 'all';
    search: string;
    kind: ChangeKind | '';
    period: Period;
    /** Site id, as a string ('' = any). */
    site: string;
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

export interface SiteStatistics {
    total: number;
    malicious: number;
    takedownRequests: number;
    legalTeam: number;
    blockingRequests: number;
    newToday: number;
    newThisWeek: number;
    offline: number;
    expiringSoon: number;
    byLegitimacy: Record<string, number>;
    openAlerts: number;
    archivedAlerts: number;
    alertsByKind: Record<ChangeKind, number>;
    alertsPerDay: { date: string; count: number }[];
    topRegistrars: { name: string; count: number }[];
}

/** A web page whose text is watched (`/api/site_monitoring/page/`). */
export interface MonitoredPage {
    id: number;
    url: string;
    name: string;
    css_selector: string;
    /** One regular expression per line. */
    ignore_patterns: string;
    /** Share of the text (%) that has to change for a notification. */
    threshold: number;
    /** Minutes between two checks. */
    check_interval: number;
    /** Number of versions kept. */
    retention: number;
    /** Take a screenshot at each new version (needs the screenshot service). */
    capture_screenshots: boolean;
    is_active: boolean;
    last_checked: string | null;
    /** HTTP status of the last check, `null` when the page did not answer. */
    last_status: number | null;
    last_changed: string | null;
    created_at: string;
    versions_count: number;
    /** Change (%) of the newest version, `null` for the first one. */
    last_ratio: number | null;
}

export type MonitoredPageInput = Partial<
    Pick<MonitoredPage, 'url' | 'name' | 'css_selector' | 'ignore_patterns' | 'threshold' | 'check_interval' | 'retention' | 'capture_screenshots' | 'is_active'>
>;

export interface PageVersion {
    id: number;
    created_at: string;
    size: number;
    change_ratio: number | null;
    notified: boolean;
    /** A screenshot was kept with this version. */
    has_screenshot: boolean;
}

export interface DiffRow {
    kind: 'same' | 'add' | 'remove' | 'skip';
    /** For `skip`: the number of unchanged lines left out. */
    text: string;
}

export interface PageDiff {
    from: PageVersion;
    to: PageVersion;
    ratio: number;
    rows: DiffRow[];
}
