import { useState } from 'react';
import { Box } from '@mui/material';

/**
 * The icon of a site, kept by Watcher (the browser does not ask the site itself). A site without icon, or one that cannot be
 * reached, shows its first letter instead.
 */
export function Favicon({ host, size = 16 }: { host: string; size?: number }) {
    const [failed, setFailed] = useState(false);
    if (failed) {
        return (
            <Box
                aria-hidden
                data-testid="favicon-fallback"
                sx={{ width: size, height: size, flexShrink: 0, borderRadius: '4px', bgcolor: 'action.selected', color: 'text.secondary', display: 'grid', placeItems: 'center', fontSize: size * 0.62, fontWeight: 700, textTransform: 'uppercase', lineHeight: 1 }}
            >
                {host.charAt(0)}
            </Box>
        );
    }
    return (
        <Box
            component="img"
            src={`/api/threats_watcher/favicon/?host=${encodeURIComponent(host)}`}
            alt=""
            width={size}
            height={size}
            loading="lazy"
            data-testid="favicon"
            onError={() => setFailed(true)}
            sx={{ flexShrink: 0, borderRadius: '3px', objectFit: 'contain' }}
        />
    );
}
