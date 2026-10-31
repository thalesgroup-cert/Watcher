import { useState } from 'react';
import { Alert as MuiAlert, Box, Button, Card, Chip, MenuItem, Stack, TablePagination, TextField, ToggleButton, ToggleButtonGroup } from '@mui/material';
import ArchiveOutlined from '@mui/icons-material/ArchiveOutlined';
import DateRangeOutlined from '@mui/icons-material/DateRangeOutlined';
import FilterAltOffOutlined from '@mui/icons-material/FilterAltOffOutlined';
import InventoryOutlined from '@mui/icons-material/InventoryOutlined';
import MarkEmailUnreadOutlined from '@mui/icons-material/MarkEmailUnreadOutlined';
import SearchOff from '@mui/icons-material/SearchOff';
import TaskAltOutlined from '@mui/icons-material/TaskAltOutlined';
import TodayOutlined from '@mui/icons-material/TodayOutlined';
import UnarchiveOutlined from '@mui/icons-material/UnarchiveOutlined';
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
import { CHANGE_KINDS } from '../catalog';
import { CHANGE_BULK, useChanges, useSetChangeStatus, useSiteStatistics } from '../hooks';
import type { ChangeFilters, ChangeKind, Period, SiteChange } from '../types';
import { ChangeDrawer } from './ChangeDrawer';
import { ChangeTable } from './tables';

const DEFAULT_ORDERING = '-created_at';
const PAGE_SIZES = [25, 50, 100];
const ORDERINGS = ['created_at', 'type', 'site__domain_name'].flatMap((f) => [f, `-${f}`]);
const STATES: { value: ChangeFilters['status']; label: string }[] = [
    { value: 'active', label: 'To review' },
    { value: 'archived', label: 'Archived' },
    { value: 'all', label: 'All' },
];
const PERIODS: { value: Period; label: string }[] = [
    { value: '', label: 'Any time' },
    { value: 'today', label: 'Today' },
    { value: '7d', label: 'Last 7 days' },
    { value: '30d', label: 'Last 30 days' },
];

// Parameters are prefixed with "c" so the website filters survive a trip to this tab and back.
export function readChangeFilters(params: URLSearchParams): ChangeFilters {
    const status = params.get('cstatus') as ChangeFilters['status'] | null;
    const kind = params.get('ckind') as ChangeKind | null;
    const period = params.get('cperiod') as Period | null;
    return {
        status: status && STATES.some((s) => s.value === status) ? status : 'active',
        search: params.get('cq') ?? '',
        kind: kind && CHANGE_KINDS.some((k) => k.value === kind) ? kind : '',
        period: period && PERIODS.some((p) => p.value === period) ? period : '',
        site: /^\d+$/.test(params.get('csite') ?? '') ? (params.get('csite') as string) : '',
    };
}

export const NO_CHANGE_FILTERS: ChangeFilters = { status: 'active', search: '', kind: '', period: '', site: '' };

export const changeFilterParams = (f: ChangeFilters) => ({
    cstatus: f.status === 'active' ? null : f.status,
    cq: f.search,
    ckind: f.kind,
    cperiod: f.period,
    csite: f.site,
    cpage: null,
});

export function ChangesTab() {
    const { params, update } = useUrlParams();
    const filters = readChangeFilters(params);
    const setFilters = (patch: Partial<ChangeFilters>) => update(changeFilterParams({ ...filters, ...patch }));
    const sort = params.get('csort') ?? '';
    const ordering = ORDERINGS.includes(sort) ? sort : DEFAULT_ORDERING;
    const page = Math.max(1, Number(params.get('cpage')) || 1);
    const size = Number(params.get('csize'));
    const pageSize = PAGE_SIZES.includes(size) ? size : PAGE_SIZES[0];
    const changeId = Number(params.get('change')) || null;

    const user = useAuthStore(selectUser);
    const canChange = hasAnyPermission(user, 'site_monitoring.change_alert');
    const { data: stats } = useSiteStatistics();
    const list = useChanges(filters, { page, pageSize, ordering });
    const rows = list.data?.results ?? [];
    const setStatus = useSetChangeStatus();
    const bulk = useBulk(CHANGE_BULK);

    const [opened, setOpened] = useState<{ id: number; row?: SiteChange } | null>(null);
    if (changeId && opened?.id !== changeId) setOpened({ id: changeId, row: rows.find((r) => r.id === changeId) });
    const open = (c: SiteChange) => {
        setOpened({ id: c.id, row: c });
        update({ change: c.id });
    };
    const index = rows.findIndex((r) => r.id === opened?.id);

    const [selected, setSelected] = useState<Set<number>>(new Set());
    const clearSelection = () => setSelected(new Set());
    const bulkStatus = (status: boolean) =>
        void bulk
            .update([...selected], { status }, status ? 'Website changes - back to review' : 'Website changes - archive')
            .then((done) => done && clearSelection());

    const isFiltered = filters.status !== 'active' || !!(filters.search || filters.kind || filters.period || filters.site);
    const kpi = (status: ChangeFilters['status'], period: Period) => ({
        selected: filters.status === status && filters.period === period && !filters.search && !filters.kind && !filters.site,
        onClick: () => update(changeFilterParams({ ...NO_CHANGE_FILTERS, status, period })),
    });
    const siteName = filters.site ? (rows.find((r) => String(r.site.id) === filters.site)?.site.domain_name ?? `#${filters.site}`) : '';

    return (
        <>
            <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: 'repeat(2, 1fr)', md: 'repeat(4, 1fr)' }, mb: 3 }}>
                <KpiCard title="To review" value={stats?.openAlerts} icon={<MarkEmailUnreadOutlined />} color="warning" {...kpi('active', '')} />
                <KpiCard title="Detected today" value={stats?.alertsPerDay.at(-1)?.count} icon={<TodayOutlined />} color="primary" {...kpi('all', 'today')} />
                <KpiCard
                    title="Last 7 days"
                    value={stats && stats.alertsPerDay.slice(-8).reduce((n, d) => n + d.count, 0)}
                    icon={<DateRangeOutlined />}
                    color="primary"
                    {...kpi('all', '7d')}
                />
                <KpiCard title="Archived" value={stats?.archivedAlerts} icon={<InventoryOutlined />} color="inherit" {...kpi('archived', '')} />
            </Box>

            <Box sx={{ mb: 1.5, minHeight: 48 }}>
                {selected.size > 0 ? (
                    <SelectionBar count={selected.size} onClear={clearSelection}>
                        <Button size="small" variant="outlined" startIcon={<ArchiveOutlined />} disabled={selected.size > BULK_MAX_ITEMS} onClick={() => bulkStatus(false)}>
                            Archive
                        </Button>
                        <Button size="small" variant="outlined" startIcon={<UnarchiveOutlined />} disabled={selected.size > BULK_MAX_ITEMS} onClick={() => bulkStatus(true)}>
                            Back to review
                        </Button>
                    </SelectionBar>
                ) : (
                    <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 1.5, alignItems: 'center' }}>
                        <ToggleButtonGroup size="small" exclusive value={filters.status} onChange={(_, v: ChangeFilters['status'] | null) => v && setFilters({ status: v })} aria-label="Status">
                            {STATES.map((s) => (
                                <ToggleButton key={s.value} value={s.value} sx={{ px: 1.5 }}>
                                    {s.label}
                                </ToggleButton>
                            ))}
                        </ToggleButtonGroup>
                        <SearchField resultCount={countOf(list)} value={filters.search} onChange={(search) => setFilters({ search })} placeholder="Website, change…" ariaLabel="Search changes" />
                        <TextField select size="small" label="What changed" value={filters.kind} onChange={(e) => setFilters({ kind: e.target.value as ChangeKind })} sx={{ minWidth: 170 }}>
                            <MenuItem value="">Anything</MenuItem>
                            {CHANGE_KINDS.map((k) => (
                                <MenuItem key={k.value} value={k.value}>
                                    {k.label}
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
                        {filters.site && <Chip label={`Website: ${siteName}`} onDelete={() => setFilters({ site: '' })} />}
                        {isFiltered && (
                            <Button size="small" color="inherit" startIcon={<FilterAltOffOutlined />} onClick={() => update(changeFilterParams(NO_CHANGE_FILTERS))} sx={{ color: 'text.secondary' }}>
                                Clear
                            </Button>
                        )}
<ActiveFilters
    chips={[
        filters.kind && { key: 'kind', label: 'What changed', value: CHANGE_KINDS.find((k) => k.value === filters.kind)?.label ?? filters.kind, onRemove: () => setFilters({ kind: '' }) },
        filters.period && { key: 'period', label: 'Detected', value: PERIODS.find((p) => p.value === filters.period)?.label ?? filters.period, onRemove: () => setFilters({ period: '' }) },
    ]}
/>
                    </Stack>
                )}
            </Box>

            <Card>
                {list.error ? (
                    <MuiAlert severity="error" sx={{ m: 2 }}>
                        {getErrorMessage(list.error, 'Failed to load the changes.')}
                    </MuiAlert>
                ) : (
                    <>
                        <Box sx={{ opacity: list.isPlaceholderData ? 0.6 : 1, transition: 'opacity 120ms' }}>
                            <ChangeTable highlight={filters.search}
                                rows={rows}
                                loading={list.isPending}
                                ordering={ordering}
                                onOrderingChange={(o) => update({ csort: o === DEFAULT_ORDERING ? null : o, cpage: null })}
                                activeId={changeId}
                                onOpen={open}
                                selection={canChange ? selectionHandlers(setSelected, selected) : undefined}
                                empty={
                                    isFiltered ? (
                                        <EmptyState icon={<SearchOff />} title="No change matches these filters">
                                            <Button size="small" onClick={() => update(changeFilterParams(NO_CHANGE_FILTERS))}>
                                                Clear the filters
                                            </Button>
                                        </EmptyState>
                                    ) : (
                                        <EmptyState icon={<TaskAltOutlined />} title="Nothing to review">
                                            Changes of hosting, mail servers, content, registration or certificate show up here.
                                        </EmptyState>
                                    )
                                }
                            />
                        </Box>
                        <TablePagination
                            component="div"
                            count={list.data?.count ?? 0}
                            page={(list.data?.count ?? 0) === 0 ? 0 : page - 1}
                            onPageChange={(_, p) => update({ cpage: p > 0 ? p + 1 : null })}
                            rowsPerPage={pageSize}
                            rowsPerPageOptions={PAGE_SIZES}
                            onRowsPerPageChange={(e) => update({ csize: Number(e.target.value) === PAGE_SIZES[0] ? null : e.target.value, cpage: null })}
                        />
                    </>
                )}
            </Card>

            <ChangeDrawer
                open={changeId !== null}
                id={opened?.id ?? null}
                initial={opened?.row}
                onClose={() => update({ change: null })}
                previous={index > 0 ? rows[index - 1] : undefined}
                next={index >= 0 ? rows[index + 1] : undefined}
                onNavigate={open}
                pending={setStatus.isPending}
                onOpenSite={(c) => update({ tab: null, site: c.site.id, change: null })}
                onSetStatus={
                    canChange
                        ? (c, status) =>
                              setStatus.mutate(
                                  { change: c, status },
                                  {
                                      // Triage: when the change leaves the current view, go on with the next one.
                                      onSuccess: () => {
                                          if (filters.status === 'all') return;
                                          const after = rows[index + 1] ?? rows[index - 1];
                                          if (after) open(after);
                                          else update({ change: null });
                                      },
                                  },
                              )
                        : undefined
                }
            />
        </>
    );
}
