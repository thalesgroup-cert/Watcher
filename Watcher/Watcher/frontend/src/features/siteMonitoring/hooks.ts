import { useEffect, useMemo } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryClient } from '../../api/queryClient';
import { notifyError, notifySuccess } from '../../lib/notify';
import type { BulkTarget } from '../bulk/useBulk';
import * as api from './api';
import { isInitializing } from './catalog';
import type { ChangeFilters, ListQuery, MonitoredPage, MonitoredPageInput, Site, SiteChange, SiteFilters, SiteInput } from './types';

const KEY = ['siteMonitoring'] as const;
export const SITE_TYPE = 'site_monitoring.site';
export const CHANGE_TYPE = 'site_monitoring.alert';

/** Reload every list, detail and statistic of the module (also used by modules that add sites to it). */
export const invalidateSiteMonitoring = () => queryClient.invalidateQueries({ queryKey: KEY });

export const SITE_BULK: BulkTarget = { endpoint: api.SITES, refresh: invalidateSiteMonitoring };
export const CHANGE_BULK: BulkTarget = { endpoint: api.CHANGES, refresh: invalidateSiteMonitoring };
export const PAGE_BULK: BulkTarget = { endpoint: api.PAGES, refresh: invalidateSiteMonitoring };

export function useSites(filters: SiteFilters, query: ListQuery) {
    return useQuery({
        queryKey: [...KEY, 'sites', filters, query],
        queryFn: () => api.fetchSites(filters, query),
        placeholderData: keepPreviousData,
        // New sites are checked in the background, one after the other: follow them until their first check is done.
        refetchInterval: (q) => (q.state.data?.results.some(isInitializing) ? 5000 : false),
    });
}

export function useSite(id: number | null, initial?: Site) {
    return useQuery({
        queryKey: [...KEY, 'site', id],
        queryFn: () => api.fetchSite(id as number),
        enabled: id !== null,
        initialData: initial?.id === id ? initial : undefined,
        initialDataUpdatedAt: 0,
    });
}

export function useChanges(filters: ChangeFilters, query: ListQuery, enabled = true) {
    return useQuery({
        queryKey: [...KEY, 'changes', filters, query],
        queryFn: () => api.fetchChanges(filters, query),
        placeholderData: keepPreviousData,
        enabled,
    });
}

export function useChange(id: number | null, initial?: SiteChange) {
    return useQuery({
        queryKey: [...KEY, 'change', id],
        queryFn: () => api.fetchChange(id as number),
        enabled: id !== null,
        initialData: initial?.id === id ? initial : undefined,
        initialDataUpdatedAt: 0,
    });
}

export function useSiteStatistics(enabled = true) {
    return useQuery({ queryKey: [...KEY, 'statistics'], queryFn: api.fetchStatistics, enabled });
}

function useAfterChange() {
    const client = useQueryClient();
    return (targets: [string, number][] = []) => {
        void invalidateSiteMonitoring();
        targets.forEach(([type, id]) => void client.invalidateQueries({ queryKey: ['timeline', 'history', type, id] }));
    };
}

export function useSaveSite() {
    const afterChange = useAfterChange();
    return useMutation({
        mutationFn: ({ id, input }: { id?: number; input: SiteInput }) => api.saveSite(id, input),
        onSuccess: (site, { id }) => {
            afterChange([[SITE_TYPE, site.id]]);
            notifySuccess(id === undefined ? `${site.domain_name} added: the first check runs in the background` : `${site.domain_name} updated`);
        },
        onError: notifyError,
    });
}

export function useDeleteSite() {
    const afterChange = useAfterChange();
    return useMutation({
        mutationFn: (site: Site) => api.deleteSite(site.id),
        onSuccess: (_, site) => {
            afterChange();
            notifySuccess(`${site.domain_name} is no longer monitored`);
        },
        onError: notifyError,
    });
}

export function useSiteMispExport() {
    const afterChange = useAfterChange();
    return useMutation({
        mutationFn: ({ site, eventUuid }: { site: Site; eventUuid: string }) => api.exportSiteToMisp(site.id, eventUuid),
        onSuccess: (res, { site }) => {
            afterChange([[SITE_TYPE, site.id]]);
            notifySuccess(res.message || `${site.domain_name} exported to MISP`);
        },
        onError: notifyError,
    });
}

export function useSetChangeStatus() {
    const afterChange = useAfterChange();
    return useMutation({
        mutationFn: ({ change, status }: { change: SiteChange; status: boolean }) => api.setChangeStatus(change.id, status),
        onSuccess: (_, { change, status }) => {
            afterChange([[CHANGE_TYPE, change.id]]);
            notifySuccess(status ? 'Change back to review' : 'Change archived');
        },
        onError: notifyError,
    });
}

export function usePages(search: string, active: string, query: ListQuery) {
    return useQuery({
        queryKey: [...KEY, 'pages', search, active, query],
        queryFn: () => api.fetchPages(search, active, query),
        placeholderData: keepPreviousData,
    });
}

export function usePage(id: number | null, initial?: MonitoredPage) {
    return useQuery({
        queryKey: [...KEY, 'page', id],
        queryFn: () => api.fetchPage(id as number),
        enabled: id !== null,
        initialData: initial?.id === id ? initial : undefined,
        initialDataUpdatedAt: 0,
    });
}

export function usePageVersions(id: number | null) {
    return useQuery({ queryKey: [...KEY, 'page', id, 'versions'], queryFn: () => api.fetchPageVersions(id as number), enabled: id !== null });
}

/** Difference between two versions of a page; the last two when none is chosen. */
export function usePageDiff(id: number | null, from?: number, to?: number, enabled = true) {
    return useQuery({ queryKey: [...KEY, 'page', id, 'diff', from, to], queryFn: () => api.fetchPageDiff(id as number, from, to), enabled: enabled && id !== null, retry: false });
}

export function useSavePage() {
    return useMutation({
        mutationFn: ({ id, input }: { id?: number; input: MonitoredPageInput }) => api.savePage(id, input),
        onSuccess: (page, { id }) => {
            void invalidateSiteMonitoring();
            notifySuccess(id === undefined ? `${page.name || page.url} added: the first version is kept at the next check` : `${page.name || page.url} updated`);
        },
        onError: notifyError,
    });
}

export function useDeletePage() {
    return useMutation({
        mutationFn: (page: MonitoredPage) => api.deletePage(page.id),
        onSuccess: (_, page) => {
            void invalidateSiteMonitoring();
            notifySuccess(`${page.name || page.url} is no longer monitored`);
        },
        onError: notifyError,
    });
}

/** The screenshot of a version as an address an <img> can show (released when the image goes away). */
export function usePageScreenshot(pageId: number, versionId: number | null) {
    const query = useQuery({
        queryKey: [...KEY, 'page', pageId, 'screenshot', versionId],
        queryFn: () => api.fetchPageScreenshot(pageId, versionId as number),
        enabled: versionId !== null,
        staleTime: Infinity, // a screenshot never changes once kept (a new one is a new capture: the keys are invalidated)
    });
    const url = useMemo(() => (query.data ? URL.createObjectURL(query.data) : null), [query.data]);
    useEffect(() => () => (url ? URL.revokeObjectURL(url) : undefined), [url]);
    return { url, isPending: query.isPending && versionId !== null, error: query.error };
}

export function useCaptureScreenshot() {
    return useMutation({
        mutationFn: (page: MonitoredPage) => api.captureScreenshotNow(page.id),
        onSuccess: (_, page) => {
            void invalidateSiteMonitoring();
            notifySuccess(`Screenshot of ${page.name || page.url} kept`);
        },
        onError: notifyError,
    });
}

export function useCheckPage() {
    return useMutation({
        mutationFn: (page: MonitoredPage) => api.checkPageNow(page.id),
        onSuccess: (res, page) => {
            void invalidateSiteMonitoring();
            const name = page.name || page.url;
            if (res.last_status !== 200) notifyError(new Error(`${name} did not answer (${res.last_status ?? 'unreachable'})`));
            else notifySuccess(res.changed ? `${name} changed: a new version was kept` : `${name}: no change`);
        },
        onError: notifyError,
    });
}
