import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryClient } from '../../api/queryClient';
import { notifyError, notifySuccess } from '../../lib/notify';
import type { BulkTarget } from '../bulk/useBulk';
import * as api from './api';
import type { DomainInput, DomainQuery, LegitimateDomain } from './types';

const KEY = ['legitimateDomains'] as const;
export const CONTENT_TYPE = 'common.legitimatedomain';

/** Reload every list, detail and statistic of the module (also used by legacy modules that change it). */
export const invalidateLegitimateDomains = () => queryClient.invalidateQueries({ queryKey: KEY });


export const LEGITIMATE_DOMAIN_BULK: BulkTarget = { endpoint: api.ENDPOINT, refresh: invalidateLegitimateDomains };

export function useDomains(query: DomainQuery) {
    return useQuery({
        queryKey: [...KEY, 'list', query],
        queryFn: () => api.fetchDomains(query),
        placeholderData: keepPreviousData,
    });
}

export function useDomain(id: number | null, initial?: LegitimateDomain) {
    return useQuery({
        queryKey: [...KEY, 'detail', id],
        queryFn: () => api.fetchDomain(id as number),
        enabled: id !== null,
        initialData: initial?.id === id ? initial : undefined,
        // The row of the list is a fine first paint, but the detail is fetched again right away.
        initialDataUpdatedAt: 0,
    });
}

export function useDomainStatistics() {
    return useQuery({ queryKey: [...KEY, 'statistics'], queryFn: api.fetchStatistics });
}

function useAfterChange() {
    const client = useQueryClient();
    return (id?: number) => {
        void invalidateLegitimateDomains();
        if (id !== undefined) void client.invalidateQueries({ queryKey: ['timeline', 'history', CONTENT_TYPE, id] });
    };
}

export function useSaveDomain() {
    const afterChange = useAfterChange();
    return useMutation({
        mutationFn: ({ id, input }: { id?: number; input: DomainInput }) =>
            id === undefined ? api.createDomain(input) : api.updateDomain(id, input),
        onSuccess: (domain, { id }) => {
            afterChange(domain.id);
            notifySuccess(`${domain.domain_name} ${id === undefined ? 'added' : 'updated'}`);
        },
        onError: notifyError,
    });
}

export function useDeleteDomain() {
    const afterChange = useAfterChange();
    return useMutation({
        mutationFn: (domain: LegitimateDomain) => api.deleteDomain(domain.id),
        onSuccess: (_, domain) => {
            afterChange();
            notifySuccess(`${domain.domain_name} deleted`);
        },
        onError: notifyError,
    });
}

export function useMispExport() {
    const afterChange = useAfterChange();
    return useMutation({
        mutationFn: ({ domain, eventUuid }: { domain: LegitimateDomain; eventUuid: string }) => api.exportToMisp(domain.id, eventUuid),
        onSuccess: (res, { domain }) => {
            afterChange(domain.id);
            notifySuccess(res.message || `${domain.domain_name} exported to MISP`);
        },
        onError: notifyError,
    });
}
