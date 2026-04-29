import React, {Component, Fragment} from 'react';
import { connect } from 'react-redux';
import { getAlerts, getDnsMonitored, getKeywordMonitored } from "../../actions/DnsFinder";
import Alerts from "./Alerts";
import ArchivedAlerts from "./ArchivedAlerts";
import DnsMonitored from "./DnsMonitored";
import KeywordMonitored from "./KeywordMonitored";
import TableManager from '../common/TableManager';
import DnsFinderStats from "./DnsFinderStats";
import PanelGrid from '../common/PanelGrid';

const DEFAULT_LAYOUT = [
    { i: 'stats',    x: 0, y: 0,  w: 12, h: 8,  minW: 2, minH: 3 },
    { i: 'alerts',   x: 0, y: 8,  w: 7,  h: 11, minW: 4, minH: 5 },
    { i: 'dns',      x: 7, y: 8,  w: 5,  h: 11, minW: 3, minH: 5 },
    { i: 'archived', x: 0, y: 19, w: 7,  h: 11, minW: 4, minH: 5 },
    { i: 'keywords', x: 7, y: 19, w: 5,  h: 11, minW: 3, minH: 5 },
];

const DEFAULT_ACTIVE = ['stats', 'alerts', 'dns', 'archived', 'keywords'];

const FILTER_CONFIG = [
    {
        key: 'search',
        type: 'search',
        label: 'Search',
        placeholder: 'Search domains, keywords, fuzzer, ID...',
        width: 3
    },
    {
        key: 'domain',
        type: 'select',
        label: 'DNS Monitored',
        width: 2,
        options: []
    },
    {
        key: 'keyword',
        type: 'select',
        label: 'Keyword Monitored',
        width: 2,
        options: []
    },
    {
        key: 'fuzzer',
        type: 'select',
        label: 'Fuzzer',
        width: 1,
        options: []
    }
];

class Dashboard extends Component {
    constructor(props) {
        super(props);
        this.state = {
            globalFilters: {
                search: '',
                domain: '',
                keyword: '',
                fuzzer: ''
            },
            filteredAlerts: [],
            isLoadingInBackground: false,
            allDataLoaded: false
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
            
            await Promise.all([
                this.props.getDnsMonitored(1, 100),
                this.props.getKeywordMonitored(1, 100)
            ]);

            this.loadingTimer = setTimeout(() => {
                this.loadRemainingDataInBackground();
            }, 500);
        } catch (error) {
        }
    };

    loadRemainingDataInBackground = async () => {
        const { alertsNext, dnsMonitoredNext, keywordMonitoredNext } = this.props;
        
        if (!alertsNext && !dnsMonitoredNext && !keywordMonitoredNext) {
            return;
        }

        this.setState({ isLoadingInBackground: true });

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

            // Load remaining DNS Monitored pages
            if (dnsMonitoredNext) {
                let currentPage = 2;
                let hasMore = true;

                while (hasMore) {
                    try {
                        const response = await this.props.getDnsMonitored(currentPage, 100);
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
            
            // Load remaining Keywords Monitored pages
            if (keywordMonitoredNext) {
                let currentPage = 2;
                let hasMore = true;

                while (hasMore) {
                    try {
                        const response = await this.props.getKeywordMonitored(currentPage, 100);
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

            this.setState({ 
                allDataLoaded: true,
                isLoadingInBackground: false
            });

        } catch (error) {
            this.setState({ 
                isLoadingInBackground: false 
            });
        }
    };


    getFilterConfig = () => {
        const { alerts, dnsMonitored, keywordMonitored } = this.props;
        const uniqueDomains = [...new Set((dnsMonitored || []).map(d => d.domain_name).filter(Boolean))].sort();
        const uniqueKeywords = [...new Set((keywordMonitored || []).map(k => k.name).filter(Boolean))].sort();
        const uniqueFuzzers = [...new Set((alerts || []).map(a => a.dns_twisted?.fuzzer).filter(Boolean))].sort();

        return FILTER_CONFIG.map(filter => {
            if (filter.key === 'domain') {
                return {
                    ...filter,
                    options: uniqueDomains.map(domain => ({
                        value: domain,
                        label: domain
                    }))
                };
            }
            if (filter.key === 'keyword') {
                return {
                    ...filter,
                    options: uniqueKeywords.map(keyword => ({
                        value: keyword,
                        label: keyword
                    }))
                };
            }
            if (filter.key === 'fuzzer') {
                return {
                    ...filter,
                    options: uniqueFuzzers.map(fuzzer => ({
                        value: fuzzer,
                        label: fuzzer
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
                domain: filters.domain || '',
                keyword: filters.keyword || '',
                fuzzer: filters.fuzzer || ''
            }
        });
    };

    onDataFiltered = (filteredData) => {
        this.setState({ filteredAlerts: filteredData });
    };

    buildPanels() {
        const { globalFilters, filteredAlerts } = this.state;
        const { alerts } = this.props;
        const filterConfig = this.getFilterConfig();
        const dataToPass = filteredAlerts.length > 0 ? filteredAlerts : alerts;

        return {
            stats: {
                label: 'Statistics',
                icon: 'bar_chart',
                tooltip: 'Overview of DNS alerts, monitored domains, and keyword patterns',
                children: (
                    <div style={{ padding: '12px 16px', height: '100%', overflowY: 'auto' }}>
                        <DnsFinderStats />
                    </div>
                ),
            },
            alerts: {
                label: 'DNS Alerts',
                icon: 'notifications',
                tooltip: 'Suspicious domain registrations detected via certificate transparency logs',
                children: (
                    <div style={{ padding: '12px 16px', height: '100%', overflowY: 'auto' }}>
                        <TableManager
                            data={alerts}
                            filterConfig={filterConfig}
                            onFiltersChange={this.handleFilterChange}
                            onDataFiltered={this.onDataFiltered}
                            enableDateFilter={true}
                            dateFields={['created_at']}
                            dateFilterWidth={2}
                            searchFields={['dns_twisted.domain_name', 'dns_twisted.keyword_monitored.name', 'dns_twisted.dns_monitored.domain_name', 'dns_twisted.fuzzer', 'id']}
                            defaultSort="created_at"
                            moduleKey="dnsFinder"
                        >
                            {({ renderFilterControls, renderFilters, renderSaveModal }) => (
                                <Fragment>
                                    {renderFilterControls()}
                                    {renderFilters()}
                                    {renderSaveModal()}
                                </Fragment>
                            )}
                        </TableManager>
                        <Alerts globalFilters={globalFilters} filteredData={dataToPass} />
                    </div>
                ),
            },
            dns: {
                label: 'DNS Monitored',
                icon: 'dns',
                tooltip: 'List of domains being watched for typosquatting and phishing variants',
                children: (
                    <div style={{ padding: '12px 16px', height: '100%', overflowY: 'auto' }}>
                        <DnsMonitored globalFilters={globalFilters} filteredData={dataToPass} />
                    </div>
                ),
            },
            archived: {
                label: 'Archived Alerts',
                icon: 'archive',
                tooltip: 'Resolved or dismissed DNS alerts kept for audit and reference',
                children: (
                    <div style={{ padding: '12px 16px', height: '100%', overflowY: 'auto' }}>
                        <ArchivedAlerts globalFilters={globalFilters} filteredData={dataToPass} />
                    </div>
                ),
            },
            keywords: {
                label: 'Keyword Monitored',
                icon: 'search',
                tooltip: 'Keywords used to detect suspicious domain registrations in CertStream',
                children: (
                    <div style={{ padding: '12px 16px', height: '100%', overflowY: 'auto' }}>
                        <KeywordMonitored globalFilters={globalFilters} />
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
                    storageKey="watcher_dns_finder_grid"
                />
            </Fragment>
        );
    }
}

const mapStateToProps = state => ({
    alerts: state.DnsFinder.alerts || [],
    alertsCount: state.DnsFinder.alertsCount || 0,
    alertsNext: state.DnsFinder.alertsNext || null,
    dnsMonitored: state.DnsFinder.dnsMonitored || [],
    dnsMonitoredNext: state.DnsFinder.dnsMonitoredNext || null,
    keywordMonitored: state.DnsFinder.keywordMonitored || [],
    keywordMonitoredNext: state.DnsFinder.keywordMonitoredNext || null
});

export default connect(mapStateToProps, {getAlerts, getDnsMonitored, getKeywordMonitored})(Dashboard);