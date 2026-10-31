import { useState } from 'react';
import { Box } from '@mui/material';
import type { Connector } from '../types';

const LOGO_BASE = '/static/frontend/images/connectors/';

// Brand image if available, emoji fallback otherwise.
export function ConnectorLogo({ connector, size = 72 }: { connector: Connector; size?: number }) {
    const [failed, setFailed] = useState(false);
    if (!failed) {
        return (
            <Box
                component="img"
                src={`${LOGO_BASE}${connector.id}.png`}
                alt={connector.name}
                onError={() => setFailed(true)}
                sx={{ height: size, width: 'auto', maxWidth: size * 2, objectFit: 'contain' }}
            />
        );
    }
    return (
        <Box component="span" sx={{ fontSize: size * 0.7, lineHeight: 1, opacity: 0.85 }}>
            {connector.logo || '🔌'}
        </Box>
    );
}
