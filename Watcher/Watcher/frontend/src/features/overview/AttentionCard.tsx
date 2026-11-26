import type { ReactElement } from 'react';
import { Link as RouterLink } from 'react-router';
import { alpha, Box, Chip, Skeleton, Typography, useTheme } from '@mui/material';
import ChevronRightOutlined from '@mui/icons-material/ChevronRightOutlined';
import DnsOutlined from '@mui/icons-material/DnsOutlined';
import DoneAll from '@mui/icons-material/DoneAll';
import LocalFireDepartment from '@mui/icons-material/LocalFireDepartment';
import MonitorHeartOutlined from '@mui/icons-material/MonitorHeartOutlined';
import NotificationsActiveOutlined from '@mui/icons-material/NotificationsActiveOutlined';
import PlaylistAddCheckOutlined from '@mui/icons-material/PlaylistAddCheckOutlined';
import ReportProblemOutlined from '@mui/icons-material/ReportProblemOutlined';
import TravelExploreOutlined from '@mui/icons-material/TravelExploreOutlined';
import VerifiedUserOutlined from '@mui/icons-material/VerifiedUserOutlined';
import type { OverviewData } from './api';
import { SectionCard } from './HomeBlocks';

type Tone = 'error' | 'warning' | 'default';

export interface AttentionItem {
    key: string;
    icon: ReactElement;
    label: string;
    count: number;
    tone: Tone;
    /** A page of Watcher with the filter that shows exactly these items, or nothing when the line opens something on the spot. */
    to?: string;
}

const RANK: Record<Tone, number> = { error: 0, warning: 1, default: 2 };

/**
 * What waits for a decision, from the figures the Overview already has: the worst first, the lines at zero left out.
 * `openApprovals` is the line that opens the window of the approvals instead of a page.
 */
export function attentionItems(data: OverviewData | undefined): AttentionItem[] {
    if (!data) return [];
    const { cyber, leaks, dns, sites, domains, pending } = data;
    const items: AttentionItem[] = [
        { key: 'pending', icon: <PlaylistAddCheckOutlined />, label: 'Actions waiting for your approval', count: pending?.count ?? 0, tone: 'warning' },
        { key: 'exploited', icon: <LocalFireDepartment />, label: 'CVEs exploited in the wild', count: cyber?.cves.exploited ?? 0, tone: 'error', to: '/cyber_watch?tab=cves&cexploited=yes' },
        { key: 'takeover', icon: <ReportProblemOutlined />, label: 'Subdomain takeover risks', count: dns?.openTakeover ?? 0, tone: 'error', to: '/dns_finder?source=subdomain_takeover' },
        { key: 'expired', icon: <VerifiedUserOutlined />, label: 'Legitimate domains expired', count: domains?.expired ?? 0, tone: 'error', to: '/legitimate_domains?status=expired' },
        { key: 'matches', icon: <NotificationsActiveOutlined />, label: 'Watch rule matches to review', count: cyber?.hits.open ?? 0, tone: 'warning', to: '/cyber_watch' },
        { key: 'leaks', icon: <TravelExploreOutlined />, label: 'Data leaks to review', count: leaks?.activeAlerts ?? 0, tone: 'warning', to: '/data_leak' },
        { key: 'expiring', icon: <VerifiedUserOutlined />, label: 'Legitimate domains expiring soon', count: domains?.expiringSoon ?? 0, tone: 'warning', to: '/legitimate_domains?status=expiring_soon' },
        { key: 'ssl', icon: <VerifiedUserOutlined />, label: 'SSL certificates expiring soon', count: domains?.sslExpiringSoon ?? 0, tone: 'warning', to: '/legitimate_domains?ssl=expiring_soon' },
        { key: 'dns', icon: <DnsOutlined />, label: 'DNS threats to review', count: dns?.openAlerts ?? 0, tone: 'default', to: '/dns_finder' },
        { key: 'sites', icon: <MonitorHeartOutlined />, label: 'Website changes to review', count: sites?.openAlerts ?? 0, tone: 'default', to: '/website_monitoring?tab=changes' },
    ];
    return items.filter((item) => item.count > 0).sort((a, b) => RANK[a.tone] - RANK[b.tone]);
}

/** The block "Needs your attention": a line per thing to look at, with how many and a click to get there. */
export function AttentionCard({ data, loading, onApprovals }: { data: OverviewData | undefined; loading: boolean; onApprovals: () => void }) {
    const theme = useTheme();
    const items = attentionItems(data);
    const row = {
        display: 'flex',
        alignItems: 'center',
        gap: 1.25,
        width: '100%',
        py: 0.9,
        px: 0.75,
        borderRadius: 1.5,
        textAlign: 'left',
        font: 'inherit',
        color: 'inherit',
        textDecoration: 'none',
        background: 'none',
        border: 0,
        cursor: 'pointer',
        '&:hover': { bgcolor: 'action.hover' },
    } as const;
    return (
        <SectionCard icon={<NotificationsActiveOutlined />} title="Needs your attention" testId="home-attention">
            {loading ? (
                <Skeleton variant="rounded" height={96} />
            ) : items.length === 0 ? (
                <Box data-testid="attention-clear" sx={{ display: 'flex', alignItems: 'center', gap: 1.25, color: 'text.secondary', py: 1 }}>
                    <DoneAll sx={{ color: 'success.main' }} />
                    <Typography variant="body2">Nothing needs your attention right now.</Typography>
                </Box>
            ) : (
                <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', columnGap: 3, gridTemplateColumns: { xs: '1fr', lg: 'repeat(2, minmax(0, 1fr))' } }}>
                    {items.map((item) => {
                        const content = (
                            <>
                                <Box
                                    sx={{
                                        width: 28,
                                        height: 28,
                                        flexShrink: 0,
                                        display: 'grid',
                                        placeItems: 'center',
                                        borderRadius: '8px',
                                        color: item.tone === 'default' ? 'primary.main' : `${item.tone}.main`,
                                        bgcolor: alpha(item.tone === 'default' ? theme.palette.primary.main : theme.palette[item.tone].main, 0.12),
                                        '& svg': { fontSize: 17 },
                                    }}
                                >
                                    {item.icon}
                                </Box>
                                <Typography variant="body2" sx={{ flexGrow: 1, minWidth: 0, fontWeight: 600 }} noWrap>
                                    {item.label}
                                </Typography>
                                <Chip size="small" label={item.count.toLocaleString('en-GB')} color={item.tone === 'default' ? 'default' : item.tone} sx={{ fontWeight: 700 }} />
                                <ChevronRightOutlined fontSize="small" sx={{ color: 'text.secondary' }} />
                            </>
                        );
                        return (
                            <Box component="li" key={item.key} data-testid={`attention-${item.key}`} sx={{ borderTop: 1, borderColor: 'divider', '&:first-of-type': { borderTop: 0 }, [theme.breakpoints.up('lg')]: { '&:nth-of-type(2)': { borderTop: 0 } } }}>
                                {item.to ? (
                                    <Box component={RouterLink} to={item.to} sx={row}>
                                        {content}
                                    </Box>
                                ) : (
                                    <Box component="button" type="button" onClick={onApprovals} sx={row}>
                                        {content}
                                    </Box>
                                )}
                            </Box>
                        );
                    })}
                </Box>
            )}
        </SectionCard>
    );
}
