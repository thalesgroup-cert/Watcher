import { useEffect, useState } from 'react';
import {
    Alert as MuiAlert,
    Box,
    Button,
    Checkbox,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    FormControlLabel,
    LinearProgress,
    Stack,
    Switch,
    TextField,
    ToggleButton,
    ToggleButtonGroup,
    Typography,
} from '@mui/material';
import { notifySuccess } from '../../../lib/notify';
import { fonts } from '../../../styles/theme';
import { SCOPES, splitKeywords } from '../catalog';
import { useRulePreview, useSaveRule, useScanRule } from '../hooks';
import type { Rule, RulePreview, Scope } from '../types';
import { SeverityChip } from './tables';

/** Value that settles `delay` ms after the last change, so the preview does not run on every key. */
function useSettled<T>(value: T, delay = 400): T {
    const [settled, setSettled] = useState(value);
    useEffect(() => {
        const timer = setTimeout(() => setSettled(value), delay);
        return () => clearTimeout(timer);
    }, [value, delay]);
    return settled;
}

function Preview({ preview, loading, scope }: { preview?: RulePreview; loading: boolean; scope: Scope }) {
    if (!preview) return loading ? <LinearProgress sx={{ my: 1 }} /> : null;
    const parts = [
        scope !== 'ransomware' && `${preview.cves} CVE${preview.cves === 1 ? '' : 's'}`,
        scope !== 'cve' && `${preview.victims} ransomware victim${preview.victims === 1 ? '' : 's'}`,
    ].filter(Boolean);
    const samples = [...preview.cveSamples, ...preview.victimSamples].slice(0, 6);
    return (
        <Box sx={{ bgcolor: 'action.hover', borderRadius: 1, p: 1.5, opacity: loading ? 0.6 : 1 }} data-testid="rule-preview" aria-live="polite">
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
                Would match {parts.join(' and ')} already collected
            </Typography>
            {samples.length > 0 && (
                <Stack spacing={0.5} sx={{ mt: 1 }}>
                    {samples.map((s) => (
                        <Stack key={`${s.label}-${s.id}`} direction="row" spacing={1} sx={{ alignItems: 'center', minWidth: 0 }}>
                            {s.severity !== undefined ? <SeverityChip severity={s.severity} /> : null}
                            <Typography variant="body2" sx={{ fontFamily: s.severity !== undefined ? fonts.mono : undefined, flexShrink: 0 }}>
                                {s.label}
                            </Typography>
                            <Typography variant="caption" color="text.secondary" noWrap sx={{ minWidth: 0 }}>
                                {s.detail} - “{s.keyword}”
                            </Typography>
                        </Stack>
                    ))}
                </Stack>
            )}
        </Box>
    );
}

interface RuleFormDialogProps {
    open: boolean;
    /** Rule being edited; null to write a new one. */
    rule: Rule | null;
    onClose: () => void;
    onSaved?: (rule: Rule) => void;
}

function RuleForm({ rule, onClose, onSaved }: Omit<RuleFormDialogProps, 'open'>) {
    const [name, setName] = useState(rule?.name ?? '');
    const [scope, setScope] = useState<Scope>(rule?.scope ?? 'both');
    const [keywords, setKeywords] = useState(rule?.keywords.join('\n') ?? '');
    const [exceptions, setExceptions] = useState(rule?.exceptions.join('\n') ?? '');
    const [active, setActive] = useState(rule?.is_active ?? true);
    const [scan, setScan] = useState(true);
    const save = useSaveRule();
    const scanRule = useScanRule();

    const input = { keywords: splitKeywords(keywords), exceptions: splitKeywords(exceptions), scope };
    const settled = useSettled(input);
    const preview = useRulePreview(settled, true);
    const blocked = !name.trim() || input.keywords.length === 0 || save.isPending;

    const submit = () => {
        if (blocked) return;
        save.mutate(
            { id: rule?.id, input: { name: name.trim(), ...input, is_active: active } },
            {
                onSuccess: (saved) => {
                    notifySuccess(rule ? `${saved.name} updated` : `${saved.name} is watching`);
                    // The fetch jobs only check new CVEs and victims: record what is already there when asked.
                    if (!rule && scan && saved.is_active) scanRule.mutate(saved);
                    onSaved?.(saved);
                    onClose();
                },
            },
        );
    };

    return (
        <form
            noValidate
            onSubmit={(e) => {
                e.preventDefault();
                submit();
            }}
        >
            <DialogTitle id="rule-form-title">{rule ? `Edit ${rule.name}` : 'New watch rule'}</DialogTitle>
            <DialogContent>
                <Stack spacing={2} sx={{ pt: 1 }}>
                    <Typography variant="body2" color="text.secondary">
                        A rule watches the new CVEs and ransomware victims for words you care about: your products, vendors, brands, sector. Matching ignores case and
                        finds the words inside longer ones.
                    </Typography>
                    <TextField label="Name" name="name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Edge devices (VPN / firewalls)" fullWidth autoFocus />
                    <Box>
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 0.75 }}>
                            Watches
                        </Typography>
                        <ToggleButtonGroup size="small" exclusive value={scope} onChange={(_, v: Scope | null) => v && setScope(v)} aria-label="Watches">
                            {SCOPES.map((s) => (
                                <ToggleButton key={s.value} value={s.value} title={s.description} sx={{ px: 1.5 }}>
                                    {s.label}
                                </ToggleButton>
                            ))}
                        </ToggleButtonGroup>
                    </Box>
                    <TextField
                        label="Keywords"
                        name="keywords"
                        required
                        multiline
                        minRows={3}
                        value={keywords}
                        onChange={(e) => setKeywords(e.target.value)}
                        placeholder={'Fortinet\nIvanti\nCitrix'}
                        helperText={`One per line or separated by commas - ${input.keywords.length} keyword${input.keywords.length === 1 ? '' : 's'}`}
                        slotProps={{ htmlInput: { style: { fontFamily: fonts.mono } } }}
                        fullWidth
                    />
                    <TextField
                        label="Exceptions"
                        name="exceptions"
                        multiline
                        minRows={2}
                        value={exceptions}
                        onChange={(e) => setExceptions(e.target.value)}
                        placeholder="FortiGuard Labs"
                        helperText="A CVE or victim that contains one of these is never matched"
                        slotProps={{ htmlInput: { style: { fontFamily: fonts.mono } } }}
                        fullWidth
                    />
                    {input.keywords.length > 0 && <Preview preview={preview.data} loading={preview.isFetching} scope={scope} />}
                    {preview.error && <MuiAlert severity="info">The preview is not available.</MuiAlert>}
                    <Stack>
                        <FormControlLabel control={<Switch checked={active} onChange={(e) => setActive(e.target.checked)} />} label="Active" />
                        {!rule && active && (
                            <FormControlLabel
                                control={<Checkbox checked={scan} onChange={(e) => setScan(e.target.checked)} />}
                                label={<Typography variant="body2">Also record the matches in the CVEs and victims already collected</Typography>}
                            />
                        )}
                    </Stack>
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button color="inherit" onClick={onClose}>
                    Cancel
                </Button>
                <Button type="submit" variant="contained" disabled={blocked}>
                    {rule ? 'Save' : 'Create'}
                </Button>
            </DialogActions>
        </form>
    );
}

export function RuleFormDialog({ open, rule, onClose, onSaved }: RuleFormDialogProps) {
    return (
        <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm" aria-labelledby="rule-form-title">
            {/* Remounted on every opening, so the form starts from the rule. */}
            {open && <RuleForm key={rule?.id ?? 'new'} rule={rule} onClose={onClose} onSaved={onSaved} />}
        </Dialog>
    );
}
