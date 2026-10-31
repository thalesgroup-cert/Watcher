import { useState } from 'react';
import { Alert as MuiAlert, Box, Button, Card, MenuItem, Stack, TablePagination, TextField, ToggleButton, ToggleButtonGroup } from '@mui/material';
import ArchiveOutlined from '@mui/icons-material/ArchiveOutlined';
import BugReportOutlined from '@mui/icons-material/BugReportOutlined';
import FilterAltOffOutlined from '@mui/icons-material/FilterAltOffOutlined';
import InventoryOutlined from '@mui/icons-material/InventoryOutlined';
import LockOutlined from '@mui/icons-material/LockOutlined';
import MarkEmailUnreadOutlined from '@mui/icons-material/MarkEmailUnreadOutlined';
import SearchOff from '@mui/icons-material/SearchOff';
import TaskAltOutlined from '@mui/icons-material/TaskAltOutlined';
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
import { HIT_TYPES, PERIODS } from '../catalog';
import { MATCH_BULK, useAllRules, useArchiveMatch, useCyberStatistics, useMatches } from '../hooks';
import type { ArchiveState, HitType, Match, MatchFilters, Period } from '../types';
import { MatchDrawer } from './MatchDrawer';
import { MatchTable } from './tables';

const DEFAULT_ORDERING = '-hit_at';
const PAGE_SIZES = [25, 50, 100];
const ORDERINGS = ['hit_at', 'rule__name', 'object_id'].flatMap((f) => [f, `-${f}`]);
const STATES: { value: ArchiveState; label: string }[] = [
    { value: 'active', label: 'To review' },
    { value: 'archived', label: 'Archived' },
    { value: 'all', label: 'All' },
];

/** Match filters as kept in the URL (`status` defaults to "to review", so the page opens on what needs work). */
export function readMatchFilters(params: URLSearchParams): MatchFilters {
    const status = params.get('status') as ArchiveState | null;
    const type = params.get('type') as HitType | null;
    const period = params.get('period') as Period | null;
    return {
        status: status && STATES.some((s) => s.value === status) ? status : 'active',
        search: params.get('q') ?? '',
        type: type && HIT_TYPES.some((t) => t.value === type) ? type : '',
        rule: /^\d+$/.test(params.get('rule') ?? '') ? (params.get('rule') as string) : '',
        period: period && PERIODS.some((p) => p.value === period) ? period : '',
    };
}

/** URL changes for a set of match filters: defaults are left out, the page goes back to 1. */
export function matchFilterParams(f: MatchFilters) {
    return { status: f.status === 'active' ? null : f.status, q: f.search, type: f.type, rule: f.rule, period: f.period, page: null };
}

export const NO_MATCH_FILTERS: MatchFilters = { status: 'active', search: '', type: '', rule: '', period: '' };

interface MatchesTabProps {
    canChange: boolean;
    canSeeRules: boolean;
    onOpenTarget: (match: Match) => void;
    onOpenRule: (ruleId: number) => void;
    onGroup: (groupId: number) => void;
}

/** Triage inbox of what the watch rules matched in the CVEs and the ransomware victims. */
export function MatchesTab({ canChange, canSeeRules, onOpenTarget, onOpenRule, onGroup }: MatchesTabProps) {
    const { params, update } = useUrlParams();
    const filters = readMatchFilters(params);
    const setFilters = (patch: Partial<MatchFilters>) => update(matchFilterParams({ ...filters, ...patch }));
    const sort = params.get('sort') ?? '';
    const ordering = ORDERINGS.includes(sort) ? sort : DEFAULT_ORDERING;
    const page = Math.max(1, Number(params.get('page')) || 1);
    const size = Number(params.get('size'));
    const pageSize = PAGE_SIZES.includes(size) ? size : PAGE_SIZES[0];
    const matchId = Number(params.get('match')) || null;

    const { data: stats } = useCyberStatistics();
    const { data: rules = [] } = useAllRules(canSeeRules);
    const list = useMatches(filters, { page, pageSize, ordering });
    const rows = list.data?.results ?? [];
    const archive = useArchiveMatch();
    const bulk = useBulk(MATCH_BULK);

    // The drawer keeps its match while sliding out, and the row it was opened from paints it right away.
    const [opened, setOpened] = useState<{ id: number; row?: Match } | null>(null);
    if (matchId && opened?.id !== matchId) setOpened({ id: matchId, row: rows.find((r) => r.id === matchId) });
    const open = (m: Match) => {
        setOpened({ id: m.id, row: m });
        update({ match: m.id });
    };
    const index = rows.findIndex((r) => r.id === opened?.id);

    const [selected, setSelected] = useState<Set<number>>(new Set());
    const selectedIds = [...selected];
    const clearSelection = () => setSelected(new Set());
    const bulkArchive = (archived: boolean) =>
        void bulk
            .update(selectedIds, { is_archived: archived }, archived ? 'Watch rule matches - archive' : 'Watch rule matches - back to review')
            .then((done) => done && clearSelection());

    const isFiltered = filters.status !== 'active' || !!(filters.search || filters.type || filters.rule || filters.period);
    const kpi = (status: ArchiveState, type: MatchFilters['type']) => ({
        selected: filters.status === status && filters.type === type && !filters.search && !filters.rule && !filters.period,
        onClick: () => update(matchFilterParams({ ...NO_MATCH_FILTERS, status, type })),
    });
    const noRules = stats?.rules?.total === 0;

    return (
        <>
            <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: 'repeat(2, 1fr)', md: 'repeat(4, 1fr)' }, mb: 3 }}>
                <KpiCard title="To review" value={stats?.hits.open} icon={<MarkEmailUnreadOutlined />} color="warning" {...kpi('active', '')} />
                <KpiCard title="CVEs" value={stats?.hits.openCve} icon={<BugReportOutlined />} color="primary" {...kpi('active', 'cve')} />
                <KpiCard title="Ransomware victims" value={stats?.hits.openVictims} icon={<LockOutlined />} color="primary" {...kpi('active', 'ransomware_victim')} />
                <KpiCard title="Archived" value={stats?.hits.archived} icon={<InventoryOutlined />} color="inherit" {...kpi('archived', '')} />
            </Box>

            <Box sx={{ mb: 1.5, minHeight: 48 }}>
                {selected.size > 0 ? (
                    <SelectionBar count={selected.size} onClear={clearSelection}>
                        <Button size="small" variant="outlined" startIcon={<ArchiveOutlined />} disabled={selected.size > BULK_MAX_ITEMS} onClick={() => bulkArchive(true)}>
                            Archive
                        </Button>
                        <Button size="small" variant="outlined" startIcon={<UnarchiveOutlined />} disabled={selected.size > BULK_MAX_ITEMS} onClick={() => bulkArchive(false)}>
                            Back to review
                        </Button>
                    </SelectionBar>
                ) : (
                    <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 1.5, alignItems: 'center' }}>
                        <ToggleButtonGroup size="small" exclusive value={filters.status} onChange={(_, v: ArchiveState | null) => v && setFilters({ status: v })} aria-label="Status">
                            {STATES.map((s) => (
                                <ToggleButton key={s.value} value={s.value} sx={{ px: 1.5 }}>
                                    {s.label}
                                </ToggleButton>
                            ))}
                        </ToggleButtonGroup>
                        <SearchField resultCount={countOf(list)} value={filters.search} onChange={(search) => setFilters({ search })} placeholder="CVE, victim, keyword…" ariaLabel="Search matches" />
                        <TextField select size="small" label="Type" value={filters.type} onChange={(e) => setFilters({ type: e.target.value as MatchFilters['type'] })} sx={{ minWidth: 170 }}>
                            <MenuItem value="">Any</MenuItem>
                            {HIT_TYPES.map((t) => (
                                <MenuItem key={t.value} value={t.value}>
                                    {t.plural}
                                </MenuItem>
                            ))}
                        </TextField>
                        {canSeeRules && (
                            <TextField select size="small" label="Rule" value={filters.rule} onChange={(e) => setFilters({ rule: e.target.value })} sx={{ minWidth: 190 }}>
                                <MenuItem value="">Any</MenuItem>
                                {rules.map((r) => (
                                    <MenuItem key={r.id} value={String(r.id)}>
                                        {r.name}
                                    </MenuItem>
                                ))}
                            </TextField>
                        )}
                        <TextField
                            select
                            size="small"
                            label="Matched"
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
                            <Button size="small" color="inherit" startIcon={<FilterAltOffOutlined />} onClick={() => update(matchFilterParams(NO_MATCH_FILTERS))} sx={{ color: 'text.secondary' }}>
                                Clear
                            </Button>
                        )}
<ActiveFilters
    chips={[
        filters.type && { key: 'type', label: 'Type', value: HIT_TYPES.find((t) => t.value === filters.type)?.plural ?? filters.type, onRemove: () => setFilters({ type: '' }) },
        filters.rule && { key: 'rule', label: 'Rule', value: rules.find((r) => String(r.id) === filters.rule)?.name ?? filters.rule, onRemove: () => setFilters({ rule: '' }) },
        filters.period && { key: 'period', label: 'Matched', value: PERIODS.find((p) => p.value === filters.period)?.label ?? filters.period, onRemove: () => setFilters({ period: '' }) },
    ]}
/>
                    </Stack>
                )}
            </Box>

            <Card>
                {list.error ? (
                    <MuiAlert severity="error" sx={{ m: 2 }}>
                        {getErrorMessage(list.error, 'Failed to load the matches.')}
                    </MuiAlert>
                ) : (
                    <>
                        <Box sx={{ opacity: list.isPlaceholderData ? 0.6 : 1, transition: 'opacity 120ms' }}>
                            <MatchTable highlight={filters.search}
                                rows={rows}
                                loading={list.isPending}
                                ordering={ordering}
                                onOrderingChange={(o) => update({ sort: o === DEFAULT_ORDERING ? null : o, page: null })}
                                activeId={matchId}
                                onOpen={open}
                                selection={canChange ? selectionHandlers(setSelected, selected) : undefined}
                                empty={
                                    isFiltered ? (
                                        <EmptyState icon={<SearchOff />} title="No match for these filters">
                                            <Button size="small" onClick={() => update(matchFilterParams(NO_MATCH_FILTERS))}>
                                                Clear the filters
                                            </Button>
                                        </EmptyState>
                                    ) : noRules ? (
                                        <EmptyState icon={<TaskAltOutlined />} title="No watch rule yet">
                                            Write a rule with the products, vendors or sectors you care about: the new CVEs and ransomware victims that mention them land here.
                                        </EmptyState>
                                    ) : (
                                        <EmptyState icon={<TaskAltOutlined />} title="Nothing to review">
                                            New CVEs and ransomware victims that match your watch rules will show up here.
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

            <MatchDrawer
                open={matchId !== null}
                id={opened?.id ?? null}
                initial={opened?.row}
                onClose={() => update({ match: null })}
                previous={index > 0 ? rows[index - 1] : undefined}
                next={index >= 0 ? rows[index + 1] : undefined}
                onNavigate={open}
                pending={archive.isPending}
                onOpenTarget={onOpenTarget}
                onOpenRule={canSeeRules ? onOpenRule : undefined}
                onGroup={onGroup}
                onArchive={
                    canChange
                        ? (match, archived) =>
                              archive.mutate(
                                  { match, archived },
                                  {
                                      // Triage: when the match leaves the current view, go on with the next one.
                                      onSuccess: () => {
                                          if (filters.status === 'all') return;
                                          const after = rows[index + 1] ?? rows[index - 1];
                                          if (after) open(after);
                                          else update({ match: null });
                                      },
                                  },
                              )
                        : undefined
                }
            />
        </>
    );
}
