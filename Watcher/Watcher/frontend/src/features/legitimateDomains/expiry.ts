import { since } from '../../lib/dates';
import type { ExpiryFilter, ExpiryStatus, LegitimateDomain } from './types';

export const EXPIRING_SOON_DAYS = 30;
const DAY = 86_400_000;

/** `YYYY-MM-DD` (or a date-time) as a local date at midnight. */
export function parseDay(value: string): Date {
    const [y, m, d] = value.slice(0, 10).split('-').map(Number);
    return new Date(y, m - 1, d);
}

export const formatDay = (value: string) =>
    parseDay(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

function daysFromToday(value: string, now = new Date()): number {
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return Math.round((parseDay(value).getTime() - today.getTime()) / DAY);
}

export function expiryStatus(value: string | null, now = new Date()): ExpiryStatus {
    if (!value) return 'none';
    const days = daysFromToday(value, now);
    if (days < 0) return 'expired';
    return days <= EXPIRING_SOON_DAYS ? 'expiring_soon' : 'valid';
}

const relative = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

/** "in 12 days", "3 months ago": days up to two months, then months, then years. */
export function expiryDistance(value: string, now = new Date()): string {
    const days = daysFromToday(value, now);
    if (!Number.isFinite(days)) return '-';
    const abs = Math.abs(days);
    if (abs < 60) return relative.format(days, 'day');
    if (abs < 730) return relative.format(Math.round(days / 30.44), 'month');
    return relative.format(Math.round(days / 365.25), 'year');
}

export const STATUS_META: Record<ExpiryStatus, { label: string; color: 'error' | 'warning' | 'success' | 'default' }> = {
    expired: { label: 'Expired', color: 'error' },
    unconfirmed: { label: 'Unconfirmed', color: 'warning' },
    expiring_soon: { label: 'Expiring soon', color: 'warning' },
    valid: { label: 'Valid', color: 'success' },
    none: { label: 'No date', color: 'default' },
};

export const FILTER_OPTIONS: { value: ExpiryFilter; label: string }[] = [
    { value: '', label: 'Any' },
    { value: 'attention', label: 'Needs attention' },
    { value: 'expired', label: 'Expired' },
    { value: 'unconfirmed', label: 'Expired, unconfirmed' },
    { value: 'expiring_soon', label: `Expiring within ${EXPIRING_SOON_DAYS} days` },
    { value: 'valid', label: 'Valid' },
    { value: 'none', label: 'No date' },
    { value: 'unverified', label: 'Not verified lately' },
    { value: 'not_registered', label: 'Not registered' },
];

/** The certificate expiry has no registry to confirm it: only the choices that make sense for it. */
export const SSL_FILTER_OPTIONS = FILTER_OPTIONS.filter((o) => o.value !== 'unconfirmed' && o.value !== 'unverified' && o.value !== 'not_registered');

/** Why a domain has no date, in a few words (the last lookup says it). */
export function noDateReason(domain: Pick<LegitimateDomain, 'expiry_check'>): string {
    switch (domain.expiry_check) {
        case 'not_registered':
            return 'Not registered';
        case 'subdomain':
            return 'A subdomain: the registry only knows its main domain';
        case 'no_date':
            return 'The registry gives no date';
        case 'unsupported':
            return 'No expiry date available for this extension';
        case 'unreachable':
            return 'The registry did not answer';
        default:
            return 'Not detected yet';
    }
}

const SOURCE_TEXT: Record<string, string> = { RDAP: 'Date from the registry (RDAP)', manual: 'Date typed by hand' };

/** Where the date comes from and when it was last checked, for the details of a domain. */
export function checkedText(domain: Pick<LegitimateDomain, 'expiry' | 'expiry_source' | 'expiry_checked_at' | 'expiry_check'>): string {
    if (domain.expiry_check === 'contradicted') {
        return 'A registry gave an earlier date: the stored one is kept until a second answer confirms it.';
    }
    const source = domain.expiry_source ? SOURCE_TEXT[domain.expiry_source] : null;
    const checked = domain.expiry_checked_at ? `checked ${since(domain.expiry_checked_at)}` : 'never checked';
    if (!domain.expiry && !domain.expiry_checked_at) return 'No registry has answered yet.';
    if (!domain.expiry) return `No date. ${noDateReason(domain)}; ${checked}.`;
    return `${source ?? 'Date from an unknown source'}, ${checked}.`;
}
