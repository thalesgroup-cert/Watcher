// Relative dates, in English like the rest of the interface.
const relative = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

/** "27 Oct 2026, 14:03": day, then 24-hour time, in English whatever the browser language. */
export const formatDateTime = (iso: string) => {
    const date = new Date(iso);
    // A date the server did not send, or sent badly, is a dash: it must not break the page that shows it
    return Number.isFinite(date.getTime()) ? date.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : '-';
};

/** The exact moment, then how long ago: "27 Oct 2026, 14:03 (2 hours ago)". */
export const dateAgo = (iso: string) => `${formatDateTime(iso)} (${since(iso)})`;

/** "12 minutes ago", "3 hours ago", "yesterday", "5 days ago", then months. */
export function since(iso: string, now = Date.now()): string {
    const elapsed = now - new Date(iso).getTime();
    if (!Number.isFinite(elapsed)) return '-';
    const minutes = Math.round(elapsed / 60_000);
    if (minutes < 1) return 'just now';
    if (minutes < 60) return relative.format(-minutes, 'minute');
    if (minutes < 24 * 60) return relative.format(-Math.round(minutes / 60), 'hour');
    const days = Math.round(minutes / (24 * 60));
    if (days < 60) return relative.format(-days, 'day');
    return relative.format(-Math.round(days / 30.44), 'month');
}
