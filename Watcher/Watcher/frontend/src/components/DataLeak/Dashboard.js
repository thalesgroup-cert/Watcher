import React, {Component, Fragment} from 'react';
import {connect} from 'react-redux';
import {getAlerts, getKeyWords} from "../../actions/DataLeak";
import SearchPatterns from "./SearchPatterns";
import Alerts from "./Alerts";
import ArchivedAlerts from "./ArchivedAlerts";
import DataLeakStats from "./DataLeakStats";
import TableManager from '../common/TableManager';
import PanelGrid from '../common/PanelGrid';

const DEFAULT_LAYOUT = [
    { i: 'stats',    x: 0, y: 0,  w: 12, h: 8,  minW: 2, minH: 3  },
    { i: 'alerts',   x: 0, y: 8,  w: 8,  h: 11, minW: 4, minH: 5  },
    { i: 'patterns', x: 8, y: 8,  w: 4,  h: 11, minW: 3, minH: 5  },
    { i: 'archived', x: 0, y: 19, w: 12, h: 9,  minW: 6, minH: 5  },
];

const DEFAULT_ACTIVE = ['stats', 'alerts', 'patterns', 'archived'];

const FILTER_CONFIG = [
    {
        key: 'search',
        type: 'search',
        label: 'Search',
        placeholder: 'Search keywords, content, ID...',
        width: 3
    },
    {
        key: 'keyword',
        type: 'select',
        label: 'Keyword',
        width: 2,
        options: []
    },
    {
        key: 'source',
        type: 'select',
        label: 'Source',
        width: 2,
        options: []
    }
];

class Dashboard extends Component {
    constructor(props) {
        super(props);
        this.state = {
            globalFilters: {
                search: '',
                keyword: '',
                source: '',
            },
            filteredAlerts: []
        };
        this.loadingTimer = null;
    }

    componentDidMount() {
        this.loadInitialData();
    }

    componentWillUnmount() {
        if (this.loadingTimer) {
            clearTimeout(this.loadingTimer);
        }
    }

    loadInitialData = async () => {
        try {
            await this.props.getAlerts(1, 100);
            await this.props.getKeyWords(1, 100);

            this.loadingTimer = setTimeout(() => {
                this.loadRemainingDataInBackground();
            }, 500);
        } catch (error) {
        }
    };

    loadRemainingDataInBackground = async () => {
        const { alertsNext, keywordsNext } = this.props;
        
        if (!alertsNext && !keywordsNext) {
            return;
        }

        try {
            // Load all remaining alerts pages
            if (alertsNext) {
                let currentPage = 2;
                let hasMore = true;

                while (hasMore) {
                    try {
                        const response = await this.props.getAlerts(currentPage, 100);
                        hasMore = response?.next !== null;
                        currentPage++;

                        if (hasMore) {
                            await new Promise(resolve => setTimeout(resolve, 300));
                        }
                    } catch (error) {
                        hasMore = false;
                    }
                }
            }

            // Load all remaining keywords pages
            if (keywordsNext) {
                let currentPage = 2;
                let hasMore = true;

                while (hasMore) {
                    try {
                        const response = await this.props.getKeyWords(currentPage, 100);
                        hasMore = response?.next !== null;
                        currentPage++;

                        if (hasMore) {
                            await new Promise(resolve => setTimeout(resolve, 200));
                        }
                    } catch (error) {
                        hasMore = false;
                    }
                }
            }
        } catch (error) {
            console.error('Error loading remaining data:', error);
        }
    };

    getFilterConfig = () => {
        const { alerts, keywords } = this.props;
        const uniqueKeywords = [...new Set((keywords || []).map(k => k.name).filter(Boolean))].sort();
        const uniqueSources = [...new Set((alerts || []).map(a => {
            if (!a.url) return null;
            try {
                return a.url.split('//', 2)[1].split('/', 20)[0];
            } catch {
                return null;
            }
        }).filter(Boolean))].sort();

        return FILTER_CONFIG.map(filter => {
            if (filter.key === 'keyword') {
                return {
                    ...filter,
                    options: uniqueKeywords.map(keyword => ({
                        value: keyword,
                        label: keyword
                    }))
                };
            }
            if (filter.key === 'source') {
                return {
                    ...filter,
                    options: uniqueSources.map(source => ({
                        value: source,
                        label: source
                    }))
                };
            }
            return filter;
        });
    };

    handleFilterChange = (filters) => {
        this.setState({
            globalFilters: {
                search: filters.search || '',
                keyword: filters.keyword || '',
                source: filters.source || ''
            }
        });
    };

    onDataFiltered = (filteredData) => {
        setTimeout(() => this.setState({ filteredAlerts: filteredData }), 0);
    };

    buildPanels() {
        const { globalFilters } = this.state;
        const { alerts } = this.props;
        const filteredAlerts = this.state.filteredAlerts;
        const dataToPass = filteredAlerts.length > 0 ? filteredAlerts : alerts;

        return {
            stats: {
                label: 'Statistics',
                icon: 'bar_chart',
                tooltip: 'Overview of total alerts, active threats, and keyword coverage',
                children: (
                    <div style={{ padding: '12px 16px', height: '100%', overflowY: 'auto' }}>
                        <DataLeakStats />
                    </div>
                ),
            },
            alerts: {
                label: 'Alerts',
                icon: 'notifications',
                tooltip: 'Active data leak alerts matching your monitored search patterns',
                children: (
                    <div style={{ padding: '12px 16px', height: '100%', overflowY: 'auto' }}>
                        <Alerts
                            globalFilters={globalFilters}
                            filteredData={dataToPass}
                        />
                    </div>
                ),
            },
            patterns: {
                label: 'Search Patterns',
                icon: 'search',
                tooltip: 'Keywords and patterns used to detect data leaks on the web',
                children: (
                    <div style={{ padding: '12px 16px', height: '100%', overflowY: 'auto' }}>
                        <SearchPatterns
                            globalFilters={globalFilters}
                            filteredData={dataToPass}
                        />
                    </div>
                ),
            },
            archived: {
                label: 'Archived Alerts',
                icon: 'archive',
                tooltip: 'Resolved or dismissed data leak alerts kept for audit purposes',
                children: (
                    <div style={{ padding: '12px 16px', height: '100%', overflowY: 'auto' }}>
                        <ArchivedAlerts
                            globalFilters={globalFilters}
                            filteredData={dataToPass}
                        />
                    </div>
                ),
            },
        };
    }

    render() {
        const { alerts } = this.props;
        const filterConfig = this.getFilterConfig();

        return (
            <Fragment>
                <div className="container-fluid mt-4">
                    <TableManager
                        data={alerts}
                        filterConfig={filterConfig}
                        onFiltersChange={this.handleFilterChange}
                        onDataFiltered={this.onDataFiltered}
                        enableDateFilter={true}
                        dateFields={['created_at']}
                        dateFilterWidth={3}
                        searchFields={['keyword.name', 'url', 'id']}
                        defaultSort="created_at"
                        moduleKey="dataLeak"
                    >
                        {({ renderFilterControls, renderFilters, renderSaveModal }) => (
                            <Fragment>
                                {renderFilterControls()}
                                {renderFilters()}
                                {renderSaveModal()}
                            </Fragment>
                        )}
                    </TableManager>
                </div>

                <PanelGrid
                    panels={this.buildPanels()}
                    defaultLayout={DEFAULT_LAYOUT}
                    defaultActive={DEFAULT_ACTIVE}
                    storageKey="watcher_dataleak_grid"
                />
            </Fragment>
        );
    }
}

const mapStateToProps = state => ({
    alerts: state.DataLeak.alerts || [],
    alertsCount: state.DataLeak.alertsCount || 0,
    alertsNext: state.DataLeak.alertsNext || null,
    keywords: state.DataLeak.keywords || [],
    keywordsCount: state.DataLeak.keywordsCount || 0,
    keywordsNext: state.DataLeak.keywordsNext || null
});

export default connect(mapStateToProps, { getAlerts, getKeyWords })(Dashboard);