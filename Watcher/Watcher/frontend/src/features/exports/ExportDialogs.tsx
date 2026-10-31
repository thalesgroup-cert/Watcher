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
import { notifyError } from '../../lib/notify';
import { createDomain } from '../legitimateDomains/api';
import { invalidateLegitimateDomains } from '../legitimateDomains/hooks';
import { saveSite } from '../siteMonitoring/api';
import { LEGITIMACY } from '../siteMonitoring/catalog';
import { invalidateSiteMonitoring } from '../siteMonitoring/hooks';

// Moving a domain to another module: to Legitimate Domains (it is ours) or to Website Monitoring (watch it).

interface ExportDialogProps {
    open: boolean;
    onClose: () => void;
    domainName: string;
    /** What happens to the source item afterwards, said in the dialog (e.g. "The alert is marked resolved."). */
    afterwards?: string;
    /** Runs once the domain is created in the other module. */
    onDone?: () => void;
}

interface LegitimateExportProps extends ExportDialogProps {
    defaultComment: string;
    /** Replaces the default creation (e.g. a server action that also removes the source item). */
    submit?: (comment: string) => Promise<unknown>;
}

function LegitimateForm({ domainName, defaultComment, afterwards, onClose, onDone, submit: customSubmit }: Omit<LegitimateExportProps, 'open'>) {
    const [comment, setComment] = useState(defaultComment.slice(0, 300));
    const [pending, setPending] = useState(false);
    const submit = () => {
        setPending(true);
        const created = customSubmit
            ? customSubmit(comment)
            : createDomain({
                  domain_name: domainName,
                  ticket_id: '',
                  contact: '',
                  domain_created_at: null,
                  expiry: null,
                  ssl_expiry: null,
                  repurchased: false,
                  comments: comment,
              });
        created
            .then(() => {
                void invalidateLegitimateDomains();
                onDone?.();
                onClose();
            })
            .catch((err) => {
                notifyError(err);
                setPending(false);
            });
    };
    return (
        <>
            <DialogTitle id="export-legitimate-title">
                Add <strong>{domainName}</strong> to Legitimate Domains
            </DialogTitle>
            <DialogContent>
                <Stack spacing={2} sx={{ pt: 1 }}>
                    <Typography variant="body2" color="text.secondary">
                        Use this when the domain belongs to the organisation. Watcher then keeps its registration and certificate
                        dates up to date. {afterwards}
                    </Typography>
                    <TextField
                        label="Comment"
                        multiline
                        minRows={2}
                        value={comment}
                        onChange={(e) => setComment(e.target.value.slice(0, 300))}
                        helperText={`${comment.length}/300`}
                        slotProps={{ formHelperText: { sx: { textAlign: 'right' } } }}
                        fullWidth
                    />
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button color="inherit" onClick={onClose}>
                    Cancel
                </Button>
                <Button variant="contained" disabled={pending} onClick={submit}>
                    Add to Legitimate Domains
                </Button>
            </DialogActions>
        </>
    );
}

export function LegitimateExportDialog({ open, ...props }: LegitimateExportProps) {
    return (
        <Dialog open={open} onClose={props.onClose} maxWidth="sm" fullWidth aria-labelledby="export-legitimate-title">
            {open && <LegitimateForm {...props} />}
        </Dialog>
    );
}

const CHECKS = [
    { key: 'ip_monitoring', label: 'IP address' },
    { key: 'content_monitoring', label: 'Web content' },
    { key: 'mail_monitoring', label: 'Mail servers (MX)' },
] as const;
const ACTIONS = [
    { key: 'takedown_request', label: 'Takedown requested' },
    { key: 'legal_team', label: 'Legal team involved' },
    { key: 'blocking_request', label: 'Blocking requested' },
] as const;

type Flags = Record<(typeof CHECKS)[number]['key'] | (typeof ACTIONS)[number]['key'], boolean>;

function SiteForm({ domainName, afterwards, onClose, onDone }: Omit<ExportDialogProps, 'open'>) {
    const [ticket, setTicket] = useState('');
    const [legitimacy, setLegitimacy] = useState(2);
    const [flags, setFlags] = useState<Flags>({
        ip_monitoring: true,
        content_monitoring: true,
        mail_monitoring: true,
        takedown_request: false,
        legal_team: false,
        blocking_request: false,
    });
    const [pending, setPending] = useState(false);
    const toggle = (key: keyof Flags) => setFlags((f) => ({ ...f, [key]: !f[key] }));
    const submit = () => {
        setPending(true);
        saveSite(undefined, { domain_name: domainName, ticket_id: ticket.trim(), legitimacy, ...flags })
            .then(() => {
                void invalidateSiteMonitoring();
                onDone?.();
                onClose();
            })
            .catch((err) => {
                notifyError(err);
                setPending(false);
            });
    };
    const switches = (items: readonly { key: keyof Flags; label: string }[]) => (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)' } }}>
            {items.map((i) => (
                <FormControlLabel
                    key={i.key}
                    control={<Switch size="small" checked={flags[i.key]} onChange={() => toggle(i.key)} />}
                    label={<Typography variant="body2">{i.label}</Typography>}
                />
            ))}
        </Box>
    );
    return (
        <>
            <DialogTitle id="export-site-title">
                Monitor <strong>{domainName}</strong>
            </DialogTitle>
            <DialogContent>
                <Stack spacing={2.5} sx={{ pt: 1 }}>
                    <Typography variant="body2" color="text.secondary">
                        Website Monitoring checks the domain every 15 minutes and alerts on changes. {afterwards}
                    </Typography>
                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                        <TextField label="Ticket" value={ticket} onChange={(e) => setTicket(e.target.value)} slotProps={{ htmlInput: { maxLength: 20 } }} fullWidth />
                        <TextField select label="Legitimacy" value={legitimacy} onChange={(e) => setLegitimacy(Number(e.target.value))} fullWidth>
                            {LEGITIMACY.map((l) => (
                                <MenuItem key={l.value} value={l.value}>
                                    {l.label}
                                </MenuItem>
                            ))}
                        </TextField>
                    </Stack>
                    <Box>
                        <Typography variant="overline" color="text.secondary">
                            Watch
                        </Typography>
                        {switches(CHECKS)}
                    </Box>
                    <Box>
                        <Typography variant="overline" color="text.secondary">
                            Actions already taken
                        </Typography>
                        {switches(ACTIONS)}
                    </Box>
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button color="inherit" onClick={onClose}>
                    Cancel
                </Button>
                <Button variant="contained" disabled={pending} onClick={submit}>
                    Start monitoring
                </Button>
            </DialogActions>
        </>
    );
}

export function SiteExportDialog({ open, ...props }: ExportDialogProps) {
    return (
        <Dialog open={open} onClose={props.onClose} maxWidth="sm" fullWidth aria-labelledby="export-site-title">
            {open && <SiteForm {...props} />}
        </Dialog>
    );
}
