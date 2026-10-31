import { Box, Typography } from '@mui/material';
import ErrorOutlined from '@mui/icons-material/ErrorOutlined';
import WarningAmberOutlined from '@mui/icons-material/WarningAmberOutlined';
import { expiryDistance, expiryStatus, formatDay } from '../expiry';

/** Date of an expiry, with how far it is; expired and soon-expiring ones are flagged by colour and an icon. */
export function Expiry({ value, emptyLabel = 'Not detected yet' }: { value: string | null; emptyLabel?: string }) {
    if (!value) {
        return (
            <Typography variant="body2" color="text.disabled">
                {emptyLabel}
            </Typography>
        );
    }
    const status = expiryStatus(value);
    const color = status === 'expired' ? 'error.main' : status === 'expiring_soon' ? 'warning.main' : 'text.secondary';
    const Icon = status === 'expired' ? ErrorOutlined : status === 'expiring_soon' ? WarningAmberOutlined : null;
    return (
        <Box>
            <Typography variant="body2" noWrap>
                {formatDay(value)}
            </Typography>
            <Typography
                variant="caption"
                sx={{ color, display: 'flex', alignItems: 'center', gap: 0.5, fontWeight: Icon ? 600 : 400 }}
                noWrap
            >
                {Icon && <Icon sx={{ fontSize: 14 }} />}
                {status === 'expired' ? `Expired ${expiryDistance(value)}` : `Expires ${expiryDistance(value)}`}
            </Typography>
        </Box>
    );
}
