import { useState } from 'react';
import { Alert as MuiAlert, Box, Button, Card, IconButton, Stack, TablePagination, Typography } from '@mui/material';
import BlockOutlined from '@mui/icons-material/BlockOutlined';
import Close from '@mui/icons-material/Close';
import DeleteOutlined from '@mui/icons-material/DeleteOutlined';
import EditOutlined from '@mui/icons-material/EditOutlined';
import SearchOff from '@mui/icons-material/SearchOff';
import { getErrorMessage } from '../../../api/client';
import { useUrlParams } from '../../../lib/useUrlParams';
import { ConfirmDialog } from '../../../ui/ConfirmDialog';
import { selectionHandlers } from '../../../ui/DataTable';
import { EmptyState } from '../../../ui/EmptyState';
import { countOf, SearchField } from '../../../ui/SearchField';
import { BULK_MAX_ITEMS, SelectionBar } from '../../../ui/SelectionBar';
import { SideDrawer } from '../../../ui/SideDrawer';
import { hasAnyPermission, selectUser, useAuthStore } from '../../auth/store';
import { useBulk } from '../../bulk/useBulk';
import { ObjectHistory } from '../../timeline/components/ObjectHistory';
import { formatDateTime } from '../../timeline/format';
import { BANNED_BULK, BANNED_TYPE, useBanned, useDeleteBanned, useSaveBanned } from '../hooks';
import type { BannedWord } from '../types';
import { NameFormDialog } from './NameFormDialog';
import { BannedTable } from './tables';

const DEFAULT_ORDERING = '-created_at';
const PAGE_SIZES = [25, 50, 100];
const ORDERINGS = ['name', 'created_at'].flatMap((f) => [f, `-${f}`]);

export const BANNED_FORM = {
    one: 'banned word',
    many: 'banned words',
    help: 'Words that never trend, e.g. common words of the feeds ("update", "blog"). Banning a word does not delete what was already found.',
    placeholder: 'newsletter',
    bulk: BANNED_BULK,
};

// URL parameters are prefixed with "b" so every tab keeps its own view.
export function BannedTab() {
    const { params, update } = useUrlParams();
    const search = params.get('bq') ?? '';
    const sort = params.get('bsort') ?? '';
    const ordering = ORDERINGS.includes(sort) ? sort : DEFAULT_ORDERING;
    const page = Math.max(1, Number(params.get('bpage')) || 1);
    const size = Number(params.get('bsize'));
    const pageSize = PAGE_SIZES.includes(size) ? size : PAGE_SIZES[0];
    const bannedId = Number(params.get('banned')) || null;

    const user = useAuthStore(selectUser);
    const canManage = hasAnyPermission(user, 'threats_watcher.change_bannedword', 'threats_watcher.delete_bannedword');
    const list = useBanned(search, { page, pageSize, ordering }, true);
    const rows = list.data?.results ?? [];
    const save = useSaveBanned();
    const remove = useDeleteBanned();
    const bulk = useBulk(BANNED_BULK);

    const [opened, setOpened] = useState<BannedWord | null>(null);
    if (bannedId && opened?.id !== bannedId) {
        const row = rows.find((r) => r.id === bannedId);
        if (row) setOpened(row);
    }
    const [editing, setEditing] = useState<BannedWord | null>(null);
    const [deleting, setDeleting] = useState<BannedWord | null>(null);
    const [selected, setSelected] = useState<Set<number>>(new Set());
    const [bulkDelete, setBulkDelete] = useState(false);
    const clearSelection = () => setSelected(new Set());

    return (
        <>
            <Box sx={{ mb: 1.5, minHeight: 48 }}>
                {selected.size > 0 ? (
                    <SelectionBar count={selected.size} onClear={clearSelection}>
                        <Button size="small" variant="outlined" color="error" startIcon={<DeleteOutlined />} disabled={selected.size > BULK_MAX_ITEMS} onClick={() => setBulkDelete(true)}>
                            Unban
                        </Button>
                    </SelectionBar>
                ) : (
                    <SearchField resultCount={countOf(list)} value={search} onChange={(q) => update({ bq: q, bpage: null })} placeholder="Search banned words…" ariaLabel="Search banned words" />
                )}
            </Box>
            <Card>
                {list.error ? (
                    <MuiAlert severity="error" sx={{ m: 2 }}>
                        {getErrorMessage(list.error, 'Failed to load the banned words.')}
                    </MuiAlert>
                ) : (
                    <>
                        <Box sx={{ opacity: list.isPlaceholderData ? 0.6 : 1, transition: 'opacity 120ms' }}>
                            <BannedTable highlight={search}
                                rows={rows}
                                loading={list.isPending}
                                ordering={ordering}
                                onOrderingChange={(o) => update({ bsort: o === DEFAULT_ORDERING ? null : o, bpage: null })}
                                activeId={bannedId}
                                onOpen={(b) => {
                                    setOpened(b);
                                    update({ banned: b.id });
                                }}
                                selection={canManage ? selectionHandlers(setSelected, selected) : undefined}
                                empty={
                                    search ? (
                                        <EmptyState icon={<SearchOff />} title="No banned word matches this search" />
                                    ) : (
                                        <EmptyState icon={<BlockOutlined />} title="No banned word">
                                            Ban the words that come up often but say nothing about threats.
                                        </EmptyState>
                                    )
                                }
                            />
                        </Box>
                        <TablePagination
                            component="div"
                            count={list.data?.count ?? 0}
                            page={(list.data?.count ?? 0) === 0 ? 0 : page - 1}
                            onPageChange={(_, p) => update({ bpage: p > 0 ? p + 1 : null })}
                            rowsPerPage={pageSize}
                            rowsPerPageOptions={PAGE_SIZES}
                            onRowsPerPageChange={(e) => update({ bsize: Number(e.target.value) === PAGE_SIZES[0] ? null : e.target.value, bpage: null })}
                        />
                    </>
                )}
            </Card>

            <SideDrawer open={bannedId !== null} onClose={() => update({ banned: null })} labelledBy="banned-drawer-title">
                <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', px: 2.5, py: 2 }}>
                    <Box sx={{ minWidth: 0, flexGrow: 1 }}>
                        <Typography variant="overline" color="text.secondary" sx={{ lineHeight: 1.4, display: 'block' }}>
                            Banned word
                        </Typography>
                        <Typography id="banned-drawer-title" variant="h3" component="h2" noWrap>
                            {opened?.name}
                        </Typography>
                    </Box>
                    <IconButton aria-label="Close details" onClick={() => update({ banned: null })} edge="end">
                        <Close />
                    </IconButton>
                </Stack>
                {opened && (
                    <Box sx={{ px: 2.5, pb: 2 }}>
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                            Banned {formatDateTime(opened.created_at)}. It never appears in the trends while it is banned.
                        </Typography>
                        {canManage && (
                            <Stack direction="row" spacing={1}>
                                <Button size="small" variant="outlined" startIcon={<EditOutlined />} onClick={() => setEditing(opened)}>
                                    Edit
                                </Button>
                                <Button size="small" variant="outlined" color="error" startIcon={<DeleteOutlined />} onClick={() => setDeleting(opened)}>
                                    Unban
                                </Button>
                            </Stack>
                        )}
                        <Typography variant="overline" color="text.secondary" component="h3" sx={{ display: 'block', mt: 2, mb: 1 }}>
                            History
                        </Typography>
                        <ObjectHistory targets={[{ contentType: BANNED_TYPE, objectId: opened.id }]} enabled={bannedId !== null} />
                    </Box>
                )}
            </SideDrawer>

            <NameFormDialog
                open={params.get('dialog') === 'add-banned' || editing !== null}
                config={BANNED_FORM}
                item={editing}
                pending={save.isPending}
                save={(input, onSuccess) => save.mutate({ id: input.id, name: input.name }, { onSuccess })}
                onClose={() => (editing ? setEditing(null) : update({ dialog: null }))}
            />
            <ConfirmDialog
                open={deleting !== null}
                title="Unban this word?"
                confirmLabel="Unban"
                danger
                pending={remove.isPending}
                onClose={() => setDeleting(null)}
                onConfirm={() =>
                    deleting &&
                    remove.mutate(deleting, {
                        onSuccess: () => {
                            setDeleting(null);
                            update({ banned: null });
                        },
                    })
                }
            >
                <strong>{deleting?.name}</strong> can trend again from the next run.
            </ConfirmDialog>
            <ConfirmDialog
                open={bulkDelete}
                title={`Unban ${selected.size} word${selected.size === 1 ? '' : 's'}?`}
                confirmLabel={`Unban ${selected.size}`}
                danger
                onClose={() => setBulkDelete(false)}
                onConfirm={() => {
                    setBulkDelete(false);
                    void bulk.remove([...selected], 'Banned words - unban').then((done) => done && clearSelection());
                }}
            >
                They can trend again from the next run.
            </ConfirmDialog>
        </>
    );
}
