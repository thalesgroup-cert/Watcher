import axios from "axios";
import {returnErrors} from "./messages";
import {tokenConfig} from "./auth";
import {BULK_CREATE_RESULT, CLEAR_BULK_RESULT} from "./types";

// Result status meaning "this row no longer exists": deleted, or exported to Legitimate Domains (which deletes it)
const removedStatus = action => (action === "bulk_export_legitimate" ? "exported" : "deleted");

// The list reducers MERGE what the server returns into the current list, so a row deleted on the server would
// stay on screen: removed rows are dropped from the store with the same action as a single delete.
const dropRemovedRows = (dispatch, target, action, results) => {
    if (!target.removedType) return;
    results
        .filter(row => row.status === removedStatus(action) && row.id != null)
        .forEach(row => dispatch({type: target.removedType, payload: row.id}));
};

// Reload the lists and statistics of the module so that nothing needs a page refresh
const refreshAfter = (dispatch, target, action) => {
    const thunks = [...(target.refresh || []), ...((target.extraRefresh || {})[action] || [])];
    thunks.forEach(thunk => dispatch(thunk()));
    if (action === "bulk_create" && target.afterCreate) target.afterCreate(dispatch);
};

// POST <target.endpoint><action>/ and show the per-item summary returned by the backend (common/bulk.py).
const bulkPost = ({target, action, body, label, onDone, dryRun = false}) => (dispatch, getState) => {
    return axios.post(`${target.endpoint}${action}/`, body, tokenConfig(getState))
        .then(res => {
            dispatch({type: BULK_CREATE_RESULT, payload: {label, ...res.data}});
            if (!dryRun) {
                dropRemovedRows(dispatch, target, action, res.data.results || []);
                refreshAfter(dispatch, target, action);
                if (onDone) onDone(res.data);
            }
            return res.data;
        })
        .catch(err => {
            dispatch(returnErrors(err.response ? err.response.data : {error: "Bulk request failed"},
                err.response ? err.response.status : 500));
        });
};

/**
 * Generic "One item per line" create, shared by every module.
 *
 * @param target    bulk descriptor exported by the module's actions file, e.g. LEGITIMATE_DOMAIN_BULK
 * @param values    raw textarea content (one item per line)
 * @param shared    fields applied to every item
 * @param label     title of the summary modal
 * @param onDone    optional extra callback once the batch is processed (lists and statistics are reloaded for you)
 * @param dryRun    only report what would happen, nothing is written (nothing is reloaded)
 */
export const bulkCreate = ({target, values, shared = {}, label, onDone, dryRun = false}) =>
    bulkPost({
        target,
        action: "bulk_create",
        body: {values, shared, dry_run: dryRun},
        label: dryRun ? `${label} (preview)` : label,
        onDone,
        dryRun,
    });

// Change the same fields on every selected row.
export const bulkUpdate = ({target, ids, changes, label, onDone}) =>
    bulkPost({target, action: "bulk_update", body: {ids, changes}, label, onDone});

// Delete every selected row.
export const bulkDelete = ({target, ids, label, onDone}) =>
    bulkPost({target, action: "bulk_delete", body: {ids}, label, onDone});

// Any other bulk action of a module (e.g. "bulk_export_misp"), with its own body.
export const bulkRun = ({target, action, body, label, onDone}) =>
    bulkPost({target, action, body, label, onDone});

export const clearBulkResult = () => ({type: CLEAR_BULK_RESULT});
