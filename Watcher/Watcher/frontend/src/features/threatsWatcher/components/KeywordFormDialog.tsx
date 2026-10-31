import { useState } from 'react';
import {
    Alert as MuiAlert,
    Button,
    Checkbox,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    FormControlLabel,
    Stack,
    Switch,
    TextField,
    ToggleButton,
    ToggleButtonGroup,
    Typography,
} from '@mui/material';
import { getErrorMessage } from '../../../api/client';
import { fonts } from '../../../styles/theme';
import { countLines, useBulk } from '../../bulk/useBulk';
import { LEVELS } from '../catalog';
import { KEYWORD_BULK, useSaveKeyword } from '../hooks';
import type { Level, MonitoredKeyword } from '../types';

/** Words typed one per line or separated by commas. */
const splitWords = (text: string) => [...new Set(text.split(/[\n,]/).map((w) => w.trim()).filter(Boolean))];

interface KeywordFormProps {
    /** The keyword to edit, or null to add. */
    keyword: MonitoredKeyword | null;
    onClose: () => void;
    onSaved?: (keyword: MonitoredKeyword) => void;
}

/**
 * Add or edit a monitored keyword: a single word (several can be added at once), or, with "Rule", a name and the words an
 * article has to contain together.
 */
function KeywordForm({ keyword, onClose, onSaved }: KeywordFormProps) {
    const editing = keyword !== null;
    const [name, setName] = useState(keyword?.name ?? '');
    const [level, setLevel] = useState<Level>(keyword?.level ?? 'warm');
    const [rule, setRule] = useState(keyword?.is_rule ?? false);
    const [several, setSeveral] = useState(false);
    const [allOf, setAllOf] = useState(keyword?.all_of.join('\n') ?? '');
    const [anyOf, setAnyOf] = useState(keyword?.any_of.join('\n') ?? '');
    const [exceptions, setExceptions] = useState(keyword?.exceptions.join('\n') ?? '');
    const [wholeWords, setWholeWords] = useState(keyword ? keyword.whole_words : false);
    const [active, setActive] = useState(keyword?.is_active ?? true);
    const save = useSaveKeyword();
    const bulk = useBulk(KEYWORD_BULK);

    const all = splitWords(allOf);
    const any = splitWords(anyOf);
    const count = several && !rule ? countLines(name) : 0;
    const blocked = save.isPending || (rule ? !name.trim() || (all.length === 0 && any.length === 0) : several ? count === 0 : !name.trim());

    const toggleRule = (checked: boolean) => {
        setRule(checked);
        // A rule reads whole words by default; a single word keeps matching inside longer words, as it always did
        if (!editing) setWholeWords(checked);
    };

    const submit = (dryRun: boolean) => {
        if (blocked) return;
        if (several && !rule) {
            void bulk.create(name, { level }, 'Add monitored keywords', dryRun);
            if (!dryRun) onClose();
            return;
        }
        save.mutate(
            {
                id: keyword?.id,
                input: {
                    name: name.trim(),
                    level,
                    all_of: rule ? all : [],
                    any_of: rule ? any : [],
                    exceptions: splitWords(exceptions),
                    whole_words: wholeWords,
                    is_active: active,
                },
            },
            {
                onSuccess: (saved) => {
                    onSaved?.(saved);
                    onClose();
                },
            },
        );
    };

    const mono = { htmlInput: { style: { fontFamily: fonts.mono } } };
    return (
        <form
            noValidate
            onSubmit={(e) => {
                e.preventDefault();
                submit(false);
            }}
        >
            <DialogTitle id="keyword-form-title">{editing ? `Edit ${keyword.name}` : 'Add monitored keywords'}</DialogTitle>
            <DialogContent>
                <Stack spacing={2} sx={{ pt: 1 }}>
                    <Typography variant="body2" color="text.secondary">
                        Words to watch for in the RSS articles, e.g. the name of the organisation or of a product. Every new article that mentions one is an alert. Tick Rule to ask for
                        several words in the same article.
                    </Typography>
                    {save.error ? <MuiAlert severity="error">{getErrorMessage(save.error, 'The keyword could not be saved.')}</MuiAlert> : null}
                    <TextField
                        label={rule ? 'Name of the rule' : several ? 'Monitored keywords' : 'Monitored keyword'}
                        name="name"
                        required
                        autoFocus
                        multiline={several && !rule}
                        minRows={several && !rule ? 5 : undefined}
                        value={several && !rule ? name : name.split(/\r?\n/)[0]}
                        onChange={(e) => setName(e.target.value)}
                        placeholder={rule ? 'Actor X and partner Y' : 'acme'}
                        helperText={several && !rule ? `${count} ${count === 1 ? 'monitored keyword' : 'monitored keywords'} detected.` : undefined}
                        slotProps={{ htmlInput: { maxLength: several && !rule ? undefined : 150, spellCheck: false } }}
                        fullWidth
                    />
                    <Stack direction="row" sx={{ flexWrap: 'wrap', columnGap: 3 }}>
                        <FormControlLabel
                            control={<Switch size="small" checked={rule} onChange={(e) => toggleRule(e.target.checked)} />}
                            label={<Typography variant="body2">Rule: several words in the same article</Typography>}
                        />
                        {!editing && !rule && (
                            <FormControlLabel
                                control={<Switch size="small" checked={several} onChange={(e) => setSeveral(e.target.checked)} />}
                                label={<Typography variant="body2">Add several, one per line</Typography>}
                            />
                        )}
                    </Stack>
                    {rule && (
                        <>
                            <TextField
                                label="The article must contain all of"
                                name="all_of"
                                multiline
                                minRows={3}
                                value={allOf}
                                onChange={(e) => setAllOf(e.target.value)}
                                placeholder={'Lazarus\nAcme'}
                                helperText={`One per line or separated by commas - ${all.length} word${all.length === 1 ? '' : 's'}, every one is required (AND)`}
                                slotProps={mono}
                                fullWidth
                            />
                            <TextField
                                label="and at least one of (optional)"
                                name="any_of"
                                multiline
                                minRows={2}
                                value={anyOf}
                                onChange={(e) => setAnyOf(e.target.value)}
                                placeholder={'Globex\nInitech'}
                                helperText="When given, one of these has to be there too (OR)"
                                slotProps={mono}
                                fullWidth
                            />
                        </>
                    )}
                    {(rule || exceptions.trim() !== '') && (
                        <TextField
                            label="Never when it contains"
                            name="exceptions"
                            multiline
                            minRows={2}
                            value={exceptions}
                            onChange={(e) => setExceptions(e.target.value)}
                            placeholder="webinar"
                            helperText="An article with one of these words is never matched"
                            slotProps={mono}
                            fullWidth
                        />
                    )}
                    {rule && (
                        <FormControlLabel
                            control={<Checkbox checked={wholeWords} onChange={(e) => setWholeWords(e.target.checked)} />}
                            label={<Typography variant="body2">Whole words only (&quot;apt&quot; does not match &quot;adapt&quot;); case and accents are always ignored</Typography>}
                        />
                    )}
                    <Stack spacing={0.5}>
                        <Typography variant="overline" color="text.secondary">
                            Alert level
                        </Typography>
                        <ToggleButtonGroup size="small" exclusive value={level} onChange={(_, v: Level | null) => v && setLevel(v)} aria-label="Alert level">
                            {LEVELS.map((l) => (
                                <ToggleButton key={l.value} value={l.value} sx={{ px: 2 }}>
                                    {l.label}
                                </ToggleButton>
                            ))}
                        </ToggleButtonGroup>
                        <Typography variant="caption" color="text.secondary">
                            The level rises by itself with the mentions; set it to start higher.
                        </Typography>
                    </Stack>
                    {editing && <FormControlLabel control={<Switch checked={active} onChange={(e) => setActive(e.target.checked)} />} label="Active" />}
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button color="inherit" onClick={onClose}>
                    Cancel
                </Button>
                {several && !rule && (
                    <Button variant="outlined" disabled={blocked} onClick={() => submit(true)}>
                        Preview
                    </Button>
                )}
                <Button type="submit" variant="contained" disabled={blocked}>
                    {editing ? 'Save' : several && !rule ? `Add ${count}` : 'Add'}
                </Button>
            </DialogActions>
        </form>
    );
}

export function KeywordFormDialog({ open, ...props }: KeywordFormProps & { open: boolean }) {
    return (
        <Dialog open={open} onClose={props.onClose} maxWidth="sm" fullWidth aria-labelledby="keyword-form-title">
            {/* Remounted on every opening, so the form starts from the keyword. */}
            {open && <KeywordForm key={props.keyword?.id ?? 'new'} {...props} />}
        </Dialog>
    );
}
