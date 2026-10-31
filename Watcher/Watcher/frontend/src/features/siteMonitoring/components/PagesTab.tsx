import { useState } from 'react';
import {
    Alert as MuiAlert,
    Box,
    Button,
    Card,
    Chip,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    FormControlLabel,
    InputAdornment,
    MenuItem,
    Stack,
    Switch,
    TablePagination,
    TextField,
    Typography,
} from '@mui/material';
import ArticleOutlined from '@mui/icons-material/ArticleOutlined';
import DeleteOutlined from '@mui/icons-material/DeleteOutlined';
import FilterAltOffOutlined from '@mui/icons-material/FilterAltOffOutlined';
import PauseCircleOutline from '@mui/icons-material/PauseCircleOutlined';
import PlayCircleOutline from '@mui/icons-material/PlayCircleOutlined';
import SearchOff from '@mui/icons-material/SearchOff';
import { getErrorMessage } from '../../../api/client';
import { notifySuccess } from '../../../lib/notify';
import { useUrlParams } from '../../../lib/useUrlParams';
import { fonts } from '../../../styles/theme';
import { ConfirmDialog } from '../../../ui/ConfirmDialog';
import { type Column, DataTable, selectionHandlers } from '../../../ui/DataTable';
import { EmptyState } from '../../../ui/EmptyState';
import { countOf, SearchField } from '../../../ui/SearchField';
import { BULK_MAX_ITEMS, SelectionBar } from '../../../ui/SelectionBar';
import { When } from '../../../ui/When';
import { hasAnyPermission, selectUser, useAuthStore } from '../../auth/store';
import { useBulk } from '../../bulk/useBulk';
import { PAGE_BULK, useDeletePage, usePages, useSavePage } from '../hooks';
import type { MonitoredPage } from '../types';
import { PageDrawer } from './PageDrawer';

const DEFAULT_ORDERING = '-last_changed';
const PAGE_SIZES = [25, 50, 100];
const ORDERINGS = ['name', 'last_checked', 'last_changed', 'last_status', 'threshold', 'versions_count'].flatMap((f) => [f, `-${f}`]);
const INTERVALS = [
    { minutes: 15, label: '15 minutes' },
    { minutes: 60, label: 'Hour' },
    { minutes: 360, label: '6 hours' },
    { minutes: 1440, label: 'Day' },
    { minutes: 10080, label: 'Week' },
];

/** Answer of the last check: nothing is said about a page that was never checked. */
function StatusChip({ page }: { page: MonitoredPage }) {
    if (!page.last_checked) return <Chip size="small" variant="outlined" label="Not checked yet" />;
    if (page.last_status === 200) return <Chip size="small" color="success" variant="outlined" label="Online" />;
    return <Chip size="small" color="warning" variant="outlined" label={page.last_status ? `HTTP ${page.last_status}` : 'No answer'} />;
}

const COLUMNS: Column<MonitoredPage>[] = [
    {
        key: 'page',
        label: 'Page',
        sort: 'name',
        cellSx: { maxWidth: 420 },
        render: (p) => (
            <Box sx={{ minWidth: 0 }}>
                <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
                    {p.name || p.url}
                </Typography>
                {p.name && (
                    <Typography variant="caption" color="text.secondary" noWrap component="div" sx={{ fontFamily: fonts.mono }}>
                        {p.url}
                    </Typography>
                )}
            </Box>
        ),
    },
    {
        key: 'state',
        label: 'State',
        sort: 'last_status',
        width: 150,
        render: (p) => (
            <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
                <StatusChip page={p} />
                {!p.is_active && <Chip size="small" label="Paused" />}
            </Stack>
        ),
    },
    { key: 'threshold', label: 'Notified from', sort: 'threshold', width: 120, render: (p) => `${p.threshold} %` },
    { key: 'versions', label: 'Versions', sort: 'versions_count', width: 100, align: 'right', render: (p) => p.versions_count },
    {
        key: 'changed',
        label: 'Last change',
        sort: 'last_changed',
        width: 160,
        render: (p) => (
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                <When iso={p.last_changed} empty="Never" />
                {p.last_ratio !== null && p.last_changed && (
                    <Typography variant="caption" color="text.secondary">
                        {p.last_ratio} %
                    </Typography>
                )}
            </Stack>
        ),
    },
    { key: 'checked', label: 'Last check', sort: 'last_checked', width: 130, render: (p) => <When iso={p.last_checked} empty="Never" /> },
];

function PageForm({ page, onClose, onSaved }: { page: MonitoredPage | null; onClose: () => void; onSaved?: (page: MonitoredPage) => void }) {
    const [url, setUrl] = useState(page?.url ?? '');
    const [name, setName] = useState(page?.name ?? '');
    const [selector, setSelector] = useState(page?.css_selector ?? '');
    const [ignore, setIgnore] = useState(page?.ignore_patterns ?? '');
    const [threshold, setThreshold] = useState(String(page?.threshold ?? 5));
    const [interval, setInterval] = useState(page?.check_interval ?? 60);
    const [active, setActive] = useState(page?.is_active ?? true);
    const [screenshots, setScreenshots] = useState(page?.capture_screenshots ?? true);
    const save = useSavePage();
    const blocked = !url.trim() || !(Number(threshold) >= 1 && Number(threshold) <= 100) || save.isPending;

    const submit = () => {
        if (blocked) return;
        save.mutate(
            { id: page?.id, input: { url: url.trim(), name: name.trim(), css_selector: selector.trim(), ignore_patterns: ignore, threshold: Number(threshold), check_interval: interval, capture_screenshots: screenshots, is_active: active } },
            {
                onSuccess: (saved) => {
                    onSaved?.(saved);
                    onClose();
                },
            },
        );
    };
    const apiErrors = save.error ? getErrorMessage(save.error, 'The page could not be saved.') : null;

    return (
        <form
            noValidate
            onSubmit={(e) => {
                e.preventDefault();
                submit();
            }}
        >
            <DialogTitle id="page-form-title">{page ? `Edit ${page.name || page.url}` : 'Monitor a page'}</DialogTitle>
            <DialogContent>
                <Stack spacing={2} sx={{ pt: 1 }}>
                    <Typography variant="body2" color="text.secondary">
                        Watcher keeps the text of the page and tells you when it changes enough: dates, counters, menus and scripts are ignored. Use it for pages that have no RSS feed.
                    </Typography>
                    {apiErrors && <MuiAlert severity="error">{apiErrors}</MuiAlert>}
                    <TextField label="Page address" name="url" required value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://blog.example.org/research" fullWidth autoFocus />
                    <TextField label="Name" name="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Example researcher blog" helperText="Shown in the lists and in the notifications" fullWidth />
                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                        <TextField
                            label="Notify when"
                            name="threshold"
                            type="number"
                            value={threshold}
                            onChange={(e) => setThreshold(e.target.value)}
                            slotProps={{ htmlInput: { min: 1, max: 100 }, input: { endAdornment: <InputAdornment position="end">% changed</InputAdornment> } }}
                            helperText="Smaller changes are kept in the history only"
                            fullWidth
                        />
                        <TextField select label="Check every" value={interval} onChange={(e) => setInterval(Number(e.target.value))} fullWidth>
                            {INTERVALS.map((i) => (
                                <MenuItem key={i.minutes} value={i.minutes}>
                                    {i.label}
                                </MenuItem>
                            ))}
                        </TextField>
                    </Stack>
                    <TextField
                        label="Part of the page"
                        name="css_selector"
                        value={selector}
                        onChange={(e) => setSelector(e.target.value)}
                        placeholder="article"
                        helperText="Optional CSS selector: only this part is compared (the whole page when empty)"
                        slotProps={{ htmlInput: { style: { fontFamily: fonts.mono } } }}
                        fullWidth
                    />
                    <TextField
                        label="Text to ignore"
                        name="ignore_patterns"
                        multiline
                        minRows={2}
                        value={ignore}
                        onChange={(e) => setIgnore(e.target.value)}
                        placeholder={'Visitors: \\d+'}
                        helperText="Optional: one regular expression per line, removed before comparing"
                        slotProps={{ htmlInput: { style: { fontFamily: fonts.mono } } }}
                        fullWidth
                    />
                    <FormControlLabel
                        control={<Switch checked={screenshots} onChange={(e) => setScreenshots(e.target.checked)} />}
                        label={<Typography variant="body2">Take a screenshot at each new version (a browser in an isolated container visits the page)</Typography>}
                    />
                    <FormControlLabel control={<Switch checked={active} onChange={(e) => setActive(e.target.checked)} />} label="Active" />
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button color="inherit" onClick={onClose}>
                    Cancel
                </Button>
                <Button type="submit" variant="contained" disabled={blocked}>
                    {page ? 'Save' : 'Monitor'}
                </Button>
            </DialogActions>
        </form>
    );
}

function PageFormDialog({ open, page, onClose, onSaved }: { open: boolean; page: MonitoredPage | null; onClose: () => void; onSaved?: (page: MonitoredPage) => void }) {
    return (
        <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm" aria-labelledby="page-form-title">
            {/* Remounted on every opening, so the form starts from the page. */}
            {open && <PageForm key={page?.id ?? 'new'} page={page} onClose={onClose} onSaved={onSaved} />}
        </Dialog>
    );
}

// URL parameters are prefixed with "p" so every tab keeps its own view.
export function PagesTab() {
    const { params, update } = useUrlParams();
    const search = params.get('pq') ?? '';
    const active = ['yes', 'no'].includes(params.get('pactive') ?? '') ? (params.get('pactive') as string) : '';
    const sort = params.get('psort') ?? '';
    const ordering = ORDERINGS.includes(sort) ? sort : DEFAULT_ORDERING;
    const page = Math.max(1, Number(params.get('ppage')) || 1);
    const size = Number(params.get('psize'));
    const pageSize = PAGE_SIZES.includes(size) ? size : PAGE_SIZES[0];
    const pageId = Number(params.get('webpage')) || null;

    const user = useAuthStore(selectUser);
    const canAdd = hasAnyPermission(user, 'site_monitoring.add_monitoredpage');
    const canChange = hasAnyPermission(user, 'site_monitoring.change_monitoredpage');
    const canDelete = hasAnyPermission(user, 'site_monitoring.delete_monitoredpage');

    const list = usePages(search, active, { page, pageSize, ordering });
    const rows = list.data?.results ?? [];
    const save = useSavePage();
    const remove = useDeletePage();
    const bulk = useBulk(PAGE_BULK);

    const [opened, setOpened] = useState<{ id: number; row?: MonitoredPage } | null>(null);
    if (pageId && opened?.id !== pageId) setOpened({ id: pageId, row: rows.find((r) => r.id === pageId) });
    const [editing, setEditing] = useState<MonitoredPage | null>(null);
    const [deleting, setDeleting] = useState<MonitoredPage | null>(null);
    const [selected, setSelected] = useState<Set<number>>(new Set());
    const [bulkDelete, setBulkDelete] = useState(false);
    const clearSelection = () => setSelected(new Set());
    const isFiltered = !!(search || active);
    const toggle = (p: MonitoredPage) =>
        save.mutate({ id: p.id, input: { is_active: !p.is_active } }, { onSuccess: (r) => notifySuccess(`${r.name || r.url} ${r.is_active ? 'is watched again' : 'is paused'}`) });

    return (
        <>
            <Box sx={{ mb: 1.5, minHeight: 48 }}>
                {selected.size > 0 ? (
                    <SelectionBar count={selected.size} onClear={clearSelection}>
                        <Button size="small" variant="outlined" startIcon={<PlayCircleOutline />} disabled={selected.size > BULK_MAX_ITEMS} onClick={() => void bulk.update([...selected], { is_active: true }, 'Monitored pages - resume').then((done) => done && clearSelection())}>
                            Resume
                        </Button>
                        <Button size="small" variant="outlined" startIcon={<PauseCircleOutline />} disabled={selected.size > BULK_MAX_ITEMS} onClick={() => void bulk.update([...selected], { is_active: false }, 'Monitored pages - pause').then((done) => done && clearSelection())}>
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
                        <SearchField resultCount={countOf(list)} value={search} onChange={(q) => update({ pq: q, ppage: null })} placeholder="Name or address…" ariaLabel="Search monitored pages" />
                        <TextField select size="small" label="State" value={active} onChange={(e) => update({ pactive: e.target.value, ppage: null })} sx={{ minWidth: 130 }}>
                            <MenuItem value="">Any</MenuItem>
                            <MenuItem value="yes">Active</MenuItem>
                            <MenuItem value="no">Paused</MenuItem>
                        </TextField>
                        {isFiltered && (
                            <Button size="small" color="inherit" startIcon={<FilterAltOffOutlined />} onClick={() => update({ pq: null, pactive: null, ppage: null })} sx={{ color: 'text.secondary' }}>
                                Clear
                            </Button>
                        )}
                    </Stack>
                )}
            </Box>

            <Card>
                {list.error ? (
                    <MuiAlert severity="error" sx={{ m: 2 }}>
                        {getErrorMessage(list.error, 'Failed to load the monitored pages.')}
                    </MuiAlert>
                ) : (
                    <>
                        <Box sx={{ opacity: list.isPlaceholderData ? 0.6 : 1, transition: 'opacity 120ms' }}>
                            <DataTable
                                label="Monitored pages"
                                columns={COLUMNS}
                                rowLabel={(p) => p.name || p.url}
                                rowTestId="page-row"
                                highlight={search}
                                rows={rows}
                                loading={list.isPending}
                                ordering={ordering}
                                onOrderingChange={(o) => update({ psort: o === DEFAULT_ORDERING ? null : o, ppage: null })}
                                activeId={pageId}
                                onOpen={(p) => {
                                    setOpened({ id: p.id, row: p });
                                    update({ webpage: p.id });
                                }}
                                selection={canChange ? selectionHandlers(setSelected, selected) : undefined}
                                empty={
                                    isFiltered ? (
                                        <EmptyState icon={<SearchOff />} title="No page matches these filters" />
                                    ) : (
                                        <EmptyState icon={<ArticleOutlined />} title="No page monitored yet">
                                            {canAdd ? (
                                                <Button size="small" onClick={() => update({ dialog: 'add-page' })}>
                                                    Monitor the first page
                                                </Button>
                                            ) : (
                                                'Pages added by analysts will appear here.'
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
                            onPageChange={(_, p) => update({ ppage: p > 0 ? p + 1 : null })}
                            rowsPerPage={pageSize}
                            rowsPerPageOptions={PAGE_SIZES}
                            onRowsPerPageChange={(e) => update({ psize: Number(e.target.value) === PAGE_SIZES[0] ? null : e.target.value, ppage: null })}
                        />
                    </>
                )}
            </Card>

            <PageDrawer
                open={pageId !== null}
                id={opened?.id ?? null}
                initial={opened?.row}
                onClose={() => update({ webpage: null })}
                pending={save.isPending}
                actions={canChange ? { edit: setEditing, toggle, remove: canDelete ? setDeleting : undefined } : undefined}
            />
            <PageFormDialog
                open={params.get('dialog') === 'add-page' || editing !== null}
                page={editing}
                onClose={() => (editing ? setEditing(null) : update({ dialog: null }))}
                onSaved={(p) => !editing && update({ webpage: p.id, dialog: null })}
            />
            <ConfirmDialog
                open={deleting !== null}
                title="Stop monitoring this page?"
                confirmLabel="Delete"
                danger
                pending={remove.isPending}
                onClose={() => setDeleting(null)}
                onConfirm={() =>
                    deleting &&
                    remove.mutate(deleting, {
                        onSuccess: () => {
                            setDeleting(null);
                            update({ webpage: null });
                        },
                    })
                }
            >
                <strong>{deleting?.name || deleting?.url}</strong> is no longer watched, and its {deleting?.versions_count ?? 0} version{deleting?.versions_count === 1 ? '' : 's'} are deleted with it. Pause it instead to keep them.
            </ConfirmDialog>
            <ConfirmDialog
                open={bulkDelete}
                title={`Delete ${selected.size} monitored page${selected.size === 1 ? '' : 's'}?`}
                confirmLabel={`Delete ${selected.size}`}
                danger
                onClose={() => setBulkDelete(false)}
                onConfirm={() => {
                    setBulkDelete(false);
                    void bulk.remove([...selected], 'Monitored pages - delete').then((done) => done && clearSelection());
                }}
            >
                Their versions are deleted with them. This cannot be undone.
            </ConfirmDialog>
        </>
    );
}
