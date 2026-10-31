import { Box, Chip, Stack } from '@mui/material';
import Cancel from '@mui/icons-material/Cancel';

export interface FilterChip {
    key: string;
    /** Name of the filter, as on its menu: "Severity". */
    label: string;
    /** What it is set to: "Critical, High". */
    value: string;
    onRemove: () => void;
}

/**
 * The filters that narrow a list, one removable tag each, under the toolbar. A filter that is off is not listed, so
 * entries can be written as `condition && { ... }`. Renders nothing when no filter is on.
 */
export function ActiveFilters({ chips }: { chips: (FilterChip | false | null | undefined | '')[] }) {
    const active = chips.filter((c): c is FilterChip => !!c);
    if (active.length === 0) return null;
    return (
        // A full-width line of its own inside the wrapping toolbar.
        <Box sx={{ flexBasis: '100%' }}>
            <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 0.75 }} aria-label="Active filters" role="group">
                {active.map((c) => (
                    <Chip
                        key={c.key}
                        size="small"
                        variant="outlined"
                        onDelete={c.onRemove}
                        label={
                            <>
                                <Box component="span" sx={{ color: 'text.secondary' }}>
                                    {c.label}:
                                </Box>{' '}
                                {c.value}
                            </>
                        }
                        deleteIcon={<Cancel aria-label={`Remove the ${c.label} filter`} />}
                    />
                ))}
            </Stack>
        </Box>
    );
}
