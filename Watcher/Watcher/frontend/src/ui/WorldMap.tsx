import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    alpha,
    Box,
    ButtonBase,
    IconButton,
    Stack,
    ToggleButton,
    ToggleButtonGroup,
    Tooltip,
    Typography,
    useTheme,
} from '@mui/material';
import { keyframes } from '@mui/system';
import AddOutlined from '@mui/icons-material/AddOutlined';
import PublicOutlined from '@mui/icons-material/PublicOutlined';
import MapOutlined from '@mui/icons-material/MapOutlined';
import RemoveOutlined from '@mui/icons-material/RemoveOutlined';
import { geoCentroid, geoDistance, geoEqualEarth, geoGraticule10, geoOrthographic, geoPath, type GeoPermissibleObjects } from 'd3-geo';
import { feature } from 'topojson-client';
import type { Feature, FeatureCollection, Geometry } from 'geojson';
import type { GeometryCollection, Topology } from 'topojson-specification';
import { numericToAlpha2 } from 'i18n-iso-countries';
import world110 from 'world-atlas/countries-110m.json';
// The detailed outlines are a file of their own (the page is one script): fetched the first time the zoom needs them
import detailUrl from 'world-atlas/countries-50m.json?url';
import { isoToFlag } from '../lib/countries';
import { useWidth } from '../lib/useWidth';
import { useInspectorStore } from './SideDrawer';

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
/** Below this many square pixels a country is too small to be seen or hit: a dot stands for it. */
const SMALL_AREA = 24;
/** From this zoom the detailed outlines (50 m, fetched on demand) replace the light ones. */
const DETAIL_ZOOM = 2.4;
const MAX_ZOOM = 8;
const TOP = 3;
/** The globe stops turning by itself after this long (it starts again when it is reloaded or touched). */
const SPIN_SECONDS = 40;

const pulse = keyframes`
    0% { transform: scale(0.6); opacity: 0.8; }
    100% { transform: scale(2.6); opacity: 0; }
`;

export interface MapValue {
    /** ISO 3166-1 alpha-2 code. */
    code: string;
    count: number;
    /** The part of `count` that is of the last 30 days and of the last 7 days: the map then offers the periods. */
    d30?: number;
    d7?: number;
}

type Period = 'all' | 'd30' | 'd7';
type Mode = 'map' | 'globe';
interface Countries {
    features: Feature<Geometry, { name?: string }>[];
}

interface WorldMapProps {
    values: MapValue[];
    /** What is counted, e.g. "ransomware victims" (tooltip and accessible name). */
    unit: string;
    onCountry?: (code: string) => void;
    height?: number;
}

const codeOf = (f: Feature<Geometry>) => numericToAlpha2(String(f.id).padStart(3, '0')) ?? '';

function toCountries(topology: unknown): Countries {
    const t = topology as Topology<{ countries: GeometryCollection<{ name?: string }> }>;
    const collection = feature(t, t.objects.countries) as FeatureCollection<Geometry, { name?: string }>;
    // Antarctica takes a tenth of the map and never has a figure
    return { features: collection.features.filter((f) => String(f.id).padStart(3, '0') !== '010') };
}
const LIGHT = toCountries(world110);
const SPHERE: GeoPermissibleObjects = { type: 'Sphere' };

/** Countries shaded by a count, as a flat map or a globe; hover a country for its figure, click it to see the list behind. */
function WorldMapView({ values, unit, onCountry, height = 340 }: WorldMapProps) {
    const theme = useTheme();
    const dark = theme.palette.mode === 'dark';
    const [frame, width] = useWidth<HTMLDivElement>();
    const [mode, setMode] = useState<Mode>('globe');
    const [period, setPeriod] = useState<Period>('all');
    const [view, setView] = useState({ k: 1, x: 0, y: 0 });
    const [rotation, setRotation] = useState<[number, number]>([-12, -22]);
    const [hover, setHover] = useState<string | null>(null);
    const [dragging, setDragging] = useState(false);
    const [detail, setDetail] = useState<Countries | null>(null);
    const drag = useRef<{ x: number; y: number; moved: number } | null>(null);
    const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    const hasPeriods = values.some((v) => v.d7 !== undefined);
    const shown = useMemo(
        () =>
            values
                .map((v) => ({ code: v.code.toUpperCase(), count: period === 'all' ? v.count : (v[period] ?? 0), week: v.d7 ?? 0 }))
                .filter((v) => v.count > 0),
        [values, period],
    );
    const byCode = useMemo(() => new Map(shown.map((v) => [v.code, v])), [shown]);
    const max = Math.max(1, ...shown.map((v) => v.count));
    const total = shown.reduce((sum, v) => sum + v.count, 0);
    const base = theme.palette.primary.main;
    // Square root: a few countries with most of the counts would leave the others all pale.
    const step = (n: number) => Math.min(STEPS, Math.max(1, Math.ceil(Math.sqrt(n / max) * STEPS)));
    const tint = (i: number) => alpha(base, (dark ? 0.22 : 0.16) + i * (dark ? 0.18 : 0.2));
    const fill = (n: number) => (n ? tint(step(n) - 1) : alpha(theme.palette.text.primary, dark ? 0.08 : 0.07));

    const w = Math.max(width, 10);
    const h = height;
    const zoom = view.k;
    const isGlobe = mode === 'globe';

    // Outlines of the 50 m atlas, fetched the first time the zoom needs them (a separate file of the bundle)
    const wantDetail = !isGlobe && zoom >= DETAIL_ZOOM;
    useEffect(() => {
        if (!wantDetail || detail) return;
        let live = true;
        fetch(detailUrl)
            .then((r) => r.json())
            .then((topology: unknown) => live && setDetail(toCountries(topology)))
            .catch(() => undefined);
        return () => {
            live = false;
        };
    }, [wantDetail, detail]);
    const countries = wantDetail && detail ? detail : LIGHT;

    // Drawing the globe again at each step costs: it turns only while it is on screen, and stops after a while
    const [onScreen, setOnScreen] = useState(true);
    const [frameEl, setFrameEl] = useState<HTMLDivElement | null>(null);
    const setFrame = useCallback(
        (el: HTMLDivElement | null) => {
            frame(el);
            setFrameEl(el);
        },
        [frame],
    );
    useEffect(() => {
        if (!frameEl || typeof IntersectionObserver === 'undefined') return;
        const observer = new IntersectionObserver(([entry]) => setOnScreen(entry.isIntersecting));
        observer.observe(frameEl);
        return () => observer.disconnect();
    }, [frameEl]);
    const spent = useRef(0);
    // Someone reading a panel is not looking at the globe: it waits
    const reading = useInspectorStore((s) => Object.keys(s.open).length > 0);

    // The globe turns by itself, until the pointer is on it
    useEffect(() => {
        if (!isGlobe || reduced || dragging || hover || !onScreen || reading) return;
        let frameId = 0;
        let last = 0;
        const tick = (now: number) => {
            if (spent.current > SPIN_SECONDS * 1000) return;
            if (now - last > 100 && !document.hidden) {
                spent.current += last ? now - last : 0;
                last = now;
                setRotation(([lambda, phi]) => [(lambda + 1.8) % 360, phi]);
            }
            frameId = requestAnimationFrame(tick);
        };
        frameId = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(frameId);
    }, [isGlobe, reduced, dragging, hover, onScreen, reading]);

    const { path, project, shapes } = useMemo(() => {
        const projection = isGlobe ? geoOrthographic().rotate([rotation[0], rotation[1]]).clipAngle(90) : geoEqualEarth();
        projection.fitExtent(
            [
                [8, 8],
                [w - 8, h - 8],
            ],
            SPHERE,
        );
        if (isGlobe) projection.scale(projection.scale() * zoom);
        const pathGen = geoPath(projection);
        const centre: [number, number] = [-rotation[0], -rotation[1]];
        const items = countries.features.map((f) => {
            const code = codeOf(f);
            const small = !!byCode.has(code) && pathGen.area(f as GeoPermissibleObjects) * (isGlobe ? 1 : zoom * zoom) < SMALL_AREA;
            const middle = small ? geoCentroid(f as GeoPermissibleObjects) : null;
            const point = middle && (!isGlobe || geoDistance(middle, centre) < Math.PI / 2 - 0.05) ? projection(middle) : null;
            return { f, code, d: pathGen(f as GeoPermissibleObjects) ?? '', point };
        });
        return { path: pathGen, project: projection, shapes: items };
    }, [countries, isGlobe, rotation, w, h, zoom, byCode]);

    const sphereD = useMemo(() => path(SPHERE) ?? '', [path]);
    const graticuleD = useMemo(() => path(geoGraticule10()) ?? '', [path]);
    void project;

    const info = (code: string) => ({ code, name: countryName(code), count: byCode.get(code)?.count ?? 0 });
    const hovered = hover ? info(hover) : null;
    const ranking = useMemo(() => [...shown].sort((a, b) => b.count - a.count || a.code.localeCompare(b.code)), [shown]);
    const open = useCallback((code: string) => onCountry?.(code), [onCountry]);

    // Zoom keeps the centre of the frame where it is; the globe only changes its scale
    const zoomTo = (next: number) => {
        const k = Math.min(MAX_ZOOM, Math.max(1, next));
        setView((v) => {
            const cx = w / 2;
            const cy = h / 2;
            return k === 1 ? { k, x: 0, y: 0 } : { k, x: cx - ((cx - v.x) * k) / v.k, y: cy - ((cy - v.y) * k) / v.k };
        });
    };

    const onPointerDown = (e: React.PointerEvent) => {
        spent.current = 0;
        drag.current = { x: e.clientX, y: e.clientY, moved: 0 };
        setDragging(true);
        (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    };
    const onPointerMove = (e: React.PointerEvent) => {
        const d = drag.current;
        if (!d) return;
        const dx = e.clientX - d.x;
        const dy = e.clientY - d.y;
        d.x = e.clientX;
        d.y = e.clientY;
        d.moved += Math.abs(dx) + Math.abs(dy);
        if (isGlobe) setRotation(([lambda, phi]) => [lambda + (dx * 0.4) / zoom, Math.max(-85, Math.min(85, phi - (dy * 0.4) / zoom))]);
        else if (zoom > 1) setView((v) => ({ ...v, x: v.x + dx, y: v.y + dy }));
    };
    const onPointerUp = () => {
        drag.current = null;
        setDragging(false);
    };
    // A click that follows a drag is not a click on the country below
    const clicked = (code: string) => {
        if ((drag.current?.moved ?? 0) > 4) return;
        if (byCode.has(code)) open(code);
    };

    const strokeColor = alpha(theme.palette.background.paper, 0.9);
    const periodLabel = period === 'all' ? '' : period === 'd7' ? ' in the last 7 days' : ' in the last 30 days';

    return (
        <Box>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center', justifyContent: 'space-between', mb: 1, flexWrap: 'wrap', rowGap: 0.5 }}>
                {hasPeriods ? (
                    <ToggleButtonGroup size="small" exclusive value={period} onChange={(_, v: Period | null) => v && setPeriod(v)} aria-label="Period">
                        <ToggleButton value="all" sx={{ px: 1.25, py: 0.25 }}>
                            All
                        </ToggleButton>
                        <ToggleButton value="d30" sx={{ px: 1.25, py: 0.25 }}>
                            30 days
                        </ToggleButton>
                        <ToggleButton value="d7" sx={{ px: 1.25, py: 0.25 }}>
                            7 days
                        </ToggleButton>
                    </ToggleButtonGroup>
                ) : (
                    <span />
                )}
                <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
                    <ToggleButtonGroup size="small" exclusive value={mode} onChange={(_, v: Mode | null) => v && setMode(v)} aria-label="Projection">
                        <ToggleButton value="map" aria-label="Flat map" sx={{ px: 1, py: 0.25 }}>
                            <MapOutlined fontSize="small" />
                        </ToggleButton>
                        <ToggleButton value="globe" aria-label="Globe" sx={{ px: 1, py: 0.25 }}>
                            <PublicOutlined fontSize="small" />
                        </ToggleButton>
                    </ToggleButtonGroup>
                    <Tooltip title="Zoom in">
                        <IconButton size="small" aria-label="Zoom in" onClick={() => zoomTo(zoom * 1.6)} disabled={zoom >= MAX_ZOOM}>
                            <AddOutlined fontSize="small" />
                        </IconButton>
                    </Tooltip>
                    <Tooltip title="Zoom out">
                        <IconButton size="small" aria-label="Zoom out" onClick={() => zoomTo(zoom / 1.6)} disabled={zoom <= 1}>
                            <RemoveOutlined fontSize="small" />
                        </IconButton>
                    </Tooltip>
                </Stack>
            </Stack>

            <Box sx={{ position: 'relative', minWidth: 0 }}>
                    <Box
                        ref={setFrame}
                        sx={{ height, touchAction: 'none', cursor: dragging ? 'grabbing' : 'grab', userSelect: 'none', '& svg': { display: 'block' } }}
                        role="img"
                        aria-label={`World map of ${total.toLocaleString('en-GB')} ${unit}${periodLabel} in ${shown.length} countries`}
                        data-testid="world-map"
                        onPointerDown={onPointerDown}
                        onPointerMove={onPointerMove}
                        onPointerUp={onPointerUp}
                        onPointerCancel={onPointerUp}
                        onWheel={(e) => {
                            if (e.ctrlKey || e.metaKey) zoomTo(zoom * (e.deltaY < 0 ? 1.25 : 0.8));
                        }}
                    >
                        {width > 0 && (
                            <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
                                {isGlobe && (
                                    <>
                                        <path d={sphereD} fill={alpha(theme.palette.text.primary, dark ? 0.04 : 0.03)} stroke={alpha(base, 0.35)} strokeWidth={1} />
                                        <path d={graticuleD} fill="none" stroke={alpha(theme.palette.text.primary, 0.07)} strokeWidth={0.5} />
                                    </>
                                )}
                                <g transform={isGlobe ? undefined : `translate(${view.x} ${view.y}) scale(${zoom})`}>
                                    {shapes.map(({ f, code, d }) => {
                                        const count = byCode.get(code)?.count ?? 0;
                                        return (
                                            <path
                                                key={String(f.id)}
                                                d={d}
                                                fill={hover === code && count ? theme.palette.primary.dark : fill(count)}
                                                stroke={strokeColor}
                                                strokeWidth={0.5}
                                                vectorEffect="non-scaling-stroke"
                                                style={{ cursor: count ? 'pointer' : undefined }}
                                                onPointerEnter={() => code && setHover(code)}
                                                onPointerLeave={() => setHover(null)}
                                                onClick={() => clicked(code)}
                                            />
                                        );
                                    })}
                                    {shapes.map(({ code, point }) => {
                                        if (!point) return null;
                                        const item = byCode.get(code);
                                        if (!item) return null;
                                        const r = (2.5 + 5 * Math.sqrt(item.count / max)) / (isGlobe ? 1 : zoom);
                                        return (
                                            <g key={`dot-${code}`} transform={`translate(${point[0]} ${point[1]})`} style={{ cursor: 'pointer' }} onPointerEnter={() => setHover(code)} onPointerLeave={() => setHover(null)} onClick={() => clicked(code)}>
                                                {item.week > 0 && !reduced && (
                                                    <circle r={r} fill="none" stroke={base} strokeWidth={1.5} vectorEffect="non-scaling-stroke" style={{ transformBox: 'fill-box', transformOrigin: 'center', animation: `${pulse} 2.2s ease-out infinite` }} />
                                                )}
                                                <circle r={r} fill={alpha(base, 0.85)} stroke={theme.palette.background.paper} strokeWidth={1} vectorEffect="non-scaling-stroke" />
                                            </g>
                                        );
                                    })}
                                </g>
                            </svg>
                        )}
                    </Box>
                    {hovered && (
                        <Box
                            role="status"
                            sx={{ position: 'absolute', top: 8, left: 8, px: 1.25, py: 0.75, borderRadius: 1.5, bgcolor: alpha(theme.palette.background.paper, 0.92), border: 1, borderColor: 'divider', pointerEvents: 'none' }}
                        >
                            <Typography variant="body2" sx={{ fontWeight: 700 }}>
                                {isoToFlag(hovered.code)} {hovered.name}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                                {hovered.count ? `${hovered.count.toLocaleString('en-GB')} ${unit}` : `No ${unit}`}
                            </Typography>
                        </Box>
                    )}
            </Box>

            <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', gap: 1, mt: 0.75, flexWrap: 'wrap' }}>
                <Stack component="ol" direction="row" aria-label={`Top countries by ${unit}`} sx={{ listStyle: 'none', m: 0, p: 0, gap: 0.75, flexWrap: 'wrap', minWidth: 0 }}>
                    {ranking.slice(0, TOP).map((v) => (
                        <li key={v.code}>
                            <ButtonBase
                                onClick={() => open(v.code)}
                                onPointerEnter={() => setHover(v.code)}
                                onPointerLeave={() => setHover(null)}
                                onFocus={() => setHover(v.code)}
                                onBlur={() => setHover(null)}
                                sx={{ gap: 0.75, py: 0.25, px: 0.875, borderRadius: 1, border: 1, borderColor: 'divider', bgcolor: hover === v.code ? 'action.hover' : 'transparent' }}
                            >
                                <span aria-hidden>{isoToFlag(v.code)}</span>
                                <Typography variant="body2" noWrap>
                                    {countryName(v.code)}
                                </Typography>
                                <Typography variant="body2" sx={{ fontWeight: 700 }}>
                                    {v.count.toLocaleString('en-GB')}
                                </Typography>
                                {v.week > 0 && period === 'all' && (
                                    <Tooltip title={`${v.week} new in the last 7 days`}>
                                        <Typography variant="caption" color="primary" sx={{ fontWeight: 600 }}>
                                            +{v.week}
                                        </Typography>
                                    </Tooltip>
                                )}
                            </ButtonBase>
                        </li>
                    ))}
                </Stack>
                <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }} aria-hidden>
                    <Typography variant="caption" color="text.secondary">
                        Fewer
                    </Typography>
                    {Array.from({ length: STEPS }, (_, i) => (
                        <Box key={i} sx={{ width: 14, height: 8, borderRadius: 0.5, bgcolor: tint(i) }} />
                    ))}
                    <Typography variant="caption" color="text.secondary">
                        More
                    </Typography>
                </Stack>
            </Stack>
        </Box>
    );
}

export const WorldMap = memo(WorldMapView);
