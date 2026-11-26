import { api } from '../../api/client';
import { ASSET_KINDS } from './catalog';
import type { Asset, AssetKind, DnsStatistics, ListQuery, Page, Threat, ThreatFilters, ThreatStatus } from './types';

export const THREATS = '/api/dns_finder/threats_monitored/';
export const ALERTS = '/api/dns_finder/alert/';

const listParams = ({ page, pageSize, ordering }: ListQuery) => ({ page, page_size: pageSize, ordering });

export const fetchThreats = (f: ThreatFilters, query: ListQuery) =>
    api
        .get<Page<Threat>>(THREATS, {
            params: {
                ...listParams(query),
                status: f.status === 'all' ? undefined : f.status,
                source: f.source || undefined,
                search: f.search || undefined,
                period: f.period || undefined,
                corporate_dns: f.asset.startsWith('d:') ? f.asset.slice(2) : undefined,
                corporate_keyword: f.asset.startsWith('k:') ? f.asset.slice(2) : undefined,
            },
        })
        .then((res) => res.data);

export const fetchThreat = (id: number) => api.get<Threat>(`${THREATS}${id}/`).then((res) => res.data);

export const setThreatStatus = (id: number, status: ThreatStatus) => api.patch(`${ALERTS}${id}/`, { status });

/** Comments live on the alert, technical fields on the detected domain. */
export async function updateThreat(threat: Threat, comments: string, technical: Record<string, string | number | null>) {
    await api.patch(`/api/dns_finder/dns_twisted/${threat.technical_details.dns_twisted_id}/`, technical);
    await api.patch(`${ALERTS}${threat.id}/`, { comments });
}

export const exportThreatToMisp = (threat: Threat, eventUuid: string) =>
    api
        .post<{ message?: string }>('/api/dns_finder/misp/', {
            id: threat.technical_details.dns_twisted_id,
            event_uuid: eventUuid,
            domain_name: threat.domain_name,
        })
        .then((res) => res.data);

// Watched assets: the API names the field `domain_name` for domains and `name` for keywords.
type RawAsset = Omit<Asset, 'name'> & { name?: string; domain_name?: string };
const toAsset = (raw: RawAsset): Asset => ({ ...raw, name: raw.domain_name ?? raw.name ?? '' });
const nameField = (kind: AssetKind) => (kind === 'domain' ? 'domain_name' : 'name');

export const fetchAssets = (kind: AssetKind, search: string, query: ListQuery) =>
    api
        .get<Page<RawAsset>>(ASSET_KINDS[kind].endpoint, {
            params: { ...listParams({ ...query, ordering: query.ordering.replace(/^(-?)name$/, `$1${nameField(kind)}`) }), search: search || undefined },
        })
        .then((res) => ({ ...res.data, results: res.data.results.map(toAsset) }));

export const fetchAsset = (kind: AssetKind, id: number) =>
    api.get<RawAsset>(`${ASSET_KINDS[kind].endpoint}${id}/`).then((res) => toAsset(res.data));

export const saveAsset = (kind: AssetKind, id: number | undefined, name: string) => {
    const body = { [nameField(kind)]: name };
    const endpoint = ASSET_KINDS[kind].endpoint;
    return (id === undefined ? api.post<RawAsset>(endpoint, body) : api.patch<RawAsset>(`${endpoint}${id}/`, body)).then((res) =>
        toAsset(res.data),
    );
};

export const deleteAsset = (kind: AssetKind, id: number) => api.delete(`${ASSET_KINDS[kind].endpoint}${id}/`);

export const fetchStatistics = () => api.get<DnsStatistics>('/api/dns_finder/dns_monitored/statistics/').then((res) => res.data);
