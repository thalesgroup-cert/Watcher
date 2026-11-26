import { Box, Skeleton } from '@mui/material';
import { BarChart } from '@mui/x-charts/BarChart';
import WhatshotOutlined from '@mui/icons-material/WhatshotOutlined';
import { ChartCard, RankedBars, useSeriesColor, countSeries } from '../../../ui/charts';
import { EmptyState } from '../../../ui/EmptyState';
import { CONFIDENCE, countryLabel } from '../catalog';
import { useThreatsStatistics } from '../hooks';

const dayLabel = (iso: string) => {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
};

interface ThreatsInsightsProps {
    onWord: (name: string) => void;
    onCountry: (code: string) => void;
    onConfidence: (value: number) => void;
}

/** Insights tab: how much is read and found each day, the top words, and the coverage of the sources. */
export function ThreatsInsights({ onWord, onCountry, onConfidence }: ThreatsInsightsProps) {
    const { data: stats } = useThreatsStatistics();
    const articles = useSeriesColor(0);
    const words = useSeriesColor(1);
    if (!stats) {
        return (
            <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', lg: '2fr 1fr' } }}>
                <Skeleton variant="rounded" height={360} />
                <Skeleton variant="rounded" height={360} />
            </Box>
        );
    }
    const labels = stats.articlesPerDay.map((d) => dayLabel(d.date));
    const any = (rows: { count: number }[]) => rows.some((d) => d.count > 0);

    // Two measures of different scale: two charts, never one with two axes.
    return (
        <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', lg: '2fr 1fr' } }}>
            <ChartCard title="Articles read per day" subtitle="New articles collected from the RSS sources over the last 30 days.">
                {any(stats.articlesPerDay) ? (
                    <Box sx={{ height: 240 }} data-testid="articles-chart">
                        <BarChart
                            xAxis={[{ scaleType: 'band', data: labels, categoryGapRatio: 0.35 }]}
                            yAxis={[{ tickMinStep: 1, width: 40 }]}
                            series={countSeries([{ data: stats.articlesPerDay.map((d) => d.count), label: 'Articles', color: articles }])}
                            hideLegend
                            borderRadius={4}
                            grid={{ horizontal: true }}
                            margin={{ left: 0, right: 8, top: 8, bottom: 0 }}
                        />
                    </Box>
                ) : (
                    <EmptyState icon={<WhatshotOutlined />} title="No article in the last 30 days" />
                )}
            </ChartCard>
            <ChartCard title="Top words" subtitle="Words with the most mentions. Click one to find it in the trends.">
                {stats.topWords.length ? (
                    <RankedBars
                        label="Top words"
                        items={stats.topWords.map((w) => ({ key: w.name, label: w.name, count: w.occurrences, actionLabel: `Show ${w.name} in the trends`, onClick: () => onWord(w.name) }))}
                    />
                ) : (
                    <EmptyState icon={<WhatshotOutlined />} title="Nothing trending yet" />
                )}
            </ChartCard>
            <ChartCard title="New trending words per day" subtitle="Words seen for the first time, over the last 30 days.">
                {any(stats.wordsPerDay) ? (
                    <Box sx={{ height: 200 }} data-testid="words-chart">
                        <BarChart
                            xAxis={[{ scaleType: 'band', data: labels, categoryGapRatio: 0.35 }]}
                            yAxis={[{ tickMinStep: 1, width: 32 }]}
                            series={countSeries([{ data: stats.wordsPerDay.map((d) => d.count), label: 'New words', color: words }])}
                            hideLegend
                            borderRadius={4}
                            grid={{ horizontal: true }}
                            margin={{ left: 0, right: 8, top: 8, bottom: 0 }}
                        />
                    </Box>
                ) : (
                    <EmptyState icon={<WhatshotOutlined />} title="No new word in the last 30 days" />
                )}
            </ChartCard>
            <ChartCard title="Source reliability" subtitle="RSS sources by reliability. Click a level to list them.">
                <RankedBars
                    label="Sources by reliability"
                    items={CONFIDENCE.map((c) => ({
                        key: String(c.value),
                        label: `${c.label} - ${c.percent}%`,
                        count: stats.sourcesByConfidence[String(c.value)] ?? 0,
                        actionLabel: `Show the ${c.label.toLowerCase()} reliability sources`,
                        onClick: () => onConfidence(c.value),
                    }))}
                />
            </ChartCard>
            {stats.sourcesByCountry.length > 0 && (
                <Box sx={{ gridColumn: { lg: '1 / -1' } }}>
                    <ChartCard title="Coverage by country" subtitle="Where the RSS sources come from. Click a country to list its sources.">
                        <RankedBars
                            label="Sources by country"
                            items={stats.sourcesByCountry.slice(0, 15).map((c) => ({
                                key: c.code,
                                label: countryLabel(c.code, c.country),
                                count: c.count,
                                actionLabel: `Show the sources of ${c.country || c.code}`,
                                onClick: () => onCountry(c.code),
                            }))}
                        />
                    </ChartCard>
                </Box>
            )}
        </Box>
    );
}
