import type { ExpiryFilter, ExpiryStatus } from './types';

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
    const abs = Math.abs(days);
    if (abs < 60) return relative.format(days, 'day');
    if (abs < 730) return relative.format(Math.round(days / 30.44), 'month');
    return relative.format(Math.round(days / 365.25), 'year');
}

export const STATUS_META: Record<ExpiryStatus, { label: string; color: 'error' | 'warning' | 'success' | 'default' }> = {
    expired: { label: 'Expired', color: 'error' },
    expiring_soon: { label: 'Expiring soon', color: 'warning' },
    valid: { label: 'Valid', color: 'success' },
    none: { label: 'No date', color: 'default' },
};

export const FILTER_OPTIONS: { value: ExpiryFilter; label: string }[] = [
    { value: '', label: 'Any' },
    { value: 'attention', label: 'Needs attention' },
    { value: 'expired', label: 'Expired' },
    { value: 'expiring_soon', label: `Expiring within ${EXPIRING_SOON_DAYS} days` },
    { value: 'valid', label: 'Valid' },
    { value: 'none', label: 'No date' },
];
