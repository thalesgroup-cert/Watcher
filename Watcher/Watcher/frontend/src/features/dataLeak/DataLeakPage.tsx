import { useState } from 'react';
import { Button, Tab, Tabs } from '@mui/material';
import Add from '@mui/icons-material/Add';
import TravelExploreOutlined from '@mui/icons-material/TravelExploreOutlined';
import { useUrlParams } from '../../lib/useUrlParams';
import { Page, PageHeader } from '../../ui/Page';
import { TourButton } from '../onboarding/TourButton';
import { hasAnyPermission, selectUser, useAuthStore } from '../auth/store';
import { AlertsTab, alertFilterParams } from './components/AlertsTab';
import { DataLeakInsights } from './components/DataLeakInsights';
import { PatternFormDialog } from './components/PatternFormDialog';
import { PatternsTab } from './components/PatternsTab';
import type { Pattern } from './types';

const TABS = ['alerts', 'patterns', 'insights'] as const;
type TabValue = (typeof TABS)[number];

/** Data leaks: triage of the findings, the search patterns that produce them, and trends. */
export default function DataLeakPage() {
    const { params, update } = useUrlParams();
    const tabParam = params.get('tab') as TabValue | null;
    const tab: TabValue = tabParam && TABS.includes(tabParam) ? tabParam : 'alerts';

    const user = useAuthStore(selectUser);
    const canChangeAlerts = hasAnyPermission(user, 'data_leak.change_alert');
    const canAdd = hasAnyPermission(user, 'data_leak.add_keyword');
    const canManage = hasAnyPermission(user, 'data_leak.change_keyword', 'data_leak.delete_keyword');
    const [editing, setEditing] = useState<Pattern | null>(null);

    return (
        <Page>
            <PageHeader
                help={<TourButton tour="dataLeak" />}
                icon={<TravelExploreOutlined />}
                title="Data leaks"
                subtitle="Your search patterns found on paste sites, code hosts and forums. Review each finding, then archive it."
                actions={
                    canAdd && (
                        <Button variant="contained" startIcon={<Add />} onClick={() => update({ dialog: 'add' })}>
                            Add patterns
                        </Button>
                    )
                }
                tabs={
                    <Tabs value={tab} onChange={(_, t: TabValue) => update({ tab: t === 'alerts' ? null : t })} aria-label="Data leak sections">
                        <Tab value="alerts" label="Alerts" />
                        <Tab value="patterns" label="Search patterns" />
                        <Tab value="insights" label="Insights" />
                    </Tabs>
                }
            />

            {tab === 'alerts' && <AlertsTab canChange={canChangeAlerts} />}
            {tab === 'patterns' && <PatternsTab canAdd={canAdd} canManage={canManage} onEdit={setEditing} />}
            {tab === 'insights' && <DataLeakInsights onFilter={(patch) => update({ ...alertFilterParams({ status: 'active', search: '', keyword: '', source: '', period: '', ...patch }), tab: null })} />}

            <PatternFormDialog
                open={params.get('dialog') === 'add' || editing !== null}
                pattern={editing}
                onClose={() => (editing ? setEditing(null) : update({ dialog: null }))}
            />
        </Page>
    );
}
