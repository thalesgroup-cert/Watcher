import React, { Component, Fragment } from 'react';
import { connect } from 'react-redux';
import { getLeads } from '../../actions/leads';

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
import store from '../../store';
import { setIsPasswordChanged } from '../../actions/auth';


const DEFAULT_LAYOUT = [
    { i: 'stats',   x: 0, y: 0,  w: 12, h: 10, minW: 2, minH: 3, moved: false, static: false },
    { i: 'cloud',   x: 0, y: 10, w: 6,  h: 10, minW: 3, minH: 5, moved: false, static: false },
    { i: 'words',   x: 6, y: 10, w: 6,  h: 10, minW: 3, minH: 5, moved: false, static: false },
    { i: 'victims', x: 6, y: 20, w: 6,  h: 10, minW: 3, minH: 5, moved: false, static: false },
    { i: 'map',     x: 0, y: 20, w: 6,  h: 10, minW: 3, minH: 6, moved: false, static: false },
    { i: 'cve',     x: 0, y: 30, w: 12, h: 12, minW: 4, minH: 5, moved: false, static: false },
    { i: 'trend',   x: 0, y: 42, w: 12, h: 11, minW: 6, minH: 5, moved: false, static: false },
];

const DEFAULT_ACTIVE = ['stats', 'cloud', 'words', 'map', 'victims', 'cve', 'trend'];

// rowHeight = 55. Formula: Math.ceil((200 + n * 50) / 55) + 1
const itemsToH = (n) => Math.ceil((200 + n * 50) / 55) + 1;


class Dashboard extends Component {
    constructor(props) {
        super(props);
        this.state = {
            postUrls:                [],
            word:                    '',
            filteredLeads:           [],
            selectedMapCountry:      null,
            wordListItemsPerPage:    5,
            ransomwareVictimsItemsPerPage:  5,
            fromSourceFilter:        null,
        };
        this.loadingTimer = null;
    }


    componentDidMount() {
        store.dispatch(setIsPasswordChanged());
        this.loadInitialData();
    }

    componentWillUnmount() {
        if (this.loadingTimer) clearTimeout(this.loadingTimer);
    }

    loadInitialData = async () => {
        try {
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


    setPostUrls        = (postUrls, word)  => this.setState({ postUrls, word });
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
                tooltip: 'Carousel: Threats Watcher · Ransomware · CVE — auto-advances every 3 minutes',
                children: <ThreatsWatcherStatistics />,
            },

            cloud: {
                label: 'Word Cloud',
                icon: 'cloud',
                tooltip: 'Visualize trending cybersecurity keywords - size reflects frequency',
                children: (
                    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12 }}>
                        <WordCloud setPostUrls={this.setPostUrls} filteredData={filteredLeads.length > 0 ? filteredLeads : null} fromSourceFilter={this.state.fromSourceFilter} />
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

            trend: {
                label: 'Trend & Sources',
                icon: 'trending_up',
                tooltip: 'Click a word to see its trend over time and original source articles',
                children: word ? (
                    <div style={{ padding: '12px 16px', height: '100%', overflowY: 'auto' }}>
                        <ResizableContainer
                            leftComponent={<WordSummary word={word} />}
                            rightComponent={<PostUrls postUrls={postUrls} word={word} />}
                            defaultLeftWidth={50}
                            minLeftWidth={30}
                            maxLeftWidth={70}
                            storageKey="watcher_localstorage_layout_postUrls_summary"
                        />
                        <div className="mt-3">
                            <TrendChart postUrls={postUrls} word={word} />
                        </div>
                    </div>
                ) : (
                    <div className="d-flex align-items-center justify-content-center h-100 text-muted">
                        <div className="text-center py-4">
                            <i className="material-icons d-block mb-2" style={{ fontSize: '2.5rem', opacity: 0.25 }}>
                                trending_up
                            </i>
                            <small>Click a word to see trend &amp; sources</small>
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
                    forceActivate={this.state.word ? ['trend'] : null}
                    layoutOverrides={this.computeLayoutOverrides()}
                />
            </Fragment>
        );
    }
}

const mapStateToProps = state => ({
    leads:      state.leads.leads      || [],
    leadsCount: state.leads.leadsCount || 0,
    leadsNext:  state.leads.leadsNext  || null,
});

export default connect(mapStateToProps, { getLeads })(Dashboard);
