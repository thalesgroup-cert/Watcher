import axios from 'axios';

type Json = Record<string, unknown>;

const asList = (value: unknown): string[] =>
    Array.isArray(value) ? value.map(String) : value == null ? [] : [String(value)];

/**
 * Flattens a DRF error payload into readable lines. Same keys the legacy Alerts component handled
 * (username, password, non_field_errors, ...), so toasts read the same for migrated and legacy pages.
 */
export function flattenApiErrors(payload: unknown): string[] {
    if (!payload || typeof payload !== 'object') {
        return typeof payload === 'string' && payload ? [payload] : [];
    }
    const msg = payload as Json;
    const lines: string[] = [];

    if (msg.username) lines.push(`Username: ${asList(msg.username).join()}`);
    if (msg.password) lines.push(`Password: ${asList(msg.password).join()}`);
    lines.push(...asList(msg.non_field_errors));
    lines.push(...asList(msg.name));
    asList(msg.old_password).forEach((e) => lines.push(`Old Password: ${e}`));
    if (msg.domain_name) lines.push(asList(msg.domain_name).join());
    if (msg.rtir) lines.push(asList(msg.rtir).join());
    for (const key of ['detail', 'message', 'error'] as const) {
        if (msg[key]) lines.push(String(msg[key]));
    }
    return lines;
}

export function errorLines(err: unknown, fallback = 'Request failed'): string[] {
    if (axios.isAxiosError(err)) {
        const lines = flattenApiErrors(err.response?.data);
        return lines.length ? lines : [err.message || fallback];
    }
    return [err instanceof Error ? err.message : fallback];
}
