import { api } from '../../api/client';
import type {
    WordGraph,
    BannedWord,
    KeywordHit,
    ListQuery,
    MonitoredKeyword,
    MonitoredKeywordInput,
    Page,
    Source,
    SourceInput,
    Summary,
    ThreatsStatistics,
    Word,
    WordFilters,
} from './types';

const BASE = '/api/threats_watcher/';
export const WORDS = `${BASE}trendyword/`;
export const SOURCES = `${BASE}source/`;
export const BANNED = `${BASE}bannedword/`;
export const KEYWORDS = `${BASE}monitored-keywords/`;
export const KEYWORD_HITS = `${BASE}keyword-hits/`;

const listParams = ({ page, pageSize, ordering }: ListQuery) => ({ page, page_size: pageSize, ordering });

export const fetchWords = (f: WordFilters, query: ListQuery) =>
    api
        .get<Page<Word>>(WORDS, {
            params: { ...listParams(query), search: f.search || undefined, period: f.period || undefined, confidence: f.confidence || undefined },
        })
        .then((res) => res.data);

export const fetchWordGraph = (period: string, limit = 50) =>
    api.get<WordGraph>(`${WORDS}graph/`, { params: { period: period || undefined, limit } }).then((res) => res.data);
export const fetchWord = (id: number) => api.get<Word>(`${WORDS}${id}/`).then((res) => res.data);
export const deleteWord = (id: number) => api.delete(`${WORDS}${id}/`);
/** Adds the word to the banned words and removes it from the trends, in one step. */
export const banWord = (id: number) => api.post(`${WORDS}${id}/ban/`);

export const fetchKeywords = (search: string, level: string, seen: string, kind: string, query: ListQuery) =>
    api
        .get<Page<MonitoredKeyword>>(KEYWORDS, {
            params: { ...listParams(query), search: search || undefined, level: level || undefined, seen: seen || undefined, kind: kind || undefined },
        })
        .then((res) => res.data);
export const fetchKeyword = (id: number) => api.get<MonitoredKeyword>(`${KEYWORDS}${id}/`).then((res) => res.data);
export const saveKeyword = (id: number | undefined, input: MonitoredKeywordInput) =>
    (id === undefined ? api.post<MonitoredKeyword>(KEYWORDS, input) : api.patch<MonitoredKeyword>(`${KEYWORDS}${id}/`, input)).then((res) => res.data);
export const deleteKeyword = (id: number) => api.delete(`${KEYWORDS}${id}/`);
export const fetchKeywordHits = (keyword: number, query: ListQuery) =>
    api.get<Page<KeywordHit>>(KEYWORD_HITS, { params: { ...listParams(query), keyword } }).then((res) => res.data);
export const setKeywordHitArchived = (id: number, archived: boolean) => api.patch(`${KEYWORD_HITS}${id}/`, { is_archived: archived });

export const fetchSources = (search: string, filters: { confidence: string; status: string; country: string }, query: ListQuery) =>
    api
        .get<Page<Source>>(SOURCES, {
            params: {
                ...listParams(query),
                search: search || undefined,
                confidence: filters.confidence || undefined,
                status: filters.status || undefined,
                country_code: filters.country || undefined,
            },
        })
        .then((res) => res.data);
export const fetchSource = (id: number) => api.get<Source>(`${SOURCES}${id}/`).then((res) => res.data);
export const saveSource = (id: number | undefined, input: SourceInput) =>
    (id === undefined ? api.post<Source>(SOURCES, input) : api.patch<Source>(`${SOURCES}${id}/`, input)).then((res) => res.data);
export const deleteSource = (id: number) => api.delete(`${SOURCES}${id}/`);

export const fetchBanned = (search: string, query: ListQuery) =>
    api.get<Page<BannedWord>>(BANNED, { params: { ...listParams(query), search: search || undefined } }).then((res) => res.data);
export const saveBanned = (id: number | undefined, name: string) =>
    (id === undefined ? api.post<BannedWord>(BANNED, { name }) : api.patch<BannedWord>(`${BANNED}${id}/`, { name })).then((res) => res.data);
export const deleteBanned = (id: number) => api.delete(`${BANNED}${id}/`);

export const fetchStatistics = () => api.get<ThreatsStatistics>(`${SOURCES}statistics/`).then((res) => res.data);

/** Newest summary of a type (weekly digest, breaking news), or null. */
export const fetchLatestSummary = (type: 'weekly_summary' | 'breaking_news') =>
    api.get<Summary[] | Page<Summary>>(`${BASE}summary/`, { params: { type } }).then((res) => {
        const rows = Array.isArray(res.data) ? res.data : res.data.results;
        return rows[0] ?? null;
    });

/** Stored AI summary of a word, or null. */
export const fetchWordSummary = (word: string) =>
    api.get<Summary[] | Page<Summary>>(`${BASE}summary/`, { params: { type: 'trendy_word_summary', keyword: word } }).then((res) => {
        const rows = Array.isArray(res.data) ? res.data : res.data.results;
        return rows[0] ?? null;
    });

/** Generates the AI summary of a word from its articles (slow); the API explains when there is not enough content. */
export const generateWordSummary = (word: string) => api.get<Summary>(`${BASE}summary/by-keyword/${encodeURIComponent(word)}/`).then((res) => res.data);
