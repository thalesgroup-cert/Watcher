import { useState } from 'react';
import { Alert as MuiAlert, Box, Button, Card, Menu, MenuItem, Stack, TablePagination, TextField } from '@mui/material';
import DeleteOutlined from '@mui/icons-material/DeleteOutlined';
import FilterAltOffOutlined from '@mui/icons-material/FilterAltOffOutlined';
import NotificationsActiveOutlined from '@mui/icons-material/NotificationsActiveOutlined';
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
import { LEVELS } from '../catalog';
import { KEYWORD_BULK, useDeleteKeyword, useKeywords, useSaveKeyword } from '../hooks';
import type { Level, MonitoredKeyword } from '../types';
import { KeywordDrawer } from './KeywordDrawer';
import { KeywordFormDialog } from './KeywordFormDialog';
import { KeywordTable } from './tables';

const DEFAULT_ORDERING = '-occurrences';
const PAGE_SIZES = [25, 50, 100];
const ORDERINGS = ['name', 'level', 'occurrences', 'last_seen', 'created_at'].flatMap((f) => [f, `-${f}`]);

// URL parameters are prefixed with "k" so every tab keeps its own view.
export function KeywordsTab() {
    const { params, update } = useUrlParams();
    const search = params.get('kq') ?? '';
    const level = LEVELS.some((l) => l.value === params.get('klevel')) ? (params.get('klevel') as Level) : '';
    const seen = ['yes', 'no'].includes(params.get('kseen') ?? '') ? (params.get('kseen') as string) : '';
    const kind = ['word', 'rule'].includes(params.get('kkind') ?? '') ? (params.get('kkind') as string) : '';
    const sort = params.get('ksort') ?? '';
    const ordering = ORDERINGS.includes(sort) ? sort : DEFAULT_ORDERING;
    const page = Math.max(1, Number(params.get('kpage')) || 1);
    const size = Number(params.get('ksize'));
    const pageSize = PAGE_SIZES.includes(size) ? size : PAGE_SIZES[0];
    const keywordId = Number(params.get('keyword')) || null;

    const user = useAuthStore(selectUser);
    const canAdd = hasAnyPermission(user, 'threats_watcher.add_monitoredkeyword');
    const canManage = hasAnyPermission(user, 'threats_watcher.change_monitoredkeyword', 'threats_watcher.delete_monitoredkeyword');

    const list = useKeywords(search, level, seen, kind, { page, pageSize, ordering });
    const rows = list.data?.results ?? [];
    const save = useSaveKeyword();
    const remove = useDeleteKeyword();
    const bulk = useBulk(KEYWORD_BULK);

    const [opened, setOpened] = useState<{ id: number; row?: MonitoredKeyword } | null>(null);
    if (keywordId && opened?.id !== keywordId) setOpened({ id: keywordId, row: rows.find((r) => r.id === keywordId) });
    const [editing, setEditing] = useState<MonitoredKeyword | null>(null);
    const [deleting, setDeleting] = useState<MonitoredKeyword | null>(null);
    const [selected, setSelected] = useState<Set<number>>(new Set());
    const [levelMenu, setLevelMenu] = useState<HTMLElement | null>(null);
    const [bulkDelete, setBulkDelete] = useState(false);
    const clearSelection = () => setSelected(new Set());
    const isFiltered = !!(search || level || seen || kind);
    const adding = params.get('dialog') === 'add-keyword';
    const toggle = (k: MonitoredKeyword) =>
        save.mutate({ id: k.id, input: { is_active: !k.is_active } }, { onSuccess: (r) => notifySuccess(`${r.name} ${r.is_active ? 'is watched again' : 'is paused'}`) });

    return (
        <>
            <Box sx={{ mb: 1.5, minHeight: 48 }}>
                {selected.size > 0 ? (
                    <SelectionBar count={selected.size} onClear={clearSelection}>
                        <Button size="small" variant="outlined" disabled={selected.size > BULK_MAX_ITEMS} onClick={(e) => setLevelMenu(e.currentTarget)} aria-haspopup="menu">
                            Set level…
                        </Button>
                        <Menu anchorEl={levelMenu} open={levelMenu !== null} onClose={() => setLevelMenu(null)}>
                            {LEVELS.map((l) => (
                                <MenuItem
                                    key={l.value}
                                    onClick={() => {
                                        setLevelMenu(null);
                                        void bulk.update([...selected], { level: l.value }, `Monitored keywords - ${l.label.toLowerCase()}`).then((done) => done && clearSelection());
                                    }}
                                >
                                    {l.label}
                                </MenuItem>
                            ))}
                        </Menu>
                        <Button size="small" variant="outlined" color="error" startIcon={<DeleteOutlined />} disabled={selected.size > BULK_MAX_ITEMS} onClick={() => setBulkDelete(true)}>
                            Delete
                        </Button>
                    </SelectionBar>
                ) : (
                    <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 1.5, alignItems: 'center' }}>
                        <SearchField resultCount={countOf(list)} value={search} onChange={(q) => update({ kq: q, kpage: null })} placeholder="Search keywords…" ariaLabel="Search monitored keywords" />
                        <TextField select size="small" label="Level" value={level} onChange={(e) => update({ klevel: e.target.value, kpage: null })} sx={{ minWidth: 140 }}>
                            <MenuItem value="">Any</MenuItem>
                            {LEVELS.map((l) => (
                                <MenuItem key={l.value} value={l.value}>
                                    {l.label}
                                </MenuItem>
                            ))}
                        </TextField>
                        <TextField select size="small" label="Seen" value={seen} onChange={(e) => update({ kseen: e.target.value, kpage: null })} sx={{ minWidth: 150 }}>
                            <MenuItem value="">Any</MenuItem>
                            <MenuItem value="yes">Seen in an article</MenuItem>
                            <MenuItem value="no">Not seen yet</MenuItem>
                        </TextField>
                        <TextField select size="small" label="Type" value={kind} onChange={(e) => update({ kkind: e.target.value, kpage: null })} sx={{ minWidth: 140 }}>
                            <MenuItem value="">Any</MenuItem>
                            <MenuItem value="word">Single words</MenuItem>
                            <MenuItem value="rule">Rules</MenuItem>
                        </TextField>
                        {isFiltered && (
                            <Button size="small" color="inherit" startIcon={<FilterAltOffOutlined />} onClick={() => update({ kq: null, klevel: null, kseen: null, kkind: null, kpage: null })} sx={{ color: 'text.secondary' }}>
                                Clear
                            </Button>
                        )}
<ActiveFilters
    chips={[
        level && { key: 'level', label: 'Level', value: LEVELS.find((l) => l.value === level)?.label ?? level, onRemove: () => update({ klevel: '', kpage: null }) },
        seen && { key: 'seen', label: 'Seen', value: seen === 'yes' ? 'Seen in an article' : 'Not seen yet', onRemove: () => update({ kseen: '', kpage: null }) },
        kind && { key: 'kind', label: 'Type', value: kind === 'rule' ? 'Rules' : 'Single words', onRemove: () => update({ kkind: '', kpage: null }) },
    ]}
/>
                    </Stack>
                )}
            </Box>

            <Card>
                {list.error ? (
                    <MuiAlert severity="error" sx={{ m: 2 }}>
                        {getErrorMessage(list.error, 'Failed to load the monitored keywords.')}
                    </MuiAlert>
                ) : (
                    <>
                        <Box sx={{ opacity: list.isPlaceholderData ? 0.6 : 1, transition: 'opacity 120ms' }}>
                            <KeywordTable highlight={search}
                                rows={rows}
                                loading={list.isPending}
                                ordering={ordering}
                                onOrderingChange={(o) => update({ ksort: o === DEFAULT_ORDERING ? null : o, kpage: null })}
                                activeId={keywordId}
                                onOpen={(k) => {
                                    setOpened({ id: k.id, row: k });
                                    update({ keyword: k.id });
                                }}
                                selection={canManage ? selectionHandlers(setSelected, selected) : undefined}
                                empty={
                                    isFiltered ? (
                                        <EmptyState icon={<SearchOff />} title="No keyword matches these filters" />
                                    ) : (
                                        <EmptyState icon={<NotificationsActiveOutlined />} title="No monitored keyword yet">
                                            {canAdd ? 'Add the words Watcher should alert on when they appear in the news.' : 'Keywords added by analysts will appear here.'}
                                        </EmptyState>
                                    )
                                }
                            />
                        </Box>
                        <TablePagination
                            component="div"
                            count={list.data?.count ?? 0}
                            page={(list.data?.count ?? 0) === 0 ? 0 : page - 1}
                            onPageChange={(_, p) => update({ kpage: p > 0 ? p + 1 : null })}
                            rowsPerPage={pageSize}
                            rowsPerPageOptions={PAGE_SIZES}
                            onRowsPerPageChange={(e) => update({ ksize: Number(e.target.value) === PAGE_SIZES[0] ? null : e.target.value, kpage: null })}
                        />
                    </>
                )}
            </Card>

            <KeywordDrawer
                open={keywordId !== null}
                id={opened?.id ?? null}
                initial={opened?.row}
                onClose={() => update({ keyword: null })}
                actions={canManage ? { edit: setEditing, remove: setDeleting, toggle } : undefined}
                pending={save.isPending}
            />
            <KeywordFormDialog
                open={adding || editing !== null}
                keyword={editing}
                onClose={() => (editing ? setEditing(null) : update({ dialog: null }))}
                onSaved={(k) => !editing && k.is_rule && update({ keyword: k.id })}
            />
            <ConfirmDialog
                open={deleting !== null}
                title="Stop monitoring this keyword?"
                confirmLabel="Delete"
                danger
                pending={remove.isPending}
                onClose={() => setDeleting(null)}
                onConfirm={() =>
                    deleting &&
                    remove.mutate(deleting, {
                        onSuccess: () => {
                            setDeleting(null);
                            update({ keyword: null });
                        },
                    })
                }
            >
                No more alert for <strong>{deleting?.name}</strong>; its history is deleted with it.
            </ConfirmDialog>
            <ConfirmDialog
                open={bulkDelete}
                title={`Delete ${selected.size} keyword${selected.size === 1 ? '' : 's'}?`}
                confirmLabel={`Delete ${selected.size}`}
                danger
                onClose={() => setBulkDelete(false)}
                onConfirm={() => {
                    setBulkDelete(false);
                    void bulk.remove([...selected], 'Monitored keywords - delete').then((done) => done && clearSelection());
                }}
            >
                No more alert for them. This cannot be undone.
            </ConfirmDialog>
        </>
    );
}
