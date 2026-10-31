import { useState } from 'react';
import { Button, ListItemText, Menu, MenuItem, Tab, Tabs } from '@mui/material';
import Add from '@mui/icons-material/Add';
import WhatshotOutlined from '@mui/icons-material/WhatshotOutlined';
import { useUrlParams } from '../../lib/useUrlParams';
import { Page, PageHeader } from '../../ui/Page';
import { TourButton } from '../onboarding/TourButton';
import { hasAnyPermission, selectIsAuthenticated, selectUser, useAuthStore } from '../auth/store';
import { BannedTab } from './components/BannedTab';
import { KeywordsTab } from './components/KeywordsTab';
import { SourcesTab } from './components/SourcesTab';
import { ThreatsInsights } from './components/ThreatsInsights';
import { TrendsTab, wordFilterParams } from './components/TrendsTab';
import { useThreatsStatistics } from './hooks';

const TABS = ['trends', 'keywords', 'sources', 'banned', 'insights'] as const;
type TabValue = (typeof TABS)[number];

/** Threats Watcher (home page): what cybersecurity news talk about, what to watch for in it, and where it comes from. */
export default function ThreatsWatcherPage() {
    const { params, update } = useUrlParams();
    const signedIn = useAuthStore(selectIsAuthenticated);
    const user = useAuthStore(selectUser);
    const tabs = TABS.filter((t) => t !== 'banned' || signedIn);
    const tabParam = params.get('tab') as TabValue | null;
    const tab: TabValue = tabParam && tabs.includes(tabParam) ? tabParam : 'trends';
    const { data: stats } = useThreatsStatistics();

    const adds = [
        { dialog: 'add-keyword', tab: 'keywords', label: 'Monitored keywords', hint: 'Alert when the news mention them', perm: 'threats_watcher.add_monitoredkeyword' },
        { dialog: 'add-source', tab: 'sources', label: 'RSS sources', hint: 'More feeds to read', perm: 'threats_watcher.add_source' },
        { dialog: 'add-banned', tab: 'banned', label: 'Banned words', hint: 'Words that should never trend', perm: 'threats_watcher.add_bannedword' },
    ].filter((a) => hasAnyPermission(user, a.perm));
    const [addMenu, setAddMenu] = useState<HTMLElement | null>(null);

    return (
        <Page>
            <PageHeader
                help={<TourButton tour="threatsWatcher" />}
                icon={<WhatshotOutlined />}
                title="Threats Watcher"
                subtitle={`Words trending in cybersecurity news, read every 30 minutes from ${stats ? stats.totalSources.toLocaleString('en-GB') : '…'} RSS sources.`}
                actions={
                    adds.length > 0 && (
                        <>
                            <Button variant="contained" startIcon={<Add />} onClick={(e) => setAddMenu(e.currentTarget)} aria-haspopup="menu">
                                Add
                            </Button>
                            <Menu anchorEl={addMenu} open={addMenu !== null} onClose={() => setAddMenu(null)}>
                                {adds.map((a) => (
                                    <MenuItem
                                        key={a.dialog}
                                        onClick={() => {
                                            setAddMenu(null);
                                            // The dialog belongs to the tab of what is added.
                                            update({ tab: a.tab, dialog: a.dialog });
                                        }}
                                    >
                                        <ListItemText primary={a.label} secondary={a.hint} />
                                    </MenuItem>
                                ))}
                            </Menu>
                        </>
                    )
                }
                tabs={
                    <Tabs value={tab} onChange={(_, t: TabValue) => update({ tab: t === 'trends' ? null : t })} aria-label="Threats Watcher sections" variant="scrollable" allowScrollButtonsMobile>
                        <Tab value="trends" label="Trends" />
                        <Tab value="keywords" label="Monitored keywords" />
                        <Tab value="sources" label="Sources" />
                        {signedIn && <Tab value="banned" label="Banned words" />}
                        <Tab value="insights" label="Insights" />
                    </Tabs>
                }
            />

            {tab === 'trends' && <TrendsTab />}
            {tab === 'keywords' && <KeywordsTab />}
            {tab === 'sources' && <SourcesTab />}
            {tab === 'banned' && <BannedTab />}
            {tab === 'insights' && (
                <ThreatsInsights
                    onWord={(name) => update({ ...wordFilterParams({ search: name, period: '', confidence: '' }), tab: null })}
                    onCountry={(code) => update({ tab: 'sources', scountry: code, sq: null, sconf: null, sstatus: null, spage: null })}
                    onConfidence={(value) => update({ tab: 'sources', sconf: value, sq: null, sstatus: null, scountry: null, spage: null })}
                />
            )}
        </Page>
    );
}
