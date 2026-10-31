import { useInfiniteQuery, useQueries, useQuery } from '@tanstack/react-query';
import * as api from './api';
import type { FeedFilters, HistoryTarget, TimelineEvent } from './types';

/** History of one or more objects, merged; refetched every time the drawer opens. */
export function useHistory(targets: HistoryTarget[], enabled: boolean) {
    return useQueries({
        queries: targets.map((target) => ({
            queryKey: ['timeline', 'history', target.contentType, target.objectId] as const,
            queryFn: () => api.fetchHistory(target),
            enabled,
            staleTime: 0,
        })),
        combine: (results) => ({
            events: results.flatMap((r) => r.data ?? []) as TimelineEvent[],
            isPending: results.some((r) => r.isPending),
            error: results.find((r) => r.error)?.error ?? null,
        }),
    });
}

export function useActivityFeed(filters: FeedFilters) {
    return useInfiniteQuery({
        queryKey: ['timeline', 'feed', filters] as const,
        queryFn: ({ pageParam }) => api.fetchFeed(filters, pageParam),
        initialPageParam: null as string | null,
        getNextPageParam: api.nextCursor,
        staleTime: 15_000,
    });
}

export function useActivitySummary(enabled = true) {
    return useQuery({ queryKey: ['timeline', 'summary'], queryFn: api.fetchSummary, staleTime: 60_000, enabled });
}
