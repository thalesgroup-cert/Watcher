import { memo, useMemo, useState } from 'react';
import { alpha, Box, Stack, Typography, useTheme } from '@mui/material';
import { ComposableMap, Geographies, Geography, ZoomableGroup } from 'react-simple-maps';
import type { GeoJsonObject } from 'geojson';
import { numericToAlpha2 } from 'i18n-iso-countries';
import world from 'world-atlas/countries-110m.json';
import { isoToFlag } from '../lib/countries';
import { useWidth } from '../lib/useWidth';

const regionNames = typeof Intl.DisplayNames === 'function' ? new Intl.DisplayNames(['en'], { type: 'region' }) : null;
/** "France" from "FR". */
export function countryName(code: string): string {
    try {
        return regionNames?.of(code.toUpperCase()) ?? code;
    } catch {
        return code;
    }
}

// Five steps of one hue, light to dark (sequential scale): the darker, the more.
const STEPS = 5;

export interface MapValue {
    /** ISO 3166-1 alpha-2 code. */
    code: string;
    count: number;
}

interface WorldMapProps {
    values: MapValue[];
    /** What is counted, e.g. "ransomware victims" (tooltip and accessible name). */
    unit: string;
    onCountry?: (code: string) => void;
    height?: number;
}

/** Countries shaded by a count; hover a country for its figure, click it to see the list behind. */
function WorldMapView({ values, unit, onCountry, height = 340 }: WorldMapProps) {
    const theme = useTheme();
    const dark = theme.palette.mode === 'dark';
    const [frame, width] = useWidth<HTMLDivElement>();
    const [hover, setHover] = useState<{ code: string; name: string; count: number } | null>(null);
    const byCode = useMemo(() => new Map(values.map((v) => [v.code.toUpperCase(), v.count])), [values]);
    const max = Math.max(1, ...values.map((v) => v.count));
    const base = theme.palette.primary.main;
    // Square root: a few countries with most of the counts would leave the others all pale.
    const step = (n: number) => Math.min(STEPS, Math.max(1, Math.ceil(Math.sqrt(n / max) * STEPS)));
    const fill = (n: number) => (n ? alpha(base, (dark ? 0.22 : 0.16) + (step(n) - 1) * (dark ? 0.18 : 0.2)) : alpha(theme.palette.text.primary, dark ? 0.08 : 0.06));
    const total = values.reduce((sum, v) => sum + v.count, 0);

    return (
        <Box sx={{ position: 'relative' }}>
            <Box
                ref={frame}
                sx={{
                    height,
                    '& svg': { width: '100%', height: '100%' },
                    '& path': { outline: 'none', transition: 'fill 120ms' },
                    '& path.with-data:hover': { fill: theme.palette.primary.dark, cursor: onCountry ? 'pointer' : 'default' },
                }}
                role="img"
                aria-label={`World map of ${total.toLocaleString('en-GB')} ${unit} in ${values.length} countries`}
                data-testid="world-map"
            >
                {width > 0 && (
                    // The map is drawn at the size of its frame: the projection fills the width, the zoom group pans.
                    <ComposableMap projection="geoEqualEarth" projectionConfig={{ scale: Math.min(width / 5.4, height / 2.6) }} width={width} height={height} style={{ width: '100%', height: '100%' }}>
                    <ZoomableGroup center={[10, 15]} zoom={1} minZoom={1} maxZoom={6}>
                        <Geographies geography={world as unknown as GeoJsonObject}>
                            {({ geographies }) =>
                                geographies.map((geo) => {
                                    const code = numericToAlpha2(String(geo.id).padStart(3, '0')) ?? '';
                                    const count = byCode.get(code) ?? 0;
                                    const name = code ? countryName(code) : String(geo.properties?.name ?? '');
                                    return (
                                        <Geography
                                            key={geo.rsmKey ?? geo.id}
                                            geography={geo}
                                            onMouseEnter={() => setHover({ code, name, count })}
                                            onMouseLeave={() => setHover(null)}
                                            onClick={() => count && code && onCountry?.(code)}
                                            className={count ? 'with-data' : undefined}
                                            fill={fill(count)}
                                            stroke={theme.palette.background.paper}
                                            strokeWidth={0.5}
                                        />
                                    );
                                })
                            }
                        </Geographies>
                    </ZoomableGroup>
                    </ComposableMap>
                )}
            </Box>
            {hover && (
                <Box
                    role="status"
                    sx={{ position: 'absolute', top: 8, left: 8, px: 1.25, py: 0.75, borderRadius: 1.5, bgcolor: alpha(theme.palette.background.paper, 0.92), border: 1, borderColor: 'divider', pointerEvents: 'none' }}
                >
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>
                        {isoToFlag(hover.code)} {hover.name}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                        {hover.count ? `${hover.count.toLocaleString('en-GB')} ${unit}` : `No ${unit}`}
                    </Typography>
                </Box>
            )}
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center', justifyContent: 'flex-end', mt: 0.5 }} aria-hidden>
                <Typography variant="caption" color="text.secondary">
                    Fewer
                </Typography>
                {Array.from({ length: STEPS }, (_, i) => (
                    <Box key={i} sx={{ width: 18, height: 8, borderRadius: 0.5, bgcolor: alpha(base, (dark ? 0.22 : 0.16) + i * (dark ? 0.18 : 0.2)) }} />
                ))}
                <Typography variant="caption" color="text.secondary">
                    More
                </Typography>
            </Stack>
        </Box>
    );
}

export const WorldMap = memo(WorldMapView);
