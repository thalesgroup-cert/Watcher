import { useState } from 'react';
import { Alert as MuiAlert, Box, Button, Card, ListSubheader, Menu, MenuItem, Stack, TablePagination, TextField } from '@mui/material';
import ErrorOutlined from '@mui/icons-material/ErrorOutlined';
import FilterAltOffOutlined from '@mui/icons-material/FilterAltOffOutlined';
import GppMaybeOutlined from '@mui/icons-material/GppMaybeOutlined';
import LinkOffOutlined from '@mui/icons-material/LinkOffOutlined';
import SearchOff from '@mui/icons-material/SearchOff';
import TaskAltOutlined from '@mui/icons-material/TaskAltOutlined';
import TodayOutlined from '@mui/icons-material/TodayOutlined';
import { getErrorMessage } from '../../../api/client';
import { useUrlParams } from '../../../lib/useUrlParams';
import { selectionHandlers } from '../../../ui/DataTable';
import { EmptyState } from '../../../ui/EmptyState';
import { KpiCard } from '../../../ui/KpiCard';
import { countOf, SearchField } from '../../../ui/SearchField';
import { ActiveFilters } from '../../../ui/ActiveFilters';
import { BULK_MAX_ITEMS, SelectionBar } from '../../../ui/SelectionBar';
import { hasAnyPermission, selectUser, useAuthStore } from '../../auth/store';
import { useBulk } from '../../bulk/useBulk';
import { LegitimateExportDialog, SiteExportDialog } from '../../exports/ExportDialogs';
import { MispExportDialog, parseEventUuids } from '../../misp/MispExportDialog';
import { SOURCES, STATUSES, statusMeta } from '../catalog';
import { THREAT_BULK, useAllAssets, useDnsStatistics, useSetThreatStatus, useThreatMispExport, useThreats } from '../hooks';
import type { Period, StatusFilter, Threat, ThreatFilters, ThreatSource, ThreatStatus } from '../types';
import { type ExportTarget, ThreatDrawer } from './ThreatDrawer';
import { ThreatEditDialog } from './ThreatEditDialog';
import { ThreatTable } from './tables';

const DEFAULT_ORDERING = '-created_at';
const PAGE_SIZES = [25, 50, 100];
const ORDERINGS = ['created_at', 'status', 'source'].flatMap((f) => [f, `-${f}`]);
const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
    { value: 'open', label: 'Open' },
    ...STATUSES.map((s) => ({ value: s.value as StatusFilter, label: s.label })),
    { value: 'all', label: 'All' },
];
const PERIODS: { value: Period; label: string }[] = [
    { value: '', label: 'Any time' },
    { value: 'today', label: 'Today' },
    { value: '7d', label: 'Last 7 days' },
    { value: '30d', label: 'Last 30 days' },
];

/** Threat filters as kept in the URL; the page opens on the open threats. */
export function readThreatFilters(params: URLSearchParams): ThreatFilters {
    const status = params.get('status') as StatusFilter | null;
    const source = params.get('source') as ThreatSource | null;
    const period = params.get('period') as Period | null;
    const asset = params.get('asset') ?? '';
    return {
        status: status && STATUS_FILTERS.some((s) => s.value === status) ? status : 'open',
        source: source && SOURCES.some((s) => s.value === source) ? source : '',
        search: params.get('q') ?? '',
        asset: /^[dk]:./.test(asset) ? asset : '',
        period: period && PERIODS.some((p) => p.value === period) ? period : '',
    };
}

export const NO_THREAT_FILTERS: ThreatFilters = { status: 'open', source: '', search: '', asset: '', period: '' };

/** URL changes for a set of threat filters: defaults left out, back to page 1. */
export function threatFilterParams(f: ThreatFilters) {
    return { status: f.status === 'open' ? null : f.status, source: f.source, q: f.search, asset: f.asset, period: f.period, page: null };
}

/** Comment written in Legitimate Domains when a threat is moved there. */
function legitimateComment(t: Threat) {
    const parts = ['Exported from DNS Threats'];
    if (t.corporate_dns) parts.push(`Monitored domain: ${t.corporate_dns}`);
    else if (t.corporate_keyword) parts.push(`Keyword: ${t.corporate_keyword}`);
    if (t.technical_details.fuzzer) parts.push(`${t.technical_details.fuzzer} technique`);
    if (t.comments) parts.push(t.comments);
    return parts.join(' - ');
}

export function ThreatsTab() {
    const { params, update } = useUrlParams();
    const filters = readThreatFilters(params);
    const setFilters = (patch: Partial<ThreatFilters>) => update(threatFilterParams({ ...filters, ...patch }));
    const sort = params.get('sort') ?? '';
    const ordering = ORDERINGS.includes(sort) ? sort : DEFAULT_ORDERING;
    const page = Math.max(1, Number(params.get('page')) || 1);
    const size = Number(params.get('size'));
    const pageSize = PAGE_SIZES.includes(size) ? size : PAGE_SIZES[0];
    const threatId = Number(params.get('threat')) || null;

    const user = useAuthStore(selectUser);
    const canChange = hasAnyPermission(user, 'dns_finder.change_alert');
    const exports: ExportTarget[] = [
        ...(hasAnyPermission(user, 'site_monitoring.add_site') ? (['misp', 'site'] as const) : []),
        ...(hasAnyPermission(user, 'common.add_legitimatedomain') ? (['legitimate'] as const) : []),
    ];

    const { data: stats } = useDnsStatistics();
    const { data: domains = [] } = useAllAssets('domain');
    const { data: keywords = [] } = useAllAssets('keyword');
    const list = useThreats(filters, { page, pageSize, ordering });
    const rows = list.data?.results ?? [];
    const setStatus = useSetThreatStatus();
    const misp = useThreatMispExport();
    const bulk = useBulk(THREAT_BULK);

    const [opened, setOpened] = useState<{ id: number; row?: Threat } | null>(null);
    if (threatId && opened?.id !== threatId) setOpened({ id: threatId, row: rows.find((r) => r.id === threatId) });
    const open = (t: Threat) => {
        setOpened({ id: t.id, row: t });
        update({ threat: t.id });
    };
    const index = rows.findIndex((r) => r.id === opened?.id);
    const [editing, setEditing] = useState<Threat | null>(null);
    const [exporting, setExporting] = useState<{ threat: Threat; target: ExportTarget } | null>(null);

    const [selected, setSelected] = useState<Set<number>>(new Set());
    const clearSelection = () => setSelected(new Set());
    const [bulkMenu, setBulkMenu] = useState<HTMLElement | null>(null);
    const bulkStatus = (status: ThreatStatus) => {
        setBulkMenu(null);
        void bulk
            .update([...selected], { status }, `DNS threats - ${statusMeta(status).label.toLowerCase()}`)
            .then((done) => done && clearSelection());
    };

    /** Does a threat with this status still belong to the current view? */
    const inView = (status: ThreatStatus) =>
        filters.status === 'all' || filters.status === status || (filters.status === 'open' && statusMeta(status).open);
    const changeStatus = (t: Threat, status: ThreatStatus) =>
        setStatus.mutate(
            { threat: t, status },
            {
                // Triage: when the threat leaves the current view, go on with the next one.
                onSuccess: () => {
                    if (inView(status) || t.id !== opened?.id) return;
                    const after = rows[index + 1] ?? rows[index - 1];
                    if (after) open(after);
                    else update({ threat: null });
                },
            },
        );

    const isFiltered = filters.status !== 'open' || !!(filters.source || filters.search || filters.asset || filters.period);
    const kpi = (patch: Partial<ThreatFilters>) => {
        const target = { ...NO_THREAT_FILTERS, ...patch };
        return {
            selected: (Object.keys(target) as (keyof ThreatFilters)[]).every((k) => target[k] === filters[k]),
            onClick: () => update(threatFilterParams(target)),
        };
    };

    return (
        <>
            <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: 'repeat(2, 1fr)', md: 'repeat(4, 1fr)' }, mb: 3 }}>
                <KpiCard title="Open" value={stats?.openAlerts} icon={<GppMaybeOutlined />} color="warning" {...kpi({})} />
                <KpiCard title="Confirmed" value={stats?.confirmedAlerts} icon={<ErrorOutlined />} color="error" {...kpi({ status: 'confirmed' })} />
                <KpiCard title="Takeover risks" value={stats?.openTakeover} icon={<LinkOffOutlined />} color="error" {...kpi({ source: 'subdomain_takeover' })} />
                <KpiCard title="New today" value={stats?.newToday} icon={<TodayOutlined />} color="primary" {...kpi({ status: 'all', period: 'today' })} />
            </Box>

            <Box sx={{ mb: 1.5, minHeight: 48 }}>
                {selected.size > 0 ? (
                    <SelectionBar count={selected.size} onClear={clearSelection}>
                        <Button size="small" variant="outlined" disabled={selected.size > BULK_MAX_ITEMS} onClick={(e) => setBulkMenu(e.currentTarget)} aria-haspopup="menu">
                            Set status…
                        </Button>
                        <Menu anchorEl={bulkMenu} open={bulkMenu !== null} onClose={() => setBulkMenu(null)}>
                            {STATUSES.map((s) => (
                                <MenuItem key={s.value} onClick={() => bulkStatus(s.value)}>
                                    {s.label}
                                </MenuItem>
                            ))}
                        </Menu>
                    </SelectionBar>
                ) : (
                    <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 1.5, alignItems: 'center' }}>
                        <SearchField resultCount={countOf(list)} value={filters.search} onChange={(search) => setFilters({ search })} placeholder="Domain…" ariaLabel="Search threats" />
                        <TextField select size="small" label="Status" value={filters.status} onChange={(e) => setFilters({ status: e.target.value as StatusFilter })} sx={{ minWidth: 150 }}>
                            {STATUS_FILTERS.map((s) => (
                                <MenuItem key={s.value} value={s.value}>
                                    {s.label}
                                </MenuItem>
                            ))}
                        </TextField>
                        <TextField select size="small" label="Source" value={filters.source} onChange={(e) => setFilters({ source: e.target.value as ThreatSource })} sx={{ minWidth: 160 }}>
                            <MenuItem value="">Any</MenuItem>
                            {SOURCES.map((s) => (
                                <MenuItem key={s.value} value={s.value}>
                                    {s.label}
                                </MenuItem>
                            ))}
                        </TextField>
                        <TextField select size="small" label="Matched" value={filters.asset} onChange={(e) => setFilters({ asset: e.target.value })} sx={{ minWidth: 180 }}>
                            <MenuItem value="">Any</MenuItem>
                            {domains.length > 0 && <ListSubheader>Monitored domains</ListSubheader>}
                            {domains.map((d) => (
                                <MenuItem key={`d${d.id}`} value={`d:${d.name}`}>
                                    {d.name}
                                </MenuItem>
                            ))}
                            {keywords.length > 0 && <ListSubheader>Keywords</ListSubheader>}
                            {keywords.map((k) => (
                                <MenuItem key={`k${k.id}`} value={`k:${k.name}`}>
                                    {k.name}
                                </MenuItem>
                            ))}
                        </TextField>
                        <TextField
                            select
                            size="small"
                            label="Detected"
                            value={filters.period}
                            onChange={(e) => setFilters({ period: e.target.value as Period })}
                            sx={{ minWidth: 140 }}
                            slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}
                        >
                            {PERIODS.map((p) => (
                                <MenuItem key={p.value || 'any'} value={p.value}>
                                    {p.label}
                                </MenuItem>
                            ))}
                        </TextField>
                        {isFiltered && (
                            <Button size="small" color="inherit" startIcon={<FilterAltOffOutlined />} onClick={() => update(threatFilterParams(NO_THREAT_FILTERS))} sx={{ color: 'text.secondary' }}>
                                Clear
                            </Button>
                        )}
<ActiveFilters
    chips={[
        filters.status !== 'open' && { key: 'status', label: 'Status', value: STATUS_FILTERS.find((s) => s.value === filters.status)?.label ?? filters.status, onRemove: () => setFilters({ status: 'open' }) },
        filters.source && { key: 'source', label: 'Source', value: SOURCES.find((s) => s.value === filters.source)?.label ?? filters.source, onRemove: () => setFilters({ source: '' }) },
        filters.asset && { key: 'asset', label: 'Matched', value: filters.asset.slice(2), onRemove: () => setFilters({ asset: '' }) },
        filters.period && { key: 'period', label: 'Detected', value: PERIODS.find((p) => p.value === filters.period)?.label ?? filters.period, onRemove: () => setFilters({ period: '' }) },
    ]}
/>
                    </Stack>
                )}
            </Box>

            <Card>
                {list.error ? (
                    <MuiAlert severity="error" sx={{ m: 2 }}>
                        {getErrorMessage(list.error, 'Failed to load the threats.')}
                    </MuiAlert>
                ) : (
                    <>
                        <Box sx={{ opacity: list.isPlaceholderData ? 0.6 : 1, transition: 'opacity 120ms' }}>
                            <ThreatTable highlight={filters.search}
                                rows={rows}
                                loading={list.isPending}
                                ordering={ordering}
                                onOrderingChange={(o) => update({ sort: o === DEFAULT_ORDERING ? null : o, page: null })}
                                activeId={threatId}
                                onOpen={open}
                                selection={canChange ? selectionHandlers(setSelected, selected) : undefined}
                                empty={
                                    isFiltered ? (
                                        <EmptyState icon={<SearchOff />} title="No threat matches these filters">
                                            <Button size="small" onClick={() => update(threatFilterParams(NO_THREAT_FILTERS))}>
                                                Clear the filters
                                            </Button>
                                        </EmptyState>
                                    ) : (
                                        <EmptyState icon={<TaskAltOutlined />} title="No open threat">
                                            Look-alike domains, certificates and takeover risks will show up here.
                                        </EmptyState>
                                    )
                                }
                            />
                        </Box>
                        <TablePagination
                            component="div"
                            count={list.data?.count ?? 0}
                            page={(list.data?.count ?? 0) === 0 ? 0 : page - 1}
                            onPageChange={(_, p) => update({ page: p > 0 ? p + 1 : null })}
                            rowsPerPage={pageSize}
                            rowsPerPageOptions={PAGE_SIZES}
                            onRowsPerPageChange={(e) => update({ size: Number(e.target.value) === PAGE_SIZES[0] ? null : e.target.value, page: null })}
                        />
                    </>
                )}
            </Card>

            <ThreatDrawer
                open={threatId !== null}
                id={opened?.id ?? null}
                initial={opened?.row}
                onClose={() => update({ threat: null })}
                previous={index > 0 ? rows[index - 1] : undefined}
                next={index >= 0 ? rows[index + 1] : undefined}
                onNavigate={open}
                pending={setStatus.isPending}
                onSetStatus={canChange ? changeStatus : undefined}
                onEdit={canChange ? setEditing : undefined}
                exports={exports}
                onExport={(threat, target) => setExporting({ threat, target })}
                onAssetClick={(t) =>
                    update({
                        ...threatFilterParams({ ...NO_THREAT_FILTERS, status: 'all', asset: t.corporate_dns ? `d:${t.corporate_dns}` : `k:${t.corporate_keyword}` }),
                        threat: null,
                    })
                }
            />

            <ThreatEditDialog threat={editing} onClose={() => setEditing(null)} />

            <MispExportDialog
                open={exporting?.target === 'misp'}
                onClose={() => setExporting(null)}
                name={exporting?.threat.domain_name ?? ''}
                eventUuids={parseEventUuids(exporting?.threat.misp_event_uuid)}
                pending={misp.isPending}
                onExport={(eventUuid) => misp.mutateAsync({ threat: (exporting as { threat: Threat }).threat, eventUuid })}
            />
            <LegitimateExportDialog
                open={exporting?.target === 'legitimate'}
                onClose={() => setExporting(null)}
                domainName={exporting?.threat.domain_name ?? ''}
                defaultComment={exporting ? legitimateComment(exporting.threat) : ''}
                afterwards="The threat is then marked resolved."
                onDone={() => exporting && changeStatus(exporting.threat, 'resolved')}
            />
            <SiteExportDialog
                open={exporting?.target === 'site'}
                onClose={() => setExporting(null)}
                domainName={exporting?.threat.domain_name ?? ''}
                afterwards="The threat is then marked resolved."
                onDone={() => exporting && changeStatus(exporting.threat, 'resolved')}
            />
        </>
    );
}
