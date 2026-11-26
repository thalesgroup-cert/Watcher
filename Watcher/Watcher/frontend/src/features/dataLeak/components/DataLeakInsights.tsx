import { Box, Skeleton } from '@mui/material';
import { BarChart } from '@mui/x-charts/BarChart';
import TravelExploreOutlined from '@mui/icons-material/TravelExploreOutlined';
import { ChartCard, RankedBars, useSeriesColor, countSeries } from '../../../ui/charts';
import { EmptyState } from '../../../ui/EmptyState';
import { useDataLeakStatistics } from '../hooks';
import type { AlertFilters } from '../types';

const dayLabel = (iso: string) => {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
};

/** Insights tab: when alerts come in, which patterns and which sites produce them. A click filters the alerts. */
export function DataLeakInsights({ onFilter }: { onFilter: (patch: Partial<AlertFilters>) => void }) {
    const { data: stats } = useDataLeakStatistics();
    const color = useSeriesColor(0);
    if (!stats) {
        return (
            <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', lg: '2fr 1fr' } }}>
                <Skeleton variant="rounded" height={360} />
                <Skeleton variant="rounded" height={360} />
            </Box>
        );
    }
    const recent = stats.perDay.reduce((n, d) => n + d.count, 0);

    return (
        <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', lg: '2fr 1fr' } }}>
            <Box sx={{ gridRow: { lg: 'span 2' } }}>
                <ChartCard title="Alerts per day" subtitle="New findings over the last 30 days, archived ones included.">
                    {recent === 0 ? (
                        <EmptyState icon={<TravelExploreOutlined />} title="No alert in the last 30 days" />
                    ) : (
                        <Box sx={{ height: { xs: 280, lg: 400 } }} data-testid="per-day-chart">
                            <BarChart
                                xAxis={[{ scaleType: 'band', data: stats.perDay.map((d) => dayLabel(d.date)), categoryGapRatio: 0.35 }]}
                                yAxis={[{ tickMinStep: 1, width: 36 }]}
                                series={countSeries([{ data: stats.perDay.map((d) => d.count), label: 'Alerts', color }])}
                                hideLegend
                                borderRadius={4}
                                grid={{ horizontal: true }}
                                margin={{ left: 0, right: 8, top: 8, bottom: 0 }}
                                sx={{ '& .MuiChartsGrid-line': { strokeDasharray: '2 4', opacity: 0.6 } }}
                            />
                        </Box>
                    )}
                </ChartCard>
            </Box>
            <ChartCard title="Patterns" subtitle="Patterns with the most alerts. Click one to list its alerts.">
                {stats.topKeywords.length === 0 ? (
                    <EmptyState icon={<TravelExploreOutlined />} title="No alert yet" />
                ) : (
                    <RankedBars
                        label="Top patterns"
                        items={stats.topKeywords.map((k) => ({
                            key: String(k.id),
                            label: k.name,
                            count: k.count,
                            actionLabel: `Show the ${k.count} alert${k.count === 1 ? '' : 's'} of ${k.name}`,
                            onClick: () => onFilter({ keyword: String(k.id), status: 'all' }),
                        }))}
                    />
                )}
            </ChartCard>
            <ChartCard title="Sources" subtitle="Sites where the patterns were found most often.">
                {stats.topSources.length === 0 ? (
                    <EmptyState icon={<TravelExploreOutlined />} title="No alert yet" />
                ) : (
                    <RankedBars
                        label="Top sources"
                        items={stats.topSources.slice(0, 8).map((s) => ({
                            key: s.source,
                            label: s.source,
                            count: s.count,
                            actionLabel: `Show the ${s.count} alert${s.count === 1 ? '' : 's'} from ${s.source}`,
                            onClick: () => onFilter({ source: s.source, status: 'all' }),
                        }))}
                    />
                )}
            </ChartCard>
        </Box>
    );
}
