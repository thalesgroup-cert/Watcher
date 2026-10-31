import { Chip, Tooltip, type ChipProps } from '@mui/material';
import type { ConnectorHealth, ConnectorStatus, HealthStatus } from '../types';

interface ChipConfig {
    color: ChipProps['color'];
    label: string;
}

export const STATUS_CFG: Record<ConnectorStatus, ChipConfig> = {
    configured: { color: 'success', label: 'Configured' },
    partial: { color: 'warning', label: 'Incomplete' },
    disabled: { color: 'default', label: 'Disabled' },
};

export const HEALTH_CFG: Record<HealthStatus, ChipConfig> = {
    healthy: { color: 'success', label: 'Healthy' },
    unhealthy: { color: 'error', label: 'Unhealthy' },
    unknown: { color: 'default', label: 'Not tested yet' },
};

export function StatusChip({ status }: { status: ConnectorStatus }) {
    const c = STATUS_CFG[status] ?? STATUS_CFG.disabled;
    return <Chip variant="outlined" color={c.color} label={c.label} />;
}

export function HealthChip({ health }: { health?: ConnectorHealth | null }) {
    const c = HEALTH_CFG[health?.status ?? 'unknown'] ?? HEALTH_CFG.unknown;
    const title = health?.checked_at
        ? `Last checked ${new Date(health.checked_at).toLocaleString('en-GB')}${health.message ? ' - ' + health.message : ''}`
        : 'Never tested yet';
    return (
        <Tooltip title={title}>
            <Chip variant="outlined" color={c.color} label={c.label} />
        </Tooltip>
    );
}
