import { useEffect, useRef, useState } from 'react';
import { Alert, Box, Button, Card, CardActions, CardContent, Chip, CircularProgress, Typography } from '@mui/material';
import EditOutlined from '@mui/icons-material/EditOutlined';
import WifiTethering from '@mui/icons-material/WifiTethering';
import { getErrorMessage } from '../../../api/client';
import { useTestConnector } from '../hooks';
import type { Connector, TestResult } from '../types';
import { HealthChip, StatusChip } from './badges';
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

    return (
        <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column', textAlign: 'center' }}>
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
                <Box sx={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 0.75 }}>
                    <StatusChip status={connector.status} />
                    <HealthChip health={connector.health} />
                    {connector.readonly && <Chip variant="outlined" color="warning" label="Read-only" />}
                </Box>

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
