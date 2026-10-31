import { useState, type FormEvent } from 'react';
import {
    Alert,
    Box,
    Button,
    Chip,
    CircularProgress,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
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

interface ConnectorEditModalProps {
    connector: Connector | null;
    show: boolean;
    onClose: () => void;
}

type Busy = 'reveal' | 'reset' | undefined;

/** Remounted per connector (see key below), so the form state is initialised from props, not synced by an effect. */
export function ConnectorEditModal({ connector, show, onClose }: ConnectorEditModalProps) {
    if (!connector) return null;
    return <EditDialog key={connector.id} connector={connector} show={show} onClose={onClose} />;
}

function EditDialog({ connector, show, onClose }: ConnectorEditModalProps & { connector: Connector }) {
    const [fields, setFields] = useState<ConnectorField[]>(() => (connector.fields ?? []).map((f) => ({ ...f })));
    const [revealed, setRevealed] = useState<Set<string>>(new Set());
    const [pending, setPending] = useState<Record<string, Busy>>({});
    const [saveError, setSaveError] = useState<string | null>(null);
    const [dirty, setDirty] = useState(false);

    const reveal = useRevealConnector();
    const reset = useResetConnectorField();
    const update = useUpdateConnector();

    const setBusy = (name: string, kind: Busy) => setPending((prev) => ({ ...prev, [name]: kind }));

    const handleChange = (name: string, value: string) => {
        setFields((prev) => prev.map((f) => (f.name === name ? { ...f, value } : f)));
        setDirty(true);
    };

    const handleHide = (name: string) =>
        setRevealed((prev) => {
            const next = new Set(prev);
            next.delete(name);
            return next;
        });

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
                handleHide(name);
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
            onClose();
        } catch (err) {
            // The dialog stays open so nothing typed is lost.
            setSaveError(getErrorMessage(err));
        }
    };

    const saving = update.isPending;

    return (
        <Dialog open={show} onClose={saving ? undefined : onClose} fullWidth maxWidth="md" scroll="paper">
            <Box component="form" onSubmit={handleSave} sx={{ display: 'contents' }}>
                <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    Edit {connector.name}
                    <Chip variant="outlined" label={connector.category} />
                </DialogTitle>

                <DialogContent dividers>
                    {connector.description && (
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                            {connector.description}
                        </Typography>
                    )}

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
                                            color={f.overridden ? 'info' : 'default'}
                                            label={f.overridden ? 'Manually set' : 'From .env'}
                                            sx={{ height: 20, fontSize: 11 }}
                                        />
                                    </Box>
                                    <TextField
                                        id={`field-${f.name}`}
                                        fullWidth
                                        type={isSecret ? 'password' : 'text'}
                                        value={f.value ?? ''}
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
                                                            <Tooltip title="Reset to .env default">
                                                                <span>
                                                                    <IconButton
                                                                        size="small"
                                                                        aria-label="Reset to .env default"
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
                </DialogContent>

                <DialogActions sx={{ px: 3, py: 2 }}>
                    <Button onClick={onClose} disabled={saving} color="inherit">
                        Close
                    </Button>
                    {!connector.readonly && (
                        <Button
                            type="submit"
                            variant="contained"
                            disabled={saving || !dirty}
                            startIcon={saving ? <CircularProgress size={14} color="inherit" /> : undefined}
                        >
                            {saving ? 'Saving…' : 'Save changes'}
                        </Button>
                    )}
                </DialogActions>
            </Box>
        </Dialog>
    );
}
