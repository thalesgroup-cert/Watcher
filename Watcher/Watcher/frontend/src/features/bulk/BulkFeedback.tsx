import { useState } from 'react';
import {
    Button,
    Chip,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    LinearProgress,
    Paper,
    Stack,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableRow,
    Typography,
} from '@mui/material';
import { undoBulkCreate, useBulkStore } from './useBulk';

// Global feedback of bulk actions (features/bulk/useBulk.ts), mounted once in App for every module.

const STATUS_COLOR: Record<string, 'warning' | 'error' | 'success'> = { skipped: 'warning', error: 'error' };
/** A summary longer than this lists only the skipped items and the errors at first. */
const LONG_RESULT = 100;

/** Card at the top of the screen while a bulk request is processed. */
export function BulkProgress() {
    const running = useBulkStore((s) => s.running);
    const cancelRequested = useBulkStore((s) => s.cancelRequested);
    const requestCancel = useBulkStore((s) => s.requestCancel);
    if (!running) return null;
    const { label, total, done, cancellable } = running;
    return (
        <Paper
            elevation={6}
            role="status"
            aria-live="polite"
            sx={{ position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)', zIndex: (t) => t.zIndex.snackbar, minWidth: 320, px: 2, py: 1.5 }}
        >
            <Typography variant="body2">
                {label || 'Bulk action'}
                {total > 0 && (
                    <Typography component="span" variant="body2" color="text.secondary">
                        {' '}
                        - {done !== undefined ? `${done} of ${total}` : total} item{total === 1 ? '' : 's'}…
                    </Typography>
                )}
            </Typography>
            <LinearProgress
                sx={{ mt: 1, borderRadius: 1 }}
                {...(done !== undefined && total > 0 ? { variant: 'determinate' as const, value: Math.round((done / total) * 100) } : {})}
            />
            {cancellable && (
                <Stack direction="row" spacing={1} sx={{ mt: 1, alignItems: 'center', justifyContent: 'space-between' }}>
                    <Typography variant="caption" color="text.secondary">
                        {cancelRequested ? 'Stopping after this batch…' : 'What is done stays; you can undo it afterwards.'}
                    </Typography>
                    <Button size="small" color="inherit" disabled={cancelRequested} onClick={requestCancel} data-testid="bulk-cancel">
                        Cancel
                    </Button>
                </Stack>
            )}
        </Paper>
    );
}

/** Per-item summary of the last bulk action. */
export function BulkResultDialog() {
    const result = useBulkStore((s) => s.result);
    const close = useBulkStore((s) => s.clearResult);
    const okStatus = result?.ok_status || 'created';
    const [showAll, setShowAll] = useState(false);
    // Undoing removes what the import created: asked twice, so that it is never a slip of the mouse
    const [confirmingUndo, setConfirmingUndo] = useState(false);
    // A long list shows what needs a look (skipped, errors) first; the rest is one click away.
    const long = (result?.results.length ?? 0) > LONG_RESULT;
    const rows = result ? (long && !showAll ? result.results.filter((item) => item.status !== okStatus) : result.results) : [];
    const finish = () => {
        setShowAll(false);
        setConfirmingUndo(false);
        close();
    };
    const undo = result?.undo;

    return (
        <Dialog open={result !== null} onClose={finish} maxWidth="md" fullWidth scroll="paper" aria-labelledby="bulk-result-title">
            {result && (
                <>
                    <DialogTitle id="bulk-result-title">{result.label || 'Bulk action'} - summary</DialogTitle>
                    <DialogContent dividers>
                        {result.dry_run && (
                            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                                Preview only: nothing has been saved yet.
                            </Typography>
                        )}
                        <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
                            <Chip color="success" label={`${result.succeeded} ${result.dry_run ? `would be ${okStatus}` : okStatus}`} />
                            <Chip color="warning" label={`${result.skipped} skipped`} />
                            <Chip color="error" label={`${result.errors} error${result.errors === 1 ? '' : 's'}`} />
                        </Stack>
                        {long && (
                            <Stack direction="row" spacing={1.5} sx={{ mb: 1.5, alignItems: 'center' }}>
                                <Typography variant="body2" color="text.secondary" data-testid="bulk-result-hidden">
                                    {showAll ? `All ${result.results.length} items are listed.` : `Only the skipped and the errors are listed (${result.results.length - rows.length} others hidden).`}
                                </Typography>
                                <Button size="small" onClick={() => setShowAll((v) => !v)}>
                                    {showAll ? 'Show only what needs a look' : 'Show all'}
                                </Button>
                            </Stack>
                        )}
                        <Table size="small" aria-label="Items">
                            <TableHead>
                                <TableRow>
                                    <TableCell>Value</TableCell>
                                    <TableCell>Status</TableCell>
                                    <TableCell>Reason</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {rows.map((item, i) => (
                                    <TableRow key={`${item.value}-${i}`}>
                                        <TableCell sx={{ overflowWrap: 'anywhere' }}>{item.value}</TableCell>
                                        <TableCell>
                                            <Chip size="small" variant="outlined" color={STATUS_COLOR[item.status] ?? 'success'} label={item.status} />
                                        </TableCell>
                                        <TableCell>{item.reason}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </DialogContent>
                    <DialogActions>
                        {undo && !confirmingUndo && (
                            <Button color="inherit" sx={{ mr: 'auto' }} onClick={() => setConfirmingUndo(true)} data-testid="bulk-undo">
                                Undo this import
                            </Button>
                        )}
                        {undo && confirmingUndo && (
                            <>
                                <Typography variant="body2" color="text.secondary" sx={{ mr: 'auto', pl: 1 }} data-testid="bulk-undo-confirm-text">
                                    This removes the {undo.ids.length} item{undo.ids.length === 1 ? '' : 's'} this import created.
                                </Typography>
                                <Button color="inherit" onClick={() => setConfirmingUndo(false)}>
                                    Keep them
                                </Button>
                                <Button
                                    color="error"
                                    variant="contained"
                                    data-testid="bulk-undo-confirm"
                                    onClick={() => {
                                        setConfirmingUndo(false);
                                        setShowAll(false);
                                        void undoBulkCreate(undo, result.label);
                                    }}
                                >
                                    Remove {undo.ids.length} item{undo.ids.length === 1 ? '' : 's'}
                                </Button>
                            </>
                        )}
                        {!confirmingUndo && <Button onClick={finish}>Close</Button>}
                    </DialogActions>
                </>
            )}
        </Dialog>
    );
}
