import type { ChangeKind, Site, SiteChange } from './types';

type Color = 'default' | 'info' | 'warning' | 'error';

/** Legitimacy levels of a monitored site (site_monitoring.Site.legitimacy), mildest first. */
export const LEGITIMACY: { value: number; label: string; short: string; color: Color }[] = [
    { value: 1, label: 'Unknown', short: 'Unknown', color: 'default' },
    { value: 2, label: 'Suspicious, not harmful', short: 'Suspicious', color: 'info' },
    { value: 3, label: 'Suspicious, likely harmful (registered)', short: 'Likely harmful', color: 'warning' },
    { value: 4, label: 'Suspicious, likely harmful (available/disabled)', short: 'Likely harmful, offline', color: 'warning' },
    { value: 5, label: 'Malicious (registered)', short: 'Malicious', color: 'error' },
    { value: 6, label: 'Malicious (available/disabled)', short: 'Malicious, offline', color: 'error' },
];
export const legitimacyMeta = (value: number | null) => LEGITIMACY.find((l) => l.value === value);
export const MALICIOUS = [5, 6];

/** What changed, read from the alert type like the API does (`site_monitoring.api.ALERT_KINDS`). */
export const CHANGE_KINDS: { value: ChangeKind; label: string; match: (c: SiteChange) => boolean }[] = [
    { value: 'hosting', label: 'Hosting (IP)', match: (c) => /IP address/i.test(c.type) },
    { value: 'mail', label: 'Mail servers', match: (c) => /Mail record/i.test(c.type) },
    { value: 'content', label: 'Web content', match: (c) => /Web content/i.test(c.type) },
    { value: 'registration', label: 'Registration', match: (c) => /RDAP|Registrar|Domain Expiry/i.test(c.type) },
    { value: 'certificate', label: 'Certificate', match: (c) => /SSL/i.test(c.type) || !!(c.new_ssl_expiry || c.old_ssl_expiry) },
    { value: 'server', label: 'Web server', match: (c) => /banner/i.test(c.type) },
];
export const changeKinds = (c: SiteChange) => CHANGE_KINDS.filter((k) => k.match(c));

const INIT_WINDOW_MS = 6 * 3600_000; // site_monitoring.core.SITE_INIT_WINDOW

const ended = (site: Pick<Site, 'expiry'>) => !!site.expiry && new Date(site.expiry).getTime() < Date.now();

/** First check still running in the background (same rule as site_monitoring.core.sites_initializing). */
export const isInitializing = (site: Pick<Site, 'monitored' | 'created_at' | 'expiry'>) =>
    !site.monitored && !ended(site) && Date.now() - new Date(site.created_at).getTime() < INIT_WINDOW_MS;

/** State of the website at the last check. */
export function webState(site: Pick<Site, 'monitored' | 'web_status' | 'expiry'>): { label: string; color: 'success' | 'warning' | 'error' | 'default' } {
    if (ended(site)) return { label: 'Monitoring ended', color: 'default' };
    if (!site.monitored) return { label: 'First check pending', color: 'default' };
    if (site.web_status === 200) return { label: 'Online', color: 'success' };
    if (site.web_status) return { label: `HTTP ${site.web_status}`, color: 'warning' };
    return { label: 'Offline', color: 'error' };
}

export const ACTIONS = [
    { key: 'takedown_request', filter: 'takedown', label: 'Takedown requested', short: 'Takedown' },
    { key: 'legal_team', filter: 'legal', label: 'Legal team involved', short: 'Legal' },
    { key: 'blocking_request', filter: 'blocking', label: 'Blocking requested', short: 'Blocking' },
] as const;

export const CHECKS = [
    { key: 'ip_monitoring', label: 'IP address' },
    { key: 'content_monitoring', label: 'Web content' },
    { key: 'mail_monitoring', label: 'Mail servers (MX)' },
] as const;

export const UDRP_STATUS: Record<string, string> = {
    pending: 'UDRP case pending',
    won: 'UDRP won (transferred or cancelled)',
    lost: 'UDRP lost',
    unknown: 'UDRP status unknown',
};

/**
 * MX records as a list. The API sends them as the Python repr of a list ("['1 mx.example.com.', ...]") for the
 * values the checks stored that way, or as a real list.
 */
export function mxList(raw: string[] | string | null | undefined): string[] {
    if (Array.isArray(raw)) return raw;
    if (!raw) return [];
    return raw
        .replace(/^\[|\]$/g, '')
        .split(',')
        .map((v) => v.trim().replace(/^['"]|['"]$/g, ''))
        .filter(Boolean);
}
