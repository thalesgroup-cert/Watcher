import type { LastEvent } from '../timeline/components/LastActor';

export interface PatternRef {
    id: number;
    name: string;
    is_regex: boolean;
}

export interface Pattern extends PatternRef {
    created_at: string;
    last_event: LastEvent | null;
    alerts_count: number;
    /** Alerts still to review. */
    active_alerts_count: number;
    last_alert_at: string | null;
}

export type PatternInput = Pick<Pattern, 'name' | 'is_regex'>;

export interface Alert {
    id: number;
    keyword: PatternRef;
    url: string;
    /** Host the pattern was found on. */
    source: string;
    /** `true` = to review, `false` = archived. */
    status: boolean;
    created_at: string;
    /** List rows only say whether there is raw content (pastes); the detail carries it. */
    has_content?: boolean;
    content?: string;
}

export type AlertState = 'active' | 'archived' | 'all';
export type Period = '' | 'today' | '7d' | '30d';

export interface AlertFilters {
    status: AlertState;
    search: string;
    /** Pattern id, as a string ('' = any). */
    keyword: string;
    source: string;
    period: Period;
}

export interface Page<T> {
    count: number;
    next: string | null;
    previous: string | null;
    results: T[];
}

export interface ListQuery {
    page: number;
    pageSize: number;
    ordering: string;
}

export interface DataLeakStatistics {
    totalAlerts: number;
    activeAlerts: number;
    archivedAlerts: number;
    newToday: number;
    newThisWeek: number;
    totalKeywords: number;
    perDay: { date: string; count: number }[];
    topKeywords: { id: number; name: string; count: number }[];
    topSources: { source: string; count: number }[];
}
