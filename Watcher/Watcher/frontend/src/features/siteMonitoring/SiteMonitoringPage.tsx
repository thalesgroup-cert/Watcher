import { useState } from 'react';
import { Button, Tab, Tabs } from '@mui/material';
import Add from '@mui/icons-material/Add';
import MonitorHeartOutlined from '@mui/icons-material/MonitorHeartOutlined';
import { useUrlParams } from '../../lib/useUrlParams';
import { Page, PageHeader } from '../../ui/Page';
import { TourButton } from '../onboarding/TourButton';
import { hasAnyPermission, selectUser, useAuthStore } from '../auth/store';
import { changeFilterParams, ChangesTab, NO_CHANGE_FILTERS } from './components/ChangesTab';
import { SiteFormDialog } from './components/SiteFormDialog';
import { SiteInsights } from './components/SiteInsights';
import { PagesTab } from './components/PagesTab';
import { SitesTab } from './components/SitesTab';
import type { Site } from './types';

const TABS = ['websites', 'changes', 'pages', 'insights'] as const;
type TabValue = (typeof TABS)[number];

/** Website monitoring: the suspicious websites being watched, the changes detected on them, and trends. */
export default function SiteMonitoringPage() {
    const { params, update } = useUrlParams();
    const tabParam = params.get('tab') as TabValue | null;
    const tab: TabValue = tabParam && TABS.includes(tabParam) ? tabParam : 'websites';
    const user = useAuthStore(selectUser);
    const canAdd = hasAnyPermission(user, 'site_monitoring.add_site');
    const canAddPage = hasAnyPermission(user, 'site_monitoring.add_monitoredpage');
    const [editing, setEditing] = useState<Site | null>(null);

    return (
        <Page>
            <PageHeader
                help={<TourButton tour="siteMonitoring" />}
                icon={<MonitorHeartOutlined />}
                title="Website monitoring"
                subtitle={
                    tab === 'pages'
                        ? 'Web pages without a feed, such as research blogs: their text is kept at each change and you are told when enough of it changed.'
                        : 'Suspicious websites watched every 15 minutes for changes of hosting, mail servers, content, registration and certificate.'
                }
                actions={
                    tab === 'pages'
                        ? canAddPage && (
                              <Button variant="contained" startIcon={<Add />} onClick={() => update({ dialog: 'add-page' })}>
                                  Monitor a page
                              </Button>
                          )
                        : canAdd && (
                              <Button variant="contained" startIcon={<Add />} onClick={() => update({ dialog: 'add' })}>
                                  Monitor websites
                              </Button>
                          )
                }
                tabs={
                    <Tabs value={tab} onChange={(_, t: TabValue) => update({ tab: t === 'websites' ? null : t })} aria-label="Website monitoring sections">
                        <Tab value="websites" label="Websites" />
                        <Tab value="changes" label="Changes" />
                        <Tab value="pages" label="Pages" />
                        <Tab value="insights" label="Insights" />
                    </Tabs>
                }
            />

            {tab === 'websites' && <SitesTab onEdit={setEditing} />}
            {tab === 'changes' && <ChangesTab />}
            {tab === 'pages' && <PagesTab />}
            {tab === 'insights' && (
                <SiteInsights
                    onLegitimacy={(level) => update({ tab: null, legitimacy: level, q: null, web: null, expiry: null, action: null, page: null })}
                    onKind={(kind) => update({ ...changeFilterParams({ ...NO_CHANGE_FILTERS, status: 'all', kind }), tab: 'changes' })}
                />
            )}

            <SiteFormDialog
                open={params.get('dialog') === 'add' || editing !== null}
                site={editing}
                onClose={() => (editing ? setEditing(null) : update({ dialog: null }))}
            />
        </Page>
    );
}
