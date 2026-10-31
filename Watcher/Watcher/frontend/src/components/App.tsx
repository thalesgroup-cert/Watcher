import type { ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter, Navigate, Outlet, Route, Routes } from 'react-router';
import { QueryClientProvider } from '@tanstack/react-query';
import { SnackbarProvider } from 'notistack';

import { queryClient } from '../api/queryClient';
import { initSession } from '../features/auth/hooks';
import { ThemeModeProvider } from '../styles/ThemeModeProvider';
import AppShell from '../layouts/AppShell';

import DashboardPage from '../features/dashboard/DashboardPage';
import WhatsNewPage from '../features/onboarding/WhatsNewPage';
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

const signedIn = (page: ReactNode) => <PrivateRoute>{page}</PrivateRoute>;

function App() {
    return (
        <QueryClientProvider client={queryClient}>
            <ThemeModeProvider>
                <SnackbarProvider maxSnack={4} autoHideDuration={3000} anchorOrigin={{ vertical: 'top', horizontal: 'center' }}>
                    <HashRouter>
                        <BulkProgress />
                        <BulkResultDialog />
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
                                <Route path="/" element={<DashboardPage />} />
                                <Route path="/whats_new" element={<WhatsNewPage />} />
                                <Route path="/threats_watcher" element={<ThreatsWatcherPage />} />
                                <Route path="/password_change" element={<Navigate to="/profile?dialog=password" replace />} />
                                <Route path="/profile" element={signedIn(<ProfilePage />)} />
                                <Route path="/legitimate_domains" element={<LegitimateDomainsPage />} />
                                <Route path="/data_leak" element={signedIn(<DataLeakPage />)} />
                                <Route path="/website_monitoring" element={signedIn(<SiteMonitoringPage />)} />
                                <Route path="/dns_finder" element={signedIn(<DnsFinderPage />)} />
                                <Route path="/cyber_watch" element={signedIn(<CyberWatchPage />)} />
                                <Route path="/connectors" element={signedIn(<ConnectorsPage />)} />
                                <Route path="/activity" element={signedIn(<ActivityPage />)} />
                                <Route path="*" element={<NotFoundPage />} />
                            </Route>
                        </Routes>
                    </HashRouter>
                </SnackbarProvider>
            </ThemeModeProvider>
        </QueryClientProvider>
    );
}

// The session is checked once, before the first render (the token in the browser is validated against the API).
void initSession();
createRoot(document.getElementById('app') as HTMLElement).render(<App />);
