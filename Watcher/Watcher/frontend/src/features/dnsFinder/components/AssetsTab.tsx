import { useState } from 'react';
import { Alert as MuiAlert, Box, Button, Card, TablePagination } from '@mui/material';
import DeleteOutlined from '@mui/icons-material/DeleteOutlined';
import DnsOutlined from '@mui/icons-material/DnsOutlined';
import SearchOff from '@mui/icons-material/SearchOff';
import { getErrorMessage } from '../../../api/client';
import { useUrlParams } from '../../../lib/useUrlParams';
import { ConfirmDialog } from '../../../ui/ConfirmDialog';
import { selectionHandlers } from '../../../ui/DataTable';
import { EmptyState } from '../../../ui/EmptyState';
import { countOf, SearchField } from '../../../ui/SearchField';
import { BULK_MAX_ITEMS, SelectionBar } from '../../../ui/SelectionBar';
import { useBulk } from '../../bulk/useBulk';
import { ASSET_KINDS } from '../catalog';
import { assetBulk, useAssets, useDeleteAsset } from '../hooks';
import type { Asset, AssetKind } from '../types';
import { AssetDrawer } from './AssetDrawer';
import { AssetTable } from './tables';
import { NO_THREAT_FILTERS, threatFilterParams } from './ThreatsTab';

const DEFAULT_ORDERING = '-created_at';
const PAGE_SIZES = [25, 50, 100];
const ORDERINGS = ['name', 'created_at', 'threats_count', 'open_threats_count', 'takeover_count', 'last_threat_at'].flatMap((f) => [f, `-${f}`]);

interface AssetsTabProps {
    kind: AssetKind;
    canAdd: boolean;
    canManage: boolean;
    onEdit: (asset: Asset) => void;
}

// URL parameters are prefixed ("d" for domains, "k" for keywords) so every tab keeps its own view.
export function AssetsTab({ kind, canAdd, canManage, onEdit }: AssetsTabProps) {
    const meta = ASSET_KINDS[kind];
    const p = meta.filterPrefix;
    const { params, update } = useUrlParams();
    const search = params.get(`${p}q`) ?? '';
    const sort = params.get(`${p}sort`) ?? '';
    const ordering = ORDERINGS.includes(sort) ? sort : DEFAULT_ORDERING;
    const page = Math.max(1, Number(params.get(`${p}page`)) || 1);
    const size = Number(params.get(`${p}size`));
    const pageSize = PAGE_SIZES.includes(size) ? size : PAGE_SIZES[0];
    const openId = Number(params.get(`${p}id`)) || null;

    const list = useAssets(kind, search, { page, pageSize, ordering });
    const rows = list.data?.results ?? [];
    const [opened, setOpened] = useState<{ id: number; row?: Asset } | null>(null);
    if (openId && opened?.id !== openId) setOpened({ id: openId, row: rows.find((r) => r.id === openId) });

    const [deleting, setDeleting] = useState<Asset | null>(null);
    const [bulkDelete, setBulkDelete] = useState(false);
    const [selected, setSelected] = useState<Set<number>>(new Set());
    const remove = useDeleteAsset(kind);
    const bulk = useBulk(assetBulk(kind));
    const clearSelection = () => setSelected(new Set());

    return (
        <>
            <Box sx={{ mb: 1.5, minHeight: 48 }}>
                {selected.size > 0 ? (
                    <SelectionBar count={selected.size} onClear={clearSelection}>
                        <Button size="small" variant="outlined" color="error" startIcon={<DeleteOutlined />} disabled={selected.size > BULK_MAX_ITEMS} onClick={() => setBulkDelete(true)}>
                            Delete
                        </Button>
                    </SelectionBar>
                ) : (
                    <SearchField resultCount={countOf(list)}
                        value={search}
                        onChange={(q) => update({ [`${p}q`]: q, [`${p}page`]: null })}
                        placeholder={`Search ${meta.many}…`}
                        ariaLabel={`Search ${meta.many} by name`}
                    />
                )}
            </Box>

            <Card>
                {list.error ? (
                    <MuiAlert severity="error" sx={{ m: 2 }}>
                        {getErrorMessage(list.error, `Failed to load the ${meta.many}.`)}
                    </MuiAlert>
                ) : (
                    <>
                        <Box sx={{ opacity: list.isPlaceholderData ? 0.6 : 1, transition: 'opacity 120ms' }}>
                            <AssetTable highlight={search}
                                kind={kind}
                                rows={rows}
                                loading={list.isPending}
                                ordering={ordering}
                                onOrderingChange={(o) => update({ [`${p}sort`]: o === DEFAULT_ORDERING ? null : o, [`${p}page`]: null })}
                                activeId={openId}
                                onOpen={(a) => {
                                    setOpened({ id: a.id, row: a });
                                    update({ [`${p}id`]: a.id });
                                }}
                                selection={canManage ? selectionHandlers(setSelected, selected) : undefined}
                                empty={
                                    search ? (
                                        <EmptyState icon={<SearchOff />} title={`No ${meta.one} matches this search`} />
                                    ) : (
                                        <EmptyState icon={<DnsOutlined />} title={`No ${meta.one} yet`}>
                                            {canAdd ? `Add the ${meta.many} Watcher should protect.` : `${meta.many} added by analysts will appear here.`}
                                        </EmptyState>
                                    )
                                }
                            />
                        </Box>
                        <TablePagination
                            component="div"
                            count={list.data?.count ?? 0}
                            page={(list.data?.count ?? 0) === 0 ? 0 : page - 1}
                            onPageChange={(_, n) => update({ [`${p}page`]: n > 0 ? n + 1 : null })}
                            rowsPerPage={pageSize}
                            rowsPerPageOptions={PAGE_SIZES}
                            onRowsPerPageChange={(e) => update({ [`${p}size`]: Number(e.target.value) === PAGE_SIZES[0] ? null : e.target.value, [`${p}page`]: null })}
                        />
                    </>
                )}
            </Card>

            <AssetDrawer
                kind={kind}
                open={openId !== null}
                id={opened?.id ?? null}
                initial={opened?.row}
                onClose={() => update({ [`${p}id`]: null })}
                onShowThreats={(a, takeoverOnly) =>
                    update({
                        ...threatFilterParams({
                            ...NO_THREAT_FILTERS,
                            status: 'all',
                            asset: `${p}:${a.name}`,
                            source: takeoverOnly ? 'subdomain_takeover' : '',
                        }),
                        tab: null,
                        [`${p}id`]: null,
                    })
                }
                actions={canManage ? { edit: onEdit, remove: setDeleting } : undefined}
            />

            <ConfirmDialog
                open={deleting !== null}
                title={`Delete this ${meta.one}?`}
                confirmLabel="Delete"
                danger
                pending={remove.isPending}
                onClose={() => setDeleting(null)}
                onConfirm={() =>
                    deleting &&
                    remove.mutate(deleting, {
                        onSuccess: () => {
                            setDeleting(null);
                            update({ [`${p}id`]: null });
                        },
                    })
                }
            >
                Watcher stops watching <strong>{deleting?.name}</strong>, and its {(deleting?.threats_count ?? 0).toLocaleString('en-GB')} threat
                {deleting?.threats_count === 1 ? ' is' : 's are'} deleted with it.
            </ConfirmDialog>

            <ConfirmDialog
                open={bulkDelete}
                title={`Delete ${selected.size} ${selected.size === 1 ? meta.one : meta.many}?`}
                confirmLabel={`Delete ${selected.size}`}
                danger
                onClose={() => setBulkDelete(false)}
                onConfirm={() => {
                    setBulkDelete(false);
                    void bulk.remove([...selected], `${meta.many} - delete`).then((done) => done && clearSelection());
                }}
            >
                Watcher stops watching them, and their threats are deleted with them. This cannot be undone.
            </ConfirmDialog>
        </>
    );
}
