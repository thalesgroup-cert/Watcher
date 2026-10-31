import { api } from '../../api/client';
import type { Alert, AlertFilters, DataLeakStatistics, ListQuery, Page, Pattern, PatternInput } from './types';

export const ALERTS = '/api/data_leak/alert/';
export const PATTERNS = '/api/data_leak/keyword/';

const listParams = ({ page, pageSize, ordering }: ListQuery) => ({ page, page_size: pageSize, ordering });

export const fetchAlerts = (filters: AlertFilters, query: ListQuery) =>
    api
        .get<Page<Alert>>(ALERTS, {
            params: {
                ...listParams(query),
                status: filters.status === 'all' ? undefined : filters.status,
                search: filters.search || undefined,
                keyword: filters.keyword || undefined,
                source: filters.source || undefined,
                period: filters.period || undefined,
            },
        })
        .then((res) => res.data);

export const fetchAlert = (id: number) => api.get<Alert>(`${ALERTS}${id}/`).then((res) => res.data);

export const setAlertStatus = (id: number, status: boolean) => api.patch<Alert>(`${ALERTS}${id}/`, { status }).then((res) => res.data);

export const fetchPatterns = (search: string, query: ListQuery) =>
    api.get<Page<Pattern>>(PATTERNS, { params: { ...listParams(query), search: search || undefined } }).then((res) => res.data);

/** Every pattern, for the filter menu (one page of up to 1000). */
export const fetchAllPatterns = () =>
    api.get<Page<Pattern>>(PATTERNS, { params: { page_size: 1000, ordering: 'name' } }).then((res) => res.data.results);

export const fetchPattern = (id: number) => api.get<Pattern>(`${PATTERNS}${id}/`).then((res) => res.data);

export const savePattern = (id: number | undefined, input: PatternInput) =>
    (id === undefined ? api.post<Pattern>(PATTERNS, input) : api.patch<Pattern>(`${PATTERNS}${id}/`, input)).then((res) => res.data);

export const deletePattern = (id: number) => api.delete(`${PATTERNS}${id}/`);

export const fetchStatistics = () => api.get<DataLeakStatistics>(`${PATTERNS}statistics/`).then((res) => res.data);
