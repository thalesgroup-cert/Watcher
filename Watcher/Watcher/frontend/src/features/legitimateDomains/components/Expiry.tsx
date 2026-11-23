import { Box, Tooltip, Typography } from '@mui/material';
import ErrorOutlined from '@mui/icons-material/ErrorOutlined';
import HelpOutlined from '@mui/icons-material/HelpOutlined';
import WarningAmberOutlined from '@mui/icons-material/WarningAmberOutlined';
import { expiryDistance, expiryStatus, formatDay } from '../expiry';

const UNCONFIRMED_MEANING =
    'This date is in the past, but no registry has confirmed it lately (it was typed by hand, or not checked for a week). It may be wrong: Watcher keeps asking the registry.';

/**
 * Date of an expiry, with how far it is; expired and soon-expiring ones are flagged by colour and an icon.
 * `confirmed` is for the expiry of a domain: when it is false, a past date is shown as Unconfirmed (amber) instead of Expired
 * (red), because the date itself may be what is wrong. Left out, the date is taken as confirmed.
 */
export function Expiry({
    value,
    emptyLabel = 'Not detected yet',
    confirmed,
    lost,
}: {
    value: string | null;
    emptyLabel?: string;
    confirmed?: boolean;
    /** The registry says the domain does not exist: it is not ours any more (shown in red, with the reason in `emptyLabel`). */
    lost?: boolean;
}) {
    if (!value && lost) {
        return (
            <Typography variant="body2" data-testid="expiry-not-registered" sx={{ color: 'error.main', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <ErrorOutlined sx={{ fontSize: 16 }} />
                {emptyLabel}
            </Typography>
        );
    }
    if (!value) {
        return (
            <Typography variant="body2" color="text.disabled">
                {emptyLabel}
            </Typography>
        );
    }
    const past = expiryStatus(value) === 'expired';
    const status = past && confirmed === false ? 'unconfirmed' : expiryStatus(value);
    const color = status === 'expired' ? 'error.main' : status === 'expiring_soon' || status === 'unconfirmed' ? 'warning.main' : 'text.secondary';
    const Icon = status === 'expired' ? ErrorOutlined : status === 'unconfirmed' ? HelpOutlined : status === 'expiring_soon' ? WarningAmberOutlined : null;
    const caption =
        status === 'expired' ? `Expired ${expiryDistance(value)}` : status === 'unconfirmed' ? `Unconfirmed: expired ${expiryDistance(value)}?` : `Expires ${expiryDistance(value)}`;
    return (
        <Box>
            <Typography variant="body2" noWrap>
                {formatDay(value)}
            </Typography>
            <Tooltip title={status === 'unconfirmed' ? UNCONFIRMED_MEANING : ''} disableHoverListener={status !== 'unconfirmed'}>
                <Typography
                    variant="caption"
                    data-testid={`expiry-${status}`}
                    sx={{ color, display: 'flex', alignItems: 'center', gap: 0.5, fontWeight: Icon ? 600 : 400 }}
                    noWrap
                >
                    {Icon && <Icon sx={{ fontSize: 14 }} />}
                    {caption}
                </Typography>
            </Tooltip>
        </Box>
    );
}
