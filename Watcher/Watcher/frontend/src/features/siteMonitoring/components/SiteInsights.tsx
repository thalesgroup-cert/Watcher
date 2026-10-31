import { Box, Skeleton } from '@mui/material';
import { BarChart } from '@mui/x-charts/BarChart';
import LanguageOutlined from '@mui/icons-material/LanguageOutlined';
import { ChartCard, RankedBars, useSeriesColor, countSeries } from '../../../ui/charts';
import { EmptyState } from '../../../ui/EmptyState';
import { CHANGE_KINDS, LEGITIMACY } from '../catalog';
import { useSiteStatistics } from '../hooks';
import type { ChangeKind } from '../types';

const dayLabel = (iso: string) => {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
};

interface SiteInsightsProps {
    onLegitimacy: (level: number) => void;
    onKind: (kind: ChangeKind) => void;
}

/** Insights tab: when changes are detected and of what kind, how the websites are rated, who registers them. */
export function SiteInsights({ onLegitimacy, onKind }: SiteInsightsProps) {
    const { data: stats } = useSiteStatistics();
    const color = useSeriesColor(0);
    if (!stats) {
        return (
            <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', lg: '2fr 1fr' } }}>
                <Skeleton variant="rounded" height={360} />
                <Skeleton variant="rounded" height={360} />
            </Box>
        );
    }
    const recent = stats.alertsPerDay.reduce((n, d) => n + d.count, 0);
    return (
        <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', lg: '2fr 1fr' } }}>
            <Box sx={{ gridRow: { lg: 'span 2' } }}>
                <ChartCard title="Changes per day" subtitle="Changes detected on the monitored websites over the last 30 days.">
                    {recent === 0 ? (
                        <EmptyState icon={<LanguageOutlined />} title="No change in the last 30 days" />
                    ) : (
                        <Box sx={{ height: { xs: 280, lg: 400 } }} data-testid="per-day-chart">
                            <BarChart
                                xAxis={[{ scaleType: 'band', data: stats.alertsPerDay.map((d) => dayLabel(d.date)), categoryGapRatio: 0.35 }]}
                                yAxis={[{ tickMinStep: 1, width: 36 }]}
                                series={countSeries([{ data: stats.alertsPerDay.map((d) => d.count), label: 'Changes', color }])}
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
            <ChartCard title="Legitimacy" subtitle="How the monitored websites are rated. Click a level to list them.">
                <RankedBars
                    label="Websites by legitimacy"
                    items={LEGITIMACY.map((l) => ({
                        key: String(l.value),
                        label: l.short,
                        count: stats.byLegitimacy[String(l.value)] ?? 0,
                        actionLabel: `Show the ${l.label.toLowerCase()} websites`,
                        onClick: () => onLegitimacy(l.value),
                    }))}
                />
            </ChartCard>
            <ChartCard title="What changes" subtitle="Every change detected, by kind (a change can be of several kinds).">
                <RankedBars
                    label="Changes by kind"
                    items={CHANGE_KINDS.map((k) => ({
                        key: k.value,
                        label: k.label,
                        count: stats.alertsByKind[k.value] ?? 0,
                        actionLabel: `Show the ${k.label.toLowerCase()} changes`,
                        onClick: () => onKind(k.value),
                    }))}
                />
            </ChartCard>
            {stats.topRegistrars.length > 0 && (
                <Box sx={{ gridColumn: { lg: '1 / -1' } }}>
                    <ChartCard title="Registrars" subtitle="Where the monitored domains are registered.">
                        <RankedBars label="Top registrars" items={stats.topRegistrars.map((r) => ({ key: r.name, label: r.name, count: r.count }))} />
                    </ChartCard>
                </Box>
            )}
        </Box>
    );
}
