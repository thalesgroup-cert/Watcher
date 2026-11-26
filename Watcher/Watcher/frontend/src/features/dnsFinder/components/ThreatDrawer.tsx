import { type ReactNode, useState } from 'react';
import {
    Alert as MuiAlert,
    Box,
    Button,
    Chip,
    Divider,
    IconButton,
    ListItemText,
    Menu,
    MenuItem,
    Skeleton,
    Stack,
    ToggleButton,
    ToggleButtonGroup,
    Tooltip,
    Typography,
} from '@mui/material';
import ChevronLeft from '@mui/icons-material/ChevronLeft';
import ChevronRight from '@mui/icons-material/ChevronRight';
import Close from '@mui/icons-material/Close';
import EditOutlined from '@mui/icons-material/EditOutlined';
import IosShareOutlined from '@mui/icons-material/IosShareOutlined';
import { getErrorMessage } from '../../../api/client';
import { fonts } from '../../../styles/theme';
import { CopyValue } from '../../../ui/CopyValue';
import { SideDrawer } from '../../../ui/SideDrawer';
import { parseEventUuids } from '../../misp/MispExportDialog';
import { ObjectHistory } from '../../timeline/components/ObjectHistory';
import { dateAgo } from '../../timeline/format';
import { sourceMeta, STATUSES } from '../catalog';
import { ALERT_TYPE, TWISTED_TYPE, useThreat } from '../hooks';
import type { Threat, ThreatStatus } from '../types';

export type ExportTarget = 'misp' | 'legitimate' | 'site';

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

function Details({ rows }: { rows: [string, ReactNode][] }) {
    const shown = rows.filter(([, value]) => value !== null && value !== undefined && value !== '' && value !== false);
    return (
        <Box component="dl" sx={{ display: 'grid', gridTemplateColumns: 'max-content 1fr', columnGap: 2, rowGap: 1, m: 0 }}>
            {shown.map(([label, value]) => (
                <Box key={label} sx={{ display: 'contents' }}>
                    <Typography component="dt" variant="body2" color="text.secondary">
                        {label}
                    </Typography>
                    <Typography component="dd" variant="body2" sx={{ m: 0, minWidth: 0, overflowWrap: 'anywhere' }}>
                        {value}
                    </Typography>
                </Box>
            ))}
        </Box>
    );
}

interface ThreatDrawerProps {
    open: boolean;
    id: number | null;
    initial?: Threat;
    onClose: () => void;
    previous?: Threat;
    next?: Threat;
    onNavigate: (threat: Threat) => void;
    /** Omitted when the user cannot change alerts. */
    onSetStatus?: (threat: Threat, status: ThreatStatus) => void;
    onEdit?: (threat: Threat) => void;
    /** Export targets the user may use. */
    exports: ExportTarget[];
    onExport: (threat: Threat, target: ExportTarget) => void;
    pending: boolean;
    onAssetClick: (threat: Threat) => void;
}

/** One detected domain: what was found, why, what to do with it, and its history (alert + domain merged). */
export function ThreatDrawer({ open, id, initial, onClose, previous, next, onNavigate, onSetStatus, onEdit, exports, onExport, pending, onAssetClick }: ThreatDrawerProps) {
    const { data: threat, error } = useThreat(id, initial);
    const [menu, setMenu] = useState<HTMLElement | null>(null);
    const d = threat?.technical_details;
    const uuids = parseEventUuids(threat?.misp_event_uuid);
    const pick = (target: ExportTarget) => {
        setMenu(null);
        if (threat) onExport(threat, target);
    };

    return (
        <SideDrawer open={open} onClose={onClose} labelledBy="threat-drawer-title" width={600}>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center', px: 2.5, py: 2 }}>
                <Box sx={{ minWidth: 0, flexGrow: 1 }}>
                    <Typography variant="overline" color="text.secondary" sx={{ lineHeight: 1.4, display: 'block' }}>
                        {threat ? `${sourceMeta(threat.source).label} - #${threat.id}` : 'DNS threat'}
                    </Typography>
                    <CopyValue value={threat?.domain_name} label="Domain">
                        <Typography id="threat-drawer-title" variant="h3" component="h2" noWrap title={threat?.domain_name}>
                            {threat?.domain_name ?? <Skeleton width={220} />}
                        </Typography>
                    </CopyValue>
                </Box>
                <Tooltip title="Previous threat">
                    <span>
                        <IconButton aria-label="Previous threat" disabled={!previous} onClick={() => previous && onNavigate(previous)}>
                            <ChevronLeft />
                        </IconButton>
                    </span>
                </Tooltip>
                <Tooltip title="Next threat">
                    <span>
                        <IconButton aria-label="Next threat" disabled={!next} onClick={() => next && onNavigate(next)}>
                            <ChevronRight />
                        </IconButton>
                    </span>
                </Tooltip>
                <IconButton aria-label="Close details" onClick={onClose} edge="end">
                    <Close />
                </IconButton>
            </Stack>
            {threat && (
                <Stack spacing={1.5} sx={{ px: 2.5, pb: 2 }}>
                    <ToggleButtonGroup
                        size="small"
                        exclusive
                        value={threat.status}
                        disabled={!onSetStatus || pending}
                        onChange={(_, v: ThreatStatus | null) => v && onSetStatus?.(threat, v)}
                        aria-label="Status"
                        sx={{ flexWrap: 'wrap' }}
                    >
                        {STATUSES.map((s) => (
                            <ToggleButton key={s.value} value={s.value} sx={{ px: 1.25, fontSize: 12 }}>
                                {s.label}
                            </ToggleButton>
                        ))}
                    </ToggleButtonGroup>
                    <Stack direction="row" spacing={1}>
                        {onEdit && (
                            <Button size="small" variant="outlined" startIcon={<EditOutlined />} onClick={() => onEdit(threat)}>
                                Edit
                            </Button>
                        )}
                        {exports.length > 0 && (
                            <>
                                <Button size="small" variant="outlined" startIcon={<IosShareOutlined />} onClick={(e) => setMenu(e.currentTarget)} aria-haspopup="menu">
                                    Export
                                </Button>
                                <Menu anchorEl={menu} open={menu !== null} onClose={() => setMenu(null)}>
                                    {exports.includes('misp') && (
                                        <MenuItem onClick={() => pick('misp')}>
                                            <ListItemText primary="To MISP" secondary={uuids.length ? `Already in ${uuids.length} event${uuids.length === 1 ? '' : 's'}` : 'Share the indicator'} />
                                        </MenuItem>
                                    )}
                                    {exports.includes('site') && (
                                        <MenuItem disabled={threat.monitored} onClick={() => pick('site')}>
                                            <ListItemText primary="To Website Monitoring" secondary={threat.monitored ? 'Already monitored' : 'Watch it, then resolve the threat'} />
                                        </MenuItem>
                                    )}
                                    {exports.includes('legitimate') && (
                                        <MenuItem disabled={threat.legitimate} onClick={() => pick('legitimate')}>
                                            <ListItemText primary="To Legitimate Domains" secondary={threat.legitimate ? 'Already legitimate' : 'It is ours, then resolve the threat'} />
                                        </MenuItem>
                                    )}
                                </Menu>
                            </>
                        )}
                        {threat.monitored && <Chip size="small" variant="outlined" label="In Website Monitoring" />}
                        {threat.legitimate && <Chip size="small" variant="outlined" color="success" label="Legitimate" />}
                    </Stack>
                </Stack>
            )}
            <Divider />

            <Box sx={{ flexGrow: 1, overflowY: 'auto' }}>
                {error && !threat ? (
                    <MuiAlert severity="error" sx={{ m: 2.5 }}>
                        {getErrorMessage(error, 'Failed to load the threat.')}
                    </MuiAlert>
                ) : !threat || !d ? (
                    <Box sx={{ p: 2.5 }}>
                        <Skeleton height={80} />
                    </Box>
                ) : (
                    <>
                        <Section title="Detection">
                            <Details
                                rows={[
                                    ['Why', sourceMeta(threat.source).description],
                                    [
                                        threat.corporate_dns ? 'Monitored domain' : 'Keyword',
                                        (threat.corporate_dns || threat.corporate_keyword) && (
                                            <Chip size="small" variant="outlined" label={threat.corporate_dns ?? threat.corporate_keyword} onClick={() => onAssetClick(threat)} />
                                        ),
                                    ],
                                    ['Technique', d.fuzzer],
                                    ['Certificate issuer', d.issuer],
                                    [
                                        'Names on the certificate',
                                        d.san_list && d.san_list.length > 0 && (
                                            <CopyValue value={d.san_list.join('\n')} label="Certificate names">
                                                <Box component="span" sx={{ fontFamily: fonts.mono, fontSize: 12, whiteSpace: 'pre-line' }}>
                                                    {d.san_list.join('\n')}
                                                </Box>
                                            </CopyValue>
                                        ),
                                    ],
                                    ['Provider', d.provider],
                                    ['CNAME target', d.cname_target && <CopyValue value={d.cname_target} label="CNAME target"><Box component="span" sx={{ fontFamily: fonts.mono, fontSize: 12 }}>{d.cname_target}</Box></CopyValue>],
                                    ['HTTP status', d.http_status_code],
                                    ['Last checked', d.last_checked_at && dateAgo(d.last_checked_at)],
                                    ['Detected', dateAgo(threat.created_at)],
                                    [
                                        'MISP events',
                                        uuids.length > 0 && (
                                            <Box component="span" sx={{ fontFamily: fonts.mono, fontSize: 12, whiteSpace: 'pre-line' }}>
                                                {[...uuids].reverse().join('\n')}
                                            </Box>
                                        ),
                                    ],
                                ]}
                            />
                        </Section>
                        {threat.comments && (
                            <Section title="Comments">
                                <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', borderLeft: 3, borderColor: 'divider', pl: 1.5 }}>
                                    {threat.comments}
                                </Typography>
                            </Section>
                        )}
                        <Divider />
                        <Section title="History">
                            <ObjectHistory
                                targets={[
                                    { contentType: ALERT_TYPE, objectId: threat.id },
                                    { contentType: TWISTED_TYPE, objectId: d.dns_twisted_id },
                                ]}
                                enabled={open}
                            />
                        </Section>
                    </>
                )}
            </Box>
        </SideDrawer>
    );
}
