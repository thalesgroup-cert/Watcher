import type { ReactNode } from 'react';
import { alpha, Box, Card, CardActionArea, Typography } from '@mui/material';

interface KpiCardProps {
    title: string;
    /** `undefined` while loading: shown as a dash rather than a misleading 0. */
    value: number | undefined;
    icon: ReactNode;
    color: 'primary' | 'success' | 'warning' | 'error' | 'inherit';
    /** Makes the card a quick filter of the list below it. */
    onClick?: () => void;
    /** The filter of this card is the active one. */
    selected?: boolean;
}

export function KpiCard({ title, value, icon, color, onClick, selected = false }: KpiCardProps) {
    const body = (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, p: 1.5 }}>
            <Box
                sx={(theme) => {
                    const main = color === 'inherit' ? theme.palette.text.secondary : theme.palette[color].main;
                    return {
                        width: 44,
                        height: 44,
                        flexShrink: 0,
                        display: 'grid',
                        placeItems: 'center',
                        borderRadius: '12px',
                        color: main,
                        bgcolor: alpha(main, 0.12),
                    };
                }}
            >
                {icon}
            </Box>
            <Box sx={{ minWidth: 0 }}>
                <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>
                    {title}
                </Typography>
                <Typography variant="h2" component="div" sx={{ lineHeight: 1.1 }}>
                    {value === undefined ? '-' : value.toLocaleString('en-GB')}
                </Typography>
            </Box>
        </Box>
    );

    return (
        <Card
            sx={{
                height: '100%',
                outline: selected ? 2 : 0,
                outlineColor: (theme) => (color === 'inherit' ? theme.palette.text.secondary : theme.palette[color].main),
                outlineOffset: -2,
            }}
        >
            {onClick ? (
                <CardActionArea onClick={onClick} aria-pressed={selected} sx={{ height: '100%' }}>
                    {body}
                </CardActionArea>
            ) : (
                body
            )}
        </Card>
    );
}
