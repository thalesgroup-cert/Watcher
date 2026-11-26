import axios, { AxiosError } from 'axios';
import { friendlyDetail } from '../lib/errors';

/** The CSRF token the server set in a cookie when the page was served. */
export function csrfToken(): string {
    const cookie = document.cookie
        .split(';')
        .map((c) => c.trim())
        .find((c) => c.startsWith('csrftoken='));
    return cookie ? cookie.slice('csrftoken='.length) : '';
}

/** Shared HTTP client. The session is a cookie the browser sends on its own; a request that changes something adds the CSRF token. */
export const api = axios.create({
    headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
    if (!['get', 'head', 'options'].includes((config.method ?? 'get').toLowerCase())) {
        const csrf = csrfToken();
        if (csrf) config.headers.set('X-CSRFToken', csrf);
    }
    return config;
});

/** Best human readable message out of a DRF error response. */
export function getErrorMessage(err: unknown, fallback = 'Request failed'): string {
    if (axios.isAxiosError(err)) {
        const data = (err as AxiosError<Record<string, unknown>>).response?.data;
        if (data && typeof data === 'object') {
            for (const key of ['detail', 'message', 'error']) {
                const value = data[key];
                if (typeof value === 'string') return friendlyDetail(value);
            }
            // A refused sign-in or a refused form: the reason of Django REST framework, e.g. "Incorrect Credentials"
            const general = data.non_field_errors;
            if (Array.isArray(general) && typeof general[0] === 'string') return general.join(' ');
        }
        return err.message || fallback;
    }
    return err instanceof Error ? err.message : fallback;
}
