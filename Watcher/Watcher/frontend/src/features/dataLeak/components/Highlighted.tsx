import { Box } from '@mui/material';
import { alpha } from '@mui/material/styles';
import { fonts } from '../../../styles/theme';
import type { Segment } from '../format';

/** Monospace text with the matches of a pattern marked. */
export function Highlighted({ segments, maxHeight = 320, label }: { segments: Segment[]; maxHeight?: number; label: string }) {
    return (
        <Box
            component="pre"
            aria-label={label}
            tabIndex={0}
            sx={{
                m: 0,
                p: 1.5,
                maxHeight,
                overflow: 'auto',
                fontFamily: fonts.mono,
                fontSize: 12,
                lineHeight: 1.6,
                whiteSpace: 'pre-wrap',
                overflowWrap: 'anywhere',
                borderRadius: 1.5,
                bgcolor: 'action.hover',
                '& mark': (theme) => ({
                    bgcolor: alpha(theme.palette.warning.main, theme.palette.mode === 'dark' ? 0.35 : 0.25),
                    color: 'text.primary',
                    borderRadius: 0.5,
                    px: 0.25,
                }),
            }}
        >
            {segments.map((s, i) => (s.match ? <mark key={i}>{s.text}</mark> : s.text))}
        </Box>
    );
}
