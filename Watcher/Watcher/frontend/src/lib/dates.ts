// Relative dates, in English like the rest of the interface.
const relative = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

/** "27 Oct 2026, 14:03": day, then 24-hour time, in English whatever the browser language. */
export const formatDateTime = (iso: string) => new Date(iso).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });

/** The exact moment, then how long ago: "27 Oct 2026, 14:03 (2 hours ago)". */
export const dateAgo = (iso: string) => `${formatDateTime(iso)} (${since(iso)})`;

/** "12 minutes ago", "3 hours ago", "yesterday", "5 days ago", then months. */
export function since(iso: string, now = Date.now()): string {
    const minutes = Math.round((now - new Date(iso).getTime()) / 60_000);
    if (minutes < 1) return 'just now';
    if (minutes < 60) return relative.format(-minutes, 'minute');
    if (minutes < 24 * 60) return relative.format(-Math.round(minutes / 60), 'hour');
    const days = Math.round(minutes / (24 * 60));
    if (days < 60) return relative.format(-days, 'day');
    return relative.format(-Math.round(days / 30.44), 'month');
}
