import type { LastEvent } from '../timeline/components/LastActor';

export interface LegitimateDomain {
    id: number;
    domain_name: string;
    contact: string | null;
    created_at: string;
    /** Registration date of the domain itself (RDAP). */
    domain_created_at: string | null;
    /** `YYYY-MM-DD` */
    expiry: string | null;
    /** Where the domain expiry comes from: the registry (`RDAP`), or someone who typed it. */
    expiry_source?: 'RDAP' | 'manual' | null;
    /** When a registry last answered about this domain. */
    expiry_checked_at?: string | null;
    /** What the last lookup said: `ok`, `contradicted` (an earlier date waits for a second answer), `not_registered`,
     * `no_date`, `unsupported` (no RDAP server for the extension), `unreachable`. */
    expiry_check?: string | null;
    /** A registry gave this date lately (RDAP, within a week). Absent means "not told": taken as confirmed. */
    expiry_confirmed?: boolean;
    /** `YYYY-MM-DD` */
    ssl_expiry: string | null;
    repurchased: boolean;
    // Internal fields, only sent to signed-in users.
    ticket_id?: string | null;
    comments?: string | null;
    misp_event_uuid?: unknown;
    last_event?: LastEvent | null;
}

export type DomainInput = Pick<
    LegitimateDomain,
    'domain_name' | 'contact' | 'domain_created_at' | 'expiry' | 'ssl_expiry' | 'repurchased'
> & { ticket_id: string; comments: string };

/** Expiry status of a date, same rules as the API (`?status=` / `?ssl=`): 30 days ahead is "expiring soon". */
export type ExpiryStatus = 'expired' | 'unconfirmed' | 'expiring_soon' | 'valid' | 'none';
/**
 * `attention` = expired, unconfirmed or expiring soon. `unconfirmed` is a past date no registry confirmed lately (it may be
 * wrong); `unverified` is a domain no registry answered for lately, whatever its date; `not_registered` is a domain the registry
 * says does not exist (it is not ours any more). These three only exist for the domain expiry.
 */
export type ExpiryFilter = ExpiryStatus | 'attention' | 'unverified' | 'not_registered' | '';

export interface DomainFilters {
    search: string;
    status: ExpiryFilter;
    ssl: ExpiryFilter;
    repurchased: '' | 'true' | 'false';
}

export interface DomainQuery extends DomainFilters {
    page: number;
    pageSize: number;
    /** DRF ordering, e.g. `-created_at`. */
    ordering: string;
}

export interface DomainPage {
    count: number;
    next: string | null;
    previous: string | null;
    results: LegitimateDomain[];
}

export interface DomainStatistics {
    total: number;
    repurchased: number;
    /** A past date a registry confirmed lately. */
    expired: number;
    /** A past date nobody confirmed lately. */
    unconfirmed: number;
    /** No registry answered lately, whatever the date. */
    unverified: number;
    /** The registry says the domain does not exist. */
    notRegistered: number;
    expiringSoon: number;
    noExpiry: number;
    sslExpired: number;
    sslExpiringSoon: number;
    sslNoExpiry: number;
    newToday: number;
    newThisWeek: number;
    topTlds: { tld: string; count: number }[];
    /** 12 months from the current one: expiries from today on. */
    upcoming: { month: string; domains: number; certificates: number }[];
}
