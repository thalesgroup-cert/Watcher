import { useNavigate } from 'react-router';
import { Box, Button, Card, CardContent, Stack, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material';
import AutoAwesomeOutlined from '@mui/icons-material/AutoAwesomeOutlined';
import ExploreOutlined from '@mui/icons-material/ExploreOutlined';
import PlaylistAddCheckOutlined from '@mui/icons-material/PlaylistAddCheckOutlined';
import { Page, PageHeader } from '../../ui/Page';
import { selectIsAuthenticated, useAuthStore } from '../auth/store';
import { useOnboarding } from './hooks';
import { TourButton, useTourStarter } from './TourButton';

/** The part of the former interface (the top bar) and where it lives now. */
const MOVED: { before: string; now: string }[] = [
    { before: 'Home: the trending words', now: 'Threats Watcher has its own page. The new Dashboard shows what needs your attention across every module.' },
    { before: 'Legitimate Domains', now: 'Same page, with expiry charts and filters.' },
    { before: 'Cyber Watch', now: 'Matches, CVEs, Ransomware, Watch rules and Insights, as tabs.' },
    { before: 'Data Leak', now: 'Alerts, Search patterns and Insights, as tabs.' },
    { before: 'Website Monitoring', now: 'Websites, Changes, Pages (web pages whose text is followed, with their versions) and Insights, as tabs.' },
    { before: 'DNS Threats Monitored', now: 'DNS Threats: look-alikes, certificates and subdomain takeovers in one triage list.' },
    { before: 'Connectors', now: 'Same connectors, plus a Notifications tab to choose and write what is sent.' },
    { before: 'The top bar and its menus', now: 'A sidebar in the same blue. Help and your account are at its bottom.' },
    { before: 'The Bootswatch Darkly theme', now: 'Still the default (#375a7f on #222222), with ten other themes to pick in your profile.' },
];

const NEW: { title: string; text: string }[] = [
    { title: 'Search everything', text: 'Ctrl+K (Cmd+K on a Mac) looks up a domain, a CVE, a keyword or a victim across every module.' },
    { title: 'Bulk add and bulk actions', text: 'Add many items at once, and act on a selection with a progress indicator.' },
    { title: 'Insights', text: 'Charts of the last 30 days on every module. Click a bar to list what it counts.' },
    { title: 'Write your notifications', text: 'Choose the fields of each message, or write the whole message with variables and lines that only show when there is data.' },
    { title: 'Activity', text: 'Who changed what, across every module, with the history of each object.' },
    { title: 'Tours and the setup guide', text: 'A "?" next to the title of each page explains it. The setup guide on the Dashboard lists the first steps.' },
];

/** What changed since the previous version, for people who knew it. Reached from the Dashboard and from the profile. */
export default function WhatsNewPage() {
    const navigate = useNavigate();
    const signedIn = useAuthStore(selectIsAuthenticated);
    const { setDismissed } = useOnboarding();
    const { start } = useTourStarter('changes');

    return (
        <Page maxWidth={1100}>
            <PageHeader
                help={<TourButton tour="changes" />}
                icon={<AutoAwesomeOutlined />}
                title="What's new"
                subtitle="Watcher has a new interface. Everything you used is still here; this page shows where it went."
                actions={
                    <Stack direction="row" spacing={1}>
                        {signedIn && (
                            <Button
                                variant="outlined"
                                color="inherit"
                                startIcon={<PlaylistAddCheckOutlined />}
                                onClick={() => {
                                    setDismissed(false);
                                    void navigate('/');
                                }}
                            >
                                Open the setup guide
                            </Button>
                        )}
                        <Button variant="contained" startIcon={<ExploreOutlined />} onClick={() => void start()}>
                            Show me where things moved
                        </Button>
                    </Stack>
                }
            />

            <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', lg: '3fr 2fr' }, alignItems: 'start' }}>
                <Card>
                    <CardContent>
                        <Typography variant="h3" component="h2" sx={{ mb: 1.5 }}>
                            Where did it go?
                        </Typography>
                        <Table size="small" aria-label="Where the former pages went">
                            <TableHead>
                                <TableRow>
                                    <TableCell>Before</TableCell>
                                    <TableCell>Now</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {MOVED.map((row) => (
                                    <TableRow key={row.before}>
                                        <TableCell sx={{ fontWeight: 600, width: '34%' }}>{row.before}</TableCell>
                                        <TableCell>{row.now}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent>
                        <Typography variant="h3" component="h2" sx={{ mb: 1.5 }}>
                            New
                        </Typography>
                        <Stack spacing={1.5} component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
                            {NEW.map((item) => (
                                <Box component="li" key={item.title}>
                                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                        {item.title}
                                    </Typography>
                                    <Typography variant="body2" color="text.secondary">
                                        {item.text}
                                    </Typography>
                                </Box>
                            ))}
                        </Stack>
                    </CardContent>
                </Card>
            </Box>
        </Page>
    );
}
