import type { ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter, Navigate, Outlet, Route, Routes } from 'react-router';
import { Box } from '@mui/material';
import { QueryClientProvider } from '@tanstack/react-query';
import { SnackbarProvider } from 'notistack';

import { queryClient } from '../api/queryClient';
import { initSession } from '../features/auth/hooks';
import { ThemeModeProvider } from '../styles/ThemeModeProvider';
import AppShell from '../layouts/AppShell';
import { Toast } from '../ui/Toast';

import OverviewPage from '../features/overview/OverviewPage';
import ThreatsWatcherPage from '../features/threatsWatcher/ThreatsWatcherPage';
import LoginPage from '../features/auth/components/LoginPage';
import ActivityPage from '../features/timeline/ActivityPage';
import ProfilePage from '../features/auth/components/ProfilePage';
import DataLeakPage from '../features/dataLeak/DataLeakPage';
import SiteMonitoringPage from '../features/siteMonitoring/SiteMonitoringPage';
import DnsFinderPage from '../features/dnsFinder/DnsFinderPage';
import LegitimateDomainsPage from '../features/legitimateDomains/LegitimateDomainsPage';
import CyberWatchPage from '../features/cyberWatch/CyberWatchPage';
import ConnectorsPage from '../features/connectors/ConnectorsPage';
import NotFoundPage from '../ui/NotFoundPage';
import { BulkProgress, BulkResultDialog } from '../features/bulk/BulkFeedback';
import PrivateRoute from './common/PrivateRoute';
import { ModuleGate } from '../features/visitor/LockedModulePage';

const signedIn = (page: ReactNode) => <PrivateRoute>{page}</PrivateRoute>;
/** A module that needs an account: a visitor sees what it does, and the way to sign in. */
const gated = (to: string, page: ReactNode) => <ModuleGate to={to}>{page}</ModuleGate>;

function App() {
    return (
        <QueryClientProvider client={queryClient}>
            <ThemeModeProvider>
                <SnackbarProvider maxSnack={4} autoHideDuration={null} anchorOrigin={{ vertical: 'top', horizontal: 'center' }} Components={{ success: Toast, error: Toast, warning: Toast, info: Toast, default: Toast }}>
                    <HashRouter>
                        <BulkProgress />
                        <BulkResultDialog />
                        {/* The pages sit above the backdrop of the themes that have one (it is fixed behind them, at z-index 0) */}
                        <Box sx={{ position: 'relative', zIndex: 1 }}>
                        <Routes>
                            {/* The sign-in page is a full screen of its own, without the sidebar. */}
                            <Route path="/login" element={<LoginPage />} />
                            <Route
                                element={
                                    <AppShell>
                                        <Outlet />
                                    </AppShell>
                                }
                            >
                                <Route path="/" element={<OverviewPage />} />
                                <Route path="/threats_watcher" element={<ThreatsWatcherPage />} />
                                <Route path="/password_change" element={<Navigate to="/profile?dialog=password" replace />} />
                                <Route path="/profile" element={signedIn(<ProfilePage />)} />
                                <Route path="/legitimate_domains" element={<LegitimateDomainsPage />} />
                                <Route path="/data_leak" element={gated('/data_leak', <DataLeakPage />)} />
                                <Route path="/website_monitoring" element={gated('/website_monitoring', <SiteMonitoringPage />)} />
                                <Route path="/dns_finder" element={gated('/dns_finder', <DnsFinderPage />)} />
                                <Route path="/cyber_watch" element={gated('/cyber_watch', <CyberWatchPage />)} />
                                <Route path="/connectors" element={signedIn(<ConnectorsPage />)} />
                                <Route path="/activity" element={gated('/activity', <ActivityPage />)} />
                                <Route path="*" element={<NotFoundPage />} />
                            </Route>
                        </Routes>
                        </Box>
                    </HashRouter>
                </SnackbarProvider>
            </ThemeModeProvider>
        </QueryClientProvider>
    );
}

// The session is checked once, before the first render (the token in the browser is validated against the API).
void initSession();
createRoot(document.getElementById('app') as HTMLElement).render(<App />);
