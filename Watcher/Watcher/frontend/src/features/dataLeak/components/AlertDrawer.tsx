import type { ReactNode } from 'react';
import { Alert as MuiAlert, Box, Button, Chip, Divider, IconButton, Skeleton, Stack, Tooltip, Typography } from '@mui/material';
import ArchiveOutlined from '@mui/icons-material/ArchiveOutlined';
import ChevronLeft from '@mui/icons-material/ChevronLeft';
import ChevronRight from '@mui/icons-material/ChevronRight';
import Close from '@mui/icons-material/Close';
import ContentCopy from '@mui/icons-material/ContentCopy';
import DownloadOutlined from '@mui/icons-material/DownloadOutlined';
import OpenInNew from '@mui/icons-material/OpenInNew';
import UnarchiveOutlined from '@mui/icons-material/UnarchiveOutlined';
import { getErrorMessage } from '../../../api/client';
import { notifySuccess } from '../../../lib/notify';
import { fonts } from '../../../styles/theme';
import { SideDrawer } from '../../../ui/SideDrawer';
import { ObjectHistory } from '../../timeline/components/ObjectHistory';
import { dateAgo } from '../../timeline/format';
import { downloadText, findingTitle, splitMatches } from '../format';
import { ALERTS } from '../api';
import { hasAnyPermission, selectUser, useAuthStore } from '../../auth/store';
import { ScreenshotsPanel } from '../../screenshots/ScreenshotsPanel';
import { ALERT_TYPE, useAlert } from '../hooks';
import type { Alert } from '../types';
import { Highlighted } from './Highlighted';
import { PatternChip } from './tables';

function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
    return (
        <Box component="section" sx={{ px: 2.5, py: 2 }}>
            <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                <Typography variant="overline" color="text.secondary" component="h3">
                    {title}
                </Typography>
                {action}
            </Stack>
            {children}
        </Box>
    );
}

function Content({ alert }: { alert: Alert }) {
    if (alert.content === undefined) return <Skeleton height={120} />;
    const { segments, count } = splitMatches(alert.content, alert.keyword);
    return (
        <>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                {count === 0 ? 'The pattern does not appear verbatim in the captured text.' : `${count} match${count === 1 ? '' : 'es'} highlighted.`}
            </Typography>
            <Highlighted segments={segments} label="Raw content" />
        </>
    );
}

interface AlertDrawerProps {
    open: boolean;
    /** Alert shown; kept while the drawer slides out. */
    id: number | null;
    /** Row of the list, painted while the detail loads. */
    initial?: Alert;
    onClose: () => void;
    /** Neighbours in the current page of the list, for triage without going back to the list. */
    previous?: Alert;
    next?: Alert;
    onNavigate: (alert: Alert) => void;
    /** Omitted when the user cannot change alerts. */
    onSetStatus?: (alert: Alert, status: boolean) => void;
    pending: boolean;
    onPatternClick: (alert: Alert) => void;
}

/** Everything about one finding: where, which pattern, the raw text with the matches, and who archived it. */
export function AlertDrawer({ open, id, initial, onClose, previous, next, onNavigate, onSetStatus, pending, onPatternClick }: AlertDrawerProps) {
    const { data: alert, error } = useAlert(id, initial);
    const user = useAuthStore(selectUser);
    const canTakeScreenshots = hasAnyPermission(user, 'data_leak.change_alert');

    return (
        <SideDrawer open={open} onClose={onClose} labelledBy="alert-drawer-title" width={600}>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center', px: 2.5, py: 2 }}>
                <Box sx={{ minWidth: 0, flexGrow: 1 }}>
                    <Typography variant="overline" color="text.secondary" sx={{ lineHeight: 1.4, display: 'block' }}>
                        Data leak alert {alert && `#${alert.id}`}
                    </Typography>
                    <Typography id="alert-drawer-title" variant="h3" component="h2" noWrap title={alert?.url}>
                        {alert ? findingTitle(alert.url) : <Skeleton width={220} />}
                    </Typography>
                </Box>
                <Tooltip title="Previous alert">
                    <span>
                        <IconButton aria-label="Previous alert" disabled={!previous} onClick={() => previous && onNavigate(previous)}>
                            <ChevronLeft />
                        </IconButton>
                    </span>
                </Tooltip>
                <Tooltip title="Next alert">
                    <span>
                        <IconButton aria-label="Next alert" disabled={!next} onClick={() => next && onNavigate(next)}>
                            <ChevronRight />
                        </IconButton>
                    </span>
                </Tooltip>
                <IconButton aria-label="Close details" onClick={onClose} edge="end">
                    <Close />
                </IconButton>
            </Stack>
            {alert && (
                <Stack direction="row" spacing={1} sx={{ px: 2.5, pb: 2, flexWrap: 'wrap', alignItems: 'center' }}>
                    <Chip size="small" color={alert.status ? 'warning' : 'default'} label={alert.status ? 'To review' : 'Archived'} />
                    <Box sx={{ flexGrow: 1 }} />
                    <Button size="small" variant="outlined" startIcon={<OpenInNew />} href={alert.url} target="_blank" rel="noopener noreferrer">
                        Open source
                    </Button>
                    {onSetStatus &&
                        (alert.status ? (
                            <Button
                                size="small"
                                variant="contained"
                                startIcon={<ArchiveOutlined />}
                                disabled={pending}
                                onClick={() => onSetStatus(alert, false)}
                            >
                                Archive
                            </Button>
                        ) : (
                            <Button
                                size="small"
                                variant="outlined"
                                startIcon={<UnarchiveOutlined />}
                                disabled={pending}
                                onClick={() => onSetStatus(alert, true)}
                            >
                                Back to review
                            </Button>
                        ))}
                </Stack>
            )}
            <Divider />

            <Box sx={{ flexGrow: 1, overflowY: 'auto' }}>
                {error && !alert ? (
                    <MuiAlert severity="error" sx={{ m: 2.5 }}>
                        {getErrorMessage(error, 'Failed to load the alert.')}
                    </MuiAlert>
                ) : !alert ? (
                    <Box sx={{ p: 2.5 }}>
                        <Skeleton height={80} />
                        <Skeleton width="60%" />
                    </Box>
                ) : (
                    <>
                        <Section title="Finding">
                            <Box component="dl" sx={{ display: 'grid', gridTemplateColumns: 'max-content 1fr', columnGap: 2, rowGap: 1, m: 0 }}>
                                <Typography component="dt" variant="body2" color="text.secondary">
                                    Pattern
                                </Typography>
                                <Box component="dd" sx={{ m: 0 }}>
                                    <PatternChip pattern={alert.keyword} onClick={() => onPatternClick(alert)} />
                                </Box>
                                <Typography component="dt" variant="body2" color="text.secondary">
                                    Source
                                </Typography>
                                <Typography component="dd" variant="body2" sx={{ m: 0 }}>
                                    {alert.source}
                                </Typography>
                                <Typography component="dt" variant="body2" color="text.secondary">
                                    Found
                                </Typography>
                                <Typography component="dd" variant="body2" sx={{ m: 0 }}>
                                    {dateAgo(alert.created_at)}
                                </Typography>
                                <Typography component="dt" variant="body2" color="text.secondary">
                                    URL
                                </Typography>
                                <Stack component="dd" direction="row" spacing={0.5} sx={{ m: 0, alignItems: 'flex-start', minWidth: 0 }}>
                                    <Typography variant="body2" sx={{ fontFamily: fonts.mono, fontSize: 12, overflowWrap: 'anywhere', pt: 0.5 }}>
                                        {alert.url}
                                    </Typography>
                                    <Tooltip title="Copy the URL">
                                        <IconButton
                                            size="small"
                                            aria-label="Copy the URL"
                                            onClick={() => void navigator.clipboard?.writeText(alert.url).then(() => notifySuccess('URL copied'))}
                                        >
                                            <ContentCopy fontSize="inherit" />
                                        </IconButton>
                                    </Tooltip>
                                </Stack>
                            </Box>
                        </Section>

                        {(alert.has_content || alert.content) && (
                            <Section
                                title="Captured content"
                                action={
                                    alert.content ? (
                                        <Button
                                            size="small"
                                            startIcon={<DownloadOutlined />}
                                            onClick={() => downloadText(`data-leak-${alert.id}.txt`, alert.content ?? '')}
                                        >
                                            Download
                                        </Button>
                                    ) : undefined
                                }
                            >
                                <Content alert={alert} />
                            </Section>
                        )}

                        <Divider />
                        <Section title="Screenshots">
                            <ScreenshotsPanel endpoint={`${ALERTS}${alert.id}/`} title={findingTitle(alert.url)} canTake={canTakeScreenshots} />
                        </Section>
                        <Divider />
                        <Section title="History">
                            <ObjectHistory targets={[{ contentType: ALERT_TYPE, objectId: alert.id }]} enabled={open} />
                        </Section>
                    </>
                )}
            </Box>
        </SideDrawer>
    );
}
