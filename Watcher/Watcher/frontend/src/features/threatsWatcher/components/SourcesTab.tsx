import { useState } from 'react';
import { Alert as MuiAlert, Box, Button, Card, Menu, MenuItem, Stack, TablePagination, TextField } from '@mui/material';
import DeleteOutlined from '@mui/icons-material/DeleteOutlined';
import FilterAltOffOutlined from '@mui/icons-material/FilterAltOffOutlined';
import RssFeedOutlined from '@mui/icons-material/RssFeedOutlined';
import SearchOff from '@mui/icons-material/SearchOff';
import { getErrorMessage } from '../../../api/client';
import { useUrlParams } from '../../../lib/useUrlParams';
import { ConfirmDialog } from '../../../ui/ConfirmDialog';
import { selectionHandlers } from '../../../ui/DataTable';
import { EmptyState } from '../../../ui/EmptyState';
import { countOf, SearchField } from '../../../ui/SearchField';
import { ActiveFilters } from '../../../ui/ActiveFilters';
import { BULK_MAX_ITEMS, SelectionBar } from '../../../ui/SelectionBar';
import { hasAnyPermission, selectUser, useAuthStore } from '../../auth/store';
import { useBulk } from '../../bulk/useBulk';
import { CONFIDENCE, countryLabel, hostOf } from '../catalog';
import { SOURCE_BULK, useDeleteSource, useSources, useThreatsStatistics } from '../hooks';
import type { Source } from '../types';
import { SourceDrawer, SourceFormDialog } from './SourceDialogs';
import { SourceTable } from './tables';

const DEFAULT_ORDERING = '-created_at';
const PAGE_SIZES = [25, 50, 100];
const ORDERINGS = ['url', 'country', 'confident', 'last_status_code', 'last_checked', 'created_at'].flatMap((f) => [f, `-${f}`]);
const STATES = [
    { value: 'ok', label: 'Fetched' },
    { value: 'failing', label: 'Failing' },
    { value: 'unchecked', label: 'Not fetched yet' },
];

// URL parameters are prefixed with "s" so every tab keeps its own view.
export function SourcesTab() {
    const { params, update } = useUrlParams();
    const search = params.get('sq') ?? '';
    const filters = {
        confidence: ['1', '2', '3'].includes(params.get('sconf') ?? '') ? (params.get('sconf') as string) : '',
        status: STATES.some((s) => s.value === params.get('sstatus')) ? (params.get('sstatus') as string) : '',
        country: /^[A-Z]{2}$/.test(params.get('scountry') ?? '') ? (params.get('scountry') as string) : '',
    };
    const sort = params.get('ssort') ?? '';
    const ordering = ORDERINGS.includes(sort) ? sort : DEFAULT_ORDERING;
    const page = Math.max(1, Number(params.get('spage')) || 1);
    const size = Number(params.get('ssize'));
    const pageSize = PAGE_SIZES.includes(size) ? size : PAGE_SIZES[0];
    const sourceId = Number(params.get('source')) || null;

    const user = useAuthStore(selectUser);
    const canAdd = hasAnyPermission(user, 'threats_watcher.add_source');
    const canManage = hasAnyPermission(user, 'threats_watcher.change_source', 'threats_watcher.delete_source');

    const { data: stats } = useThreatsStatistics();
    const list = useSources(search, filters, { page, pageSize, ordering });
    const rows = list.data?.results ?? [];
    const remove = useDeleteSource();
    const bulk = useBulk(SOURCE_BULK);

    const [opened, setOpened] = useState<{ id: number; row?: Source } | null>(null);
    if (sourceId && opened?.id !== sourceId) setOpened({ id: sourceId, row: rows.find((r) => r.id === sourceId) });
    const [editing, setEditing] = useState<Source | null>(null);
    const [deleting, setDeleting] = useState<Source | null>(null);
    const [selected, setSelected] = useState<Set<number>>(new Set());
    const [confMenu, setConfMenu] = useState<HTMLElement | null>(null);
    const [bulkDelete, setBulkDelete] = useState(false);
    const clearSelection = () => setSelected(new Set());
    const isFiltered = !!(search || filters.confidence || filters.status || filters.country);
    const countries = stats?.sourcesByCountry ?? [];

    return (
        <>
            <Box sx={{ mb: 1.5, minHeight: 48 }}>
                {selected.size > 0 ? (
                    <SelectionBar count={selected.size} onClear={clearSelection}>
                        <Button size="small" variant="outlined" disabled={selected.size > BULK_MAX_ITEMS} onClick={(e) => setConfMenu(e.currentTarget)} aria-haspopup="menu">
                            Set reliability…
                        </Button>
                        <Menu anchorEl={confMenu} open={confMenu !== null} onClose={() => setConfMenu(null)}>
                            {CONFIDENCE.map((c) => (
                                <MenuItem
                                    key={c.value}
                                    onClick={() => {
                                        setConfMenu(null);
                                        void bulk.update([...selected], { confident: c.value }, `RSS sources - reliability ${c.label.toLowerCase()}`).then((done) => done && clearSelection());
                                    }}
                                >
                                    {c.label} - {c.percent}%
                                </MenuItem>
                            ))}
                        </Menu>
                        <Button size="small" variant="outlined" color="error" startIcon={<DeleteOutlined />} disabled={selected.size > BULK_MAX_ITEMS} onClick={() => setBulkDelete(true)}>
                            Delete
                        </Button>
                    </SelectionBar>
                ) : (
                    <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 1.5, alignItems: 'center' }}>
                        <SearchField resultCount={countOf(list)} value={search} onChange={(q) => update({ sq: q, spage: null })} placeholder="URL or country…" ariaLabel="Search sources" />
                        <TextField select size="small" label="Reliability" value={filters.confidence} onChange={(e) => update({ sconf: e.target.value, spage: null })} sx={{ minWidth: 140 }}>
                            <MenuItem value="">Any</MenuItem>
                            {CONFIDENCE.map((c) => (
                                <MenuItem key={c.value} value={String(c.value)}>
                                    {c.label} - {c.percent}%
                                </MenuItem>
                            ))}
                        </TextField>
                        <TextField select size="small" label="Last fetch" value={filters.status} onChange={(e) => update({ sstatus: e.target.value, spage: null })} sx={{ minWidth: 150 }}>
                            <MenuItem value="">Any</MenuItem>
                            {STATES.map((s) => (
                                <MenuItem key={s.value} value={s.value}>
                                    {s.label}
                                </MenuItem>
                            ))}
                        </TextField>
                        <TextField select size="small" label="Country" value={filters.country} onChange={(e) => update({ scountry: e.target.value, spage: null })} sx={{ minWidth: 160 }}>
                            <MenuItem value="">Any</MenuItem>
                            {countries.map((c) => (
                                <MenuItem key={c.code} value={c.code}>
                                    {countryLabel(c.code, c.country)} ({c.count})
                                </MenuItem>
                            ))}
                        </TextField>
                        {isFiltered && (
                            <Button size="small" color="inherit" startIcon={<FilterAltOffOutlined />} onClick={() => update({ sq: null, sconf: null, sstatus: null, scountry: null, spage: null })} sx={{ color: 'text.secondary' }}>
                                Clear
                            </Button>
                        )}
<ActiveFilters
    chips={[
        filters.confidence && { key: 'confidence', label: 'Reliability', value: (() => { const c = CONFIDENCE.find((x) => String(x.value) === filters.confidence); return c ? `${c.label} - ${c.percent}%` : filters.confidence; })(), onRemove: () => update({ sconf: '', spage: null }) },
        filters.status && { key: 'status', label: 'Last fetch', value: STATES.find((s) => s.value === filters.status)?.label ?? filters.status, onRemove: () => update({ sstatus: '', spage: null }) },
        filters.country && { key: 'country', label: 'Country', value: countryLabel(filters.country, countries.find((c) => c.code === filters.country)?.country ?? ''), onRemove: () => update({ scountry: '', spage: null }) },
    ]}
/>
                    </Stack>
                )}
            </Box>

            <Card>
                {list.error ? (
                    <MuiAlert severity="error" sx={{ m: 2 }}>
                        {getErrorMessage(list.error, 'Failed to load the sources.')}
                    </MuiAlert>
                ) : (
                    <>
                        <Box sx={{ opacity: list.isPlaceholderData ? 0.6 : 1, transition: 'opacity 120ms' }}>
                            <SourceTable highlight={search}
                                rows={rows}
                                loading={list.isPending}
                                ordering={ordering}
                                onOrderingChange={(o) => update({ ssort: o === DEFAULT_ORDERING ? null : o, spage: null })}
                                activeId={sourceId}
                                onOpen={(s) => {
                                    setOpened({ id: s.id, row: s });
                                    update({ source: s.id });
                                }}
                                selection={canManage ? selectionHandlers(setSelected, selected) : undefined}
                                empty={
                                    isFiltered ? (
                                        <EmptyState icon={<SearchOff />} title="No source matches these filters" />
                                    ) : (
                                        <EmptyState icon={<RssFeedOutlined />} title="No RSS source yet">
                                            {canAdd ? 'Add the feeds of the CERTs and security news sites Watcher should read.' : 'Sources added by analysts will appear here.'}
                                        </EmptyState>
                                    )
                                }
                            />
                        </Box>
                        <TablePagination
                            component="div"
                            count={list.data?.count ?? 0}
                            page={(list.data?.count ?? 0) === 0 ? 0 : page - 1}
                            onPageChange={(_, p) => update({ spage: p > 0 ? p + 1 : null })}
                            rowsPerPage={pageSize}
                            rowsPerPageOptions={PAGE_SIZES}
                            onRowsPerPageChange={(e) => update({ ssize: Number(e.target.value) === PAGE_SIZES[0] ? null : e.target.value, spage: null })}
                        />
                    </>
                )}
            </Card>

            <SourceDrawer
                open={sourceId !== null}
                id={opened?.id ?? null}
                initial={opened?.row}
                onClose={() => update({ source: null })}
                actions={canManage ? { edit: setEditing, remove: setDeleting } : undefined}
            />
            <SourceFormDialog open={params.get('dialog') === 'add-source' || editing !== null} source={editing} onClose={() => (editing ? setEditing(null) : update({ dialog: null }))} />
            <ConfirmDialog
                open={deleting !== null}
                title="Delete this source?"
                confirmLabel="Delete"
                danger
                pending={remove.isPending}
                onClose={() => setDeleting(null)}
                onConfirm={() =>
                    deleting &&
                    remove.mutate(deleting, {
                        onSuccess: () => {
                            setDeleting(null);
                            update({ source: null });
                        },
                    })
                }
            >
                Watcher stops reading <strong>{deleting ? hostOf(deleting.url) : ''}</strong>. The words already found stay.
            </ConfirmDialog>
            <ConfirmDialog
                open={bulkDelete}
                title={`Delete ${selected.size} source${selected.size === 1 ? '' : 's'}?`}
                confirmLabel={`Delete ${selected.size}`}
                danger
                onClose={() => setBulkDelete(false)}
                onConfirm={() => {
                    setBulkDelete(false);
                    void bulk.remove([...selected], 'RSS sources - delete').then((done) => done && clearSelection());
                }}
            >
                Watcher stops reading them. This cannot be undone.
            </ConfirmDialog>
        </>
    );
}
