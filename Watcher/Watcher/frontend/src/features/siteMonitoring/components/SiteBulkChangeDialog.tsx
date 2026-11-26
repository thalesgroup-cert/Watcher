import { useState } from 'react';
import { Box, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, MenuItem, Stack, Switch, TextField, Typography } from '@mui/material';
import { ACTIONS, LEGITIMACY } from '../catalog';

type Field = 'legitimacy' | (typeof ACTIONS)[number]['key'];
type Changes = Partial<Record<Field, number | boolean>>;

/** Tick the fields to change; they are applied together to every selected site (bulk_update). */
function ChangeForm({ count, onApply, onClose }: { count: number; onApply: (changes: Changes) => void; onClose: () => void }) {
    const [enabled, setEnabled] = useState<Partial<Record<Field, boolean>>>({});
    const [values, setValues] = useState<Record<Field, number | boolean>>({
        legitimacy: 5,
        takedown_request: true,
        legal_team: true,
        blocking_request: true,
    });
    const chosen = (Object.keys(enabled) as Field[]).filter((f) => enabled[f]);
    const toggle = (field: Field, on: boolean) => setEnabled((e) => ({ ...e, [field]: on }));
    const row = (field: Field, label: string, control: React.ReactNode) => (
        <Stack key={field} direction="row" spacing={1} sx={{ alignItems: 'center', minHeight: 48 }}>
            <FormControlLabel
                sx={{ minWidth: 190 }}
                control={<Checkbox checked={!!enabled[field]} onChange={(e) => toggle(field, e.target.checked)} />}
                label={<Typography variant="body2" sx={{ fontWeight: 600 }}>{label}</Typography>}
            />
            <Box sx={{ flexGrow: 1, visibility: enabled[field] ? 'visible' : 'hidden' }}>{control}</Box>
        </Stack>
    );
    return (
        <>
            <DialogTitle id="site-bulk-title">Change {count} website{count === 1 ? '' : 's'}</DialogTitle>
            <DialogContent>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                    Tick every field to change: they are applied together. Sites that cannot be changed are reported in the summary.
                </Typography>
                {row(
                    'legitimacy',
                    'Legitimacy',
                    <TextField select size="small" fullWidth value={values.legitimacy} onChange={(e) => setValues((v) => ({ ...v, legitimacy: Number(e.target.value) }))} slotProps={{ htmlInput: { 'aria-label': 'New legitimacy' } }}>
                        {LEGITIMACY.map((l) => (
                            <MenuItem key={l.value} value={l.value}>
                                {l.label}
                            </MenuItem>
                        ))}
                    </TextField>,
                )}
                {ACTIONS.map((a) =>
                    row(
                        a.key,
                        a.label,
                        <FormControlLabel
                            control={<Switch checked={values[a.key] === true} onChange={(e) => setValues((v) => ({ ...v, [a.key]: e.target.checked }))} />}
                            label={values[a.key] ? 'Yes' : 'No'}
                        />,
                    ),
                )}
            </DialogContent>
            <DialogActions>
                <Button color="inherit" onClick={onClose}>
                    Cancel
                </Button>
                <Button
                    variant="contained"
                    disabled={chosen.length === 0}
                    onClick={() => onApply(Object.fromEntries(chosen.map((f) => [f, values[f]])) as Changes)}
                >
                    Apply to {count}
                </Button>
            </DialogActions>
        </>
    );
}

export function SiteBulkChangeDialog({ open, count, onApply, onClose }: { open: boolean; count: number; onApply: (changes: Changes) => void; onClose: () => void }) {
    return (
        <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth aria-labelledby="site-bulk-title">
            {open && <ChangeForm count={count} onApply={onApply} onClose={onClose} />}
        </Dialog>
    );
}
