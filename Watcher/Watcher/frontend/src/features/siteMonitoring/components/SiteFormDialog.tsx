import { useState } from 'react';
import {
    Box,
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    FormControlLabel,
    MenuItem,
    Stack,
    Switch,
    TextField,
    Typography,
} from '@mui/material';
import { DateField } from '../../../ui/DateField';
import { countLines, useBulk } from '../../bulk/useBulk';
import { ACTIONS, CHECKS, LEGITIMACY } from '../catalog';
import { SITE_BULK, useSaveSite } from '../hooks';
import type { Site, SiteInput } from '../types';

type Flag = (typeof CHECKS)[number]['key'] | (typeof ACTIONS)[number]['key'];

interface FormState {
    domain_name: string;
    ticket_id: string;
    registrar: string;
    legitimacy: number;
    expiry: string;
    domain_expiry: string;
    domain_created_at: string;
    ssl_expiry: string;
    flags: Record<Flag, boolean>;
}

const fromSite = (s: Site | null): FormState => ({
    domain_name: s?.domain_name ?? '',
    ticket_id: s?.ticket_id ?? '',
    registrar: s?.registrar ?? '',
    legitimacy: s?.legitimacy ?? 2,
    expiry: s?.expiry?.slice(0, 10) ?? '',
    domain_expiry: s?.domain_expiry ?? '',
    domain_created_at: s?.domain_created_at ?? '',
    ssl_expiry: s?.ssl_expiry ?? '',
    flags: {
        ip_monitoring: s?.ip_monitoring ?? true,
        content_monitoring: s?.content_monitoring ?? true,
        mail_monitoring: s?.mail_monitoring ?? true,
        takedown_request: s?.takedown_request ?? false,
        legal_team: s?.legal_team ?? false,
        blocking_request: s?.blocking_request ?? false,
    },
});

const AUTO = 'Leave empty: detected automatically.';

function SiteForm({ site, onClose }: { site: Site | null; onClose: () => void }) {
    const editing = site !== null;
    const [form, setForm] = useState(() => fromSite(site));
    const [several, setSeveral] = useState(false);
    const save = useSaveSite();
    const bulk = useBulk(SITE_BULK);
    const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));
    const setFlag = (key: Flag, value: boolean) => setForm((f) => ({ ...f, flags: { ...f.flags, [key]: value } }));
    // An "Unknown" site is not checked (same rule as before the migration).
    const unknown = form.legitimacy === 1;

    const count = several ? countLines(form.domain_name) : 0;
    const blocked = (several ? count === 0 : !form.domain_name.trim()) || save.isPending;

    const submit = (dryRun: boolean) => {
        if (blocked) return;
        const input: SiteInput = {
            ticket_id: form.ticket_id.trim(),
            legitimacy: form.legitimacy,
            expiry: form.expiry || null,
            domain_expiry: form.domain_expiry || null,
            domain_created_at: form.domain_created_at || null,
            ssl_expiry: form.ssl_expiry || null,
            ...form.flags,
            ...(unknown ? { ip_monitoring: false, content_monitoring: false, mail_monitoring: false } : {}),
            ...(editing ? { registrar: form.registrar.trim() || null } : {}),
        };
        if (several) {
            void bulk.create(form.domain_name, input, 'Monitor websites', dryRun);
            if (!dryRun) onClose();
            return;
        }
        save.mutate({ id: site?.id, input: { ...input, domain_name: form.domain_name.trim() } }, { onSuccess: onClose });
    };

    const switches = (items: readonly { key: Flag; label: string }[], disabled = false) => (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)' } }}>
            {items.map((i) => (
                <FormControlLabel
                    key={i.key}
                    disabled={disabled}
                    control={<Switch size="small" checked={!disabled && form.flags[i.key]} onChange={(e) => setFlag(i.key, e.target.checked)} />}
                    label={<Typography variant="body2">{i.label}</Typography>}
                />
            ))}
        </Box>
    );

    return (
        <form
            noValidate
            onSubmit={(e) => {
                e.preventDefault();
                submit(false);
            }}
        >
            <DialogTitle id="site-form-title">{editing ? `Edit ${site.domain_name}` : 'Monitor websites'}</DialogTitle>
            <DialogContent>
                <Stack spacing={2.5} sx={{ pt: 1 }}>
                    <Stack spacing={0.5}>
                        <TextField
                            label={several ? 'Domains' : 'Domain'}
                            name="domain_name"
                            required
                            autoFocus={!editing}
                            multiline={several}
                            minRows={several ? 5 : undefined}
                            value={several ? form.domain_name : form.domain_name.split(/\r?\n/)[0]}
                            onChange={(e) => set('domain_name', e.target.value)}
                            placeholder={several ? 'suspicious-domain.com\nother-domain.net\n…' : 'suspicious-domain.com'}
                            helperText={several ? `${count} domain${count === 1 ? '' : 's'} detected. The other fields apply to every one.` : undefined}
                            fullWidth
                        />
                        {!editing && (
                            <FormControlLabel
                                control={<Switch size="small" checked={several} onChange={(e) => setSeveral(e.target.checked)} />}
                                label={<Typography variant="body2">Add several, one per line</Typography>}
                            />
                        )}
                    </Stack>
                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                        <TextField
                            select
                            name="legitimacy"
                            label="Legitimacy"
                            value={form.legitimacy}
                            onChange={(e) => set('legitimacy', Number(e.target.value))}
                            fullWidth
                        >
                            {LEGITIMACY.map((l) => (
                                <MenuItem key={l.value} value={l.value}>
                                    {l.label}
                                </MenuItem>
                            ))}
                        </TextField>
                        <TextField
                            name="ticket_id"
                            label="Ticket"
                            value={form.ticket_id}
                            onChange={(e) => set('ticket_id', e.target.value)}
                            slotProps={{ htmlInput: { maxLength: 20 } }}
                            fullWidth
                        />
                    </Stack>
                    {editing && (
                        <TextField
                            name="registrar"
                            label="Registrar"
                            value={form.registrar}
                            onChange={(e) => set('registrar', e.target.value)}
                            helperText={AUTO}
                            fullWidth
                        />
                    )}
                    <Box>
                        <Typography variant="overline" color="text.secondary">
                            Watch
                        </Typography>
                        {switches(CHECKS, unknown)}
                        {unknown && (
                            <Typography variant="caption" color="text.secondary">
                                A site of unknown legitimacy is not checked: pick another level to watch it.
                            </Typography>
                        )}
                    </Box>
                    <Box>
                        <Typography variant="overline" color="text.secondary">
                            Actions taken
                        </Typography>
                        {switches(ACTIONS)}
                    </Box>
                    <DateField label="Monitor until" name="expiry" value={form.expiry} onChange={(v) => set('expiry', v)} helperText="Leave empty to monitor it with no end date." shortcuts />
                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                        <DateField label="Domain expiry" name="domain_expiry" value={form.domain_expiry} onChange={(v) => set('domain_expiry', v)} helperText={AUTO} />
                        <DateField label="Certificate expiry" name="ssl_expiry" value={form.ssl_expiry} onChange={(v) => set('ssl_expiry', v)} helperText={AUTO} />
                    </Stack>
                    <DateField label="Registered on" name="domain_created_at" value={form.domain_created_at} onChange={(v) => set('domain_created_at', v)} helperText={AUTO} pastOnly />
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button color="inherit" onClick={onClose}>
                    Cancel
                </Button>
                {several && (
                    <Button variant="outlined" disabled={blocked} onClick={() => submit(true)}>
                        Preview
                    </Button>
                )}
                <Button type="submit" variant="contained" disabled={blocked}>
                    {editing ? 'Save' : several ? `Monitor ${count}` : 'Start monitoring'}
                </Button>
            </DialogActions>
        </form>
    );
}

export function SiteFormDialog({ open, site, onClose }: { open: boolean; site: Site | null; onClose: () => void }) {
    return (
        <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth aria-labelledby="site-form-title">
            {open && <SiteForm site={site} onClose={onClose} />}
        </Dialog>
    );
}
