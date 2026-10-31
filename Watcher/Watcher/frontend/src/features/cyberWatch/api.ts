import { api } from '../../api/client';
import type {
    Cve, CveFilters, CyberStatistics, Group, ListQuery, Match, MatchFilters, Page, Rule, RuleInput, RulePreview, Victim, VictimFilters,
} from './types';

const BASE = '/api/cyber_watch/';
export const CVES = `${BASE}cves/`;
export const VICTIMS = `${BASE}ransomware/victims/`;
export const GROUPS = `${BASE}ransomware/groups/`;
export const RULES = `${BASE}watch-rules/`;
export const MATCHES = `${BASE}watch-rule-hits/`;

const listParams = ({ page, pageSize, ordering }: ListQuery) => ({ page, page_size: pageSize, ordering });
const orUndefined = (value: string) => value || undefined;

export const fetchMatches = (f: MatchFilters, query: ListQuery) =>
    api
        .get<Page<Match>>(MATCHES, {
            params: { ...listParams(query), status: f.status, search: orUndefined(f.search), hit_type: orUndefined(f.type), rule: orUndefined(f.rule), period: orUndefined(f.period) },
        })
        .then((res) => res.data);
/** Matches of one CVE (its id) or victim ("group::victim"). */
export const fetchMatchesOf = (objectId: string, type: Match['hit_type']) =>
    api.get<Page<Match>>(MATCHES, { params: { status: 'all', object_id: objectId, hit_type: type, page_size: 50, ordering: '-hit_at' } }).then((res) => res.data.results);
export const fetchMatch = (id: number) => api.get<Match>(`${MATCHES}${id}/`).then((res) => res.data);
export const setMatchArchived = (id: number, is_archived: boolean) => api.patch<Match>(`${MATCHES}${id}/`, { is_archived }).then((res) => res.data);

export const fetchCves = (f: CveFilters, query: ListQuery) =>
    api
        .get<Page<Cve>>(CVES, {
            params: { ...listParams(query), status: f.status, search: orUndefined(f.search), severity: orUndefined(f.severity.join(',')), period: orUndefined(f.period), matched: orUndefined(f.matched) },
        })
        .then((res) => res.data);
export const fetchCve = (id: number) => api.get<Cve>(`${CVES}${id}/`).then((res) => res.data);
export const setCveArchived = (id: number, is_archived: boolean) => api.patch<Cve>(`${CVES}${id}/`, { is_archived }).then((res) => res.data);

export const fetchVictims = (f: VictimFilters, query: ListQuery) =>
    api
        .get<Page<Victim>>(VICTIMS, {
            params: {
                ...listParams(query),
                status: f.status,
                search: orUndefined(f.search),
                group_id: orUndefined(f.group),
                country: orUndefined(f.country),
                sector: orUndefined(f.sector),
                period: orUndefined(f.period),
                matched: orUndefined(f.matched),
            },
        })
        .then((res) => res.data);
export const fetchVictim = (id: number) => api.get<Victim>(`${VICTIMS}${id}/`).then((res) => res.data);
export const setVictimArchived = (id: number, is_archived: boolean) => api.patch<Victim>(`${VICTIMS}${id}/`, { is_archived }).then((res) => res.data);
export const fetchGroup = (id: number) => api.get<Group>(`${GROUPS}${id}/`).then((res) => res.data);

export const fetchRules = (search: string, scope: string, active: string, query: ListQuery) =>
    api
        .get<Page<Rule>>(RULES, { params: { ...listParams(query), search: orUndefined(search), scope: orUndefined(scope), active: orUndefined(active) } })
        .then((res) => res.data);
export const fetchRule = (id: number) => api.get<Rule>(`${RULES}${id}/`).then((res) => res.data);
export const saveRule = (id: number | undefined, input: Partial<RuleInput>) =>
    (id === undefined ? api.post<Rule>(RULES, input) : api.patch<Rule>(`${RULES}${id}/`, input)).then((res) => res.data);
export const deleteRule = (id: number) => api.delete(`${RULES}${id}/`);
export const previewRule = (input: Pick<RuleInput, 'keywords' | 'exceptions' | 'scope'>) => api.post<RulePreview>(`${RULES}preview/`, input).then((res) => res.data);
/** Records the hits of a rule on the CVEs and victims already collected; returns how many are new. */
export const scanRule = (id: number) => api.post<{ created: number }>(`${RULES}${id}/scan/`).then((res) => res.data);

export const fetchStatistics = () => api.get<CyberStatistics>(`${BASE}statistics/`).then((res) => res.data);
