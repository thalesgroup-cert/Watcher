import { useState } from 'react';
import { Alert as MuiAlert, Box, Button, Card, MenuItem, Stack, TablePagination, TextField, ToggleButton, ToggleButtonGroup } from '@mui/material';
import ArchiveOutlined from '@mui/icons-material/ArchiveOutlined';
import FilterAltOffOutlined from '@mui/icons-material/FilterAltOffOutlined';
import InventoryOutlined from '@mui/icons-material/InventoryOutlined';
import MarkEmailUnreadOutlined from '@mui/icons-material/MarkEmailUnreadOutlined';
import SearchOff from '@mui/icons-material/SearchOff';
import TodayOutlined from '@mui/icons-material/TodayOutlined';
import UnarchiveOutlined from '@mui/icons-material/UnarchiveOutlined';
import DateRangeOutlined from '@mui/icons-material/DateRangeOutlined';
import TaskAltOutlined from '@mui/icons-material/TaskAltOutlined';
import { getErrorMessage } from '../../../api/client';
import { useUrlParams } from '../../../lib/useUrlParams';
import { selectionHandlers } from '../../../ui/DataTable';
import { EmptyState } from '../../../ui/EmptyState';
import { KpiCard } from '../../../ui/KpiCard';
import { countOf, SearchField } from '../../../ui/SearchField';
import { ActiveFilters } from '../../../ui/ActiveFilters';
import { BULK_MAX_ITEMS, SelectionBar } from '../../../ui/SelectionBar';
import { useBulk } from '../../bulk/useBulk';
import { ALERT_BULK, useAlerts, useAllPatterns, useDataLeakStatistics, useSetAlertStatus } from '../hooks';
import type { Alert, AlertFilters, AlertState, Period } from '../types';
import { AlertDrawer } from './AlertDrawer';
import { AlertTable } from './tables';

const DEFAULT_ORDERING = '-created_at';
const PAGE_SIZES = [25, 50, 100];
const ORDERINGS = ['created_at', 'url', 'keyword__name'].flatMap((f) => [f, `-${f}`]);
const STATES: { value: AlertState; label: string }[] = [
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

/** Alert filters as kept in the URL (`status` defaults to "to review", so the page opens on what needs work). */
export function readAlertFilters(params: URLSearchParams): AlertFilters {
    const status = params.get('status') as AlertState | null;
    const period = params.get('period') as Period | null;
    return {
        status: status && STATES.some((s) => s.value === status) ? status : 'active',
        search: params.get('q') ?? '',
        keyword: /^\d+$/.test(params.get('keyword') ?? '') ? (params.get('keyword') as string) : '',
        source: params.get('source') ?? '',
        period: period && PERIODS.some((p) => p.value === period) ? period : '',
    };
}

/** URL changes for a set of alert filters: defaults are left out, the page goes back to 1. */
export function alertFilterParams(f: AlertFilters) {
    return {
        status: f.status === 'active' ? null : f.status,
        q: f.search,
        keyword: f.keyword,
        source: f.source,
        period: f.period,
        page: null,
    };
}

const NO_FILTERS: AlertFilters = { status: 'active', search: '', keyword: '', source: '', period: '' };

export function AlertsTab({ canChange }: { canChange: boolean }) {
    const { params, update } = useUrlParams();
    const filters = readAlertFilters(params);
    const setFilters = (patch: Partial<AlertFilters>) => update(alertFilterParams({ ...filters, ...patch }));
    const sort = params.get('sort') ?? '';
    const ordering = ORDERINGS.includes(sort) ? sort : DEFAULT_ORDERING;
    const page = Math.max(1, Number(params.get('page')) || 1);
    const size = Number(params.get('size'));
    const pageSize = PAGE_SIZES.includes(size) ? size : PAGE_SIZES[0];
    const alertId = Number(params.get('alert')) || null;

    const { data: stats } = useDataLeakStatistics();
    const { data: patterns = [] } = useAllPatterns();
    const list = useAlerts(filters, { page, pageSize, ordering });
    const rows = list.data?.results ?? [];
    const setStatus = useSetAlertStatus();
    const bulk = useBulk(ALERT_BULK);

    // The drawer keeps its alert while sliding out, and the row it was opened from paints it right away.
    const [opened, setOpened] = useState<{ id: number; row?: Alert } | null>(null);
    if (alertId && opened?.id !== alertId) setOpened({ id: alertId, row: rows.find((r) => r.id === alertId) });
    const open = (a: Alert) => {
        setOpened({ id: a.id, row: a });
        update({ alert: a.id });
    };
    const index = rows.findIndex((r) => r.id === opened?.id);

    const [selected, setSelected] = useState<Set<number>>(new Set());
    const selectedIds = [...selected];
    const clearSelection = () => setSelected(new Set());
    const bulkStatus = (status: boolean) =>
        void bulk
            .update(selectedIds, { status }, status ? 'Data leak alerts - back to review' : 'Data leak alerts - archive')
            .then((done) => done && clearSelection());

    const isFiltered = filters.status !== 'active' || !!(filters.search || filters.keyword || filters.source || filters.period);
    const kpi = (status: AlertState, period: Period) => ({
        selected: filters.status === status && filters.period === period && !filters.search && !filters.keyword && !filters.source,
        onClick: () => update(alertFilterParams({ ...NO_FILTERS, status, period })),
    });
    const sources = stats?.topSources.map((s) => s.source) ?? [];
    if (filters.source && !sources.includes(filters.source)) sources.unshift(filters.source);

    return (
        <>
            <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: 'repeat(2, 1fr)', md: 'repeat(4, 1fr)' }, mb: 3 }}>
                <KpiCard title="To review" value={stats?.activeAlerts} icon={<MarkEmailUnreadOutlined />} color="warning" {...kpi('active', '')} />
                <KpiCard title="New today" value={stats?.newToday} icon={<TodayOutlined />} color="primary" {...kpi('all', 'today')} />
                <KpiCard title="Last 7 days" value={stats?.newThisWeek} icon={<DateRangeOutlined />} color="primary" {...kpi('all', '7d')} />
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
                        <ToggleButtonGroup
                            size="small"
                            exclusive
                            value={filters.status}
                            onChange={(_, v: AlertState | null) => v && setFilters({ status: v })}
                            aria-label="Status"
                        >
                            {STATES.map((s) => (
                                <ToggleButton key={s.value} value={s.value} sx={{ px: 1.5 }}>
                                    {s.label}
                                </ToggleButton>
                            ))}
                        </ToggleButtonGroup>
                        <SearchField resultCount={countOf(list)} value={filters.search} onChange={(search) => setFilters({ search })} placeholder="URL, content, pattern…" ariaLabel="Search alerts" />
                        <TextField select size="small" label="Pattern" value={filters.keyword} onChange={(e) => setFilters({ keyword: e.target.value })} sx={{ minWidth: 170 }}>
                            <MenuItem value="">Any</MenuItem>
                            {patterns.map((p) => (
                                <MenuItem key={p.id} value={String(p.id)}>
                                    {p.name}
                                </MenuItem>
                            ))}
                        </TextField>
                        <TextField select size="small" label="Source" value={filters.source} onChange={(e) => setFilters({ source: e.target.value })} sx={{ minWidth: 170 }}>
                            <MenuItem value="">Any</MenuItem>
                            {sources.map((s) => (
                                <MenuItem key={s} value={s}>
                                    {s}
                                </MenuItem>
                            ))}
                        </TextField>
                        <TextField
                            select
                            size="small"
                            label="Found"
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
                            <Button
                                size="small"
                                color="inherit"
                                startIcon={<FilterAltOffOutlined />}
                                onClick={() => update(alertFilterParams(NO_FILTERS))}
                                sx={{ color: 'text.secondary' }}
                            >
                                Clear
                            </Button>
                        )}
<ActiveFilters
    chips={[
        filters.keyword && { key: 'keyword', label: 'Pattern', value: patterns.find((p) => String(p.id) === filters.keyword)?.name ?? filters.keyword, onRemove: () => setFilters({ keyword: '' }) },
        filters.source && { key: 'source', label: 'Source', value: filters.source, onRemove: () => setFilters({ source: '' }) },
        filters.period && { key: 'period', label: 'Found', value: PERIODS.find((p) => p.value === filters.period)?.label ?? filters.period, onRemove: () => setFilters({ period: '' }) },
    ]}
/>
                    </Stack>
                )}
            </Box>

            <Card>
                {list.error ? (
                    <MuiAlert severity="error" sx={{ m: 2 }}>
                        {getErrorMessage(list.error, 'Failed to load the alerts.')}
                    </MuiAlert>
                ) : (
                    <>
                        <Box sx={{ opacity: list.isPlaceholderData ? 0.6 : 1, transition: 'opacity 120ms' }}>
                            <AlertTable highlight={filters.search}
                                rows={rows}
                                loading={list.isPending}
                                ordering={ordering}
                                onOrderingChange={(o) => update({ sort: o === DEFAULT_ORDERING ? null : o, page: null })}
                                activeId={alertId}
                                onOpen={open}
                                selection={canChange ? selectionHandlers(setSelected, selected) : undefined}
                                empty={
                                    isFiltered ? (
                                        <EmptyState icon={<SearchOff />} title="No alert matches these filters">
                                            <Button size="small" onClick={() => update(alertFilterParams(NO_FILTERS))}>
                                                Clear the filters
                                            </Button>
                                        </EmptyState>
                                    ) : (
                                        <EmptyState icon={<TaskAltOutlined />} title="Nothing to review">
                                            New findings of your search patterns will show up here.
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

            <AlertDrawer
                open={alertId !== null}
                id={opened?.id ?? null}
                initial={opened?.row}
                onClose={() => update({ alert: null })}
                previous={index > 0 ? rows[index - 1] : undefined}
                next={index >= 0 ? rows[index + 1] : undefined}
                onNavigate={open}
                pending={setStatus.isPending}
                onPatternClick={(a) => update({ ...alertFilterParams({ ...NO_FILTERS, keyword: String(a.keyword.id), status: 'all' }), alert: null })}
                onSetStatus={
                    canChange
                        ? (a, status) =>
                              setStatus.mutate(
                                  { alert: a, status },
                                  {
                                      // Triage: when the alert leaves the current view, go on with the next one.
                                      onSuccess: () => {
                                          if (filters.status === 'all') return;
                                          const after = rows[index + 1] ?? rows[index - 1];
                                          if (after) open(after);
                                          else update({ alert: null });
                                      },
                                  },
                              )
                        : undefined
                }
            />
        </>
    );
}
