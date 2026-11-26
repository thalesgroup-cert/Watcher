import { type ReactNode, useLayoutEffect, useRef, useState } from 'react';
import { Link as RouterLink } from 'react-router';
import { Box, Button, Card, CardContent, Chip, Stack, Tooltip, Typography } from '@mui/material';
import ArrowForward from '@mui/icons-material/ArrowForward';
import ArticleOutlined from '@mui/icons-material/ArticleOutlined';
import CampaignOutlined from '@mui/icons-material/CampaignOutlined';
import { summaryOutline, summaryPreview, type SummarySource } from '../../../ui/SafeHtml';
import { Favicon } from './Favicon';
import { When } from '../../../ui/When';
import type { Summary } from '../types';
import { RegenerateButton } from './RegenerateButton';
import { GeneratedBadges } from './SummaryBadges';

export type Kind = 'breaking' | 'weekly';

/** The same names on Threats Watcher and on the Overview. */
export const TITLES: Record<Kind, string> = { breaking: 'Breaking news', weekly: 'This week in cyber threats' };
export const ICONS: Record<Kind, ReactNode> = {
    breaking: <CampaignOutlined color="warning" fontSize="small" />,
    weekly: <ArticleOutlined color="primary" fontSize="small" />,
};

/** The words a summary is about, as badges: five at most. */
export const summaryWords = (keywords: string) => keywords.split(',').map((k) => k.trim()).filter(Boolean).slice(0, 5);

/** Icon, title and the words a summary is about (the first ones, then "+2"): the header of the card and of the reading panel. */
export function CardTitle({ kind, summary, maxWords = 3 }: { kind: Kind; summary?: Summary; maxWords?: number }) {
    const words = summary ? summaryWords(summary.keywords) : [];
    return (
        <>
            {ICONS[kind]}
            <Typography variant="subtitle1" component="h2" sx={{ fontWeight: 700 }}>
                {TITLES[kind]}
            </Typography>
            {words.slice(0, maxWords).map((k) => (
                <Chip key={k} size="small" label={k} />
            ))}
            {words.length > maxWords && <Chip size="small" variant="outlined" label={`+${words.length - maxWords}`} title={words.slice(maxWords).join(', ')} />}
        </>
    );
}

const MIN_LINES = 3;

const SEVERITY_ORDER = ['critical', 'high', 'medium', 'low'];
const severityColor = (severity: string): 'error' | 'warning' | 'info' | 'default' => {
    const s = severity.toLowerCase();
    return s === 'critical' ? 'error' : s === 'high' ? 'warning' : s === 'medium' ? 'info' : 'default';
};

const MAX_SOURCES = 6;

/** The sites a report cites, as stacked icons: each opens an article of that site. */
function SourceStack({ sources }: { sources: SummarySource[] }) {
    if (!sources.length) return null;
    const shown = sources.slice(0, MAX_SOURCES);
    return (
        <Stack direction="row" data-testid="source-stack" sx={{ alignItems: 'center', ml: 'auto', pl: 1 }} aria-label={`Sources: ${sources.map((s) => s.host).join(', ')}`}>
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, mr: 0.75 }}>
                Sources
            </Typography>
            <Stack direction="row" sx={{ alignItems: 'center' }}>
                {shown.map((source, i) => (
                    <Tooltip key={source.host} title={source.host}>
                        <Box
                            component="a"
                            href={source.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label={`Open an article of ${source.host}`}
                            data-testid="source-icon"
                            sx={{ ml: i === 0 ? 0 : -0.75, display: 'grid', placeItems: 'center', width: 24, height: 24, borderRadius: '50%', bgcolor: 'background.paper', border: 1, borderColor: 'divider', '&:hover': { zIndex: 1, borderColor: 'primary.main' } }}
                        >
                            <Favicon host={source.host} size={14} />
                        </Box>
                    </Tooltip>
                ))}
                {sources.length > shown.length && (
                    <Typography variant="caption" color="text.secondary" sx={{ ml: 0.5 }}>
                        +{sources.length - shown.length}
                    </Typography>
                )}
            </Stack>
        </Stack>
    );
}

/**
 * Under the text of a card: what the full summary holds, so that nobody takes the first paragraph for all of it. A report
 * says how many topics it covers and how severe they are; a breaking news says its impact level.
 */
function Outline({ text }: { text: string }) {
    const { topics, impact, sources } = summaryOutline(text);
    if (topics.length) {
        const counts = new Map<string, number>();
        topics.forEach((t) => counts.set(t.severity || 'Other', (counts.get(t.severity || 'Other') ?? 0) + 1));
        const rank = (s: string) => (SEVERITY_ORDER.indexOf(s.toLowerCase()) + 1 || 99);
        const levels = Array.from(counts.entries()).sort((a, b) => rank(a[0]) - rank(b[0]));
        return (
            <Stack direction="row" data-testid="summary-outline" sx={{ alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                    {topics.length} {topics.length === 1 ? 'topic' : 'topics'} in this report
                </Typography>
                {levels.map(([level, n]) => (
                    <Chip key={level} size="small" variant="outlined" color={severityColor(level)} label={`${n} ${level}`} />
                ))}
                <SourceStack sources={sources} />
            </Stack>
        );
    }
    if (impact) {
        return (
            <Stack direction="row" data-testid="summary-outline" sx={{ alignItems: 'center', gap: 0.75 }}>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                    Threat context
                </Typography>
                <Chip size="small" variant="outlined" color={severityColor(impact)} label={`Impact: ${impact}`} />
            </Stack>
        );
    }
    return null;
}

/**
 * How many lines of text fit in the box. The card does not grow with its text: the text is cut to the room there is and
 * ends with "...", and "Read more" opens all of it.
 */
function useFitLines(content: string): [React.RefObject<HTMLDivElement | null>, React.RefObject<HTMLDivElement | null>, number, boolean] {
    const box = useRef<HTMLDivElement>(null);
    const text = useRef<HTMLDivElement>(null);
    const [lines, setLines] = useState(MIN_LINES + 2);
    // Whether the text is cut: then there is more to read than the card shows
    const [cut, setCut] = useState(false);
    useLayoutEffect(() => {
        const element = text.current;
        setCut(Boolean(element) && element!.scrollHeight > element!.clientHeight + 1);
    }, [lines, content]);
    useLayoutEffect(() => {
        const element = box.current;
        if (!element) return undefined;
        const observer = new ResizeObserver(() => {
            const line = parseFloat(getComputedStyle(text.current ?? element).lineHeight);
            if (Number.isFinite(line) && line > 0) // A few pixels are kept free: a line that is half cut is worse than one line less
            setLines(Math.max(MIN_LINES, Math.floor((element.clientHeight - 4) / line)));
        });
        observer.observe(element);
        return () => observer.disconnect();
    }, []);
    return [box, text, lines, cut];
}

interface SummaryPreviewCardProps {
    kind: Kind;
    /** Missing while there is nothing yet: `empty` is shown instead of the text. */
    summary?: Summary;
    testId: string;
    maxWords?: number;
    /** A switch above the header (the Overview shows one summary at a time). */
    toggle?: ReactNode;
    empty?: ReactNode;
    onReadMore?: () => void;
    readMoreTo?: string;
    onRegenerate?: () => void;
    regenerating?: boolean;
}

/**
 * An AI summary at a glance: who it is about, when, the beginning of it and "Read more". The same card on the Overview
 * and on Threats Watcher; on the second one it also writes the summary again.
 */
export function SummaryPreviewCard({ kind, summary, testId, maxWords = 3, toggle, empty, onReadMore, readMoreTo, onRegenerate, regenerating = false }: SummaryPreviewCardProps) {
    const [box, text, lines, cut] = useFitLines(summary?.summary_text ?? '');
    const hasMore = Boolean(summary) && (cut || summaryOutline(summary!.summary_text).more);
    return (
        <Card variant="outlined" data-testid={testId} sx={{ height: '100%', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <CardContent sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 1.25, minHeight: 0, '&:last-child': { pb: 2 } }}>
                {toggle}
                <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', gap: 1, flexWrap: 'wrap' }}>
                    <Stack direction="row" sx={{ alignItems: 'center', gap: 1, flexWrap: 'wrap', minWidth: 0 }}>
                        <CardTitle kind={kind} summary={summary} maxWords={maxWords} />
                    </Stack>
                    {summary && (
                        <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
                            <When iso={summary.created_at} inline />
                        </Typography>
                    )}
                </Stack>

                <Box ref={box} sx={{ position: 'relative', flex: 1, minHeight: `${MIN_LINES * 1.6}em`, fontSize: '0.875rem' }}>
                    {summary ? (
                        <Typography
                            ref={text}
                            variant="body2"
                            data-testid="summary-preview"
                            sx={{ position: 'absolute', inset: 0, overflow: 'hidden', display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: lines, lineHeight: 1.6 }}
                        >
                            {summaryPreview(summary.summary_text)}
                        </Typography>
                    ) : (
                        empty
                    )}
                </Box>

                {summary && <Outline text={summary.summary_text} />}

                {summary && (
                    <Stack
                        direction="row"
                        data-testid="summary-footer"
                        sx={{ alignItems: 'center', justifyContent: 'space-between', gap: 1, flexWrap: 'nowrap', pt: 1, borderTop: 1, borderColor: 'divider' }}
                    >
                        {/* One line: the badges shorten (the model first) so that "Read more" stays at the right end */}
                        <GeneratedBadges summary={summary} />
                        <Stack direction="row" sx={{ alignItems: 'center', gap: 0.5, flexShrink: 0 }}>
                            {onRegenerate && <RegenerateButton onClick={onRegenerate} pending={regenerating} writtenAt={summary.updated_at || summary.created_at} />}
                            {(onReadMore || readMoreTo) && hasMore && (
                                <Button
                                    size="small"
                                    endIcon={<ArrowForward fontSize="small" />}
                                    onClick={onReadMore}
                                    {...(readMoreTo ? { component: RouterLink, to: readMoreTo } : {})}
                                    data-testid="read-more"
                                >
                                    Read more
                                </Button>
                            )}
                        </Stack>
                    </Stack>
                )}
            </CardContent>
        </Card>
    );
}
