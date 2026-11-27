import { useState } from 'react';
import {
    Alert,
    Box,
    Button,
    Checkbox,
    Chip,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    IconButton,
    ListItemButton,
    ListItemText,
    Skeleton,
    Stack,
    Tooltip,
    Typography,
} from '@mui/material';
import ArrowBack from '@mui/icons-material/ArrowBack';
import Check from '@mui/icons-material/Check';
import Close from '@mui/icons-material/Close';
import TaskAltOutlined from '@mui/icons-material/TaskAltOutlined';
import { since } from '../../lib/dates';
import { ConfirmDialog } from '../../ui/ConfirmDialog';
import { EmptyState } from '../../ui/EmptyState';
import { formatDateTime } from '../timeline/format';
import { type PendingAction, usePendingActions, useResolvePendingAction, useResolvePendingActions } from './hooks';

// Metadata the dialog shows elsewhere (the comment) or that only means something to the backend.
const HIDDEN_META = new Set(['site_id', 'domain_id', 'source_id', 'comment', 'legitimacy', 'new_legitimacy']);

/** What approving does, in two words on the button: a UDRP transfer or a lost domain moves it, a failed health check is only acknowledged. */
const APPROVE_LABELS: Record<string, string> = {
    udrp_transfer: 'Approve and transfer',
    connector_health_check: 'Acknowledge',
    site_domain_available: 'Mark as available',
    legitimate_domain_lost: 'Move to monitoring',
    source_failing: 'Delete the source',
};
const approveLabel = (action: PendingAction) => APPROVE_LABELS[action.action_type] ?? 'Approve';
const metaLabel = (key: string) => key.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
const metaValue = (key: string, value: unknown) => {
    if (key.endsWith('_date') && typeof value === 'string' && !Number.isNaN(Date.parse(value))) return formatDateTime(value);
    return value === null || value === undefined || value === '' ? '-' : String(value);
};

function Details({ action }: { action: PendingAction }) {
    const meta = Object.entries(action.metadata ?? {}).filter(([k]) => !HIDDEN_META.has(k));
    const comment = typeof action.metadata?.comment === 'string' ? action.metadata.comment : '';
    return (
        <Stack spacing={2}>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
                <Chip size="small" variant="outlined" label={action.action_type_label || action.action_type} />
                <Typography variant="body2" color="text.secondary">
                    Prepared {formatDateTime(action.created_at)}
                </Typography>
            </Stack>
            <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>
                {action.description}
            </Typography>
            {meta.length > 0 && (
                <Box component="dl" sx={{ display: 'grid', gridTemplateColumns: 'max-content 1fr', columnGap: 2, rowGap: 1, m: 0 }}>
                    {meta.map(([k, v]) => (
                        <Box key={k} sx={{ display: 'contents' }}>
                            <Typography component="dt" variant="body2" color="text.secondary">
                                {metaLabel(k)}
                            </Typography>
                            <Typography component="dd" variant="body2" sx={{ m: 0, overflowWrap: 'anywhere' }}>
                                {metaValue(k, v)}
                            </Typography>
                        </Box>
                    ))}
                </Box>
            )}
            {comment && <Alert severity="info">Comment added when it is approved: {comment}</Alert>}
        </Stack>
    );
}

/** What Watcher prepared and waits for someone to approve: approve carries it out, reject drops it. */
export function PendingActionsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
    const { data: actions, isPending } = usePendingActions(open);
    const resolve = useResolvePendingAction();
    const resolveMany = useResolvePendingActions();
    const [selectedId, setSelectedId] = useState<number | null>(null);
    const selected = actions?.find((a) => a.id === selectedId) ?? null;
    const decide = (action: PendingAction, decision: 'approve' | 'reject') => resolve.mutate({ action, decision }, { onSuccess: () => setSelectedId(null) });

    // Several at once: the ones ticked in the list, decided in one request after a confirmation
    const [ticked, setTicked] = useState<Set<number>>(new Set());
    const [confirming, setConfirming] = useState<'approve' | 'reject' | null>(null);
    const rows = actions ?? [];
    const chosen = rows.filter((a) => ticked.has(a.id));
    const allTicked = rows.length > 0 && chosen.length === rows.length;
    const toggle = (id: number) =>
        setTicked((current) => {
            const next = new Set(current);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    const kinds = new Set(chosen.map((a) => a.action_type));
    const manyLabel = kinds.size === 1 ? approveLabel(chosen[0]) : 'Approve';
    const allLost = kinds.size === 1 && chosen[0]?.action_type === 'legitimate_domain_lost';
    const count = chosen.length;
    // What the confirmation says: the domains by name for lost domains, the titles of the actions otherwise
    const named = chosen.map((a) => (allLost ? String(a.metadata?.domain_name ?? a.title) : a.title));
    const nameList = `${named.slice(0, 3).join(', ')}${count > 3 ? ` and ${count - 3} more` : ''}`;
    const confirmation = {
        approve: {
            title: allLost ? `Move ${count} domain${count === 1 ? '' : 's'} to Website Monitoring?` : `${manyLabel} ${count} action${count === 1 ? '' : 's'}?`,
            text: allLost
                ? `${nameList} leave${count === 1 ? 's' : ''} Legitimate Domains and go${count === 1 ? 'es' : ''} under watch in Website Monitoring.`
                : `Each one is carried out now: ${nameList}.`,
        },
        reject: {
            title: `Reject ${count} action${count === 1 ? '' : 's'}?`,
            text: allLost ? `${nameList} stay${count === 1 ? 's' : ''} in Legitimate Domains and will not be proposed again.` : 'They are dropped, nothing is done.',
        },
    };
    const decideMany = () => {
        if (!confirming) return;
        resolveMany.mutate({ ids: chosen.map((a) => a.id), decision: confirming }, { onSettled: () => { setConfirming(null); setTicked(new Set()); } });
    };

    return (
        <Dialog open={open} onClose={onClose} fullWidth maxWidth="md" aria-labelledby="pending-actions-title">
            <DialogTitle id="pending-actions-title" sx={{ display: 'flex', alignItems: 'center', gap: 1, pr: 6 }}>
                {selected && (
                    <IconButton size="small" aria-label="Back to the list" onClick={() => setSelectedId(null)}>
                        <ArrowBack fontSize="small" />
                    </IconButton>
                )}
                <Box component="span" sx={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {selected ? selected.title : 'Pending actions'}
                </Box>
                <IconButton aria-label="Close" onClick={onClose} sx={{ position: 'absolute', right: 12, top: 12 }}>
                    <Close fontSize="small" />
                </IconButton>
            </DialogTitle>
            <DialogContent dividers sx={{ minHeight: 200 }}>
                {selected ? (
                    <Details action={selected} />
                ) : isPending ? (
                    <Stack spacing={1}>
                        <Skeleton height={56} />
                        <Skeleton height={56} />
                    </Stack>
                ) : !actions?.length ? (
                    <EmptyState icon={<TaskAltOutlined />} title="Nothing waiting for approval">
                        Watcher asks here before it does something that cannot be undone, like moving a domain after a UDRP decision.
                    </EmptyState>
                ) : (
                    <>
                    <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap', minHeight: 40, mb: 0.5 }}>
                        <Checkbox
                            size="small"
                            checked={allTicked}
                            indeterminate={chosen.length > 0 && !allTicked}
                            onChange={() => setTicked(allTicked ? new Set() : new Set(rows.map((a) => a.id)))}
                            slotProps={{ input: { 'aria-label': 'Select all the actions' } }}
                        />
                        <Typography variant="body2" color="text.secondary" sx={{ flexGrow: 1 }} data-testid="pending-selection">
                            {chosen.length ? `${chosen.length} selected of ${rows.length}` : `${rows.length} waiting`}
                        </Typography>
                        {chosen.length > 0 && (
                            <>
                                <Button size="small" color="error" variant="outlined" disabled={resolveMany.isPending} onClick={() => setConfirming('reject')}>
                                    Reject {chosen.length}
                                </Button>
                                <Button size="small" color="success" variant="contained" disabled={resolveMany.isPending} onClick={() => setConfirming('approve')}>
                                    {manyLabel} {chosen.length}
                                </Button>
                            </>
                        )}
                    </Stack>
                    <Box component="ul" data-testid="pending-actions" sx={{ listStyle: 'none', m: 0, p: 0 }}>
                        {actions.map((a) => (
                            <Box component="li" key={a.id} data-testid="pending-action" sx={{ display: 'flex', alignItems: 'center', gap: 1, '& + &': { mt: 0.5 } }}>
                                <Checkbox size="small" checked={ticked.has(a.id)} onChange={() => toggle(a.id)} slotProps={{ input: { 'aria-label': `Select: ${a.title}` } }} />
                                {/* Opens the details; the two buttons on the right decide without opening them */}
                                <ListItemButton onClick={() => setSelectedId(a.id)} sx={{ borderRadius: 1.5, minWidth: 0 }}>
                                    <ListItemText primary={a.title} secondary={`${a.action_type_label || a.action_type} - ${since(a.created_at)}`} slotProps={{ primary: { noWrap: true }, secondary: { noWrap: true } }} />
                                </ListItemButton>
                                <Tooltip title="Reject: drop it, nothing is done">
                                    <span>
                                        <IconButton aria-label={`Reject: ${a.title}`} color="error" size="small" disabled={resolve.isPending} onClick={() => decide(a, 'reject')}>
                                            <Close fontSize="small" />
                                        </IconButton>
                                    </span>
                                </Tooltip>
                                <Button
                                    size="small"
                                    variant="contained"
                                    color="success"
                                    startIcon={<Check fontSize="small" />}
                                    disabled={resolve.isPending}
                                    onClick={() => decide(a, 'approve')}
                                    aria-label={`${approveLabel(a)}: ${a.title}`}
                                    sx={{ flexShrink: 0, whiteSpace: 'nowrap' }}
                                >
                                    {approveLabel(a)}
                                </Button>
                            </Box>
                        ))}
                    </Box>
                    </>
                )}
            </DialogContent>
            <ConfirmDialog
                open={confirming !== null}
                title={confirming ? confirmation[confirming].title : ''}
                confirmLabel={confirming === 'approve' ? `${manyLabel} ${chosen.length}` : `Reject ${chosen.length}`}
                danger={confirming === 'reject'}
                pending={resolveMany.isPending}
                onClose={() => setConfirming(null)}
                onConfirm={decideMany}
            >
                {confirming ? confirmation[confirming].text : ''}
            </ConfirmDialog>
            {selected && (
                <DialogActions>
                    <Button color="error" disabled={resolve.isPending} onClick={() => decide(selected, 'reject')}>
                        Reject
                    </Button>
                    <Button variant="contained" color="success" disabled={resolve.isPending} onClick={() => decide(selected, 'approve')}>
                        {approveLabel(selected)}
                    </Button>
                </DialogActions>
            )}
        </Dialog>
    );
}
