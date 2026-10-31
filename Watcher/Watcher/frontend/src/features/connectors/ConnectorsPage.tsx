import { useMemo, useState } from 'react';
import { Link as RouterLink } from 'react-router';
import {
    Alert,
    Box,
    Button,
    Chip,
    CircularProgress,
    Collapse,
    InputAdornment,
    MenuItem,
    Pagination,
    Stack,
    Tab,
    Tabs,
    TextField,
    ToggleButton,
    Typography,
} from '@mui/material';
import BlockOutlined from '@mui/icons-material/BlockOutlined';
import CategoryOutlined from '@mui/icons-material/CategoryOutlined';
import CheckCircleOutlined from '@mui/icons-material/CheckCircleOutlined';
import ExpandLess from '@mui/icons-material/ExpandLess';
import ExpandMore from '@mui/icons-material/ExpandMore';
import LockOutlined from '@mui/icons-material/LockOutlined';
import PowerOffOutlined from '@mui/icons-material/PowerOffOutlined';
import PowerOutlined from '@mui/icons-material/PowerOutlined';
import Search from '@mui/icons-material/Search';
import WarningAmberOutlined from '@mui/icons-material/WarningAmberOutlined';
import { getErrorMessage } from '../../api/client';
import { selectUser, useAuthStore } from '../auth/store';
import { useUrlParams } from '../../lib/useUrlParams';
import { ConnectorCard } from './components/ConnectorCard';
import { ConnectorEditModal } from './components/ConnectorEditModal';
import { NotificationsTab } from './components/NotificationsTab';
import { KpiCard } from '../../ui/KpiCard';
import { Page, PageHeader } from '../../ui/Page';
import { TourButton } from '../onboarding/TourButton';
import { EMPTY_FILTERS, filterConnectors, PAGE_SIZE, paginate, type ConnectorFilters } from './filters';
import { useConnectors } from './hooks';
import type { Connector } from './types';

const CATEGORY_ORDER = [
    'Notifications',
    'Incident Response',
    'Threat Intelligence',
    'Certificate Monitoring',
    'Domain Monitoring',
    'Search',
    'Authentication',
    'Database',
    'Other',
];

const STATUS_OPTIONS = [
    { value: 'configured', label: 'Configured' },
    { value: 'partial', label: 'Incomplete' },
    { value: 'disabled', label: 'Disabled' },
];

const HEALTH_OPTIONS = [
    { value: 'healthy', label: 'Healthy' },
    { value: 'unhealthy', label: 'Unhealthy' },
    { value: 'unknown', label: 'Not tested yet' },
];

const GRID_SX = {
    display: 'grid',
    gap: 2,
    gridTemplateColumns: {
        xs: 'repeat(2, 1fr)',
        sm: 'repeat(3, 1fr)',
        lg: 'repeat(4, 1fr)',
        xl: 'repeat(5, 1fr)',
    },
} as const;

function ConnectorsGrid({
    data,
    grouped,
    onEdit,
}: {
    data: Connector[];
    grouped: boolean;
    onEdit: (c: Connector) => void;
}) {
    if (data.length === 0) {
        return (
            <Box sx={{ textAlign: 'center', py: 6, color: 'text.secondary' }}>
                <PowerOffOutlined sx={{ fontSize: 48, opacity: 0.3 }} />
                <Typography sx={{ mt: 1 }}>No connectors match your filters.</Typography>
            </Box>
        );
    }

    if (!grouped) {
        return (
            <Box sx={GRID_SX}>
                {data.map((c) => (
                    <ConnectorCard key={c.id} connector={c} onEditClick={onEdit} />
                ))}
            </Box>
        );
    }

    const byCategory: Record<string, Connector[]> = {};
    data.forEach((c) => {
        (byCategory[c.category || 'Other'] ??= []).push(c);
    });
    const categories = CATEGORY_ORDER.filter((cat) => byCategory[cat]).concat(
        Object.keys(byCategory).filter((cat) => !CATEGORY_ORDER.includes(cat)),
    );

    return (
        <Stack spacing={3}>
            {categories.map((category) => (
                <Box key={category}>
                    <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{ display: 'block', mb: 1, textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.08em' }}
                    >
                        {category}
                    </Typography>
                    <Box sx={GRID_SX}>
                        {byCategory[category].map((c) => (
                            <ConnectorCard key={c.id} connector={c} onEditClick={onEdit} />
                        ))}
                    </Box>
                </Box>
            ))}
        </Stack>
    );
}

function HelpSection() {
    const [open, setOpen] = useState(false);
    return (
        <Box sx={{ mb: 3 }}>
            <Button
                color="inherit"
                size="small"
                onClick={() => setOpen((v) => !v)}
                startIcon={open ? <ExpandLess /> : <ExpandMore />}
                sx={{ color: 'text.secondary' }}
            >
                Need help with connectors?
            </Button>
            <Collapse in={open}>
                <Box sx={{ mt: 1.5, pl: 2, borderLeft: 3, borderColor: 'primary.main' }}>
                    <Typography component="ul" variant="body2" color="text.secondary" sx={{ m: 0, pl: 2.5, '& li': { mb: 0.75 } }}>
                        <li>
                            The first time a connector's fields are read, they're seeded from your <strong>settings.py</strong> /{' '}
                            <strong>.env</strong> values
                        </li>
                        <li>
                            Click <strong>Edit</strong> on a card to override a value, saving stores it in the database and takes effect
                            immediately across the whole app (SMTP, Slack, Citadel, TheHive, MISP, CertStream, SearxNG, CyberWatch...), not just
                            this page's own <strong>Test</strong> button
                        </li>
                        <li>
                            Once a field has been saved here, even cleared to empty, it stops following <strong>settings.py</strong>/
                            <strong>.env</strong> for good. Each field shows a <strong>From .env</strong> or <strong>Manually set</strong> badge,
                            and manually-set fields get a reset button to drop the override and resume following <strong>settings.py</strong>/
                            <strong>.env</strong> live
                        </li>
                        <li>
                            Passwords, tokens and API keys are encrypted before being stored, and shown masked by default, click the eye icon to
                            reveal
                        </li>
                        <li>
                            <strong>Test</strong> runs a real connectivity check using the values currently saved for that connector, and reports
                            success or failure right on the card
                        </li>
                        <li>
                            Connectors marked <Chip variant="outlined" color="warning" label="Read-only" sx={{ height: 18, fontSize: 10 }} /> are
                            informational only. Their configuration lives exclusively in <strong>settings.py</strong> and can't be changed from this
                            page, for LDAP and OIDC/SSO this is because Django builds its authentication backends from <strong>settings.py</strong>{' '}
                            at process startup, not per-request
                        </li>
                    </Typography>
                </Box>
            </Collapse>
        </Box>
    );
}

export default function ConnectorsPage() {
    const { params, update } = useUrlParams();
    const tab = params.get('tab') === 'notifications' ? 'notifications' : 'connectors';
    const user = useAuthStore(selectUser);
    const isSuperuser = !!user?.is_superuser;

    const { data: connectors = [], isLoading, error } = useConnectors(isSuperuser);
    const [editing, setEditing] = useState<Connector | null>(null);
    const [grouped, setGrouped] = useState(false);
    const [filters, setFilters] = useState<ConnectorFilters>(EMPTY_FILTERS);
    const [page, setPage] = useState(1);

    const filtered = useMemo(() => filterConnectors(connectors, filters), [connectors, filters]);
    const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    const currentPage = Math.min(page, pageCount);
    const visible = useMemo(() => paginate(filtered, currentPage), [filtered, currentPage]);
    const categories = useMemo(() => [...new Set(connectors.map((c) => c.category))].sort(), [connectors]);

    if (!isSuperuser) {
        return (
            <Box sx={{ mt: 8, textAlign: 'center' }}>
                <LockOutlined color="error" sx={{ fontSize: 56 }} />
                <Typography variant="h3" sx={{ mt: 2 }}>
                    Access Restricted
                </Typography>
                <Typography color="text.secondary" sx={{ mb: 2 }}>
                    This page requires superuser privileges.
                </Typography>
                <Button component={RouterLink} to="/" variant="contained">
                    Back to Dashboard
                </Button>
            </Box>
        );
    }

    const stats = {
        total: connectors.length,
        configured: connectors.filter((c) => c.status === 'configured').length,
        partial: connectors.filter((c) => c.status === 'partial').length,
        disabled: connectors.filter((c) => c.status === 'disabled').length,
    };

    const header = (
        <PageHeader
            help={<TourButton tour="connectors" />}
            icon={<PowerOutlined />}
            title="Connectors"
            subtitle="Credentials and endpoints of the external services Watcher talks to."
            tabs={
                <Tabs value={tab} onChange={(_, t: string) => update({ tab: t === 'connectors' ? null : t })} aria-label="Connectors sections">
                    <Tab value="connectors" label="Connectors" />
                    <Tab value="notifications" label="Notifications" />
                </Tabs>
            }
        />
    );

    if (tab === 'notifications') {
        return (
            <Page>
                {header}
                <NotificationsTab />
            </Page>
        );
    }

    const setFilter = (key: keyof ConnectorFilters) => (value: string) => {
        setFilters((prev) => ({ ...prev, [key]: value }));
        setPage(1);
    };
    const from = filtered.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
    const to = Math.min(currentPage * PAGE_SIZE, filtered.length);

    return (
        <Page>
            {header}

            <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(4, 1fr)' }, mb: 3 }}>
                <KpiCard title="Total" value={stats.total} icon={<PowerOutlined />} color="primary" />
                <KpiCard title="Configured" value={stats.configured} icon={<CheckCircleOutlined />} color="success" />
                <KpiCard title="Incomplete" value={stats.partial} icon={<WarningAmberOutlined />} color="warning" />
                <KpiCard title="Disabled" value={stats.disabled} icon={<BlockOutlined />} color="inherit" />
            </Box>

            <HelpSection />

            {error && (
                <Alert severity="error" sx={{ mb: 2 }}>
                    {getErrorMessage(error, 'Failed to load connectors.')}
                </Alert>
            )}

            {isLoading ? (
                <Box sx={{ textAlign: 'center', py: 6 }}>
                    <CircularProgress />
                    <Typography color="text.secondary" sx={{ mt: 1 }}>
                        Loading connectors…
                    </Typography>
                </Box>
            ) : (
                <>
                    <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr', md: '4fr 3fr 3fr 3fr' }, mb: 2 }}>
                        <TextField
                            label="Search"
                            placeholder="Search by name, category, description…"
                            value={filters.search}
                            onChange={(e) => setFilter('search')(e.target.value)}
                            slotProps={{
                                input: {
                                    startAdornment: (
                                        <InputAdornment position="start">
                                            <Search fontSize="small" />
                                        </InputAdornment>
                                    ),
                                },
                            }}
                        />
                        <TextField select label="Status" value={filters.status} onChange={(e) => setFilter('status')(e.target.value)}>
                            <MenuItem value="">All</MenuItem>
                            {STATUS_OPTIONS.map((o) => (
                                <MenuItem key={o.value} value={o.value}>
                                    {o.label}
                                </MenuItem>
                            ))}
                        </TextField>
                        <TextField select label="Health" value={filters.health} onChange={(e) => setFilter('health')(e.target.value)}>
                            <MenuItem value="">All</MenuItem>
                            {HEALTH_OPTIONS.map((o) => (
                                <MenuItem key={o.value} value={o.value}>
                                    {o.label}
                                </MenuItem>
                            ))}
                        </TextField>
                        <TextField select label="Category" value={filters.category} onChange={(e) => setFilter('category')(e.target.value)}>
                            <MenuItem value="">All</MenuItem>
                            {categories.map((c) => (
                                <MenuItem key={c} value={c}>
                                    {c}
                                </MenuItem>
                            ))}
                        </TextField>
                    </Box>

                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2, flexWrap: 'wrap', gap: 1 }}>
                        <Typography variant="body2" color="text.secondary">
                            Showing {from} to {to} of {filtered.length} entries
                        </Typography>
                        <ToggleButton
                            size="small"
                            value="group"
                            selected={grouped}
                            onChange={() => setGrouped((v) => !v)}
                            title="Group connectors by category"
                            sx={{ textTransform: 'none', gap: 0.75, px: 1.5, height: 30 }}
                        >
                            <CategoryOutlined fontSize="small" /> Group by category
                        </ToggleButton>
                    </Box>

                    <ConnectorsGrid data={visible} grouped={grouped} onEdit={setEditing} />

                    {pageCount > 1 && (
                        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 3 }}>
                            <Pagination count={pageCount} page={currentPage} onChange={(_, p) => setPage(p)} color="primary" shape="rounded" />
                        </Box>
                    )}
                </>
            )}

            <ConnectorEditModal connector={editing} show={editing !== null} onClose={() => setEditing(null)} />
        </Page>
    );
}
