import { useState } from 'react';
import {
    Box,
    Button,
    Collapse,
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
import ExpandLess from '@mui/icons-material/ExpandLess';
import ExpandMore from '@mui/icons-material/ExpandMore';
import { fonts } from '../../../styles/theme';
import { countLines, useBulk } from '../../bulk/useBulk';
import { compilePattern, splitMatches } from '../format';
import { PATTERN_BULK, useSavePattern } from '../hooks';
import { PATTERN_TEMPLATES } from '../templates';
import type { Pattern } from '../types';
import { Highlighted } from './Highlighted';

function Templates({ onUse }: { onUse: (pattern: string) => void }) {
    return (
        <Box sx={{ maxHeight: 280, overflowY: 'auto', border: 1, borderColor: 'divider', borderRadius: 1.5, p: 1.5 }} data-testid="pattern-templates">
            {Object.entries(PATTERN_TEMPLATES).map(([category, items]) => (
                <Box key={category} sx={{ '& + &': { mt: 1.5 } }}>
                    <Typography variant="overline" color="text.secondary">
                        {category}
                    </Typography>
                    {items.map((t) => (
                        <Stack key={t.name} direction="row" spacing={1} sx={{ alignItems: 'center', py: 0.5 }}>
                            <Box sx={{ minWidth: 0, flexGrow: 1 }}>
                                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                    {t.name}{' '}
                                    <Typography component="span" variant="caption" color="text.secondary">
                                        {t.description}
                                    </Typography>
                                </Typography>
                                <Typography variant="caption" sx={{ fontFamily: fonts.mono, overflowWrap: 'anywhere' }} component="div">
                                    {t.pattern}
                                </Typography>
                            </Box>
                            <Button size="small" onClick={() => onUse(t.pattern)} aria-label={`Use ${t.name}`}>
                                Use
                            </Button>
                        </Stack>
                    ))}
                </Box>
            ))}
        </Box>
    );
}

function PatternForm({ pattern, onClose }: { pattern: Pattern | null; onClose: () => void }) {
    const editing = pattern !== null;
    const [name, setName] = useState(pattern?.name ?? '');
    const [isRegex, setIsRegex] = useState(pattern?.is_regex ?? false);
    const [several, setSeveral] = useState(false);
    const [sample, setSample] = useState('');
    const [showTemplates, setShowTemplates] = useState(false);
    const save = useSavePattern();
    const bulk = useBulk(PATTERN_BULK);

    const count = several ? countLines(name) : 0;
    // One pattern: checked as you type. Several: each line is checked by the server and reported in the summary.
    const compiled = isRegex && !several && name ? compilePattern(name) : null;
    const regexError = typeof compiled === 'string' ? compiled : null;
    const blocked = (several ? count === 0 : !name.trim()) || regexError !== null || save.isPending;
    const preview = sample && name && !several && !regexError ? splitMatches(sample, { name, is_regex: isRegex }) : null;

    const submit = (dryRun: boolean) => {
        if (blocked) return;
        if (several) {
            void bulk.create(name, { is_regex: isRegex }, 'Add search patterns', dryRun);
            if (!dryRun) onClose();
            return;
        }
        save.mutate({ id: pattern?.id, input: { name: name.trim(), is_regex: isRegex } }, { onSuccess: onClose });
    };

    return (
        <form
            noValidate
            onSubmit={(e) => {
                e.preventDefault();
                submit(false);
            }}
        >
            <DialogTitle id="pattern-form-title">{editing ? 'Edit search pattern' : 'Add search patterns'}</DialogTitle>
            <DialogContent>
                <Stack spacing={2} sx={{ pt: 1 }}>
                    <Typography variant="body2" color="text.secondary">
                        Watcher looks for each pattern on paste sites, code hosts and forums every 5 minutes, and raises an alert for
                        every new page that mentions it.
                    </Typography>
                    <Stack spacing={0.5}>
                        <TextField
                            label={several ? 'Patterns' : 'Pattern'}
                            name="name"
                            required
                            autoFocus
                            multiline={several}
                            minRows={several ? 5 : undefined}
                            value={several ? name : name.split(/\r?\n/)[0]}
                            onChange={(e) => setName(e.target.value)}
                            placeholder={isRegex ? '[a-z0-9._%+-]+@company\\.com' : 'company-name'}
                            error={regexError !== null}
                            helperText={
                                regexError
                                    ? `Invalid regular expression: ${regexError}`
                                    : several
                                      ? `${count} pattern${count === 1 ? '' : 's'} detected.`
                                      : undefined
                            }
                            slotProps={{ htmlInput: { maxLength: several ? undefined : 100, spellCheck: false, style: { fontFamily: fonts.mono } } }}
                            fullWidth
                        />
                        {!editing && (
                            <FormControlLabel
                                control={<Switch size="small" checked={several} onChange={(e) => setSeveral(e.target.checked)} />}
                                label={<Typography variant="body2">Add several, one per line</Typography>}
                            />
                        )}
                        <FormControlLabel
                            control={<Switch size="small" checked={isRegex} onChange={(e) => setIsRegex(e.target.checked)} />}
                            label={<Typography variant="body2">Regular expression</Typography>}
                        />
                    </Stack>

                    {isRegex && (
                        <Box>
                            <Button
                                size="small"
                                onClick={() => setShowTemplates((v) => !v)}
                                endIcon={showTemplates ? <ExpandLess /> : <ExpandMore />}
                                sx={{ px: 0 }}
                            >
                                Templates
                            </Button>
                            <Collapse in={showTemplates} unmountOnExit>
                                <Templates
                                    onUse={(p) => {
                                        setName(p);
                                        setSeveral(false);
                                        setShowTemplates(false);
                                    }}
                                />
                            </Collapse>
                        </Box>
                    )}

                    {!several && (
                        <Stack spacing={1}>
                            <TextField
                                label="Try it on some text"
                                name="sample"
                                multiline
                                minRows={2}
                                value={sample}
                                onChange={(e) => setSample(e.target.value)}
                                placeholder="Paste a sample: the matches are highlighted below"
                                fullWidth
                            />
                            {preview && (
                                <>
                                    <Typography variant="caption" color={preview.count ? 'success.main' : 'text.secondary'} sx={{ fontWeight: 600 }}>
                                        {preview.count ? `${preview.count} match${preview.count === 1 ? '' : 'es'}` : 'No match'}
                                    </Typography>
                                    <Highlighted segments={preview.segments} maxHeight={160} label="Matches in the sample" />
                                </>
                            )}
                        </Stack>
                    )}
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
                    {editing ? 'Save' : several ? `Add ${count} pattern${count === 1 ? '' : 's'}` : 'Add pattern'}
                </Button>
            </DialogActions>
        </form>
    );
}

interface PatternFormDialogProps {
    open: boolean;
    /** The pattern to edit, or `null` to add. */
    pattern: Pattern | null;
    onClose: () => void;
}

export function PatternFormDialog({ open, pattern, onClose }: PatternFormDialogProps) {
    return (
        <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth aria-labelledby="pattern-form-title">
            {open && <PatternForm pattern={pattern} onClose={onClose} />}
        </Dialog>
    );
}
