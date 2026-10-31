import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryClient } from '../../api/queryClient';
import { notifyError, notifySuccess } from '../../lib/notify';
import type { BulkTarget } from '../bulk/useBulk';
import * as api from './api';
import { ASSET_KINDS, statusMeta } from './catalog';
import type { Asset, AssetKind, ListQuery, Threat, ThreatFilters, ThreatStatus } from './types';

const KEY = ['dnsFinder'] as const;
export const ALERT_TYPE = 'dns_finder.alert';
export const TWISTED_TYPE = 'dns_finder.dnstwisted';

/** Reload every list, detail and statistic of the module (also used by modules that export to it). */
export const invalidateDnsFinder = () => queryClient.invalidateQueries({ queryKey: KEY });

export const THREAT_BULK: BulkTarget = { endpoint: api.ALERTS, refresh: invalidateDnsFinder };
export const assetBulk = (kind: AssetKind): BulkTarget => ({ endpoint: ASSET_KINDS[kind].endpoint, refresh: invalidateDnsFinder });

export function useThreats(filters: ThreatFilters, query: ListQuery) {
    return useQuery({
        queryKey: [...KEY, 'threats', filters, query],
        queryFn: () => api.fetchThreats(filters, query),
        placeholderData: keepPreviousData,
    });
}

export function useThreat(id: number | null, initial?: Threat) {
    return useQuery({
        queryKey: [...KEY, 'threat', id],
        queryFn: () => api.fetchThreat(id as number),
        enabled: id !== null,
        initialData: initial?.id === id ? initial : undefined,
        initialDataUpdatedAt: 0,
    });
}

export function useAssets(kind: AssetKind, search: string, query: ListQuery) {
    return useQuery({
        queryKey: [...KEY, 'assets', kind, search, query],
        queryFn: () => api.fetchAssets(kind, search, query),
        placeholderData: keepPreviousData,
    });
}

/** Every asset of a kind, for the filter menu (one page of up to 1000, by name). */
export function useAllAssets(kind: AssetKind) {
    return useQuery({
        queryKey: [...KEY, 'assets', kind, 'all'],
        queryFn: () => api.fetchAssets(kind, '', { page: 1, pageSize: 1000, ordering: 'name' }).then((p) => p.results),
    });
}

export function useAsset(kind: AssetKind, id: number | null, initial?: Asset) {
    return useQuery({
        queryKey: [...KEY, 'asset', kind, id],
        queryFn: () => api.fetchAsset(kind, id as number),
        enabled: id !== null,
        initialData: initial?.id === id ? initial : undefined,
        initialDataUpdatedAt: 0,
    });
}

export function useDnsStatistics(enabled = true) {
    return useQuery({ queryKey: [...KEY, 'statistics'], queryFn: api.fetchStatistics, enabled });
}

function useAfterChange() {
    const client = useQueryClient();
    return (targets: [string, number][] = []) => {
        void invalidateDnsFinder();
        targets.forEach(([type, id]) => void client.invalidateQueries({ queryKey: ['timeline', 'history', type, id] }));
    };
}

const threatTargets = (t: Threat): [string, number][] => [
    [ALERT_TYPE, t.id],
    [TWISTED_TYPE, t.technical_details.dns_twisted_id],
];

export function useSetThreatStatus() {
    const afterChange = useAfterChange();
    return useMutation({
        mutationFn: ({ threat, status }: { threat: Threat; status: ThreatStatus }) => api.setThreatStatus(threat.id, status),
        onSuccess: (_, { threat, status }) => {
            afterChange(threatTargets(threat));
            notifySuccess(`${threat.domain_name}: ${statusMeta(status).label.toLowerCase()}`);
        },
        onError: notifyError,
    });
}

export function useUpdateThreat() {
    const afterChange = useAfterChange();
    return useMutation({
        mutationFn: ({ threat, comments, technical }: { threat: Threat; comments: string; technical: Record<string, string | number | null> }) =>
            api.updateThreat(threat, comments, technical),
        onSuccess: (_, { threat }) => {
            afterChange(threatTargets(threat));
            notifySuccess(`${threat.domain_name} updated`);
        },
        onError: notifyError,
    });
}

export function useThreatMispExport() {
    const afterChange = useAfterChange();
    return useMutation({
        mutationFn: ({ threat, eventUuid }: { threat: Threat; eventUuid: string }) => api.exportThreatToMisp(threat, eventUuid),
        onSuccess: (res, { threat }) => {
            afterChange(threatTargets(threat));
            notifySuccess(res.message || `${threat.domain_name} exported to MISP`);
        },
        onError: notifyError,
    });
}

export function useSaveAsset(kind: AssetKind) {
    const afterChange = useAfterChange();
    return useMutation({
        mutationFn: ({ id, name }: { id?: number; name: string }) => api.saveAsset(kind, id, name),
        onSuccess: (asset, { id }) => {
            afterChange([[ASSET_KINDS[kind].contentType, asset.id]]);
            notifySuccess(`${asset.name} ${id === undefined ? 'added' : 'updated'}`);
        },
        onError: notifyError,
    });
}

export function useDeleteAsset(kind: AssetKind) {
    const afterChange = useAfterChange();
    return useMutation({
        mutationFn: (asset: Asset) => api.deleteAsset(kind, asset.id),
        onSuccess: (_, asset) => {
            afterChange();
            notifySuccess(`${asset.name} deleted`);
        },
        onError: notifyError,
    });
}
