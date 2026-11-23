import type { ReactNode } from 'react';
import { Box, ButtonBase, Skeleton, Stack, Typography } from '@mui/material';
import { BarChart } from '@mui/x-charts/BarChart';
import CheckCircleOutlined from '@mui/icons-material/CheckCircleOutlined';
import ErrorOutlined from '@mui/icons-material/ErrorOutlined';
import HelpOutlined from '@mui/icons-material/HelpOutlined';
import PendingOutlined from '@mui/icons-material/PendingOutlined';
import WarningAmberOutlined from '@mui/icons-material/WarningAmberOutlined';
import { ChartCard, RankedBars, useChartPalette, useSeriesColor, countSeries } from '../../../ui/charts';
import { EmptyState } from '../../../ui/EmptyState';
import { EXPIRING_SOON_DAYS, STATUS_META } from '../expiry';
import { useDomainStatistics } from '../hooks';
import type { DomainFilters, DomainStatistics, ExpiryStatus } from '../types';

/** The colour of each expiry status, from the chart palette in use. */
const statusFills = (status: ReturnType<typeof useChartPalette>['status']): Record<ExpiryStatus, string> => ({
    valid: status.good,
    expiring_soon: status.warning,
    unconfirmed: status.warning,
    expired: status.critical,
    none: status.neutral,
});
const STATUS_ICON: Record<ExpiryStatus, ReactNode> = {
    valid: <CheckCircleOutlined />,
    expiring_soon: <WarningAmberOutlined />,
    unconfirmed: <PendingOutlined />,
    expired: <ErrorOutlined />,
    none: <HelpOutlined />,
};
const STATUS_ORDER: ExpiryStatus[] = ['valid', 'expiring_soon', 'expired', 'unconfirmed', 'none'];
/** A certificate has no registry to confirm it: it is never "unconfirmed". */
const CERTIFICATE_ORDER = STATUS_ORDER.filter((s) => s !== 'unconfirmed');

const monthLabel = (month: string) => {
    const [y, m] = month.split('-').map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' });
};

function UpcomingChart({ stats }: { stats: DomainStatistics }) {
    const colors = { domains: useSeriesColor(0), certificates: useSeriesColor(1) };
    const total = stats.upcoming.reduce((n, m) => n + m.domains + m.certificates, 0);
    if (total === 0) {
        return <EmptyState icon={<CheckCircleOutlined />} title="Nothing expires in the next 12 months" />;
    }
    return (
        <Box sx={{ height: { xs: 280, lg: 400 } }} data-testid="upcoming-chart">
            <BarChart
                xAxis={[{ scaleType: 'band', data: stats.upcoming.map((m) => monthLabel(m.month)), categoryGapRatio: 0.45, barGapRatio: 0.15 }]}
                yAxis={[{ tickMinStep: 1, width: 32 }]}
                series={countSeries([
                    { data: stats.upcoming.map((m) => m.domains), label: 'Domains', color: colors.domains },
                    { data: stats.upcoming.map((m) => m.certificates), label: 'Certificates', color: colors.certificates },
                ])}
                borderRadius={4}
                grid={{ horizontal: true }}
                margin={{ left: 0, right: 8, top: 8, bottom: 0 }}
                slotProps={{ legend: { position: { vertical: 'top', horizontal: 'end' } } }}
                sx={{ '& .MuiChartsGrid-line': { strokeDasharray: '2 4', opacity: 0.6 } }}
            />
        </Box>
    );
}

interface Breakdown {
    label: string;
    counts: Record<ExpiryStatus, number>;
    onSelect: (status: ExpiryStatus) => void;
    /** The statuses that exist for this kind of expiry, in display order. */
    order?: ExpiryStatus[];
}

/** One part-to-whole bar per kind of expiry, with every segment labelled below it (a click filters the list). */
function StatusBreakdown({ label, counts, onSelect, order = STATUS_ORDER }: Breakdown) {
    const STATUS_FILL = statusFills(useChartPalette().status);
    const total = order.reduce((n, s) => n + counts[s], 0);
    const present = order.filter((s) => counts[s] > 0);
    return (
        <Box>
            <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.75 }}>
                {label}
            </Typography>
            <Box sx={{ display: 'flex', gap: '2px', height: 12, borderRadius: 1, overflow: 'hidden', bgcolor: 'action.hover' }} aria-hidden>
                {present.map((s) => (
                    <Box key={s} title={`${STATUS_META[s].label}: ${counts[s]}`} sx={{ flexGrow: counts[s], bgcolor: STATUS_FILL[s] }} />
                ))}
            </Box>
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 0.5, mt: 1 }}>
                {order.map((s) => (
                    <ButtonBase
                        key={s}
                        onClick={() => onSelect(s)}
                        disabled={counts[s] === 0}
                        aria-label={`${label}: ${counts[s]} ${STATUS_META[s].label.toLowerCase()}, show them`}
                        sx={{ justifyContent: 'flex-start', gap: 0.75, px: 0.75, py: 0.5, borderRadius: 1, '&:hover': { bgcolor: 'action.hover' } }}
                    >
                        <Box sx={{ color: STATUS_FILL[s], display: 'grid', '& svg': { fontSize: 16 } }}>{STATUS_ICON[s]}</Box>
                        <Typography variant="body2" color={counts[s] ? 'text.primary' : 'text.disabled'}>
                            {STATUS_META[s].label}
                        </Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ ml: 'auto', fontVariantNumeric: 'tabular-nums' }}>
                            {counts[s].toLocaleString('en-GB')}
                            {total > 0 && ` - ${Math.round((counts[s] / total) * 100)}%`}
                        </Typography>
                    </ButtonBase>
                ))}
            </Box>
        </Box>
    );
}

function TopTlds({ stats }: { stats: DomainStatistics }) {
    if (stats.topTlds.length === 0) return <EmptyState icon={<HelpOutlined />} title="No domains yet" />;
    return <RankedBars label="Top extensions" items={stats.topTlds.map((t) => ({ key: t.tld, label: t.tld, count: t.count }))} />;
}

/** Insights tab: what needs renewing and when, the state of the registry, and its extensions. */
export function DomainInsights({ onFilter }: { onFilter: (patch: Partial<DomainFilters>) => void }) {
    const { data: stats } = useDomainStatistics();
    if (!stats) {
        return (
            <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', lg: '2fr 1fr' } }}>
                <Skeleton variant="rounded" height={360} />
                <Skeleton variant="rounded" height={360} />
            </Box>
        );
    }
    const unconfirmed = stats.unconfirmed ?? 0; // an older server does not send it
    const domainCounts = {
        expired: stats.expired,
        unconfirmed,
        expiring_soon: stats.expiringSoon,
        none: stats.noExpiry,
        valid: stats.total - stats.expired - unconfirmed - stats.expiringSoon - stats.noExpiry,
    };
    const certificateCounts = {
        expired: stats.sslExpired,
        unconfirmed: 0,
        expiring_soon: stats.sslExpiringSoon,
        none: stats.sslNoExpiry,
        valid: stats.total - stats.sslExpired - stats.sslExpiringSoon - stats.sslNoExpiry,
    };

    return (
        <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', lg: '2fr 1fr' } }}>
            <Box sx={{ gridRow: { lg: 'span 2' } }}>
                <ChartCard title="Renewals ahead" subtitle="Domains and certificates expiring each month, over the next 12 months.">
                    <UpcomingChart stats={stats} />
                </ChartCard>
            </Box>
            <ChartCard title="Status" subtitle={`Expiring soon = within ${EXPIRING_SOON_DAYS} days. Click a line to list those domains.`}>
                <Stack spacing={2.5}>
                    <StatusBreakdown label="Domain registration" counts={domainCounts} onSelect={(status) => onFilter({ status })} />
                    <StatusBreakdown label="Certificate" counts={certificateCounts} order={CERTIFICATE_ORDER} onSelect={(ssl) => onFilter({ ssl })} />
                </Stack>
            </ChartCard>
            <ChartCard title="Extensions" subtitle="Most common top-level domains.">
                <TopTlds stats={stats} />
            </ChartCard>
        </Box>
    );
}
