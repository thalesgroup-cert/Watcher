import type { ReactNode } from 'react';
import { Box, Stack, Tooltip, Typography } from '@mui/material';
import CheckCircle from '@mui/icons-material/CheckCircle';
import ChatBubbleOutlined from '@mui/icons-material/ChatBubbleOutlined';
import PersonOutlined from '@mui/icons-material/PersonOutlined';
import { type Column, DataTable, type RowSelection } from '../../../ui/DataTable';
import { LastActorAvatar } from '../../timeline/components/LastActor';
import { formatDay } from '../expiry';
import type { LegitimateDomain } from '../types';
import { Expiry } from './Expiry';

function DayText({ value }: { value: string | null }) {
    return value ? (
        <Typography variant="body2" noWrap>
            {formatDay(value)}
        </Typography>
    ) : (
        <Typography variant="body2" color="text.disabled">
            -
        </Typography>
    );
}

function DomainCell({ domain }: { domain: LegitimateDomain }) {
    const meta = [domain.contact, domain.ticket_id && `#${domain.ticket_id}`].filter(Boolean).join(' - ');
    return (
        <Box sx={{ minWidth: 0 }}>
            <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
                <Typography sx={{ fontWeight: 600 }} noWrap>
                    {domain.domain_name}
                </Typography>
                {domain.comments && (
                    <Tooltip title={domain.comments} slotProps={{ tooltip: { sx: { whiteSpace: 'pre-wrap', maxWidth: 360 } } }}>
                        <ChatBubbleOutlined sx={{ fontSize: 14, color: 'text.secondary' }} aria-label="Has comments" />
                    </Tooltip>
                )}
            </Stack>
            {meta && (
                <Typography variant="caption" color="text.secondary" noWrap component="div">
                    {meta}
                </Typography>
            )}
        </Box>
    );
}

/** `internal`: only shown to signed-in users (the API does not send it to anonymous visitors). */
const COLUMNS: (Column<LegitimateDomain> & { internal?: boolean })[] = [
    { key: 'domain', label: 'Domain', sort: 'domain_name', cellSx: { maxWidth: 360 }, render: (d) => <DomainCell domain={d} /> },
    { key: 'expiry', label: 'Domain expiry', sort: 'expiry', width: 170, render: (d) => <Expiry value={d.expiry} /> },
    { key: 'ssl', label: 'Certificate expiry', sort: 'ssl_expiry', width: 170, render: (d) => <Expiry value={d.ssl_expiry} /> },
    { key: 'registered', label: 'Registered', sort: 'domain_created_at', width: 120, render: (d) => <DayText value={d.domain_created_at} /> },
    { key: 'added', label: 'Added', sort: 'created_at', width: 120, render: (d) => <DayText value={d.created_at} /> },
    {
        key: 'repurchased',
        label: 'Repurchased',
        sort: 'repurchased',
        internal: true,
        width: 110,
        align: 'center',
        render: (d) =>
            d.repurchased ? (
                <CheckCircle color="success" fontSize="small" aria-label="Repurchased" />
            ) : (
                <Box component="span" sx={{ color: 'text.disabled' }}>
                    -
                </Box>
            ),
    },
    {
        key: 'actor',
        label: (
            <Tooltip title="Last change by">
                <PersonOutlined sx={{ fontSize: 18, verticalAlign: 'middle' }} aria-label="Last change by" />
            </Tooltip>
        ),
        internal: true,
        width: 56,
        align: 'center',
        render: (d) => (d.last_event ? <LastActorAvatar event={d.last_event} /> : null),
    },
];

interface DomainTableProps {
    rows: LegitimateDomain[];
    loading: boolean;
    showInternal: boolean;
    ordering: string;
    onOrderingChange: (ordering: string) => void;
    /** Omitted when the user cannot manage domains. */
    selection?: RowSelection;
    onOpen: (domain: LegitimateDomain) => void;
    /** Shown instead of the rows when there are none. */
    empty: ReactNode;
    /** Row whose drawer is open. */
    activeId?: number | null;
    highlight?: string;
}

export function DomainTable({ showInternal, ...props }: DomainTableProps) {
    return (
        <DataTable
            label="Legitimate domains"
            columns={COLUMNS.filter((c) => showInternal || !c.internal)}
            rowLabel={(d) => d.domain_name}
            rowTestId="domain-row"
            {...props}
        />
    );
}
