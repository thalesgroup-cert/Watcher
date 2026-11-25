import { useState } from 'react';
import {
    Alert,
    Box,
    Button,
    Chip,
    CircularProgress,
    Divider,
    FormControlLabel,
    IconButton,
    Stack,
    Switch,
    Tab,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableRow,
    Tabs,
    ToggleButton,
    ToggleButtonGroup,
    Typography,
} from '@mui/material';
import CheckCircleOutlined from '@mui/icons-material/CheckCircleOutlined';
import Close from '@mui/icons-material/Close';
import ErrorOutlined from '@mui/icons-material/ErrorOutlined';
import WifiTethering from '@mui/icons-material/WifiTethering';
import { getErrorMessage } from '../../../api/client';
import { fonts } from '../../../styles/theme';
import { SideDrawer } from '../../../ui/SideDrawer';
import { When } from '../../../ui/When';
import { useDeliveries, useSetDefaultLlm, useTestConnector } from '../hooks';
import type { Connector, ConnectorField, Delivery, DeliveryKind, TestResult } from '../types';
import { ConnectorConfigForm } from './ConnectorConfigForm';
import { ConnectorLogo } from './ConnectorLogo';
import { checkedText, connectorLight, StateIcon, useLight } from './State';

export type ConnectorTab = 'overview' | 'configuration' | 'deliveries';

const TABS: { value: ConnectorTab; label: string }[] = [
    { value: 'overview', label: 'Overview' },
    { value: 'configuration', label: 'Configuration' },
    { value: 'deliveries', label: 'Deliveries' },
];

const KIND_LABEL: Record<DeliveryKind, string> = { test: 'Test', health: 'Weekly check', notification: 'Notification', ai: 'AI call' };

/** Where the value of a field comes from, as the Configuration tab says it. */
function sourceOf(field: ConnectorField): { label: string; color: 'default' | 'info' | 'success' } {
    if (field.overridden) return { label: 'Manually set', color: 'info' };
    if (field.from_default) return { label: 'LiteLLM default', color: 'success' };
    return field.value ? { label: 'From .env', color: 'default' } : { label: 'Not set', color: 'default' };
}

const Fact = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <Box sx={{ minWidth: 0 }}>
        <Typography variant="overline" color="text.secondary" sx={{ lineHeight: 1.4, display: 'block' }}>
            {label}
        </Typography>
        <Typography variant="body2" component="div" sx={{ overflowWrap: 'anywhere' }}>
            {children}
        </Typography>
    </Box>
);

/** What the connector is: its identity, where it stands, and each setting it reads. */
function OverviewTab({ connector }: { connector: Connector }) {
    const test = useTestConnector();
    const setDefault = useSetDefaultLlm();
    const [result, setResult] = useState<TestResult | null>(null);
    const { light, label, meaning } = connectorLight(connector);
    const color = useLight(light);
    const isAi = connector.category === 'Artificial Intelligence';

    const runTest = async () => {
        setResult(null);
        try {
            const { success, message } = await test.mutateAsync(connector.id);
            setResult({ success, message });
        } catch (err) {
            setResult({ success: false, message: getErrorMessage(err) });
        }
    };

    return (
        <Box sx={{ flexGrow: 1, overflowY: 'auto', px: 2.5, py: 2 }}>
            {connector.description && (
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    {connector.description}
                </Typography>
            )}

            <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', mb: 1 }}>
                <StateIcon light={light} />
                <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                    <Typography variant="body2" sx={{ fontWeight: 750, color }}>
                        {label}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                        {meaning} {connector.status !== 'disabled' && checkedText(connector)}
                    </Typography>
                </Box>
                <Button
                    size="small"
                    variant="outlined"
                    color="success"
                    disabled={test.isPending}
                    startIcon={test.isPending ? <CircularProgress size={14} color="inherit" /> : <WifiTethering fontSize="small" />}
                    onClick={runTest}
                >
                    {test.isPending ? 'Testing…' : 'Test'}
                </Button>
            </Stack>
            {result && (
                <Alert severity={result.success ? 'success' : 'error'} onClose={() => setResult(null)} sx={{ mb: 1 }}>
                    {result.message}
                </Alert>
            )}

            {isAi && (
                <FormControlLabel
                    sx={{ mt: 0.5 }}
                    control={
                        <Switch
                            size="small"
                            checked={!!connector.is_default_llm}
                            disabled={setDefault.isPending || connector.status === 'disabled'}
                            onChange={(e) => setDefault.mutate({ id: connector.id, isDefault: e.target.checked })}
                        />
                    }
                    label={<Typography variant="body2">Use as the default AI (the others take over when it fails)</Typography>}
                />
            )}

            <Divider sx={{ my: 2 }} />

            <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', sm: 'repeat(3, minmax(0, 1fr))' } }}>
                <Fact label="Identifier">
                    <Box component="code" sx={{ fontFamily: fonts.mono, fontSize: 13 }}>
                        {connector.id}
                    </Box>
                </Fact>
                <Fact label="Category">{connector.category}</Fact>
                <Fact label="Version">{connector.version ?? '-'}</Fact>
                <Fact label="Author">{connector.author || '-'}</Fact>
                <Fact label="Settings">{connector.readonly ? 'Read-only (settings.py)' : 'Editable here'}</Fact>
            </Box>

            <Typography variant="overline" color="text.secondary" component="h3" sx={{ display: 'block', mt: 3, mb: 0.5 }}>
                Settings it reads
            </Typography>
            <Box sx={{ overflowX: 'auto' }}>
                <Table size="small" data-testid="connector-settings">
                    <TableHead>
                        <TableRow>
                            <TableCell>Field</TableCell>
                            <TableCell>Setting</TableCell>
                            <TableCell>Value</TableCell>
                            <TableCell sx={{ minWidth: 200 }}>Example</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {(connector.fields ?? []).map((f) => {
                            const source = sourceOf(f);
                            return (
                                <TableRow key={f.name}>
                                    <TableCell sx={{ whiteSpace: 'nowrap' }}>
                                        {f.label}
                                        {f.required && (
                                            <Box component="span" aria-label="required" title="required" sx={{ color: 'error.main', ml: 0.5 }}>
                                                *
                                            </Box>
                                        )}
                                    </TableCell>
                                    <TableCell>
                                        <Box sx={{ fontFamily: fonts.mono, fontSize: 12 }}>{f.settings_key ?? f.name}</Box>
                                        <Typography variant="caption" color="text.secondary">
                                            {f.type === 'password' ? 'secret' : (f.type ?? 'text')}
                                        </Typography>
                                    </TableCell>
                                    <TableCell>
                                        <Chip size="small" variant="outlined" color={source.color} label={source.label} sx={{ height: 20, fontSize: 11 }} />
                                    </TableCell>
                                    <TableCell sx={{ fontFamily: fonts.mono, fontSize: 12, color: 'text.secondary', wordBreak: 'break-all' }}>{f.placeholder || '-'}</TableCell>
                                </TableRow>
                            );
                        })}
                    </TableBody>
                </Table>
            </Box>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                A field that was never saved here follows <code>settings.py</code> and <code>.env</code>; <strong>Configuration</strong> changes them.
            </Typography>
        </Box>
    );
}

const FILTERS: { value: '' | DeliveryKind; label: string }[] = [
    { value: '', label: 'All' },
    { value: 'notification', label: 'Notifications' },
    { value: 'ai', label: 'AI calls' },
    { value: 'test', label: 'Tests' },
    { value: 'health', label: 'Weekly checks' },
];

function DeliveryRow({ delivery }: { delivery: Delivery }) {
    return (
        <TableRow data-testid="delivery-row">
            <TableCell sx={{ whiteSpace: 'nowrap' }}>
                <When iso={delivery.created_at} />
            </TableCell>
            <TableCell>
                <Chip size="small" variant="outlined" label={KIND_LABEL[delivery.kind] ?? delivery.kind} sx={{ height: 20, fontSize: 11 }} />
            </TableCell>
            <TableCell>
                <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', color: delivery.ok ? 'success.main' : 'error.main' }}>
                    {delivery.ok ? <CheckCircleOutlined fontSize="small" /> : <ErrorOutlined fontSize="small" />}
                    <Typography variant="body2" color="inherit">
                        {delivery.ok ? 'OK' : 'Failed'}
                    </Typography>
                </Stack>
            </TableCell>
            <TableCell sx={{ fontFamily: fonts.mono, fontSize: 12, overflowWrap: 'anywhere' }}>{delivery.subject || '-'}</TableCell>
            <TableCell sx={{ whiteSpace: 'nowrap' }}>{delivery.duration == null ? '-' : `${delivery.duration < 10 ? delivery.duration.toFixed(1) : Math.round(delivery.duration)} s`}</TableCell>
            <TableCell sx={{ overflowWrap: 'anywhere', color: 'text.secondary', fontSize: 13 }}>{delivery.message || '-'}</TableCell>
        </TableRow>
    );
}

/** What the connector did lately: tests, notifications sent through it, AI calls. Kept by Watcher, the last hundred. */
function DeliveriesTab({ connector }: { connector: Connector }) {
    const [kind, setKind] = useState<'' | DeliveryKind>('');
    const { data, isLoading, error } = useDeliveries(connector.id, kind);
    return (
        <Box sx={{ flexGrow: 1, overflowY: 'auto', px: 2.5, py: 2 }}>
            <ToggleButtonGroup exclusive size="small" value={kind} onChange={(_, v: '' | DeliveryKind | null) => v !== null && setKind(v)} aria-label="Kind of delivery" sx={{ mb: 2, flexWrap: 'wrap' }}>
                {FILTERS.map((f) => (
                    <ToggleButton key={f.value} value={f.value}>
                        {f.label}
                    </ToggleButton>
                ))}
            </ToggleButtonGroup>
            {isLoading && <CircularProgress size={20} />}
            {error && <Alert severity="error">{getErrorMessage(error)}</Alert>}
            {data && data.length === 0 && (
                <Typography variant="body2" color="text.secondary" data-testid="deliveries-empty">
                    Nothing yet. The tests of this connector, the notifications sent through it and the calls made to it appear here.
                </Typography>
            )}
            {data && data.length > 0 && (
                <Box sx={{ overflowX: 'auto' }}>
                    <Table size="small">
                        <TableHead>
                            <TableRow>
                                <TableCell>When</TableCell>
                                <TableCell>Kind</TableCell>
                                <TableCell>Result</TableCell>
                                <TableCell>About</TableCell>
                                <TableCell>Took</TableCell>
                                <TableCell>Message</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {data.map((d) => (
                                <DeliveryRow key={d.id} delivery={d} />
                            ))}
                        </TableBody>
                    </Table>
                </Box>
            )}
        </Box>
    );
}

interface ConnectorDrawerProps {
    connector: Connector | null;
    tab: ConnectorTab;
    onTab: (tab: ConnectorTab) => void;
    onClose: () => void;
}

/** One connector in the panel on the right, as the other pages open theirs: what it is, how it is set, what it did. */
export function ConnectorDrawer({ connector, tab, onTab, onClose }: ConnectorDrawerProps) {
    // After a save the form starts again from what the server keeps (the secrets masked again)
    const [saved, setSaved] = useState(0);
    return (
        <SideDrawer open={!!connector} onClose={onClose} labelledBy="connector-drawer-title" width={680}>
            {connector && (
                <>
                    <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', px: 2.5, py: 2 }}>
                        <Box sx={{ width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <ConnectorLogo connector={connector} size={40} />
                        </Box>
                        <Box sx={{ minWidth: 0, flexGrow: 1 }}>
                            <Typography variant="overline" color="text.secondary" sx={{ lineHeight: 1.4, display: 'block' }}>
                                Connector
                            </Typography>
                            <Typography id="connector-drawer-title" variant="h3" component="h2" noWrap>
                                {connector.name}
                            </Typography>
                        </Box>
                        <Chip variant="outlined" label={connector.category} />
                        <IconButton aria-label="Close details" onClick={onClose} edge="end">
                            <Close />
                        </IconButton>
                    </Stack>
                    <Tabs value={tab} onChange={(_, t: ConnectorTab) => onTab(t)} aria-label="Connector sections" variant="scrollable" allowScrollButtonsMobile sx={{ px: 1 }}>
                        {TABS.map((t) => (
                            <Tab key={t.value} value={t.value} label={t.label} />
                        ))}
                    </Tabs>
                    <Divider />
                    {tab === 'overview' && <OverviewTab key={connector.id} connector={connector} />}
                    {tab === 'configuration' && <ConnectorConfigForm key={`${connector.id}-${saved}`} connector={connector} onSaved={() => setSaved((n) => n + 1)} />}
                    {tab === 'deliveries' && <DeliveriesTab key={connector.id} connector={connector} />}
                </>
            )}
        </SideDrawer>
    );
}
