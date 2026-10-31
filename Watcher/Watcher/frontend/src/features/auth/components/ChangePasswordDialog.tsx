import { useState, type FormEvent } from 'react';
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, TextField } from '@mui/material';
import { usePasswordChange } from '../hooks';

function PasswordForm({ onClose }: { onClose: () => void }) {
    const passwordChange = usePasswordChange();
    const [oldPassword, setOldPassword] = useState('');
    const [password, setPassword] = useState('');
    const [confirmed, setConfirmed] = useState('');

    const mismatch = !!confirmed && password !== confirmed;
    const canSubmit = !!oldPassword && !!password && password === confirmed && !passwordChange.isPending;

    const onSubmit = (e: FormEvent) => {
        e.preventDefault();
        if (canSubmit) passwordChange.mutate({ oldPassword, password }, { onSuccess: onClose });
    };

    const fieldProps = { type: 'password', fullWidth: true, slotProps: { htmlInput: { maxLength: 100 } } } as const;

    return (
        <form onSubmit={onSubmit} noValidate>
            <DialogTitle id="change-password-title">Change password</DialogTitle>
            <DialogContent>
                <Stack spacing={2.5} sx={{ pt: 1 }}>
                    <TextField
                        {...fieldProps}
                        name="old_password"
                        label="Current password"
                        autoComplete="current-password"
                        autoFocus
                        value={oldPassword}
                        onChange={(e) => setOldPassword(e.target.value)}
                    />
                    <TextField
                        {...fieldProps}
                        name="password"
                        label="New password"
                        autoComplete="new-password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                    />
                    <TextField
                        {...fieldProps}
                        name="confirmed_password"
                        label="Confirm new password"
                        autoComplete="new-password"
                        value={confirmed}
                        onChange={(e) => setConfirmed(e.target.value)}
                        error={mismatch}
                        helperText={mismatch ? 'Passwords do not match' : ' '}
                    />
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button color="inherit" onClick={onClose}>
                    Cancel
                </Button>
                <Button type="submit" variant="contained" disabled={!canSubmit} loading={passwordChange.isPending}>
                    Change password
                </Button>
            </DialogActions>
        </form>
    );
}

/** The form is remounted on every open, so it always starts empty. */
export function ChangePasswordDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
    return (
        <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth aria-labelledby="change-password-title">
            <PasswordForm onClose={onClose} />
        </Dialog>
    );
}
