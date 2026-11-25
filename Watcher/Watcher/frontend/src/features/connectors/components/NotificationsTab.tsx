import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Box, Button, Chip, CircularProgress, InputAdornment, Link, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Tooltip, Typography } from '@mui/material';
import CheckRounded from '@mui/icons-material/CheckRounded';
import ChevronRightRounded from '@mui/icons-material/ChevronRightRounded';
import ExpandMoreRounded from '@mui/icons-material/ExpandMoreRounded';
import SearchRounded from '@mui/icons-material/SearchRounded';
import WarningAmberOutlined from '@mui/icons-material/WarningAmberOutlined';
import { getErrorMessage } from '../../../api/client';
import { useUrlParams } from '../../../lib/useUrlParams';
import { useNotifications, useUpdateNotification } from '../hooks';
import { CHANNELS, CHANNEL_LABELS, MODULES, connectorProblem } from '../notifications';
import type { NotificationChannel, NotificationChannelSetting, NotificationType } from '../types';
import { NotificationDrawer } from './NotificationDrawer';

/** One channel of one notification: a pill that says at a glance whether it is sent (green) or not (outlined), and switches on click. */
function ChannelPill({ typeLabel, channel, setting, pending, onToggle }: { typeLabel: string; channel: NotificationChannel; setting: NotificationChannelSetting; pending: boolean; onToggle: (enabled: boolean) => void }) {
    const problem = setting.enabled ? connectorProblem(channel, setting) : null;
    const pill = (
        <Chip
            size="small"
            role="switch"
            aria-checked={setting.enabled}
            aria-label={`${typeLabel} on ${CHANNEL_LABELS[channel]}`}
            clickable
            disabled={pending}
            onClick={() => onToggle(!setting.enabled)}
            icon={problem ? <WarningAmberOutlined /> : setting.enabled ? <CheckRounded /> : undefined}
            label={setting.enabled ? 'On' : 'Off'}
            variant={setting.enabled ? 'filled' : 'outlined'}
            color={problem ? 'warning' : setting.enabled ? 'success' : 'default'}
            sx={{ minWidth: 66, fontWeight: setting.enabled ? 700 : 500, color: setting.enabled ? undefined : 'text.disabled' }}
        />
    );
    // The reason is in the label of the pill for a screen reader, and in a tooltip for the eye
    return problem ? (
        <Tooltip title={problem}>
            <span aria-label={problem}>{pill}</span>
        </Tooltip>
    ) : (
        pill
    );
}

function TypeRow({ type, selected, pending, onOpen, onToggle }: { type: NotificationType; selected: boolean; pending: boolean; onOpen: () => void; onToggle: (channel: NotificationChannel, enabled: boolean) => void }) {
    const none = !CHANNELS.some((c) => type.channels[c]?.enabled);
    return (
        <TableRow hover selected={selected} onClick={onOpen} sx={{ cursor: 'pointer' }}>
            <TableCell>
                <Link component="button" type="button" underline="hover" color={none ? 'text.secondary' : 'inherit'} onClick={onOpen} sx={{ textAlign: 'left', fontWeight: 600 }}>
                    {type.label}
                </Link>
            </TableCell>
            {CHANNELS.map((channel) => {
                const setting = type.channels[channel];
                return (
                    <TableCell key={channel} align="center" onClick={(e) => e.stopPropagation()}>
                        {setting ? (
                            <ChannelPill typeLabel={type.label} channel={channel} setting={setting} pending={pending} onToggle={(enabled) => onToggle(channel, enabled)} />
                        ) : (
                            <Typography variant="body2" color="text.disabled" aria-label="No such message">
                                -
                            </Typography>
                        )}
                    </TableCell>
                );
            })}
        </TableRow>
    );
}

/** The state of a channel's connector, read from any notification that uses it: the dot of the column header. */
function channelState(types: NotificationType[], channel: NotificationChannel): { color: 'success' | 'warning' | 'error'; text: string } {
    const setting = types.map((t) => t.channels[channel]).find(Boolean);
    if (!setting) return { color: 'warning', text: `${CHANNEL_LABELS[channel]}: no notification uses it.` };
    const problem = connectorProblem(channel, setting);
    if (!problem) return { color: 'success', text: `${CHANNEL_LABELS[channel]} is connected.` };
    return { color: setting.connector.health === 'unhealthy' ? 'error' : 'warning', text: problem };
}

/** Which notifications Watcher sends and on which channel, for the whole instance, and what each message says. */
export function NotificationsTab() {
    const { params, update } = useUrlParams();
    const { data: types = [], isLoading, error } = useNotifications(true);
    const toggle = useUpdateNotification();
    const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

    const query = params.get('nq') ?? '';
    const activeOnly = params.get('nactive') === '1';
    const filtering = Boolean(query.trim()) || activeOnly;
    // What is typed shows at once; the address follows a moment later (a navigation per key would drop letters)
    const [draft, setDraft] = useState<string | null>(null);
    const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    useEffect(() => () => clearTimeout(timer.current), []);
    const onSearch = (value: string) => {
        setDraft(value);
        clearTimeout(timer.current);
        timer.current = setTimeout(() => {
            update({ nq: value || null });
            setDraft(null);
        }, 250);
    };

    const opened = types.find((t) => t.id === params.get('ntype'));
    const channelParam = params.get('nchannel');
    const channel =
        CHANNELS.find((c) => c === channelParam && opened?.channels[c]) ?? CHANNELS.find((c) => opened?.channels[c]) ?? null;

    const states = useMemo(() => Object.fromEntries(CHANNELS.map((c) => [c, channelState(types, c)])) as Record<NotificationChannel, ReturnType<typeof channelState>>, [types]);

    const sections = useMemo(() => {
        const needle = query.trim().toLowerCase();
        return MODULES.map((module) => {
            const all = types.filter((t) => t.module === module.id);
            const active = all.filter((t) => CHANNELS.some((c) => t.channels[c]?.enabled)).length;
            const rows = all.filter((t) => (!needle || t.label.toLowerCase().includes(needle)) && (!activeOnly || CHANNELS.some((c) => t.channels[c]?.enabled)));
            return { module, total: all.length, active, rows };
        }).filter((s) => s.total > 0 && (!filtering || s.rows.length > 0));
    }, [types, query, activeOnly, filtering]);

    if (isLoading) {
        return (
            <Box sx={{ textAlign: 'center', py: 6 }}>
                <CircularProgress />
                <Typography color="text.secondary" sx={{ mt: 1 }}>
                    Loading notifications…
                </Typography>
            </Box>
        );
    }

    const allCollapsed = sections.length > 0 && sections.every((s) => collapsed.has(s.module.id));

    return (
        <>
            {error && (
                <Alert severity="error" sx={{ mb: 2 }}>
                    {getErrorMessage(error, 'Failed to load the notifications.')}
                </Alert>
            )}
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                A green pill sends that notification on that channel for the whole instance. Click a notification to choose what its message says and to see a
                preview. Email still goes only to the users subscribed to it.
            </Typography>
            <Stack direction="row" sx={{ alignItems: 'center', gap: 1.5, flexWrap: 'wrap', mb: 1.5 }}>
                <TextField
                    size="small"
                    placeholder="Search a notification"
                    value={draft ?? query}
                    onChange={(e) => onSearch(e.target.value)}
                    slotProps={{
                        input: { startAdornment: <InputAdornment position="start"><SearchRounded fontSize="small" /></InputAdornment> },
                        htmlInput: { 'aria-label': 'Search a notification' },
                    }}
                    sx={{ minWidth: 240 }}
                />
                <Chip
                    label="Active only"
                    clickable
                    aria-pressed={activeOnly}
                    color={activeOnly ? 'primary' : 'default'}
                    variant={activeOnly ? 'filled' : 'outlined'}
                    onClick={() => update({ nactive: activeOnly ? null : '1' })}
                />
                <Box sx={{ flexGrow: 1 }} />
                {!filtering && (
                    <Button size="small" onClick={() => setCollapsed(allCollapsed ? new Set() : new Set(sections.map((s) => s.module.id)))}>
                        {allCollapsed ? 'Expand all' : 'Collapse all'}
                    </Button>
                )}
            </Stack>
            <TableContainer>
                <Table size="small" aria-label="Notifications">
                    <TableHead>
                        <TableRow>
                            <TableCell>Notification</TableCell>
                            {CHANNELS.map((c) => (
                                <TableCell key={c} align="center">
                                    <Tooltip title={states[c].text}>
                                        <Box component="span" data-testid={`channel-state-${c}`} sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75 }}>
                                            <Box component="span" aria-hidden sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: `${states[c].color}.main` }} />
                                            {CHANNEL_LABELS[c]}
                                        </Box>
                                    </Tooltip>
                                </TableCell>
                            ))}
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {sections.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={CHANNELS.length + 1} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                                    {filtering ? 'No notification matches.' : 'No notification.'}
                                </TableCell>
                            </TableRow>
                        )}
                        {sections.map(({ module, total, active, rows }) => {
                            const open = filtering || !collapsed.has(module.id);
                            return [
                                <TableRow
                                    key={module.id}
                                    hover
                                    onClick={() => !filtering && setCollapsed((prev) => { const next = new Set(prev); if (next.has(module.id)) next.delete(module.id); else next.add(module.id); return next; })}
                                    sx={{ cursor: filtering ? 'default' : 'pointer' }}
                                >
                                    <TableCell colSpan={CHANNELS.length + 1} sx={{ bgcolor: 'action.hover', fontWeight: 700 }}>
                                        <Stack direction="row" sx={{ alignItems: 'center', gap: 0.75 }}>
                                            {!filtering && (open ? <ExpandMoreRounded fontSize="small" /> : <ChevronRightRounded fontSize="small" />)}
                                            {module.label}
                                            <Typography component="span" variant="caption" color="text.secondary" data-testid={`module-count-${module.id}`} sx={{ fontWeight: 500 }}>
                                                {active}/{total} active
                                            </Typography>
                                        </Stack>
                                    </TableCell>
                                </TableRow>,
                                ...(open
                                    ? rows.map((type) => (
                                          <TypeRow
                                              key={type.id}
                                              type={type}
                                              selected={type.id === opened?.id}
                                              pending={toggle.isPending && toggle.variables?.typeId === type.id}
                                              onOpen={() => update({ ntype: type.id, nchannel: null })}
                                              onToggle={(c, enabled) => toggle.mutate({ typeId: type.id, channel: c, enabled })}
                                          />
                                      ))
                                    : []),
                            ];
                        })}
                    </TableBody>
                </Table>
            </TableContainer>
            <NotificationDrawer
                type={opened}
                channel={channel}
                onChannel={(c) => update({ nchannel: c })}
                onClose={() => update({ ntype: null, nchannel: null })}
            />
        </>
    );
}
