// How long a job took and when it runs next, in English like the rest of the interface (see also ./dates for the past).
const relative = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

/** "in 12 minutes", "in 3 hours", "in 2 days"; "any moment" when it is now or already due. */
export function until(iso: string, now = Date.now()): string {
    const minutes = Math.round((new Date(iso).getTime() - now) / 60_000);
    if (!Number.isFinite(minutes)) return '-';
    if (minutes < 1) return 'any moment';
    if (minutes < 60) return relative.format(minutes, 'minute');
    if (minutes < 24 * 60) return relative.format(Math.round(minutes / 60), 'hour');
    return relative.format(Math.round(minutes / (24 * 60)), 'day');
}

/** "45 s", "7 min 6 s", "1 h 5 min": how long a job took. */
export function lasted(seconds: number): string {
    const total = Math.round(seconds);
    if (total < 60) return `${total} s`;
    const minutes = Math.floor(total / 60);
    if (minutes < 60) return `${minutes} min${total % 60 ? ` ${total % 60} s` : ''}`;
    return `${Math.floor(minutes / 60)} h${minutes % 60 ? ` ${minutes % 60} min` : ''}`;
}
