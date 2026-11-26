import type { ReactNode } from 'react';
import { Box, Chip, IconButton, Stack, Tooltip, Typography } from '@mui/material';
import ArticleOutlined from '@mui/icons-material/ArticleOutlined';
import OpenInNew from '@mui/icons-material/OpenInNew';
import PersonOutlined from '@mui/icons-material/PersonOutlined';
import { fonts } from '../../../styles/theme';
import { type Column, DataTable, type RowSelection } from '../../../ui/DataTable';
import { LastActorAvatar } from '../../timeline/components/LastActor';
import { findingTitle } from '../format';
import type { Alert, Pattern, PatternRef } from '../types';
import { When } from '../../../ui/When';

export function PatternChip({ pattern, onClick }: { pattern: PatternRef; onClick?: () => void }) {
    return (
        <Chip
            size="small"
            variant="outlined"
            label={pattern.name}
            onClick={onClick}
            title={pattern.is_regex ? 'Regular expression' : 'Keyword'}
            sx={{ fontFamily: fonts.mono, fontSize: 12, maxWidth: 220 }}
        />
    );
}

const ALERT_COLUMNS: Column<Alert>[] = [
    {
        key: 'finding',
        label: 'Finding',
        sort: 'url',
        cellSx: { maxWidth: 480 },
        render: (a) => (
            <Box sx={{ minWidth: 0 }}>
                <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
                    <Typography sx={{ fontWeight: a.status ? 600 : 400 }} noWrap>
                        {findingTitle(a.url)}
                    </Typography>
                    {a.has_content && (
                        <Tooltip title="Raw content captured">
                            <ArticleOutlined sx={{ fontSize: 15, color: 'text.secondary' }} aria-label="Raw content captured" />
                        </Tooltip>
                    )}
                </Stack>
                <Typography variant="caption" color="text.secondary" noWrap component="div">
                    {a.url}
                </Typography>
            </Box>
        ),
    },
    { key: 'pattern', label: 'Pattern', sort: 'keyword__name', width: 200, render: (a) => <PatternChip pattern={a.keyword} /> },
    {
        key: 'source',
        label: 'Source',
        width: 170,
        render: (a) => (
            <Typography variant="body2" noWrap>
                {a.source}
            </Typography>
        ),
    },
    { key: 'found', label: 'Found', sort: 'created_at', width: 140, render: (a) => <When iso={a.created_at} /> },
    {
        key: 'open',
        label: '',
        width: 48,
        align: 'center',
        render: (a) => (
            <Tooltip title="Open the source in a new tab">
                <IconButton
                    size="small"
                    component="a"
                    href={a.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e: React.MouseEvent) => e.stopPropagation()}
                    aria-label={`Open ${a.url}`}
                >
                    <OpenInNew fontSize="small" />
                </IconButton>
            </Tooltip>
        ),
    },
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

export function AlertTable(props: TableProps<Alert>) {
    return (
        <DataTable
            label="Alerts"
            columns={ALERT_COLUMNS}
            rowLabel={(a) => `alert #${a.id}`}
            rowTestId="alert-row"
            {...props}
        />
    );
}

const PATTERN_COLUMNS: Column<Pattern>[] = [
    {
        key: 'pattern',
        label: 'Pattern',
        sort: 'name',
        cellSx: { maxWidth: 420 },
        render: (p) => (
            <Box sx={{ minWidth: 0 }}>
                <Typography sx={{ fontFamily: fonts.mono, fontWeight: 600, fontSize: 13 }} noWrap>
                    {p.name}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                    {p.is_regex ? 'Regular expression' : 'Keyword'}
                </Typography>
            </Box>
        ),
    },
    {
        key: 'active',
        label: 'To review',
        sort: 'active_alerts_count',
        width: 110,
        align: 'right',
        render: (p) => (
            <Typography variant="body2" sx={{ fontWeight: p.active_alerts_count ? 700 : 400, fontVariantNumeric: 'tabular-nums' }}>
                {p.active_alerts_count.toLocaleString('en-GB')}
            </Typography>
        ),
    },
    {
        key: 'total',
        label: 'Alerts',
        sort: 'alerts_count',
        width: 100,
        align: 'right',
        render: (p) => (
            <Typography variant="body2" color="text.secondary" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                {p.alerts_count.toLocaleString('en-GB')}
            </Typography>
        ),
    },
    {
        key: 'last',
        label: 'Last alert',
        sort: 'last_alert_at',
        width: 150,
        render: (p) =>
            p.last_alert_at ? (
                <When iso={p.last_alert_at} />
            ) : (
                <Typography variant="body2" color="text.disabled">
                    Never
                </Typography>
            ),
    },
    { key: 'added', label: 'Added', sort: 'created_at', width: 140, render: (p) => <When iso={p.created_at} /> },
    {
        key: 'actor',
        label: (
            <Tooltip title="Last change by">
                <PersonOutlined sx={{ fontSize: 18, verticalAlign: 'middle' }} aria-label="Last change by" />
            </Tooltip>
        ),
        width: 56,
        align: 'center',
        render: (p) => (p.last_event ? <LastActorAvatar event={p.last_event} /> : null),
    },
];

export function PatternTable(props: TableProps<Pattern>) {
    return (
        <DataTable
            label="Search patterns"
            columns={PATTERN_COLUMNS}
            rowLabel={(p) => p.name}
            rowTestId="pattern-row"
            {...props}
        />
    );
}
