import type { ReactNode } from 'react';
import { Box, ButtonBase, Card, CardContent, Stack, Typography, useTheme } from '@mui/material';

// Chart colours, checked for colour-vision separation in both modes with the dataviz validator: categorical slots
// in a fixed order (never cycled), and the fixed status steps with a neutral grey. Text always uses the theme's ink.
export const SERIES = {
    light: ['#2a78d6', '#eb6834', '#1baf7a'],
    dark: ['#3987e5', '#d95926', '#199e70'],
};
export const STATUS_FILL = {
    good: '#0ca30c',
    warning: '#fab219',
    critical: '#d03b3b',
    neutral: '#8a94a6',
};

/** Colour of categorical slot `index` (0-based) in the current mode. */
export function useSeriesColor(index = 0): string {
    return SERIES[useTheme().palette.mode][index];
}

export function ChartCard({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
    return (
        <Card sx={{ height: '100%' }}>
            <CardContent>
                <Typography variant="h3" component="h2">
                    {title}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    {subtitle}
                </Typography>
                {children}
            </CardContent>
        </Card>
    );
}

export interface RankedItem {
    key: string;
    label: ReactNode;
    count: number;
    /** Accessible name of the click (e.g. "Show the 12 alerts of github.com"). */
    actionLabel?: string;
    onClick?: () => void;
}

/** Ranked list with one bar per item and the value at its tip; a click on an item filters the list behind. */
export function RankedBars({ items, label }: { items: RankedItem[]; label: string }) {
    const color = useSeriesColor(0);
    const max = Math.max(1, ...items.map((i) => i.count));
    return (
        <Stack spacing={0.5} component="ol" sx={{ listStyle: 'none', m: 0, p: 0 }} aria-label={label}>
            {items.map((item) => {
                const row = (
                    <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(56px, 38%) 1fr auto', alignItems: 'center', gap: 1.5, width: '100%' }}>
                        <Typography variant="body2" sx={{ fontWeight: 600, textAlign: 'left' }} noWrap>
                            {item.label}
                        </Typography>
                        <Box sx={{ height: 12 }}>
                            <Box sx={{ height: '100%', width: `${(item.count / max) * 100}%`, minWidth: 4, bgcolor: color, borderRadius: '0 4px 4px 0' }} />
                        </Box>
                        <Typography variant="body2" color="text.secondary" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                            {item.count.toLocaleString('en-GB')}
                        </Typography>
                    </Box>
                );
                return (
                    <Box key={item.key} component="li">
                        {item.onClick ? (
                            <ButtonBase
                                onClick={item.onClick}
                                aria-label={item.actionLabel}
                                sx={{ width: '100%', px: 0.75, py: 0.5, borderRadius: 1, '&:hover': { bgcolor: 'action.hover' } }}
                            >
                                {row}
                            </ButtonBase>
                        ) : (
                            <Box sx={{ px: 0.75, py: 0.5 }}>{row}</Box>
                        )}
                    </Box>
                );
            })}
        </Stack>
    );
}

/** A chart number in English, whatever the browser language (the chart library formats tooltips with the browser's). */
export const formatCount = (value: number | null) => (value == null ? '' : value.toLocaleString('en-GB'));

/** Series whose tooltip values use `formatCount`. */
export const countSeries = <T extends object>(series: T[]) => series.map((s) => ({ valueFormatter: formatCount, ...s }));
