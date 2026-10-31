import type { ReactNode } from 'react';
import { Box, Chip, IconButton, Stack, Tooltip, Typography } from '@mui/material';
import OpenInNew from '@mui/icons-material/OpenInNew';
import PauseCircleOutline from '@mui/icons-material/PauseCircleOutlined';
import PersonOutlined from '@mui/icons-material/PersonOutlined';
import PlayCircleOutline from '@mui/icons-material/PlayCircleOutlined';
import { fonts } from '../../../styles/theme';
import { type Column, DataTable, type RowSelection } from '../../../ui/DataTable';
import { LastActorAvatar } from '../../timeline/components/LastActor';
import { countryLabel, isKnownSector, matchLabel, scopeMeta, severityMeta } from '../catalog';
import type { Cve, Match, Rule, Severity, Victim } from '../types';
import { When } from '../../../ui/When';

/** Severity with its CVSS score; the label is always written, never colour alone. */
export function SeverityChip({ severity, score }: { severity: Severity; score?: number | null }) {
    const meta = severityMeta(severity);
    const label = severity ? `${meta.label}${score != null ? ` - ${score.toFixed(1)}` : ''}` : meta.label;
    return <Chip size="small" color={meta.color} variant={severity === 'CRITICAL' || severity === 'HIGH' ? 'filled' : 'outlined'} label={label} title={meta.range} />;
}

export function KeywordChip({ keyword, onClick }: { keyword: string; onClick?: () => void }) {
    return <Chip size="small" variant="outlined" label={keyword} onClick={onClick} sx={{ fontFamily: fonts.mono, fontSize: 12, maxWidth: 200 }} />;
}

export function GroupChip({ name, onClick }: { name: string; onClick?: () => void }) {
    return <Chip size="small" color="error" variant="outlined" label={name} onClick={onClick} sx={{ maxWidth: 180 }} />;
}

/** Number of matches still to review, quiet when there are none. */
export function OpenCount({ n, label }: { n: number; label: string }) {
    if (!n) {
        return (
            <Typography variant="body2" color="text.disabled">
                -
            </Typography>
        );
    }
    return <Chip size="small" color="warning" label={n} aria-label={`${n} ${label}`} sx={{ fontWeight: 700, minWidth: 32 }} />;
}

const MATCH_COLUMNS: Column<Match>[] = [
    {
        key: 'match',
        label: 'Match',
        sort: 'object_id',
        cellSx: { maxWidth: 460 },
        render: (m) => {
            const t = m.target;
            const caption = t?.kind === 'victim' ? [t.group_name, countryLabel(t.country), isKnownSector(t.sector) ? t.sector : ''].filter(Boolean).join(' - ') : m.hit_display.replace(/^CVE-\S+ - /, '');
            return (
                <Box sx={{ minWidth: 0 }}>
                    <Typography sx={{ fontWeight: m.is_archived ? 400 : 600, fontFamily: m.hit_type === 'cve' ? fonts.mono : undefined }} noWrap>
                        {m.hit_type === 'cve' ? m.object_id : t?.kind === 'victim' ? t.victim_name : matchLabel(m.object_id)}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" noWrap component="div">
                        {caption}
                    </Typography>
                </Box>
            );
        },
    },
    {
        key: 'kind',
        label: 'Severity / sector',
        width: 170,
        render: (m) =>
            m.target?.kind === 'cve' ? (
                <SeverityChip severity={m.target.severity} score={m.target.cvss_score} />
            ) : (
                <Chip size="small" variant="outlined" label="Ransomware victim" />
            ),
    },
    {
        key: 'rule',
        label: 'Rule',
        sort: 'rule__name',
        width: 260,
        render: (m) => (
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center', minWidth: 0 }}>
                <Typography variant="body2" noWrap sx={{ minWidth: 0 }}>
                    {m.rule_name}
                </Typography>
                <KeywordChip keyword={m.matched_keyword} />
            </Stack>
        ),
    },
    { key: 'when', label: 'Matched', sort: 'hit_at', width: 130, render: (m) => <When iso={m.hit_at} /> },
];

const nvd = (cveId: string) => `https://nvd.nist.gov/vuln/detail/${cveId}`;

const CVE_COLUMNS: Column<Cve>[] = [
    {
        key: 'cve',
        label: 'CVE',
        sort: 'cve_id',
        cellSx: { maxWidth: 560 },
        render: (c) => (
            <Box sx={{ minWidth: 0 }}>
                <Typography sx={{ fontWeight: 600, fontFamily: fonts.mono }} noWrap>
                    {c.cve_id}
                </Typography>
                <Typography variant="caption" color="text.secondary" noWrap component="div">
                    {c.description || 'No description yet'}
                </Typography>
            </Box>
        ),
    },
    { key: 'severity', label: 'Severity', sort: 'cvss_score', width: 150, render: (c) => <SeverityChip severity={c.severity} score={c.cvss_score} /> },
    { key: 'published', label: 'Published', sort: 'published', width: 130, render: (c) => <When iso={c.published} /> },
    { key: 'hits', label: 'Rules matched', sort: 'hits_count', width: 120, align: 'center', render: (c) => <OpenCount n={c.hits_count} label="matches to review" /> },
    {
        key: 'open',
        label: '',
        width: 48,
        align: 'center',
        render: (c) => (
            <Tooltip title="Open on NVD">
                <IconButton size="small" href={nvd(c.cve_id)} target="_blank" rel="noopener noreferrer" aria-label={`Open ${c.cve_id} on NVD`} onClick={(e) => e.stopPropagation()}>
                    <OpenInNew fontSize="small" />
                </IconButton>
            </Tooltip>
        ),
    },
];

const VICTIM_COLUMNS: Column<Victim>[] = [
    {
        key: 'victim',
        label: 'Victim',
        sort: 'victim_name',
        cellSx: { maxWidth: 380 },
        render: (v) => (
            <Box sx={{ minWidth: 0 }}>
                <Typography sx={{ fontWeight: 600 }} noWrap>
                    {v.victim_name}
                </Typography>
                <Typography variant="caption" color="text.secondary" noWrap component="div">
                    {isKnownSector(v.sector) ? v.sector : 'Sector unknown'}
                </Typography>
            </Box>
        ),
    },
    { key: 'group', label: 'Group', sort: 'group__name', width: 190, render: (v) => <GroupChip name={v.group_name} /> },
    {
        key: 'country',
        label: 'Country',
        sort: 'country',
        width: 180,
        render: (v) => (
            <Typography variant="body2" noWrap color={v.country ? 'text.primary' : 'text.disabled'}>
                {countryLabel(v.country) || 'Unknown'}
            </Typography>
        ),
    },
    { key: 'attacked', label: 'Posted', sort: 'attacked_at', width: 130, render: (v) => <When iso={v.attacked_at} /> },
    { key: 'hits', label: 'Rules matched', sort: 'hits_count', width: 120, align: 'center', render: (v) => <OpenCount n={v.hits_count} label="matches to review" /> },
];

const RULE_COLUMNS: Column<Rule>[] = [
    {
        key: 'name',
        label: 'Rule',
        sort: 'name',
        cellSx: { maxWidth: 440 },
        render: (r) => (
            <Box sx={{ minWidth: 0 }}>
                <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
                    {r.is_active ? (
                        <PlayCircleOutline sx={{ fontSize: 16, color: 'success.main' }} aria-label="Active" />
                    ) : (
                        <PauseCircleOutline sx={{ fontSize: 16, color: 'text.disabled' }} aria-label="Paused" />
                    )}
                    <Typography sx={{ fontWeight: 600 }} color={r.is_active ? 'text.primary' : 'text.secondary'} noWrap>
                        {r.name}
                    </Typography>
                </Stack>
                <Typography variant="caption" color="text.secondary" noWrap component="div" sx={{ fontFamily: fonts.mono }}>
                    {r.keywords.join(', ')}
                    {r.exceptions.length > 0 && ` - except ${r.exceptions.join(', ')}`}
                </Typography>
            </Box>
        ),
    },
    {
        key: 'scope',
        label: 'Watches',
        sort: 'scope',
        width: 170,
        render: (r) => (
            <Typography variant="body2" noWrap>
                {scopeMeta(r.scope).label}
            </Typography>
        ),
    },
    { key: 'open', label: 'To review', sort: 'open_hits_count', width: 110, align: 'center', render: (r) => <OpenCount n={r.open_hits_count} label="matches to review" /> },
    {
        key: 'hits',
        label: 'All matches',
        sort: 'hits_count',
        width: 120,
        align: 'center',
        render: (r) => (
            <Typography variant="body2" color="text.secondary" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                {r.hits_count.toLocaleString('en-GB')}
            </Typography>
        ),
    },
    { key: 'last', label: 'Last match', sort: 'last_hit_at', width: 130, render: (r) => <When iso={r.last_hit_at} empty="Never" /> },
    {
        key: 'actor',
        label: (
            <Tooltip title="Last change by">
                <PersonOutlined sx={{ fontSize: 18, verticalAlign: 'middle' }} aria-label="Last change by" />
            </Tooltip>
        ),
        width: 56,
        align: 'center',
        render: (r) => r.last_event && <LastActorAvatar event={r.last_event} />,
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

export function MatchTable(props: TableProps<Match>) {
    return <DataTable label="Watch rule matches" columns={MATCH_COLUMNS} rowLabel={(m) => matchLabel(m.object_id)} rowTestId="match-row" {...props} />;
}

export function CveTable(props: TableProps<Cve>) {
    return <DataTable label="CVEs" columns={CVE_COLUMNS} rowLabel={(c) => c.cve_id} rowTestId="cve-row" {...props} />;
}

export function VictimTable(props: TableProps<Victim>) {
    return <DataTable label="Ransomware victims" columns={VICTIM_COLUMNS} rowLabel={(v) => v.victim_name} rowTestId="victim-row" {...props} />;
}

export function RuleTable(props: TableProps<Rule>) {
    return <DataTable label="Watch rules" columns={RULE_COLUMNS} rowLabel={(r) => r.name} rowTestId="rule-row" {...props} />;
}

export { nvd };
