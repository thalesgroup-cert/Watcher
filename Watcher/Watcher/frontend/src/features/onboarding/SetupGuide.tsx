import { useNavigate } from 'react-router';
import { Box, Button, Card, CardContent, IconButton, LinearProgress, Stack, Tooltip, Typography } from '@mui/material';
import CheckCircle from '@mui/icons-material/CheckCircle';
import Close from '@mui/icons-material/Close';
import RadioButtonUncheckedOutlined from '@mui/icons-material/RadioButtonUncheckedOutlined';
import { selectUser, useAuthStore } from '../auth/store';
import { useConnectors, useNotifications } from '../connectors/hooks';
import type { CyberStatistics } from '../cyberWatch/types';
import type { DataLeakStatistics } from '../dataLeak/types';
import type { DnsStatistics } from '../dnsFinder/types';
import type { DomainStatistics } from '../legitimateDomains/types';
import type { SiteStatistics } from '../siteMonitoring/types';
import { useOnboarding } from './hooks';

interface SetupGuideProps {
    cyber?: CyberStatistics;
    dns?: DnsStatistics;
    leaks?: DataLeakStatistics;
    sites?: SiteStatistics;
    domains?: DomainStatistics;
}

interface Task {
    id: string;
    label: string;
    hint: string;
    to: string;
    /** undefined while it is still loading. */
    done: boolean | undefined;
    superuserOnly?: boolean;
}

/** The first steps to get Watcher watching an organisation, ticked from what already exists. Hidden per account. */
export function SetupGuide({ cyber, dns, leaks, sites, domains }: SetupGuideProps) {
    const navigate = useNavigate();
    const isSuperuser = !!useAuthStore(selectUser)?.is_superuser;
    const { ready, dismissed, setDismissed } = useOnboarding();
    const connectors = useConnectors(isSuperuser);
    const notifications = useNotifications(isSuperuser);

    if (!ready || dismissed) return null;

    const count = (n: number | undefined) => (n === undefined ? undefined : n > 0);
    const all: Task[] = [
        {
            id: 'connector',
            label: 'Configure a connector',
            hint: 'TheHive, MISP, Slack, Citadel or email: where Watcher sends what it finds.',
            to: '/connectors',
            done: connectors.data?.some((c) => c.status === 'configured'),
            superuserOnly: true,
        },
        {
            id: 'domain',
            label: 'Add your first legitimate domain',
            hint: 'The domains you own, so Watcher does not raise alerts about yourself.',
            to: '/legitimate_domains',
            done: count(domains?.total),
        },
        {
            id: 'dns-domain',
            label: 'Watch your first domain for look-alikes',
            hint: 'Watcher generates the typosquatted variants and looks for them.',
            to: '/dns_finder',
            done: count(dns?.totalDnsMonitored),
        },
        {
            id: 'dns-keyword',
            label: 'Add your first certificate keyword',
            hint: 'Get an alert when a certificate is issued for a domain containing it.',
            to: '/dns_finder',
            done: count(dns?.totalKeywords),
        },
        {
            id: 'site',
            label: 'Monitor your first suspicious website',
            hint: 'Checked every 15 minutes for changes of IP, mail server and content.',
            to: '/website_monitoring?dialog=add',
            done: count(sites?.total),
        },
        {
            id: 'leak',
            label: 'Add your first data leak pattern',
            hint: 'Searched on paste sites, code hosts and forums.',
            to: '/data_leak?dialog=add',
            done: count(leaks?.totalKeywords),
        },
        {
            id: 'rule',
            label: 'Create your first Cyber Watch rule',
            hint: 'A keyword, such as a product you run, to match against new CVEs and ransomware victims.',
            to: '/cyber_watch?tab=rules&dialog=add-rule',
            done: count(cyber?.rules?.total),
        },
        {
            id: 'notifications',
            label: 'Choose what gets notified',
            hint: 'Which notifications go out on which channel.',
            to: '/connectors?tab=notifications',
            done: notifications.data?.some((t) => Object.values(t.channels).some((c) => c?.enabled)),
            superuserOnly: true,
        },
    ];
    const tasks = all.filter((t) => isSuperuser || !t.superuserOnly);
    const loading = tasks.some((t) => t.done === undefined);
    const doneCount = tasks.filter((t) => t.done).length;
    const complete = !loading && doneCount === tasks.length;

    return (
        <Card component="section" aria-label="Setup guide" data-tour="setup-guide" sx={{ mb: 3 }}>
            <CardContent>
                <Stack direction="row" sx={{ alignItems: 'flex-start', justifyContent: 'space-between', gap: 1 }}>
                    <Box sx={{ minWidth: 0 }}>
                        <Typography variant="h3" component="h2">
                            {complete ? 'Watcher is set up' : 'Get Watcher set up'}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                            {complete
                                ? 'Every step is done. You can hide this guide.'
                                : 'A few steps so Watcher starts watching your organisation. They tick themselves as you go.'}
                        </Typography>
                    </Box>
                    <Tooltip title="Hide the guide">
                        <IconButton size="small" aria-label="Hide the setup guide" onClick={() => setDismissed(true)}>
                            <Close fontSize="small" />
                        </IconButton>
                    </Tooltip>
                </Stack>
                <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', my: 2 }}>
                    <LinearProgress
                        variant="determinate"
                        value={tasks.length ? (doneCount / tasks.length) * 100 : 0}
                        sx={{ flexGrow: 1, height: 8, borderRadius: 4 }}
                        aria-label="Setup progress"
                    />
                    <Typography variant="body2" sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>
                        {loading ? '…' : `${doneCount}/${tasks.length}`}
                    </Typography>
                </Stack>
                <Box
                    component="ul"
                    sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 0.5, gridTemplateColumns: { xs: '1fr', lg: 'repeat(2, 1fr)' } }}
                >
                    {tasks.map((t) => (
                        <Stack key={t.id} component="li" direction="row" spacing={1.25} sx={{ alignItems: 'center', py: 0.75 }}>
                            {t.done ? (
                                <CheckCircle color="success" fontSize="small" aria-label="Done" />
                            ) : (
                                <RadioButtonUncheckedOutlined fontSize="small" sx={{ color: 'text.disabled' }} aria-label="To do" />
                            )}
                            <Box sx={{ minWidth: 0, flexGrow: 1 }}>
                                <Typography
                                    variant="body2"
                                    sx={{ fontWeight: 500, textDecoration: t.done ? 'line-through' : 'none', color: t.done ? 'text.secondary' : 'text.primary' }}
                                >
                                    {t.label}
                                </Typography>
                                {!t.done && (
                                    <Typography variant="caption" color="text.secondary">
                                        {t.hint}
                                    </Typography>
                                )}
                            </Box>
                            {!t.done && (
                                <Button size="small" onClick={() => void navigate(t.to)} sx={{ flexShrink: 0 }}>
                                    Go
                                </Button>
                            )}
                        </Stack>
                    ))}
                </Box>
            </CardContent>
        </Card>
    );
}
