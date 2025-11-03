import React, {Component, Fragment} from 'react';
import { connect } from 'react-redux';
import { getAlerts, getDnsMonitored, getKeywordMonitored } from "../../actions/DnsFinder";
import DnsMonitored from "./DnsMonitored";
import KeywordMonitored from "./KeywordMonitored";
import Alerts from "./Alerts";
import ArchivedAlerts from "./ArchivedAlerts";
import TableManager from '../common/TableManager';
import ResizableContainer from '../common/ResizableContainer';

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
            filteredAlerts: []
        };
    }

    componentDidMount() {
        this.props.getAlerts();
        this.props.getDnsMonitored();
        this.props.getKeywordMonitored();
    }

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

    render() {
        const { globalFilters, filteredAlerts } = this.state;
        const { alerts } = this.props;
        const filterConfig = this.getFilterConfig();

        const dataToPass = filteredAlerts.length > 0 ? filteredAlerts : alerts;

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

                    <div className="row">
                        <div className="col-12">
                            <ResizableContainer
                                leftComponent={
                                    <Alerts 
                                        globalFilters={globalFilters} 
                                        filteredData={dataToPass}
                                    />
                                }
                                rightComponent={
                                    <DnsMonitored 
                                        globalFilters={globalFilters}
                                        filteredData={dataToPass}
                                    />
                                }
                                defaultLeftWidth={65}
                                storageKey="watcher_localstorage_layout_dnsFinder"
                            />
                        </div>
                    </div>

                    <div className="row mt-4">
                        <div className="col-12">
                            <ResizableContainer
                                leftComponent={
                                    <ArchivedAlerts 
                                        globalFilters={globalFilters}
                                        filteredData={dataToPass}
                                    />
                                }
                                rightComponent={
                                    <KeywordMonitored 
                                        globalFilters={globalFilters}
                                        filteredData={dataToPass}
                                    />
                                }
                                defaultLeftWidth={65}
                                storageKey="watcher_localstorage_layout_dnsFinder_secondary"
                            />
                        </div>
                    </div>
                </div>
            </Fragment>
        );
    }
}

const mapStateToProps = state => ({
    alerts: state.DnsFinder.alerts || [],
    dnsMonitored: state.DnsFinder.dnsMonitored || [],
    keywordMonitored: state.DnsFinder.keywordMonitored || []
});

export default connect(mapStateToProps, {getAlerts, getDnsMonitored, getKeywordMonitored})(Dashboard);