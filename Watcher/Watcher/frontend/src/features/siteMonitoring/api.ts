import { api } from '../../api/client';
import type {
    ChangeFilters,
    ListQuery,
    MonitoredPage,
    MonitoredPageInput,
    Page,
    PageDiff,
    PageVersion,
    Site,
    SiteChange,
    SiteFilters,
    SiteInput,
    SiteStatistics,
} from './types';

export const SITES = '/api/site_monitoring/site/';
export const CHANGES = '/api/site_monitoring/alert/';

const listParams = ({ page, pageSize, ordering }: ListQuery) => ({ page, page_size: pageSize, ordering });

export const fetchSites = (f: SiteFilters, query: ListQuery) =>
    api
        .get<Page<Site>>(SITES, {
            params: {
                ...listParams(query),
                search: f.search || undefined,
                legitimacy: f.legitimacy.length ? f.legitimacy.join(',') : undefined,
                web: f.web || undefined,
                expiry: f.expiry || undefined,
                action: f.action || undefined,
            },
        })
        .then((res) => res.data);

export const fetchSite = (id: number) => api.get<Site>(`${SITES}${id}/`).then((res) => res.data);

export const saveSite = (id: number | undefined, input: SiteInput) =>
    (id === undefined ? api.post<Site>(SITES, input) : api.patch<Site>(`${SITES}${id}/`, input)).then((res) => res.data);

export const deleteSite = (id: number) => api.delete(`${SITES}${id}/`);

export const exportSiteToMisp = (id: number, eventUuid: string) =>
    api.post<{ message?: string }>('/api/site_monitoring/misp/', { id, event_uuid: eventUuid }).then((res) => res.data);

export const fetchChanges = (f: ChangeFilters, query: ListQuery) =>
    api
        .get<Page<SiteChange>>(CHANGES, {
            params: {
                ...listParams(query),
                status: f.status === 'all' ? undefined : f.status,
                search: f.search || undefined,
                kind: f.kind || undefined,
                period: f.period || undefined,
                site: f.site || undefined,
            },
        })
        .then((res) => res.data);

export const fetchChange = (id: number) => api.get<SiteChange>(`${CHANGES}${id}/`).then((res) => res.data);

export const setChangeStatus = (id: number, status: boolean) => api.patch(`${CHANGES}${id}/`, { status });

export const fetchStatistics = () => api.get<SiteStatistics>(`${SITES}statistics/`).then((res) => res.data);

export const PAGES = '/api/site_monitoring/page/';

export const fetchPages = (search: string, active: string, query: ListQuery) =>
    api
        .get<Page<MonitoredPage>>(PAGES, { params: { ...listParams(query), search: search || undefined, active: active || undefined } })
        .then((res) => res.data);

export const fetchPage = (id: number) => api.get<MonitoredPage>(`${PAGES}${id}/`).then((res) => res.data);

export const savePage = (id: number | undefined, input: MonitoredPageInput) =>
    (id === undefined ? api.post<MonitoredPage>(PAGES, input) : api.patch<MonitoredPage>(`${PAGES}${id}/`, input)).then((res) => res.data);

export const deletePage = (id: number) => api.delete(`${PAGES}${id}/`);

export const fetchPageVersions = (id: number) => api.get<PageVersion[]>(`${PAGES}${id}/versions/`).then((res) => res.data);

export const fetchPageDiff = (id: number, from?: number, to?: number) =>
    api.get<PageDiff>(`${PAGES}${id}/diff/`, { params: { from, to } }).then((res) => res.data);

/** The screenshot of a version. The API wants the token in a header, which an <img> cannot send: the image is fetched here. */
export const fetchPageScreenshot = (pageId: number, versionId: number) =>
    api.get<Blob>(`${PAGES}${pageId}/versions/${versionId}/screenshot/`, { responseType: 'blob' }).then((res) => res.data);

/** Takes a screenshot of the page now and keeps it with its newest version. */
export const captureScreenshotNow = (id: number) => api.post<PageVersion>(`${PAGES}${id}/screenshot/`).then((res) => res.data);

export const checkPageNow = (id: number) =>
    api.post<{ changed: boolean; last_status: number | null }>(`${PAGES}${id}/check/`).then((res) => res.data);
