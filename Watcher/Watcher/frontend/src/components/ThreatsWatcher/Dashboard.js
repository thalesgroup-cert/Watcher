import React, { Component, Fragment } from 'react';
import { connect } from 'react-redux';
import { getLeads, getMonitoredKeywords } from '../../actions/leads';

import PostUrls from './PostUrls';
import WordCloud from './WordCloud';
import WordList from './WordList';
import TrendChart from './TrendChart';
import WeeklyBreaking from './WeeklyBreaking';
import WordSummary from './WordSummary';
import ResizableContainer from '../common/ResizableContainer';
import WorldMapPanel from './WorldMap';
import RansomwareVictims from './RansomwareVictims';
import ThreatsWatcherStatistics from './ThreatsWatcherStatistics';
import CVEVulnerabilities from './CVEVulnerabilities';
import PanelGrid from '../common/PanelGrid';
import { LAYOUT_PRESETS } from '../../config/layoutPresets';
import store from '../../store';
import { setIsPasswordChanged } from '../../actions/auth';


const DEFAULT_LAYOUT = [
    { i: 'stats',   x: 0, y: 0,  w: 12, h: 10, minW: 6, minH: 3,  moved: false, static: false },
    { i: 'cloud',   x: 0, y: 10, w: 6,  h: 10, minW: 3, minH: 5,  moved: false, static: false },
    { i: 'words',   x: 6, y: 10, w: 6,  h: 10, minW: 3, minH: 5,  moved: false, static: false },
    { i: 'sources', x: 0, y: 20, w: 12, h: 11, minW: 6, minH: 5,  moved: false, static: false },
    { i: 'chart',   x: 0, y: 31, w: 12, h: 8,  minW: 6, minH: 4,  moved: false, static: false },
    { i: 'map',     x: 0, y: 39, w: 6,  h: 10, minW: 3, minH: 6,  moved: false, static: false },
    { i: 'victims', x: 6, y: 39, w: 6,  h: 10, minW: 3, minH: 5,  moved: false, static: false },
    { i: 'cve',     x: 0, y: 49, w: 12, h: 12, minW: 4, minH: 5,  moved: false, static: false },
];

const DEFAULT_ACTIVE = ['stats', 'cloud', 'words', 'map', 'victims', 'cve', 'sources', 'chart'];

// rowHeight = 55. Formula: Math.ceil((200 + n * 50) / 55) + 1
const itemsToH = (n) => Math.ceil((200 + n * 50) / 55) + 1;


class Dashboard extends Component {
    constructor(props) {
        super(props);
        this.state = {
            postUrls:                     [],
            word:                         '',
            filteredLeads:                [],
            selectedMapCountry:           null,
            wordListItemsPerPage:         5,
            ransomwareVictimsItemsPerPage: 5,
            fromSourceFilter:             null,
            selectedWord:                 '',
        };
        this.loadingTimer = null;
    }


    componentDidMount() {
        store.dispatch(setIsPasswordChanged());
        this.loadInitialData();
    }

    componentDidUpdate(prevProps) {
        if (!this.state.word) {
            const { leads, monitoredKeywords } = this.props;
            if (prevProps.leads !== leads || prevProps.monitoredKeywords !== monitoredKeywords) {
                const leadMap = new Map(leads.map(l => [l.name.toLowerCase(), { name: l.name, posturls: l.posturls || [], date: l.created_at }]));
                const combined = [...leadMap.values()];
                (monitoredKeywords || []).filter(mk => mk.last_seen && !leadMap.has(mk.name.toLowerCase())).forEach(mk => {
                    combined.push({ name: mk.name, posturls: mk.posturls || [], date: mk.last_seen });
                });
                const newest = combined.sort((a, b) => new Date(b.date) - new Date(a.date))[0];
                if (newest) this.setPostUrls(newest.posturls, newest.name);
            }
        }
    }

    componentWillUnmount() {
        if (this.loadingTimer) clearTimeout(this.loadingTimer);
    }

    loadInitialData = async () => {
        try {
            this.props.getMonitoredKeywords();
            await this.props.getLeads(1, 100);
            this.loadingTimer = setTimeout(this.loadRemainingLeadsInBackground, 500);
        } catch (_) {}
    };

    loadRemainingLeadsInBackground = async () => {
        if (!this.props.leadsNext) return;
        try {
            let page = 2, hasMore = true;
            while (hasMore) {
                try {
                    const res = await this.props.getLeads(page, 100);
                    hasMore = res.next !== null;
                    page++;
                    if (hasMore) await new Promise(r => setTimeout(r, 300));
                } catch (_) { hasMore = false; }
            }
        } catch (_) {}
    };


    setPostUrls        = (postUrls, word)  => this.setState({ postUrls, word, selectedWord: word });
    handleDataFiltered = (filteredLeads)   => setTimeout(() => this.setState({ filteredLeads }), 0);
    handleFromSourceFilter = (filter)      => this.setState({ fromSourceFilter: filter });
    handleCountrySelect = (iso)            => this.setState({ selectedMapCountry: iso });
    handleWordListItems = (n)              => this.setState({ wordListItemsPerPage: n });
    handleVictimItems   = (n)              => this.setState({ ransomwareVictimsItemsPerPage: n });

    computeLayoutOverrides() {
        const { wordListItemsPerPage, ransomwareVictimsItemsPerPage } = this.state;
        return {
            words:   { h: itemsToH(wordListItemsPerPage) },
            victims: { h: itemsToH(ransomwareVictimsItemsPerPage) },
        };
    }


    buildPanels() {
        const { word, postUrls, filteredLeads, selectedMapCountry } = this.state;

        return {
            stats: {
                label: 'Statistics',
                icon: 'bar_chart',
                tooltip: 'Carousel: Threats Watcher · Ransomware · CVE - auto-advances every 3 minutes',
                children: <ThreatsWatcherStatistics setPostUrls={this.setPostUrls} />,
            },

            cloud: {
                label: 'Word Cloud',
                icon: 'cloud',
                tooltip: 'Visualize trending cybersecurity keywords - size reflects frequency',
                children: (
                    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12 }}>
                        <WordCloud setPostUrls={this.setPostUrls} filteredData={filteredLeads.length > 0 ? filteredLeads : null} fromSourceFilter={this.state.fromSourceFilter} selectedWord={this.state.selectedWord} />
                    </div>
                ),
            },

            words: {
                label: 'Word List',
                icon: 'list',
                tooltip: 'Sortable list of trending words - filter by country, reliability, or monitored status',
                children: (
                    <div style={{ padding: '12px 16px', height: '100%', overflowY: 'auto' }}>
                        <WordList
                            setPostUrls={this.setPostUrls}
                            selectedWord={this.state.selectedWord}
                            onDataFiltered={this.handleDataFiltered}
                            onFromSourceFilterChange={this.handleFromSourceFilter}
                            onItemsPerPageChange={this.handleWordListItems}
                            filterCountry={selectedMapCountry}
                            onCountrySelect={this.handleCountrySelect}
                        />
                    </div>
                ),
            },

            map: {
                label: 'World Map',
                icon: 'public',
                tooltip: 'Geographic distribution of threat sources - click a country to filter',
                children: (
                    <WorldMapPanel
                        embedded
                        onCountrySelect={this.handleCountrySelect}
                        filterCountry={selectedMapCountry}
                    />
                ),
            },

            victims: {
                label: 'Ransomware Victims',
                icon: 'lock',
                tooltip: 'Recent ransomware victim organizations tracked from public leak sites',
                children: (
                    <div style={{ padding: '12px 16px', height: '100%', overflowY: 'auto' }}>
                        <RansomwareVictims
                            filterCountry={selectedMapCountry}
                            onCountrySelect={this.handleCountrySelect}
                            onItemsPerPageChange={this.handleVictimItems}
                        />
                    </div>
                ),
            },

            cve: {
                label: 'CVE Vulnerabilities',
                icon: 'bug_report',
                tooltip: 'Recent CVE vulnerabilities with matches to watch rules and all tracked CVEs',
                children: (
                    <div style={{ padding: '12px 16px', height: '100%', overflowY: 'auto' }}>
                        <CVEVulnerabilities />
                    </div>
                ),
            },

            sources: {
                label: 'Sources & Summary',
                icon: 'link',
                tooltip: 'Source articles and word summary for the selected keyword',
                children: word ? (
                    <div style={{ padding: '12px 16px', height: '100%', overflowY: 'auto' }}>
                        <ResizableContainer
                            leftComponent={<WordSummary word={word} />}
                            rightComponent={<PostUrls postUrls={postUrls} word={word} />}
                            defaultLeftWidth={50}
                            minLeftWidth={30}
                            maxLeftWidth={70}
                            storageKey="watcher_postUrls_summary"
                        />
                    </div>
                ) : (
                    <div className="d-flex align-items-center justify-content-center h-100 text-muted">
                        <div className="text-center py-4">
                            <i className="material-icons d-block mb-2" style={{ fontSize: '2.5rem', opacity: 0.25 }}>
                                link
                            </i>
                            <small>Click a word to see sources &amp; summary</small>
                        </div>
                    </div>
                ),
            },

            chart: {
                label: 'Trend',
                icon: 'trending_up',
                tooltip: 'Keyword occurrence trend over time',
                children: word ? (
                    <div style={{ padding: '12px 16px', height: '100%', overflowY: 'auto' }}>
                        <TrendChart postUrls={postUrls} word={word} />
                    </div>
                ) : (
                    <div className="d-flex align-items-center justify-content-center h-100 text-muted">
                        <div className="text-center py-4">
                            <i className="material-icons d-block mb-2" style={{ fontSize: '2.5rem', opacity: 0.25 }}>
                                trending_up
                            </i>
                            <small>Click a word to see the trend</small>
                        </div>
                    </div>
                ),
            },
        };
    }


    render() {
        return (
            <Fragment>
                <WeeklyBreaking />

                <PanelGrid
                    panels={this.buildPanels()}
                    defaultLayout={DEFAULT_LAYOUT}
                    defaultActive={DEFAULT_ACTIVE}
                    storageKey="watcher_threats_grid"
                    layoutPresets={LAYOUT_PRESETS['watcher_threats_grid']}
                    forceActivate={this.state.word ? ['sources', 'chart'] : null}
                    layoutOverrides={this.computeLayoutOverrides()}
                />
            </Fragment>
        );
    }
}

const mapStateToProps = state => ({
    leads:             state.leads.leads             || [],
    leadsCount:        state.leads.leadsCount        || 0,
    leadsNext:         state.leads.leadsNext         || null,
    monitoredKeywords: state.leads.monitoredKeywords || [],
});

export default connect(mapStateToProps, { getLeads, getMonitoredKeywords })(Dashboard);
