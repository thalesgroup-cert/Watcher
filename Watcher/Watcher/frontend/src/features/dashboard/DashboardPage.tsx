import { useState, type ReactNode } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { Box, Button, Card, CardContent, List, ListItemButton, ListItemText, Skeleton, Stack, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import BugReportOutlined from '@mui/icons-material/BugReportOutlined';
import DnsOutlined from '@mui/icons-material/DnsOutlined';
import EventBusyOutlined from '@mui/icons-material/EventBusyOutlined';
import LockOutlined from '@mui/icons-material/LockOutlined';
import MonitorHeartOutlined from '@mui/icons-material/MonitorHeartOutlined';
import NotificationsActiveOutlined from '@mui/icons-material/NotificationsActiveOutlined';
import NotificationsNoneOutlined from '@mui/icons-material/NotificationsNoneOutlined';
import SpaceDashboardOutlined from '@mui/icons-material/SpaceDashboardOutlined';
import TravelExploreOutlined from '@mui/icons-material/TravelExploreOutlined';
import WhatshotOutlined from '@mui/icons-material/WhatshotOutlined';
import { fonts } from '../../styles/theme';
import { KpiCard } from '../../ui/KpiCard';
import { Page, PageHeader } from '../../ui/Page';
import { WorldMap, type MapValue } from '../../ui/WorldMap';
import { selectIsAuthenticated, useAuthStore } from '../auth/store';
import { countryLabel, isKnownSector } from '../cyberWatch/catalog';
import { SeverityChip } from '../cyberWatch/components/tables';
import { useCves, useCyberStatistics, useVictims } from '../cyberWatch/hooks';
import { useDataLeakStatistics } from '../dataLeak/hooks';
import { useDnsStatistics } from '../dnsFinder/hooks';
import { useDomainStatistics } from '../legitimateDomains/hooks';
import { usePendingCount } from '../pendingActions/hooks';
import { useSiteStatistics } from '../siteMonitoring/hooks';
import { Briefing } from '../threatsWatcher/components/Briefing';
import { WordViz } from '../threatsWatcher/components/WordCloud';
import { useThreatsStatistics, useWordGraph } from '../threatsWatcher/hooks';
import { TourButton } from "../onboarding/TourButton";
import { SetupGuide } from "../onboarding/SetupGuide";
import { useOnboarding } from "../onboarding/hooks";
import { PendingActionsDialog } from '../pendingActions/PendingActionsDialog';
import { When } from '../../ui/When';

function Panel({ title, subtitle, action, children }: { title: string; subtitle?: string; action?: ReactNode; children: ReactNode }) {
    return (
        <Card sx={{ height: '100%' }}>
            <CardContent>
                <Stack direction="row" sx={{ alignItems: 'flex-start', justifyContent: 'space-between', gap: 1, mb: 2, minHeight: 36 }}>
                    <Box>
                        <Typography variant="h3" component="h2">
                            {title}
                        </Typography>
                        {subtitle && (
                            <Typography variant="body2" color="text.secondary">
                                {subtitle}
                            </Typography>
                        )}
                    </Box>
                    {action}
                </Stack>
                {children}
            </CardContent>
        </Card>
    );
}

function SeeAll({ to, label }: { to: string; label: string }) {
    const navigate = useNavigate();
    return (
        <Button size="small" onClick={() => void navigate(to)} sx={{ flexShrink: 0 }}>
            {label}
        </Button>
    );
}

type MapLayer = 'victims' | 'sources';

/** Home page: what needs attention in every module, and the big picture of what Watcher sees. */
export default function DashboardPage() {
    const location = useLocation();
    const navigate = useNavigate();
    const signedIn = useAuthStore(selectIsAuthenticated);
    const [layer, setLayer] = useState<MapLayer>('victims');
    const [pendingOpen, setPendingOpen] = useState(false);
    const onboarding = useOnboarding();

    const threats = useThreatsStatistics();
    const cyber = useCyberStatistics();
    const domains = useDomainStatistics();
    const leaks = useDataLeakStatistics(signedIn);
    const dns = useDnsStatistics(signedIn);
    const sites = useSiteStatistics(signedIn);
    const { data: pending } = usePendingCount(signedIn);
    const graph = useWordGraph('', 40);
    const cves = useCves({ status: 'active', search: '', severity: ['CRITICAL', 'HIGH'], period: '', matched: '' }, { page: 1, pageSize: 5, ordering: '-published' });
    const victims = useVictims({ status: 'active', search: '', group: '', country: '', sector: '', period: '', matched: '' }, { page: 1, pageSize: 5, ordering: '-attacked_at' });

    // Links made when Threats Watcher was the home page (`/#/?word=12`) keep working.
    if (location.search) return <Navigate to={`/threats_watcher${location.search}`} replace />;

    const go = (to: string) => () => void navigate(to);
    const mapValues: MapValue[] =
        layer === 'victims'
            ? (cyber.data?.victims.byCountry ?? []).filter((c) => /^[A-Za-z]{2}$/.test(c.name)).map((c) => ({ code: c.name, count: c.count }))
            : (threats.data?.sourcesByCountry ?? []).filter((c) => c.code).map((c) => ({ code: c.code, count: c.count }));
    const words = (graph.data?.nodes ?? []).map((n) => ({ id: n.id, name: n.name, occurrences: n.occurrences }));

    return (
        <Page>
            <PageHeader
                help={<TourButton tour="dashboard" />}
                icon={<SpaceDashboardOutlined />}
                title="Dashboard"
                subtitle="What needs your attention across Watcher, and what the threat landscape looks like right now."
                actions={
                    <>
                        <Button size="small" onClick={go('/whats_new')}>
                            What's new
                        </Button>
                        {signedIn && onboarding.ready && onboarding.dismissed && (
                            <Button size="small" onClick={() => onboarding.setDismissed(false)}>
                                Setup guide
                            </Button>
                        )}
                    </>
                }
            />

            {signedIn && <SetupGuide cyber={cyber.data} dns={dns.data} leaks={leaks.data} sites={sites.data} domains={domains.data} />}

            {signedIn ? (
                <Box component="section" aria-label="Needs attention" sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)', xl: 'repeat(6, 1fr)' }, mb: 3 }}>
                    <KpiCard title="Cyber Watch matches" value={cyber.data?.hits.open} icon={<NotificationsActiveOutlined />} color="warning" onClick={go('/cyber_watch')} />
                    <KpiCard title="DNS threats open" value={dns.data?.openAlerts} icon={<DnsOutlined />} color="error" onClick={go('/dns_finder')} />
                    <KpiCard title="Data leaks to review" value={leaks.data?.activeAlerts} icon={<TravelExploreOutlined />} color="warning" onClick={go('/data_leak')} />
                    <KpiCard title="Website changes" value={sites.data?.openAlerts} icon={<MonitorHeartOutlined />} color="primary" onClick={go('/website_monitoring?tab=changes')} />
                    <KpiCard
                        title="Domains expiring - 30 days"
                        value={domains.data ? domains.data.expiringSoon + domains.data.sslExpiringSoon : undefined}
                        icon={<EventBusyOutlined />}
                        color="primary"
                        onClick={go('/legitimate_domains')}
                    />
                    <KpiCard title="Pending actions" value={pending} icon={<NotificationsNoneOutlined />} color="inherit" onClick={() => setPendingOpen(true)} />
                </Box>
            ) : (
                <Box component="section" aria-label="Key figures" sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: 'repeat(2, 1fr)', md: 'repeat(4, 1fr)' }, mb: 3 }}>
                    <KpiCard title="Trending words today" value={threats.data?.newToday} icon={<WhatshotOutlined />} color="primary" onClick={go('/threats_watcher?period=today')} />
                    <KpiCard title="Critical CVEs - 7 days" value={cyber.data?.cves.critical7d} icon={<BugReportOutlined />} color="error" />
                    <KpiCard title="Ransomware victims - 7 days" value={cyber.data?.victims.new7d} icon={<LockOutlined />} color="warning" />
                    <KpiCard title="Legitimate domains" value={domains.data?.total} icon={<EventBusyOutlined />} color="inherit" onClick={go('/legitimate_domains')} />
                </Box>
            )}

            <Briefing />

            <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', lg: '7fr 5fr' }, mb: 2 }}>
                <Panel title="Trending words" subtitle={threats.data ? `Read from ${threats.data.totalSources.toLocaleString('en-GB')} RSS sources. Click a word for its articles.` : ' '}>
                    <WordViz words={words} onOpen={(id) => void navigate(`/threats_watcher?word=${id}`)} height={320} loading={graph.isPending} />
                </Panel>
                <Panel
                    title="World map"
                    subtitle={layer === 'victims' ? 'Ransomware victims by country. Click a country to list them.' : 'Where the RSS sources come from. Click a country to list them.'}
                    action={
                        <ToggleButtonGroup size="small" exclusive value={layer} onChange={(_, v: MapLayer | null) => v && setLayer(v)} aria-label="Map layer">
                            <ToggleButton value="victims" sx={{ px: 1.25 }}>
                                Victims
                            </ToggleButton>
                            <ToggleButton value="sources" sx={{ px: 1.25 }}>
                                Sources
                            </ToggleButton>
                        </ToggleButtonGroup>
                    }
                >
                    {(layer === 'victims' ? cyber.isPending : threats.isPending) ? (
                        <Skeleton variant="rounded" height={300} />
                    ) : (
                        <WorldMap
                            values={mapValues}
                            unit={layer === 'victims' ? 'ransomware victims' : 'RSS sources'}
                            height={300}
                            onCountry={(code) =>
                                void navigate(layer === 'victims' ? `/cyber_watch?tab=ransomware&vstatus=all&vcountry=${code}` : `/threats_watcher?tab=sources&scountry=${code}`)
                            }
                        />
                    )}
                </Panel>
            </Box>

            <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' } }}>
                <Panel title="Latest critical and high CVEs" action={<SeeAll to="/cyber_watch?tab=cves&csev=CRITICAL,HIGH" label="All CVEs" />}>
                    {cves.isPending ? (
                        <Skeleton height={180} />
                    ) : (
                        <List dense disablePadding data-testid="dashboard-cves">
                            {(cves.data?.results ?? []).map((c) => (
                                <ListItemButton key={c.id} onClick={go(`/cyber_watch?tab=cves&cstatus=all&cve=${c.id}`)} sx={{ borderRadius: 1.5, gap: 1.5 }}>
                                    <SeverityChip severity={c.severity} score={c.cvss_score} />
                                    <ListItemText
                                        primary={<Box component="span" sx={{ fontFamily: fonts.mono }}>{c.cve_id}</Box>}
                                        secondary={c.description}
                                        slotProps={{ secondary: { noWrap: true } }}
                                        sx={{ minWidth: 0 }}
                                    />
                                    <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
                                        <When iso={c.published} empty="" />
                                    </Typography>
                                </ListItemButton>
                            ))}
                        </List>
                    )}
                </Panel>
                <Panel title="Latest ransomware victims" action={<SeeAll to="/cyber_watch?tab=ransomware" label="All victims" />}>
                    {victims.isPending ? (
                        <Skeleton height={180} />
                    ) : (
                        <List dense disablePadding data-testid="dashboard-victims">
                            {(victims.data?.results ?? []).map((v) => (
                                <ListItemButton key={v.id} onClick={go(`/cyber_watch?tab=ransomware&vstatus=all&victim=${v.id}`)} sx={{ borderRadius: 1.5, gap: 1.5 }}>
                                    <ListItemText
                                        primary={v.victim_name}
                                        secondary={[v.group_name, countryLabel(v.country), isKnownSector(v.sector) ? v.sector : ''].filter(Boolean).join(' - ')}
                                        slotProps={{ primary: { noWrap: true }, secondary: { noWrap: true } }}
                                        sx={{ minWidth: 0 }}
                                    />
                                    <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
                                        <When iso={v.attacked_at} empty="" />
                                    </Typography>
                                </ListItemButton>
                            ))}
                        </List>
                    )}
                </Panel>
            </Box>
            {signedIn && <PendingActionsDialog open={pendingOpen} onClose={() => setPendingOpen(false)} />}
        </Page>
    );
}
