import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryClient } from '../../api/queryClient';
import { notifyError, notifySuccess } from '../../lib/notify';
import type { BulkTarget } from '../bulk/useBulk';
import * as api from './api';
import type { KeywordHit, ListQuery, MonitoredKeyword, MonitoredKeywordInput, Source, SourceInput, Word, WordFilters } from './types';

const KEY = ['threatsWatcher'] as const;
export const KEYWORD_TYPE = 'threats_watcher.monitoredkeyword';
export const SOURCE_TYPE = 'threats_watcher.source';
export const BANNED_TYPE = 'threats_watcher.bannedword';

/** Reload every list, detail and statistic of the module. */
export const invalidateThreatsWatcher = () => queryClient.invalidateQueries({ queryKey: KEY });

export const KEYWORD_BULK: BulkTarget = { endpoint: api.KEYWORDS, refresh: invalidateThreatsWatcher };
export const SOURCE_BULK: BulkTarget = { endpoint: api.SOURCES, refresh: invalidateThreatsWatcher };
export const BANNED_BULK: BulkTarget = { endpoint: api.BANNED, refresh: invalidateThreatsWatcher };

export function useWords(filters: WordFilters, query: ListQuery) {
    return useQuery({ queryKey: [...KEY, 'words', filters, query], queryFn: () => api.fetchWords(filters, query), placeholderData: keepPreviousData });
}

export function useWord(id: number | null, initial?: Word) {
    return useQuery({
        queryKey: [...KEY, 'word', id],
        queryFn: () => api.fetchWord(id as number),
        enabled: id !== null,
        initialData: initial?.id === id ? initial : undefined,
        initialDataUpdatedAt: 0,
    });
}

export function useKeywords(search: string, level: string, seen: string, kind: string, query: ListQuery) {
    return useQuery({
        queryKey: [...KEY, 'keywords', search, level, seen, query],
        queryFn: () => api.fetchKeywords(search, level, seen, kind, query),
        placeholderData: keepPreviousData,
    });
}

export function useKeyword(id: number | null, initial?: MonitoredKeyword) {
    return useQuery({
        queryKey: [...KEY, 'keyword', id],
        queryFn: () => api.fetchKeyword(id as number),
        enabled: id !== null,
        initialData: initial?.id === id ? initial : undefined,
        initialDataUpdatedAt: 0,
    });
}

export function useSources(search: string, filters: { confidence: string; status: string; country: string }, query: ListQuery) {
    return useQuery({
        queryKey: [...KEY, 'sources', search, filters, query],
        queryFn: () => api.fetchSources(search, filters, query),
        placeholderData: keepPreviousData,
    });
}

export function useSource(id: number | null, initial?: Source) {
    return useQuery({
        queryKey: [...KEY, 'source', id],
        queryFn: () => api.fetchSource(id as number),
        enabled: id !== null,
        initialData: initial?.id === id ? initial : undefined,
        initialDataUpdatedAt: 0,
    });
}

export function useBanned(search: string, query: ListQuery, enabled: boolean) {
    return useQuery({ queryKey: [...KEY, 'banned', search, query], queryFn: () => api.fetchBanned(search, query), placeholderData: keepPreviousData, enabled });
}

/** Words and their links for the word graph (and the cloud, which uses the same words). */
export function useWordGraph(period = '', limit = 50) {
    return useQuery({ queryKey: [...KEY, 'graph', period, limit], queryFn: () => api.fetchWordGraph(period, limit), placeholderData: keepPreviousData });
}

export function useThreatsStatistics() {
    return useQuery({ queryKey: [...KEY, 'statistics'], queryFn: api.fetchStatistics });
}

export function useLatestSummary(type: 'weekly_summary' | 'breaking_news') {
    return useQuery({ queryKey: [...KEY, 'summary', type], queryFn: () => api.fetchLatestSummary(type), staleTime: 5 * 60_000 });
}

export function useWordSummary(word: string | undefined) {
    return useQuery({ queryKey: [...KEY, 'wordSummary', word], queryFn: () => api.fetchWordSummary(word as string), enabled: !!word });
}

export function useGenerateWordSummary() {
    const client = useQueryClient();
    return useMutation({
        mutationFn: (word: string) => api.generateWordSummary(word),
        onSuccess: (summary, word) => client.setQueryData([...KEY, 'wordSummary', word], summary),
    });
}

function useAfterChange() {
    const client = useQueryClient();
    return (targets: [string, number][] = []) => {
        void invalidateThreatsWatcher();
        targets.forEach(([type, id]) => void client.invalidateQueries({ queryKey: ['timeline', 'history', type, id] }));
    };
}

export function useBanWord() {
    const afterChange = useAfterChange();
    return useMutation({
        mutationFn: (word: Word) => api.banWord(word.id),
        onSuccess: (_, word) => {
            afterChange();
            notifySuccess(`${word.name} is banned: it will not trend again`);
        },
        onError: notifyError,
    });
}

export function useDeleteWord() {
    const afterChange = useAfterChange();
    return useMutation({
        mutationFn: (word: Word) => api.deleteWord(word.id),
        onSuccess: (_, word) => {
            afterChange();
            notifySuccess(`${word.name} removed from the trends`);
        },
        onError: notifyError,
    });
}

export function useSaveKeyword() {
    const afterChange = useAfterChange();
    return useMutation({
        mutationFn: ({ id, input }: { id?: number; input: MonitoredKeywordInput }) => api.saveKeyword(id, input),
        onSuccess: (keyword, { id }) => {
            afterChange([[KEYWORD_TYPE, keyword.id]]);
            notifySuccess(`${keyword.name} ${id === undefined ? 'is now monitored' : 'updated'}`);
        },
        onError: notifyError,
    });
}

export function useKeywordHits(keyword: number | null, query: ListQuery) {
    return useQuery({ queryKey: [...KEY, 'keywordHits', keyword, query], queryFn: () => api.fetchKeywordHits(keyword as number, query), enabled: keyword !== null });
}

export function useArchiveKeywordHit() {
    return useMutation({
        mutationFn: ({ hit, archived }: { hit: KeywordHit; archived: boolean }) => api.setKeywordHitArchived(hit.id, archived),
        onSuccess: () => void invalidateThreatsWatcher(),
        onError: notifyError,
    });
}

export function useDeleteKeyword() {
    const afterChange = useAfterChange();
    return useMutation({
        mutationFn: (keyword: MonitoredKeyword) => api.deleteKeyword(keyword.id),
        onSuccess: (_, keyword) => {
            afterChange();
            notifySuccess(`${keyword.name} is no longer monitored`);
        },
        onError: notifyError,
    });
}

export function useSaveSource() {
    const afterChange = useAfterChange();
    return useMutation({
        mutationFn: ({ id, input }: { id?: number; input: SourceInput }) => api.saveSource(id, input),
        onSuccess: (source, { id }) => {
            afterChange([[SOURCE_TYPE, source.id]]);
            notifySuccess(id === undefined ? 'Source added: it is read at the next run (every 30 minutes)' : 'Source updated');
        },
        onError: notifyError,
    });
}

export function useDeleteSource() {
    const afterChange = useAfterChange();
    return useMutation({
        mutationFn: (source: Source) => api.deleteSource(source.id),
        onSuccess: () => {
            afterChange();
            notifySuccess('Source deleted');
        },
        onError: notifyError,
    });
}

export function useSaveBanned() {
    const afterChange = useAfterChange();
    return useMutation({
        mutationFn: ({ id, name }: { id?: number; name: string }) => api.saveBanned(id, name),
        onSuccess: (banned, { id }) => {
            afterChange([[BANNED_TYPE, banned.id]]);
            notifySuccess(`${banned.name} ${id === undefined ? 'banned' : 'updated'}`);
        },
        onError: notifyError,
    });
}

export function useDeleteBanned() {
    const afterChange = useAfterChange();
    return useMutation({
        mutationFn: (banned: { id: number; name: string }) => api.deleteBanned(banned.id),
        onSuccess: (_, banned) => {
            afterChange();
            notifySuccess(`${banned.name} can trend again`);
        },
        onError: notifyError,
    });
}
