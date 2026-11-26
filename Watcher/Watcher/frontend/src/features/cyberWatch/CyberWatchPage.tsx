import { Button, Tab, Tabs } from '@mui/material';
import Add from '@mui/icons-material/Add';
import SecurityOutlined from '@mui/icons-material/SecurityOutlined';
import { useUrlParams } from '../../lib/useUrlParams';
import { Page, PageHeader } from '../../ui/Page';
import { TourButton } from '../onboarding/TourButton';
import { hasAnyPermission, selectUser, useAuthStore } from '../auth/store';
import { CyberInsights } from './components/CyberInsights';
import { CvesTab, cveFilterParams, NO_CVE_FILTERS } from './components/CvesTab';
import { matchFilterParams, MatchesTab, NO_MATCH_FILTERS } from './components/MatchesTab';
import { RulesTab } from './components/RulesTab';
import { NO_VICTIM_FILTERS, victimFilterParams, VictimsTab } from './components/VictimsTab';
import type { Match, VictimFilters } from './types';

const TABS = ['matches', 'cves', 'ransomware', 'rules', 'insights'] as const;
type TabValue = (typeof TABS)[number];

/** Cyber Watch: new CVEs and ransomware victims, and what your watch rules found in them. */
export default function CyberWatchPage() {
    const { params, update } = useUrlParams();
    const user = useAuthStore(selectUser);
    const canSeeRules = hasAnyPermission(user, 'cyber_watch.view_watchrule');
    const canAddRule = hasAnyPermission(user, 'cyber_watch.add_watchrule');
    const tabs = TABS.filter((t) => t !== 'rules' || canSeeRules);
    const tabParam = params.get('tab') as TabValue | null;
    const tab: TabValue = tabParam && tabs.includes(tabParam) ? tabParam : 'matches';

    // Every jump closes the drawers of the other tabs, so the URL only describes what is on screen.
    const closed = { match: null, cve: null, victim: null, rule: null, dialog: null };
    const openMatch = (m: Match) => update({ ...closed, ...matchFilterParams({ ...NO_MATCH_FILTERS, status: 'all' }), tab: null, match: m.id });
    const openTarget = (m: Match) => {
        if (m.target?.kind === 'cve') update({ ...closed, ...cveFilterParams({ ...NO_CVE_FILTERS, status: 'all' }), tab: 'cves', cve: m.target.id });
        else if (m.target?.kind === 'victim') update({ ...closed, ...victimFilterParams({ ...NO_VICTIM_FILTERS, status: 'all' }), tab: 'ransomware', victim: m.target.id });
    };
    const openRule = (id: number) => update({ ...closed, tab: 'rules', rule: id });
    const showVictims = (patch: Partial<VictimFilters>) => update({ ...closed, ...victimFilterParams({ ...NO_VICTIM_FILTERS, ...patch }), tab: 'ransomware' });
    const showRuleMatches = (ruleId: number) => update({ ...closed, ...matchFilterParams({ ...NO_MATCH_FILTERS, rule: String(ruleId) }), tab: null });

    return (
        <Page>
            <PageHeader
                help={<TourButton tour="cyberWatch" />}
                icon={<SecurityOutlined />}
                title="Cyber Watch"
                subtitle="New CVEs and ransomware victims, collected every 30 minutes and checked against your watch rules."
                actions={
                    canAddRule && (
                        <Button variant="contained" startIcon={<Add />} onClick={() => update({ ...closed, tab: 'rules', dialog: 'add-rule' })}>
                            New watch rule
                        </Button>
                    )
                }
                tabs={
                    <Tabs value={tab} onChange={(_, t: TabValue) => update({ tab: t === 'matches' ? null : t })} aria-label="Cyber Watch sections" variant="scrollable" allowScrollButtonsMobile>
                        <Tab value="matches" label="Matches" />
                        <Tab value="cves" label="CVEs" />
                        <Tab value="ransomware" label="Ransomware" />
                        {canSeeRules && <Tab value="rules" label="Watch rules" />}
                        <Tab value="insights" label="Insights" />
                    </Tabs>
                }
            />

            {tab === 'matches' && (
                <MatchesTab
                    canChange={hasAnyPermission(user, 'cyber_watch.change_watchrulehit')}
                    canSeeRules={canSeeRules}
                    onOpenTarget={openTarget}
                    onOpenRule={openRule}
                    onGroup={(group) => showVictims({ group: String(group), status: 'all' })}
                />
            )}
            {tab === 'cves' && <CvesTab canChange={hasAnyPermission(user, 'cyber_watch.change_cvealert')} onOpenMatch={openMatch} />}
            {tab === 'ransomware' && <VictimsTab canChange={hasAnyPermission(user, 'cyber_watch.change_ransomwarevictim')} onOpenMatch={openMatch} />}
            {tab === 'rules' && <RulesTab onOpenMatch={openMatch} onShowMatches={(r) => showRuleMatches(r.id)} />}
            {tab === 'insights' && (
                <CyberInsights
                    onSeverity={(severity) => update({ ...closed, ...cveFilterParams({ ...NO_CVE_FILTERS, severity: [severity] }), tab: 'cves' })}
                    onGroup={(group) => showVictims({ group: String(group) })}
                    onCountry={(country) => showVictims({ country })}
                    onSector={(sector) => showVictims({ sector })}
                    onRule={showRuleMatches}
                />
            )}
        </Page>
    );
}
