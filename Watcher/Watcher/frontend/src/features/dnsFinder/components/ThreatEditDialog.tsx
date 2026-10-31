import { useState } from 'react';
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, TextField } from '@mui/material';
import { useUpdateThreat } from '../hooks';
import type { Threat } from '../types';

const COMMENTS_MAX = 300;

/** Technical fields an analyst can correct, per source. */
const FIELDS: Record<Threat['source'], { key: 'fuzzer' | 'issuer' | 'provider' | 'cname_target' | 'http_status_code'; label: string; placeholder: string }[]> = {
    dnstwist: [{ key: 'fuzzer', label: 'Technique', placeholder: 'homoglyph' }],
    certstream_keyword: [{ key: 'issuer', label: 'Certificate issuer', placeholder: "Let's Encrypt" }],
    subdomain_takeover: [
        { key: 'provider', label: 'Provider', placeholder: 'Amazon S3' },
        { key: 'cname_target', label: 'CNAME target', placeholder: 'mybucket.s3.amazonaws.com' },
        { key: 'http_status_code', label: 'HTTP status', placeholder: '404' },
    ],
};

function EditForm({ threat, onClose }: { threat: Threat; onClose: () => void }) {
    const fields = FIELDS[threat.source];
    const [values, setValues] = useState<Record<string, string>>(() =>
        Object.fromEntries(fields.map((f) => [f.key, String(threat.technical_details[f.key] ?? '')])),
    );
    const [comments, setComments] = useState(threat.comments ?? '');
    const update = useUpdateThreat();
    const submit = () => {
        const technical = Object.fromEntries(
            fields.map((f) => {
                const v = values[f.key].trim();
                return [f.key, f.key === 'http_status_code' ? (v === '' ? null : Number(v)) : v || null];
            }),
        );
        update.mutate({ threat, comments, technical }, { onSuccess: onClose });
    };
    return (
        <form
            noValidate
            onSubmit={(e) => {
                e.preventDefault();
                submit();
            }}
        >
            <DialogTitle id="threat-edit-title">Edit {threat.domain_name}</DialogTitle>
            <DialogContent>
                <Stack spacing={2} sx={{ pt: 1 }}>
                    {fields.map((f) => (
                        <TextField
                            key={f.key}
                            name={f.key}
                            label={f.label}
                            placeholder={f.placeholder}
                            type={f.key === 'http_status_code' ? 'number' : 'text'}
                            value={values[f.key]}
                            onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                            fullWidth
                        />
                    ))}
                    <TextField
                        name="comments"
                        label="Comments"
                        multiline
                        minRows={3}
                        value={comments}
                        onChange={(e) => setComments(e.target.value.slice(0, COMMENTS_MAX))}
                        placeholder="Context, actions taken, anything useful about this domain"
                        helperText={`${comments.length}/${COMMENTS_MAX}`}
                        slotProps={{ formHelperText: { sx: { textAlign: 'right' } } }}
                        fullWidth
                    />
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button color="inherit" onClick={onClose}>
                    Cancel
                </Button>
                <Button type="submit" variant="contained" disabled={update.isPending}>
                    Save
                </Button>
            </DialogActions>
        </form>
    );
}

export function ThreatEditDialog({ threat, onClose }: { threat: Threat | null; onClose: () => void }) {
    return (
        <Dialog open={threat !== null} onClose={onClose} maxWidth="sm" fullWidth aria-labelledby="threat-edit-title">
            {threat && <EditForm threat={threat} onClose={onClose} />}
        </Dialog>
    );
}
