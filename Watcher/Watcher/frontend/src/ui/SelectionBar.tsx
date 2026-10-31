import type { ReactNode } from 'react';
import { alpha, Button, Paper, Stack, Typography } from '@mui/material';

// Same default as the backend setting BULK_ACTION_MAX_ITEMS
export const BULK_MAX_ITEMS = 200;

interface SelectionBarProps {
    count: number;
    onClear: () => void;
    /** Bulk actions; disabled by the caller when `count` exceeds BULK_MAX_ITEMS. */
    children: ReactNode;
}

/** Replaces the filter toolbar while rows are selected: what is selected and what can be done with it. */
export function SelectionBar({ count, onClear, children }: SelectionBarProps) {
    const tooMany = count > BULK_MAX_ITEMS;
    return (
        <Paper
            variant="outlined"
            role="region"
            aria-label="Selection"
            sx={(theme) => ({
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                gap: 1.5,
                px: 2,
                py: 1,
                borderColor: 'primary.main',
                bgcolor: alpha(theme.palette.primary.main, 0.06),
            })}
        >
            <Typography sx={{ fontWeight: 600 }}>{count} selected</Typography>
            <Button size="small" color="inherit" onClick={onClear} sx={{ color: 'text.secondary' }}>
                Clear
            </Button>
            {tooMany && (
                <Typography variant="body2" color="error">
                    Maximum {BULK_MAX_ITEMS} items per action.
                </Typography>
            )}
            <Stack direction="row" spacing={1} sx={{ ml: 'auto', flexWrap: 'wrap' }}>
                {children}
            </Stack>
        </Paper>
    );
}
