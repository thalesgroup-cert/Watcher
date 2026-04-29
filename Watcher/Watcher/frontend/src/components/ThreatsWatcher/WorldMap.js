import React, {
    useState, useEffect, useMemo, useCallback, useRef, Fragment,
} from 'react';
import { connect } from 'react-redux';
import {
    DeckGL, GeoJsonLayer, ScatterplotLayer,
    TileLayer, BitmapLayer,
    _GlobeView, MapView,
} from 'deck.gl';
import { feature } from 'topojson-client';
import { getSources } from '../../actions/WorldMap';
import { getRansomwareVictims } from '../../actions/CyberWatch';
import { isoToGeoName, GEO_TO_ISO, buildCountryCountMap, isoToFlag } from '../../utils/isoCountries';


const BASEMAPS = {
    dark: {
        label: 'Dark',
        emoji: '🌑',
        url: 'https://a.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}.png',
        bg: '#0d1117',
        isLight: false,
        polyFill:   [18, 30,  52,  255],
        polyStroke: [80, 110, 160,  90],
    },
    positron: {
        label: 'Light',
        emoji: '☀️',
        url: 'https://a.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}.png',
        bg: '#f0f4f8',
        isLight: true,
        polyFill:   [190, 210, 235, 200],
        polyStroke: [100, 130, 160, 120],
    },
    satellite: {
        label: 'Satellite',
        emoji: '🛰',
        url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        bg: '#020609',
        isLight: false,
        polyFill:   [0, 0, 0, 0],
        polyStroke: [255, 255, 255, 55],
    },
};


const DOT = {
    sources:  { fill: [59,  130, 246, 220], stroke: [255, 255, 255, 50], hex: '#3b82f6' },
    trending: { fill: [34,  211, 238, 220], stroke: [255, 255, 255, 50], hex: '#22d3ee' },
    victims:  { fill: [239, 68,  68,  220], stroke: [255, 255, 255, 50], hex: '#ef4444' },
};

const INITIAL_VIEW_STATE = { longitude: 10, latitude: 20, zoom: 1.2, pitch: 0, bearing: 0 };


function extractDomain(url) {
    try {
        const hostname = new URL(url).hostname.replace(/^www\./, '').toLowerCase();
        const parts = hostname.split('.');
        if (
            parts.length >= 3 &&
            ['co','com','gov','org','net','edu','ac'].includes(parts[parts.length - 2])
        ) return parts.slice(-3).join('.');
        return parts.slice(-2).join('.');
    } catch { return ''; }
}

function clamp(v, lo, hi) { return Math.min(Math.max(v, lo), hi); }

/**
 * Returns the center of the LARGEST polygon in the feature (by bbox area).
 * This prevents overseas territories (French Guiana, Alaska islands, etc.)
 * from skewing the centroid of the metropolitan country.
 */
function getFeatureCenter(geometry) {
    if (!geometry?.coordinates) return null;
    const polys =
        geometry.type === 'Polygon'      ? [geometry.coordinates] :
        geometry.type === 'MultiPolygon' ? geometry.coordinates   : [];
    if (!polys.length) return null;

    let best = null;
    let bestArea = -Infinity;
    polys.forEach(poly => {
        let [mnLng, mnLat, mxLng, mxLat] = [Infinity, Infinity, -Infinity, -Infinity];
        poly.forEach(ring => ring.forEach(([lng, lat]) => {
            if (!Number.isFinite(lng) || !Number.isFinite(lat)) return;
            if (lng < mnLng) mnLng = lng; if (lat < mnLat) mnLat = lat;
            if (lng > mxLng) mxLng = lng; if (lat > mxLat) mxLat = lat;
        }));
        if (![mnLng, mnLat, mxLng, mxLat].every(Number.isFinite)) return;
        const area = (mxLng - mnLng) * (mxLat - mnLat);
        if (area > bestArea) { bestArea = area; best = [mnLng, mnLat, mxLng, mxLat]; }
    });
    if (!best) return null;
    return [clamp((best[0] + best[2]) / 2, -179, 179), clamp((best[1] + best[3]) / 2, -80, 82)];
}

function buildCenters(geoJson) {
    if (!geoJson?.features) return {};
    const out = {};
    geoJson.features.forEach(f => {
        const n = f.properties?.name;
        if (!n) return;
        const c = getFeatureCenter(f.geometry);
        if (c) out[n] = c;
    });
    return out;
}

function buildWordsPerCC(sources, leads) {
    const dom = {};
    (sources || []).forEach(s => {
        if (!s.country_code) return;
        const d = extractDomain(s.url);
        if (d) dom[d] = s.country_code;
    });
    const out = {};
    (leads || []).forEach(word => {
        const seen = new Set();
        (word.posturls || []).forEach(ps => {
            const url = typeof ps === 'string' ? ps.split(',')[0] : (ps.url || '');
            const cc = dom[extractDomain(url)];
            if (!cc || seen.has(cc)) return;
            seen.add(cc);
            if (!out[cc]) out[cc] = [];
            out[cc].push({ name: word.name, score: word.score || 0 });
        });
    });
    return out;
}


const pill = (extra = {}) => ({
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    background: 'rgba(10,12,20,0.72)',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    border: '1px solid rgba(255,255,255,0.09)',
    borderRadius: 6,
    color: '#d6dce8',
    fontSize: '0.71rem',
    ...extra,
});


function WorldMap({
    sources, leads, ransomwareVictims,
    getSources, getRansomwareVictims,
    onCountrySelect, embedded,
}) {
    const [viewState, setViewState]     = useState(INITIAL_VIEW_STATE);
    const [geoJson, setGeoJson]         = useState(null);
    const [basemap, setBasemap]         = useState('dark');
    const [globeMode, setGlobeMode]     = useState(false);
    const [selectedIso, setSelectedIso] = useState(null);
    const [hoveredInfo, setHoveredInfo] = useState(null);
    const [visible, setVisible]         = useState({ sources: true, trending: true, victims: true });
    const [panelOpen, setPanelOpen]     = useState(true);

    const containerRef = useRef(null);
    const bm = BASEMAPS[basemap];

    useEffect(() => {
        getSources();
        if (!ransomwareVictims.length) getRansomwareVictims();
        fetch('/static/countries-110m.json')
            .then(r => r.json())
            .then(topo => {
                const geo = feature(topo, topo.objects.countries);
                geo.features = geo.features.filter(f => f.properties?.name !== 'Antarctica');
                setGeoJson(geo);
            })
            .catch(err => console.error('[WorldMap] GeoJSON load failed:', err));
    }, []);

    const centers    = useMemo(() => buildCenters(geoJson), [geoJson]);
    const wordsByCC  = useMemo(() => buildWordsPerCC(sources, leads), [sources, leads]);

    const sourceCountByGeo = useMemo(() => {
        const m = {};
        (sources || []).forEach(s => {
            if (!s.country_code) return;
            const g = isoToGeoName(s.country_code);
            if (g) m[g] = (m[g] || 0) + 1;
        });
        return m;
    }, [sources]);

    const trendingCountByGeo = useMemo(() => {
        const m = {};
        Object.entries(wordsByCC).forEach(([cc, words]) => {
            const g = isoToGeoName(cc);
            if (g) m[g] = words.length;
        });
        return m;
    }, [wordsByCC]);

    const victimCountByGeo = useMemo(
        () => buildCountryCountMap(ransomwareVictims || [], 'country'),
        [ransomwareVictims]
    );

    const toScatter = useCallback((countMap, extra = {}) =>
        Object.entries(countMap)
            .map(([geo, count]) => ({ position: centers[geo], count, geoName: geo, iso: GEO_TO_ISO[geo] || null, ...extra }))
            .filter(d => d.position),
    [centers]);

    const sourcesData  = useMemo(() => toScatter(sourceCountByGeo),  [toScatter, sourceCountByGeo]);
    const trendingData = useMemo(() => toScatter(trendingCountByGeo).map(d => ({
        ...d, words: d.iso ? (wordsByCC[d.iso] || []) : [],
    })), [toScatter, trendingCountByGeo, wordsByCC]);
    const victimsData  = useMemo(() => toScatter(victimCountByGeo),  [toScatter, victimCountByGeo]);

    const buildPayload = useCallback(geoName => {
        const iso = GEO_TO_ISO[geoName] || null;
        return {
            geoName, iso,
            sourceCount:   sourceCountByGeo[geoName]   || 0,
            trendingCount: trendingCountByGeo[geoName] || 0,
            victimCount:   victimCountByGeo[geoName]   || 0,
            words: iso ? (wordsByCC[iso] || []).slice(0, 8) : [],
        };
    }, [sourceCountByGeo, trendingCountByGeo, victimCountByGeo, wordsByCC]);

    const onGeoHover    = useCallback(info => {
        const n = info.object?.properties?.name;
        setHoveredInfo(n ? { x: info.x, y: info.y, ...buildPayload(n) } : null);
    }, [buildPayload]);

    const onDotHover    = useCallback(info => {
        const d = info.object;
        setHoveredInfo(d ? { x: info.x, y: info.y, ...buildPayload(d.geoName) } : null);
    }, [buildPayload]);

    const onGeoClick    = useCallback(info => {
        const n = info.object?.properties?.name;
        if (!n) return;
        const iso  = GEO_TO_ISO[n] || null;
        const next = selectedIso === iso ? null : iso;
        setSelectedIso(next);
        if (onCountrySelect) onCountrySelect(next);
    }, [selectedIso, onCountrySelect]);

    const onDotClick    = useCallback(info => {
        const d = info.object;
        if (!d?.iso) return;
        const next = selectedIso === d.iso ? null : d.iso;
        setSelectedIso(next);
        if (onCountrySelect) onCountrySelect(next);
    }, [selectedIso, onCountrySelect]);

    const zoomBy        = delta => setViewState(vs => ({ ...vs, zoom: clamp(vs.zoom + delta, 0.3, 12) }));
    const toggleLayer   = key   => setVisible(v => ({ ...v, [key]: !v[key] }));

    const deckView = useMemo(() =>
        globeMode
            ? new _GlobeView({ id: 'globe', repeat: true })

            : new MapView({ id: 'map', repeat: true }),
    [globeMode]);

    const deckLayers = useMemo(() => {
        const hovGeo  = hoveredInfo?.geoName ?? null;
        const selGeo  = selectedIso
            ? (Object.keys(GEO_TO_ISO).find(k => GEO_TO_ISO[k] === selectedIso) || null)
            : null;

        const tileLayer = new TileLayer({
            id: 'basemap-tiles',
            data: bm.url,
            minZoom: 0,
            maxZoom: 19,
            tileSize: 256,
            renderSubLayers: props => {
                const { west, south, east, north } = props.tile.bbox;
                return new BitmapLayer(props, {
                    data: null,
                    image: props.data,
                    bounds: [west, south, east, north],
                });
            },
        });

        const countryLayer = geoJson ? new GeoJsonLayer({
            id: 'countries',
            data: geoJson,
            pickable: true,
            filled: true,
            stroked: true,
            wrapLongitude: true,
            getFillColor: f => {
                const n = f.properties?.name;
                if (n && n === selGeo)  return [251, 191, 36, 90];
                if (n && n === hovGeo)  return bm.isLight ? [80, 120, 200, 80] : [100, 150, 240, 70];
                return bm.polyFill;
            },
            getLineColor: f => {
                const n = f.properties?.name;
                if (n && n === selGeo) return [251, 191, 36, 255];
                return bm.polyStroke;
            },
            lineWidthMinPixels: 0.6,
            onHover: onGeoHover,
            onClick: onGeoClick,
            updateTriggers: {
                getFillColor: [hovGeo, selGeo, basemap],
                getLineColor: [selGeo, basemap],
            },
        }) : null;

        const selectionGlow = (geoJson && selGeo) ? new GeoJsonLayer({
            id: 'country-sel-glow',
            data: {
                type: 'FeatureCollection',
                features: geoJson.features.filter(f => f.properties?.name === selGeo),
            },
            filled: false,
            stroked: true,
            getLineColor: [251, 191, 36, 255],
            lineWidthMinPixels: 2.5,
            lineWidthMaxPixels: 4,
            pickable: false,
        }) : null;

        const sourcesLayer = new ScatterplotLayer({
            id: 'scatter-sources',
            data: sourcesData,
            visible: visible.sources,
            pickable: true,
            getPosition: d => d.position,
            getRadius: d => clamp(5 + Math.sqrt(d.count) * 3, 5, 22),
            radiusUnits: 'pixels',
            getFillColor: DOT.sources.fill,
            getLineColor: DOT.sources.stroke,
            lineWidthMinPixels: 0.8,
            stroked: true,
            onHover: onDotHover,
            onClick: onDotClick,
        });

        const trendingLayer = new ScatterplotLayer({
            id: 'scatter-trending',
            data: trendingData,
            visible: visible.trending,
            pickable: true,
            getPosition: d => d.position,
            getRadius: d => clamp(6 + Math.sqrt(d.count) * 3.5, 6, 26),
            radiusUnits: 'pixels',
            getFillColor: DOT.trending.fill,
            getLineColor: DOT.trending.stroke,
            lineWidthMinPixels: 0.8,
            stroked: true,
            onHover: onDotHover,
            onClick: onDotClick,
        });

        const victimsLayer = new ScatterplotLayer({
            id: 'scatter-victims',
            data: victimsData,
            visible: visible.victims,
            pickable: true,
            getPosition: d => d.position,
            getRadius: d => clamp(5 + Math.sqrt(d.count) * 4, 5, 30),
            radiusUnits: 'pixels',
            getFillColor: DOT.victims.fill,
            getLineColor: DOT.victims.stroke,
            lineWidthMinPixels: 0.8,
            stroked: true,
            onHover: onDotHover,
            onClick: onDotClick,
        });

        return [
            tileLayer,
            ...(countryLayer ? [countryLayer] : []),
            sourcesLayer,
            trendingLayer,
            victimsLayer,
            ...(selectionGlow ? [selectionGlow] : []),
        ];
    }, [
        geoJson, bm, basemap,
        hoveredInfo, selectedIso,
        visible,
        sourcesData, trendingData, victimsData,
        onGeoHover, onGeoClick, onDotHover, onDotClick,
    ]);

    const sourcesCount   = (sources || []).filter(s => s.country_code).length;
    const trendCount = (leads   || []).length;
    const vicCount   = (ransomwareVictims || []).length;

    const mapContent = (
        <div
            ref={containerRef}
            style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', background: bm.bg }}
        >
            <DeckGL
                views={deckView}
                viewState={viewState}
                onViewStateChange={({ viewState: vs }) => setViewState(vs)}
                controller={true}
                layers={deckLayers}
                style={{ width: '100%', height: '100%' }}
                getCursor={({ isDragging }) => isDragging ? 'grabbing' : (hoveredInfo ? 'pointer' : 'grab')}
            />

            <div className="card shadow-sm border-0" style={{ position: 'absolute', top: 10, left: 10, zIndex: 60 }}>
                <div className="card-body py-1 px-2 d-flex align-items-center gap-2" style={{ fontSize: '0.78rem', whiteSpace: 'nowrap' }}>
                    <span title="RSS Sources" className="d-flex align-items-center gap-1">
                        <span style={{ color: DOT.sources.hex }}>●</span>
                        <strong>{sourcesCount}</strong>
                        <span className="text-muted">sources</span>
                    </span>
                    <span className="text-muted">│</span>
                    <span title="Trending words" className="d-flex align-items-center gap-1">
                        <span style={{ color: DOT.trending.hex }}>●</span>
                        <strong>{trendCount}</strong>
                        <span className="text-muted">trends</span>
                    </span>
                    <span className="text-muted">│</span>
                    <span title="Ransomware victims" className="d-flex align-items-center gap-1">
                        <span style={{ color: DOT.victims.hex }}>●</span>
                        <strong>{vicCount}</strong>
                        <span className="text-muted">victims</span>
                    </span>
                </div>
            </div>

            <div className="card border-secondary shadow" style={{ position: 'absolute', top: 10, right: 10, zIndex: 60, minWidth: 140 }}>
                {/* Toggle */}
                <button
                    className="btn btn-sm btn-secondary w-100 d-flex align-items-center justify-content-between border-0 border-bottom rounded-bottom-0"
                    onClick={() => setPanelOpen(o => !o)}
                    title={panelOpen ? 'Collapse' : 'Expand'}
                    style={{ fontSize: '0.75rem' }}
                >
                    <span className="text-white-50">Controls</span>
                    <i className="material-icons" style={{ fontSize: '0.9rem' }}>{panelOpen ? 'expand_less' : 'expand_more'}</i>
                </button>
                {panelOpen && (
                    <div className="card-body p-2" style={{ fontSize: '0.75rem' }}>
                        {/* Basemap */}
                        <div className="text-uppercase text-white-50 mb-1" style={{ fontSize: '0.62rem', letterSpacing: '0.06em' }}>Basemap</div>
                        <div className="d-flex flex-column gap-1 mb-2">
                            {Object.entries(BASEMAPS).map(([key, b]) => (
                                <button
                                    key={key}
                                    onClick={() => setBasemap(key)}
                                    className={`btn btn-sm text-start d-flex align-items-center gap-1 ${basemap === key ? 'btn-primary' : 'btn-outline-light'}`}
                                    style={{ fontSize: '0.72rem', padding: '2px 8px' }}
                                >
                                    <span>{b.emoji}</span> {b.label}
                                </button>
                            ))}
                        </div>

                        <hr className="my-1 border-secondary" />

                        {/* Projection */}
                        <div className="text-uppercase text-white-50 mb-1" style={{ fontSize: '0.62rem', letterSpacing: '0.06em' }}>Projection</div>
                        <div className="btn-group w-100 mb-2" role="group">
                            {[
                                { key: false, icon: '🗾', label: 'Flat'  },
                                { key: true,  icon: '🌐', label: 'Globe' },
                            ].map(opt => (
                                <button
                                    key={String(opt.key)}
                                    onClick={() => setGlobeMode(opt.key)}
                                    className={`btn btn-sm ${globeMode === opt.key ? 'btn-primary' : 'btn-outline-light'}`}
                                    style={{ fontSize: '0.72rem', padding: '2px 4px' }}
                                >
                                    {opt.icon} {opt.label}
                                </button>
                            ))}
                        </div>

                        <hr className="my-1 border-secondary" />

                        {/* Layer toggles */}
                        <div className="text-uppercase text-white-50 mb-1" style={{ fontSize: '0.62rem', letterSpacing: '0.06em' }}>Layers</div>
                        <div className="d-flex flex-column gap-1 mb-2">
                            {[
                                { key: 'sources',  label: 'Sources',  dot: DOT.sources },
                                { key: 'trending', label: 'Trends',   dot: DOT.trending },
                                { key: 'victims',  label: 'Victims',  dot: DOT.victims },
                            ].map(({ key, label, dot }) => (
                                <button
                                    key={key}
                                    onClick={() => toggleLayer(key)}
                                    className={`btn btn-sm text-start d-flex align-items-center gap-2 ${visible[key] ? 'btn-outline-light' : 'btn-secondary text-white-50'}`}
                                    style={{ fontSize: '0.72rem', padding: '2px 8px' }}
                                >
                                    <span style={{
                                        width: 10, height: 10, borderRadius: '50%', flexShrink: 0,
                                        background: visible[key] ? dot.hex : 'transparent',
                                        border: `2px solid ${dot.hex}`,
                                        display: 'inline-block',
                                    }} />
                                    {label}
                                </button>
                            ))}
                        </div>

                        <hr className="my-1 border-secondary" />

                        {/* Reset */}
                        <button
                            onClick={() => setViewState(INITIAL_VIEW_STATE)}
                            className="btn btn-sm btn-outline-light w-100 d-flex align-items-center justify-content-center gap-1"
                            style={{ fontSize: '0.72rem', padding: '2px 8px' }}
                        >
                            <i className="material-icons" style={{ fontSize: '0.9rem' }}>home</i> Reset view
                        </button>
                    </div>
                )}
            </div>

            <div className="btn-group-vertical shadow-sm" style={{ position: 'absolute', bottom: 24, right: 10, zIndex: 60 }}>
                {[{ delta: +0.8, label: '+', title: 'Zoom in' }, { delta: -0.8, label: '−', title: 'Zoom out' }].map(({ delta, label, title }) => (
                    <button
                        key={label}
                        title={title}
                        onClick={() => zoomBy(delta)}
                        className="btn btn-sm btn-light"
                        style={{ width: 32, fontWeight: 400, fontSize: '1rem' }}
                    >{label}</button>
                ))}
            </div>

            {selectedIso && (
                <div className="card shadow-sm border-warning d-flex flex-row align-items-center gap-2 px-2 py-1" style={{ position: 'absolute', bottom: 24, left: 10, zIndex: 60 }}>
                    <span style={{ fontSize: '0.9rem' }}>{isoToFlag(selectedIso)}</span>
                    <span className="fw-semibold" style={{ fontSize: '0.78rem' }}>{selectedIso}</span>
                    <button
                        onClick={() => { setSelectedIso(null); if (onCountrySelect) onCountrySelect(null); }}
                        title="Deselect"
                        className="btn-close btn-close-sm ms-1"
                        style={{ fontSize: '0.55rem' }}
                        aria-label="Deselect country"
                    />
                </div>
            )}

            {hoveredInfo && (
                <div style={{
                    ...pill({
                        flexDirection: 'column',
                        alignItems: 'flex-start',
                        padding: '9px 13px',
                        gap: 5,
                        background: 'rgba(8,12,25,0.88)',
                        border: '1px solid rgba(255,255,255,0.12)',
                        minWidth: 170,
                        maxWidth: 240,
                    }),
                    position: 'absolute',
                    left: hoveredInfo.x + 16,
                    top: hoveredInfo.y - 12,
                    zIndex: 1000,
                    pointerEvents: 'none',
                    boxShadow: '0 8px 32px rgba(0,0,0,0.55)',
                }}>
                    <div style={{ fontWeight: 700, color: '#f1f5f9', fontSize: '0.82rem', marginBottom: 3 }}>
                        {hoveredInfo.iso ? <span style={{ marginRight: 5 }}>{isoToFlag(hoveredInfo.iso)}</span> : null}
                        {hoveredInfo.geoName}
                    </div>

                    {hoveredInfo.sourceCount > 0 && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                            <span style={{ width: 8, height: 8, borderRadius: '50%', background: DOT.sources.hex, flexShrink: 0 }} />
                            <span style={{ color: '#9ca3af' }}>
                                <strong style={{ color: '#d1d5db' }}>{hoveredInfo.sourceCount}</strong>
                                {' '}RSS source{hoveredInfo.sourceCount > 1 ? 's' : ''}
                            </span>
                        </div>
                    )}
                    {hoveredInfo.trendingCount > 0 && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                            <span style={{ width: 8, height: 8, borderRadius: '50%', background: DOT.trending.hex, flexShrink: 0 }} />
                            <span style={{ color: '#9ca3af' }}>
                                <strong style={{ color: '#d1d5db' }}>{hoveredInfo.trendingCount}</strong>
                                {' '}trending word{hoveredInfo.trendingCount > 1 ? 's' : ''}
                            </span>
                        </div>
                    )}
                    {hoveredInfo.victimCount > 0 && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                            <span style={{ width: 8, height: 8, borderRadius: '50%', background: DOT.victims.hex, flexShrink: 0 }} />
                            <span style={{ color: '#9ca3af' }}>
                                <strong style={{ color: '#d1d5db' }}>{hoveredInfo.victimCount}</strong>
                                {' '}ransomware victim{hoveredInfo.victimCount > 1 ? 's' : ''}
                            </span>
                        </div>
                    )}

                    {hoveredInfo.words.length > 0 && (
                        <div style={{
                            borderTop: '1px solid rgba(255,255,255,0.08)',
                            marginTop: 4, paddingTop: 5,
                            color: '#6b7280', fontSize: '0.69rem', lineHeight: 1.65,
                        }}>
                            {hoveredInfo.words.map(w => w.name).join(' · ')}
                        </div>
                    )}

                    {hoveredInfo.sourceCount === 0 && hoveredInfo.trendingCount === 0 && hoveredInfo.victimCount === 0 && (
                        <span style={{ color: '#4b5563', fontSize: '0.72rem' }}>No data</span>
                    )}
                </div>
            )}
        </div>
    );

    if (embedded) return <Fragment>{mapContent}</Fragment>;

    return (
        <Fragment>
            <div style={{ height: 'calc(100vh - 108px)', display: 'flex', flexDirection: 'column' }}>
                <div className="card shadow-sm" style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                    <div className="card-body p-0" style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                        {mapContent}
                    </div>
                </div>
            </div>
        </Fragment>
    );
}


const mapStateToProps = state => ({
    sources:           state.WorldMap.sources             || [],
    leads:             state.leads.leads                  || [],
    ransomwareVictims: state.CyberWatch.ransomwareVictims || [],
    auth:              state.auth,
});

export default connect(mapStateToProps, { getSources, getRansomwareVictims })(WorldMap);
