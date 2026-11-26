import { useEffect, useRef, useState } from 'react';
import { Alert, Box, Button, Card, CardActions, CardContent, Chip, CircularProgress, FormControlLabel, Switch, Tooltip, Typography } from '@mui/material';
import EditOutlined from '@mui/icons-material/EditOutlined';
import StarRounded from '@mui/icons-material/StarRounded';
import WifiTethering from '@mui/icons-material/WifiTethering';
import { getErrorMessage } from '../../../api/client';
import { useSetDefaultLlm, useTestConnector } from '../hooks';
import type { Connector, TestResult } from '../types';
import { checkedText, connectorLight, StateIcon, useLight } from './State';
import { ConnectorLogo } from './ConnectorLogo';

const RESULT_TIMEOUT_MS = 10_000;

interface ConnectorCardProps {
    connector: Connector;
    onEditClick: (connector: Connector) => void;
}

export function ConnectorCard({ connector, onEditClick }: ConnectorCardProps) {
    const [testResult, setTestResult] = useState<TestResult | null>(null);
    const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
    const test = useTestConnector();
    const setDefault = useSetDefaultLlm();
    const isAi = connector.category === 'Artificial Intelligence';

    useEffect(() => () => clearTimeout(timer.current), []);

    const handleTest = async () => {
        clearTimeout(timer.current);
        setTestResult(null);
        try {
            const { success, message } = await test.mutateAsync(connector.id);
            setTestResult({ success, message });
        } catch (err) {
            setTestResult({ success: false, message: getErrorMessage(err) });
        } finally {
            timer.current = setTimeout(() => setTestResult(null), RESULT_TIMEOUT_MS);
        }
    };

    const testing = test.isPending;
    const { light, label, meaning } = connectorLight(connector);
    const color = useLight(light);
    const detail = connector.health?.message ? ` ${connector.health.message}` : '';

    return (
        <Card data-light={light} sx={{ height: '100%', display: 'flex', flexDirection: 'column', textAlign: 'center' }}>
            <CardContent sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', py: 3 }}>
                <Box sx={{ mb: 2, height: 72, minWidth: 72, maxWidth: 144, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <ConnectorLogo connector={connector} size={72} />
                </Box>
                <Typography variant="h4" component="div">
                    {connector.name}
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ mb: 1.5 }}>
                    v{connector.version}
                </Typography>
                {connector.is_default_llm && <Chip size="small" color="primary" icon={<StarRounded />} label="Default" data-testid="default-ai-badge" sx={{ mb: 1.5, mt: -0.75 }} />}
                <Tooltip title={`${meaning}${detail}`}>
                    <Box data-testid="connector-light" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <StateIcon light={light} />
                        <Typography variant="body2" sx={{ fontWeight: 750, color }}>
                            {label}
                        </Typography>
                    </Box>
                </Tooltip>
                <Typography variant="caption" color="text.secondary" sx={{ mt: 0.25 }}>
                    {connector.status === 'configured' ? 'Configured' : connector.status === 'partial' ? 'Incomplete' : 'Disabled'}
                    {connector.status !== 'disabled' && ` - ${checkedText(connector)}`}
                </Typography>
                {connector.readonly && <Chip variant="outlined" color="warning" label="Read-only" sx={{ mt: 1 }} />}
                {isAi && (
                    <Tooltip title="The AI that writes the summaries. If it fails, the other configured AIs are tried.">
                        <FormControlLabel
                            sx={{ mt: 1, mr: 0 }}
                            control={
                                <Switch
                                    size="small"
                                    checked={!!connector.is_default_llm}
                                    disabled={setDefault.isPending || connector.status === 'disabled'}
                                    onChange={(e) => setDefault.mutate({ id: connector.id, isDefault: e.target.checked })}
                                    slotProps={{ input: { 'aria-label': `Use ${connector.name} as the default AI` } }}
                                />
                            }
                            label={<Typography variant="caption">Default AI</Typography>}
                        />
                    </Tooltip>
                )}

                {testResult && (
                    <Alert
                        severity={testResult.success ? 'success' : 'error'}
                        onClose={() => setTestResult(null)}
                        sx={{ mt: 2, width: '100%', textAlign: 'left', py: 0 }}
                    >
                        {testResult.message}
                    </Alert>
                )}
            </CardContent>

            <CardActions sx={{ gap: 1, px: 2, pb: 2 }}>
                <Button
                    fullWidth
                    size="small"
                    variant="contained"
                    startIcon={<EditOutlined fontSize="small" />}
                    onClick={() => onEditClick(connector)}
                >
                    {connector.readonly ? 'View' : 'Edit'}
                </Button>
                <Button
                    fullWidth
                    size="small"
                    variant="outlined"
                    color="success"
                    disabled={testing}
                    startIcon={testing ? <CircularProgress size={14} color="inherit" /> : <WifiTethering fontSize="small" />}
                    onClick={handleTest}
                    sx={{ ml: '0 !important' }}
                >
                    {testing ? 'Testing…' : 'Test'}
                </Button>
            </CardActions>
        </Card>
    );
}
