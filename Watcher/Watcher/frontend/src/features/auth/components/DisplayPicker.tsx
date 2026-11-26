import type { ReactNode } from 'react';
import { Box, FormControlLabel, Stack, Switch, Typography } from '@mui/material';
import { ChoiceCards } from '../../../ui/ChoiceCards';
import { SERIES, SERIES_COLOURBLIND } from '../../../ui/charts';
import { CHART_COLOURS, DENSITIES, TEXT_SCALE, TEXT_SIZES, type ChartColours, type Density, type TextSize } from '../../../styles/display';
import { prefersReducedMotion } from '../../../styles/effects';
import { useThemeMode } from '../../../styles/ThemeModeProvider';

function Setting({ title, children }: { title: string; children: ReactNode }) {
    return (
        <Stack spacing={0.75}>
            <Typography variant="overline" color="text.secondary">
                {title}
            </Typography>
            {children}
        </Stack>
    );
}

/** Three table rows, closer together or not. */
function Rows({ gap }: { gap: number }) {
    return (
        <Stack aria-hidden spacing={`${gap}px`} sx={{ width: 56, py: 0.5 }}>
            {[1, 2, 3].map((i) => (
                <Box key={i} sx={{ height: 4, borderRadius: 1, bgcolor: 'text.secondary', opacity: 0.55 }} />
            ))}
        </Stack>
    );
}

function Swatches({ colours }: { colours: string[] }) {
    return (
        <Stack aria-hidden direction="row" spacing={0.75} sx={{ py: 0.25 }}>
            {colours.map((c) => (
                <Box key={c} sx={{ width: 18, height: 18, borderRadius: '50%', bgcolor: c }} />
            ))}
        </Stack>
    );
}

/** Row density, text size, motion and chart colours: how the interface is laid out, whatever the theme. */
export function DisplayPicker() {
    const { display, setDisplay, dark } = useThemeMode();
    const systemStills = prefersReducedMotion() && display.motion === 'system';
    const mode = dark ? 'dark' : 'light';

    return (
        <Stack spacing={3}>
            <Setting title="Row density">
                <ChoiceCards<Density>
                    label="Row density"
                    value={display.density}
                    onChange={(density) => setDisplay({ density })}
                    options={(Object.keys(DENSITIES) as Density[]).map((d) => ({
                        value: d,
                        title: DENSITIES[d].label,
                        figure: <Rows gap={d === 'compact' ? 3 : 9} />,
                        hint: DENSITIES[d].hint,
                    }))}
                />
            </Setting>
            <Setting title="Text size">
                <ChoiceCards<TextSize>
                    label="Text size"
                    value={display.textSize}
                    onChange={(textSize) => setDisplay({ textSize })}
                    options={(Object.keys(TEXT_SIZES) as TextSize[]).map((s) => ({
                        value: s,
                        title: TEXT_SIZES[s].label,
                        figure: <span style={{ fontSize: Math.round(20 * TEXT_SCALE[s]) }}>Aa</span>,
                        hint: TEXT_SIZES[s].hint,
                    }))}
                />
            </Setting>
            <Setting title="Chart colours">
                <ChoiceCards<ChartColours>
                    label="Chart colours"
                    value={display.charts}
                    onChange={(charts) => setDisplay({ charts })}
                    options={(Object.keys(CHART_COLOURS) as ChartColours[]).map((c) => ({
                        value: c,
                        title: CHART_COLOURS[c].label,
                        figure: <Swatches colours={(c === 'colourblind' ? SERIES_COLOURBLIND : SERIES)[mode]} />,
                        hint: CHART_COLOURS[c].hint,
                    }))}
                />
            </Setting>
            <Setting title="Motion">
                <FormControlLabel
                    control={<Switch checked={display.motion === 'reduced'} onChange={(e) => setDisplay({ motion: e.target.checked ? 'reduced' : 'system' })} />}
                    label={<Typography variant="body2">Reduce animations</Typography>}
                />
                <Typography variant="caption" color="text.secondary">
                    Stills the transitions, the glows of the backdrop and anything that moves. The reduced-motion setting of your system is always respected.
                    {systemStills && ' Your system already asks for less motion.'}
                </Typography>
            </Setting>
        </Stack>
    );
}
