import { Box, Typography } from '@mui/material';
import { create } from 'zustand';
import { fonts } from '../styles/theme';
import { ConfirmDialog } from './ConfirmDialog';

interface ExternalLinkState {
    url: string | null;
    ask: (url: string) => void;
    close: () => void;
}

const useExternalLink = create<ExternalLinkState>((set) => ({
    url: null,
    ask: (url) => set({ url }),
    close: () => set({ url: null }),
}));

/** Opens a site that Watcher does not manage, after a window that says where it leads. */
export const askExternal = (url: string) => useExternalLink.getState().ask(url);

/** The window of `askExternal`: the destination in full (not a link), and a warning, before anything is opened. Mounted once, in the shell. */
export function ExternalLinkDialog() {
    const { url, close } = useExternalLink();
    return (
        <ConfirmDialog
            open={url !== null}
            title="Leaving Watcher"
            confirmLabel="Open the site"
            onClose={close}
            onConfirm={() => {
                if (url) window.open(url, '_blank', 'noopener,noreferrer');
                close();
            }}
        >
            <Typography variant="body2" sx={{ mb: 1.5 }}>
                This opens an external site in a new tab. It is not managed or verified by Watcher: its content may be unsafe.
            </Typography>
            <Typography variant="caption" color="text.secondary" component="div">
                Destination
            </Typography>
            <Box data-testid="external-destination" sx={{ fontFamily: fonts.mono, fontSize: 12, overflowWrap: 'anywhere', userSelect: 'all', p: 1, mt: 0.5, borderRadius: 1, bgcolor: 'action.hover' }}>
                {url}
            </Box>
        </ConfirmDialog>
    );
}
