import type { ReactNode } from 'react';
import { Box, Chip, Stack, Tooltip, Typography } from '@mui/material';
import CloudDoneOutlined from '@mui/icons-material/CloudDoneOutlined';
import PersonOutlined from '@mui/icons-material/PersonOutlined';
import { type Column, DataTable, type RowSelection } from '../../../ui/DataTable';
import { parseEventUuids } from '../../misp/MispExportDialog';
import { LastActorAvatar } from '../../timeline/components/LastActor';
import { sourceMeta, statusMeta, threatAsset, threatDetail } from '../catalog';
import type { Asset, AssetKind, Threat, ThreatSource, ThreatStatus } from '../types';
import { When } from '../../../ui/When';

export function StatusChip({ status }: { status: ThreatStatus }) {
    const meta = statusMeta(status);
    return <Chip size="small" label={meta.label} color={meta.color} variant={meta.open ? 'filled' : 'outlined'} />;
}

export function SourceLabel({ source }: { source: ThreatSource }) {
    const meta = sourceMeta(source);
    return (
        <Tooltip title={meta.description}>
            <Typography variant="body2" noWrap component="span">
                {meta.label}
            </Typography>
        </Tooltip>
    );
}

const THREAT_COLUMNS: Column<Threat>[] = [
    {
        key: 'domain',
        label: 'Domain',
        cellSx: { maxWidth: 440 },
        render: (t) => {
            const detail = threatDetail(t);
            return (
                <Box sx={{ minWidth: 0 }}>
                    <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
                        <Typography sx={{ fontWeight: 600 }} noWrap>
                            {t.domain_name}
                        </Typography>
                        {parseEventUuids(t.misp_event_uuid).length > 0 && (
                            <Tooltip title="Exported to MISP">
                                <CloudDoneOutlined sx={{ fontSize: 15, color: 'text.secondary' }} aria-label="Exported to MISP" />
                            </Tooltip>
                        )}
                    </Stack>
                    {detail && (
                        <Typography variant="caption" color="text.secondary" noWrap component="div">
                            {detail}
                        </Typography>
                    )}
                </Box>
            );
        },
    },
    { key: 'status', label: 'Status', sort: 'status', width: 130, render: (t) => <StatusChip status={t.status} /> },
    { key: 'source', label: 'Source', sort: 'source', width: 130, render: (t) => <SourceLabel source={t.source} /> },
    {
        key: 'asset',
        label: 'Matched',
        width: 200,
        render: (t) => (
            <Typography variant="body2" noWrap>
                {threatAsset(t) || '-'}
            </Typography>
        ),
    },
    { key: 'detected', label: 'Detected', sort: 'created_at', width: 140, render: (t) => <When iso={t.created_at} /> },
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

export function ThreatTable(props: TableProps<Threat>) {
    return <DataTable label="Threats" columns={THREAT_COLUMNS} rowLabel={(t) => t.domain_name} rowTestId="threat-row" {...props} />;
}

const count = (value: number | undefined, strong = false) => (
    <Typography variant="body2" color={strong ? 'text.primary' : 'text.secondary'} sx={{ fontWeight: strong && value ? 700 : 400, fontVariantNumeric: 'tabular-nums' }}>
        {(value ?? 0).toLocaleString('en-GB')}
    </Typography>
);

function assetColumns(kind: AssetKind): Column<Asset>[] {
    return [
        {
            key: 'name',
            label: kind === 'domain' ? 'Domain' : 'Keyword',
            sort: 'name',
            cellSx: { maxWidth: 380 },
            render: (a) => (
                <Typography sx={{ fontWeight: 600 }} noWrap>
                    {a.name}
                </Typography>
            ),
        },
        { key: 'open', label: 'Open threats', sort: 'open_threats_count', width: 130, align: 'right', render: (a) => count(a.open_threats_count, true) },
        ...(kind === 'domain'
            ? [{ key: 'takeover', label: 'Takeover risks', sort: 'takeover_count', width: 140, align: 'right', render: (a: Asset) => count(a.takeover_count, true) } as Column<Asset>]
            : []),
        { key: 'total', label: 'Threats', sort: 'threats_count', width: 110, align: 'right', render: (a) => count(a.threats_count) },
        {
            key: 'last',
            label: 'Last threat',
            sort: 'last_threat_at',
            width: 150,
            render: (a) =>
                a.last_threat_at ? (
                    <When iso={a.last_threat_at} />
                ) : (
                    <Typography variant="body2" color="text.disabled">
                        Never
                    </Typography>
                ),
        },
        { key: 'added', label: 'Added', sort: 'created_at', width: 130, render: (a) => <When iso={a.created_at} /> },
        {
            key: 'actor',
            label: (
                <Tooltip title="Last change by">
                    <PersonOutlined sx={{ fontSize: 18, verticalAlign: 'middle' }} aria-label="Last change by" />
                </Tooltip>
            ),
            width: 56,
            align: 'center',
            render: (a) => (a.last_event ? <LastActorAvatar event={a.last_event} /> : null),
        },
    ];
}

export function AssetTable({ kind, ...props }: TableProps<Asset> & { kind: AssetKind }) {
    return (
        <DataTable
            label={kind === 'domain' ? 'Monitored domains' : 'Keywords'}
            columns={assetColumns(kind)}
            rowLabel={(a) => a.name}
            rowTestId="asset-row"
            {...props}
        />
    );
}
