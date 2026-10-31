import type { TimelineAction } from './types';

export interface ModuleMeta {
    label: string;
    /** Page that lists the module's objects. */
    route: string;
}

/** Keyed by Django app label (first half of `content_type`). */
export const MODULES: Record<string, ModuleMeta> = {
    common: { label: 'Legitimate Domains', route: '/legitimate_domains' },
    threats_watcher: { label: 'Threats Watcher', route: '/threats_watcher' },
    cyber_watch: { label: 'Cyber Watch', route: '/cyber_watch' },
    data_leak: { label: 'Data Leak', route: '/data_leak' },
    site_monitoring: { label: 'Website Monitoring', route: '/website_monitoring' },
    dns_finder: { label: 'DNS Threats', route: '/dns_finder' },
};

/** Singular / plural object nouns, keyed by `content_type` (`app_label.model`, the models tracked in timeline/signals.py). */
const OBJECTS: Record<string, [string, string]> = {
    'common.legitimatedomain': ['legitimate domain', 'legitimate domains'],
    'threats_watcher.source': ['RSS source', 'RSS sources'],
    'threats_watcher.monitoredkeyword': ['monitored keyword', 'monitored keywords'],
    'threats_watcher.bannedword': ['banned word', 'banned words'],
    'cyber_watch.watchrule': ['watch rule', 'watch rules'],
    'cyber_watch.watchrulehit': ['watch rule match', 'watch rule matches'],
    'data_leak.keyword': ['search pattern', 'search patterns'],
    'data_leak.alert': ['data leak alert', 'data leak alerts'],
    'site_monitoring.site': ['monitored website', 'monitored websites'],
    'dns_finder.dnsmonitored': ['monitored domain', 'monitored domains'],
    'dns_finder.keywordmonitored': ['monitored keyword', 'monitored keywords'],
    'dns_finder.dnstwisted': ['suspicious domain', 'suspicious domains'],
    'dns_finder.alert': ['DNS alert', 'DNS alerts'],
};

export const moduleOf = (contentType: string) => MODULES[contentType.split('.')[0]];

export function objectNoun(contentType: string, count = 1): string {
    const nouns = OBJECTS[contentType];
    if (!nouns) return count === 1 ? 'item' : 'items';
    return count === 1 ? nouns[0] : nouns[1];
}

export const ACTIONS: { value: TimelineAction; label: string; verb: string }[] = [
    { value: 'created', label: 'Created', verb: 'added' },
    { value: 'updated', label: 'Updated', verb: 'updated' },
    { value: 'deleted', label: 'Deleted', verb: 'removed' },
    { value: 'transferred', label: 'Transferred', verb: 'transferred' },
    { value: 'cancelled', label: 'Cancelled', verb: 'cancelled the transfer of' },
];

export const actionMeta = (action: string) => ACTIONS.find((a) => a.value === action);

export const FIELD_LABELS: Record<string, string> = {
    domain_name: 'Domain name',
    ticket_id: 'Ticket ID',
    contact: 'Contact',
    expiry: 'Expiry',
    ssl_expiry: 'SSL expiry',
    domain_created_at: 'Domain created',
    repurchased: 'Repurchased',
    comments: 'Comments',
    misp_event_uuid: 'MISP UUID',
    url: 'URL',
    confident: 'Confidence',
    country: 'Country',
    country_code: 'Country code',
    name: 'Name',
    level: 'Level',
    threshold: 'Threshold',
    keywords: 'Keywords',
    exceptions: 'Exceptions',
    scope: 'Scope',
    is_active: 'Active',
    is_archived: 'Archived',
    is_regex: 'Regex',
    legitimacy: 'Legitimacy',
    takedown_request: 'Takedown request',
    legal_team: 'Legal team',
    blocking_request: 'Blocking request',
    ip_monitoring: 'IP monitoring',
    mail_monitoring: 'Email monitoring',
    content_monitoring: 'Content monitoring',
    monitored: 'Monitored',
    udrp_status: 'UDRP status',
    status: 'Status',
    trigger: 'Trigger',
    fuzzer: 'Fuzzer',
    issuer: 'Issuer',
    san_list: 'SAN list',
    provider: 'Provider',
    cname_target: 'CNAME target',
};

/** Labels that depend on the object type, keyed by `content_type`. */
const FIELD_LABELS_BY_TYPE: Record<string, Record<string, string>> = {
    // Boolean there: true = still to review, false = archived
    'data_leak.alert': { status: 'To review' },
};

export const fieldLabel = (field: string, contentType?: string) =>
    (contentType && FIELD_LABELS_BY_TYPE[contentType]?.[field]) ?? FIELD_LABELS[field] ?? field;
