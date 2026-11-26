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

/** What it takes to take back an "add several": the module and the items that were created. */
export interface BulkUndo {
    target: BulkTarget;
    ids: number[];
}

interface BulkState {
    /** The bulk request being processed; `done` counts the items already sent when it goes by batches. */
    running: { label: string; total: number; done?: number; cancellable?: boolean } | null;
    /** Summary of the last bulk action, until it is closed; `undo` is there when it created items that can be removed. */
    result: (BulkSummary & { label: string; undo?: BulkUndo }) | null;
    /** The person asked to stop a list that goes by batches: it stops after the batch in progress. */
    cancelRequested: boolean;
    requestCancel: () => void;
    clearResult: () => void;
}

export const useBulkStore = create<BulkState>((set) => ({
    running: null,
    result: null,
    cancelRequested: false,
    requestCancel: () => set({ cancelRequested: true }),
    clearResult: () => set({ result: null }),
}));

// How many items a request carries: the selected rows, or the non-empty lines of the "one per line" text.
const countItems = (body: { ids?: unknown[]; values?: unknown }) =>
    Array.isArray(body.ids) ? body.ids.length : String(body.values ?? '').split(/\r?\n/).filter((v) => v.trim()).length;

/**
 * Items a request carries at most: the server refuses more (BULK_CREATE_MAX_ITEMS, 200 by default). A longer list is sent
 * in batches of this size, one after the other.
 */
export const BULK_CHUNK = 200;

/** What a form says under a list longer than one batch: how many requests it takes. */
export const batchNote = (count: number) => (count > BULK_CHUNK ? ` Sent in ${Math.ceil(count / BULK_CHUNK)} batches of ${BULK_CHUNK}.` : '');

/** The way back of an "add several": the items it really created (not the ones that already existed, nor a preview). */
function undoOf(target: BulkTarget, summary: BulkSummary): BulkUndo | undefined {
    if (summary.dry_run) return undefined;
    const ids = summary.results.filter((r) => r.status === (summary.ok_status ?? 'created') && r.id !== null).map((r) => r.id as number);
    return ids.length > 0 ? { target, ids } : undefined;
}

const addUp = (merged: BulkSummary, data: BulkSummary) => {
    merged.succeeded += data.succeeded;
    merged.skipped += data.skipped;
    merged.errors += data.errors;
    merged.ok_status = data.ok_status ?? merged.ok_status;
    merged.results.push(...data.results);
};

/**
 * A long "one per line" list sent batch after batch, the summaries added up. It stops at the first batch that fails, or after
 * the batch in progress when the person cancels; what the earlier batches did is kept and shown.
 */
async function runBulkInBatches(target: BulkTarget, lines: string[], shared: object, label: string, dryRun: boolean): Promise<BulkSummary | undefined> {
    const merged: BulkSummary = { succeeded: 0, skipped: 0, errors: 0, dry_run: dryRun, ok_status: 'created', results: [] };
    useBulkStore.setState({ running: { label, total: lines.length, done: 0, cancellable: true }, cancelRequested: false });
    let sent = 0;
    try {
        for (let start = 0; start < lines.length; start += BULK_CHUNK) {
            if (useBulkStore.getState().cancelRequested) break;
            const batch = lines.slice(start, start + BULK_CHUNK);
            const { data } = await api.post<BulkSummary>(`${target.endpoint}bulk_create/`, { values: batch.join('\n'), shared, dry_run: dryRun });
            addUp(merged, data);
            sent = start + batch.length;
            useBulkStore.setState({ running: { label, total: lines.length, done: sent, cancellable: true } });
        }
        const cancelled = sent < lines.length;
        useBulkStore.setState({
            running: null,
            cancelRequested: false,
            result: { label: cancelled ? `${label} (cancelled at ${sent} of ${lines.length})` : label, ...merged, undo: undoOf(target, merged) },
        });
        if (!dryRun && sent > 0) await target.refresh();
        return merged;
    } catch (err) {
        // What the earlier batches did is kept and shown: the person knows where the import stopped.
        const partial = merged.results.length > 0;
        useBulkStore.setState({
            running: null,
            cancelRequested: false,
            result: partial ? { label: `${label} (stopped at ${sent} of ${lines.length})`, ...merged, undo: undoOf(target, merged) } : null,
        });
        if (partial && !dryRun) await target.refresh();
        notifyError(err);
        return partial ? merged : undefined;
    }
}

async function runBulk(target: BulkTarget, action: string, body: Record<string, unknown>, label: string, dryRun = false): Promise<BulkSummary | undefined> {
    useBulkStore.setState({ running: { label, total: countItems(body) } });
    try {
        const { data } = await api.post<BulkSummary>(`${target.endpoint}${action}/`, body);
        useBulkStore.setState({ running: null, result: { label, ...data, undo: action === 'bulk_create' ? undoOf(target, data) : undefined } });
        if (!dryRun) await target.refresh();
        return data;
    } catch (err) {
        useBulkStore.setState({ running: null });
        notifyError(err);
        return undefined;
    }
}

/**
 * Takes back an "add several": removes the items it created, batch after batch (the server takes 200 per request). The summary
 * of the removal replaces the one of the import; if it fails at once, the import summary stays.
 */
export async function undoBulkCreate({ target, ids }: BulkUndo, label: string): Promise<void> {
    const name = `Undo: ${label}`;
    const previous = useBulkStore.getState().result;
    const merged: BulkSummary = { succeeded: 0, skipped: 0, errors: 0, ok_status: 'deleted', results: [] };
    useBulkStore.setState({ result: null, running: { label: name, total: ids.length, done: 0 } });
    try {
        for (let start = 0; start < ids.length; start += BULK_CHUNK) {
            const batch = ids.slice(start, start + BULK_CHUNK);
            const { data } = await api.post<BulkSummary>(`${target.endpoint}bulk_delete/`, { ids: batch });
            addUp(merged, data);
            useBulkStore.setState({ running: { label: name, total: ids.length, done: start + batch.length } });
        }
        useBulkStore.setState({ running: null, result: { label: name, ...merged } });
    } catch (err) {
        const partial = merged.results.length > 0;
        useBulkStore.setState({ running: null, result: partial ? { label: `${name} (stopped)`, ...merged } : previous });
        notifyError(err);
    }
    await target.refresh();
}

export function useBulk(target: BulkTarget) {
    return {
        /** "One item per line" create; `shared` fields apply to every item. `dryRun` only previews. */
        create: (values: string, shared: object, label: string, dryRun = false) => {
            const name = dryRun ? `${label} (preview)` : label;
            const lines = values.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
            // Up to one batch the text goes as it is; a longer list is cut into batches.
            return lines.length > BULK_CHUNK
                ? runBulkInBatches(target, lines, shared, name, dryRun)
                : runBulk(target, 'bulk_create', { values, shared, dry_run: dryRun }, name, dryRun);
        },
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
