import { alpha, Box, Card, CardActionArea, Typography, useTheme } from '@mui/material';
import type { Connector } from '../types';
import { connectorLight, LIGHT_ORDER, LIGHTS, StateIcon, useLight, type Light } from './State';

function LightCard({ light, count, selected, onToggle }: { light: Light; count: number; selected: boolean; onToggle: () => void }) {
    const theme = useTheme();
    const color = useLight(light);
    return (
        <Card
            data-testid={`light-${light}`}
            sx={{ borderColor: selected ? color : undefined, bgcolor: selected ? alpha(color, theme.palette.mode === 'dark' ? 0.14 : 0.08) : undefined, opacity: count === 0 ? 0.65 : 1 }}
        >
            <CardActionArea onClick={onToggle} aria-pressed={selected} aria-label={`${LIGHTS[light].label}: ${count}. ${LIGHTS[light].meaning}`} sx={{ p: 1.5, height: '100%' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <StateIcon light={light} />
                    <Typography variant="body2" sx={{ fontWeight: 750, flexGrow: 1 }}>
                        {LIGHTS[light].label}
                    </Typography>
                    <Typography variant="h2" component="span" sx={{ lineHeight: 1 }}>
                        {count}
                    </Typography>
                </Box>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.75 }}>
                    {LIGHTS[light].meaning}
                </Typography>
            </CardActionArea>
        </Card>
    );
}

/**
 * The state of every connector at a glance: one card per light, with how many connectors show it and what it means. A
 * card is also a filter of the list below: a second click lifts it.
 */
export function LightBoard({ connectors, active, onPick }: { connectors: Connector[]; active: Light | ''; onPick: (light: Light | '') => void }) {
    const counts = connectors.reduce<Record<Light, number>>((n, c) => ({ ...n, [connectorLight(c).light]: n[connectorLight(c).light] + 1 }), { ok: 0, problem: 0, unfinished: 0, untested: 0, off: 0 });
    return (
        <Box component="section" aria-label="State of the connectors" sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)', xl: 'repeat(5, 1fr)' }, mb: 3 }}>
            {LIGHT_ORDER.map((light) => (
                <LightCard key={light} light={light} count={counts[light]} selected={active === light} onToggle={() => onPick(active === light ? '' : light)} />
            ))}
        </Box>
    );
}
