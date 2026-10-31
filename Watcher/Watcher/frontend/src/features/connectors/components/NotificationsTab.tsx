import { Alert, Box, CircularProgress, Link, Stack, Switch, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Tooltip, Typography } from '@mui/material';
import WarningAmberOutlined from '@mui/icons-material/WarningAmberOutlined';
import { getErrorMessage } from '../../../api/client';
import { useUrlParams } from '../../../lib/useUrlParams';
import { useNotifications, useUpdateNotification } from '../hooks';
import { CHANNELS, CHANNEL_LABELS, MODULES, connectorProblem } from '../notifications';
import type { NotificationChannel, NotificationType } from '../types';
import { NotificationDrawer } from './NotificationDrawer';

interface TypeRowProps {
    type: NotificationType;
    selected: boolean;
    pending: boolean;
    onOpen: () => void;
    onToggle: (channel: NotificationChannel, enabled: boolean) => void;
}

function TypeRow({ type, selected, pending, onOpen, onToggle }: TypeRowProps) {
    return (
        <TableRow hover selected={selected} onClick={onOpen} sx={{ cursor: 'pointer' }}>
            <TableCell>
                <Link component="button" type="button" underline="hover" color="inherit" onClick={onOpen} sx={{ textAlign: 'left', fontWeight: 600 }}>
                    {type.label}
                </Link>
            </TableCell>
            {CHANNELS.map((channel) => {
                const setting = type.channels[channel];
                const problem = setting?.enabled ? connectorProblem(channel, setting) : null;
                return (
                    <TableCell key={channel} align="center" onClick={(e) => e.stopPropagation()}>
                        {setting ? (
                            <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', justifyContent: 'center' }}>
                                <Switch
                                    size="small"
                                    checked={setting.enabled}
                                    disabled={pending}
                                    onChange={(e) => onToggle(channel, e.target.checked)}
                                    slotProps={{ input: { 'aria-label': `${type.label} on ${CHANNEL_LABELS[channel]}` } }}
                                />
                                {problem && (
                                    <Tooltip title={problem}>
                                        <WarningAmberOutlined fontSize="small" color="warning" aria-label={problem} />
                                    </Tooltip>
                                )}
                            </Stack>
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

/** Which notifications Watcher sends and on which channel, for the whole instance, and what each message says. */
export function NotificationsTab() {
    const { params, update } = useUrlParams();
    const { data: types = [], isLoading, error } = useNotifications(true);
    const toggle = useUpdateNotification();

    const opened = types.find((t) => t.id === params.get('ntype'));
    const channelParam = params.get('nchannel');
    const channel =
        CHANNELS.find((c) => c === channelParam && opened?.channels[c]) ?? CHANNELS.find((c) => opened?.channels[c]) ?? null;

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

    return (
        <>
            {error && (
                <Alert severity="error" sx={{ mb: 2 }}>
                    {getErrorMessage(error, 'Failed to load the notifications.')}
                </Alert>
            )}
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                A switch sends that notification on that channel for the whole instance. Click a notification to choose what its message says and to see a
                preview. Email still goes only to the users subscribed to it.
            </Typography>
            <TableContainer>
                <Table size="small" aria-label="Notifications">
                    <TableHead>
                        <TableRow>
                            <TableCell>Notification</TableCell>
                            {CHANNELS.map((c) => (
                                <TableCell key={c} align="center">
                                    {CHANNEL_LABELS[c]}
                                </TableCell>
                            ))}
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {MODULES.map((module) => {
                            const rows = types.filter((t) => t.module === module.id);
                            if (!rows.length) return null;
                            return [
                                <TableRow key={module.id}>
                                    <TableCell colSpan={CHANNELS.length + 1} sx={{ bgcolor: 'action.hover', fontWeight: 700 }}>
                                        {module.label}
                                    </TableCell>
                                </TableRow>,
                                ...rows.map((type) => (
                                    <TypeRow
                                        key={type.id}
                                        type={type}
                                        selected={type.id === opened?.id}
                                        pending={toggle.isPending && toggle.variables?.typeId === type.id}
                                        onOpen={() => update({ ntype: type.id, nchannel: null })}
                                        onToggle={(c, enabled) => toggle.mutate({ typeId: type.id, channel: c, enabled })}
                                    />
                                )),
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
