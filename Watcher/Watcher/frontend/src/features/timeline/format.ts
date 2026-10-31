import { displayName } from '../../components/common/UserAvatar';
import type { TimelineEvent } from './types';

export const isAutomated = (e: Pick<TimelineEvent, 'username'>) => !e.username || e.username === 'system';

export const actorName = (e: Pick<TimelineEvent, 'username' | 'first_name' | 'last_name'>) =>
    isAutomated(e) ? 'Watcher' : displayName(e.first_name, e.last_name, e.username);

const ISO_RE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?)?/;

export function formatValue(value: unknown): string {
    if (value === null || value === undefined || value === '') return '-';
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (Array.isArray(value)) return value.length ? value.join(', ') : '-';
    const str = String(value);
    if (ISO_RE.test(str)) {
        const d = new Date(str);
        if (!Number.isNaN(d.getTime())) return str.length > 10 ? d.toLocaleString('en-GB') : d.toLocaleDateString('en-GB');
    }
    return str;
}

export { dateAgo, formatDateTime } from '../../lib/dates';

// English like the rest of the interface ("just now" is hard-coded); absolute dates are British English too, whatever the browser language.
const relative = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

/** "just now", "12 min ago", "3 h ago", then the time of day for older events (the day is in the section header). */
export function relativeTime(iso: string, now = Date.now()): string {
    const seconds = Math.round((now - new Date(iso).getTime()) / 1000);
    if (seconds < 45) return 'just now';
    if (seconds < 3600) return relative.format(-Math.round(seconds / 60), 'minute');
    if (seconds < 6 * 3600) return relative.format(-Math.round(seconds / 3600), 'hour');
    return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

export function dayLabel(iso: string, now = new Date()): string {
    const days = Math.round((startOfDay(now) - startOfDay(new Date(iso))) / 86_400_000);
    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    const d = new Date(iso);
    return d.toLocaleDateString('en-GB', {
        weekday: days < 7 ? 'long' : undefined,
        day: 'numeric',
        month: 'long',
        year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric',
    });
}

/** Object counts per type in a burst, most frequent first: [['dns_finder.alert', 25], ...]. */
export function countByType(events: TimelineEvent[]): [string, number][] {
    const counts = new Map<string, number>();
    events.forEach((e) => counts.set(e.content_type, (counts.get(e.content_type) ?? 0) + 1));
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

export type FeedEntry =
    | { kind: 'event'; key: string; event: TimelineEvent }
    | { kind: 'group'; key: string; events: TimelineEvent[] };

export interface FeedDay {
    label: string;
    entries: FeedEntry[];
}

const GROUP_WINDOW_MS = 5 * 60_000;
const MIN_GROUP_SIZE = 3;

const appLabel = (contentType: string) => contentType.split('.')[0];

// Same module rather than same model: scans create interleaved objects (a DNS alert, then its domain, ...).
const sameBurst = (a: TimelineEvent, b: TimelineEvent) =>
    a.username === b.username &&
    a.action === b.action &&
    appLabel(a.content_type) === appLabel(b.content_type) &&
    Math.abs(new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()) <= GROUP_WINDOW_MS;

/**
 * Splits events (already sorted) into day sections and folds bursts - the same person doing the same thing
 * to the same kind of object within minutes, typically a bulk action - into one entry.
 */
export function buildFeed(events: TimelineEvent[], { group = true, now = new Date() } = {}): FeedDay[] {
    const days: FeedDay[] = [];
    let run: TimelineEvent[] = [];

    const flush = () => {
        if (run.length === 0) return;
        const label = dayLabel(run[0].timestamp, now);
        let day = days[days.length - 1];
        if (!day || day.label !== label) {
            day = { label, entries: [] };
            days.push(day);
        }
        if (group && run.length >= MIN_GROUP_SIZE) {
            day.entries.push({ kind: 'group', key: `g${run[0].id}`, events: run });
        } else {
            run.forEach((event) => day.entries.push({ kind: 'event', key: `e${event.id}`, event }));
        }
        run = [];
    };

    for (const event of events) {
        const last = run[run.length - 1];
        if (last && (!sameBurst(last, event) || dayLabel(last.timestamp, now) !== dayLabel(event.timestamp, now))) flush();
        run.push(event);
    }
    flush();
    return days;
}
