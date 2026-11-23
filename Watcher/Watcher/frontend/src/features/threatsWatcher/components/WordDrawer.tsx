import { type ReactNode, useMemo, useState } from 'react';
import { Link as RouterLink } from 'react-router';
import { alpha, Alert as MuiAlert, Box, Button, Chip, Divider, IconButton, Link, Skeleton, Stack, TextField, Tooltip, Typography } from '@mui/material';
import { BarChart } from '@mui/x-charts/BarChart';
import AutoAwesomeOutlined from '@mui/icons-material/AutoAwesomeOutlined';
import BlockOutlined from '@mui/icons-material/BlockOutlined';
import CheckCircleOutlined from '@mui/icons-material/CheckCircleOutlined';
import Close from '@mui/icons-material/Close';
import DeleteOutlined from '@mui/icons-material/DeleteOutlined';
import InfoOutlined from '@mui/icons-material/InfoOutlined';
import NotificationAddOutlined from '@mui/icons-material/NotificationAddOutlined';
import OpenInNew from '@mui/icons-material/OpenInNew';
import { getErrorMessage } from '../../../api/client';
import { since } from '../../../lib/dates';
import { useSeriesColor, countSeries } from '../../../ui/charts';
import { SideDrawer } from '../../../ui/SideDrawer';
import { formatDateTime } from '../../timeline/format';
import { articleTitle, useReadArticles } from '../articles';
import { hostOf } from '../catalog';
import { heatOf, heatSentence } from '../heat';
import { useHeatColors } from '../heatColors';
import { useGenerateWordSummary, useThreatsStatistics, useWord, useWordSummary } from '../hooks';
import type { Post, Word } from '../types';
import { SummaryText } from './Briefing';
import { Favicon } from './Favicon';
import { MiniBars } from './MiniBars';
import { HeatChip, Reliability } from './tables';

function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
    return (
        <Box component="section" sx={{ px: 2.5, py: 2 }}>
            <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                <Typography variant="overline" color="text.secondary" component="h3">
                    {title}
                </Typography>
                {action}
            </Stack>
            {children}
        </Box>
    );
}

function AiSummary({ word }: { word: string }) {
    const { data: summary, isPending } = useWordSummary(word);
    const generate = useGenerateWordSummary();
    if (isPending) return <Skeleton height={60} />;
    if (summary) {
        return (
            <>
                <SummaryText text={summary.summary_text} />
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                    AI summary of its articles - {since(summary.updated_at || summary.created_at)}
                </Typography>
            </>
        );
    }
    return (
        <Stack spacing={1} sx={{ alignItems: 'flex-start' }}>
            <Typography variant="body2" color="text.secondary">
                No summary yet. Watcher can write one from the articles that mention this word (it takes a little while).
            </Typography>
            <Button size="small" variant="outlined" startIcon={<AutoAwesomeOutlined />} disabled={generate.isPending} onClick={() => generate.mutate(word)}>
                {generate.isPending ? 'Writing the summary…' : 'Summarize the articles'}
            </Button>
            {generate.error && (
                <MuiAlert severity="info" sx={{ width: '100%' }}>
                    {getErrorMessage(generate.error, 'The summary could not be written.')}
                </MuiAlert>
            )}
        </Stack>
    );
}

/** Articles per day over the last 30 days. */
function Mentions({ posts }: { posts: Post[] }) {
    const color = useSeriesColor(0);
    const days = useMemo(() => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        return Array.from({ length: 30 }, (_, i) => {
            const d = new Date(today);
            d.setDate(d.getDate() - (29 - i));
            return d;
        });
    }, []);
    const counts = days.map((d) => posts.filter((p) => new Date(p.created_at).toDateString() === d.toDateString()).length);
    if (counts.every((c) => c === 0)) {
        return (
            <Typography variant="body2" color="text.secondary">
                No article in the last 30 days.
            </Typography>
        );
    }
    return (
        <Box sx={{ height: 160 }} data-testid="mentions-chart">
            <BarChart
                xAxis={[{ scaleType: 'band', data: days.map((d) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })), categoryGapRatio: 0.3 }]}
                yAxis={[{ tickMinStep: 1, width: 28 }]}
                series={countSeries([{ data: counts, label: 'Articles', color }])}
                hideLegend
                borderRadius={3}
                grid={{ horizontal: true }}
                margin={{ left: 0, right: 4, top: 12, bottom: 0 }}
            />
        </Box>
    );
}

const SHOWN_FIRST = 6;

/** "11 articles from 5 sites". */
function mentionedIn(posts: Post[] | undefined, total: number): string {
    const count = posts?.length ?? total;
    const sites = new Set((posts ?? []).map((p) => hostOf(p.url))).size;
    return `${count} article${count === 1 ? '' : 's'}${posts ? ` from ${sites} site${sites === 1 ? '' : 's'}` : ''}`;
}

/** "Today", "Yesterday" or "Mon 16 Nov". */
function dayLabel(iso: string): string {
    const day = new Date(iso);
    const start = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const diff = Math.round((start(new Date()) - start(day)) / 86_400_000);
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Yesterday';
    return day.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

const timeOf = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

/** Where the word was mentioned: the articles of each day, a title you can read, and a mark on the ones you already opened. */
function Articles({ posts }: { posts: Post[] }) {
    const [filter, setFilter] = useState('');
    const [all, setAll] = useState(false);
    const { isRead, mark } = useReadArticles();
    const matching = posts.filter((p) => (hostOf(p.url) + articleTitle(p.url)).toLowerCase().includes(filter.toLowerCase()));
    const shown = all || filter ? matching : matching.slice(0, SHOWN_FIRST);
    const days: { label: string; posts: Post[] }[] = [];
    for (const post of shown) {
        const label = dayLabel(post.created_at);
        const last = days[days.length - 1];
        if (last?.label === label) last.posts.push(post);
        else days.push({ label, posts: [post] });
    }
    return (
        <>
            {posts.length > 15 && (
                <TextField size="small" placeholder="Filter by site or title…" value={filter} onChange={(e) => setFilter(e.target.value)} fullWidth sx={{ mb: 1 }} slotProps={{ htmlInput: { 'aria-label': 'Filter the articles' } }} />
            )}
            <Stack spacing={1.5} data-testid="word-articles">
                {days.map((day) => (
                    <Box key={day.label} component="section">
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', mb: 0.25 }}>
                            {day.label}
                        </Typography>
                        <Stack component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
                            {day.posts.map((p) => {
                                const read = isRead(p.url);
                                return (
                                    <Box component="li" key={p.url} sx={{ '& + &': { borderTop: 1, borderColor: 'divider' } }}>
                                        <Link
                                            href={p.url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            underline="none"
                                            color="inherit"
                                            data-read={read ? 'true' : 'false'}
                                            onClick={() => mark(p.url)}
                                            onAuxClick={() => mark(p.url)}
                                            sx={{ display: 'flex', gap: 1.25, alignItems: 'flex-start', py: 0.9, px: 0.75, mx: -0.75, borderRadius: 1.5, '&:hover': { bgcolor: 'action.hover' }, '&:visited .article-title': { color: 'text.secondary' } }}
                                        >
                                            <Box sx={{ mt: '3px' }}>
                                                <Favicon host={hostOf(p.url)} />
                                            </Box>
                                            <Box sx={{ minWidth: 0, flexGrow: 1 }}>
                                                <Typography variant="caption" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                                                    <span>{hostOf(p.url)}</span>
                                                    <span aria-hidden>-</span>
                                                    <span title={formatDateTime(p.created_at)}>{timeOf(p.created_at)}</span>
                                                    {read && (
                                                        <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.25, ml: 'auto', color: 'success.main' }}>
                                                            <CheckCircleOutlined sx={{ fontSize: 14 }} /> Read
                                                        </Box>
                                                    )}
                                                </Typography>
                                                <Typography
                                                    className="article-title"
                                                    variant="body2"
                                                    sx={{ fontWeight: read ? 400 : 600, color: read ? 'text.secondary' : 'text.primary', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
                                                >
                                                    {articleTitle(p.url)}
                                                </Typography>
                                                                                        </Box>
                                        </Link>
                                    </Box>
                                );
                            })}
                        </Stack>
                    </Box>
                ))}
            </Stack>
            {!filter && matching.length > SHOWN_FIRST && (
                <Button size="small" onClick={() => setAll((v) => !v)} sx={{ mt: 1 }}>
                    {all ? 'Show fewer' : `Show the ${matching.length - SHOWN_FIRST} others`}
                </Button>
            )}
        </>
    );
}

interface WordDrawerProps {
    open: boolean;
    id: number | null;
    initial?: Word;
    onClose: () => void;
    actions: {
        monitor?: (word: Word) => void;
        ban?: (word: Word) => void;
        remove?: (word: Word) => void;
    };
}

/** One trending word: what the articles say (AI summary), when it is mentioned, and the articles themselves. */
export function WordDrawer({ open, id, initial, onClose, actions }: WordDrawerProps) {
    const { data: word, error } = useWord(id, initial);
    const { data: stats } = useThreatsStatistics();
    const posts = word?.posts;
    const colors = useHeatColors();
    const heat = word ? heatOf(word) : 'quiet';
    const isCve = !!word && /^CVE-\d{4}-\d{4,}$/i.test(word.name);

    return (
        <SideDrawer open={open} onClose={onClose} labelledBy="word-drawer-title" width={600}>
            <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', px: 2.5, py: 2 }}>
                <Box sx={{ minWidth: 0, flexGrow: 1 }}>
                    <Typography variant="overline" color="text.secondary" sx={{ lineHeight: 1.4, display: 'block' }}>
                        Trending word
                    </Typography>
                    <Stack direction="row" spacing={1} sx={{ alignItems: 'center', minWidth: 0 }}>
                        <Typography id="word-drawer-title" variant="h3" component="h2" noWrap>
                            {word?.name ?? <Skeleton width={160} />}
                        </Typography>
                        {word?.monitored && <Chip size="small" color="primary" variant="outlined" label="Monitored" />}
                    </Stack>
                </Box>
                <IconButton aria-label="Close details" onClick={onClose} edge="end">
                    <Close />
                </IconButton>
            </Stack>
            {word && (
                <Box sx={{ px: 2.5, pb: 2 }}>
                    <Stack
                        direction="row"
                        spacing={1.5}
                        data-testid="word-heat"
                        sx={{ alignItems: 'center', p: 1.5, borderRadius: 2, border: 1, borderColor: alpha(colors[heat], 0.45), bgcolor: alpha(colors[heat], 0.08) }}
                    >
                        <HeatChip word={word} />
                        <Typography variant="body2" sx={{ flexGrow: 1, minWidth: 0 }}>
                            {heatSentence(word)}
                        </Typography>
                        <MiniBars values={word.daily ?? []} color={colors[heat]} width={70} height={26} label={`Articles per day over the last 7 days: ${(word.daily ?? []).join(', ')}`} />
                    </Stack>
                    <Stack direction="row" spacing={1} sx={{ mt: 1.5, flexWrap: 'wrap', rowGap: 1 }}>
                        {actions.monitor && !word.monitored && (
                            <Button size="small" variant="outlined" startIcon={<NotificationAddOutlined />} onClick={() => actions.monitor?.(word)}>
                                Monitor
                            </Button>
                        )}
                        {isCve && (
                            <Button component={RouterLink} to={`/cyber_watch?tab=cves&cq=${encodeURIComponent(word.name)}&cstatus=all`} size="small" variant="outlined">
                                Open in Cyber Watch
                            </Button>
                        )}
                        <Box sx={{ flexGrow: 1 }} />
                        {actions.ban && (
                            <Button size="small" variant="outlined" startIcon={<BlockOutlined />} onClick={() => actions.ban?.(word)}>
                                Ban
                            </Button>
                        )}
                        {actions.remove && (
                            <Button size="small" variant="outlined" color="error" startIcon={<DeleteOutlined />} onClick={() => actions.remove?.(word)}>
                                Delete
                            </Button>
                        )}
                    </Stack>
                </Box>
            )}
            <Divider />
            <Box sx={{ flexGrow: 1, overflowY: 'auto' }}>
                {error && !word ? (
                    <MuiAlert severity="error" sx={{ m: 2.5 }}>
                        {getErrorMessage(error, 'Failed to load the word.')}
                    </MuiAlert>
                ) : !word ? (
                    <Box sx={{ p: 2.5 }}>
                        <Skeleton height={80} />
                    </Box>
                ) : (
                    <>
                        <Section title="What the articles say">
                            <AiSummary word={word.name} />
                        </Section>
                        <Section title="Articles per day, last 30 days">{posts ? <Mentions posts={posts} /> : <Skeleton height={120} />}</Section>
                        <Section title="Where it was mentioned" action={<Typography variant="caption" color="text.secondary">{mentionedIn(posts, word.posts_count)}</Typography>}>
                            {posts ? <Articles posts={posts} /> : <Skeleton height={120} />}
                        </Section>
                    </>
                )}
            </Box>
            <Box sx={{ px: 2.5, py: 1, borderTop: 1, borderColor: 'divider' }}>
                {word && (
                    <Stack direction="row" spacing={1.5} sx={{ flexWrap: 'wrap', alignItems: 'center', rowGap: 0.5, mb: 0.5 }} data-testid="word-details">
                        <Typography variant="caption" color="text.secondary">
                            Reliability
                        </Typography>
                        <Reliability score={word.score} />
                        <Typography variant="caption" color="text.secondary">
                            First seen {since(word.created_at)}
                        </Typography>
{stats?.minTitles && (
                            <Tooltip
                                title={`Why it is here: at least ${stats.minTitles} article titles carried it in the same pass over the feeds. The feeds are read every 30 minutes, and only the latest articles of the last 30 days count.`}
                            >
                                <IconButton size="small" aria-label="Why it is here" data-testid="word-why">
                                    <InfoOutlined fontSize="small" />
                                </IconButton>
                            </Tooltip>
                        )}
                    </Stack>
                )}
                <Typography variant="caption" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <OpenInNew sx={{ fontSize: 12 }} /> Articles open on their own site.
                </Typography>
            </Box>
        </SideDrawer>
    );
}
