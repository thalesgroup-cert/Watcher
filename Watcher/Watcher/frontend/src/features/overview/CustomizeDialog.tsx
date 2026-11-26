import { Box, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, Stack, Typography } from '@mui/material';
import type { HomeBlock, HomeBlockId } from './blocks';

/** The window where the person ticks the blocks of the home page. A tick shows or hides a block at once. */
export function CustomizeDialog({
    open,
    onClose,
    blocks,
    isShown,
    setShown,
    onReset,
}: {
    open: boolean;
    onClose: () => void;
    blocks: HomeBlock[];
    isShown: (id: HomeBlockId) => boolean;
    setShown: (id: HomeBlockId, shown: boolean) => void;
    onReset: () => void;
}) {
    return (
        <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs" aria-labelledby="customize-home-title">
            <DialogTitle id="customize-home-title">Customise the home page</DialogTitle>
            <DialogContent>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                    Choose the blocks you want to see. The choice follows your account.
                </Typography>
                <Stack role="group" aria-label="Blocks" spacing={0.5}>
                    {blocks.map((block) => (
                        <FormControlLabel
                            key={block.id}
                            sx={{ alignItems: 'flex-start', m: 0 }}
                            control={<Checkbox size="small" checked={isShown(block.id)} onChange={(e) => setShown(block.id, e.target.checked)} slotProps={{ input: { 'aria-label': block.label } }} />}
                            label={
                                <Box sx={{ pt: 0.5 }}>
                                    <Typography variant="body2" sx={{ fontWeight: 650 }}>
                                        {block.label}
                                    </Typography>
                                    <Typography variant="caption" color="text.secondary">
                                        {block.description}
                                    </Typography>
                                </Box>
                            }
                        />
                    ))}
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button color="inherit" onClick={onReset}>
                    Reset
                </Button>
                <Button variant="contained" onClick={onClose}>
                    Done
                </Button>
            </DialogActions>
        </Dialog>
    );
}
