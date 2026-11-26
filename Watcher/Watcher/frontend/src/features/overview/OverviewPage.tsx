import { useState } from 'react';
import { Navigate, useLocation } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { Box, Button, Stack, Typography } from '@mui/material';
import BugReportOutlined from '@mui/icons-material/BugReportOutlined';
import DnsOutlined from '@mui/icons-material/DnsOutlined';
import LockOutlined from '@mui/icons-material/LockOutlined';
import MonitorHeartOutlined from '@mui/icons-material/MonitorHeartOutlined';
import NotificationsActiveOutlined from '@mui/icons-material/NotificationsActiveOutlined';
import SpaceDashboardOutlined from '@mui/icons-material/SpaceDashboardOutlined';
import TravelExploreOutlined from '@mui/icons-material/TravelExploreOutlined';
import TuneOutlined from '@mui/icons-material/TuneOutlined';
import { Page, PageHeader } from '../../ui/Page';
import { selectIsAuthenticated, selectUser, useAuthStore } from '../auth/store';
import { TourButton } from '../onboarding/TourButton';
import { SetupGuide } from '../onboarding/SetupGuide';
import { useOnboarding } from '../onboarding/hooks';
import { detectionsPerDay, lastDays } from './activity';
import { OVERVIEW_KEY, useOverview } from './hooks';
import { useHomeBlocks } from './blocks';
import { CustomizeDialog } from './CustomizeDialog';
import { PendingActionsDialog } from '../pendingActions/PendingActionsDialog';
import { AttentionCard } from './AttentionCard';
import { BriefCard, Headline, LatestFeed, TopVulnerabilities, TrendingList } from './HomeBlocks';
import { ModuleCards } from './ModuleCards';
import { LockedModulesRow } from '../visitor/LockedModulesRow';

/** Columns of a row of cards: the number of cards on it, as wide as the screen allows. */
const WIDE = '@media (min-width: 992px)';
const WIDER = '@media (min-width: 1400px)';

/**
 * Home page: the week in one figure, the latest AI summary, a card per module and the newest findings, vulnerabilities and
 * trending words. The person chooses the blocks (Customise); a block that is hidden leaves no hole.
 */
export default function OverviewPage() {
    const location = useLocation();
    const client = useQueryClient();
    const user = useAuthStore(selectUser);
    const signedIn = useAuthStore(selectIsAuthenticated);
    const [customizing, setCustomizing] = useState(false);
    const [approvalsOpen, setApprovalsOpen] = useState(false);
    const onboarding = useOnboarding();
    const home = useHomeBlocks();

    // One request for the whole page: each module answers with the person's own rights, so a visitor gets the public parts only
    const overview = useOverview(signedIn);
    const all = overview.data;
    const part = <T,>(value: T | null | undefined) => ({ data: value ?? undefined, isPending: overview.isPending });
    const threats = part(all?.threats);
    const cyber = part(all?.cyber);
    const domains = part(all?.domains);
    const leaks = part(all?.leaks);
    const dns = part(all?.dns);
    const sites = part(all?.sites);

    // Links made when Threats Watcher was the home page (`/#/?word=12`) keep working.
    if (location.search) return <Navigate to={`/threats_watcher${location.search}`} replace />;

    const show = home.isShown;
    const days = detectionsPerDay(lastDays(14), { cyber: cyber.data, leaks: leaks.data, dns: dns.data, sites: sites.data }, signedIn);
    const words = (all?.graph?.nodes ?? []).map((n) => ({ id: n.id, name: n.name, occurrences: n.occurrences, score: n.score }));
    const top = all?.topCves ?? [];

    const heroCount = Number(show('week')) + Number(show('brief'));
    const lists = [show('feed') && signedIn && 'feed', show('vulnerabilities') && 'vulnerabilities', show('trending') && 'trending'].filter(Boolean);
    // One column on a narrow screen. Wider: two columns (the first card over two rows when there are three), then three.
    const listsLayout =
        lists.length === 3
            ? {
                  gridTemplateColumns: '1fr',
                  [WIDE]: { gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', '& > :first-of-type': { gridRow: 'span 2' } },
                  [WIDER]: { gridTemplateColumns: 'minmax(0, 1.2fr) minmax(0, 1fr) minmax(0, 0.9fr)', '& > :first-of-type': { gridRow: 'auto' } },
              }
            : lists.length === 2
              ? { gridTemplateColumns: '1fr', [WIDE]: { gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' } }
              : { gridTemplateColumns: '1fr' };

    const noBlock = !home.blocks.some((block) => show(block.id) && (signedIn || !block.signedIn));

    return (
        <Page>
            <PageHeader
                help={<TourButton tour="overview" />}
                icon={<SpaceDashboardOutlined />}
                title="Overview"
                actions={
                    <>
                        <Button size="small" startIcon={<TuneOutlined />} onClick={() => setCustomizing(true)}>
                            Customise
                        </Button>
                        {signedIn && onboarding.ready && onboarding.dismissed && (
                            <Button size="small" onClick={() => onboarding.setDismissed(false)}>
                                Setup guide
                            </Button>
                        )}
                    </>
                }
            />

            <Box data-testid="home-blocks" sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {signedIn && show('setup') && (
                    <Box data-testid="home-block-setup">
                        <SetupGuide cyber={cyber.data} dns={dns.data} leaks={leaks.data} sites={sites.data} domains={domains.data} />
                    </Box>
                )}

                {heroCount > 0 && (
                    <Box data-testid="home-hero" sx={{ display: 'grid', gap: 2, gridTemplateColumns: '1fr', ...(heroCount === 2 && { [WIDE]: { gridTemplateColumns: 'minmax(0, 1.25fr) minmax(0, 1fr)' } }) }}>
                        {show('week') && (
                            <Box data-testid="home-block-week" sx={{ minWidth: 0 }}>
                                <Headline
                                    firstName={user?.first_name}
                                    days={days}
                                    loading={overview.isPending}
                                    refreshing={overview.isFetching}
                                    onRefresh={() => void client.invalidateQueries({ queryKey: OVERVIEW_KEY })}
                                    caption={signedIn ? ['new detections', 'for your organisation', 'in the last 7 days'] : ['new CVEs and ransomware', 'victims in the world', 'in the last 7 days']}
                                    // What concerns the organisation for people who are signed in; the news of the world for visitors
                                    parts={
                                        signedIn
                                            ? [
                                                  { key: 'leaks', icon: <TravelExploreOutlined />, label: 'Data leaks', to: '/data_leak', value: leaks.data?.newThisWeek },
                                                  { key: 'dns', icon: <DnsOutlined />, label: 'DNS threats', to: '/dns_finder', value: dns.data?.newThisWeek },
                                                  { key: 'sites', icon: <MonitorHeartOutlined />, label: 'Website changes', to: '/website_monitoring?tab=changes', value: sites.data?.newThisWeek },
                                                  { key: 'matches', icon: <NotificationsActiveOutlined />, label: 'Watch rule matches', to: '/cyber_watch', value: cyber.data?.hits.new7d },
                                              ]
                                            : [
                                                  { key: 'cves', icon: <BugReportOutlined />, label: 'CVEs', to: '/cyber_watch?tab=cves', value: cyber.data?.cves.new7d },
                                                  { key: 'victims', icon: <LockOutlined />, label: 'Ransomware victims', to: '/cyber_watch?tab=ransomware', value: cyber.data?.victims.new7d },
                                              ]
                                    }
                                />
                            </Box>
                        )}
                        {show('brief') && (
                            <Box data-testid="home-block-brief" sx={{ minWidth: 0 }}>
                                <BriefCard breaking={all?.brief.breaking_news} weekly={all?.brief.weekly_summary} loading={overview.isPending} />
                            </Box>
                        )}
                    </Box>
                )}

                {signedIn && show('attention') && (
                    <Box data-testid="home-block-attention">
                        <AttentionCard data={all} loading={overview.isPending} onApprovals={() => setApprovalsOpen(true)} />
                    </Box>
                )}

                {show('modules') && (
                    <Box data-testid="home-block-modules">
                        <ModuleCards
                            signedIn={signedIn}
                            data={{ threats: threats.data, cyber: cyber.data, domains: domains.data, leaks: leaks.data, dns: dns.data, sites: sites.data }}
                            loading={{ threats: threats.isPending, cyber: cyber.isPending, domains: domains.isPending, leaks: leaks.isPending, dns: dns.isPending, sites: sites.isPending }}
                        />
                    </Box>
                )}

                {/* A visitor learns that the other modules exist, and what they do */}
                {!signedIn && show('modules') && <LockedModulesRow />}

                {lists.length > 0 && (
                    <Box data-testid="home-lists" sx={{ display: 'grid', gap: 2, alignItems: 'start', ...listsLayout }}>
                        {lists.includes('feed') && (
                            <Box data-testid="home-block-feed" sx={{ minWidth: 0 }}>
                                <LatestFeed latest={all?.latest} loading={overview.isPending} />
                            </Box>
                        )}
                        {lists.includes('vulnerabilities') && (
                            <Box data-testid="home-block-vulnerabilities" sx={{ minWidth: 0 }}>
                                <TopVulnerabilities cves={top} loading={overview.isPending} />
                            </Box>
                        )}
                        {lists.includes('trending') && (
                            <Box data-testid="home-block-trending" sx={{ minWidth: 0 }}>
                                <TrendingList words={words} loading={overview.isPending} />
                            </Box>
                        )}
                    </Box>
                )}
            </Box>

            {signedIn && <PendingActionsDialog open={approvalsOpen} onClose={() => setApprovalsOpen(false)} />}

            {noBlock && (
                <Stack sx={{ alignItems: 'center', py: 6, gap: 1 }} data-testid="home-empty">
                    <Typography color="text.secondary">Every block is hidden.</Typography>
                    <Button onClick={() => setCustomizing(true)}>Choose the blocks</Button>
                </Stack>
            )}

            <CustomizeDialog open={customizing} onClose={() => setCustomizing(false)} blocks={home.blocks} isShown={home.isShown} setShown={home.setShown} onReset={home.reset} />
        </Page>
    );
}
