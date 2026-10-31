import type { Connector } from './types';

export interface ConnectorFilters {
    search: string;
    status: string;
    health: string;
    category: string;
}

export const EMPTY_FILTERS: ConnectorFilters = { search: '', status: '', health: '', category: '' };

export const PAGE_SIZE = 10;

export function filterConnectors(connectors: Connector[], filters: ConnectorFilters): Connector[] {
    const needle = filters.search.trim().toLowerCase();
    return connectors
        .filter((c) => !filters.status || c.status === filters.status)
        .filter((c) => !filters.health || (c.health?.status ?? 'unknown') === filters.health)
        .filter((c) => !filters.category || c.category === filters.category)
        .filter(
            (c) =>
                !needle ||
                [c.name, c.category, c.description].some((v) => (v ?? '').toLowerCase().includes(needle)),
        )
        .sort((a, b) => a.name.localeCompare(b.name));
}

export function paginate<T>(items: T[], page: number, pageSize = PAGE_SIZE): T[] {
    return items.slice((page - 1) * pageSize, page * pageSize);
}
