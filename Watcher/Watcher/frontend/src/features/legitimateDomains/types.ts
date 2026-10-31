import type { LastEvent } from '../timeline/components/LastActor';

export interface LegitimateDomain {
    id: number;
    domain_name: string;
    contact: string | null;
    created_at: string;
    /** Registration date of the domain itself (RDAP/WHOIS). */
    domain_created_at: string | null;
    /** `YYYY-MM-DD` */
    expiry: string | null;
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
export type ExpiryStatus = 'expired' | 'expiring_soon' | 'valid' | 'none';
/** `attention` = expired or expiring soon. */
export type ExpiryFilter = ExpiryStatus | 'attention' | '';

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
    expired: number;
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
