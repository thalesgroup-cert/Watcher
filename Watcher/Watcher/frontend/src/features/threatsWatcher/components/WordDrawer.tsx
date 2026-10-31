import { type ReactNode, useMemo, useState } from 'react';
import { Alert as MuiAlert, Box, Button, Chip, Divider, IconButton, Link, Skeleton, Stack, TextField, Typography } from '@mui/material';
import { BarChart } from '@mui/x-charts/BarChart';
import AutoAwesomeOutlined from '@mui/icons-material/AutoAwesomeOutlined';
import BlockOutlined from '@mui/icons-material/BlockOutlined';
import Close from '@mui/icons-material/Close';
import DeleteOutlined from '@mui/icons-material/DeleteOutlined';
import NotificationAddOutlined from '@mui/icons-material/NotificationAddOutlined';
import OpenInNew from '@mui/icons-material/OpenInNew';
import { getErrorMessage } from '../../../api/client';
import { since } from '../../../lib/dates';
import { useSeriesColor, countSeries } from '../../../ui/charts';
import { SideDrawer } from '../../../ui/SideDrawer';
import { formatDateTime } from '../../timeline/format';
import { hostOf } from '../catalog';
import { useGenerateWordSummary, useWord, useWordSummary } from '../hooks';
import type { Post, Word } from '../types';
import { SummaryText } from './Briefing';
import { Reliability } from './tables';

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

function Articles({ posts }: { posts: Post[] }) {
    const [filter, setFilter] = useState('');
    const shown = posts.filter((p) => p.url.toLowerCase().includes(filter.toLowerCase()));
    return (
        <>
            {posts.length > 8 && (
                <TextField size="small" placeholder="Filter by site or URL…" value={filter} onChange={(e) => setFilter(e.target.value)} fullWidth sx={{ mb: 1 }} slotProps={{ htmlInput: { 'aria-label': 'Filter the articles' } }} />
            )}
            <Stack component="ul" spacing={0.5} sx={{ listStyle: 'none', m: 0, p: 0 }} data-testid="word-articles">
                {shown.map((p) => (
                    <Box component="li" key={p.url}>
                        <Link href={p.url} target="_blank" rel="noopener noreferrer" underline="hover" sx={{ display: 'flex', gap: 1, alignItems: 'baseline', minWidth: 0 }}>
                            <Typography component="span" variant="body2" sx={{ fontWeight: 600, flexShrink: 0 }}>
                                {hostOf(p.url)}
                            </Typography>
                            <Typography component="span" variant="caption" color="text.secondary" noWrap sx={{ minWidth: 0 }}>
                                {p.url.replace(/^https?:\/\/[^/]+/, '') || '/'}
                            </Typography>
                            <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 'auto', flexShrink: 0 }} title={formatDateTime(p.created_at)}>
                                {since(p.created_at)}
                            </Typography>
                        </Link>
                    </Box>
                ))}
            </Stack>
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
    const posts = word?.posts;

    return (
        <SideDrawer open={open} onClose={onClose} labelledBy="word-drawer-title" width={600}>
            <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', px: 2.5, py: 2 }}>
                <Box sx={{ minWidth: 0, flexGrow: 1 }}>
                    <Typography variant="overline" color="text.secondary" sx={{ lineHeight: 1.4, display: 'block' }}>
                        Trending word
                    </Typography>
                    <Typography id="word-drawer-title" variant="h3" component="h2" noWrap>
                        {word?.name ?? <Skeleton width={160} />}
                    </Typography>
                </Box>
                <IconButton aria-label="Close details" onClick={onClose} edge="end">
                    <Close />
                </IconButton>
            </Stack>
            {word && (
                <Stack direction="row" spacing={1} sx={{ px: 2.5, pb: 2, flexWrap: 'wrap', alignItems: 'center', rowGap: 1 }}>
                    <Chip size="small" label={`${word.occurrences} mentions`} />
                    <Reliability score={word.score} />
                    {word.monitored && <Chip size="small" color="primary" variant="outlined" label="Monitored" />}
                    <Box sx={{ flexGrow: 1 }} />
                    {actions.monitor && !word.monitored && (
                        <Button size="small" variant="outlined" startIcon={<NotificationAddOutlined />} onClick={() => actions.monitor?.(word)}>
                            Monitor
                        </Button>
                    )}
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
                        <Section title="Mentions - 30 days">{posts ? <Mentions posts={posts} /> : <Skeleton height={120} />}</Section>
                        <Section
                            title={`Articles (${word.posts_count})`}
                            action={
                                <Typography variant="caption" color="text.secondary">
                                    First seen {since(word.created_at)}
                                </Typography>
                            }
                        >
                            {posts ? <Articles posts={posts} /> : <Skeleton height={120} />}
                        </Section>
                    </>
                )}
            </Box>
            <Box sx={{ px: 2.5, py: 1, borderTop: 1, borderColor: 'divider' }}>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <OpenInNew sx={{ fontSize: 12 }} /> Articles open on their own site.
                </Typography>
            </Box>
        </SideDrawer>
    );
}
