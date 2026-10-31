import { useState } from 'react';
import {
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    FormControlLabel,
    Stack,
    Switch,
    TextField,
    Typography,
} from '@mui/material';
import { DateField } from '../../../ui/DateField';
import { countLines, useBulk } from '../../bulk/useBulk';
import { LEGITIMATE_DOMAIN_BULK, useSaveDomain } from '../hooks';
import type { DomainInput, LegitimateDomain } from '../types';

const TICKET_RE = /^[a-zA-Z0-9]+(-[a-zA-Z0-9]+)*(\.[a-zA-Z0-9]+(-[a-zA-Z0-9]+)*)*$/;
const COMMENTS_MAX = 300;

interface FormState {
    domain_name: string;
    ticket_id: string;
    contact: string;
    domain_created_at: string;
    expiry: string;
    ssl_expiry: string;
    repurchased: boolean;
    comments: string;
}

const fromDomain = (d?: LegitimateDomain | null): FormState => ({
    domain_name: d?.domain_name ?? '',
    ticket_id: d?.ticket_id ?? '',
    contact: d?.contact ?? '',
    domain_created_at: d?.domain_created_at?.slice(0, 10) ?? '',
    expiry: d?.expiry ?? '',
    ssl_expiry: d?.ssl_expiry ?? '',
    repurchased: d?.repurchased ?? false,
    comments: d?.comments ?? '',
});

const toInput = (f: FormState): DomainInput => ({
    domain_name: f.domain_name.trim(),
    ticket_id: f.ticket_id.trim(),
    contact: f.contact.trim(),
    domain_created_at: f.domain_created_at || null,
    expiry: f.expiry || null,
    ssl_expiry: f.ssl_expiry || null,
    repurchased: f.repurchased,
    comments: f.comments,
});

const AUTO_DATE = 'Leave empty: detected automatically.';

function DomainForm({ domain, onClose }: { domain: LegitimateDomain | null; onClose: () => void }) {
    const editing = domain !== null;
    const [form, setForm] = useState(() => fromDomain(domain));
    const [several, setSeveral] = useState(false);
    const save = useSaveDomain();
    const bulk = useBulk(LEGITIMATE_DOMAIN_BULK);
    const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));

    const count = several ? countLines(form.domain_name) : 0;
    const ticketError = form.ticket_id !== '' && !TICKET_RE.test(form.ticket_id.trim());
    const nameMissing = several ? count === 0 : !form.domain_name.trim();
    const blocked = nameMissing || ticketError || save.isPending;

    const submit = (preview: boolean) => {
        if (blocked) return;
        const input = toInput(form);
        if (several) {
            const { domain_name: values, ...shared } = input;
            void bulk.create(values, shared, 'Add legitimate domains', preview);
            if (!preview) onClose();
            return;
        }
        save.mutate({ id: domain?.id, input }, { onSuccess: onClose });
    };

    return (
        <form
            noValidate
            onSubmit={(e) => {
                e.preventDefault();
                submit(false);
            }}
        >
            <DialogTitle id="domain-form-title">{editing ? `Edit ${domain.domain_name}` : 'Add legitimate domains'}</DialogTitle>
            <DialogContent>
                <Stack spacing={2.5} sx={{ pt: 1 }}>
                    <Stack spacing={0.5}>
                        <TextField
                            label={several ? 'Domains' : 'Domain name'}
                            name="domain_name"
                            required
                            autoFocus
                            multiline={several}
                            minRows={several ? 5 : undefined}
                            value={several ? form.domain_name : form.domain_name.split(/\r?\n/)[0]}
                            onChange={(e) => set('domain_name', e.target.value)}
                            placeholder={several ? 'example.com\nexample.fr\n…' : 'example.com'}
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
                            label="Ticket"
                            name="ticket_id"
                            value={form.ticket_id}
                            onChange={(e) => set('ticket_id', e.target.value)}
                            placeholder="240529-2e0a2"
                            error={ticketError}
                            helperText={ticketError ? 'Letters, digits, dashes and dots only' : undefined}
                            slotProps={{ htmlInput: { maxLength: 20 } }}
                            fullWidth
                        />
                        <TextField
                            label="Contact"
                            name="contact"
                            value={form.contact}
                            onChange={(e) => set('contact', e.target.value)}
                            placeholder="IT team, support@example.com"
                            slotProps={{ htmlInput: { maxLength: 255 } }}
                            fullWidth
                        />
                    </Stack>
                    <DateField
                        label="Registered on"
                        name="domain_created_at"
                        value={form.domain_created_at}
                        onChange={(v) => set('domain_created_at', v)}
                        helperText={AUTO_DATE}
                        pastOnly
                    />
                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                        <DateField
                            label="Domain expiry"
                            name="expiry"
                            value={form.expiry}
                            onChange={(v) => set('expiry', v)}
                            helperText={AUTO_DATE}
                            shortcuts
                        />
                        <DateField
                            label="Certificate expiry"
                            name="ssl_expiry"
                            value={form.ssl_expiry}
                            onChange={(v) => set('ssl_expiry', v)}
                            helperText={AUTO_DATE}
                            shortcuts
                        />
                    </Stack>
                    <FormControlLabel
                        control={<Switch checked={form.repurchased} onChange={(e) => set('repurchased', e.target.checked)} />}
                        label="Repurchased"
                    />
                    <TextField
                        label="Comments"
                        name="comments"
                        multiline
                        minRows={3}
                        value={form.comments}
                        onChange={(e) => set('comments', e.target.value.slice(0, COMMENTS_MAX))}
                        placeholder="Context, actions taken, anything useful about this domain"
                        helperText={`${form.comments.length}/${COMMENTS_MAX}`}
                        slotProps={{ formHelperText: { sx: { textAlign: 'right' } } }}
                        fullWidth
                    />
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
                    {editing ? 'Save' : several ? `Add ${count} domain${count === 1 ? '' : 's'}` : 'Add domain'}
                </Button>
            </DialogActions>
        </form>
    );
}

interface DomainFormDialogProps {
    open: boolean;
    /** The domain to edit, or `null` to add. */
    domain: LegitimateDomain | null;
    onClose: () => void;
}

export function DomainFormDialog({ open, domain, onClose }: DomainFormDialogProps) {
    return (
        <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth aria-labelledby="domain-form-title">
            {/* Remounted on each opening, so the fields start from the domain being edited. */}
            {open && <DomainForm domain={domain} onClose={onClose} />}
        </Dialog>
    );
}
