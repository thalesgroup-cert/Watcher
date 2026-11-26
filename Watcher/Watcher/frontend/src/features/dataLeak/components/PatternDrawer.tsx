import { Alert as MuiAlert, Box, Button, Chip, Divider, IconButton, Paper, Skeleton, Stack, Typography } from '@mui/material';
import Close from '@mui/icons-material/Close';
import DeleteOutlined from '@mui/icons-material/DeleteOutlined';
import EditOutlined from '@mui/icons-material/EditOutlined';
import ListAltOutlined from '@mui/icons-material/ListAltOutlined';
import { getErrorMessage } from '../../../api/client';
import { fonts } from '../../../styles/theme';
import { SideDrawer } from '../../../ui/SideDrawer';
import { ObjectHistory } from '../../timeline/components/ObjectHistory';
import { formatDateTime } from '../../timeline/format';
import { since } from '../../../lib/dates';
import { PATTERN_TYPE, usePattern } from '../hooks';
import type { Pattern } from '../types';

function Count({ label, value }: { label: string; value: string }) {
    return (
        <Paper variant="outlined" sx={{ p: 1.5, flex: 1, minWidth: 0 }}>
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                {label}
            </Typography>
            <Typography variant="h3" component="div" noWrap>
                {value}
            </Typography>
        </Paper>
    );
}

interface PatternDrawerProps {
    open: boolean;
    id: number | null;
    initial?: Pattern;
    onClose: () => void;
    onShowAlerts: (pattern: Pattern) => void;
    /** Omitted when the user cannot manage patterns. */
    actions?: { edit: (p: Pattern) => void; remove: (p: Pattern) => void };
}

/** One search pattern: what it found, a shortcut to its alerts, and its history. */
export function PatternDrawer({ open, id, initial, onClose, onShowAlerts, actions }: PatternDrawerProps) {
    const { data: pattern, error } = usePattern(id, initial);

    return (
        <SideDrawer open={open} onClose={onClose} labelledBy="pattern-drawer-title">
            <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', px: 2.5, py: 2 }}>
                <Box sx={{ minWidth: 0, flexGrow: 1 }}>
                    <Typography variant="overline" color="text.secondary" sx={{ lineHeight: 1.4, display: 'block' }}>
                        Search pattern
                    </Typography>
                    <Typography id="pattern-drawer-title" variant="h3" component="h2" noWrap title={pattern?.name} sx={{ fontFamily: fonts.mono }}>
                        {pattern?.name ?? <Skeleton width={200} />}
                    </Typography>
                </Box>
                <IconButton aria-label="Close details" onClick={onClose} edge="end">
                    <Close />
                </IconButton>
            </Stack>
            {pattern && (
                <Stack direction="row" spacing={1} sx={{ px: 2.5, pb: 2, flexWrap: 'wrap', alignItems: 'center' }}>
                    <Chip size="small" label={pattern.is_regex ? 'Regular expression' : 'Keyword'} />
                    <Box sx={{ flexGrow: 1 }} />
                    {actions && (
                        <>
                            <Button size="small" variant="outlined" startIcon={<EditOutlined />} onClick={() => actions.edit(pattern)}>
                                Edit
                            </Button>
                            <Button size="small" variant="outlined" color="error" startIcon={<DeleteOutlined />} onClick={() => actions.remove(pattern)}>
                                Delete
                            </Button>
                        </>
                    )}
                </Stack>
            )}
            <Divider />
            <Box sx={{ flexGrow: 1, overflowY: 'auto' }}>
                {error && !pattern ? (
                    <MuiAlert severity="error" sx={{ m: 2.5 }}>
                        {getErrorMessage(error, 'Failed to load the pattern.')}
                    </MuiAlert>
                ) : !pattern ? (
                    <Box sx={{ p: 2.5 }}>
                        <Skeleton height={80} />
                    </Box>
                ) : (
                    <>
                        <Box sx={{ px: 2.5, py: 2 }}>
                            <Stack direction="row" spacing={1.5}>
                                <Count label="To review" value={pattern.active_alerts_count.toLocaleString('en-GB')} />
                                <Count label="Alerts" value={pattern.alerts_count.toLocaleString('en-GB')} />
                                <Count label="Last alert" value={pattern.last_alert_at ? since(pattern.last_alert_at) : 'Never'} />
                            </Stack>
                            <Button sx={{ mt: 1.5 }} startIcon={<ListAltOutlined />} onClick={() => onShowAlerts(pattern)} disabled={pattern.alerts_count === 0}>
                                Show its alerts
                            </Button>
                            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                                Added {formatDateTime(pattern.created_at)}. Watcher searches for it every 5 minutes.
                            </Typography>
                        </Box>
                        <Divider />
                        <Box component="section" sx={{ px: 2.5, py: 2 }}>
                            <Typography variant="overline" color="text.secondary" component="h3" sx={{ display: 'block', mb: 1 }}>
                                History
                            </Typography>
                            <ObjectHistory targets={[{ contentType: PATTERN_TYPE, objectId: pattern.id }]} enabled={open} />
                        </Box>
                    </>
                )}
            </Box>
        </SideDrawer>
    );
}
