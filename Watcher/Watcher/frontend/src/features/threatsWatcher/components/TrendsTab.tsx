import { useState } from 'react';
import { Alert as MuiAlert, Box, Button, Card, CardContent, MenuItem, Stack, TablePagination, TextField, Typography } from '@mui/material';
import DateRangeOutlined from '@mui/icons-material/DateRangeOutlined';
import FilterAltOffOutlined from '@mui/icons-material/FilterAltOffOutlined';
import NotificationsActiveOutlined from '@mui/icons-material/NotificationsActiveOutlined';
import SearchOff from '@mui/icons-material/SearchOff';
import TodayOutlined from '@mui/icons-material/TodayOutlined';
import WhatshotOutlined from '@mui/icons-material/WhatshotOutlined';
import { getErrorMessage } from '../../../api/client';
import { useUrlParams } from '../../../lib/useUrlParams';
import { ConfirmDialog } from '../../../ui/ConfirmDialog';
import { EmptyState } from '../../../ui/EmptyState';
import { KpiCard } from '../../../ui/KpiCard';
import { countOf, SearchField } from '../../../ui/SearchField';
import { ActiveFilters } from '../../../ui/ActiveFilters';
import { hasAnyPermission, selectUser, useAuthStore } from '../../auth/store';
import { useBanWord, useDeleteWord, useSaveKeyword, useThreatsStatistics, useWords } from '../hooks';
import type { Confidence, Period, Word, WordFilters } from '../types';
import { Briefing } from './Briefing';
import { WordViz } from './WordCloud';
import { WordDrawer } from './WordDrawer';
import { WordTable } from './tables';

const DEFAULT_ORDERING = '-occurrences';
const PAGE_SIZES = [25, 50, 100];
const ORDERINGS = ['name', 'occurrences', 'posts_count', 'score', 'created_at'].flatMap((f) => [f, `-${f}`]);
const PERIODS: { value: Period; label: string }[] = [
    { value: '', label: 'Any time' },
    { value: 'today', label: 'Today' },
    { value: '7d', label: 'Last 7 days' },
    { value: '30d', label: 'Last 30 days' },
];
const CONFIDENCES: { value: Confidence; label: string }[] = [
    { value: 'high', label: 'High (70 % or more)' },
    { value: 'medium', label: 'Medium' },
    { value: 'low', label: 'Low (30 % or less)' },
];

export function readWordFilters(params: URLSearchParams): WordFilters {
    const period = params.get('period') as Period | null;
    const confidence = params.get('confidence') as Confidence | null;
    return {
        search: params.get('q') ?? '',
        period: period && PERIODS.some((p) => p.value === period) ? period : '',
        confidence: confidence && CONFIDENCES.some((c) => c.value === confidence) ? confidence : '',
    };
}

const NO_FILTERS: WordFilters = { search: '', period: '', confidence: '' };
export const wordFilterParams = (f: WordFilters) => ({ q: f.search, period: f.period, confidence: f.confidence, page: null });
const CLOUD = { page: 1, pageSize: 40, ordering: '-occurrences' };

export function TrendsTab() {
    const { params, update } = useUrlParams();
    const filters = readWordFilters(params);
    const setFilters = (patch: Partial<WordFilters>) => update(wordFilterParams({ ...filters, ...patch }));
    const sort = params.get('sort') ?? '';
    const ordering = ORDERINGS.includes(sort) ? sort : DEFAULT_ORDERING;
    const page = Math.max(1, Number(params.get('page')) || 1);
    const size = Number(params.get('size'));
    const pageSize = PAGE_SIZES.includes(size) ? size : PAGE_SIZES[0];
    const wordId = Number(params.get('word')) || null;

    const user = useAuthStore(selectUser);
    const canMonitor = hasAnyPermission(user, 'threats_watcher.add_monitoredkeyword');
    const canDelete = hasAnyPermission(user, 'threats_watcher.delete_trendyword');
    const canBan = canDelete && hasAnyPermission(user, 'threats_watcher.add_bannedword');

    const { data: stats } = useThreatsStatistics();
    const list = useWords(filters, { page, pageSize, ordering });
    const cloud = useWords(filters, CLOUD);
    const rows = list.data?.results ?? [];
    const monitor = useSaveKeyword();
    const ban = useBanWord();
    const remove = useDeleteWord();

    const [opened, setOpened] = useState<{ id: number; row?: Word } | null>(null);
    if (wordId && opened?.id !== wordId) setOpened({ id: wordId, row: rows.find((r) => r.id === wordId) });
    const open = (w: Word) => {
        setOpened({ id: w.id, row: w });
        update({ word: w.id });
    };
    const [confirm, setConfirm] = useState<{ word: Word; action: 'ban' | 'delete' } | null>(null);

    const isFiltered = !!(filters.search || filters.period || filters.confidence);
    const kpi = (period: Period) => ({
        selected: !!period && filters.period === period && !filters.search && !filters.confidence,
        onClick: () => update(wordFilterParams({ ...NO_FILTERS, period })),
    });

    return (
        <>
            <Briefing />
            <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: 'repeat(2, 1fr)', md: 'repeat(4, 1fr)' }, mb: 3 }}>
                <KpiCard title="Trending words" value={stats?.totalWords} icon={<WhatshotOutlined />} color="primary" onClick={kpi('').onClick} />
                <KpiCard title="New today" value={stats?.newToday} icon={<TodayOutlined />} color="primary" {...kpi('today')} />
                <KpiCard title="New - 7 days" value={stats?.newThisWeek} icon={<DateRangeOutlined />} color="primary" {...kpi('7d')} />
                <KpiCard
                    title="Monitored keywords seen"
                    value={stats?.monitoredSeen}
                    icon={<NotificationsActiveOutlined />}
                    color="warning"
                    onClick={() => update({ tab: 'keywords', kseen: 'yes' })}
                />
            </Box>

            <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 1.5, alignItems: 'center', mb: 1.5, minHeight: 48 }}>
                <SearchField resultCount={countOf(list)} value={filters.search} onChange={(search) => setFilters({ search })} placeholder="Search words…" ariaLabel="Search words" />
                <TextField
                    select
                    size="small"
                    label="First seen"
                    value={filters.period}
                    onChange={(e) => setFilters({ period: e.target.value as Period })}
                    sx={{ minWidth: 150 }}
                    slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}
                >
                    {PERIODS.map((p) => (
                        <MenuItem key={p.value || 'any'} value={p.value}>
                            {p.label}
                        </MenuItem>
                    ))}
                </TextField>
                <TextField select size="small" label="Reliability" value={filters.confidence} onChange={(e) => setFilters({ confidence: e.target.value as Confidence })} sx={{ minWidth: 170 }}>
                    <MenuItem value="">Any</MenuItem>
                    {CONFIDENCES.map((c) => (
                        <MenuItem key={c.value} value={c.value}>
                            {c.label}
                        </MenuItem>
                    ))}
                </TextField>
                {isFiltered && (
                    <Button size="small" color="inherit" startIcon={<FilterAltOffOutlined />} onClick={() => update(wordFilterParams(NO_FILTERS))} sx={{ color: 'text.secondary' }}>
                        Clear
                    </Button>
                )}
<ActiveFilters
    chips={[
        filters.period && { key: 'period', label: 'First seen', value: PERIODS.find((p) => p.value === filters.period)?.label ?? filters.period, onRemove: () => setFilters({ period: '' }) },
        filters.confidence && { key: 'confidence', label: 'Reliability', value: CONFIDENCES.find((c) => c.value === filters.confidence)?.label ?? filters.confidence, onRemove: () => setFilters({ confidence: '' }) },
    ]}
/>
            </Stack>

            {(cloud.data?.results.length ?? 0) > 0 && (
                <Card sx={{ mb: 2 }}>
                    <CardContent>
                        <Typography variant="overline" color="text.secondary" component="h2">
                            Most mentioned
                        </Typography>
                        <WordViz
                            words={cloud.data?.results ?? []}
                            period={filters.period}
                            activeId={wordId}
                            onOpen={(id) => {
                                const row = cloud.data?.results.find((w) => w.id === id);
                                setOpened({ id, row });
                                update({ word: id });
                            }}
                        />
                    </CardContent>
                </Card>
            )}

            <Card>
                {list.error ? (
                    <MuiAlert severity="error" sx={{ m: 2 }}>
                        {getErrorMessage(list.error, 'Failed to load the trending words.')}
                    </MuiAlert>
                ) : (
                    <>
                        <Box sx={{ opacity: list.isPlaceholderData ? 0.6 : 1, transition: 'opacity 120ms' }}>
                            <WordTable highlight={filters.search}
                                rows={rows}
                                loading={list.isPending}
                                ordering={ordering}
                                onOrderingChange={(o) => update({ sort: o === DEFAULT_ORDERING ? null : o, page: null })}
                                activeId={wordId}
                                onOpen={open}
                                empty={
                                    isFiltered ? (
                                        <EmptyState icon={<SearchOff />} title="No word matches these filters">
                                            <Button size="small" onClick={() => update(wordFilterParams(NO_FILTERS))}>
                                                Clear the filters
                                            </Button>
                                        </EmptyState>
                                    ) : (
                                        <EmptyState icon={<WhatshotOutlined />} title="Nothing trending yet">
                                            Watcher reads the RSS sources every 30 minutes and lists the words that come up in several articles.
                                        </EmptyState>
                                    )
                                }
                            />
                        </Box>
                        <TablePagination
                            component="div"
                            count={list.data?.count ?? 0}
                            page={(list.data?.count ?? 0) === 0 ? 0 : page - 1}
                            onPageChange={(_, p) => update({ page: p > 0 ? p + 1 : null })}
                            rowsPerPage={pageSize}
                            rowsPerPageOptions={PAGE_SIZES}
                            onRowsPerPageChange={(e) => update({ size: Number(e.target.value) === PAGE_SIZES[0] ? null : e.target.value, page: null })}
                        />
                    </>
                )}
            </Card>

            <WordDrawer
                open={wordId !== null}
                id={opened?.id ?? null}
                initial={opened?.row}
                onClose={() => update({ word: null })}
                actions={{
                    monitor: canMonitor ? (w) => monitor.mutate({ input: { name: w.name, level: 'warm' } }) : undefined,
                    ban: canBan ? (w) => setConfirm({ word: w, action: 'ban' }) : undefined,
                    remove: canDelete ? (w) => setConfirm({ word: w, action: 'delete' }) : undefined,
                }}
            />

            <ConfirmDialog
                open={confirm !== null}
                title={confirm?.action === 'ban' ? `Ban “${confirm.word.name}”?` : `Delete “${confirm?.word.name}”?`}
                confirmLabel={confirm?.action === 'ban' ? 'Ban' : 'Delete'}
                danger
                pending={ban.isPending || remove.isPending}
                onClose={() => setConfirm(null)}
                onConfirm={() => {
                    if (!confirm) return;
                    const done = {
                        onSuccess: () => {
                            setConfirm(null);
                            update({ word: null });
                        },
                    };
                    if (confirm.action === 'ban') ban.mutate(confirm.word, done);
                    else remove.mutate(confirm.word, done);
                }}
            >
                {confirm?.action === 'ban'
                    ? 'It is removed from the trends and added to the banned words, so it does not come back. Unban it from the Banned words tab.'
                    : 'It is removed from the trends with its summary. It comes back if it keeps being mentioned.'}
            </ConfirmDialog>
        </>
    );
}
