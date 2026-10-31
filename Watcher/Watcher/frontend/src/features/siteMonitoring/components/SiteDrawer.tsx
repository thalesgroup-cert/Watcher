import { type ReactNode, useState } from 'react';
import {
    Alert as MuiAlert,
    Box,
    Button,
    ButtonBase,
    Chip,
    Divider,
    IconButton,
    ListItemText,
    Menu,
    MenuItem,
    Skeleton,
    Stack,
    Typography,
} from '@mui/material';
import Close from '@mui/icons-material/Close';
import DeleteOutlined from '@mui/icons-material/DeleteOutlined';
import EditOutlined from '@mui/icons-material/EditOutlined';
import IosShareOutlined from '@mui/icons-material/IosShareOutlined';
import { getErrorMessage } from '../../../api/client';
import { since } from '../../../lib/dates';
import { fonts } from '../../../styles/theme';
import { CopyValue } from '../../../ui/CopyValue';
import { SideDrawer } from '../../../ui/SideDrawer';
import { Expiry } from '../../legitimateDomains/components/Expiry';
import { formatDay } from '../../legitimateDomains/expiry';
import { parseEventUuids } from '../../misp/MispExportDialog';
import { ObjectHistory } from '../../timeline/components/ObjectHistory';
import { dateAgo } from '../../timeline/format';
import { ACTIONS, CHECKS, changeKinds, mxList, UDRP_STATUS } from '../catalog';
import { SITE_TYPE, useChanges, useSite } from '../hooks';
import type { Site, SiteChange } from '../types';
import { LegitimacyChip, WebState } from './tables';
import { When } from '../../../ui/When';

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

const mono = (value: ReactNode) => <Box component="span" sx={{ fontFamily: fonts.mono, fontSize: 12 }}>{value}</Box>;

/** A technical value in mono type, with a button to copy it; nothing when there is none. */
const copyable = (value: string | null | undefined, label: string) => (value ? <CopyValue value={value} label={label}>{mono(value)}</CopyValue> : null);

function Details({ rows }: { rows: [string, ReactNode][] }) {
    return (
        <Box component="dl" sx={{ display: 'grid', gridTemplateColumns: 'max-content 1fr', columnGap: 2, rowGap: 1, m: 0 }}>
            {rows.map(([label, value]) => (
                <Box key={label} sx={{ display: 'contents' }}>
                    <Typography component="dt" variant="body2" color="text.secondary">
                        {label}
                    </Typography>
                    <Box component="dd" sx={{ m: 0, minWidth: 0, overflowWrap: 'anywhere', typography: 'body2' }}>
                        {value || value === 0 ? value : <Box component="span" sx={{ color: 'text.disabled' }}>-</Box>}
                    </Box>
                </Box>
            ))}
        </Box>
    );
}

const RECENT = { page: 1, pageSize: 5, ordering: '-created_at' };

function RecentChanges({ site, onOpenChange, onShowChanges }: { site: Site; onOpenChange: (c: SiteChange) => void; onShowChanges: () => void }) {
    const { data } = useChanges({ status: 'all', search: '', kind: '', period: '', site: String(site.id) }, RECENT, site.alerts_count > 0);
    if (site.alerts_count === 0) {
        return (
            <Typography variant="body2" color="text.secondary">
                No change detected since it is monitored.
            </Typography>
        );
    }
    if (!data) return <Skeleton height={80} />;
    return (
        <Stack spacing={0.5}>
            {data.results.map((c) => (
                <ButtonBase
                    key={c.id}
                    onClick={() => onOpenChange(c)}
                    sx={{ justifyContent: 'space-between', gap: 1, px: 1, py: 0.75, borderRadius: 1, textAlign: 'left', '&:hover': { bgcolor: 'action.hover' } }}
                >
                    <Typography variant="body2" sx={{ fontWeight: c.status ? 600 : 400 }} noWrap>
                        {changeKinds(c).map((k) => k.label).join(' + ') || c.type}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
                        {c.status ? 'To review - ' : ''}
                        <When iso={c.created_at} inline />
                    </Typography>
                </ButtonBase>
            ))}
            {site.alerts_count > data.results.length && (
                <Button size="small" onClick={onShowChanges} sx={{ alignSelf: 'flex-start' }}>
                    Show all {site.alerts_count} changes
                </Button>
            )}
        </Stack>
    );
}

export type SiteExport = 'misp' | 'legitimate';

interface SiteDrawerProps {
    open: boolean;
    id: number | null;
    initial?: Site;
    onClose: () => void;
    onOpenChange: (change: SiteChange) => void;
    onShowChanges: (site: Site) => void;
    /** Omitted when the user cannot manage sites. */
    actions?: { edit: (s: Site) => void; remove: (s: Site) => void };
    exports: SiteExport[];
    onExport: (site: Site, target: SiteExport) => void;
}

/** One monitored website: its state, what it runs on, its registration, the response, its changes and history. */
export function SiteDrawer({ open, id, initial, onClose, onOpenChange, onShowChanges, actions, exports, onExport }: SiteDrawerProps) {
    const { data: site, error } = useSite(id, initial);
    const [menu, setMenu] = useState<HTMLElement | null>(null);
    const uuids = parseEventUuids(site?.misp_event_uuid);
    const pick = (target: SiteExport) => {
        setMenu(null);
        if (site) onExport(site, target);
    };

    return (
        <SideDrawer open={open} onClose={onClose} labelledBy="site-drawer-title" width={600}>
            <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', px: 2.5, py: 2 }}>
                <Box sx={{ minWidth: 0, flexGrow: 1 }}>
                    <Typography variant="overline" color="text.secondary" sx={{ lineHeight: 1.4, display: 'block' }}>
                        Monitored website {site?.rtir ? `- #${site.rtir}` : ''}
                    </Typography>
                    <CopyValue value={site?.domain_name} label="Domain">
                        <Typography id="site-drawer-title" variant="h3" component="h2" noWrap title={site?.domain_name}>
                            {site?.domain_name ?? <Skeleton width={220} />}
                        </Typography>
                    </CopyValue>
                </Box>
                <IconButton aria-label="Close details" onClick={onClose} edge="end">
                    <Close />
                </IconButton>
            </Stack>
            {site && (
                <Stack direction="row" spacing={1} sx={{ px: 2.5, pb: 2, flexWrap: 'wrap', alignItems: 'center' }}>
                    <LegitimacyChip value={site.legitimacy} />
                    <Box sx={{ flexGrow: 1 }} />
                    {actions && (
                        <Button size="small" variant="outlined" startIcon={<EditOutlined />} onClick={() => actions.edit(site)}>
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
                                        <ListItemText primary="To MISP" secondary={uuids.length ? `Already in ${uuids.length} event${uuids.length === 1 ? '' : 's'}` : 'Share the indicators'} />
                                    </MenuItem>
                                )}
                                {exports.includes('legitimate') && (
                                    <MenuItem onClick={() => pick('legitimate')}>
                                        <ListItemText primary="To Legitimate Domains" secondary="It is ours: stop monitoring it" />
                                    </MenuItem>
                                )}
                            </Menu>
                        </>
                    )}
                    {actions && (
                        <Button size="small" variant="outlined" color="error" startIcon={<DeleteOutlined />} onClick={() => actions.remove(site)}>
                            Delete
                        </Button>
                    )}
                </Stack>
            )}
            <Divider />
            <Box sx={{ flexGrow: 1, overflowY: 'auto' }}>
                {error && !site ? (
                    <MuiAlert severity="error" sx={{ m: 2.5 }}>
                        {getErrorMessage(error, 'Failed to load the website.')}
                    </MuiAlert>
                ) : !site ? (
                    <Box sx={{ p: 2.5 }}>
                        <Skeleton height={80} />
                    </Box>
                ) : (
                    <>
                        <Section title="Now">
                            <Details
                                rows={[
                                    ['Website', <WebState key="web" site={site} />],
                                    [
                                        'Checks',
                                        <Stack key="checks" direction="row" spacing={0.5} sx={{ flexWrap: 'wrap' }}>
                                            {CHECKS.map((c) => (
                                                <Chip key={c.key} size="small" label={c.label} variant={site[c.key] ? 'filled' : 'outlined'} sx={site[c.key] ? undefined : { textDecoration: 'line-through' }} />
                                            ))}
                                        </Stack>,
                                    ],
                                    ['Monitored until', site.expiry ? formatDay(site.expiry) : 'No end date'],
                                    ['Ticket', site.ticket_id],
                                    [
                                        'Actions taken',
                                        ACTIONS.filter((a) => site[a.key]).map((a) => a.label).join(', ') || 'None',
                                    ],
                                    ['UDRP', site.udrp_status && `${UDRP_STATUS[site.udrp_status] ?? site.udrp_status}${site.udrp_last_checked ? ` (checked ${since(site.udrp_last_checked)})` : ''}`],
                                ]}
                            />
                        </Section>
                        <Section title={`Changes (${site.open_alerts_count} to review)`}>
                            <RecentChanges site={site} onOpenChange={onOpenChange} onShowChanges={() => onShowChanges(site)} />
                        </Section>
                        <Section title="Hosting">
                            <Details
                                rows={[
                                    ['IP addresses', copyable([site.ip, site.ip_second].filter(Boolean).join(', '), 'IP addresses')],
                                    ['Mail servers (MX)', copyable(mxList(site.MX_records).join(', '), 'MX records')],
                                    ['Mail server IP', copyable(site.mail_A_record_ip, 'Mail server IP')],
                                    ['Server', site.server_banner],
                                    ['X-Powered-By', site.x_powered_by],
                                ]}
                            />
                        </Section>
                        <Section title="Registration">
                            <Details
                                rows={[
                                    ['Registrar', site.registrar],
                                    ['Registered', site.domain_created_at && formatDay(site.domain_created_at)],
                                    ['Domain expiry', <Expiry key="d" value={site.domain_expiry} />],
                                    ['Certificate expiry', <Expiry key="s" value={site.ssl_expiry} />],
                                    ['Added to Watcher', dateAgo(site.created_at)],
                                    ['MISP events', uuids.length > 0 && <Box component="span" sx={{ fontFamily: fonts.mono, fontSize: 12, whiteSpace: 'pre-line' }}>{[...uuids].reverse().join('\n')}</Box>],
                                ]}
                            />
                        </Section>
                        <Divider />
                        <Section title="History">
                            <ObjectHistory targets={[{ contentType: SITE_TYPE, objectId: site.id }]} enabled={open} />
                        </Section>
                    </>
                )}
            </Box>
        </SideDrawer>
    );
}
