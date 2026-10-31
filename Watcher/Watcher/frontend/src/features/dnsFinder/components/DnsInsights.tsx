import { Box, Skeleton, Stack } from '@mui/material';
import { BarChart } from '@mui/x-charts/BarChart';
import DnsOutlined from '@mui/icons-material/DnsOutlined';
import { ChartCard, RankedBars, SERIES, countSeries } from '../../../ui/charts';
import { EmptyState } from '../../../ui/EmptyState';
import { useTheme } from '@mui/material/styles';
import { SOURCES, STATUSES } from '../catalog';
import { useAssets, useDnsStatistics } from '../hooks';
import type { ThreatFilters } from '../types';

const dayLabel = (iso: string) => {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
};

const TOP = { page: 1, pageSize: 8, ordering: '-threats_count' };

/** Insights tab: when threats come in and from which source, their status, and the assets that draw them. */
export function DnsInsights({ onFilter }: { onFilter: (patch: Partial<ThreatFilters>) => void }) {
    const { data: stats } = useDnsStatistics();
    const { data: domains } = useAssets('domain', '', TOP);
    const { data: keywords } = useAssets('keyword', '', TOP);
    const colors = SERIES[useTheme().palette.mode];
    if (!stats) {
        return (
            <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', lg: '2fr 1fr' } }}>
                <Skeleton variant="rounded" height={360} />
                <Skeleton variant="rounded" height={360} />
            </Box>
        );
    }
    const recent = stats.perDay.reduce((n, d) => n + d.dnstwist + d.certstream_keyword + d.subdomain_takeover, 0);
    const assets = [
        ...(domains?.results ?? []).map((a) => ({ ...a, prefix: 'd' })),
        ...(keywords?.results ?? []).map((a) => ({ ...a, prefix: 'k' })),
    ]
        .filter((a) => a.threats_count > 0)
        .sort((a, b) => b.threats_count - a.threats_count)
        .slice(0, 8);

    return (
        <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', lg: '2fr 1fr' } }}>
            <Box sx={{ gridRow: { lg: 'span 2' } }}>
                <ChartCard title="Threats per day" subtitle="New threats over the last 30 days, by source.">
                    {recent === 0 ? (
                        <EmptyState icon={<DnsOutlined />} title="No threat in the last 30 days" />
                    ) : (
                        <Box sx={{ height: { xs: 300, lg: 420 } }} data-testid="per-day-chart">
                            <BarChart
                                xAxis={[{ scaleType: 'band', data: stats.perDay.map((d) => dayLabel(d.date)), categoryGapRatio: 0.35 }]}
                                yAxis={[{ tickMinStep: 1, width: 56 }]}
                                series={countSeries(SOURCES.map((s, i) => ({
                                    data: stats.perDay.map((d) => d[s.value]),
                                    label: s.label,
                                    color: colors[i],
                                    stack: 'sources',
                                })))}
                                borderRadius={2}
                                grid={{ horizontal: true }}
                                margin={{ left: 0, right: 8, top: 8, bottom: 0 }}
                                slotProps={{ legend: { position: { vertical: 'top', horizontal: 'end' } } }}
                                sx={{ '& .MuiChartsGrid-line': { strokeDasharray: '2 4', opacity: 0.6 } }}
                            />
                        </Box>
                    )}
                </ChartCard>
            </Box>
            <ChartCard title="Status" subtitle="Every threat by triage status. Click one to list them.">
                <RankedBars
                    label="Threats by status"
                    items={STATUSES.map((s) => ({
                        key: s.value,
                        label: s.label,
                        count: stats.byStatus[s.value] ?? 0,
                        actionLabel: `Show the ${s.label.toLowerCase()} threats`,
                        onClick: () => onFilter({ status: s.value }),
                    }))}
                />
            </ChartCard>
            <ChartCard title="Watched assets" subtitle="Domains and keywords with the most threats.">
                {!domains || !keywords ? (
                    <Skeleton variant="rounded" height={180} />
                ) : assets.length === 0 ? (
                    <EmptyState icon={<DnsOutlined />} title="No threat yet" />
                ) : (
                    <RankedBars
                        label="Top assets"
                        items={assets.map((a) => ({
                            key: `${a.prefix}${a.id}`,
                            label: a.name,
                            count: a.threats_count,
                            actionLabel: `Show the threats of ${a.name}`,
                            onClick: () => onFilter({ asset: `${a.prefix}:${a.name}`, status: 'all' }),
                        }))}
                    />
                )}
            </ChartCard>
            {(stats.topIssuers.length > 0 || stats.topFuzzers.length > 0) && (
                <Box sx={{ gridColumn: { lg: '1 / -1' } }}>
                    <Stack direction={{ xs: 'column', lg: 'row' }} spacing={2}>
                        {stats.topIssuers.length > 0 && (
                            <Box sx={{ flex: 1 }}>
                                <ChartCard title="Certificate issuers" subtitle="Who issued the certificates matching your keywords.">
                                    <RankedBars label="Top issuers" items={stats.topIssuers.map((t) => ({ key: t.name, label: t.name, count: t.count }))} />
                                </ChartCard>
                            </Box>
                        )}
                        {stats.topFuzzers.length > 0 && (
                            <Box sx={{ flex: 1 }}>
                                <ChartCard title="Look-alike techniques" subtitle="How the look-alike domains differ from yours.">
                                    <RankedBars label="Top techniques" items={stats.topFuzzers.map((t) => ({ key: t.name, label: t.name, count: t.count }))} />
                                </ChartCard>
                            </Box>
                        )}
                    </Stack>
                </Box>
            )}
        </Box>
    );
}
