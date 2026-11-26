import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryClient } from '../../api/queryClient';
import { notifyError, notifySuccess } from '../../lib/notify';
import type { BulkTarget } from '../bulk/useBulk';
import * as api from './api';
import type { Alert, AlertFilters, ListQuery, Pattern, PatternInput } from './types';

const KEY = ['dataLeak'] as const;
export const ALERT_TYPE = 'data_leak.alert';
export const PATTERN_TYPE = 'data_leak.keyword';

/** Reload every list, detail and statistic of the module. */
export const invalidateDataLeak = () => queryClient.invalidateQueries({ queryKey: KEY });

export const ALERT_BULK: BulkTarget = { endpoint: api.ALERTS, refresh: invalidateDataLeak };
export const PATTERN_BULK: BulkTarget = { endpoint: api.PATTERNS, refresh: invalidateDataLeak };

export function useAlerts(filters: AlertFilters, query: ListQuery) {
    return useQuery({
        queryKey: [...KEY, 'alerts', filters, query],
        queryFn: () => api.fetchAlerts(filters, query),
        placeholderData: keepPreviousData,
    });
}

export function useAlert(id: number | null, initial?: Alert) {
    return useQuery({
        queryKey: [...KEY, 'alert', id],
        queryFn: () => api.fetchAlert(id as number),
        enabled: id !== null,
        // The row of the list paints the drawer; the detail (with the raw content) is fetched right away.
        initialData: initial?.id === id ? initial : undefined,
        initialDataUpdatedAt: 0,
    });
}

export function usePatterns(search: string, query: ListQuery) {
    return useQuery({
        queryKey: [...KEY, 'patterns', search, query],
        queryFn: () => api.fetchPatterns(search, query),
        placeholderData: keepPreviousData,
    });
}

export function useAllPatterns() {
    return useQuery({ queryKey: [...KEY, 'patterns', 'all'], queryFn: api.fetchAllPatterns });
}

export function usePattern(id: number | null, initial?: Pattern) {
    return useQuery({
        queryKey: [...KEY, 'pattern', id],
        queryFn: () => api.fetchPattern(id as number),
        enabled: id !== null,
        initialData: initial?.id === id ? initial : undefined,
        initialDataUpdatedAt: 0,
    });
}

export function useDataLeakStatistics(enabled = true) {
    return useQuery({ queryKey: [...KEY, 'statistics'], queryFn: api.fetchStatistics, enabled });
}

function useAfterChange() {
    const client = useQueryClient();
    return (contentType: string, id?: number) => {
        void invalidateDataLeak();
        if (id !== undefined) void client.invalidateQueries({ queryKey: ['timeline', 'history', contentType, id] });
    };
}

export function useSetAlertStatus() {
    const afterChange = useAfterChange();
    return useMutation({
        mutationFn: ({ alert, status }: { alert: Alert; status: boolean }) => api.setAlertStatus(alert.id, status),
        onSuccess: (alert) => {
            afterChange(ALERT_TYPE, alert.id);
            notifySuccess(alert.status ? 'Alert back to review' : 'Alert archived');
        },
        onError: notifyError,
    });
}

export function useSavePattern() {
    const afterChange = useAfterChange();
    return useMutation({
        mutationFn: ({ id, input }: { id?: number; input: PatternInput }) => api.savePattern(id, input),
        onSuccess: (pattern, { id }) => {
            afterChange(PATTERN_TYPE, pattern.id);
            notifySuccess(`${pattern.name} ${id === undefined ? 'added' : 'updated'}`);
        },
        onError: notifyError,
    });
}

export function useDeletePattern() {
    const afterChange = useAfterChange();
    return useMutation({
        mutationFn: (pattern: Pattern) => api.deletePattern(pattern.id),
        onSuccess: (_, pattern) => {
            afterChange(PATTERN_TYPE);
            notifySuccess(`${pattern.name} deleted`);
        },
        onError: notifyError,
    });
}
