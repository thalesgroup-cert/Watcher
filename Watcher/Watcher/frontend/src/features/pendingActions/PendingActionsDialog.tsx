import { useState } from 'react';
import {
    Alert,
    Box,
    Button,
    Chip,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    IconButton,
    List,
    ListItemButton,
    ListItemText,
    Skeleton,
    Stack,
    Typography,
} from '@mui/material';
import ArrowBack from '@mui/icons-material/ArrowBack';
import Close from '@mui/icons-material/Close';
import TaskAltOutlined from '@mui/icons-material/TaskAltOutlined';
import { since } from '../../lib/dates';
import { EmptyState } from '../../ui/EmptyState';
import { formatDateTime } from '../timeline/format';
import { type PendingAction, usePendingActions, useResolvePendingAction } from './hooks';

// Metadata the dialog shows elsewhere (the comment) or that only means something to the backend.
const HIDDEN_META = new Set(['site_id', 'comment']);
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
    const [selectedId, setSelectedId] = useState<number | null>(null);
    const selected = actions?.find((a) => a.id === selectedId) ?? null;
    const decide = (action: PendingAction, decision: 'approve' | 'reject') => resolve.mutate({ action, decision }, { onSuccess: () => setSelectedId(null) });

    return (
        <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm" aria-labelledby="pending-actions-title">
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
                    <List disablePadding data-testid="pending-actions">
                        {actions.map((a) => (
                            <ListItemButton key={a.id} onClick={() => setSelectedId(a.id)} sx={{ borderRadius: 1.5 }}>
                                <ListItemText primary={a.title} secondary={`${a.action_type_label || a.action_type} - ${since(a.created_at)}`} />
                            </ListItemButton>
                        ))}
                    </List>
                )}
            </DialogContent>
            {selected && (
                <DialogActions>
                    <Button color="error" disabled={resolve.isPending} onClick={() => decide(selected, 'reject')}>
                        Reject
                    </Button>
                    <Button variant="contained" color="success" disabled={resolve.isPending} onClick={() => decide(selected, 'approve')}>
                        Approve and carry out
                    </Button>
                </DialogActions>
            )}
        </Dialog>
    );
}
