import { useState } from 'react';
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, Stack, Switch, TextField, Typography } from '@mui/material';
import { countLines, useBulk } from '../../bulk/useBulk';
import { ASSET_KINDS } from '../catalog';
import { assetBulk, useSaveAsset } from '../hooks';
import type { Asset, AssetKind } from '../types';

const HELP: Record<AssetKind, string> = {
    domain: 'Domains of the organisation. Watcher looks for their look-alike variants every 2 hours, and for subdomains at takeover risk in new certificates.',
    keyword: 'Words that should not appear in someone else’s domain names, e.g. a brand. Every new certificate whose names contain one raises a threat.',
};

function AssetForm({ kind, asset, onClose }: { kind: AssetKind; asset: Asset | null; onClose: () => void }) {
    const editing = asset !== null;
    const meta = ASSET_KINDS[kind];
    const [name, setName] = useState(asset?.name ?? '');
    const [several, setSeveral] = useState(false);
    const save = useSaveAsset(kind);
    const bulk = useBulk(assetBulk(kind));
    const count = several ? countLines(name) : 0;
    const blocked = (several ? count === 0 : !name.trim()) || save.isPending;
    const label = kind === 'domain' ? 'Domain' : 'Keyword';

    const submit = (dryRun: boolean) => {
        if (blocked) return;
        if (several) {
            void bulk.create(name, {}, `Add ${meta.many}`, dryRun);
            if (!dryRun) onClose();
            return;
        }
        save.mutate({ id: asset?.id, name: name.trim() }, { onSuccess: onClose });
    };

    return (
        <form
            noValidate
            onSubmit={(e) => {
                e.preventDefault();
                submit(false);
            }}
        >
            <DialogTitle id="asset-form-title">{editing ? `Edit ${asset.name}` : `Add ${meta.many}`}</DialogTitle>
            <DialogContent>
                <Stack spacing={1.5} sx={{ pt: 1 }}>
                    <Typography variant="body2" color="text.secondary">
                        {HELP[kind]}
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
                        placeholder={kind === 'domain' ? 'example.com' : 'brandname'}
                        helperText={several ? `${count} ${count === 1 ? meta.one : meta.many} detected.` : undefined}
                        slotProps={{ htmlInput: { maxLength: several ? undefined : 100, spellCheck: false } }}
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

interface AssetFormDialogProps {
    kind: AssetKind | null;
    /** The asset to edit, or `null` to add. */
    asset: Asset | null;
    onClose: () => void;
}

export function AssetFormDialog({ kind, asset, onClose }: AssetFormDialogProps) {
    return (
        <Dialog open={kind !== null} onClose={onClose} maxWidth="sm" fullWidth aria-labelledby="asset-form-title">
            {kind && <AssetForm kind={kind} asset={asset} onClose={onClose} />}
        </Dialog>
    );
}
