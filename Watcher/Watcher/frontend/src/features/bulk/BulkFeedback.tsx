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
import { useBulkStore } from './useBulk';

// Global feedback of bulk actions (features/bulk/useBulk.ts), mounted once in App for every module.

const STATUS_COLOR: Record<string, 'warning' | 'error' | 'success'> = { skipped: 'warning', error: 'error' };

/** Card at the top of the screen while a bulk request is processed. */
export function BulkProgress() {
    const running = useBulkStore((s) => s.running);
    if (!running) return null;
    const { label, total } = running;
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
                        - {total} item{total === 1 ? '' : 's'}…
                    </Typography>
                )}
            </Typography>
            <LinearProgress sx={{ mt: 1, borderRadius: 1 }} />
        </Paper>
    );
}

/** Per-item summary of the last bulk action. */
export function BulkResultDialog() {
    const result = useBulkStore((s) => s.result);
    const close = useBulkStore((s) => s.clearResult);
    const okStatus = result?.ok_status || 'created';

    return (
        <Dialog open={result !== null} onClose={close} maxWidth="md" fullWidth scroll="paper" aria-labelledby="bulk-result-title">
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
                        <Table size="small" aria-label="Items">
                            <TableHead>
                                <TableRow>
                                    <TableCell>Value</TableCell>
                                    <TableCell>Status</TableCell>
                                    <TableCell>Reason</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {result.results.map((item, i) => (
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
                        <Button onClick={close}>Close</Button>
                    </DialogActions>
                </>
            )}
        </Dialog>
    );
}
