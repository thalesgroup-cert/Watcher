import { useState } from 'react';
import { Alert as MuiAlert, Box, Button, Card, MenuItem, Stack, TablePagination, TextField } from '@mui/material';
import DeleteOutlined from '@mui/icons-material/DeleteOutlined';
import FilterAltOffOutlined from '@mui/icons-material/FilterAltOffOutlined';
import PauseCircleOutline from '@mui/icons-material/PauseCircleOutlined';
import PlayCircleOutline from '@mui/icons-material/PlayCircleOutlined';
import RuleOutlined from '@mui/icons-material/RuleOutlined';
import SearchOff from '@mui/icons-material/SearchOff';
import { getErrorMessage } from '../../../api/client';
import { notifySuccess } from '../../../lib/notify';
import { useUrlParams } from '../../../lib/useUrlParams';
import { ConfirmDialog } from '../../../ui/ConfirmDialog';
import { selectionHandlers } from '../../../ui/DataTable';
import { EmptyState } from '../../../ui/EmptyState';
import { countOf, SearchField } from '../../../ui/SearchField';
import { ActiveFilters } from '../../../ui/ActiveFilters';
import { BULK_MAX_ITEMS, SelectionBar } from '../../../ui/SelectionBar';
import { hasAnyPermission, selectUser, useAuthStore } from '../../auth/store';
import { useBulk } from '../../bulk/useBulk';
import { SCOPES } from '../catalog';
import { RULE_BULK, useDeleteRule, useRules, useSaveRule } from '../hooks';
import type { Match, Rule } from '../types';
import { RuleDrawer } from './RuleDrawer';
import { RuleFormDialog } from './RuleFormDialog';
import { RuleTable } from './tables';

const DEFAULT_ORDERING = '-open_hits_count';
const PAGE_SIZES = [25, 50, 100];
const ORDERINGS = ['name', 'scope', 'open_hits_count', 'hits_count', 'last_hit_at'].flatMap((f) => [f, `-${f}`]);

interface RulesTabProps {
    onOpenMatch: (m: Match) => void;
    onShowMatches: (rule: Rule) => void;
}

// URL parameters are prefixed with "r" so every tab keeps its own view.
export function RulesTab({ onOpenMatch, onShowMatches }: RulesTabProps) {
    const { params, update } = useUrlParams();
    const search = params.get('rq') ?? '';
    const scope = SCOPES.some((s) => s.value === params.get('rscope')) ? (params.get('rscope') as string) : '';
    const active = ['yes', 'no'].includes(params.get('ractive') ?? '') ? (params.get('ractive') as string) : '';
    const sort = params.get('rsort') ?? '';
    const ordering = ORDERINGS.includes(sort) ? sort : DEFAULT_ORDERING;
    const page = Math.max(1, Number(params.get('rpage')) || 1);
    const size = Number(params.get('rsize'));
    const pageSize = PAGE_SIZES.includes(size) ? size : PAGE_SIZES[0];
    const ruleId = Number(params.get('rule')) || null;

    const user = useAuthStore(selectUser);
    const canAdd = hasAnyPermission(user, 'cyber_watch.add_watchrule');
    const canChange = hasAnyPermission(user, 'cyber_watch.change_watchrule');
    const canDelete = hasAnyPermission(user, 'cyber_watch.delete_watchrule');

    const list = useRules(search, scope, active, { page, pageSize, ordering });
    const rows = list.data?.results ?? [];
    const save = useSaveRule();
    const remove = useDeleteRule();
    const bulk = useBulk(RULE_BULK);

    const [opened, setOpened] = useState<{ id: number; row?: Rule } | null>(null);
    if (ruleId && opened?.id !== ruleId) setOpened({ id: ruleId, row: rows.find((r) => r.id === ruleId) });
    const [editing, setEditing] = useState<Rule | null>(null);
    const [deleting, setDeleting] = useState<Rule | null>(null);
    const [selected, setSelected] = useState<Set<number>>(new Set());
    const [bulkDelete, setBulkDelete] = useState(false);
    const clearSelection = () => setSelected(new Set());
    const isFiltered = !!(search || scope || active);
    const toggle = (rule: Rule) =>
        save.mutate({ id: rule.id, input: { is_active: !rule.is_active } }, { onSuccess: (r) => notifySuccess(`${r.name} ${r.is_active ? 'is watching again' : 'is paused'}`) });

    return (
        <>
            <Box sx={{ mb: 1.5, minHeight: 48 }}>
                {selected.size > 0 ? (
                    <SelectionBar count={selected.size} onClear={clearSelection}>
                        <Button
                            size="small"
                            variant="outlined"
                            startIcon={<PlayCircleOutline />}
                            disabled={selected.size > BULK_MAX_ITEMS}
                            onClick={() => void bulk.update([...selected], { is_active: true }, 'Watch rules - resume').then((done) => done && clearSelection())}
                        >
                            Resume
                        </Button>
                        <Button
                            size="small"
                            variant="outlined"
                            startIcon={<PauseCircleOutline />}
                            disabled={selected.size > BULK_MAX_ITEMS}
                            onClick={() => void bulk.update([...selected], { is_active: false }, 'Watch rules - pause').then((done) => done && clearSelection())}
                        >
                            Pause
                        </Button>
                        {canDelete && (
                            <Button size="small" variant="outlined" color="error" startIcon={<DeleteOutlined />} disabled={selected.size > BULK_MAX_ITEMS} onClick={() => setBulkDelete(true)}>
                                Delete
                            </Button>
                        )}
                    </SelectionBar>
                ) : (
                    <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 1.5, alignItems: 'center' }}>
                        <SearchField resultCount={countOf(list)} value={search} onChange={(q) => update({ rq: q, rpage: null })} placeholder="Name or keyword…" ariaLabel="Search watch rules" />
                        <TextField select size="small" label="Watches" value={scope} onChange={(e) => update({ rscope: e.target.value, rpage: null })} sx={{ minWidth: 170 }}>
                            <MenuItem value="">Any</MenuItem>
                            {SCOPES.map((s) => (
                                <MenuItem key={s.value} value={s.value}>
                                    {s.label}
                                </MenuItem>
                            ))}
                        </TextField>
                        <TextField select size="small" label="State" value={active} onChange={(e) => update({ ractive: e.target.value, rpage: null })} sx={{ minWidth: 130 }}>
                            <MenuItem value="">Any</MenuItem>
                            <MenuItem value="yes">Active</MenuItem>
                            <MenuItem value="no">Paused</MenuItem>
                        </TextField>
                        {isFiltered && (
                            <Button size="small" color="inherit" startIcon={<FilterAltOffOutlined />} onClick={() => update({ rq: null, rscope: null, ractive: null, rpage: null })} sx={{ color: 'text.secondary' }}>
                                Clear
                            </Button>
                        )}
<ActiveFilters
    chips={[
        scope && { key: 'scope', label: 'Watches', value: SCOPES.find((s) => s.value === scope)?.label ?? scope, onRemove: () => update({ rscope: '', rpage: null }) },
        active && { key: 'active', label: 'State', value: active === 'yes' ? 'Active' : 'Paused', onRemove: () => update({ ractive: '', rpage: null }) },
    ]}
/>
                    </Stack>
                )}
            </Box>

            <Card>
                {list.error ? (
                    <MuiAlert severity="error" sx={{ m: 2 }}>
                        {getErrorMessage(list.error, 'Failed to load the watch rules.')}
                    </MuiAlert>
                ) : (
                    <>
                        <Box sx={{ opacity: list.isPlaceholderData ? 0.6 : 1, transition: 'opacity 120ms' }}>
                            <RuleTable highlight={search}
                                rows={rows}
                                loading={list.isPending}
                                ordering={ordering}
                                onOrderingChange={(o) => update({ rsort: o === DEFAULT_ORDERING ? null : o, rpage: null })}
                                activeId={ruleId}
                                onOpen={(r) => {
                                    setOpened({ id: r.id, row: r });
                                    update({ rule: r.id });
                                }}
                                selection={canChange ? selectionHandlers(setSelected, selected) : undefined}
                                empty={
                                    isFiltered ? (
                                        <EmptyState icon={<SearchOff />} title="No rule matches these filters" />
                                    ) : (
                                        <EmptyState icon={<RuleOutlined />} title="No watch rule yet">
                                            {canAdd ? (
                                                <Button size="small" onClick={() => update({ dialog: 'add-rule' })}>
                                                    Write the first rule
                                                </Button>
                                            ) : (
                                                'Rules written by analysts will appear here.'
                                            )}
                                        </EmptyState>
                                    )
                                }
                            />
                        </Box>
                        <TablePagination
                            component="div"
                            count={list.data?.count ?? 0}
                            page={(list.data?.count ?? 0) === 0 ? 0 : page - 1}
                            onPageChange={(_, p) => update({ rpage: p > 0 ? p + 1 : null })}
                            rowsPerPage={pageSize}
                            rowsPerPageOptions={PAGE_SIZES}
                            onRowsPerPageChange={(e) => update({ rsize: Number(e.target.value) === PAGE_SIZES[0] ? null : e.target.value, rpage: null })}
                        />
                    </>
                )}
            </Card>

            <RuleDrawer
                open={ruleId !== null}
                id={opened?.id ?? null}
                initial={opened?.row}
                onClose={() => update({ rule: null })}
                onOpenMatch={onOpenMatch}
                onShowMatches={onShowMatches}
                pending={save.isPending}
                actions={canChange ? { edit: setEditing, toggle, remove: canDelete ? setDeleting : undefined } : undefined}
            />
            <RuleFormDialog
                open={params.get('dialog') === 'add-rule' || editing !== null}
                rule={editing}
                onClose={() => (editing ? setEditing(null) : update({ dialog: null }))}
                onSaved={(r) => !editing && update({ rule: r.id, dialog: null })}
            />
            <ConfirmDialog
                open={deleting !== null}
                title="Delete this watch rule?"
                confirmLabel="Delete"
                danger
                pending={remove.isPending}
                onClose={() => setDeleting(null)}
                onConfirm={() =>
                    deleting &&
                    remove.mutate(deleting, {
                        onSuccess: () => {
                            setDeleting(null);
                            update({ rule: null });
                        },
                    })
                }
            >
                <strong>{deleting?.name}</strong> stops watching, and its {deleting?.hits_count ?? 0} match{deleting?.hits_count === 1 ? '' : 'es'} are deleted with it. Pause it instead to keep them.
            </ConfirmDialog>
            <ConfirmDialog
                open={bulkDelete}
                title={`Delete ${selected.size} watch rule${selected.size === 1 ? '' : 's'}?`}
                confirmLabel={`Delete ${selected.size}`}
                danger
                onClose={() => setBulkDelete(false)}
                onConfirm={() => {
                    setBulkDelete(false);
                    void bulk.remove([...selected], 'Watch rules - delete').then((done) => done && clearSelection());
                }}
            >
                Their matches are deleted with them. This cannot be undone.
            </ConfirmDialog>
        </>
    );
}
