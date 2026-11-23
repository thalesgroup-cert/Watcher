import { useId } from 'react';
import { Box, useTheme } from '@mui/material';

/** One bar per day, oldest first, the last one (today) in full colour. A day without article keeps a hairline so the days stay readable. */
export function MiniBars({ values, color, width = 66, height = 22, label }: { values: number[]; color?: string; width?: number; height?: number; label?: string }) {
    const theme = useTheme();
    const id = useId();
    const fill = color ?? theme.palette.primary.main;
    const top = Math.max(1, ...values);
    const gap = 2;
    const bar = (width - gap * (values.length - 1)) / values.length;
    return (
        <Box component="span" sx={{ display: 'inline-flex', flexShrink: 0 }}>
            <svg width={width} height={height} role="img" aria-labelledby={id} data-testid="mini-bars">
                <title id={id}>{label ?? `Articles per day: ${values.join(', ')}`}</title>
                {values.map((value, i) => {
                    const h = value === 0 ? 1.5 : Math.max(3, (value / top) * (height - 1));
                    return (
                        <rect
                            key={i}
                            x={i * (bar + gap)}
                            y={height - h}
                            width={bar}
                            height={h}
                            rx={1.5}
                            fill={fill}
                            opacity={i === values.length - 1 ? 1 : value === 0 ? 0.25 : 0.5}
                        />
                    );
                })}
            </svg>
        </Box>
    );
}
