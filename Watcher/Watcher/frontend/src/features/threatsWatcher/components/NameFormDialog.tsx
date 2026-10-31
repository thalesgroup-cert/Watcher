import { useState } from 'react';
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, Stack, Switch, TextField, Typography } from '@mui/material';
import { type BulkTarget, countLines, useBulk } from '../../bulk/useBulk';

export interface NameFormConfig {
    /** "banned word" */
    one: string;
    many: string;
    help: string;
    placeholder: string;
    bulk: BulkTarget;
}

interface NameFormProps {
    config: NameFormConfig;
    /** The item to edit, or null to add. */
    item: { id: number; name: string } | null;
    save: (input: { id?: number; name: string }, onSuccess: () => void) => void;
    pending: boolean;
    onClose: () => void;
}

/** Add (one or several, one per line) or rename a word-like item: banned words. */
function NameForm({ config, item, save, pending, onClose }: NameFormProps) {
    const editing = item !== null;
    const [name, setName] = useState(item?.name ?? '');
    const [several, setSeveral] = useState(false);
    const bulk = useBulk(config.bulk);
    const count = several ? countLines(name) : 0;
    const blocked = (several ? count === 0 : !name.trim()) || pending;
    const label = config.one.charAt(0).toUpperCase() + config.one.slice(1);

    const submit = (dryRun: boolean) => {
        if (blocked) return;
        if (several) {
            void bulk.create(name, {}, `Add ${config.many}`, dryRun);
            if (!dryRun) onClose();
            return;
        }
        save({ id: item?.id, name: name.trim() }, onClose);
    };

    return (
        <form
            noValidate
            onSubmit={(e) => {
                e.preventDefault();
                submit(false);
            }}
        >
            <DialogTitle id="name-form-title">{editing ? `Edit ${item.name}` : `Add ${config.many}`}</DialogTitle>
            <DialogContent>
                <Stack spacing={1.5} sx={{ pt: 1 }}>
                    <Typography variant="body2" color="text.secondary">
                        {config.help}
                    </Typography>
                    <TextField
                        label={several ? `${label}s` : label}
                        name="name"
                        required
                        autoFocus
                        multiline={several}
                        minRows={several ? 5 : undefined}
                        value={several ? name : name.split(/\r?\n/)[0]}
                        onChange={(e) => setName(e.target.value)}
                        placeholder={config.placeholder}
                        helperText={several ? `${count} ${count === 1 ? config.one : config.many} detected.` : undefined}
                        slotProps={{ htmlInput: { maxLength: several ? undefined : 150, spellCheck: false } }}
                        fullWidth
                    />
                    {!editing && (
                        <FormControlLabel
                            control={<Switch size="small" checked={several} onChange={(e) => setSeveral(e.target.checked)} />}
                            label={<Typography variant="body2">Add several, one per line</Typography>}
                        />
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
                    {editing ? 'Save' : several ? `Add ${count}` : 'Add'}
                </Button>
            </DialogActions>
        </form>
    );
}

export function NameFormDialog({ open, ...props }: NameFormProps & { open: boolean }) {
    return (
        <Dialog open={open} onClose={props.onClose} maxWidth="sm" fullWidth aria-labelledby="name-form-title">
            {open && <NameForm {...props} />}
        </Dialog>
    );
}
