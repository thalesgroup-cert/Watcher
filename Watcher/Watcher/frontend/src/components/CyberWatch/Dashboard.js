import React, { Component, Fragment } from 'react';
import WatchRules from './WatchRules';
import CyberWatchStats from './CyberWatchStats';
import MonitoredKeywordsPanel from './MonitoredKeywordsPanel';
import SourcesPanel from './SourcesPanel';
import BannedWordsPanel from './BannedWordsPanel';
import ArchivedAlerts from './ArchivedAlerts';
import PanelGrid from '../common/PanelGrid';

const DEFAULT_LAYOUT = [
    { i: 'stats',     x: 0, y: 0,  w: 12, h: 4,  minW: 4, minH: 4 },
    { i: 'monitored', x: 0, y: 4,  w: 6,  h: 11, minW: 4, minH: 5 },
    { i: 'watchrules',x: 6, y: 4,  w: 6,  h: 11, minW: 4, minH: 5 },
    { i: 'sources',   x: 0, y: 15, w: 6,  h: 11, minW: 4, minH: 5 },
    { i: 'banned',    x: 6, y: 15, w: 6,  h: 11, minW: 4, minH: 5 },
    { i: 'archived',  x: 0, y: 26, w: 12, h: 12, minW: 4, minH: 6 },
];

const DEFAULT_ACTIVE = ['stats', 'monitored', 'watchrules', 'sources', 'banned', 'archived'];

class CyberWatchDashboard extends Component {
    buildPanels() {
        return {
            stats: {
                label: 'Statistics',
                icon: 'bar_chart',
                tooltip: 'Overview of watch rules, keywords, and alert activity',
                children: (
                    <div style={{ padding: '12px 16px', height: '100%', overflowY: 'auto' }}>
                        <CyberWatchStats />
                    </div>
                ),
            },
            monitored: {
                label: 'Monitored Keywords',
                icon: 'track_changes',
                tooltip: 'Manage keywords tracked across all RSS feed articles',
                children: (
                    <div style={{ padding: '12px 16px', height: '100%', overflowY: 'auto' }}>
                        <MonitoredKeywordsPanel />
                    </div>
                ),
            },
            watchrules: {
                label: 'Watch Rules',
                icon: 'visibility',
                tooltip: 'Configure rules to match CVEs and ransomware events',
                children: (
                    <div style={{ padding: '12px 16px', height: '100%', overflowY: 'auto' }}>
                        <WatchRules />
                    </div>
                ),
            },
            sources: {
                label: 'Sources',
                icon: 'rss_feed',
                tooltip: 'Manage RSS feed sources monitored for threats',
                children: (
                    <div style={{ padding: '12px 16px', height: '100%', overflowY: 'auto' }}>
                        <SourcesPanel />
                    </div>
                ),
            },
            banned: {
                label: 'Banned Words',
                icon: 'block',
                tooltip: 'Words excluded from trending detection',
                children: (
                    <div style={{ padding: '12px 16px', height: '100%', overflowY: 'auto' }}>
                        <BannedWordsPanel />
                    </div>
                ),
            },
            archived: {
                label: 'Archived Alerts',
                icon: 'inventory',
                tooltip: 'CVE alerts and ransomware victims that have been archived',
                children: (
                    <div style={{ padding: '12px 16px', height: '100%', overflowY: 'auto' }}>
                        <ArchivedAlerts />
                    </div>
                ),
            },
        };
    }

    render() {
        return (
            <Fragment>
                <PanelGrid
                    panels={this.buildPanels()}
                    defaultLayout={DEFAULT_LAYOUT}
                    defaultActive={DEFAULT_ACTIVE}
                    storageKey="watcher_cyber_watch_grid"
                />
            </Fragment>
        );
    }
}

export default CyberWatchDashboard;

