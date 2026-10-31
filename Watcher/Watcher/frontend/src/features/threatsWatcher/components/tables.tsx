import type { ReactNode } from 'react';
import { Box, Chip, Stack, Tooltip, Typography } from '@mui/material';
import LocalFireDepartment from '@mui/icons-material/LocalFireDepartment';
import PersonOutlined from '@mui/icons-material/PersonOutlined';
import { type Column, DataTable, type RowSelection } from '../../../ui/DataTable';
import { LastActorAvatar } from '../../timeline/components/LastActor';
import { confidenceMeta, countryLabel, hostOf, levelMeta, scoreBand, sourceState } from '../catalog';
import type { BannedWord, Level, MonitoredKeyword, Source, Word } from '../types';
import { When } from '../../../ui/When';

const count = (n: number, strong = false) => (
    <Typography variant="body2" sx={{ fontWeight: strong ? 700 : 400, fontVariantNumeric: 'tabular-nums' }} color={strong ? 'text.primary' : 'text.secondary'}>
        {n.toLocaleString('en-GB')}
    </Typography>
);

const actorColumn = <T extends { last_event: MonitoredKeyword['last_event'] }>(): Column<T> => ({
    key: 'actor',
    label: (
        <Tooltip title="Last change by">
            <PersonOutlined sx={{ fontSize: 18, verticalAlign: 'middle' }} aria-label="Last change by" />
        </Tooltip>
    ),
    width: 56,
    align: 'center',
    render: (r) => (r.last_event ? <LastActorAvatar event={r.last_event} /> : null),
});

export function Reliability({ score }: { score: number }) {
    const band = scoreBand(score);
    return (
        <Tooltip title="Average reliability of the sources that mention it">
            <Chip size="small" variant="outlined" color={band.color} label={`${band.label} - ${Math.round(score)}%`} />
        </Tooltip>
    );
}

export function LevelChip({ level }: { level: Level }) {
    const meta = levelMeta(level);
    return (
        <Tooltip title={meta.description}>
            <Chip
                size="small"
                color={level === 'warm' ? 'warning' : 'error'}
                variant={level === 'super_hot' ? 'filled' : 'outlined'}
                icon={
                    <Stack direction="row" component="span" sx={{ ml: 0.5 }}>
                        {Array.from({ length: meta.flames }, (_, i) => (
                            <LocalFireDepartment key={i} sx={{ fontSize: 14 }} />
                        ))}
                    </Stack>
                }
                label={meta.label}
            />
        </Tooltip>
    );
}

const WORD_COLUMNS: Column<Word>[] = [
    {
        key: 'name',
        label: 'Word',
        sort: 'name',
        render: (w) => (
            <Typography sx={{ fontWeight: 600 }} noWrap>
                {w.name}
            </Typography>
        ),
    },
    { key: 'mentions', label: 'Mentions', sort: 'occurrences', width: 110, align: 'right', render: (w) => count(w.occurrences, true) },
    { key: 'articles', label: 'Articles', sort: 'posts_count', width: 100, align: 'right', render: (w) => count(w.posts_count) },
    { key: 'reliability', label: 'Reliability', sort: 'score', width: 150, render: (w) => <Reliability score={w.score} /> },
    { key: 'first', label: 'First seen', sort: 'created_at', width: 140, render: (w) => <When iso={w.created_at} /> },
];

const KEYWORD_COLUMNS: Column<MonitoredKeyword>[] = [
    {
        key: 'name',
        label: 'Keyword',
        sort: 'name',
        render: (k) => (
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center', minWidth: 0 }}>
                <Typography sx={{ fontWeight: 600 }} noWrap>
                    {k.name}
                </Typography>
                {k.is_rule && <Chip size="small" variant="outlined" label="Rule" />}
                {!k.is_active && <Chip size="small" label="Paused" />}
            </Stack>
        ),
    },
    { key: 'level', label: 'Level', sort: 'level', width: 150, render: (k) => <LevelChip level={k.level} /> },
    { key: 'mentions', label: 'Mentions', sort: 'occurrences', width: 110, align: 'right', render: (k) => count(k.occurrences, k.occurrences > 0) },
    { key: 'last', label: 'Last seen', sort: 'last_seen', width: 140, render: (k) => <When iso={k.last_seen} empty="Not seen yet" /> },
    { key: 'added', label: 'Added', sort: 'created_at', width: 130, render: (k) => <When iso={k.created_at} /> },
    actorColumn<MonitoredKeyword>(),
];

export function SourceState({ code }: { code: number | null }) {
    const state = sourceState(code);
    return (
        <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
            <Box sx={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, bgcolor: state.color === 'default' ? 'text.disabled' : `${state.color}.main` }} />
            <Typography variant="body2" noWrap>
                {state.label}
            </Typography>
        </Stack>
    );
}

const SOURCE_COLUMNS: Column<Source>[] = [
    {
        key: 'url',
        label: 'Feed',
        sort: 'url',
        cellSx: { maxWidth: 420 },
        render: (s) => (
            <Box sx={{ minWidth: 0 }}>
                <Typography sx={{ fontWeight: 600 }} noWrap>
                    {hostOf(s.url)}
                </Typography>
                <Typography variant="caption" color="text.secondary" noWrap component="div">
                    {s.url}
                </Typography>
            </Box>
        ),
    },
    {
        key: 'country',
        label: 'Country',
        sort: 'country',
        width: 170,
        render: (s) => (
            <Typography variant="body2" noWrap color={s.country || s.country_code ? 'text.primary' : 'text.disabled'}>
                {s.country || s.country_code ? countryLabel(s.country_code, s.country) : '-'}
            </Typography>
        ),
    },
    {
        key: 'confidence',
        label: 'Reliability',
        sort: 'confident',
        width: 130,
        render: (s) => {
            const meta = confidenceMeta(s.confident);
            return <Chip size="small" variant="outlined" color={meta.color} label={`${meta.label} - ${meta.percent}%`} />;
        },
    },
    { key: 'state', label: 'Last fetch', sort: 'last_status_code', width: 150, render: (s) => <SourceState code={s.last_status_code} /> },
    { key: 'checked', label: 'Checked', sort: 'last_checked', width: 130, render: (s) => <When iso={s.last_checked} empty="Never" /> },
    actorColumn<Source>(),
];

const BANNED_COLUMNS: Column<BannedWord>[] = [
    {
        key: 'name',
        label: 'Word',
        sort: 'name',
        render: (b) => (
            <Typography sx={{ fontWeight: 600 }} noWrap>
                {b.name}
            </Typography>
        ),
    },
    { key: 'added', label: 'Banned', sort: 'created_at', width: 150, render: (b) => <When iso={b.created_at} /> },
    actorColumn<BannedWord>(),
];

interface TableProps<T> {
    rows: T[];
    loading: boolean;
    ordering: string;
    onOrderingChange: (ordering: string) => void;
    selection?: RowSelection;
    onOpen: (row: T) => void;
    empty: ReactNode;
    activeId?: number | null;
    highlight?: string;
}

export function WordTable(props: TableProps<Word>) {
    return <DataTable label="Trending words" columns={WORD_COLUMNS} rowLabel={(w) => w.name} rowTestId="word-row" {...props} />;
}

export function KeywordTable(props: TableProps<MonitoredKeyword>) {
    return <DataTable label="Monitored keywords" columns={KEYWORD_COLUMNS} rowLabel={(k) => k.name} rowTestId="keyword-row" {...props} />;
}

export function SourceTable(props: TableProps<Source>) {
    return <DataTable label="Sources" columns={SOURCE_COLUMNS} rowLabel={(s) => hostOf(s.url)} rowTestId="source-row" {...props} />;
}

export function BannedTable(props: TableProps<BannedWord>) {
    return <DataTable label="Banned words" columns={BANNED_COLUMNS} rowLabel={(b) => b.name} rowTestId="banned-row" {...props} />;
}
