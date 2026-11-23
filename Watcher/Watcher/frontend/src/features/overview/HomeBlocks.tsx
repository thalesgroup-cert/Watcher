import type { ReactNode } from 'react';
import { Link as RouterLink } from 'react-router';
import { alpha, Box, Button, Card, CardContent, Link, Skeleton, Typography, useTheme } from '@mui/material';
import BoltOutlined from '@mui/icons-material/BoltOutlined';
import BugReportOutlined from '@mui/icons-material/BugReportOutlined';
import CloudQueueOutlined from '@mui/icons-material/CloudQueueOutlined';
import DescriptionOutlined from '@mui/icons-material/DescriptionOutlined';
import DnsOutlined from '@mui/icons-material/DnsOutlined';
import DoneAll from '@mui/icons-material/DoneAll';
import HourglassEmptyOutlined from '@mui/icons-material/HourglassEmptyOutlined';
import InboxOutlined from '@mui/icons-material/InboxOutlined';
import LockOutlined from '@mui/icons-material/LockOutlined';
import MonitorHeartOutlined from '@mui/icons-material/MonitorHeartOutlined';
import NotificationsActiveOutlined from '@mui/icons-material/NotificationsActiveOutlined';
import RefreshOutlined from '@mui/icons-material/RefreshOutlined';
import ReportOutlined from '@mui/icons-material/ReportOutlined';
import ScheduleOutlined from '@mui/icons-material/ScheduleOutlined';
import TravelExploreOutlined from '@mui/icons-material/TravelExploreOutlined';
import TrendingUpOutlined from '@mui/icons-material/TrendingUpOutlined';
import { since } from '../../lib/dates';
import { fonts } from '../../styles/theme';
import { When } from '../../ui/When';
import { countryLabel } from '../cyberWatch/catalog';
import { ExploitedChip, SeverityChip } from '../cyberWatch/components/tables';
import type { Cve, Victim } from '../cyberWatch/types';
import type { Alert } from '../dataLeak/types';
import { sourceMeta } from '../dnsFinder/catalog';
import type { Threat } from '../dnsFinder/types';
import type { SiteChange } from '../siteMonitoring/types';
import { SummaryText } from '../threatsWatcher/components/Briefing';
import type { Summary } from '../threatsWatcher/types';
import type { OverviewData } from './api';

const fmt = (value: number | undefined) => (typeof value === 'number' && Number.isFinite(value) ? value.toLocaleString('en-GB') : '-');

/** A card of the home page: an icon and a title, a link on the right, then the content (a list scrolls inside it). */
export function SectionCard({ icon, title, link, children, maxHeight, testId }: { icon: ReactNode; title: string; link?: { to: string; label: string }; children: ReactNode; maxHeight?: number; testId?: string }) {
    return (
        <Card sx={{ height: '100%' }} data-testid={testId}>
            <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1.5, mb: 1.25 }}>
                    <Typography component="h2" sx={{ display: 'inline-flex', alignItems: 'center', gap: 1, fontWeight: 650, fontSize: 15, '& svg': { fontSize: 19, color: 'primary.main' } }}>
                        {icon}
                        {title}
                    </Typography>
                    {link && (
                        <Link component={RouterLink} to={link.to} sx={{ fontSize: 12.5, fontWeight: 600 }}>
                            {link.label}
                        </Link>
                    )}
                </Box>
                <Box sx={maxHeight ? { maxHeight, overflowY: 'auto', mr: -1, pr: 1 } : undefined} data-scroll={maxHeight ? 'true' : undefined}>
                    {children}
                </Box>
            </CardContent>
        </Card>
    );
}

function Empty({ icon, text }: { icon: ReactNode; text: string }) {
    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.75, py: 3.5, color: 'text.secondary', textAlign: 'center', '& svg': { fontSize: 30, opacity: 0.6 } }}>
            {icon}
            <Typography variant="body2">{text}</Typography>
        </Box>
    );
}

const greeting = () => {
    const hour = new Date().getHours();
    return hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
};

/** The last days as bars, the most recent one in full colour: how the new detections went day after day. */
export function ActivityBars({ days }: { days: number[] }) {
    const theme = useTheme();
    const w = 168;
    const h = 46;
    const gap = 3;
    const bar = (w - gap * (days.length - 1)) / days.length;
    const max = Math.max(...days, 1);
    return (
        <Box data-testid="activity-bars" sx={{ flexShrink: 0, textAlign: 'right' }}>
            <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} role="img" aria-label={`New detections per day, last ${days.length} days: ${days.join(', ')}`} style={{ display: 'block' }}>
                {days.map((count, i) => {
                    const height = Math.max(3, (count / max) * (h - 2));
                    return <rect key={i} x={i * (bar + gap)} y={h - height} width={bar} height={height} rx={2} fill={theme.palette.primary.main} opacity={i === days.length - 1 ? 1 : 0.35} />;
                })}
            </svg>
            <Typography variant="caption" color="text.secondary">
                Last {days.length} days
            </Typography>
        </Box>
    );
}

/** The greeting, the one figure of the week (new detections in 7 days) and how many in each module. */
export function Headline({
    firstName,
    days,
    caption,
    parts,
    loading,
    refreshing,
    onRefresh,
}: {
    firstName?: string;
    /** New detections per day, oldest first. */
    days: number[];
    /** What the figure counts, in a few short lines. */
    caption: string[];
    parts: { key: string; icon: ReactNode; label: string; to: string; value: number | undefined }[];
    loading: boolean;
    refreshing: boolean;
    onRefresh: () => void;
}) {
    const theme = useTheme();
    const total = parts.reduce((sum, p) => sum + (p.value ?? 0), 0);
    return (
        <Card data-testid="week-hero" sx={{ position: 'relative', overflow: 'hidden', height: '100%' }}>
            <Box aria-hidden sx={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: `radial-gradient(90% 120% at 100% 0%, ${alpha(theme.palette.primary.main, 0.14)}, transparent 60%)` }} />
            <CardContent sx={{ position: 'relative', p: 2.5 }}>
                <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 2, mb: 2.25 }}>
                    <Box>
                        <Typography variant="h2" component="h2" sx={{ fontSize: 23, mb: 0.25 }}>
                            {greeting()}
                            {firstName ? `, ${firstName}` : ''}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                            {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                        </Typography>
                    </Box>
                    <Button size="small" color="inherit" variant="outlined" disabled={refreshing} onClick={onRefresh} startIcon={<RefreshOutlined />} aria-label="Refresh the figures" sx={{ flexShrink: 0 }}>
                        {refreshing ? 'Updating' : 'Refresh'}
                    </Button>
                </Box>
                {loading ? (
                    <Skeleton variant="rounded" height={58} sx={{ mb: 2 }} />
                ) : (
                    <Box sx={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2, mb: 2 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.75 }}>
                            <Typography component="span" sx={{ fontSize: 'clamp(2.8rem, 5vw, 3.6rem)', fontWeight: 700, lineHeight: 1, letterSpacing: '-0.04em', fontVariantNumeric: 'tabular-nums' }}>
                                {fmt(total)}
                            </Typography>
                            <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.3 }}>
                                {caption.map((line, i) => (
                                    <span key={line}>
                                        {i > 0 && <br />}
                                        {line}
                                    </span>
                                ))}
                            </Typography>
                        </Box>
                        {days.some((count) => count > 0) && <ActivityBars days={days} />}
                    </Box>
                )}
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.9 }}>
                    {parts.map((p) => (
                        <Box
                            key={p.key}
                            component={RouterLink}
                            to={p.to}
                            sx={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 0.8,
                                px: 1.4,
                                py: 0.7,
                                borderRadius: 99,
                                border: 1,
                                borderColor: 'divider',
                                bgcolor: 'action.hover',
                                fontSize: 12.5,
                                color: 'text.secondary',
                                textDecoration: 'none',
                                '& svg': { fontSize: 16, color: 'primary.main' },
                                '& b': { color: 'text.primary', fontWeight: 700 },
                                '&:hover': { borderColor: 'primary.main', color: 'text.primary' },
                            }}
                        >
                            {p.icon}
                            <b>{fmt(p.value)}</b>
                            <span>{p.label}</span>
                        </Box>
                    ))}
                </Box>
            </CardContent>
        </Card>
    );
}

const WEEK = 7 * 86_400_000;
/** Breaking news stay in the brief for a week. */
const isThisWeek = (iso: string) => Date.now() - new Date(iso).getTime() <= WEEK;

/** The latest AI summary: the breaking news of the week, or else the weekly report. */
export function BriefCard({ breaking, weekly, loading }: { breaking: Summary | null | undefined; weekly: Summary | null | undefined; loading: boolean }) {
    const fresh = breaking?.summary_text && isThisWeek(breaking.created_at) ? breaking : null;
    const summary = fresh ?? (weekly?.summary_text ? weekly : null);
    const label = fresh ? 'Breaking news' : 'Weekly report';
    return (
        <SectionCard icon={fresh ? <BoltOutlined /> : summary ? <DescriptionOutlined /> : <HourglassEmptyOutlined />} title={summary ? label : 'Intelligence brief'} testId="home-brief">
            {loading ? (
                <Skeleton variant="rounded" height={120} />
            ) : summary ? (
                <>
                    <Box sx={{ display: '-webkit-box', WebkitLineClamp: 6, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                        <SummaryText text={summary.summary_text} />
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 1.75, pt: 1.4, borderTop: 1, borderColor: 'divider', fontSize: 12.5, color: 'text.secondary', '& svg': { fontSize: 15 } }}>
                        <ScheduleOutlined />
                        Generated {since(summary.created_at)}
                        <Link component={RouterLink} to="/threats_watcher" sx={{ ml: 'auto', fontSize: 12.5, fontWeight: 600 }}>
                            Open Threats Watcher
                        </Link>
                    </Box>
                </>
            ) : (
                <Empty icon={<HourglassEmptyOutlined />} text="No summary yet. Breaking news and the weekly report appear here once generated." />
            )}
        </SectionCard>
    );
}

interface Detection {
    key: string;
    icon: ReactNode;
    to: string;
    date: string | null;
    title: string;
    sub: string;
    severity?: Cve['severity'];
    score?: number | null;
}

/** The newest findings of every module, mixed and sorted by date. */
export function LatestFeed({ latest, loading }: { latest: OverviewData['latest'] | undefined; loading: boolean }) {
    const theme = useTheme();
    const { cves, victims, leaks, threats, changes }: { cves: Cve[]; victims: Victim[]; leaks: Alert[]; threats: Threat[]; changes: SiteChange[] } = latest ?? {
        cves: [],
        victims: [],
        leaks: [],
        threats: [],
        changes: [],
    };

    const all: Detection[] = [
        ...leaks.map((a) => ({ key: `leak-${a.id}`, icon: <TravelExploreOutlined />, to: `/data_leak?alert=${a.id}`, date: a.created_at, title: `"${a.keyword.name}" found`, sub: `Data Leak - ${a.source}` })),
        ...threats.map((t) => ({ key: `dns-${t.id}`, icon: <DnsOutlined />, to: `/dns_finder?threat=${t.id}`, date: t.created_at, title: t.domain_name, sub: `DNS Threats - ${sourceMeta(t.source).label}` })),
        ...changes.map((c) => ({ key: `site-${c.id}`, icon: <MonitorHeartOutlined />, to: `/website_monitoring?tab=changes&change=${c.id}`, date: c.created_at, title: c.site.domain_name, sub: `Website Monitoring - ${c.type || 'Change detected'}` })),
        ...victims.map((v) => ({ key: `victim-${v.id}`, icon: <LockOutlined />, to: `/cyber_watch?tab=ransomware&vstatus=all&victim=${v.id}`, date: v.attacked_at, title: v.victim_name, sub: ['Ransomware', v.group_name, countryLabel(v.country)].filter(Boolean).join(' - ') })),
        ...cves.map((c) => ({ key: `cve-${c.id}`, icon: <BugReportOutlined />, to: `/cyber_watch?tab=cves&cstatus=all&cve=${c.id}`, date: c.published, title: c.cve_id, sub: 'Cyber Watch - new CVE', severity: c.severity, score: c.cvss_score })),
    ];
    const items = all
        .filter((item): item is Detection & { date: string } => !!item.date)
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .slice(0, 12);

    return (
        <SectionCard icon={<NotificationsActiveOutlined />} title="Latest detections" maxHeight={300} testId="home-feed">
            {loading ? (
                <Skeleton variant="rounded" height={220} />
            ) : items.length === 0 ? (
                <Empty icon={<InboxOutlined />} text="Nothing detected yet." />
            ) : (
                <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
                    {items.map((item) => (
                        <Box component="li" key={item.key} sx={{ '& + &': { borderTop: 1, borderColor: 'divider' } }}>
                            <Box component={RouterLink} to={item.to} sx={{ display: 'flex', alignItems: 'center', gap: 1.25, py: 0.7, px: 0.5, borderRadius: 1.5, '&:hover': { bgcolor: 'action.hover' } , textDecoration: 'none', color: 'inherit' }}>
                                <Box sx={{ width: 28, height: 28, flexShrink: 0, display: 'grid', placeItems: 'center', borderRadius: '8px', color: 'primary.main', bgcolor: alpha(theme.palette.primary.main, 0.12), '& svg': { fontSize: 16 } }}>{item.icon}</Box>
                                <Box sx={{ minWidth: 0, flexGrow: 1 }}>
                                    <Typography variant="body2" noWrap sx={{ fontWeight: 650 }}>
                                        {item.title}
                                    </Typography>
                                    <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
                                        {item.sub}
                                    </Typography>
                                </Box>
                                {item.severity && <SeverityChip severity={item.severity} score={item.score ?? null} />}
                                <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
                                    <When iso={item.date} empty="" />
                                </Typography>
                            </Box>
                        </Box>
                    ))}
                </Box>
            )}
        </SectionCard>
    );
}

/** The CVEs with the highest score of the last 30 days. */
export function TopVulnerabilities({ cves, loading }: { cves: Cve[]; loading: boolean }) {
    return (
        <SectionCard icon={<ReportOutlined />} title="Top vulnerabilities" link={{ to: '/cyber_watch?tab=cves', label: 'All CVEs' }} testId="home-vulnerabilities">
            {loading ? (
                <Skeleton variant="rounded" height={200} />
            ) : cves.length === 0 ? (
                <Empty icon={<DoneAll />} text="No CVEs tracked yet." />
            ) : (
                <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
                    {cves.map((c) => (
                        <Box component="li" key={c.id} sx={{ '& + &': { borderTop: 1, borderColor: 'divider' } }}>
                            <Box component={RouterLink} to={`/cyber_watch?tab=cves&cstatus=all&cve=${c.id}`} sx={{ py: 0.7, px: 0.5, borderRadius: 1.5, '&:hover': { bgcolor: 'action.hover' } , display: 'block', textDecoration: 'none', color: 'inherit' }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
                                    <Typography variant="body2" sx={{ fontFamily: fonts.mono, fontWeight: 700 }}>
                                        {c.cve_id}
                                    </Typography>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                                        <ExploitedChip cve={c} />
                                        <SeverityChip severity={c.severity} score={c.cvss_score} />
                                    </Box>
                                </Box>
                                <Typography variant="caption" color="text.secondary" noWrap title={c.description} sx={{ display: 'block', mt: 0.1 }}>
                                    {c.description}
                                </Typography>
                            </Box>
                        </Box>
                    ))}
                </Box>
            )}
        </SectionCard>
    );
}

/** The most mentioned words, ranked: a dot for how reliable the sources are, a bar for how often. */
export function TrendingList({ words, loading }: { words: { id: number; name: string; occurrences: number; score: number }[]; loading: boolean }) {
    const theme = useTheme();
    const ranked = [...words].sort((a, b) => b.occurrences - a.occurrences).slice(0, 6);
    const top = ranked[0]?.occurrences ?? 1;
    const dot = (score: number) => (Number.isNaN(score) ? theme.palette.text.disabled : score >= 70 ? theme.palette.success.main : score >= 40 ? theme.palette.warning.main : theme.palette.error.main);
    return (
        <SectionCard icon={<TrendingUpOutlined />} title="Trending now" link={{ to: '/threats_watcher', label: 'Word cloud' }} testId="home-trending">
            {loading ? (
                <Skeleton variant="rounded" height={200} />
            ) : ranked.length === 0 ? (
                <Empty icon={<CloudQueueOutlined />} text="Trending words appear after the first RSS crawl." />
            ) : (
                <Box component="ol" sx={{ listStyle: 'none', m: 0, p: 0 }}>
                    {ranked.map((w) => (
                        <Box component="li" key={w.id}>
                            <Box component={RouterLink} to={`/threats_watcher?word=${w.id}`} sx={{ display: 'flex', alignItems: 'center', gap: 1.25, py: 0.55, px: 0.5, borderRadius: 1.5, '&:hover': { bgcolor: 'action.hover' } , textDecoration: 'none', color: 'inherit' }}>
                                <Box component="span" title={Number.isFinite(w.score) ? `Reliability ${Math.round(w.score)}%` : 'Not scored'} sx={{ width: 9, height: 9, borderRadius: '50%', flexShrink: 0, bgcolor: dot(w.score) }} />
                                <Typography variant="body2" noWrap sx={{ width: 120, fontWeight: 650, flexShrink: 0 }}>
                                    {w.name}
                                </Typography>
                                <Box aria-hidden sx={{ flexGrow: 1, height: 6, borderRadius: 3, bgcolor: alpha(theme.palette.text.primary, 0.08) }}>
                                    <Box sx={{ height: '100%', borderRadius: 3, bgcolor: 'primary.main', width: `${Math.max(4, (w.occurrences / top) * 100)}%` }} />
                                </Box>
                                <Typography variant="caption" color="text.secondary" sx={{ width: 34, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                                    {w.occurrences}
                                </Typography>
                            </Box>
                        </Box>
                    ))}
                </Box>
            )}
        </SectionCard>
    );
}
