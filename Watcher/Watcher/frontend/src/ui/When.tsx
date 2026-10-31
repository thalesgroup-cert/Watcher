import { Tooltip, Typography } from '@mui/material';
import { formatDateTime, since } from '../lib/dates';

interface WhenProps {
    iso: string | null | undefined;
    /** Shown when there is no date. */
    empty?: string;
    /** Inside a sentence ("Last seen 3 hours ago") instead of a cell of its own. */
    inline?: boolean;
}

/** "3 hours ago", with the exact date and time (24 h) when the pointer is on it. The same everywhere a moment is shown. */
export function When({ iso, empty = '-', inline = false }: WhenProps) {
    const component = inline ? 'span' : 'p';
    const margin = inline ? undefined : 0;
    if (!iso) {
        return (
            <Typography component={component} variant="body2" color="text.disabled" sx={{ m: margin }}>
                {empty}
            </Typography>
        );
    }
    return (
        <Tooltip title={formatDateTime(iso)}>
            <Typography component={component} variant={inline ? 'inherit' : 'body2'} noWrap={!inline} sx={{ m: margin }}>
                {since(iso)}
            </Typography>
        </Tooltip>
    );
}
