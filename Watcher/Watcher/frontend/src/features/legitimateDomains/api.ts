import { api } from '../../api/client';
import type { DomainInput, DomainPage, DomainQuery, DomainStatistics, LegitimateDomain } from './types';

export const ENDPOINT = '/api/common/legitimate_domains/';

export const fetchDomains = ({ page, pageSize, ordering, search, status, ssl, repurchased }: DomainQuery) =>
    api
        .get<DomainPage>(ENDPOINT, {
            params: {
                page,
                page_size: pageSize,
                ordering,
                search: search || undefined,
                status: status || undefined,
                ssl: ssl || undefined,
                repurchased: repurchased || undefined,
            },
        })
        .then((res) => res.data);

export const fetchDomain = (id: number) => api.get<LegitimateDomain>(`${ENDPOINT}${id}/`).then((res) => res.data);

export const fetchStatistics = () => api.get<DomainStatistics>(`${ENDPOINT}statistics/`).then((res) => res.data);

export const createDomain = (input: DomainInput) => api.post<LegitimateDomain>(ENDPOINT, input).then((res) => res.data);

export const updateDomain = (id: number, input: Partial<DomainInput>) =>
    api.patch<LegitimateDomain>(`${ENDPOINT}${id}/`, input).then((res) => res.data);

export const deleteDomain = (id: number) => api.delete(`${ENDPOINT}${id}/`);

export const exportToMisp = (id: number, eventUuid: string) =>
    api
        .post<{ message?: string; misp_event_uuid?: string }>(`${ENDPOINT}misp/`, { id, event_uuid: eventUuid })
        .then((res) => res.data);
