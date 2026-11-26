import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { forceCollide, forceX, forceY } from 'd3-force';
import { alpha, Box, Skeleton, ToggleButton, ToggleButtonGroup, Tooltip, Typography, useTheme } from '@mui/material';
import BubbleChartOutlined from '@mui/icons-material/BubbleChartOutlined';
import CloudOutlined from '@mui/icons-material/CloudOutlined';
import { Wordcloud } from '@visx/wordcloud';
import ForceGraph2D, { type ForceGraphMethods, type LinkObject, type NodeObject } from 'react-force-graph-2d';
import { useWidth } from '../../../lib/useWidth';
import { HEAT_LABEL, type Heat, heatOf, heatSentence } from '../heat';
import { useHeatColors } from '../heatColors';
import { useWordGraph } from '../hooks';
import type { Word } from '../types';

export type CloudWord = Pick<Word, 'id' | 'name' | 'occurrences' | 'mentions_24h' | 'mentions_week'>;

/** What sizes the words: the articles of the week ("now") or of the whole life of the word ("all"). */
export type CloudSize = 'now' | 'all';

// Same seed every time: a given set of words always gets the same layout, so the cloud does not reshuffle on refresh.
function seeded() {
    let s = 7;
    return () => {
        s = (s * 16807) % 2147483647;
        return (s - 1) / 2147483646;
    };
}

const FONT = '"Inter Variable", Inter, system-ui, sans-serif';

interface CloudProps {
    words: CloudWord[];
    onOpen: (id: number) => void;
    activeId?: number | null;
    height: number;
    size: CloudSize;
}

const LEGEND: Heat[] = ['hot', 'rising', 'new', 'steady', 'fading'];

/** What the colours of the cloud mean. */
function Legend() {
    const colors = useHeatColors();
    return (
        <Box data-testid="cloud-legend" sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, mt: 0.5, color: 'text.secondary', fontSize: 12 }}>
            {LEGEND.map((heat) => (
                <Box key={heat} component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                    <Box component="span" sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: colors[heat] }} />
                    {HEAT_LABEL[heat]}
                </Box>
            ))}
        </Box>
    );
}

/** The words, sized by what they are talked about (the week, or all time), coloured by their heat. Each word is a button. */
function Cloud({ words, onOpen, activeId, height, size }: CloudProps) {
    const theme = useTheme();
    const colors = useHeatColors();
    const [ref, width] = useWidth<HTMLDivElement>();
    const weight = (w: CloudWord) => (size === 'now' ? w.mentions_week : w.occurrences);
    const counts = words.map(weight);
    const min = Math.min(...counts);
    const max = Math.max(...counts);
    const t = (n: number) => (max === min ? 0.5 : (n - min) / (max - min));
    const data = useMemo(() => words.map((w) => ({ text: w.name, value: size === 'now' ? w.mentions_week : w.occurrences, id: w.id })), [words, size]);
    const byName = new Map(words.map((w) => [w.name, w]));
    const ink = theme.palette.text.primary;
    const key = (e: KeyboardEvent, id: number) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onOpen(id);
        }
    };

    return (
        <Box ref={ref} sx={{ width: '100%' }} data-testid="word-cloud">
          <Box sx={{ height, width: '100%' }}>
            {width > 0 && (
                <svg width={width} height={height} role="group" aria-label="Most mentioned words">
                    <Wordcloud
                        words={data}
                        width={width}
                        height={height}
                        font={FONT}
                        fontWeight={(d) => (t(d.value) > 0.5 ? 700 : 500)}
                        fontSize={(d) => 13 + Math.sqrt(t(d.value)) * Math.min(42, height / 6)}
                        padding={3}
                        spiral="archimedean"
                        rotate={0}
                        random={seeded()}
                    >
                        {(placed) =>
                            placed.map((w) => {
                                const word = byName.get(w.text ?? '');
                                if (!word) return null;
                                const active = word.id === activeId;
                                const strength = t(weight(word));
                                const heat = heatOf(word);
                                const tint = heat === 'steady' ? alpha(ink, 0.55 + strength * 0.4) : colors[heat];
                                return (
                                    <Tooltip key={word.id} title={`${word.name} - ${HEAT_LABEL[heat]}: ${heatSentence(word)}`} placement="top" arrow>
                                    <text
                                        role="button"
                                        tabIndex={0}
                                        aria-label={`${word.name}, ${HEAT_LABEL[heat]}, ${heatSentence(word)}`}
                                        data-heat={heat}
                                        aria-pressed={active}
                                        onClick={() => onOpen(word.id)}
                                        onKeyDown={(e) => key(e, word.id)}
                                        textAnchor="middle"
                                        transform={`translate(${w.x}, ${w.y})`}
                                        fontSize={w.size}
                                        fontFamily={FONT}
                                        fontWeight={strength > 0.5 || heat === 'hot' ? 700 : 500}
                                        // The size says how much it is talked about, the colour how hot it is; the open word is underlined.
                                        fill={tint}
                                        textDecoration={active ? 'underline' : undefined}
                                        style={{ cursor: 'pointer', outline: 'none' }}
                                        className="cloud-word"
                                    >
                                        {w.text}
                                    </text>
                                    </Tooltip>
                                );
                            })
                        }
                    </Wordcloud>
                    <style>{`.cloud-word:hover, .cloud-word:focus-visible { fill: ${theme.palette.primary.dark}; text-decoration: underline; }`}</style>
                </svg>
            )}
          </Box>
          <Legend />
        </Box>
    );
}

type GraphNode = NodeObject<{ id: number; name: string; occurrences: number }>;

/** Words linked when the same articles mention them (issue #334): a big word with many links is a story. */
function Graph({ period, onOpen, activeId, height }: { period: string; onOpen: (id: number) => void; activeId?: number | null; height: number }) {
    const theme = useTheme();
    const [ref, width] = useWidth<HTMLDivElement>();
    const graphRef = useRef<ForceGraphMethods<GraphNode, LinkObject<GraphNode, { weight: number }>> | undefined>(undefined);
    const { data, isPending } = useWordGraph(period);
    // Only the words that share articles with another one (the others are in the cloud), copied: the simulation mutates them.
    const graphData = useMemo(() => {
        const linked = new Set(data?.links.flatMap((l) => [l.source, l.target]) ?? []);
        return { nodes: data?.nodes.filter((n) => linked.has(n.id)).map((n) => ({ ...n })) ?? [], links: data?.links.map((l) => ({ ...l })) ?? [] };
    }, [data]);
    const hidden = (data?.nodes.length ?? 0) - graphData.nodes.length;
    const max = Math.max(1, ...graphData.nodes.map((n) => n.occurrences));
    const maxWeight = Math.max(1, ...graphData.links.map((l) => l.weight));
    const primary = theme.palette.primary.main;
    const ink = theme.palette.text.primary;

    const radius = (occurrences: number) => 4 + 10 * Math.sqrt(occurrences / max);

    // Words push each other away and never overlap (room for their label), links pull related words together.
    useEffect(() => {
        const graph = graphRef.current;
        if (!graph || !graphData.nodes.length) return;
        graph.d3Force('charge')?.strength?.(-140);
        // A light pull to the centre keeps the separate groups of words on one screen.
        graph.d3Force('x', forceX<GraphNode>(0).strength(0.12));
        graph.d3Force('y', forceY<GraphNode>(0).strength(0.12));
        graph.d3Force('collide', forceCollide<GraphNode>((n) => radius(n.occurrences) + 22));
        graph.d3ReheatSimulation();
        // eslint-disable-next-line react-hooks/exhaustive-deps -- radius only depends on max, which follows graphData
    }, [graphData, width]);

    if (isPending) return <Skeleton variant="rounded" height={height} />;
    if (!graphData.links.length) {
        return (
            <Box sx={{ height, display: 'grid', placeItems: 'center' }}>
                <Typography variant="body2" color="text.secondary">
                    No two trending words share an article yet.
                </Typography>
            </Box>
        );
    }
    return (
        <Box ref={ref} sx={{ height, width: '100%' }} data-testid="word-graph" role="img" aria-label={`Graph of ${graphData.nodes.length} words and ${graphData.links.length} links between them`}
            title={hidden ? `${hidden} words that share no article with another are only in the cloud` : undefined}
        >
            {width > 0 && (
                <ForceGraph2D
                    ref={graphRef}
                    width={width}
                    height={height}
                    graphData={graphData}
                    backgroundColor="transparent"
                    cooldownTicks={120}
                    onEngineStop={() => graphRef.current?.zoomToFit(300, 24)}
                    linkColor={() => alpha(ink, 0.18)}
                    linkWidth={(l) => 0.5 + (2.5 * (l as { weight: number }).weight) / maxWeight}
                    nodeLabel={(n) => `${n.name} - ${n.occurrences} mentions`}
                    onNodeClick={(n) => onOpen(Number(n.id))}
                    nodeCanvasObject={(node, ctx, scale) => {
                        const n = node as GraphNode;
                        const r = radius(n.occurrences);
                        const active = Number(n.id) === activeId;
                        ctx.beginPath();
                        ctx.arc(n.x ?? 0, n.y ?? 0, r, 0, 2 * Math.PI);
                        ctx.fillStyle = active ? theme.palette.primary.dark : alpha(primary, 0.35 + 0.6 * (n.occurrences / max));
                        ctx.fill();
                        const fontSize = Math.max(10, 11 + 6 * (n.occurrences / max)) / scale;
                        ctx.font = `${n.occurrences / max > 0.5 ? 700 : 500} ${fontSize}px ${FONT}`;
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'top';
                        ctx.fillStyle = ink;
                        ctx.fillText(n.name, n.x ?? 0, (n.y ?? 0) + r + 2 / scale);
                    }}
                    nodePointerAreaPaint={(node, color, ctx) => {
                        const n = node as GraphNode;
                        ctx.fillStyle = color;
                        ctx.beginPath();
                        ctx.arc(n.x ?? 0, n.y ?? 0, radius(n.occurrences) + 4, 0, 2 * Math.PI);
                        ctx.fill();
                    }}
                />
            )}
        </Box>
    );
}

interface WordVizProps {
    /** Words of the cloud (the graph loads its own, with their links). */
    words: CloudWord[];
    /** Period of the words (`''`, today, 7d, 30d), for the graph. */
    period?: string;
    onOpen: (id: number) => void;
    activeId?: number | null;
    height?: number;
    loading?: boolean;
    /** What sizes the words of the cloud. */
    size?: CloudSize;
}

/** The trending words as a cloud, or as a graph of the words the same articles talk about. */
export function WordViz({ words, period = '', onOpen, activeId, height = 300, loading = false, size = 'now' }: WordVizProps) {
    const [mode, setMode] = useState<'cloud' | 'graph'>(() => {
        try {
            return localStorage.getItem('watcher.words.view') === 'graph' ? 'graph' : 'cloud';
        } catch {
            return 'cloud';
        }
    });
    const choose = (next: 'cloud' | 'graph' | null) => {
        if (!next) return;
        setMode(next);
        try {
            localStorage.setItem('watcher.words.view', next);
        } catch {
            // Storage blocked: the choice lasts for this visit.
        }
    };
    return (
        <Box sx={{ position: 'relative' }}>
            <ToggleButtonGroup size="small" exclusive value={mode} onChange={(_, v) => choose(v)} aria-label="Word view" sx={{ position: 'absolute', top: -44, right: 0 }}>
                <ToggleButton value="cloud" aria-label="Word cloud" title="Word cloud" sx={{ px: 1.25 }}>
                    <CloudOutlined fontSize="small" />
                </ToggleButton>
                <ToggleButton value="graph" aria-label="Words linked by their articles" title="Words linked by their articles" sx={{ px: 1.25 }}>
                    <BubbleChartOutlined fontSize="small" />
                </ToggleButton>
            </ToggleButtonGroup>
            {loading ? (
                <Skeleton variant="rounded" height={height} />
            ) : mode === 'cloud' ? (
                <Cloud words={words} onOpen={onOpen} activeId={activeId} height={height} size={size} />
            ) : (
                <Graph period={period} onOpen={onOpen} activeId={activeId} height={height} />
            )}
        </Box>
    );
}
