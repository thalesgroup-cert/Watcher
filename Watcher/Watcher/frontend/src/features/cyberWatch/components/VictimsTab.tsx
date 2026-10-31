import { useState } from 'react';
import { Alert as MuiAlert, Box, Button, Card, MenuItem, Stack, TablePagination, TextField, ToggleButton, ToggleButtonGroup } from '@mui/material';
import ArchiveOutlined from '@mui/icons-material/ArchiveOutlined';
import DateRangeOutlined from '@mui/icons-material/DateRangeOutlined';
import FilterAltOffOutlined from '@mui/icons-material/FilterAltOffOutlined';
import GroupsOutlined from '@mui/icons-material/GroupsOutlined';
import LockOutlined from '@mui/icons-material/LockOutlined';
import NotificationsActiveOutlined from '@mui/icons-material/NotificationsActiveOutlined';
import SearchOff from '@mui/icons-material/SearchOff';
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
import { ARCHIVE_STATES, countryLabel, PERIODS } from '../catalog';
import { useArchiveVictim, useCyberStatistics, useGroup, useVictims, VICTIM_BULK } from '../hooks';
import type { ArchiveState, Match, Period, Victim, VictimFilters } from '../types';
import { VictimTable } from './tables';
import { VictimDrawer } from './TargetDrawers';

const DEFAULT_ORDERING = '-attacked_at';
const PAGE_SIZES = [25, 50, 100];
const ORDERINGS = ['attacked_at', 'victim_name', 'group__name', 'country', 'hits_count'].flatMap((f) => [f, `-${f}`]);

// URL parameters are prefixed with "v" so every tab keeps its own view.
export function readVictimFilters(params: URLSearchParams): VictimFilters {
    const status = params.get('vstatus') as ArchiveState | null;
    const period = params.get('vperiod') as Period | null;
    const matched = params.get('vmatched');
    return {
        status: status && ARCHIVE_STATES.some((s) => s.value === status) ? status : 'active',
        search: params.get('vq') ?? '',
        group: /^\d+$/.test(params.get('vgroup') ?? '') ? (params.get('vgroup') as string) : '',
        country: params.get('vcountry') ?? '',
        sector: params.get('vsector') ?? '',
        period: period && PERIODS.some((p) => p.value === period) ? period : '',
        matched: matched === 'yes' || matched === 'no' ? matched : '',
    };
}

export function victimFilterParams(f: VictimFilters) {
    return {
        vstatus: f.status === 'active' ? null : f.status,
        vq: f.search,
        vgroup: f.group,
        vcountry: f.country,
        vsector: f.sector,
        vperiod: f.period,
        vmatched: f.matched,
        vpage: null,
    };
}

export const NO_VICTIM_FILTERS: VictimFilters = { status: 'active', search: '', group: '', country: '', sector: '', period: '', matched: '' };

interface VictimsTabProps {
    canChange: boolean;
    onOpenMatch: (m: Match) => void;
}

/** Victims posted on the ransomware leak sites (ransomware.live, ransomlook.io), newest first. */
export function VictimsTab({ canChange, onOpenMatch }: VictimsTabProps) {
    const { params, update } = useUrlParams();
    const filters = readVictimFilters(params);
    const setFilters = (patch: Partial<VictimFilters>) => update(victimFilterParams({ ...filters, ...patch }));
    const sort = params.get('vsort') ?? '';
    const ordering = ORDERINGS.includes(sort) ? sort : DEFAULT_ORDERING;
    const page = Math.max(1, Number(params.get('vpage')) || 1);
    const size = Number(params.get('vsize'));
    const pageSize = PAGE_SIZES.includes(size) ? size : PAGE_SIZES[0];
    const victimId = Number(params.get('victim')) || null;

    const { data: stats } = useCyberStatistics();
    const { data: filteredGroup } = useGroup(filters.group ? Number(filters.group) : null);
    const list = useVictims(filters, { page, pageSize, ordering });
    const rows = list.data?.results ?? [];
    const archive = useArchiveVictim();
    const bulk = useBulk(VICTIM_BULK);

    const [opened, setOpened] = useState<{ id: number; row?: Victim } | null>(null);
    if (victimId && opened?.id !== victimId) setOpened({ id: victimId, row: rows.find((r) => r.id === victimId) });
    const open = (v: Victim) => {
        setOpened({ id: v.id, row: v });
        update({ victim: v.id });
    };
    const index = rows.findIndex((r) => r.id === opened?.id);

    const [selected, setSelected] = useState<Set<number>>(new Set());
    const clearSelection = () => setSelected(new Set());
    const bulkArchive = (archived: boolean) =>
        void bulk.update([...selected], { is_archived: archived }, archived ? 'Ransomware victims - archive' : 'Ransomware victims - restore').then((done) => done && clearSelection());

    const isFiltered = filters.status !== 'active' || !!(filters.search || filters.group || filters.country || filters.sector || filters.period || filters.matched);
    const kpi = (patch: Partial<VictimFilters>) => {
        const target = { ...NO_VICTIM_FILTERS, ...patch };
        return { selected: JSON.stringify(target) === JSON.stringify(filters), onClick: () => update(victimFilterParams(target)) };
    };

    // Filter menus: the most active groups, countries and sectors, plus the one in the URL.
    const groups = stats?.victims.topGroups.map((g) => ({ id: String(g.id), name: g.name })) ?? [];
    if (filters.group && !groups.some((g) => g.id === filters.group)) groups.unshift({ id: filters.group, name: filteredGroup?.name ?? `#${filters.group}` });
    const countries = stats?.victims.topCountries.map((c) => c.name) ?? [];
    if (filters.country && !countries.includes(filters.country)) countries.unshift(filters.country);
    const sectors = stats?.victims.topSectors.map((s) => s.name) ?? [];
    if (filters.sector && !sectors.includes(filters.sector)) sectors.unshift(filters.sector);
    const byGroup = (groupId: number) => update({ ...victimFilterParams({ ...NO_VICTIM_FILTERS, group: String(groupId), status: 'all' }), victim: null });

    return (
        <>
            <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: 'repeat(2, 1fr)', md: 'repeat(4, 1fr)' }, mb: 3 }}>
                <KpiCard title="Victims" value={stats?.victims.total} icon={<LockOutlined />} color="primary" onClick={kpi({}).onClick} />
                <KpiCard title="Posted - 7 days" value={stats?.victims.new7d} icon={<DateRangeOutlined />} color="primary" {...kpi({ period: '7d' })} />
                <KpiCard title="Active groups - 7 days" value={stats?.victims.activeGroups7d} icon={<GroupsOutlined />} color="error" />
                <KpiCard title="Matched by a rule" value={stats?.victims.matched} icon={<NotificationsActiveOutlined />} color="warning" {...kpi({ matched: 'yes' })} />
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
                        <ToggleButtonGroup size="small" exclusive value={filters.status} onChange={(_, v: ArchiveState | null) => v && setFilters({ status: v })} aria-label="Victim status">
                            {ARCHIVE_STATES.map((s) => (
                                <ToggleButton key={s.value} value={s.value} sx={{ px: 1.5 }}>
                                    {s.label}
                                </ToggleButton>
                            ))}
                        </ToggleButtonGroup>
                        <SearchField resultCount={countOf(list)} value={filters.search} onChange={(search) => setFilters({ search })} placeholder="Victim or group…" ariaLabel="Search victims" />
                        <TextField select size="small" label="Group" value={filters.group} onChange={(e) => setFilters({ group: e.target.value })} sx={{ minWidth: 160 }}>
                            <MenuItem value="">Any</MenuItem>
                            {groups.map((g) => (
                                <MenuItem key={g.id} value={g.id}>
                                    {g.name}
                                </MenuItem>
                            ))}
                        </TextField>
                        <TextField select size="small" label="Country" value={filters.country} onChange={(e) => setFilters({ country: e.target.value })} sx={{ minWidth: 160 }}>
                            <MenuItem value="">Any</MenuItem>
                            {countries.map((c) => (
                                <MenuItem key={c} value={c}>
                                    {countryLabel(c)}
                                </MenuItem>
                            ))}
                        </TextField>
                        <TextField select size="small" label="Sector" value={filters.sector} onChange={(e) => setFilters({ sector: e.target.value })} sx={{ minWidth: 170 }}>
                            <MenuItem value="">Any</MenuItem>
                            {sectors.map((s) => (
                                <MenuItem key={s} value={s}>
                                    {s}
                                </MenuItem>
                            ))}
                        </TextField>
                        <TextField
                            select
                            size="small"
                            label="Posted"
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
                        <TextField select size="small" label="Watch rules" value={filters.matched} onChange={(e) => setFilters({ matched: e.target.value as VictimFilters['matched'] })} sx={{ minWidth: 160 }}>
                            <MenuItem value="">Any</MenuItem>
                            <MenuItem value="yes">Matched by a rule</MenuItem>
                            <MenuItem value="no">Not matched</MenuItem>
                        </TextField>
                        {isFiltered && (
                            <Button size="small" color="inherit" startIcon={<FilterAltOffOutlined />} onClick={() => update(victimFilterParams(NO_VICTIM_FILTERS))} sx={{ color: 'text.secondary' }}>
                                Clear
                            </Button>
                        )}
<ActiveFilters
    chips={[
        filters.group && { key: 'group', label: 'Group', value: groups.find((g) => g.id === filters.group)?.name ?? filters.group, onRemove: () => setFilters({ group: '' }) },
        filters.country && { key: 'country', label: 'Country', value: countryLabel(filters.country), onRemove: () => setFilters({ country: '' }) },
        filters.sector && { key: 'sector', label: 'Sector', value: filters.sector, onRemove: () => setFilters({ sector: '' }) },
        filters.period && { key: 'period', label: 'Posted', value: PERIODS.find((p) => p.value === filters.period)?.label ?? filters.period, onRemove: () => setFilters({ period: '' }) },
        filters.matched && { key: 'matched', label: 'Watch rules', value: filters.matched === 'yes' ? 'Matched by a rule' : 'Not matched', onRemove: () => setFilters({ matched: '' }) },
    ]}
/>
                    </Stack>
                )}
            </Box>

            <Card>
                {list.error ? (
                    <MuiAlert severity="error" sx={{ m: 2 }}>
                        {getErrorMessage(list.error, 'Failed to load the victims.')}
                    </MuiAlert>
                ) : (
                    <>
                        <Box sx={{ opacity: list.isPlaceholderData ? 0.6 : 1, transition: 'opacity 120ms' }}>
                            <VictimTable highlight={filters.search}
                                rows={rows}
                                loading={list.isPending}
                                ordering={ordering}
                                onOrderingChange={(o) => update({ vsort: o === DEFAULT_ORDERING ? null : o, vpage: null })}
                                activeId={victimId}
                                onOpen={open}
                                selection={canChange ? selectionHandlers(setSelected, selected) : undefined}
                                empty={
                                    isFiltered ? (
                                        <EmptyState icon={<SearchOff />} title="No victim matches these filters">
                                            <Button size="small" onClick={() => update(victimFilterParams(NO_VICTIM_FILTERS))}>
                                                Clear the filters
                                            </Button>
                                        </EmptyState>
                                    ) : (
                                        <EmptyState icon={<LockOutlined />} title="No victim yet">
                                            Victims posted on the ransomware leak sites are collected every 30 minutes.
                                        </EmptyState>
                                    )
                                }
                            />
                        </Box>
                        <TablePagination
                            component="div"
                            count={list.data?.count ?? 0}
                            page={(list.data?.count ?? 0) === 0 ? 0 : page - 1}
                            onPageChange={(_, p) => update({ vpage: p > 0 ? p + 1 : null })}
                            rowsPerPage={pageSize}
                            rowsPerPageOptions={PAGE_SIZES}
                            onRowsPerPageChange={(e) => update({ vsize: Number(e.target.value) === PAGE_SIZES[0] ? null : e.target.value, vpage: null })}
                        />
                    </>
                )}
            </Card>

            <VictimDrawer
                open={victimId !== null}
                id={opened?.id ?? null}
                initial={opened?.row}
                onClose={() => update({ victim: null })}
                previous={index > 0 ? rows[index - 1] : undefined}
                next={index >= 0 ? rows[index + 1] : undefined}
                onNavigate={open}
                pending={archive.isPending}
                onOpenMatch={onOpenMatch}
                onGroup={byGroup}
                onArchive={canChange ? (victim, archived) => archive.mutate({ victim, archived }) : undefined}
            />
        </>
    );
}
