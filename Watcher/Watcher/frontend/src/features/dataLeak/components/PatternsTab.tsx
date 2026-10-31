import { useState } from 'react';
import { Alert as MuiAlert, Box, Button, Card, TablePagination } from '@mui/material';
import DeleteOutlined from '@mui/icons-material/DeleteOutlined';
import SearchOff from '@mui/icons-material/SearchOff';
import TravelExploreOutlined from '@mui/icons-material/TravelExploreOutlined';
import { getErrorMessage } from '../../../api/client';
import { useUrlParams } from '../../../lib/useUrlParams';
import { ConfirmDialog } from '../../../ui/ConfirmDialog';
import { selectionHandlers } from '../../../ui/DataTable';
import { EmptyState } from '../../../ui/EmptyState';
import { countOf, SearchField } from '../../../ui/SearchField';
import { BULK_MAX_ITEMS, SelectionBar } from '../../../ui/SelectionBar';
import { useBulk } from '../../bulk/useBulk';
import { PATTERN_BULK, useDeletePattern, usePatterns } from '../hooks';
import type { Pattern } from '../types';
import { alertFilterParams } from './AlertsTab';
import { PatternDrawer } from './PatternDrawer';
import { PatternTable } from './tables';

const DEFAULT_ORDERING = '-created_at';
const PAGE_SIZES = [25, 50, 100];
const ORDERINGS = ['name', 'created_at', 'alerts_count', 'active_alerts_count', 'last_alert_at'].flatMap((f) => [f, `-${f}`]);

interface PatternsTabProps {
    canAdd: boolean;
    canManage: boolean;
    onEdit: (pattern: Pattern) => void;
}

// Parameters are prefixed with "p" so the alert filters survive a trip to this tab and back.
export function PatternsTab({ canAdd, canManage, onEdit }: PatternsTabProps) {
    const { params, update } = useUrlParams();
    const search = params.get('pq') ?? '';
    const sort = params.get('psort') ?? '';
    const ordering = ORDERINGS.includes(sort) ? sort : DEFAULT_ORDERING;
    const page = Math.max(1, Number(params.get('ppage')) || 1);
    const size = Number(params.get('psize'));
    const pageSize = PAGE_SIZES.includes(size) ? size : PAGE_SIZES[0];
    const patternId = Number(params.get('pattern')) || null;

    const list = usePatterns(search, { page, pageSize, ordering });
    const rows = list.data?.results ?? [];
    const [opened, setOpened] = useState<{ id: number; row?: Pattern } | null>(null);
    if (patternId && opened?.id !== patternId) setOpened({ id: patternId, row: rows.find((r) => r.id === patternId) });

    const [deleting, setDeleting] = useState<Pattern | null>(null);
    const [bulkDelete, setBulkDelete] = useState(false);
    const [selected, setSelected] = useState<Set<number>>(new Set());
    const remove = useDeletePattern();
    const bulk = useBulk(PATTERN_BULK);
    const clearSelection = () => setSelected(new Set());

    return (
        <>
            <Box sx={{ mb: 1.5, minHeight: 48 }}>
                {selected.size > 0 ? (
                    <SelectionBar count={selected.size} onClear={clearSelection}>
                        <Button
                            size="small"
                            variant="outlined"
                            color="error"
                            startIcon={<DeleteOutlined />}
                            disabled={selected.size > BULK_MAX_ITEMS}
                            onClick={() => setBulkDelete(true)}
                        >
                            Delete
                        </Button>
                    </SelectionBar>
                ) : (
                    <SearchField resultCount={countOf(list)} value={search} onChange={(q) => update({ pq: q, ppage: null })} placeholder="Search patterns…" ariaLabel="Search patterns by name" />
                )}
            </Box>

            <Card>
                {list.error ? (
                    <MuiAlert severity="error" sx={{ m: 2 }}>
                        {getErrorMessage(list.error, 'Failed to load the search patterns.')}
                    </MuiAlert>
                ) : (
                    <>
                        <Box sx={{ opacity: list.isPlaceholderData ? 0.6 : 1, transition: 'opacity 120ms' }}>
                            <PatternTable highlight={search}
                                rows={rows}
                                loading={list.isPending}
                                ordering={ordering}
                                onOrderingChange={(o) => update({ psort: o === DEFAULT_ORDERING ? null : o, ppage: null })}
                                activeId={patternId}
                                onOpen={(p) => {
                                    setOpened({ id: p.id, row: p });
                                    update({ pattern: p.id });
                                }}
                                selection={canManage ? selectionHandlers(setSelected, selected) : undefined}
                                empty={
                                    search ? (
                                        <EmptyState icon={<SearchOff />} title="No pattern matches this search" />
                                    ) : (
                                        <EmptyState icon={<TravelExploreOutlined />} title="No search pattern yet">
                                            {canAdd ? 'Add the names, domains or secrets you want Watcher to look for.' : 'Patterns added by analysts will appear here.'}
                                        </EmptyState>
                                    )
                                }
                            />
                        </Box>
                        <TablePagination
                            component="div"
                            count={list.data?.count ?? 0}
                            page={(list.data?.count ?? 0) === 0 ? 0 : page - 1}
                            onPageChange={(_, p) => update({ ppage: p > 0 ? p + 1 : null })}
                            rowsPerPage={pageSize}
                            rowsPerPageOptions={PAGE_SIZES}
                            onRowsPerPageChange={(e) => update({ psize: Number(e.target.value) === PAGE_SIZES[0] ? null : e.target.value, ppage: null })}
                        />
                    </>
                )}
            </Card>

            <PatternDrawer
                open={patternId !== null}
                id={opened?.id ?? null}
                initial={opened?.row}
                onClose={() => update({ pattern: null })}
                onShowAlerts={(p) =>
                    update({ ...alertFilterParams({ status: 'all', search: '', keyword: String(p.id), source: '', period: '' }), tab: null, pattern: null })
                }
                actions={canManage ? { edit: onEdit, remove: setDeleting } : undefined}
            />

            <ConfirmDialog
                open={deleting !== null}
                title="Delete this search pattern?"
                confirmLabel="Delete"
                danger
                pending={remove.isPending}
                onClose={() => setDeleting(null)}
                onConfirm={() =>
                    deleting &&
                    remove.mutate(deleting, {
                        onSuccess: () => {
                            setDeleting(null);
                            update({ pattern: null });
                        },
                    })
                }
            >
                Watcher stops looking for <strong>{deleting?.name}</strong>, and its {deleting?.alerts_count ?? 0} alert
                {deleting?.alerts_count === 1 ? ' is' : 's are'} deleted with it.
            </ConfirmDialog>

            <ConfirmDialog
                open={bulkDelete}
                title={`Delete ${selected.size} search pattern${selected.size === 1 ? '' : 's'}?`}
                confirmLabel={`Delete ${selected.size}`}
                danger
                onClose={() => setBulkDelete(false)}
                onConfirm={() => {
                    setBulkDelete(false);
                    void bulk.remove([...selected], 'Search patterns - delete').then((done) => done && clearSelection());
                }}
            >
                Watcher stops looking for them, and their alerts are deleted with them. This cannot be undone.
            </ConfirmDialog>
        </>
    );
}
