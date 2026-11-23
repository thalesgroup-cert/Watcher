import { connectorLight, type Light } from './components/State';
import type { Connector } from './types';

export interface ConnectorFilters {
    search: string;
    status: string;
    health: string;
    category: string;
    /** One light of the board (green, red...): the connectors that show it. */
    light: Light | '';
}

export const EMPTY_FILTERS: ConnectorFilters = { search: '', status: '', health: '', category: '', light: '' };

// As many as the tables of the other pages: an instance has some fifteen connectors, which must not need a click on "2"
export const PAGE_SIZE = 25;

export function filterConnectors(connectors: Connector[], filters: ConnectorFilters): Connector[] {
    const needle = filters.search.trim().toLowerCase();
    return connectors
        .filter((c) => !filters.status || c.status === filters.status)
        .filter((c) => !filters.health || (c.health?.status ?? 'unknown') === filters.health)
        .filter((c) => !filters.category || c.category === filters.category)
        .filter((c) => !filters.light || connectorLight(c).light === filters.light)
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
