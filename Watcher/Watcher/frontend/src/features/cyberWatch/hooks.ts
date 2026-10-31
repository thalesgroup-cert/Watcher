import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryClient } from '../../api/queryClient';
import { notifyError, notifySuccess } from '../../lib/notify';
import type { BulkTarget } from '../bulk/useBulk';
import * as api from './api';
import { matchLabel } from './catalog';
import type { Cve, CveFilters, ListQuery, Match, MatchFilters, Rule, RuleInput, Victim, VictimFilters } from './types';

const KEY = ['cyberWatch'] as const;
export const RULE_TYPE = 'cyber_watch.watchrule';
export const MATCH_TYPE = 'cyber_watch.watchrulehit';

/** Reload every list, detail and statistic of the module. */
export const invalidateCyberWatch = () => queryClient.invalidateQueries({ queryKey: KEY });

export const MATCH_BULK: BulkTarget = { endpoint: api.MATCHES, refresh: invalidateCyberWatch };
export const CVE_BULK: BulkTarget = { endpoint: api.CVES, refresh: invalidateCyberWatch };
export const VICTIM_BULK: BulkTarget = { endpoint: api.VICTIMS, refresh: invalidateCyberWatch };
export const RULE_BULK: BulkTarget = { endpoint: api.RULES, refresh: invalidateCyberWatch };

/** Detail query painted with the list row while it loads. */
function useDetail<T extends { id: number }>(name: string, id: number | null, fetch: (id: number) => Promise<T>, initial?: T) {
    return useQuery({
        queryKey: [...KEY, name, id],
        queryFn: () => fetch(id as number),
        enabled: id !== null,
        initialData: initial?.id === id ? initial : undefined,
        initialDataUpdatedAt: 0,
    });
}

export function useMatches(filters: MatchFilters, query: ListQuery) {
    return useQuery({ queryKey: [...KEY, 'matches', filters, query], queryFn: () => api.fetchMatches(filters, query), placeholderData: keepPreviousData });
}
export const useMatch = (id: number | null, initial?: Match) => useDetail('match', id, api.fetchMatch, initial);

export function useCves(filters: CveFilters, query: ListQuery) {
    return useQuery({ queryKey: [...KEY, 'cves', filters, query], queryFn: () => api.fetchCves(filters, query), placeholderData: keepPreviousData });
}
export const useCve = (id: number | null, initial?: Cve) => useDetail('cve', id, api.fetchCve, initial);

export function useVictims(filters: VictimFilters, query: ListQuery) {
    return useQuery({ queryKey: [...KEY, 'victims', filters, query], queryFn: () => api.fetchVictims(filters, query), placeholderData: keepPreviousData });
}
export const useVictim = (id: number | null, initial?: Victim) => useDetail('victim', id, api.fetchVictim, initial);

export function useGroup(id: number | null) {
    return useQuery({ queryKey: [...KEY, 'group', id], queryFn: () => api.fetchGroup(id as number), enabled: id !== null, staleTime: 5 * 60_000 });
}

/** Rules that matched one CVE (its id) or victim ("group::victim"), for its drawer. */
export function useMatchesOf(objectId: string | null, type: Match['hit_type']) {
    return useQuery({ queryKey: [...KEY, 'matchesOf', type, objectId], queryFn: () => api.fetchMatchesOf(objectId as string, type), enabled: !!objectId });
}

export function useRules(search: string, scope: string, active: string, query: ListQuery, enabled = true) {
    return useQuery({
        queryKey: [...KEY, 'rules', search, scope, active, query],
        queryFn: () => api.fetchRules(search, scope, active, query),
        placeholderData: keepPreviousData,
        enabled,
    });
}

/** Every rule, for the filter menus (one page of up to 1000, by name). */
export function useAllRules(enabled = true) {
    return useQuery({
        queryKey: [...KEY, 'rules', 'all'],
        queryFn: () => api.fetchRules('', '', '', { page: 1, pageSize: 1000, ordering: 'name' }).then((p) => p.results),
        enabled,
    });
}
export const useRule = (id: number | null, initial?: Rule) => useDetail('rule', id, api.fetchRule, initial);

export function useCyberStatistics() {
    return useQuery({ queryKey: [...KEY, 'statistics'], queryFn: api.fetchStatistics });
}

function useAfterChange() {
    const client = useQueryClient();
    return (targets: [string, number][] = []) => {
        void invalidateCyberWatch();
        targets.forEach(([type, id]) => void client.invalidateQueries({ queryKey: ['timeline', 'history', type, id] }));
    };
}

export function useArchiveMatch() {
    const afterChange = useAfterChange();
    return useMutation({
        mutationFn: ({ match, archived }: { match: Match; archived: boolean }) => api.setMatchArchived(match.id, archived),
        onSuccess: (match, { archived }) => {
            afterChange([[MATCH_TYPE, match.id]]);
            notifySuccess(`${matchLabel(match.object_id)} ${archived ? 'archived' : 'is back to review'}`);
        },
        onError: notifyError,
    });
}

export function useArchiveCve() {
    const afterChange = useAfterChange();
    return useMutation({
        mutationFn: ({ cve, archived }: { cve: Pick<Cve, 'id' | 'cve_id'>; archived: boolean }) => api.setCveArchived(cve.id, archived),
        onSuccess: (cve, { archived }) => {
            afterChange();
            notifySuccess(`${cve.cve_id} ${archived ? 'archived' : 'restored'}`);
        },
        onError: notifyError,
    });
}

export function useArchiveVictim() {
    const afterChange = useAfterChange();
    return useMutation({
        mutationFn: ({ victim, archived }: { victim: Pick<Victim, 'id' | 'victim_name'>; archived: boolean }) => api.setVictimArchived(victim.id, archived),
        onSuccess: (victim, { archived }) => {
            afterChange();
            notifySuccess(`${victim.victim_name} ${archived ? 'archived' : 'restored'}`);
        },
        onError: notifyError,
    });
}

export function useSaveRule() {
    const afterChange = useAfterChange();
    return useMutation({
        mutationFn: ({ id, input }: { id?: number; input: Partial<RuleInput> }) => api.saveRule(id, input),
        onSuccess: (rule) => afterChange([[RULE_TYPE, rule.id]]),
        onError: notifyError,
    });
}

export function useDeleteRule() {
    const afterChange = useAfterChange();
    return useMutation({
        mutationFn: (rule: Rule) => api.deleteRule(rule.id),
        onSuccess: (_, rule) => {
            afterChange();
            notifySuccess(`${rule.name} deleted, with its matches`);
        },
        onError: notifyError,
    });
}

export function useScanRule() {
    const afterChange = useAfterChange();
    return useMutation({
        mutationFn: (rule: Pick<Rule, 'id' | 'name'>) => api.scanRule(rule.id),
        onSuccess: ({ created }, rule) => {
            afterChange();
            notifySuccess(created ? `${rule.name}: ${created} new match${created === 1 ? '' : 'es'} in the data already collected` : `${rule.name}: no new match in the data already collected`);
        },
        onError: notifyError,
    });
}

export function useRulePreview(input: Pick<RuleInput, 'keywords' | 'exceptions' | 'scope'>, enabled: boolean) {
    return useQuery({
        queryKey: [...KEY, 'preview', input],
        queryFn: () => api.previewRule(input),
        enabled: enabled && input.keywords.length > 0,
        placeholderData: keepPreviousData,
        staleTime: 60_000,
    });
}
