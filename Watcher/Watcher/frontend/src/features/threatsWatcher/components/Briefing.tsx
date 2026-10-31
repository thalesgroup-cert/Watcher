import { type ReactNode, useState } from 'react';
import { Alert, AlertTitle, Box, Button, Card, CardContent, Chip, Link, Skeleton, Stack, Typography } from '@mui/material';
import CampaignOutlined from '@mui/icons-material/CampaignOutlined';
import ExpandLess from '@mui/icons-material/ExpandLess';
import ExpandMore from '@mui/icons-material/ExpandMore';
import { since } from '../../../lib/dates';
import { formatDateTime } from '../../timeline/format';
import { useLatestSummary } from '../hooks';
import { When } from '../../../ui/When';

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

const DAY = 86_400_000;
/** Breaking news are shown for a day. */
const isFresh = (iso: string) => Date.now() - new Date(iso).getTime() < DAY;

/** Weekly AI digest and, when there is one from the last 24 hours, the breaking news, above the trends. */
export function Briefing() {
    const weekly = useLatestSummary('weekly_summary');
    const breaking = useLatestSummary('breaking_news');
    const [open, setOpen] = useState(false);
    const fresh = !!breaking.data && isFresh(breaking.data.created_at);

    if (weekly.isPending) return <Skeleton variant="rounded" height={96} sx={{ mb: 3 }} />;
    if (!weekly.data && !fresh) return null;
    const items = weekly.data ? digestItems(weekly.data.summary_text) : [];
    const shown = open ? items : items.slice(0, DIGEST_PREVIEW);

    return (
        <Stack spacing={2} sx={{ mb: 3 }}>
            {fresh && breaking.data && (
                <Alert severity="warning" icon={<CampaignOutlined />} data-testid="breaking-news">
                    <AlertTitle>Breaking news - <When iso={breaking.data.created_at} inline /></AlertTitle>
                    {breaking.data.keywords && (
                        <Stack direction="row" spacing={0.5} sx={{ mb: 1, flexWrap: 'wrap' }}>
                            {breaking.data.keywords
                                .split(',')
                                .map((k) => k.trim())
                                .filter(Boolean)
                                .map((k) => (
                                    <Chip key={k} size="small" label={k} />
                                ))}
                        </Stack>
                    )}
                    <SummaryText text={breaking.data.summary_text} />
                </Alert>
            )}
            {weekly.data && (
                <Card data-testid="weekly-summary">
                    <CardContent>
                        <Stack direction="row" sx={{ alignItems: 'baseline', justifyContent: 'space-between', gap: 1, mb: 1 }}>
                            <Typography variant="h3" component="h2">
                                This week in cyber threats
                            </Typography>
                            <Typography variant="caption" color="text.secondary" title={formatDateTime(weekly.data.created_at)}>
                                AI digest - {since(weekly.data.created_at)}
                            </Typography>
                        </Stack>
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
                            <Button size="small" onClick={() => setOpen((v) => !v)} endIcon={open ? <ExpandLess /> : <ExpandMore />} sx={{ mt: 1, px: 0 }}>
                                {open ? 'Show less' : `Read the whole digest - ${items.length} topics`}
                            </Button>
                        )}
                    </CardContent>
                </Card>
            )}
        </Stack>
    );
}
