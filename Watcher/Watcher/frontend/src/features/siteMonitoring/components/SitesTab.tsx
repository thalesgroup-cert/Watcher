import { useState } from 'react';
import { Alert as MuiAlert, Box, Button, Card, ListItemText, Menu, MenuItem, Stack, TablePagination, TextField } from '@mui/material';
import CloudOffOutlined from '@mui/icons-material/CloudOffOutlined';
import DeleteOutlined from '@mui/icons-material/DeleteOutlined';
import ErrorOutlined from '@mui/icons-material/ErrorOutlined';
import FilterAltOffOutlined from '@mui/icons-material/FilterAltOffOutlined';
import IosShareOutlined from '@mui/icons-material/IosShareOutlined';
import LanguageOutlined from '@mui/icons-material/LanguageOutlined';
import SearchOff from '@mui/icons-material/SearchOff';
import WarningAmberOutlined from '@mui/icons-material/WarningAmberOutlined';
import { getErrorMessage } from '../../../api/client';
import { useUrlParams } from '../../../lib/useUrlParams';
import { ConfirmDialog } from '../../../ui/ConfirmDialog';
import { selectionHandlers } from '../../../ui/DataTable';
import { EmptyState } from '../../../ui/EmptyState';
import { KpiCard } from '../../../ui/KpiCard';
import { countOf, SearchField } from '../../../ui/SearchField';
import { ActiveFilters } from '../../../ui/ActiveFilters';
import { BULK_MAX_ITEMS, SelectionBar } from '../../../ui/SelectionBar';
import { hasAnyPermission, selectUser, useAuthStore } from '../../auth/store';
import { useBulk } from '../../bulk/useBulk';
import { LegitimateExportDialog } from '../../exports/ExportDialogs';
import { invalidateLegitimateDomains } from '../../legitimateDomains/hooks';
import { MispExportDialog, parseEventUuids } from '../../misp/MispExportDialog';
import { ACTIONS, LEGITIMACY, legitimacyMeta, MALICIOUS } from '../catalog';
import { SITE_BULK, useDeleteSite, useSiteMispExport, useSites, useSiteStatistics } from '../hooks';
import type { ActionFilter, ExpiryFilter, Site, SiteFilters, Web } from '../types';
import { SiteBulkChangeDialog } from './SiteBulkChangeDialog';
import { type SiteExport, SiteDrawer } from './SiteDrawer';
import { SiteTable } from './tables';

const DEFAULT_ORDERING = '-created_at';
const PAGE_SIZES = [25, 50, 100];
const ORDERINGS = ['domain_name', 'legitimacy', 'web_status', 'open_alerts_count', 'domain_expiry', 'created_at'].flatMap((f) => [f, `-${f}`]);
const WEB: { value: Web; label: string }[] = [
    { value: 'online', label: 'Online' },
    { value: 'error', label: 'Answers with an error' },
    { value: 'offline', label: 'Offline' },
    { value: 'pending', label: 'Not checked yet' },
];
const EXPIRY: { value: ExpiryFilter; label: string }[] = [
    { value: 'expired', label: 'Expired' },
    { value: 'expiring_soon', label: 'Expiring within 30 days' },
    { value: 'valid', label: 'Valid' },
    { value: 'none', label: 'No date' },
];

export function readSiteFilters(params: URLSearchParams): SiteFilters {
    const web = params.get('web') as Web | null;
    const expiry = params.get('expiry') as ExpiryFilter | null;
    const action = params.get('action') as ActionFilter | null;
    return {
        search: params.get('q') ?? '',
        legitimacy: (params.get('legitimacy') ?? '').split(',').map(Number).filter((n) => LEGITIMACY.some((l) => l.value === n)),
        web: web && WEB.some((w) => w.value === web) ? web : '',
        expiry: expiry && EXPIRY.some((e) => e.value === expiry) ? expiry : '',
        action: action && (action === 'none' || ACTIONS.some((a) => a.filter === action)) ? action : '',
    };
}

const NO_FILTERS: SiteFilters = { search: '', legitimacy: [], web: '', expiry: '', action: '' };

const siteFilterParams = (f: SiteFilters) => ({
    q: f.search,
    legitimacy: f.legitimacy.join(','),
    web: f.web,
    expiry: f.expiry,
    action: f.action,
    page: null,
});

interface SitesTabProps {
    onEdit: (site: Site) => void;
}

export function SitesTab({ onEdit }: SitesTabProps) {
    const { params, update } = useUrlParams();
    const filters = readSiteFilters(params);
    const setFilters = (patch: Partial<SiteFilters>) => update(siteFilterParams({ ...filters, ...patch }));
    const sort = params.get('sort') ?? '';
    const ordering = ORDERINGS.includes(sort) ? sort : DEFAULT_ORDERING;
    const page = Math.max(1, Number(params.get('page')) || 1);
    const size = Number(params.get('size'));
    const pageSize = PAGE_SIZES.includes(size) ? size : PAGE_SIZES[0];
    const siteId = Number(params.get('site')) || null;

    const user = useAuthStore(selectUser);
    const canManage = hasAnyPermission(user, 'site_monitoring.change_site', 'site_monitoring.delete_site');
    const exports: SiteExport[] = [
        ...(hasAnyPermission(user, 'site_monitoring.add_site') ? (['misp'] as const) : []),
        ...(hasAnyPermission(user, 'site_monitoring.delete_site') ? (['legitimate'] as const) : []),
    ];

    const { data: stats } = useSiteStatistics();
    const list = useSites(filters, { page, pageSize, ordering });
    const rows = list.data?.results ?? [];
    const remove = useDeleteSite();
    const misp = useSiteMispExport();
    const bulk = useBulk(SITE_BULK);

    const [opened, setOpened] = useState<{ id: number; row?: Site } | null>(null);
    if (siteId && opened?.id !== siteId) setOpened({ id: siteId, row: rows.find((r) => r.id === siteId) });
    const [deleting, setDeleting] = useState<Site | null>(null);
    const [exporting, setExporting] = useState<{ site: Site; target: SiteExport } | null>(null);
    const [selected, setSelected] = useState<Set<number>>(new Set());
    const [bulkDialog, setBulkDialog] = useState<'change' | 'delete' | null>(null);
    const [exportMenu, setExportMenu] = useState<HTMLElement | null>(null);
    const selectedIds = [...selected];
    const clearSelection = () => setSelected(new Set());
    const afterBulk = (done: unknown) => {
        if (done) clearSelection();
        void invalidateLegitimateDomains();
    };

    const isFiltered = !!(filters.search || filters.legitimacy.length || filters.web || filters.expiry || filters.action);
    const kpi = (patch: Partial<SiteFilters>) => {
        const target = { ...NO_FILTERS, ...patch };
        return {
            selected: siteFilterParams(target).legitimacy === siteFilterParams(filters).legitimacy && (['search', 'web', 'expiry', 'action'] as const).every((k) => target[k] === filters[k]),
            onClick: () => update(siteFilterParams(target)),
        };
    };

    return (
        <>
            <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: 'repeat(2, 1fr)', md: 'repeat(4, 1fr)' }, mb: 3 }}>
                <KpiCard title="Monitored" value={stats?.total} icon={<LanguageOutlined />} color="primary" onClick={kpi({}).onClick} />
                <KpiCard title="Malicious" value={stats?.malicious} icon={<ErrorOutlined />} color="error" {...kpi({ legitimacy: MALICIOUS })} />
                <KpiCard title="Offline" value={stats?.offline} icon={<CloudOffOutlined />} color="inherit" {...kpi({ web: 'offline' })} />
                <KpiCard title="Expiring - 30 days" value={stats?.expiringSoon} icon={<WarningAmberOutlined />} color="warning" {...kpi({ expiry: 'expiring_soon' })} />
            </Box>

            <Box sx={{ mb: 1.5, minHeight: 48 }}>
                {selected.size > 0 ? (
                    <SelectionBar count={selected.size} onClear={clearSelection}>
                        <Button size="small" variant="outlined" disabled={selected.size > BULK_MAX_ITEMS} onClick={() => setBulkDialog('change')}>
                            Change…
                        </Button>
                        {exports.length > 0 && (
                            <>
                                <Button size="small" variant="outlined" startIcon={<IosShareOutlined />} disabled={selected.size > BULK_MAX_ITEMS} onClick={(e) => setExportMenu(e.currentTarget)} aria-haspopup="menu">
                                    Export
                                </Button>
                                <Menu anchorEl={exportMenu} open={exportMenu !== null} onClose={() => setExportMenu(null)}>
                                    {exports.includes('misp') && (
                                        <MenuItem
                                            onClick={() => {
                                                setExportMenu(null);
                                                void bulk.run('bulk_export_misp', { ids: selectedIds }, 'Websites - export to MISP').then(afterBulk);
                                            }}
                                        >
                                            <ListItemText primary="To MISP" secondary="One event per website" />
                                        </MenuItem>
                                    )}
                                    {exports.includes('legitimate') && (
                                        <MenuItem
                                            onClick={() => {
                                                setExportMenu(null);
                                                void bulk.run('bulk_export_legitimate', { ids: selectedIds }, 'Websites - export to Legitimate Domains').then(afterBulk);
                                            }}
                                        >
                                            <ListItemText primary="To Legitimate Domains" secondary="Then stop monitoring them" />
                                        </MenuItem>
                                    )}
                                </Menu>
                            </>
                        )}
                        {canManage && (
                            <Button size="small" variant="outlined" color="error" startIcon={<DeleteOutlined />} disabled={selected.size > BULK_MAX_ITEMS} onClick={() => setBulkDialog('delete')}>
                                Delete
                            </Button>
                        )}
                    </SelectionBar>
                ) : (
                    <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 1.5, alignItems: 'center' }}>
                        <SearchField resultCount={countOf(list)} value={filters.search} onChange={(search) => setFilters({ search })} placeholder="Domain, ticket, registrar…" ariaLabel="Search websites" />
                        <TextField
                            select
                            size="small"
                            label="Legitimacy"
                            value={filters.legitimacy}
                            onChange={(e) => setFilters({ legitimacy: (e.target.value as unknown as number[]).map(Number) })}
                            sx={{ minWidth: 170, maxWidth: 260 }}
                            slotProps={{
                                select: {
                                    multiple: true,
                                    renderValue: (v) => (v as number[]).map((n) => legitimacyMeta(n)?.short).join(', '),
                                },
                            }}
                        >
                            {LEGITIMACY.map((l) => (
                                <MenuItem key={l.value} value={l.value}>
                                    {l.label}
                                </MenuItem>
                            ))}
                        </TextField>
                        <TextField select size="small" label="Website" value={filters.web} onChange={(e) => setFilters({ web: e.target.value as Web })} sx={{ minWidth: 150 }}>
                            <MenuItem value="">Any</MenuItem>
                            {WEB.map((w) => (
                                <MenuItem key={w.value} value={w.value}>
                                    {w.label}
                                </MenuItem>
                            ))}
                        </TextField>
                        <TextField select size="small" label="Domain expiry" value={filters.expiry} onChange={(e) => setFilters({ expiry: e.target.value as ExpiryFilter })} sx={{ minWidth: 160 }}>
                            <MenuItem value="">Any</MenuItem>
                            {EXPIRY.map((x) => (
                                <MenuItem key={x.value} value={x.value}>
                                    {x.label}
                                </MenuItem>
                            ))}
                        </TextField>
                        <TextField select size="small" label="Actions taken" value={filters.action} onChange={(e) => setFilters({ action: e.target.value as ActionFilter })} sx={{ minWidth: 160 }}>
                            <MenuItem value="">Any</MenuItem>
                            {ACTIONS.map((a) => (
                                <MenuItem key={a.filter} value={a.filter}>
                                    {a.label}
                                </MenuItem>
                            ))}
                            <MenuItem value="none">None yet</MenuItem>
                        </TextField>
                        {isFiltered && (
                            <Button size="small" color="inherit" startIcon={<FilterAltOffOutlined />} onClick={() => update(siteFilterParams(NO_FILTERS))} sx={{ color: 'text.secondary' }}>
                                Clear
                            </Button>
                        )}
<ActiveFilters
    chips={[
        filters.legitimacy.length > 0 && { key: 'legitimacy', label: 'Legitimacy', value: filters.legitimacy.map((n) => legitimacyMeta(n)?.short).join(', '), onRemove: () => setFilters({ legitimacy: [] }) },
        filters.web && { key: 'web', label: 'Website', value: WEB.find((w) => w.value === filters.web)?.label ?? filters.web, onRemove: () => setFilters({ web: '' }) },
        filters.expiry && { key: 'expiry', label: 'Domain expiry', value: EXPIRY.find((x) => x.value === filters.expiry)?.label ?? filters.expiry, onRemove: () => setFilters({ expiry: '' }) },
        filters.action && { key: 'action', label: 'Actions taken', value: filters.action === 'none' ? 'None yet' : (ACTIONS.find((a) => a.filter === filters.action)?.label ?? filters.action), onRemove: () => setFilters({ action: '' }) },
    ]}
/>
                    </Stack>
                )}
            </Box>

            <Card>
                {list.error ? (
                    <MuiAlert severity="error" sx={{ m: 2 }}>
                        {getErrorMessage(list.error, 'Failed to load the websites.')}
                    </MuiAlert>
                ) : (
                    <>
                        <Box sx={{ opacity: list.isPlaceholderData ? 0.6 : 1, transition: 'opacity 120ms' }}>
                            <SiteTable highlight={filters.search}
                                rows={rows}
                                loading={list.isPending}
                                ordering={ordering}
                                onOrderingChange={(o) => update({ sort: o === DEFAULT_ORDERING ? null : o, page: null })}
                                activeId={siteId}
                                onOpen={(s) => {
                                    setOpened({ id: s.id, row: s });
                                    update({ site: s.id });
                                }}
                                selection={canManage || exports.length ? selectionHandlers(setSelected, selected) : undefined}
                                empty={
                                    isFiltered ? (
                                        <EmptyState icon={<SearchOff />} title="No website matches these filters">
                                            <Button size="small" onClick={() => update(siteFilterParams(NO_FILTERS))}>
                                                Clear the filters
                                            </Button>
                                        </EmptyState>
                                    ) : (
                                        <EmptyState icon={<LanguageOutlined />} title="No website monitored yet">
                                            Add the suspicious domains to watch, or export them from DNS threats.
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

            <SiteDrawer
                open={siteId !== null}
                id={opened?.id ?? null}
                initial={opened?.row}
                onClose={() => update({ site: null })}
                onOpenChange={(c) => update({ tab: 'changes', change: c.id, site: null })}
                onShowChanges={(s) => update({ tab: 'changes', csite: s.id, cstatus: 'all', site: null })}
                actions={canManage ? { edit: onEdit, remove: setDeleting } : undefined}
                exports={exports}
                onExport={(site, target) => setExporting({ site, target })}
            />

            <MispExportDialog
                open={exporting?.target === 'misp'}
                onClose={() => setExporting(null)}
                name={exporting?.site.domain_name ?? ''}
                eventUuids={parseEventUuids(exporting?.site.misp_event_uuid)}
                pending={misp.isPending}
                onExport={(eventUuid) => misp.mutateAsync({ site: (exporting as { site: Site }).site, eventUuid })}
            />
            <LegitimateExportDialog
                open={exporting?.target === 'legitimate'}
                onClose={() => setExporting(null)}
                domainName={exporting?.site.domain_name ?? ''}
                defaultComment={
                    exporting?.site.legitimacy
                        ? `Exported from Website Monitoring - Original legitimacy: ${legitimacyMeta(exporting.site.legitimacy)?.label}`
                        : 'Exported from Website Monitoring'
                }
                afterwards="It is then removed from Website Monitoring."
                // One server step creates the legitimate domain and removes the site (or does neither).
                submit={(comment) =>
                    bulk.run('bulk_export_legitimate', { ids: [(exporting as { site: Site }).site.id], comment }, 'Website - export to Legitimate Domains').then((res) => {
                        if (!res || res.succeeded === 0) throw new Error('Not exported');
                    })
                }
                onDone={() => update({ site: null })}
            />

            <ConfirmDialog
                open={deleting !== null}
                title="Stop monitoring this website?"
                confirmLabel="Delete"
                danger
                pending={remove.isPending}
                onClose={() => setDeleting(null)}
                onConfirm={() =>
                    deleting &&
                    remove.mutate(deleting, {
                        onSuccess: () => {
                            setDeleting(null);
                            update({ site: null });
                        },
                    })
                }
            >
                <strong>{deleting?.domain_name}</strong> is removed from Website Monitoring with its {deleting?.alerts_count ?? 0} change
                {deleting?.alerts_count === 1 ? '' : 's'} and its history.
            </ConfirmDialog>

            <SiteBulkChangeDialog
                open={bulkDialog === 'change'}
                count={selected.size}
                onClose={() => setBulkDialog(null)}
                onApply={(changes) => {
                    setBulkDialog(null);
                    void bulk.update(selectedIds, changes, 'Websites - change').then(afterBulk);
                }}
            />
            <ConfirmDialog
                open={bulkDialog === 'delete'}
                title={`Stop monitoring ${selected.size} website${selected.size === 1 ? '' : 's'}?`}
                confirmLabel={`Delete ${selected.size}`}
                danger
                onClose={() => setBulkDialog(null)}
                onConfirm={() => {
                    setBulkDialog(null);
                    void bulk.remove(selectedIds, 'Websites - delete').then(afterBulk);
                }}
            >
                They are removed from Website Monitoring with their changes and history. This cannot be undone.
            </ConfirmDialog>
        </>
    );
}
