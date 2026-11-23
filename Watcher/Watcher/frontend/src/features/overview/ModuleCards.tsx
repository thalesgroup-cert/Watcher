import type { ReactNode } from 'react';
import { Link as RouterLink } from 'react-router';
import { alpha, Box, Card, CardActionArea, Skeleton, Typography, useTheme } from '@mui/material';
import ArrowForward from '@mui/icons-material/ArrowForward';
import BugReportOutlined from '@mui/icons-material/BugReportOutlined';
import CallMade from '@mui/icons-material/CallMade';
import DnsOutlined from '@mui/icons-material/DnsOutlined';
import MonitorHeartOutlined from '@mui/icons-material/MonitorHeartOutlined';
import TravelExploreOutlined from '@mui/icons-material/TravelExploreOutlined';
import VerifiedUserOutlined from '@mui/icons-material/VerifiedUserOutlined';
import WhatshotOutlined from '@mui/icons-material/WhatshotOutlined';
import type { CyberStatistics, SeverityFilter } from '../cyberWatch/types';
import { dnsPerDay, lastDays, perDay } from './activity';
import type { DataLeakStatistics } from '../dataLeak/types';
import type { DnsStatistics } from '../dnsFinder/types';
import type { DomainStatistics } from '../legitimateDomains/types';
import type { SiteStatistics } from '../siteMonitoring/types';
import type { ThreatsStatistics } from '../threatsWatcher/types';

const FORTNIGHT = lastDays(14);
const fortnight = (...series: ({ date: string; count: number }[] | undefined)[]) => perDay(FORTNIGHT, ...series);

const fmt = (value: number | undefined) => (typeof value === 'number' && Number.isFinite(value) ? value.toLocaleString('en-GB') : '-');

/** The last days as a small line. */
function Spark({ points, label }: { points: number[]; label: string }) {
    const theme = useTheme();
    if (points.length < 2) return null;
    const w = 120;
    const h = 34;
    const pad = 3;
    const max = Math.max(...points, 1);
    const x = (i: number) => pad + (i * (w - pad * 2)) / (points.length - 1);
    const y = (v: number) => h - pad - (v * (h - pad * 2)) / max;
    const line = points.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
    const color = theme.palette.primary.main;
    return (
        <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} role="img" aria-label={`${label}: ${points.join(', ')}`} style={{ display: 'block' }}>
            <polygon points={`${x(0)},${h - pad} ${line} ${x(points.length - 1)},${h - pad}`} fill={alpha(color, 0.14)} />
            <polyline points={line} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            <circle cx={x(points.length - 1)} cy={y(points[points.length - 1])} r={3} fill={color} />
        </svg>
    );
}

const SEVERITIES: { key: SeverityFilter; label: string; color: 'error' | 'warning' | 'info' | 'success' }[] = [
    { key: 'CRITICAL', label: 'Critical', color: 'error' },
    { key: 'HIGH', label: 'High', color: 'warning' },
    { key: 'MEDIUM', label: 'Medium', color: 'info' },
    { key: 'LOW', label: 'Low', color: 'success' },
];

/** The CVEs by severity: one bar cut in parts, and the counts under it. */
function SeverityMix({ counts }: { counts: Partial<Record<SeverityFilter, number>> }) {
    const theme = useTheme();
    const total = SEVERITIES.reduce((sum, s) => sum + (counts[s.key] ?? 0), 0);
    if (!total) return null;
    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.9 }}>
            <Box role="img" aria-label={SEVERITIES.map((s) => `${s.label.toLowerCase()} ${counts[s.key] ?? 0}`).join(', ')} sx={{ display: 'flex', height: 8, borderRadius: 99, overflow: 'hidden', gap: '2px' }}>
                {SEVERITIES.filter((s) => counts[s.key]).map((s) => (
                    <Box key={s.key} sx={{ flexGrow: counts[s.key], minWidth: 4, bgcolor: theme.palette[s.color].main }} />
                ))}
            </Box>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: '2px 12px' }}>
                {SEVERITIES.map((s) => (
                    <Typography key={s.key} variant="caption" color="text.secondary" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.6, '& b': { color: 'text.primary', fontWeight: 650 } }}>
                        <Box component="i" sx={{ width: 8, height: 8, borderRadius: '2px', bgcolor: theme.palette[s.color].main }} />
                        {s.label} <b>{counts[s.key] ?? 0}</b>
                    </Typography>
                ))}
            </Box>
        </Box>
    );
}

interface Item {
    label: string;
    value: number | undefined;
    /** Colours the figure, with a dot, when it is above zero. */
    status?: 'warning' | 'error';
}

function ModuleCard({
    to,
    icon,
    name,
    value,
    valueLabel,
    delta,
    items,
    alert,
    loading,
    children,
}: {
    to: string;
    icon: ReactNode;
    name: string;
    value: number | undefined;
    valueLabel: string;
    delta?: number;
    items: Item[];
    /** Something here needs a look: a red dot on the icon says so. */
    alert?: boolean;
    loading: boolean;
    children?: ReactNode;
}) {
    const theme = useTheme();
    return (
        <Card data-testid={`module-card-${name.toLowerCase().replace(/\s+/g, '-')}`} sx={{ height: '100%', transition: 'transform 0.15s ease, border-color 0.15s ease', '&:hover': { transform: 'translateY(-2px)', borderColor: 'primary.main' }, '&:hover .go': { color: 'primary.main', transform: 'translateX(3px)' } }}>
            <CardActionArea component={RouterLink} to={to} sx={{ height: '100%', p: 2.5, display: 'flex', flexDirection: 'column', alignItems: 'stretch', justifyContent: 'flex-start', gap: 1.75 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.4 }}>
                    <Box sx={{ position: 'relative', width: 36, height: 36, display: 'grid', placeItems: 'center', borderRadius: '10px', color: 'primary.main', bgcolor: alpha(theme.palette.primary.main, 0.12) }}>
                        {icon}
                        {alert && <Box aria-label="Needs attention" component="span" sx={{ position: 'absolute', top: -3, right: -3, width: 10, height: 10, borderRadius: '50%', bgcolor: 'error.main', boxShadow: `0 0 0 2px ${theme.palette.background.paper}` }} />}
                    </Box>
                    <Typography sx={{ fontWeight: 650, flexGrow: 1 }}>{name}</Typography>
                    <ArrowForward className="go" sx={{ fontSize: 18, color: 'text.secondary', transition: 'transform 0.15s ease, color 0.15s ease' }} />
                </Box>
                {loading ? (
                    <Skeleton variant="rounded" height={96} />
                ) : (
                    <>
                        <Box sx={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 1.5 }}>
                            <Box>
                                <Typography component="div" sx={{ fontSize: 32, fontWeight: 680, lineHeight: 1, letterSpacing: '-0.03em', fontVariantNumeric: 'tabular-nums' }}>
                                    {fmt(value)}
                                </Typography>
                                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                                    {valueLabel}
                                </Typography>
                            </Box>
                            {!!delta && delta > 0 && (
                                <Box title="New in the last 7 days" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.3, pl: 0.7, pr: 1.1, py: 0.4, borderRadius: 99, fontSize: 12, fontWeight: 650, whiteSpace: 'nowrap', bgcolor: 'action.hover', boxShadow: `inset 0 0 0 1px ${theme.palette.divider}`, '& svg': { fontSize: 14, color: 'primary.main' } }}>
                                    <CallMade />
                                    {fmt(delta)} this week
                                </Box>
                            )}
                        </Box>
                        {children}
                        <Box component="dl" sx={{ m: 0, mt: 'auto', pt: 1.5, borderTop: 1, borderColor: 'divider', display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 1 }}>
                            {items.map((item) => {
                                const lit = item.status && (item.value ?? 0) > 0;
                                return (
                                    <Box key={item.label} sx={{ minWidth: 0 }}>
                                        <Typography component="dt" noWrap sx={{ fontSize: 11.2, fontWeight: 500, color: 'text.secondary' }}>
                                            {item.label}
                                        </Typography>
                                        <Typography component="dd" sx={{ m: 0, mt: 0.2, fontWeight: 650, fontVariantNumeric: 'tabular-nums', color: lit ? `${item.status}.main` : 'text.primary', display: 'flex', alignItems: 'center', gap: 0.6 }}>
                                            {lit && <Box component="span" sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: 'currentColor' }} />}
                                            {fmt(item.value)}
                                        </Typography>
                                    </Box>
                                );
                            })}
                        </Box>
                    </>
                )}
            </CardActionArea>
        </Card>
    );
}

interface ModuleData {
    threats?: ThreatsStatistics;
    cyber?: CyberStatistics;
    domains?: DomainStatistics;
    leaks?: DataLeakStatistics;
    dns?: DnsStatistics;
    sites?: SiteStatistics;
}

/** One card per module with its figures, as on the overview of the other redesign. A visitor sees the public modules only. */
export function ModuleCards({ data, signedIn, loading }: { data: ModuleData; signedIn: boolean; loading: Record<keyof ModuleData, boolean> }) {
    const { threats, cyber, domains, leaks, dns, sites } = data;
    return (
        <Box component="section" aria-label="Modules" sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(3, minmax(0, 1fr))' } }}>
            <ModuleCard
                to="/threats_watcher"
                icon={<WhatshotOutlined />}
                name="Threats Watcher"
                loading={loading.threats}
                value={threats?.totalWords}
                valueLabel="trending words"
                delta={threats?.newThisWeek}
                items={[
                    { label: 'New today', value: threats?.newToday },
                    { label: 'RSS sources', value: threats?.totalSources },
                    { label: 'Monitored keywords', value: threats?.monitoredKeywords },
                ]}
            >
                <Spark points={(threats?.wordsPerDay ?? []).slice(-14).map((d) => d.count)} label="New words per day" />
            </ModuleCard>
            <ModuleCard
                to="/cyber_watch"
                icon={<BugReportOutlined />}
                name="Cyber Watch"
                loading={loading.cyber}
                value={cyber?.cves.total}
                valueLabel="CVEs tracked"
                alert={(cyber?.cves.critical7d ?? 0) > 0}
                items={[
                    { label: 'Critical CVEs', value: cyber?.cves.critical7d, status: 'error' },
                    { label: 'Victims (7 days)', value: cyber?.victims.new7d },
                ]}
            >
                <Spark points={fortnight(cyber?.cves.perDay)} label="New CVEs per day" />
                {cyber && <SeverityMix counts={cyber.cves.bySeverity} />}
            </ModuleCard>
            {signedIn && (
                <>
                    <ModuleCard
                        to="/data_leak"
                        icon={<TravelExploreOutlined />}
                        name="Data Leak"
                        loading={loading.leaks}
                        value={leaks?.activeAlerts}
                        valueLabel="active alerts"
                        delta={leaks?.newThisWeek}
                        alert={(leaks?.newToday ?? 0) > 0}
                        items={[
                            { label: 'New today', value: leaks?.newToday, status: 'warning' },
                            { label: 'All alerts', value: leaks?.totalAlerts },
                            { label: 'Search patterns', value: leaks?.totalKeywords },
                        ]}
                    >
                        <Spark points={fortnight(leaks?.perDay)} label="New alerts per day" />
                    </ModuleCard>
                    <ModuleCard
                        to="/dns_finder"
                        icon={<DnsOutlined />}
                        name="DNS Threats"
                        loading={loading.dns}
                        value={dns?.totalAlerts}
                        valueLabel="suspicious domains"
                        delta={dns?.newThisWeek}
                        alert={(dns?.openTakeover ?? 0) > 0}
                        items={[
                            { label: 'Takeover risks', value: dns?.openTakeover, status: 'error' },
                            { label: 'Domains watched', value: dns?.totalDnsMonitored },
                            { label: 'Keywords', value: dns?.totalKeywords },
                        ]}
                    >
                        <Spark points={fortnight(dnsPerDay(dns))} label="New threats per day" />
                    </ModuleCard>
                    <ModuleCard
                        to="/website_monitoring"
                        icon={<MonitorHeartOutlined />}
                        name="Website Monitoring"
                        loading={loading.sites}
                        value={sites?.total}
                        valueLabel="sites monitored"
                        delta={sites?.newThisWeek}
                        alert={(sites?.malicious ?? 0) > 0}
                        items={[
                            { label: 'Malicious', value: sites?.malicious, status: 'error' },
                            { label: 'Takedown requests', value: sites?.takedownRequests },
                            { label: 'Legal team', value: sites?.legalTeam },
                        ]}
                    >
                        <Spark points={fortnight(sites?.alertsPerDay)} label="Changes per day" />
                    </ModuleCard>
                </>
            )}
            <ModuleCard
                to="/legitimate_domains"
                icon={<VerifiedUserOutlined />}
                name="Legitimate Domains"
                loading={loading.domains}
                value={domains?.total}
                valueLabel="registered domains"
                alert={(domains?.expiringSoon ?? 0) > 0 || (domains?.expired ?? 0) > 0}
                items={[
                    { label: 'Expiring soon', value: domains?.expiringSoon, status: 'warning' },
                    { label: 'Expired', value: domains?.expired, status: 'error' },
                    { label: 'Repurchased', value: domains?.repurchased },
                ]}
            />
        </Box>
    );
}
