import type { ReactNode } from 'react';
import { Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle } from '@mui/material';

interface ConfirmDialogProps {
    open: boolean;
    title: string;
    children: ReactNode;
    confirmLabel: string;
    /** Destructive actions are red. */
    danger?: boolean;
    pending?: boolean;
    onConfirm: () => void;
    onClose: () => void;
}

export function ConfirmDialog({ open, title, children, confirmLabel, danger = false, pending = false, onConfirm, onClose }: ConfirmDialogProps) {
    return (
        // No fade-out: the page clears what it asked about as it closes, and a fading dialog would show the title of nothing ("Delete undefined")
        <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth aria-labelledby="confirm-dialog-title" transitionDuration={{ enter: 150, exit: 0 }}>
            <DialogTitle id="confirm-dialog-title">{title}</DialogTitle>
            <DialogContent>
                <DialogContentText component="div">{children}</DialogContentText>
            </DialogContent>
            <DialogActions>
                <Button color="inherit" onClick={onClose}>
                    Cancel
                </Button>
                <Button variant="contained" color={danger ? 'error' : 'primary'} disabled={pending} onClick={onConfirm}>
                    {confirmLabel}
                </Button>
            </DialogActions>
        </Dialog>
    );
}
