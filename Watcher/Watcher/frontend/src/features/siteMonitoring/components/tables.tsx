import type { ReactNode } from 'react';
import { Box, Chip, Stack, Tooltip, Typography } from '@mui/material';
import PersonOutlined from '@mui/icons-material/PersonOutlined';
import { type Column, DataTable, type RowSelection } from '../../../ui/DataTable';
import { Expiry } from '../../legitimateDomains/components/Expiry';
import { formatDay } from '../../legitimateDomains/expiry';
import { LastActorAvatar } from '../../timeline/components/LastActor';
import { ACTIONS, changeKinds, legitimacyMeta, webState } from '../catalog';
import type { Site, SiteChange } from '../types';
import { When } from '../../../ui/When';

export function LegitimacyChip({ value }: { value: number | null }) {
    const meta = legitimacyMeta(value);
    if (!meta) return <Typography variant="body2" color="text.disabled">-</Typography>;
    return (
        <Tooltip title={meta.label}>
            <Chip size="small" label={meta.short} color={meta.color} variant={meta.color === 'default' ? 'outlined' : 'filled'} />
        </Tooltip>
    );
}

export function WebState({ site }: { site: Pick<Site, 'monitored' | 'web_status' | 'expiry'> }) {
    const state = webState(site);
    return (
        <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
            <Box
                sx={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    flexShrink: 0,
                    bgcolor: state.color === 'default' ? 'text.disabled' : `${state.color}.main`,
                }}
            />
            <Typography variant="body2" noWrap>
                {state.label}
            </Typography>
        </Stack>
    );
}

const SITE_COLUMNS: Column<Site>[] = [
    {
        key: 'domain',
        label: 'Domain',
        sort: 'domain_name',
        cellSx: { maxWidth: 340 },
        render: (s) => {
            const meta = [s.ticket_id && `#${s.ticket_id}`, s.registrar].filter(Boolean).join(' - ');
            return (
                <Box sx={{ minWidth: 0 }}>
                    <Typography sx={{ fontWeight: 600 }} noWrap>
                        {s.domain_name}
                    </Typography>
                    {meta && (
                        <Typography variant="caption" color="text.secondary" noWrap component="div">
                            {meta}
                        </Typography>
                    )}
                </Box>
            );
        },
    },
    { key: 'legitimacy', label: 'Legitimacy', sort: 'legitimacy', width: 150, render: (s) => <LegitimacyChip value={s.legitimacy} /> },
    { key: 'web', label: 'Website', sort: 'web_status', width: 150, render: (s) => <WebState site={s} /> },
    {
        key: 'changes',
        label: 'Changes to review',
        sort: 'open_alerts_count',
        width: 150,
        align: 'right',
        render: (s) => (
            <Typography variant="body2" sx={{ fontWeight: s.open_alerts_count ? 700 : 400, fontVariantNumeric: 'tabular-nums' }} color={s.open_alerts_count ? 'text.primary' : 'text.secondary'}>
                {s.open_alerts_count.toLocaleString('en-GB')}
            </Typography>
        ),
    },
    { key: 'expiry', label: 'Domain expiry', sort: 'domain_expiry', width: 160, render: (s) => <Expiry value={s.domain_expiry} /> },
    {
        key: 'actions',
        label: 'Actions taken',
        width: 190,
        render: (s) => {
            const taken = ACTIONS.filter((a) => s[a.key]);
            return taken.length ? (
                <Stack direction="row" spacing={0.5}>
                    {taken.map((a) => (
                        <Chip key={a.key} size="small" variant="outlined" label={a.short} title={a.label} />
                    ))}
                </Stack>
            ) : (
                <Typography variant="body2" color="text.disabled">
                    None
                </Typography>
            );
        },
    },
    {
        key: 'actor',
        label: (
            <Tooltip title="Last change by">
                <PersonOutlined sx={{ fontSize: 18, verticalAlign: 'middle' }} aria-label="Last change by" />
            </Tooltip>
        ),
        width: 56,
        align: 'center',
        render: (s) => (s.last_event ? <LastActorAvatar event={s.last_event} /> : null),
    },
];

interface TableProps<T> {
    rows: T[];
    loading: boolean;
    ordering: string;
    onOrderingChange: (ordering: string) => void;
    selection?: RowSelection;
    onOpen: (row: T) => void;
    empty: ReactNode;
    activeId?: number | null;
    highlight?: string;
}

export function SiteTable(props: TableProps<Site>) {
    return <DataTable label="Websites" columns={SITE_COLUMNS} rowLabel={(s) => s.domain_name} rowTestId="site-row" {...props} />;
}

const day = (v: string | null) => (v ? formatDay(v) : null);

/** "old to new" of the main fields of a change, in one line. */
export function changeSummary(c: SiteChange): string {
    const pairs: [unknown, unknown][] = [
        [c.old_ip, c.new_ip],
        [c.old_ip_second, c.new_ip_second],
        [c.old_registrar, c.new_registrar],
        [day(c.old_expiry_date), day(c.new_expiry_date)],
        [day(c.old_ssl_expiry), day(c.new_ssl_expiry)],
        [c.old_server_banner, c.new_server_banner],
    ];
    const parts = pairs.filter(([o, n]) => (o || n) && o !== n).map(([o, n]) => `${o || 'none'} to ${n || 'none'}`);
    if (c.difference_score !== null) parts.push(`content difference ${c.difference_score}`);
    return parts.join(' - ');
}

const CHANGE_COLUMNS: Column<SiteChange>[] = [
    {
        key: 'site',
        label: 'Website',
        sort: 'site__domain_name',
        cellSx: { maxWidth: 260 },
        render: (c) => (
            <Typography sx={{ fontWeight: c.status ? 600 : 400 }} noWrap>
                {c.site.domain_name}
            </Typography>
        ),
    },
    {
        key: 'what',
        label: 'What changed',
        sort: 'type',
        cellSx: { maxWidth: 520 },
        render: (c) => {
            const summary = changeSummary(c);
            return (
                <Box sx={{ minWidth: 0 }}>
                    <Stack direction="row" spacing={0.5} sx={{ flexWrap: 'wrap' }}>
                        {changeKinds(c).map((k) => (
                            <Chip key={k.value} size="small" variant="outlined" label={k.label} />
                        ))}
                        {changeKinds(c).length === 0 && <Typography variant="body2">{c.type}</Typography>}
                    </Stack>
                    {summary && (
                        <Typography variant="caption" color="text.secondary" noWrap component="div" sx={{ mt: 0.25 }}>
                            {summary}
                        </Typography>
                    )}
                </Box>
            );
        },
    },
    { key: 'legitimacy', label: 'Legitimacy', width: 150, render: (c) => <LegitimacyChip value={c.site.legitimacy} /> },
    { key: 'detected', label: 'Detected', sort: 'created_at', width: 140, render: (c) => <When iso={c.created_at} /> },
];

export function ChangeTable(props: TableProps<SiteChange>) {
    return <DataTable label="Changes" columns={CHANGE_COLUMNS} rowLabel={(c) => `change #${c.id}`} rowTestId="change-row" {...props} />;
}
