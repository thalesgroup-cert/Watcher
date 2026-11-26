import { Box, Skeleton } from '@mui/material';
import { BarChart } from '@mui/x-charts/BarChart';
import BugReportOutlined from '@mui/icons-material/BugReportOutlined';
import LockOutlined from '@mui/icons-material/LockOutlined';
import NotificationsActiveOutlined from '@mui/icons-material/NotificationsActiveOutlined';
import { ChartCard, RankedBars, useSeriesColor, countSeries } from '../../../ui/charts';
import { EmptyState } from '../../../ui/EmptyState';
import { countryLabel, SEVERITIES } from '../catalog';
import { useCyberStatistics } from '../hooks';
import type { SeverityFilter } from '../types';

const dayLabel = (iso: string) => {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
};

const axes = { margin: { left: 0, right: 8, top: 8, bottom: 0 }, borderRadius: 4, grid: { horizontal: true } } as const;

interface CyberInsightsProps {
    onSeverity: (severity: SeverityFilter) => void;
    onGroup: (groupId: number) => void;
    onCountry: (code: string) => void;
    onSector: (sector: string) => void;
    onRule: (ruleId: number) => void;
}

/** Insights tab: what the rules match, how many CVEs and victims come in, and who the groups hit. */
export function CyberInsights({ onSeverity, onGroup, onCountry, onSector, onRule }: CyberInsightsProps) {
    const { data: stats } = useCyberStatistics();
    const first = useSeriesColor(0);
    const second = useSeriesColor(1);
    if (!stats) {
        return (
            <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', lg: '2fr 1fr' } }}>
                <Skeleton variant="rounded" height={320} />
                <Skeleton variant="rounded" height={320} />
            </Box>
        );
    }
    const labels = stats.hits.perDay.map((d) => dayLabel(d.date));
    const any = (rows: { count: number }[]) => rows.some((d) => d.count > 0);

    // Two measures of different scale (CVEs, victims) are two charts, never one with two axes.
    return (
        <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', lg: '2fr 1fr' } }}>
            <ChartCard title="Matches per day" subtitle="What the watch rules matched over the last 30 days.">
                {any(stats.hits.perDay) ? (
                    <Box sx={{ height: 240 }} data-testid="matches-chart">
                        <BarChart
                            xAxis={[{ scaleType: 'band', data: labels, categoryGapRatio: 0.35 }]}
                            yAxis={[{ tickMinStep: 1, width: 36 }]}
                            series={countSeries([
                                { data: stats.hits.perDay.map((d) => d.cve ?? 0), label: 'CVEs', color: first, stack: 'matches' },
                                { data: stats.hits.perDay.map((d) => d.ransomware_victim ?? 0), label: 'Ransomware victims', color: second, stack: 'matches' },
                            ])}
                            {...axes}
                        />
                    </Box>
                ) : (
                    <EmptyState icon={<NotificationsActiveOutlined />} title="No match in the last 30 days" />
                )}
            </ChartCard>
            {stats.rules ? (
                <ChartCard title="Matches to review by rule" subtitle="Click a rule to review its matches.">
                    {stats.rules.byRule.length ? (
                        <RankedBars
                            label="Matches to review by rule"
                            items={stats.rules.byRule.map((r) => ({
                                key: String(r.id),
                                label: r.active ? r.name : `${r.name} (paused)`,
                                count: r.open,
                                actionLabel: `Review the matches of ${r.name}`,
                                onClick: () => onRule(r.id),
                            }))}
                        />
                    ) : (
                        <EmptyState icon={<NotificationsActiveOutlined />} title="No watch rule yet" />
                    )}
                </ChartCard>
            ) : (
                <Box />
            )}
            <ChartCard title="CVEs published per day" subtitle="New vulnerabilities over the last 30 days.">
                {any(stats.cves.perDay) ? (
                    <Box sx={{ height: 200 }} data-testid="cves-chart">
                        <BarChart
                            xAxis={[{ scaleType: 'band', data: stats.cves.perDay.map((d) => dayLabel(d.date)), categoryGapRatio: 0.35 }]}
                            yAxis={[{ tickMinStep: 1, width: 36 }]}
                            series={countSeries([{ data: stats.cves.perDay.map((d) => d.count), label: 'CVEs', color: first }])}
                            hideLegend
                            {...axes}
                        />
                    </Box>
                ) : (
                    <EmptyState icon={<BugReportOutlined />} title="No CVE in the last 30 days" />
                )}
            </ChartCard>
            <ChartCard title="CVEs by severity" subtitle="Active CVEs. Click a severity to list them.">
                <RankedBars
                    label="CVEs by severity"
                    items={SEVERITIES.map((s) => ({
                        key: s.value,
                        label: s.label,
                        count: stats.cves.bySeverity[s.value] ?? 0,
                        actionLabel: `Show the ${s.label.toLowerCase()} CVEs`,
                        onClick: () => onSeverity(s.value),
                    }))}
                />
            </ChartCard>
            <ChartCard title="Ransomware victims per day" subtitle="Victims posted on the leak sites over the last 30 days.">
                {any(stats.victims.perDay) ? (
                    <Box sx={{ height: 200 }} data-testid="victims-chart">
                        <BarChart
                            xAxis={[{ scaleType: 'band', data: stats.victims.perDay.map((d) => dayLabel(d.date)), categoryGapRatio: 0.35 }]}
                            yAxis={[{ tickMinStep: 1, width: 36 }]}
                            series={countSeries([{ data: stats.victims.perDay.map((d) => d.count), label: 'Victims', color: second }])}
                            hideLegend
                            {...axes}
                        />
                    </Box>
                ) : (
                    <EmptyState icon={<LockOutlined />} title="No victim in the last 30 days" />
                )}
            </ChartCard>
            <ChartCard title="Most active groups" subtitle="Groups with the most active victims. Click one to list them.">
                <RankedBars
                    label="Most active groups"
                    items={stats.victims.topGroups.map((g) => ({ key: String(g.id), label: g.name, count: g.count, actionLabel: `Show the victims of ${g.name}`, onClick: () => onGroup(g.id) }))}
                />
            </ChartCard>
            <ChartCard title="Victims by sector" subtitle="Known sectors only. Click one to list its victims.">
                <RankedBars
                    label="Victims by sector"
                    items={stats.victims.topSectors.map((s) => ({ key: s.name, label: s.name, count: s.count, actionLabel: `Show the ${s.name} victims`, onClick: () => onSector(s.name) }))}
                />
            </ChartCard>
            <ChartCard title="Victims by country" subtitle="Click a country to list its victims.">
                <RankedBars
                    label="Victims by country"
                    items={stats.victims.topCountries.map((c) => ({
                        key: c.name,
                        label: countryLabel(c.name),
                        count: c.count,
                        actionLabel: `Show the victims in ${countryLabel(c.name).replace(/^\S+ /, '')}`,
                        onClick: () => onCountry(c.name),
                    }))}
                />
            </ChartCard>
        </Box>
    );
}
