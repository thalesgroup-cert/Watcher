import type { ReactNode } from 'react';
import { Alert as MuiAlert, Box, Button, Chip, Divider, IconButton, Skeleton, Stack, Tooltip, Typography } from '@mui/material';
import ArchiveOutlined from '@mui/icons-material/ArchiveOutlined';
import ChevronLeft from '@mui/icons-material/ChevronLeft';
import ChevronRight from '@mui/icons-material/ChevronRight';
import Close from '@mui/icons-material/Close';
import LanguageOutlined from '@mui/icons-material/LanguageOutlined';
import UnarchiveOutlined from '@mui/icons-material/UnarchiveOutlined';
import { getErrorMessage } from '../../../api/client';
import { fonts } from '../../../styles/theme';
import { CopyValue } from '../../../ui/CopyValue';
import { SideDrawer } from '../../../ui/SideDrawer';
import { formatDay } from '../../legitimateDomains/expiry';
import { ObjectHistory } from '../../timeline/components/ObjectHistory';
import { dateAgo } from '../../timeline/format';
import { changeKinds, mxList } from '../catalog';
import { CHANGE_TYPE, useChange } from '../hooks';
import type { SiteChange } from '../types';
import { LegitimacyChip } from './tables';

const list = (v: string[] | string | null) => (mxList(v).length ? mxList(v).join(', ') : null);
const day = (v: string | null) => (v ? formatDay(v) : null);

/** Before / after of every field the change carries. */
function rowsOf(c: SiteChange): [string, string | null, string | null][] {
    return (
        [
            ['IP address', c.old_ip, c.new_ip],
            ['Second IP address', c.old_ip_second, c.new_ip_second],
            ['Mail servers (MX)', list(c.old_MX_records), list(c.new_MX_records)],
            ['Mail server IP', c.old_mail_A_record_ip, c.new_mail_A_record_ip],
            ['Registrar', c.old_registrar, c.new_registrar],
            ['Domain expiry', day(c.old_expiry_date), day(c.new_expiry_date)],
            ['Certificate expiry', day(c.old_ssl_expiry), day(c.new_ssl_expiry)],
            ['Server', c.old_server_banner, c.new_server_banner],
            ['X-Powered-By', c.old_x_powered_by, c.new_x_powered_by],
        ] as [string, string | null, string | null][]
    ).filter(([, before, after]) => before || after);
}

function Section({ title, children }: { title: string; children: ReactNode }) {
    return (
        <Box component="section" sx={{ px: 2.5, py: 2 }}>
            <Typography variant="overline" color="text.secondary" component="h3" sx={{ display: 'block', mb: 1 }}>
                {title}
            </Typography>
            {children}
        </Box>
    );
}

interface ChangeDrawerProps {
    open: boolean;
    id: number | null;
    initial?: SiteChange;
    onClose: () => void;
    previous?: SiteChange;
    next?: SiteChange;
    onNavigate: (change: SiteChange) => void;
    /** Omitted when the user cannot change alerts. */
    onSetStatus?: (change: SiteChange, status: boolean) => void;
    pending: boolean;
    onOpenSite: (change: SiteChange) => void;
}

/** One detected change of a website: what moved from what to what, and who archived it. */
export function ChangeDrawer({ open, id, initial, onClose, previous, next, onNavigate, onSetStatus, pending, onOpenSite }: ChangeDrawerProps) {
    const { data: change, error } = useChange(id, initial);
    const rows = change ? rowsOf(change) : [];

    return (
        <SideDrawer open={open} onClose={onClose} labelledBy="change-drawer-title" width={560}>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center', px: 2.5, py: 2 }}>
                <Box sx={{ minWidth: 0, flexGrow: 1 }}>
                    <Typography variant="overline" color="text.secondary" sx={{ lineHeight: 1.4, display: 'block' }}>
                        Change {change && `#${change.id}`}
                    </Typography>
                    <CopyValue value={change?.site.domain_name} label="Domain">
                        <Typography id="change-drawer-title" variant="h3" component="h2" noWrap>
                            {change?.site.domain_name ?? <Skeleton width={200} />}
                        </Typography>
                    </CopyValue>
                </Box>
                <Tooltip title="Previous change">
                    <span>
                        <IconButton aria-label="Previous change" disabled={!previous} onClick={() => previous && onNavigate(previous)}>
                            <ChevronLeft />
                        </IconButton>
                    </span>
                </Tooltip>
                <Tooltip title="Next change">
                    <span>
                        <IconButton aria-label="Next change" disabled={!next} onClick={() => next && onNavigate(next)}>
                            <ChevronRight />
                        </IconButton>
                    </span>
                </Tooltip>
                <IconButton aria-label="Close details" onClick={onClose} edge="end">
                    <Close />
                </IconButton>
            </Stack>
            {change && (
                <Stack direction="row" spacing={1} sx={{ px: 2.5, pb: 2, flexWrap: 'wrap', alignItems: 'center' }}>
                    <Chip size="small" color={change.status ? 'warning' : 'default'} label={change.status ? 'To review' : 'Archived'} />
                    <LegitimacyChip value={change.site.legitimacy} />
                    <Box sx={{ flexGrow: 1 }} />
                    <Button size="small" variant="outlined" startIcon={<LanguageOutlined />} onClick={() => onOpenSite(change)}>
                        Website
                    </Button>
                    {onSetStatus &&
                        (change.status ? (
                            <Button size="small" variant="contained" startIcon={<ArchiveOutlined />} disabled={pending} onClick={() => onSetStatus(change, false)}>
                                Archive
                            </Button>
                        ) : (
                            <Button size="small" variant="outlined" startIcon={<UnarchiveOutlined />} disabled={pending} onClick={() => onSetStatus(change, true)}>
                                Back to review
                            </Button>
                        ))}
                </Stack>
            )}
            <Divider />
            <Box sx={{ flexGrow: 1, overflowY: 'auto' }}>
                {error && !change ? (
                    <MuiAlert severity="error" sx={{ m: 2.5 }}>
                        {getErrorMessage(error, 'Failed to load the change.')}
                    </MuiAlert>
                ) : !change ? (
                    <Box sx={{ p: 2.5 }}>
                        <Skeleton height={80} />
                    </Box>
                ) : (
                    <>
                        <Section title="What changed">
                            <Stack direction="row" spacing={0.5} sx={{ flexWrap: 'wrap', mb: 1.5 }}>
                                {changeKinds(change).map((k) => (
                                    <Chip key={k.value} size="small" label={k.label} />
                                ))}
                            </Stack>
                            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                                {change.type} - {dateAgo(change.created_at)}
                            </Typography>
                            {rows.length > 0 && (
                                <Box
                                    data-testid="change-diff"
                                    sx={{
                                        display: 'grid',
                                        gridTemplateColumns: 'max-content minmax(0, 1fr) auto minmax(0, 1fr)',
                                        columnGap: 1.25,
                                        rowGap: 0.75,
                                        alignItems: 'baseline',
                                        p: 1.25,
                                        borderRadius: 1.5,
                                        bgcolor: 'action.hover',
                                    }}
                                >
                                    {rows.map(([label, before, after]) => (
                                        <Box key={label} sx={{ display: 'contents' }}>
                                            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                                                {label}
                                            </Typography>
                                            <Typography variant="body2" sx={{ fontFamily: fonts.mono, fontSize: 12, color: 'error.main', overflowWrap: 'anywhere' }}>
                                                {before ? <CopyValue value={String(before)} label={label}>{before}</CopyValue> : '-'}
                                            </Typography>
                                            <Typography variant="caption" color="text.disabled" sx={{ alignSelf: 'center' }}>
                                                to
                                            </Typography>
                                            <Typography variant="body2" sx={{ fontFamily: fonts.mono, fontSize: 12, color: 'success.main', overflowWrap: 'anywhere' }}>
                                                {after ? <CopyValue value={String(after)} label={label}>{after}</CopyValue> : '-'}
                                            </Typography>
                                        </Box>
                                    ))}
                                </Box>
                            )}
                            {change.difference_score !== null && (
                                <Typography variant="body2" sx={{ mt: 1.5 }}>
                                    Web content difference score: <strong>{change.difference_score}</strong>{' '}
                                    <Typography component="span" variant="body2" color="text.secondary">
                                        (TLSH distance to the previous page: 0 is identical, the higher the more it changed)
                                    </Typography>
                                </Typography>
                            )}
                        </Section>
                        <Divider />
                        <Section title="History">
                            <ObjectHistory targets={[{ contentType: CHANGE_TYPE, objectId: change.id }]} enabled={open} />
                        </Section>
                    </>
                )}
            </Box>
        </SideDrawer>
    );
}
