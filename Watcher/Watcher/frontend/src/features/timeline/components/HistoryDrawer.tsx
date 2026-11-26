import { Box, Divider, IconButton, Stack, Typography } from '@mui/material';
import Close from '@mui/icons-material/Close';
import HistoryOutlined from '@mui/icons-material/HistoryOutlined';
import { SideDrawer } from '../../../ui/SideDrawer';
import type { HistoryTarget } from '../types';
import { ObjectHistory } from './ObjectHistory';

interface HistoryDrawerProps {
    open: boolean;
    onClose: () => void;
    targets: HistoryTarget[];
    /** Name of the object, shown as the drawer title. */
    label?: string;
}

/** Right-hand panel with the change history of one object (or of two merged, e.g. a DNS alert and its domain). */
export function HistoryDrawer({ open, onClose, targets, label }: HistoryDrawerProps) {
    return (
        <SideDrawer open={open} onClose={onClose} labelledBy="history-drawer-title">
            <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', px: 2.5, py: 2 }}>
                <HistoryOutlined color="primary" />
                <Box sx={{ minWidth: 0, flexGrow: 1 }}>
                    <Typography variant="overline" color="text.secondary" sx={{ lineHeight: 1.4, display: 'block' }}>
                        History
                    </Typography>
                    <Typography id="history-drawer-title" variant="h3" component="h2" noWrap title={label}>
                        {label || 'Item'}
                    </Typography>
                </Box>
                <IconButton aria-label="Close history" onClick={onClose} edge="end">
                    <Close />
                </IconButton>
            </Stack>
            <Divider />
            <Box sx={{ flexGrow: 1, overflowY: 'auto', px: 2.5, pb: 3 }}>
                <ObjectHistory targets={targets} enabled={open} />
            </Box>
        </SideDrawer>
    );
}
