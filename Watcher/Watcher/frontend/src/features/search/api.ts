import { api } from '../../api/client';
import type { SearchResponse } from './types';

export const fetchSearch = (query: string, signal?: AbortSignal) =>
    api.get<SearchResponse>('/api/search/', { params: { q: query }, signal }).then((res) => res.data);
