import { api } from '../../api/client';
import type { ActivitySummary, FeedFilters, FeedPage, HistoryTarget, TimelineEvent } from './types';

export const fetchHistory = ({ contentType, objectId }: HistoryTarget) =>
    api
        .get<TimelineEvent[] | { results: TimelineEvent[] }>('/api/timeline/events/', {
            params: { content_type: contentType, object_id: objectId },
        })
        .then((res) => (Array.isArray(res.data) ? res.data : res.data.results));

export const FEED_PAGE_SIZE = 50;

/**
 * Only the `cursor` value is taken from DRF's absolute `next` URL: behind Traefik its host is the internal
 * `watcher:9002`, which the browser cannot reach.
 */
export const nextCursor = (page: FeedPage) => (page.next ? new URL(page.next).searchParams.get('cursor') : null);

export const fetchFeed = (filters: FeedFilters, cursor: string | null) =>
    api
        .get<FeedPage>('/api/timeline/events/feed/', {
            params: {
                actor: filters.actor,
                module: filters.module || undefined,
                action: filters.actions.join(',') || undefined,
                search: filters.search.trim() || undefined,
                page_size: FEED_PAGE_SIZE,
                cursor: cursor ?? undefined,
            },
        })
        .then((res) => res.data);

export const fetchSummary = () => api.get<ActivitySummary>('/api/timeline/events/summary/').then((res) => res.data);
