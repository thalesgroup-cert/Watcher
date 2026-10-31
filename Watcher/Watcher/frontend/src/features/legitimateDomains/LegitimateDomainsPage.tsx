import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { Alert, Box, Button, Card, MenuItem, Stack, Tab, TablePagination, Tabs, TextField } from '@mui/material';
import Add from '@mui/icons-material/Add';
import DeleteOutlined from '@mui/icons-material/DeleteOutlined';
import DomainVerificationOutlined from '@mui/icons-material/DomainVerificationOutlined';
import ErrorOutlined from '@mui/icons-material/ErrorOutlined';
import FilterAltOffOutlined from '@mui/icons-material/FilterAltOffOutlined';
import LockClockOutlined from '@mui/icons-material/LockClockOutlined';
import SearchOff from '@mui/icons-material/SearchOff';
import VerifiedUserOutlined from '@mui/icons-material/VerifiedUserOutlined';
import WarningAmberOutlined from '@mui/icons-material/WarningAmberOutlined';
import { getErrorMessage } from '../../api/client';
import { ConfirmDialog } from '../../ui/ConfirmDialog';
import { selectionHandlers } from '../../ui/DataTable';
import { EmptyState } from '../../ui/EmptyState';
import { KpiCard } from '../../ui/KpiCard';
import { Page, PageHeader } from '../../ui/Page';
import { TourButton } from '../onboarding/TourButton';
import { countOf, SearchField } from '../../ui/SearchField';
import { ActiveFilters } from '../../ui/ActiveFilters';
import { BULK_MAX_ITEMS, SelectionBar } from '../../ui/SelectionBar';
import { hasAnyPermission, selectIsAuthenticated, selectUser, useAuthStore } from '../auth/store';
import { useBulk } from '../bulk/useBulk';
import { MispExportDialog, parseEventUuids } from '../misp/MispExportDialog';
import { DomainDrawer } from './components/DomainDrawer';
import { DomainFormDialog } from './components/DomainFormDialog';
import { DomainInsights } from './components/DomainInsights';
import { DomainTable } from './components/DomainTable';
import { FILTER_OPTIONS } from './expiry';
import { LEGITIMATE_DOMAIN_BULK, useDeleteDomain, useDomains, useDomainStatistics, useMispExport } from './hooks';
import type { DomainFilters, ExpiryFilter, LegitimateDomain } from './types';

const DEFAULT_ORDERING = '-created_at';
const DEFAULT_PAGE_SIZE = 25;
const PAGE_SIZES = [25, 50, 100];
const EXPIRY_VALUES = FILTER_OPTIONS.map((o) => o.value);
const ORDERINGS = ['domain_name', 'expiry', 'ssl_expiry', 'domain_created_at', 'created_at', 'repurchased'].flatMap((f) => [f, `-${f}`]);

/** Everything the page shows is in the URL: tab, filters, sort, page, open domain, add dialog. */
function readUrl(search: string) {
    const p = new URLSearchParams(search);
    const expiry = (key: string): ExpiryFilter => {
        const v = p.get(key) as ExpiryFilter | null;
        return v && EXPIRY_VALUES.includes(v) ? v : '';
    };
    const repurchased = p.get('repurchased');
    const size = Number(p.get('size'));
    const ordering = p.get('sort') ?? '';
    const domain = Number(p.get('domain'));
    return {
        tab: p.get('tab') === 'insights' ? 'insights' : 'domains',
        filters: {
            search: p.get('q') ?? '',
            status: expiry('status'),
            ssl: expiry('ssl'),
            repurchased: repurchased === 'true' || repurchased === 'false' ? repurchased : '',
        } as DomainFilters,
        ordering: ORDERINGS.includes(ordering) ? ordering : DEFAULT_ORDERING,
        page: Math.max(1, Number(p.get('page')) || 1),
        pageSize: PAGE_SIZES.includes(size) ? size : DEFAULT_PAGE_SIZE,
        domainId: Number.isInteger(domain) && domain > 0 ? domain : null,
        adding: p.get('dialog') === 'add',
    };
}

type UrlState = ReturnType<typeof readUrl>;

function writeUrl(s: UrlState): string {
    const p = new URLSearchParams();
    if (s.tab !== 'domains') p.set('tab', s.tab);
    if (s.filters.search) p.set('q', s.filters.search);
    if (s.filters.status) p.set('status', s.filters.status);
    if (s.filters.ssl) p.set('ssl', s.filters.ssl);
    if (s.filters.repurchased) p.set('repurchased', s.filters.repurchased);
    if (s.ordering !== DEFAULT_ORDERING) p.set('sort', s.ordering);
    if (s.page > 1) p.set('page', String(s.page));
    if (s.pageSize !== DEFAULT_PAGE_SIZE) p.set('size', String(s.pageSize));
    if (s.domainId) p.set('domain', String(s.domainId));
    if (s.adding) p.set('dialog', 'add');
    const out = p.toString();
    return out ? `?${out}` : '';
}

const NO_FILTERS: DomainFilters = { search: '', status: '', ssl: '', repurchased: '' };

function ExpirySelect({ label, value, onChange }: { label: string; value: ExpiryFilter; onChange: (v: ExpiryFilter) => void }) {
    return (
        <TextField
            select
            size="small"
            label={label}
            value={value}
            onChange={(e) => onChange(e.target.value as ExpiryFilter)}
            sx={{ minWidth: 190 }}
        >
            {FILTER_OPTIONS.map((o) => (
                <MenuItem key={o.value || 'any'} value={o.value}>
                    {o.label}
                </MenuItem>
            ))}
        </TextField>
    );
}

export default function LegitimateDomainsPage() {
    const location = useLocation();
    const navigate = useNavigate();
    const url = readUrl(location.search);
    const { filters } = url;
    const update = (patch: Partial<UrlState>) => void navigate({ search: writeUrl({ ...url, ...patch }) }, { replace: true });
    // Any change of filter or sort goes back to the first page.
    const setFilters = (patch: Partial<DomainFilters>) => update({ filters: { ...filters, ...patch }, page: 1 });

    const user = useAuthStore(selectUser);
    const signedIn = useAuthStore(selectIsAuthenticated);
    const canAdd = hasAnyPermission(user, 'common.add_legitimatedomain');
    const canManage = hasAnyPermission(user, 'common.change_legitimatedomain', 'common.delete_legitimatedomain');

    const { data: stats } = useDomainStatistics();
    const list = useDomains({ ...filters, page: url.page, pageSize: url.pageSize, ordering: url.ordering });
    const rows = list.data?.results ?? [];

    // Row painted in the drawer while its detail loads; also keeps the drawer filled while it slides out.
    const [opened, setOpened] = useState<{ id: number; row?: LegitimateDomain } | null>(null);
    if (url.domainId && opened?.id !== url.domainId) setOpened({ id: url.domainId, row: rows.find((r) => r.id === url.domainId) });

    const [editing, setEditing] = useState<LegitimateDomain | null>(null);
    const [exporting, setExporting] = useState<LegitimateDomain | null>(null);
    const [deleting, setDeleting] = useState<LegitimateDomain | null>(null);
    const [bulkDelete, setBulkDelete] = useState(false);
    const [selected, setSelected] = useState<Set<number>>(new Set());

    const remove = useDeleteDomain();
    const misp = useMispExport();
    const bulk = useBulk(LEGITIMATE_DOMAIN_BULK);

    const selectedIds = [...selected];
    const tooMany = selectedIds.length > BULK_MAX_ITEMS;
    const clearSelection = () => setSelected(new Set());
    const isFiltered = Object.values(filters).some(Boolean);
    const kpi = (status: ExpiryFilter, ssl: ExpiryFilter) => ({
        selected: url.tab === 'domains' && filters.status === status && filters.ssl === ssl && !filters.search && !filters.repurchased,
        onClick: () => update({ tab: 'domains', filters: { ...NO_FILTERS, status, ssl }, page: 1 }),
    });

    return (
        <Page>
            <PageHeader
                help={<TourButton tour="legitimateDomains" />}
                icon={<VerifiedUserOutlined />}
                title="Legitimate domains"
                subtitle="Domains the organisation owns. Watcher keeps their registration and certificate dates up to date."
                actions={
                    canAdd && (
                        <Button variant="contained" startIcon={<Add />} onClick={() => update({ adding: true })}>
                            Add domains
                        </Button>
                    )
                }
                tabs={
                    <Tabs value={url.tab} onChange={(_, tab: string) => update({ tab })} aria-label="Legitimate domains sections">
                        <Tab value="domains" label="Domains" />
                        <Tab value="insights" label="Insights" />
                    </Tabs>
                }
            />

            {url.tab === 'insights' ? (
                <DomainInsights onFilter={(patch) => update({ tab: 'domains', filters: { ...NO_FILTERS, ...patch }, page: 1 })} />
            ) : (
                <>
                    <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: 'repeat(2, 1fr)', md: 'repeat(4, 1fr)' }, mb: 3 }}>
                        {/* The total resets the quick filters; it is never shown as the active one. */}
                        <KpiCard
                            title="Domains"
                            value={stats?.total}
                            icon={<DomainVerificationOutlined />}
                            color="primary"
                            onClick={kpi('', '').onClick}
                        />
                        <KpiCard
                            title="Expiring - 30 days"
                            value={stats?.expiringSoon}
                            icon={<WarningAmberOutlined />}
                            color="warning"
                            {...kpi('expiring_soon', '')}
                        />
                        <KpiCard title="Expired" value={stats?.expired} icon={<ErrorOutlined />} color="error" {...kpi('expired', '')} />
                        <KpiCard
                            title="Certificates to renew"
                            value={stats && stats.sslExpired + stats.sslExpiringSoon}
                            icon={<LockClockOutlined />}
                            color="warning"
                            {...kpi('', 'attention')}
                        />
                    </Box>

                    <Box sx={{ mb: 1.5, minHeight: 48 }}>
                        {selected.size > 0 ? (
                            <SelectionBar count={selected.size} onClear={clearSelection}>
                                <Button
                                    size="small"
                                    variant="outlined"
                                    disabled={tooMany}
                                    onClick={() =>
                                        void bulk.update(selectedIds, { repurchased: true }, 'Legitimate domains - mark repurchased').then((done) => done && clearSelection())
                                    }
                                >
                                    Mark repurchased
                                </Button>
                                <Button
                                    size="small"
                                    variant="outlined"
                                    disabled={tooMany}
                                    onClick={() =>
                                        void bulk
                                            .update(selectedIds, { repurchased: false }, 'Legitimate domains - mark not repurchased')
                                            .then((done) => done && clearSelection())
                                    }
                                >
                                    Mark not repurchased
                                </Button>
                                <Button
                                    size="small"
                                    variant="outlined"
                                    color="error"
                                    startIcon={<DeleteOutlined />}
                                    disabled={tooMany}
                                    onClick={() => setBulkDelete(true)}
                                >
                                    Delete
                                </Button>
                            </SelectionBar>
                        ) : (
                            <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 1.5, alignItems: 'center' }}>
                                <SearchField resultCount={countOf(list)}
                                    value={filters.search}
                                    onChange={(search) => setFilters({ search })}
                                    placeholder="Search domains…"
                                    ariaLabel="Search domains"
                                />
                                <ExpirySelect label="Domain expiry" value={filters.status} onChange={(status) => setFilters({ status })} />
                                <ExpirySelect label="Certificate expiry" value={filters.ssl} onChange={(ssl) => setFilters({ ssl })} />
                                {signedIn && (
                                    <TextField
                                        select
                                        size="small"
                                        label="Repurchased"
                                        value={filters.repurchased}
                                        onChange={(e) => setFilters({ repurchased: e.target.value as DomainFilters['repurchased'] })}
                                        sx={{ minWidth: 140 }}
                                    >
                                        <MenuItem value="">Any</MenuItem>
                                        <MenuItem value="true">Yes</MenuItem>
                                        <MenuItem value="false">No</MenuItem>
                                    </TextField>
                                )}
                                {isFiltered && (
                                    <Button
                                        size="small"
                                        color="inherit"
                                        startIcon={<FilterAltOffOutlined />}
                                        onClick={() => update({ filters: NO_FILTERS, page: 1 })}
                                        sx={{ color: 'text.secondary' }}
                                    >
                                        Clear
                                    </Button>
                                )}
<ActiveFilters
    chips={[
        filters.status && { key: 'status', label: 'Domain expiry', value: FILTER_OPTIONS.find((o) => o.value === filters.status)?.label ?? filters.status, onRemove: () => setFilters({ status: '' }) },
        filters.ssl && { key: 'ssl', label: 'Certificate expiry', value: FILTER_OPTIONS.find((o) => o.value === filters.ssl)?.label ?? filters.ssl, onRemove: () => setFilters({ ssl: '' }) },
        filters.repurchased && { key: 'repurchased', label: 'Repurchased', value: filters.repurchased === 'true' ? 'Yes' : 'No', onRemove: () => setFilters({ repurchased: '' }) },
    ]}
/>
                            </Stack>
                        )}
                    </Box>

                    <Card>
                        {list.error ? (
                            <Alert severity="error" sx={{ m: 2 }}>
                                {getErrorMessage(list.error, 'Failed to load the domains.')}
                            </Alert>
                        ) : (
                            <>
                                <Box sx={{ opacity: list.isPlaceholderData ? 0.6 : 1, transition: 'opacity 120ms' }}>
                                    <DomainTable highlight={filters.search}
                                        rows={rows}
                                        loading={list.isPending}
                                        showInternal={signedIn}
                                        ordering={url.ordering}
                                        onOrderingChange={(ordering) => update({ ordering, page: 1 })}
                                        activeId={url.domainId}
                                        onOpen={(d) => {
                                            setOpened({ id: d.id, row: d });
                                            update({ domainId: d.id });
                                        }}
                                        selection={canManage ? selectionHandlers(setSelected, selected) : undefined}
                                        empty={
                                            isFiltered ? (
                                                <EmptyState icon={<SearchOff />} title="No domain matches these filters">
                                                    <Button size="small" onClick={() => update({ filters: NO_FILTERS, page: 1 })}>
                                                        Clear the filters
                                                    </Button>
                                                </EmptyState>
                                            ) : (
                                                <EmptyState icon={<VerifiedUserOutlined />} title="No legitimate domains yet">
                                                    {canAdd ? 'Add the domains your organisation owns.' : 'Domains added by analysts will appear here.'}
                                                </EmptyState>
                                            )
                                        }
                                    />
                                </Box>
                                <TablePagination
                                    component="div"
                                    count={list.data?.count ?? 0}
                                    page={(list.data?.count ?? 0) === 0 ? 0 : url.page - 1}
                                    onPageChange={(_, page) => update({ page: page + 1 })}
                                    rowsPerPage={url.pageSize}
                                    rowsPerPageOptions={PAGE_SIZES}
                                    onRowsPerPageChange={(e) => update({ pageSize: Number(e.target.value), page: 1 })}
                                />
                            </>
                        )}
                    </Card>
                </>
            )}

            <DomainDrawer
                open={url.domainId !== null}
                id={opened?.id ?? null}
                initial={opened?.row}
                onClose={() => update({ domainId: null })}
                showInternal={signedIn}
                actions={
                    canManage
                        ? { edit: setEditing, exportToMisp: setExporting, remove: setDeleting }
                        : undefined
                }
            />

            <DomainFormDialog
                open={url.adding || editing !== null}
                domain={editing}
                onClose={() => (editing ? setEditing(null) : update({ adding: false }))}
            />

            <MispExportDialog
                open={exporting !== null}
                onClose={() => setExporting(null)}
                name={exporting?.domain_name ?? ''}
                eventUuids={parseEventUuids(exporting?.misp_event_uuid)}
                pending={misp.isPending}
                onExport={(eventUuid) => misp.mutateAsync({ domain: exporting as LegitimateDomain, eventUuid })}
            />

            <ConfirmDialog
                open={deleting !== null}
                title="Delete this domain?"
                confirmLabel="Delete"
                danger
                pending={remove.isPending}
                onClose={() => setDeleting(null)}
                onConfirm={() =>
                    deleting &&
                    remove.mutate(deleting, {
                        onSuccess: () => {
                            setDeleting(null);
                            update({ domainId: null });
                        },
                    })
                }
            >
                <strong>{deleting?.domain_name}</strong> will no longer be tracked, and its history is deleted with it. The deletion itself stays in the activity feed.
            </ConfirmDialog>

            <ConfirmDialog
                open={bulkDelete}
                title={`Delete ${selected.size} domain${selected.size === 1 ? '' : 's'}?`}
                confirmLabel={`Delete ${selected.size}`}
                danger
                onClose={() => setBulkDelete(false)}
                onConfirm={() => {
                    setBulkDelete(false);
                    void bulk.remove(selectedIds, 'Legitimate domains - delete').then((done) => done && clearSelection());
                }}
            >
                The selected domains will no longer be tracked. This cannot be undone.
            </ConfirmDialog>
        </Page>
    );
}
