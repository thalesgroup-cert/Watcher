import { useState } from 'react';
import {
    Alert as MuiAlert,
    Box,
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Divider,
    FormControlLabel,
    IconButton,
    Link,
    Skeleton,
    Stack,
    Switch,
    TextField,
    ToggleButton,
    ToggleButtonGroup,
    Typography,
} from '@mui/material';
import Close from '@mui/icons-material/Close';
import DeleteOutlined from '@mui/icons-material/DeleteOutlined';
import EditOutlined from '@mui/icons-material/EditOutlined';
import { getErrorMessage } from '../../../api/client';
import { since } from '../../../lib/dates';
import { fonts } from '../../../styles/theme';
import { SideDrawer } from '../../../ui/SideDrawer';
import { countLines, useBulk } from '../../bulk/useBulk';
import { ObjectHistory } from '../../timeline/components/ObjectHistory';
import { dateAgo } from '../../timeline/format';
import { CONFIDENCE, confidenceMeta, countryLabel, hostOf } from '../catalog';
import { SOURCE_BULK, SOURCE_TYPE, useSaveSource, useSource } from '../hooks';
import type { Source } from '../types';
import { SourceState } from './tables';

function SourceForm({ source, onClose }: { source: Source | null; onClose: () => void }) {
    const editing = source !== null;
    const [url, setUrl] = useState(source?.url ?? '');
    const [country, setCountry] = useState(source?.country ?? '');
    const [code, setCode] = useState(source?.country_code ?? '');
    const [confident, setConfident] = useState(source?.confident ?? 2);
    const [several, setSeveral] = useState(false);
    const save = useSaveSource();
    const bulk = useBulk(SOURCE_BULK);
    const count = several ? countLines(url) : 0;
    const codeError = code !== '' && !/^[A-Za-z]{2}$/.test(code);
    const blocked = (several ? count === 0 : !url.trim()) || codeError || save.isPending;

    const submit = (dryRun: boolean) => {
        if (blocked) return;
        const shared = { country: country.trim(), country_code: code.toUpperCase(), confident };
        if (several) {
            void bulk.create(url, shared, 'Add RSS sources', dryRun);
            if (!dryRun) onClose();
            return;
        }
        save.mutate({ id: source?.id, input: { url: url.trim(), ...shared } }, { onSuccess: onClose });
    };

    return (
        <form
            noValidate
            onSubmit={(e) => {
                e.preventDefault();
                submit(false);
            }}
        >
            <DialogTitle id="source-form-title">{editing ? `Edit ${hostOf(source.url)}` : 'Add RSS sources'}</DialogTitle>
            <DialogContent>
                <Stack spacing={2} sx={{ pt: 1 }}>
                    <Typography variant="body2" color="text.secondary">
                        Watcher reads every source every 30 minutes and looks for the words that come up in several articles.
                    </Typography>
                    <Stack spacing={0.5}>
                        <TextField
                            label={several ? 'Feed URLs' : 'Feed URL'}
                            name="url"
                            required
                            autoFocus
                            multiline={several}
                            minRows={several ? 5 : undefined}
                            value={several ? url : url.split(/\r?\n/)[0]}
                            onChange={(e) => setUrl(e.target.value)}
                            placeholder="https://www.cert.ssi.gouv.fr/feed/"
                            helperText={several ? `${count} feed${count === 1 ? '' : 's'} detected. The other fields apply to every one.` : undefined}
                            slotProps={{ htmlInput: { spellCheck: false, style: { fontFamily: fonts.mono, fontSize: 13 } } }}
                            fullWidth
                        />
                        {!editing && (
                            <FormControlLabel
                                control={<Switch size="small" checked={several} onChange={(e) => setSeveral(e.target.checked)} />}
                                label={<Typography variant="body2">Add several, one per line</Typography>}
                            />
                        )}
                    </Stack>
                    <Stack direction="row" spacing={2}>
                        <TextField label="Country" name="country" value={country} onChange={(e) => setCountry(e.target.value)} placeholder="France" fullWidth />
                        <TextField
                            label="Code"
                            name="country_code"
                            value={code}
                            onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 2))}
                            placeholder="FR"
                            error={codeError}
                            helperText={codeError ? 'Two letters (ISO 3166)' : undefined}
                            sx={{ width: 110, flexShrink: 0 }}
                        />
                    </Stack>
                    <Stack spacing={0.5}>
                        <Typography variant="overline" color="text.secondary">
                            Reliability
                        </Typography>
                        <ToggleButtonGroup size="small" exclusive value={confident} onChange={(_, v: number | null) => v && setConfident(v)} aria-label="Reliability">
                            {CONFIDENCE.map((c) => (
                                <ToggleButton key={c.value} value={c.value} sx={{ px: 2 }}>
                                    {c.label} - {c.percent}%
                                </ToggleButton>
                            ))}
                        </ToggleButtonGroup>
                        <Typography variant="caption" color="text.secondary">
                            A word's reliability is the average of the sources that mention it: official CERTs are High.
                        </Typography>
                    </Stack>
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
                    {editing ? 'Save' : several ? `Add ${count}` : 'Add'}
                </Button>
            </DialogActions>
        </form>
    );
}

export function SourceFormDialog({ open, source, onClose }: { open: boolean; source: Source | null; onClose: () => void }) {
    return (
        <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth aria-labelledby="source-form-title">
            {open && <SourceForm source={source} onClose={onClose} />}
        </Dialog>
    );
}

interface SourceDrawerProps {
    open: boolean;
    id: number | null;
    initial?: Source;
    onClose: () => void;
    actions?: { edit: (s: Source) => void; remove: (s: Source) => void };
}

export function SourceDrawer({ open, id, initial, onClose, actions }: SourceDrawerProps) {
    const { data: source, error } = useSource(id, initial);
    const meta = source ? confidenceMeta(source.confident) : null;
    return (
        <SideDrawer open={open} onClose={onClose} labelledBy="source-drawer-title">
            <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', px: 2.5, py: 2 }}>
                <Box sx={{ minWidth: 0, flexGrow: 1 }}>
                    <Typography variant="overline" color="text.secondary" sx={{ lineHeight: 1.4, display: 'block' }}>
                        RSS source
                    </Typography>
                    <Typography id="source-drawer-title" variant="h3" component="h2" noWrap>
                        {source ? hostOf(source.url) : <Skeleton width={180} />}
                    </Typography>
                </Box>
                <IconButton aria-label="Close details" onClick={onClose} edge="end">
                    <Close />
                </IconButton>
            </Stack>
            {source && actions && (
                <Stack direction="row" spacing={1} sx={{ px: 2.5, pb: 2 }}>
                    <Button size="small" variant="outlined" startIcon={<EditOutlined />} onClick={() => actions.edit(source)}>
                        Edit
                    </Button>
                    <Button size="small" variant="outlined" color="error" startIcon={<DeleteOutlined />} onClick={() => actions.remove(source)}>
                        Delete
                    </Button>
                </Stack>
            )}
            <Divider />
            <Box sx={{ flexGrow: 1, overflowY: 'auto' }}>
                {error && !source ? (
                    <MuiAlert severity="error" sx={{ m: 2.5 }}>
                        {getErrorMessage(error, 'Failed to load the source.')}
                    </MuiAlert>
                ) : !source || !meta ? (
                    <Box sx={{ p: 2.5 }}>
                        <Skeleton height={80} />
                    </Box>
                ) : (
                    <>
                        <Box component="dl" sx={{ display: 'grid', gridTemplateColumns: 'max-content 1fr', columnGap: 2, rowGap: 1, m: 0, px: 2.5, py: 2 }}>
                            {(
                                [
                                    ['Feed', <Link key="u" href={source.url} target="_blank" rel="noopener noreferrer" sx={{ fontFamily: fonts.mono, fontSize: 12, overflowWrap: 'anywhere' }}>{source.url}</Link>],
                                    ['Country', source.country || source.country_code ? countryLabel(source.country_code, source.country) : '-'],
                                    ['Reliability', `${meta.label} (${meta.percent} %)`],
                                    ['Last fetch', <SourceState key="s" code={source.last_status_code} />],
                                    ['Checked', source.last_checked ? `${since(source.last_checked)} - ${dateAgo(source.last_checked)}` : 'Never'],
                                    ['Added', dateAgo(source.created_at)],
                                ] as [string, React.ReactNode][]
                            ).map(([label, value]) => (
                                <Box key={label} sx={{ display: 'contents' }}>
                                    <Typography component="dt" variant="body2" color="text.secondary">
                                        {label}
                                    </Typography>
                                    <Box component="dd" sx={{ m: 0, minWidth: 0, typography: 'body2' }}>
                                        {value}
                                    </Box>
                                </Box>
                            ))}
                        </Box>
                        <Divider />
                        <Box component="section" sx={{ px: 2.5, py: 2 }}>
                            <Typography variant="overline" color="text.secondary" component="h3" sx={{ display: 'block', mb: 1 }}>
                                History
                            </Typography>
                            <ObjectHistory targets={[{ contentType: SOURCE_TYPE, objectId: source.id }]} enabled={open} />
                        </Box>
                    </>
                )}
            </Box>
        </SideDrawer>
    );
}
