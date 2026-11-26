import { useState } from 'react';
import {
    Box,
    Button,
    Chip,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Stack,
    TextField,
    Typography,
} from '@mui/material';
import { fonts } from '../../styles/theme';

const UUID_RE = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;

/** The MISP event UUIDs of an object, whatever shape the API stored them in (list, or a stringified list). */
export function parseEventUuids(raw: unknown): string[] {
    if (Array.isArray(raw)) return raw.map(String).filter((u) => u.trim());
    if (typeof raw === 'string') return raw.replace(/[[\]'"\s]/g, '').split(',').filter(Boolean);
    return [];
}

interface MispExportDialogProps {
    open: boolean;
    onClose: () => void;
    /** What is exported, e.g. the domain name. */
    name: string;
    /** Events this object was already exported to, oldest first. */
    eventUuids: string[];
    /** Resolves once the export is done; the dialog closes then. */
    onExport: (eventUuid: string) => Promise<unknown>;
    pending: boolean;
}

function ExportForm({ name, eventUuids, onExport, onClose, pending }: Omit<MispExportDialogProps, 'open'>) {
    const latest = eventUuids.at(-1) ?? '';
    const [uuid, setUuid] = useState('');
    const target = uuid || latest;
    const invalid = uuid !== '' && !UUID_RE.test(uuid);
    const [showAll, setShowAll] = useState(false);
    const history = [...eventUuids].reverse();

    return (
        <form
            onSubmit={(e) => {
                e.preventDefault();
                if (!invalid) void onExport(target).then(onClose, () => undefined);
            }}
        >
            <DialogTitle id="misp-export-title">
                <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
                    <Box component="img" src="/static/img/misp_logo.png" alt="" sx={{ width: 28, height: 28, objectFit: 'contain' }} />
                    <span>
                        Export <strong>{name}</strong> to MISP
                    </span>
                </Stack>
            </DialogTitle>
            <DialogContent>
                <Stack spacing={2.5} sx={{ pt: 1 }}>
                    <Typography variant="body2" color="text.secondary">
                        {target
                            ? 'The domain is added to the event below. Enter another event UUID to add it there instead.'
                            : 'A new MISP event is created. Enter an event UUID to add the domain to an existing event instead.'}
                    </Typography>
                    <TextField
                        label="Event UUID"
                        value={uuid}
                        placeholder={latest || 'Leave empty to create a new event'}
                        onChange={(e) => setUuid(e.target.value.replace(/[[\]'"\s]/g, '').toLowerCase())}
                        error={invalid}
                        helperText={invalid ? 'Expected a UUID such as 5f1c…-…' : undefined}
                        slotProps={{ htmlInput: { spellCheck: false, style: { fontFamily: fonts.mono } } }}
                        fullWidth
                    />
                    {history.length > 0 && (
                        <Box>
                            <Typography variant="overline" color="text.secondary">
                                Already exported to
                            </Typography>
                            <Stack spacing={0.5}>
                                {(showAll ? history : history.slice(0, 2)).map((u, i) => (
                                    <Stack key={u} direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                                        <Typography sx={{ fontFamily: fonts.mono, fontSize: 12 }}>{u}</Typography>
                                        {i === 0 && <Chip label="Latest" size="small" />}
                                    </Stack>
                                ))}
                            </Stack>
                            {history.length > 2 && (
                                <Button size="small" onClick={() => setShowAll((v) => !v)} sx={{ mt: 0.5, px: 0 }}>
                                    {showAll ? 'Show less' : `Show ${history.length - 2} more`}
                                </Button>
                            )}
                        </Box>
                    )}
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button color="inherit" onClick={onClose}>
                    Cancel
                </Button>
                <Button type="submit" variant="contained" disabled={pending || invalid}>
                    {pending ? 'Exporting…' : target ? 'Update MISP event' : 'Create MISP event'}
                </Button>
            </DialogActions>
        </form>
    );
}

/** Export one object to a new or an existing MISP event. */
export function MispExportDialog({ open, ...props }: MispExportDialogProps) {
    return (
        <Dialog open={open} onClose={props.onClose} maxWidth="sm" fullWidth aria-labelledby="misp-export-title">
            {/* Remounted on each opening, so the field starts empty. */}
            {open && <ExportForm {...props} />}
        </Dialog>
    );
}
