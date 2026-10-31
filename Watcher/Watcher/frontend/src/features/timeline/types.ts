import type { AvatarConfig } from '../auth/avatar';
export type TimelineAction = 'created' | 'updated' | 'deleted' | 'transferred' | 'cancelled';

export interface TimelineEvent {
    id: number;
    /** `app_label.model` */
    content_type: string;
    object_id: number;
    action: TimelineAction;
    action_label: string;
    user: number | null;
    /** `system` for automated events. */
    username: string;
    first_name: string;
    last_name: string;
    avatar_color: string | null;
    avatar: AvatarConfig | null;
    timestamp: string;
    diff: Record<string, { old: unknown; new: unknown }>;
    object_repr: string;
}

/** One object whose history is shown (some screens merge two, e.g. a DNS alert and its domain). */
export interface HistoryTarget {
    contentType: string;
    objectId: number;
}

export type Actor = 'people' | 'automated' | 'me' | 'all';

export interface FeedFilters {
    actor: Actor;
    module: string;
    actions: TimelineAction[];
    search: string;
}

export interface FeedPage {
    next: string | null;
    previous: string | null;
    results: TimelineEvent[];
}

export interface ActivitySummary {
    people_today: number;
    automated_today: number;
    people_week: number;
    contributors_week: number;
    by_module_week: Record<string, number>;
}
