import { Box, Typography } from '@mui/material';
import { fieldLabel } from '../catalog';
import { formatValue } from '../format';
import type { TimelineEvent } from '../types';

const isEmpty = (value: unknown) => value === null || value === undefined || value === '' || (Array.isArray(value) && value.length === 0);

function Value({ value, kind }: { value: unknown; kind: 'old' | 'new' }) {
    if (isEmpty(value)) {
        return (
            <Typography sx={{ fontSize: 12, color: 'text.disabled', fontStyle: 'italic' }} component="span">
                empty
            </Typography>
        );
    }
    return (
        <Typography
            component="span"
            sx={{
                fontSize: 12,
                overflowWrap: 'anywhere',
                color: kind === 'old' ? 'error.main' : 'success.main',
                textDecoration: kind === 'old' ? 'line-through' : 'none',
            }}
        >
            {formatValue(value)}
        </Typography>
    );
}

/** Field-by-field, before and after. */
export function EventDiff({ diff, contentType }: { diff: TimelineEvent['diff']; contentType?: string }) {
    return (
        <Box
            data-testid="event-diff"
            sx={{
                display: 'grid',
                gridTemplateColumns: 'max-content minmax(0, max-content) auto minmax(0, 1fr)',
                columnGap: 1.25,
                rowGap: 0.5,
                alignItems: 'baseline',
                p: 1.25,
                borderRadius: 1.5,
                bgcolor: 'action.hover',
            }}
        >
            {Object.entries(diff).map(([field, change]) => (
                <Box key={field} sx={{ display: 'contents' }}>
                    <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                        {fieldLabel(field, contentType)}
                    </Typography>
                    <Value value={change?.old} kind="old" />
                    <Typography variant="caption" color="text.disabled" sx={{ alignSelf: 'center' }}>
                        to
                    </Typography>
                    <Value value={change?.new} kind="new" />
                </Box>
            ))}
        </Box>
    );
}
