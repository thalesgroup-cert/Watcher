import axios from 'axios';
import { tokenConfig } from './auth';

// DRF's StandardResultsSetPagination caps page_size server-side at 1000
// (max_page_size = 1000, defined identically in every app's api.py) —
// requesting a larger page_size (e.g. 10000) is silently clamped, so any
// "fetch everything for stats" call that only reads page 1 truncates at
// exactly 1000 once the real dataset grows past that. This helper walks
// every page via the `next` cursor and returns the fully concatenated
// results, so a stats KPI count is never silently capped.
export const fetchAllPages = (url, getState) => {
    const pageSize = 1000;
    const config = tokenConfig(getState);

    const fetchPage = (page, accumulated) =>
        axios
            .get(`${url}?page=${page}&page_size=${pageSize}`, config)
            .then(res => {
                const results = res.data.results || res.data;
                const combined = accumulated.concat(results);
                if (res.data.next) {
                    return fetchPage(page + 1, combined);
                }
                return combined;
            });

    return fetchPage(1, []);
};
