import { create } from 'zustand';
import { api } from '../../api/client';
import { notifyError } from '../../lib/notify';

// Bulk actions of every module ("one per line" create, change or delete the selected rows, exports): one request to
// `<endpoint><action>/`, a progress card while it runs and the per-item summary afterwards (BulkFeedback.tsx).

export interface BulkTarget {
    /** API base of the module's list, e.g. `/api/common/legitimate_domains/`. */
    endpoint: string;
    /** Reloads the module's lists and statistics after a (non preview) bulk action. */
    refresh: () => unknown;
}

export interface BulkSummary {
    succeeded: number;
    skipped: number;
    errors: number;
    dry_run?: boolean;
    ok_status?: string;
    results: { value: string; status: string; reason: string; id: number | null }[];
}

interface BulkState {
    /** The bulk request being processed. */
    running: { label: string; total: number } | null;
    /** Summary of the last bulk action, until it is closed. */
    result: (BulkSummary & { label: string }) | null;
    clearResult: () => void;
}

export const useBulkStore = create<BulkState>((set) => ({
    running: null,
    result: null,
    clearResult: () => set({ result: null }),
}));

// How many items a request carries: the selected rows, or the non-empty lines of the "one per line" text.
const countItems = (body: { ids?: unknown[]; values?: unknown }) =>
    Array.isArray(body.ids) ? body.ids.length : String(body.values ?? '').split(/\r?\n/).filter((v) => v.trim()).length;

async function runBulk(target: BulkTarget, action: string, body: Record<string, unknown>, label: string, dryRun = false): Promise<BulkSummary | undefined> {
    useBulkStore.setState({ running: { label, total: countItems(body) } });
    try {
        const { data } = await api.post<BulkSummary>(`${target.endpoint}${action}/`, body);
        useBulkStore.setState({ running: null, result: { label, ...data } });
        if (!dryRun) await target.refresh();
        return data;
    } catch (err) {
        useBulkStore.setState({ running: null });
        notifyError(err);
        return undefined;
    }
}

export function useBulk(target: BulkTarget) {
    return {
        /** "One item per line" create; `shared` fields apply to every item. `dryRun` only previews. */
        create: (values: string, shared: object, label: string, dryRun = false) =>
            runBulk(target, 'bulk_create', { values, shared, dry_run: dryRun }, dryRun ? `${label} (preview)` : label, dryRun),
        update: (ids: number[], changes: object, label: string) => runBulk(target, 'bulk_update', { ids, changes }, label),
        remove: (ids: number[], label: string) => runBulk(target, 'bulk_delete', { ids }, label),
        /** Any other bulk action of the module, e.g. `bulk_export_misp`. */
        run: (action: string, body: Record<string, unknown>, label: string) => runBulk(target, action, body, label),
    };
}

// Items of a "one per line" text, same rules as the backend (common/bulk.py): trim, ignore empty lines,
// case-insensitive duplicates.
export function countLines(text: string): number {
    return new Set(text.split(/\r?\n/).map((l) => l.trim().toLowerCase()).filter(Boolean)).size;
}
