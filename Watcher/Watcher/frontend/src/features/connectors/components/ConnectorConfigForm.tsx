import { useState, type FormEvent } from 'react';
import {
    Alert,
    Box,
    Button,
    Chip,
    CircularProgress,
    Divider,
    IconButton,
    InputAdornment,
    Stack,
    TextField,
    Tooltip,
    Typography,
} from '@mui/material';
import RefreshOutlined from '@mui/icons-material/RefreshOutlined';
import VisibilityOffOutlined from '@mui/icons-material/VisibilityOffOutlined';
import VisibilityOutlined from '@mui/icons-material/VisibilityOutlined';
import { getErrorMessage } from '../../../api/client';
import { fonts } from '../../../styles/theme';
import { useResetConnectorField, useRevealConnector, useUpdateConnector } from '../hooks';
import type { Connector, ConnectorField, FieldValues } from '../types';

type Busy = 'reveal' | 'reset' | undefined;

interface ConnectorConfigFormProps {
    connector: Connector;
    /** Called once the values are saved, so that the form starts again from what the server keeps. */
    onSaved: () => void;
}

/** The settings of a connector: each field, where its value comes from, reveal, reset, and Save. Mounted again per connector. */
export function ConnectorConfigForm({ connector, onSaved }: ConnectorConfigFormProps) {
    const [fields, setFields] = useState<ConnectorField[]>(() => (connector.fields ?? []).map((f) => ({ ...f })));
    const [revealed, setRevealed] = useState<Set<string>>(new Set());
    // The secrets the person typed in: hiding those keeps what was typed, hiding the others brings the mask back
    const [edited, setEdited] = useState<Set<string>>(new Set());
    const [pending, setPending] = useState<Record<string, Busy>>({});
    const [saveError, setSaveError] = useState<string | null>(null);
    const [dirty, setDirty] = useState(false);

    const reveal = useRevealConnector();
    const reset = useResetConnectorField();
    const update = useUpdateConnector();

    const setBusy = (name: string, kind: Busy) => setPending((prev) => ({ ...prev, [name]: kind }));

    const handleChange = (name: string, value: string) => {
        setFields((prev) => prev.map((f) => (f.name === name ? { ...f, value } : f)));
        setEdited((prev) => new Set([...prev, name]));
        setDirty(true);
    };

    const handleHide = (name: string, keepTyped = true) => {
        setRevealed((prev) => {
            const next = new Set(prev);
            next.delete(name);
            return next;
        });
        if (keepTyped && edited.has(name)) return;
        // Back to what the field showed when the window opened (the mask of a stored secret, or nothing)
        const original = connector.fields?.find((f) => f.name === name);
        if (original) setFields((prev) => prev.map((f) => (f.name === name ? { ...f, value: original.value } : f)));
    };

    const handleReveal = async (name: string) => {
        setBusy(name, 'reveal');
        try {
            const data = await reveal.mutateAsync(connector.id);
            const field = data.fields?.find((f) => f.name === name);
            if (field) {
                setRevealed((prev) => new Set([...prev, name]));
                setFields((prev) => prev.map((f) => (f.name === name ? { ...f, value: field.value } : f)));
            }
        } catch (err) {
            console.error('Reveal failed', err);
        } finally {
            setBusy(name, undefined);
        }
    };

    const handleReset = async (name: string) => {
        setBusy(name, 'reset');
        try {
            const data = await reset.mutateAsync({ id: connector.id, field: name });
            const field = data.fields?.find((f) => f.name === name);
            if (field) {
                setFields((prev) => prev.map((f) => (f.name === name ? { ...field } : f)));
                setEdited((prev) => {
                    const next = new Set(prev);
                    next.delete(name);
                    return next;
                });
                setRevealed((prev) => {
                    const next = new Set(prev);
                    next.delete(name);
                    return next;
                });
            }
        } catch (err) {
            console.error('Reset failed', err);
        } finally {
            setBusy(name, undefined);
        }
    };

    const handleSave = async (e: FormEvent) => {
        e.preventDefault();
        setSaveError(null);
        const values: FieldValues = {};
        fields.forEach((f) => {
            values[f.name] = f.value;
        });
        try {
            await update.mutateAsync({ id: connector.id, fields: values });
            setDirty(false);
            onSaved();
        } catch (err) {
            // The values stay as they are so that nothing typed is lost.
            setSaveError(getErrorMessage(err));
        }
    };

    const saving = update.isPending;

    return (
        <Box component="form" onSubmit={handleSave} sx={{ display: 'flex', flexDirection: 'column', minHeight: 0, flexGrow: 1 }}>
            <Box sx={{ flexGrow: 1, overflowY: 'auto', px: 2.5, py: 2 }}>
                <Stack spacing={2.5}>
                    {fields.map((f) => {
                        const isSecret = !!f.sensitive && !revealed.has(f.name);
                        return (
                            <Box key={f.name}>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.75, flexWrap: 'wrap' }}>
                                    <Typography variant="subtitle2" component="label" htmlFor={`field-${f.name}`}>
                                        {f.label}
                                    </Typography>
                                    {f.sensitive && <Chip variant="outlined" label="sensitive" sx={{ height: 20, fontSize: 11 }} />}
                                    <Chip
                                        variant="outlined"
                                        color={f.overridden ? 'info' : f.from_default ? 'success' : 'default'}
                                        label={f.overridden ? 'Manually set' : f.from_default ? 'LiteLLM default' : 'From .env'}
                                        sx={{ height: 20, fontSize: 11 }}
                                    />
                                </Box>
                                <TextField
                                    id={`field-${f.name}`}
                                    fullWidth
                                    type={isSecret ? 'password' : 'text'}
                                    value={f.value ?? ''}
                                    placeholder={f.placeholder || undefined}
                                    onChange={(e) => handleChange(f.name, e.target.value)}
                                    disabled={connector.readonly}
                                    autoComplete="off"
                                    slotProps={{
                                        htmlInput: { style: { fontFamily: fonts.mono, fontSize: 13 } },
                                        input: {
                                            endAdornment: (
                                                <InputAdornment position="end">
                                                    {f.sensitive && isSecret && (
                                                        <Tooltip title="Reveal stored value">
                                                            <span>
                                                                <IconButton
                                                                    size="small"
                                                                    aria-label="Reveal stored value"
                                                                    disabled={pending[f.name] === 'reveal'}
                                                                    onClick={() => handleReveal(f.name)}
                                                                >
                                                                    {pending[f.name] === 'reveal' ? (
                                                                        <CircularProgress size={16} />
                                                                    ) : (
                                                                        <VisibilityOutlined fontSize="small" />
                                                                    )}
                                                                </IconButton>
                                                            </span>
                                                        </Tooltip>
                                                    )}
                                                    {f.sensitive && !isSecret && (
                                                        <Tooltip title="Hide value">
                                                            <IconButton size="small" aria-label="Hide value" onClick={() => handleHide(f.name)}>
                                                                <VisibilityOffOutlined fontSize="small" />
                                                            </IconButton>
                                                        </Tooltip>
                                                    )}
                                                    {!connector.readonly && f.overridden && (
                                                        <Tooltip title={f.has_default ? 'Reset to the .env or LiteLLM default' : 'Reset to .env default'}>
                                                            <span>
                                                                <IconButton
                                                                    size="small"
                                                                    aria-label={f.has_default ? 'Reset to the .env or LiteLLM default' : 'Reset to .env default'}
                                                                    disabled={pending[f.name] === 'reset'}
                                                                    onClick={() => handleReset(f.name)}
                                                                >
                                                                    {pending[f.name] === 'reset' ? (
                                                                        <CircularProgress size={16} />
                                                                    ) : (
                                                                        <RefreshOutlined fontSize="small" />
                                                                    )}
                                                                </IconButton>
                                                            </span>
                                                        </Tooltip>
                                                    )}
                                                </InputAdornment>
                                            ),
                                        },
                                    }}
                                />
                                <Typography variant="caption" color="text.secondary" sx={{ fontFamily: fonts.mono, mt: 0.5, display: 'block' }}>
                                    {f.name}
                                </Typography>
                            </Box>
                        );
                    })}
                </Stack>

                {connector.readonly && (
                    <Alert severity="warning" sx={{ mt: 2 }}>
                        This connector is informational only. Settings are managed in <code>settings.py</code>.
                    </Alert>
                )}
                {saveError && (
                    <Alert severity="error" sx={{ mt: 2 }}>
                        {saveError}
                    </Alert>
                )}
            </Box>
            {!connector.readonly && (
                <>
                    <Divider />
                    <Box sx={{ display: 'flex', justifyContent: 'flex-end', px: 2.5, py: 1.5 }}>
                        <Button
                            type="submit"
                            variant="contained"
                            disabled={saving || !dirty}
                            startIcon={saving ? <CircularProgress size={14} color="inherit" /> : undefined}
                        >
                            {saving ? 'Saving…' : 'Save changes'}
                        </Button>
                    </Box>
                </>
            )}
        </Box>
    );
}
