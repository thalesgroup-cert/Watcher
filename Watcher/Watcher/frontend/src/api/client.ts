import axios, { AxiosError } from 'axios';
import { useAuthStore } from '../features/auth/store';

/** Shared HTTP client; sends the session token (`features/auth/store`) on every request. */
export const api = axios.create({
    headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
    const token = useAuthStore.getState().token;
    if (token) {
        config.headers.set('Authorization', `Token ${token}`);
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
                if (typeof value === 'string') return value;
            }
        }
        return err.message || fallback;
    }
    return err instanceof Error ? err.message : fallback;
}
