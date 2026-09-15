import React, {Component, Fragment} from 'react';
import { connect } from 'react-redux';
import { getThreatsMonitored, getDnsMonitored, getKeywordMonitored } from "../../actions/DnsFinder";
import ThreatsMonitored from "./ThreatsMonitored";
import DnsMonitored from "./DnsMonitored";
import KeywordMonitored from "./KeywordMonitored";
import TableManager from '../common/TableManager';
import DnsFinderStats from "./DnsFinderStats";
import PanelGrid from '../common/PanelGrid';
import { LAYOUT_PRESETS } from '../../config/layoutPresets';

const DEFAULT_LAYOUT = [
    { i: 'stats',    x: 0, y: 0,  w: 12, h: 8,  minW: 6, minH: 3 },
    { i: 'threats',  x: 0, y: 8,  w: 12, h: 14, minW: 6, minH: 6 },
    { i: 'dns',      x: 0, y: 22, w: 6,  h: 11, minW: 3, minH: 5 },
    { i: 'keywords', x: 6, y: 22, w: 6,  h: 11, minW: 3, minH: 5 },
];

const DEFAULT_ACTIVE = ['stats', 'threats', 'dns', 'keywords'];

const SOURCE_OPTIONS = [
    { value: 'dnstwist', label: 'Dnstwist Algorithm' },
    { value: 'certstream_keyword', label: 'Certificate Transparency Stream' },
    { value: 'subdomain_takeover', label: 'Subdomain Takeover Detection' },
];

const DANGLING_STATUS_OPTIONS = [
    { value: 'pending', label: 'Pending' },
    { value: 'ok', label: 'OK' },
    { value: 'dangling_suspected', label: 'Suspected' },
    { value: 'dangling_confirmed', label: 'Confirmed' },
    { value: 'resolved', label: 'Resolved' },
    { value: 'false_positive', label: 'False Positive' },
];

class Dashboard extends Component {
    constructor(props) {
        super(props);
        this.state = {
            globalFilters: {
                search: '',
                source: '',
                corporate_dns: '',
                fuzzer: '',
                corporate_keyword: '',
                provider: '',
                cname_target: '',
                dangling_status: ''
            },
            filteredThreats: [],
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
            await this.props.getThreatsMonitored(1, 100);

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
        const { threatsMonitoredNext, dnsMonitoredNext, keywordMonitoredNext } = this.props;

        if (!threatsMonitoredNext && !dnsMonitoredNext && !keywordMonitoredNext) {
            return;
        }

        this.setState({ isLoadingInBackground: true });

        try {
            if (threatsMonitoredNext) {
                let currentPage = 2;
                let hasMore = true;
                while (hasMore) {
                    try {
                        const response = await this.props.getThreatsMonitored(currentPage, 100);
                        hasMore = response?.next !== null;
                        currentPage++;
                        if (hasMore) await new Promise(resolve => setTimeout(resolve, 300));
                    } catch (error) {
                        hasMore = false;
                    }
                }
            }

            if (dnsMonitoredNext) {
                let currentPage = 2;
                let hasMore = true;
                while (hasMore) {
                    try {
                        const response = await this.props.getDnsMonitored(currentPage, 100);
                        hasMore = response?.next !== null;
                        currentPage++;
                        if (hasMore) await new Promise(resolve => setTimeout(resolve, 200));
                    } catch (error) {
                        hasMore = false;
                    }
                }
            }

            if (keywordMonitoredNext) {
                let currentPage = 2;
                let hasMore = true;
                while (hasMore) {
                    try {
                        const response = await this.props.getKeywordMonitored(currentPage, 100);
                        hasMore = response?.next !== null;
                        currentPage++;
                        if (hasMore) await new Promise(resolve => setTimeout(resolve, 200));
                    } catch (error) {
                        hasMore = false;
                    }
                }
            }

            this.setState({ allDataLoaded: true, isLoadingInBackground: false });
        } catch (error) {
            this.setState({ isLoadingInBackground: false });
        }
    };

    getFilterConfig = () => {
        const { dnsMonitored, threatsMonitored } = this.props;
        const { globalFilters } = this.state;
        const uniqueDomains = [...new Set((dnsMonitored || []).map(d => d.domain_name).filter(Boolean))].sort();

        const base = [
            {
                key: 'search',
                type: 'search',
                label: 'Search',
                placeholder: 'Search domains, keywords, providers...',
                width: 3
            },
            {
                key: 'source',
                type: 'select',
                label: 'Source',
                width: 2,
                options: SOURCE_OPTIONS
            },
            {
                key: 'corporate_dns',
                type: 'select',
                label: 'Corporate DNS',
                width: 2,
                options: uniqueDomains.map(domain => ({ value: domain, label: domain }))
            }
        ];

        // Per-source dynamic filters (spec 3.4): only show the filter relevant
        // to the currently-selected source, since TableManager renders every
        // entry in filterConfig unconditionally.
        if (globalFilters.source === 'dnstwist') {
            const uniqueFuzzers = [...new Set(
                (threatsMonitored || [])
                    .filter(t => t.source === 'dnstwist')
                    .map(t => t.technical_details?.fuzzer)
                    .filter(Boolean)
            )].sort();
            base.push({ key: 'fuzzer', type: 'select', label: 'Fuzzer', width: 2, options: uniqueFuzzers.map(f => ({ value: f, label: f })) });
        }

        if (globalFilters.source === 'certstream_keyword') {
            const uniqueKeywords = [...new Set(
                (threatsMonitored || [])
                    .filter(t => t.source === 'certstream_keyword')
                    .map(t => t.corporate_keyword)
                    .filter(Boolean)
            )].sort();
            base.push({ key: 'corporate_keyword', type: 'select', label: 'Corporate Keyword', width: 2, options: uniqueKeywords.map(k => ({ value: k, label: k })) });
        }

        if (globalFilters.source === 'subdomain_takeover') {
            const uniqueProviders = [...new Set(
                (threatsMonitored || [])
                    .filter(t => t.source === 'subdomain_takeover')
                    .map(t => t.technical_details?.provider)
                    .filter(Boolean)
            )].sort();
            base.push({ key: 'provider', type: 'select', label: 'Provider', width: 2, options: uniqueProviders.map(p => ({ value: p, label: p })) });
            base.push({ key: 'dangling_status', type: 'select', label: 'Status', width: 2, options: DANGLING_STATUS_OPTIONS });
        }

        return base;
    };

    handleFilterChange = (filters) => {
        this.setState({
            globalFilters: {
                search: filters.search || '',
                source: filters.source || '',
                corporate_dns: filters.corporate_dns || '',
                fuzzer: filters.fuzzer || '',
                corporate_keyword: filters.corporate_keyword || '',
                provider: filters.provider || '',
                cname_target: filters.cname_target || '',
                dangling_status: filters.dangling_status || ''
            }
        });
    };

    onDataFiltered = (filteredData) => {
        this.setState({ filteredThreats: filteredData });
    };

    buildPanels() {
        const { globalFilters, filteredThreats } = this.state;
        const { threatsMonitored } = this.props;
        const filterConfig = this.getFilterConfig();
        const dataToPass = filteredThreats.length > 0 ? filteredThreats : threatsMonitored;

        return {
            stats: {
                label: 'Statistics',
                icon: 'bar_chart',
                tooltip: 'Overview of DNS threats across all three detection sources',
                children: (
                    <div style={{ padding: '12px 16px', height: '100%', overflowY: 'auto' }}>
                        <DnsFinderStats />
                    </div>
                ),
            },
            threats: {
                label: 'DNS Threats Monitored',
                icon: 'gpp_maybe',
                tooltip: 'Dnstwist, Certificate Transparency Stream and Subdomain Takeover detections, unified',
                children: (
                    <div style={{ padding: '12px 16px', height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                        <TableManager
                            data={threatsMonitored}
                            filterConfig={filterConfig}
                            onFiltersChange={this.handleFilterChange}
                            onDataFiltered={this.onDataFiltered}
                            enableDateFilter={true}
                            dateFields={['created_at']}
                            dateFilterWidth={2}
                            searchFields={['domain_name', 'corporate_dns', 'corporate_keyword']}
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
                        <ThreatsMonitored globalFilters={globalFilters} filteredData={dataToPass} />
                    </div>
                ),
            },
            dns: {
                label: 'Corporate DNS Assets Monitored',
                icon: 'dns',
                tooltip: 'Corporate domains watched for typosquatting, phishing variants, and subdomain takeover',
                children: (
                    <div style={{ padding: '12px 16px', height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                        <DnsMonitored globalFilters={globalFilters} />
                    </div>
                ),
            },
            keywords: {
                label: 'Corporate Keywords Monitored',
                icon: 'search',
                tooltip: 'Keywords used to detect suspicious domain registrations in CertStream',
                children: (
                    <div style={{ padding: '12px 16px', height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
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
                    layoutPresets={LAYOUT_PRESETS['watcher_dns_finder_grid']}
                />
            </Fragment>
        );
    }
}

const mapStateToProps = state => ({
    threatsMonitored: state.DnsFinder.threatsMonitored || [],
    threatsMonitoredCount: state.DnsFinder.threatsMonitoredCount || 0,
    threatsMonitoredNext: state.DnsFinder.threatsMonitoredNext || null,
    dnsMonitored: state.DnsFinder.dnsMonitored || [],
    dnsMonitoredNext: state.DnsFinder.dnsMonitoredNext || null,
    keywordMonitored: state.DnsFinder.keywordMonitored || [],
    keywordMonitoredNext: state.DnsFinder.keywordMonitoredNext || null
});

export default connect(mapStateToProps, {getThreatsMonitored, getDnsMonitored, getKeywordMonitored})(Dashboard);
