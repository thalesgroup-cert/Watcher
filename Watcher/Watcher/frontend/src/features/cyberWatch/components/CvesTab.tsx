import { useState } from 'react';
import { Alert as MuiAlert, Box, Button, Card, MenuItem, Stack, TablePagination, TextField, ToggleButton, ToggleButtonGroup } from '@mui/material';
import ArchiveOutlined from '@mui/icons-material/ArchiveOutlined';
import BugReportOutlined from '@mui/icons-material/BugReportOutlined';
import FilterAltOffOutlined from '@mui/icons-material/FilterAltOffOutlined';
import GppMaybeOutlined from '@mui/icons-material/GppMaybeOutlined';
import NotificationsActiveOutlined from '@mui/icons-material/NotificationsActiveOutlined';
import SearchOff from '@mui/icons-material/SearchOff';
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
import { useBulk } from '../../bulk/useBulk';
import { ARCHIVE_STATES, PERIODS, SEVERITIES, severityMeta } from '../catalog';
import { CVE_BULK, useArchiveCve, useCves, useCyberStatistics } from '../hooks';
import type { ArchiveState, Cve, CveFilters, Match, Period, SeverityFilter } from '../types';
import { CveTable } from './tables';
import { CveDrawer } from './TargetDrawers';

const DEFAULT_ORDERING = '-published';
const PAGE_SIZES = [25, 50, 100];
const ORDERINGS = ['published', 'cvss_score', 'cve_id', 'hits_count'].flatMap((f) => [f, `-${f}`]);

// URL parameters are prefixed with "c" so every tab keeps its own view.
export function readCveFilters(params: URLSearchParams): CveFilters {
    const status = params.get('cstatus') as ArchiveState | null;
    const period = params.get('cperiod') as Period | null;
    const matched = params.get('cmatched');
    return {
        status: status && ARCHIVE_STATES.some((s) => s.value === status) ? status : 'active',
        search: params.get('cq') ?? '',
        severity: (params.get('csev') ?? '').split(',').filter((s): s is SeverityFilter => SEVERITIES.some((x) => x.value === s)),
        period: period && PERIODS.some((p) => p.value === period) ? period : '',
        matched: matched === 'yes' || matched === 'no' ? matched : '',
    };
}

export function cveFilterParams(f: CveFilters) {
    return { cstatus: f.status === 'active' ? null : f.status, cq: f.search, csev: f.severity.join(','), cperiod: f.period, cmatched: f.matched, cpage: null };
}

export const NO_CVE_FILTERS: CveFilters = { status: 'active', search: '', severity: [], period: '', matched: '' };

interface CvesTabProps {
    canChange: boolean;
    onOpenMatch: (m: Match) => void;
}

/** Every CVE collected from cve.circl.lu, worst and newest first; archiving hides one from the feed. */
export function CvesTab({ canChange, onOpenMatch }: CvesTabProps) {
    const { params, update } = useUrlParams();
    const filters = readCveFilters(params);
    const setFilters = (patch: Partial<CveFilters>) => update(cveFilterParams({ ...filters, ...patch }));
    const sort = params.get('csort') ?? '';
    const ordering = ORDERINGS.includes(sort) ? sort : DEFAULT_ORDERING;
    const page = Math.max(1, Number(params.get('cpage')) || 1);
    const size = Number(params.get('csize'));
    const pageSize = PAGE_SIZES.includes(size) ? size : PAGE_SIZES[0];
    const cveId = Number(params.get('cve')) || null;

    const { data: stats } = useCyberStatistics();
    const list = useCves(filters, { page, pageSize, ordering });
    const rows = list.data?.results ?? [];
    const archive = useArchiveCve();
    const bulk = useBulk(CVE_BULK);

    const [opened, setOpened] = useState<{ id: number; row?: Cve } | null>(null);
    if (cveId && opened?.id !== cveId) setOpened({ id: cveId, row: rows.find((r) => r.id === cveId) });
    const open = (c: Cve) => {
        setOpened({ id: c.id, row: c });
        update({ cve: c.id });
    };
    const index = rows.findIndex((r) => r.id === opened?.id);

    const [selected, setSelected] = useState<Set<number>>(new Set());
    const clearSelection = () => setSelected(new Set());
    const bulkArchive = (archived: boolean) =>
        void bulk.update([...selected], { is_archived: archived }, archived ? 'CVEs - archive' : 'CVEs - restore').then((done) => done && clearSelection());

    const isFiltered = filters.status !== 'active' || !!(filters.search || filters.severity.length || filters.period || filters.matched);
    const kpi = (patch: Partial<CveFilters>) => {
        const target = { ...NO_CVE_FILTERS, ...patch };
        return {
            selected: JSON.stringify(target) === JSON.stringify(filters),
            onClick: () => update(cveFilterParams(target)),
        };
    };

    return (
        <>
            <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: 'repeat(2, 1fr)', md: 'repeat(4, 1fr)' }, mb: 3 }}>
                <KpiCard title="CVEs" value={stats?.cves.total} icon={<BugReportOutlined />} color="primary" onClick={kpi({}).onClick} />
                <KpiCard title="Critical - 7 days" value={stats?.cves.critical7d} icon={<GppMaybeOutlined />} color="error" {...kpi({ severity: ['CRITICAL'], period: '7d' })} />
                <KpiCard title="Published today" value={stats?.cves.newToday} icon={<TodayOutlined />} color="primary" {...kpi({ period: 'today' })} />
                <KpiCard title="Matched by a rule" value={stats?.cves.matched} icon={<NotificationsActiveOutlined />} color="warning" {...kpi({ matched: 'yes' })} />
            </Box>

            <Box sx={{ mb: 1.5, minHeight: 48 }}>
                {selected.size > 0 ? (
                    <SelectionBar count={selected.size} onClear={clearSelection}>
                        <Button size="small" variant="outlined" startIcon={<ArchiveOutlined />} disabled={selected.size > BULK_MAX_ITEMS} onClick={() => bulkArchive(true)}>
                            Archive
                        </Button>
                        <Button size="small" variant="outlined" startIcon={<UnarchiveOutlined />} disabled={selected.size > BULK_MAX_ITEMS} onClick={() => bulkArchive(false)}>
                            Restore
                        </Button>
                    </SelectionBar>
                ) : (
                    <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 1.5, alignItems: 'center' }}>
                        <ToggleButtonGroup size="small" exclusive value={filters.status} onChange={(_, v: ArchiveState | null) => v && setFilters({ status: v })} aria-label="CVE status">
                            {ARCHIVE_STATES.map((s) => (
                                <ToggleButton key={s.value} value={s.value} sx={{ px: 1.5 }}>
                                    {s.label}
                                </ToggleButton>
                            ))}
                        </ToggleButtonGroup>
                        <SearchField resultCount={countOf(list)} value={filters.search} onChange={(search) => setFilters({ search })} placeholder="CVE id, product, vendor…" ariaLabel="Search CVEs" />
                        <TextField
                            select
                            size="small"
                            label="Severity"
                            value={filters.severity}
                            onChange={(e) => setFilters({ severity: (e.target.value as unknown as SeverityFilter[]).filter(Boolean) })}
                            sx={{ minWidth: 170 }}
                            slotProps={{
                                select: {
                                    multiple: true,
                                    displayEmpty: true,
                                    renderValue: (v) => ((v as SeverityFilter[]).length ? (v as SeverityFilter[]).map((s) => severityMeta(s).label).join(', ') : 'Any'),
                                },
                                inputLabel: { shrink: true },
                            }}
                        >
                            {SEVERITIES.map((s) => (
                                <MenuItem key={s.value} value={s.value}>
                                    {s.label}
                                </MenuItem>
                            ))}
                        </TextField>
                        <TextField
                            select
                            size="small"
                            label="Published"
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
                        <TextField select size="small" label="Watch rules" value={filters.matched} onChange={(e) => setFilters({ matched: e.target.value as CveFilters['matched'] })} sx={{ minWidth: 160 }}>
                            <MenuItem value="">Any</MenuItem>
                            <MenuItem value="yes">Matched by a rule</MenuItem>
                            <MenuItem value="no">Not matched</MenuItem>
                        </TextField>
                        {isFiltered && (
                            <Button size="small" color="inherit" startIcon={<FilterAltOffOutlined />} onClick={() => update(cveFilterParams(NO_CVE_FILTERS))} sx={{ color: 'text.secondary' }}>
                                Clear
                            </Button>
                        )}
<ActiveFilters
    chips={[
        filters.severity.length > 0 && { key: 'severity', label: 'Severity', value: filters.severity.map((s) => severityMeta(s).label).join(', '), onRemove: () => setFilters({ severity: [] }) },
        filters.period && { key: 'period', label: 'Published', value: PERIODS.find((p) => p.value === filters.period)?.label ?? filters.period, onRemove: () => setFilters({ period: '' }) },
        filters.matched && { key: 'matched', label: 'Watch rules', value: filters.matched === 'yes' ? 'Matched by a rule' : 'Not matched', onRemove: () => setFilters({ matched: '' }) },
    ]}
/>
                    </Stack>
                )}
            </Box>

            <Card>
                {list.error ? (
                    <MuiAlert severity="error" sx={{ m: 2 }}>
                        {getErrorMessage(list.error, 'Failed to load the CVEs.')}
                    </MuiAlert>
                ) : (
                    <>
                        <Box sx={{ opacity: list.isPlaceholderData ? 0.6 : 1, transition: 'opacity 120ms' }}>
                            <CveTable highlight={filters.search}
                                rows={rows}
                                loading={list.isPending}
                                ordering={ordering}
                                onOrderingChange={(o) => update({ csort: o === DEFAULT_ORDERING ? null : o, cpage: null })}
                                activeId={cveId}
                                onOpen={open}
                                selection={canChange ? selectionHandlers(setSelected, selected) : undefined}
                                empty={
                                    isFiltered ? (
                                        <EmptyState icon={<SearchOff />} title="No CVE matches these filters">
                                            <Button size="small" onClick={() => update(cveFilterParams(NO_CVE_FILTERS))}>
                                                Clear the filters
                                            </Button>
                                        </EmptyState>
                                    ) : (
                                        <EmptyState icon={<BugReportOutlined />} title="No CVE yet">
                                            New vulnerabilities are collected from cve.circl.lu every 30 minutes.
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

            <CveDrawer
                open={cveId !== null}
                id={opened?.id ?? null}
                initial={opened?.row}
                onClose={() => update({ cve: null })}
                previous={index > 0 ? rows[index - 1] : undefined}
                next={index >= 0 ? rows[index + 1] : undefined}
                onNavigate={open}
                pending={archive.isPending}
                onOpenMatch={onOpenMatch}
                onArchive={canChange ? (cve, archived) => archive.mutate({ cve, archived }) : undefined}
            />
        </>
    );
}
