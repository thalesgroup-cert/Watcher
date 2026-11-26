import { type ReactNode, useState } from 'react';
import { Box, Button, IconButton, Link, Skeleton, Stack, Typography } from '@mui/material';
import Close from '@mui/icons-material/Close';
import ExpandLess from '@mui/icons-material/ExpandLess';
import ExpandMore from '@mui/icons-material/ExpandMore';
import { useUrlParams } from '../../../lib/useUrlParams';
import { SideDrawer } from '../../../ui/SideDrawer';
import { SafeHtml, isHtmlSummary } from '../../../ui/SafeHtml';
import { When } from '../../../ui/When';
import { useAuthStore } from '../../auth/store';
import { useProfile } from '../../auth/hooks';
import { useGenerating, useLatestSummary, useRegenerateBreaking, useRegenerateWeekly } from '../hooks';
import { RegenerateButton, SummaryFooter } from './RegenerateButton';
import { CardTitle, SummaryPreviewCard, type Kind } from './SummaryPreviewCard';
import { isBreakingFresh } from '../freshness';

// The summaries are plain text written by summary_manager.py. Links come as "CVE-2026-1234 (https://nvd...)", as
// markdown "[label](https://...)" or as bare URLs: they become real links, and nothing is ever read as HTML.
const LINK_RE = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)|(\S+) \((https?:\/\/[^)\s]+)\)|(https?:\/\/[^\s)]+)/g;

// RSS feeds often come HTML-escaped ("&amp;"): the summaries keep their entities, shown here as the characters.
const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const decodeEntities = (text: string) =>
    text.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (whole, code: string) => {
        if (code[0] === '#') {
            const n = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
            return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : whole;
        }
        return ENTITIES[code.toLowerCase()] ?? whole;
    });

function linkify(raw: string): ReactNode[] {
    const text = decodeEntities(raw);
    const parts: ReactNode[] = [];
    let last = 0;
    for (const m of text.matchAll(LINK_RE)) {
        const start = m.index ?? 0;
        if (start > last) parts.push(text.slice(last, start));
        const href = m[2] ?? m[4] ?? m[5];
        const label = m[1] ?? m[3] ?? href.replace(/^https?:\/\/(www\.)?/, '');
        parts.push(
            <Link key={start} href={href} target="_blank" rel="noopener noreferrer">
                {label}
            </Link>,
        );
        last = start + m[0].length;
    }
    if (last < text.length) parts.push(text.slice(last));
    return parts;
}

/** A summary paragraph with its links. */
export function SummaryText({ text }: { text: string }) {
    const typewriter = useProfile().data?.typewriter_enabled !== false;
    // Since 3.8 the summaries are HTML (rebuilt from a whitelist, never injected); older ones are plain text
    if (isHtmlSummary(text)) return <SafeHtml html={text} typewriter={typewriter} />;
    return (
        <Typography variant="body2" component="div" sx={{ whiteSpace: 'pre-line', lineHeight: 1.7 }}>
            {linkify(text)}
        </Typography>
    );
}

interface DigestItem {
    text: string;
    /** "Products: ... | CVEs: ... | Threat actors: ..." */
    details: string;
}

/** The weekly digest is one "• summary" line per topic, each followed by an indented line of details. */
function digestItems(text: string): DigestItem[] {
    const items: DigestItem[] = [];
    for (const line of text.split('\n')) {
        if (!line.trim()) continue;
        if (line.startsWith('•') || items.length === 0) items.push({ text: line.replace(/^•\s*/, '').trim(), details: '' });
        else items[items.length - 1].details = [items[items.length - 1].details, line.trim()].filter(Boolean).join(' | ');
    }
    return items;
}

const DIGEST_PREVIEW = 2;

/** The weekly digest as a list, for the summaries written before 3.8 (plain text, one line per topic). */
function DigestList({ text }: { text: string }) {
    const [more, setMore] = useState(false);
    const items = digestItems(text);
    const shown = more ? items : items.slice(0, DIGEST_PREVIEW);
    return (
        <>
            <Box component="ul" sx={{ m: 0, pl: 2.5, display: 'grid', gap: 1 }}>
                {shown.map((item, i) => (
                    <li key={i}>
                        <Typography variant="body2" sx={{ lineHeight: 1.6 }}>
                            {linkify(item.text)}
                        </Typography>
                        {item.details && (
                            <Typography variant="caption" color="text.secondary" component="div" sx={{ lineHeight: 1.6 }}>
                                {linkify(item.details)}
                            </Typography>
                        )}
                    </li>
                ))}
            </Box>
            {items.length > DIGEST_PREVIEW && (
                <Button size="small" onClick={() => setMore((v) => !v)} endIcon={more ? <ExpandLess /> : <ExpandMore />} sx={{ mt: 1, px: 0 }}>
                    {more ? 'Show less' : `Read the whole digest - ${items.length} topics`}
                </Button>
            )}
        </>
    );
}

const WeeklyBody = ({ text }: { text: string }) => (isHtmlSummary(text) ? <SummaryText text={text} /> : <DigestList text={text} />);

/**
 * The AI summaries above the trends: the breaking news of the last day and the weekly report, half and half on a wide
 * screen. Each one shows how it starts; "Read more" opens all of it in a panel (kept in the address as ?read=...,
 * which is also where the Overview sends to).
 */
export function Briefing() {
    const weekly = useLatestSummary('weekly_summary');
    const breaking = useLatestSummary('breaking_news');
    const signedIn = useAuthStore((s) => s.signedIn);
    const regenerateWeekly = useRegenerateWeekly();
    const regenerateBreaking = useRegenerateBreaking();
    const running = useGenerating();
    const { params, update } = useUrlParams();
    const asked = params.get('read');
    const reading: Kind | null = asked === 'breaking' || asked === 'weekly' ? asked : null;

    const fresh = !!breaking.data && isBreakingFresh(breaking.data.created_at);
    if (weekly.isPending) return <Skeleton variant="rounded" height={96} sx={{ mb: 3 }} />;
    // Nobody to ask for a report: nothing to show without one
    if (!weekly.data && !fresh && !signedIn) return null;

    const breakingSummary = fresh ? breaking.data : undefined;
    const keyword = (breakingSummary?.keywords ?? '').split(',')[0]?.trim() ?? '';
    const readSummary = reading === 'breaking' ? breakingSummary : reading === 'weekly' ? weekly.data : undefined;
    const regenerateOf = (kind: Kind) => (kind === 'breaking' ? () => regenerateBreaking.mutate(keyword) : () => regenerateWeekly.mutate());
    // Being written for this page, or for the server (the page was refreshed, or another one asked)
    const pendingOf = (kind: Kind) =>
        kind === 'breaking' ? regenerateBreaking.isPending || running.includes(`breaking:${keyword.toLowerCase()}`) : regenerateWeekly.isPending || running.includes('weekly');
    const close = () => update({ read: null });

    return (
        <>
            <Box sx={{ display: 'grid', gap: 2, mb: 3, gridTemplateColumns: { xs: 'minmax(0, 1fr)', lg: breakingSummary ? 'repeat(2, minmax(0, 1fr))' : 'minmax(0, 1fr)' } }}>
                {breakingSummary && (
                    <SummaryPreviewCard
                        kind="breaking"
                        summary={breakingSummary}
                        testId="breaking-news"
                        onReadMore={() => update({ read: 'breaking', word: null })}
                        onRegenerate={regenerateOf('breaking')}
                        regenerating={pendingOf('breaking')}
                    />
                )}
                {(weekly.data || signedIn) && (
                <SummaryPreviewCard
                    kind="weekly"
                    summary={weekly.data ?? undefined}
                    testId="weekly-summary"
                    maxWords={breakingSummary ? 3 : 5}
                    onReadMore={() => update({ read: 'weekly', word: null })}
                    onRegenerate={regenerateOf('weekly')}
                    regenerating={pendingOf('weekly')}
                    empty={
                        <Stack spacing={1.5} sx={{ alignItems: 'flex-start' }}>
                            <Typography variant="body2" color="text.secondary">
                                There is no weekly report yet. Watcher writes one every week; you can also have the AI write it now from the articles of the week.
                            </Typography>
                            <RegenerateButton label="Generate the report" pending={regenerateWeekly.isPending} onClick={() => regenerateWeekly.mutate()} />
                        </Stack>
                    }
                />
                )}
            </Box>

            <SideDrawer open={!!readSummary} onClose={close} labelledBy="briefing-reader-title" width={720}>
                {reading && readSummary && (
                    <>
                        <Stack direction="row" sx={{ alignItems: 'center', gap: 1, px: 2.5, py: 2 }}>
                            <Stack direction="row" id="briefing-reader-title" sx={{ alignItems: 'center', gap: 1, flexWrap: 'wrap', flexGrow: 1, minWidth: 0 }}>
                                <CardTitle kind={reading} summary={readSummary} maxWords={5} />
                            </Stack>
                            <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
                                <When iso={readSummary.created_at} inline />
                            </Typography>
                            <IconButton aria-label="Close" onClick={close} edge="end">
                                <Close />
                            </IconButton>
                        </Stack>
                        <Box sx={{ px: 2.5, pb: 2.5, flexGrow: 1, minHeight: 0, overflowY: 'auto' }} data-testid="briefing-reader">
                            {reading === 'weekly' ? <WeeklyBody text={readSummary.summary_text} /> : <SummaryText text={readSummary.summary_text} />}
                            <SummaryFooter summary={readSummary} pending={pendingOf(reading)} onRegenerate={regenerateOf(reading)} />
                        </Box>
                    </>
                )}
            </SideDrawer>
        </>
    );
}
