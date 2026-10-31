import { useState } from 'react';
import { Button, ListItemText, Menu, MenuItem, Tab, Tabs } from '@mui/material';
import Add from '@mui/icons-material/Add';
import DnsOutlined from '@mui/icons-material/DnsOutlined';
import { useUrlParams } from '../../lib/useUrlParams';
import { Page, PageHeader } from '../../ui/Page';
import { TourButton } from '../onboarding/TourButton';
import { hasAnyPermission, selectUser, useAuthStore } from '../auth/store';
import { AssetFormDialog } from './components/AssetFormDialog';
import { AssetsTab } from './components/AssetsTab';
import { DnsInsights } from './components/DnsInsights';
import { NO_THREAT_FILTERS, threatFilterParams, ThreatsTab } from './components/ThreatsTab';
import type { Asset, AssetKind } from './types';

const TABS = ['threats', 'domains', 'keywords', 'insights'] as const;
type TabValue = (typeof TABS)[number];
const ADD_DIALOGS: Record<string, AssetKind> = { 'add-domain': 'domain', 'add-keyword': 'keyword' };

/** DNS threats: triage of what was detected, the corporate domains and keywords that are watched, and trends. */
export default function DnsFinderPage() {
    const { params, update } = useUrlParams();
    const tabParam = params.get('tab') as TabValue | null;
    const tab: TabValue = tabParam && TABS.includes(tabParam) ? tabParam : 'threats';

    const user = useAuthStore(selectUser);
    const can = {
        domain: {
            add: hasAnyPermission(user, 'dns_finder.add_dnsmonitored'),
            manage: hasAnyPermission(user, 'dns_finder.change_dnsmonitored', 'dns_finder.delete_dnsmonitored'),
        },
        keyword: {
            add: hasAnyPermission(user, 'dns_finder.add_keywordmonitored'),
            manage: hasAnyPermission(user, 'dns_finder.change_keywordmonitored', 'dns_finder.delete_keywordmonitored'),
        },
    };
    const [addMenu, setAddMenu] = useState<HTMLElement | null>(null);
    const [editing, setEditing] = useState<{ kind: AssetKind; asset: Asset } | null>(null);
    const adding = ADD_DIALOGS[params.get('dialog') ?? ''] ?? null;

    return (
        <Page>
            <PageHeader
                help={<TourButton tour="dnsFinder" />}
                icon={<DnsOutlined />}
                title="DNS threats"
                subtitle="Look-alike domains, certificates issued for your keywords, and subdomains at takeover risk."
                actions={
                    (can.domain.add || can.keyword.add) && (
                        <>
                            <Button variant="contained" startIcon={<Add />} onClick={(e) => setAddMenu(e.currentTarget)} aria-haspopup="menu">
                                Watch more
                            </Button>
                            <Menu anchorEl={addMenu} open={addMenu !== null} onClose={() => setAddMenu(null)}>
                                {can.domain.add && (
                                    <MenuItem
                                        onClick={() => {
                                            setAddMenu(null);
                                            update({ dialog: 'add-domain' });
                                        }}
                                    >
                                        <ListItemText primary="Domains" secondary="Look-alikes and takeover risks" />
                                    </MenuItem>
                                )}
                                {can.keyword.add && (
                                    <MenuItem
                                        onClick={() => {
                                            setAddMenu(null);
                                            update({ dialog: 'add-keyword' });
                                        }}
                                    >
                                        <ListItemText primary="Keywords" secondary="New certificates that contain them" />
                                    </MenuItem>
                                )}
                            </Menu>
                        </>
                    )
                }
                tabs={
                    <Tabs value={tab} onChange={(_, t: TabValue) => update({ tab: t === 'threats' ? null : t })} aria-label="DNS threats sections">
                        <Tab value="threats" label="Threats" />
                        <Tab value="domains" label="Monitored domains" />
                        <Tab value="keywords" label="Keywords" />
                        <Tab value="insights" label="Insights" />
                    </Tabs>
                }
            />

            {tab === 'threats' && <ThreatsTab />}
            {tab === 'domains' && (
                <AssetsTab kind="domain" canAdd={can.domain.add} canManage={can.domain.manage} onEdit={(asset) => setEditing({ kind: 'domain', asset })} />
            )}
            {tab === 'keywords' && (
                <AssetsTab kind="keyword" canAdd={can.keyword.add} canManage={can.keyword.manage} onEdit={(asset) => setEditing({ kind: 'keyword', asset })} />
            )}
            {tab === 'insights' && <DnsInsights onFilter={(patch) => update({ ...threatFilterParams({ ...NO_THREAT_FILTERS, ...patch }), tab: null })} />}

            <AssetFormDialog
                kind={editing?.kind ?? adding}
                asset={editing?.asset ?? null}
                onClose={() => (editing ? setEditing(null) : update({ dialog: null }))}
            />
        </Page>
    );
}
