import React, { Component, Fragment } from 'react';
import { connect } from 'react-redux';
import { getSites } from "../../actions/SiteMonitoring";
import SuspiciousSites from "./SuspiciousSites";
import SiteStats from "./SiteStats";
import TableManager from '../common/TableManager';

const FILTER_CONFIG = [
    {
        key: 'search',
        type: 'search',
        label: 'Search',
        placeholder: 'Search domains, tickets, registrars...',
        width: 2
    },
    {
        key: 'legitimacy',
        type: 'select',
        label: 'Legitimacy',
        width: 1,
        options: []
    },
    {
        key: 'monitoringStatus',
        type: 'select',
        label: 'Monitoring',
        width: 1,
        options: [
            { value: 'true', label: 'Active' },
            { value: 'false', label: 'Pending' }
        ]
    },
    {
        key: 'webStatus',
        type: 'select',
        label: 'Web Status',
        width: 1,
        options: [
            { value: '200', label: '200 OK' },
            { value: '301', label: '301 Moved' },
            { value: '302', label: '302 Found' },
            { value: '403', label: '403 Forbidden' },
            { value: '404', label: '404 Not Found' },
            { value: '500', label: '500 Server Error' },
            { value: '502', label: '502 Bad Gateway' },
            { value: '503', label: '503 Service Unavailable' },
            { value: 'offline', label: 'Offline' }
        ]
    },
    {
        key: 'takedown',
        type: 'select',
        label: 'Takedown',
        width: 1,
        options: [
            { value: 'yes', label: 'Yes' },
            { value: 'no', label: 'No' }
        ]
    },
    {
        key: 'legal',
        type: 'select',
        label: 'Legal',
        width: 1,
        options: [
            { value: 'yes', label: 'Yes' },
            { value: 'no', label: 'No' }
        ]
    },
    {
        key: 'blocking',
        type: 'select',
        label: 'Blocking',
        width: 1,
        options: [
            { value: 'yes', label: 'Yes' },
            { value: 'no', label: 'No' }
        ]
    }
];

const LEGITIMACY_LABELS = {
    1: "Unknown",
    2: "Suspicious, not harmful",
    3: "Suspicious, likely harmful (registered)",
    4: "Suspicious, likely harmful (available/disabled)",
    5: "Malicious (registered)",
    6: "Malicious (available/disabled)",
};

class Dashboard extends Component {
    constructor(props) {
        super(props);
        this.state = {
            globalFilters: {
                search: '',
                legitimacy: '',
                monitoringStatus: '',
                webStatus: '',
                takedown: '',
                legal: '',
                blocking: ''
            },
            filteredSites: []
        };
    }

    componentDidMount() {
        this.props.getSites();
    }

    getFilterConfig = () => {
        const { sites } = this.props;
        const uniqueLegitimacyLevels = [...new Set((sites || []).map(s => s.legitimacy).filter(l => l !== null && l !== undefined))].sort();

        return FILTER_CONFIG.map(filter => {
            if (filter.key === 'legitimacy') {
                return {
                    ...filter,
                    options: uniqueLegitimacyLevels.map(level => ({
                        value: level.toString(),
                        label: LEGITIMACY_LABELS[level] || `Level ${level}`
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
                legitimacy: filters.legitimacy || '',
                monitoringStatus: filters.monitoringStatus || '',
                webStatus: filters.webStatus || '',
                takedown: filters.takedown || '',
                legal: filters.legal || '',
                blocking: filters.blocking || ''
            }
        });
    };

    onDataFiltered = (filteredData) => {
        if (JSON.stringify(filteredData) !== JSON.stringify(this.state.filteredSites)) {
            this.setState({ filteredSites: filteredData });
        }
    };

    render() {
        const { globalFilters, filteredSites } = this.state;
        const { sites } = this.props;
        const filterConfig = this.getFilterConfig();
        
        const hasActiveFilters = Object.values(globalFilters).some(val => val !== '');
        const dataToDisplay = hasActiveFilters && filteredSites.length > 0 ? filteredSites : sites;

        return (
            <Fragment>
                <div className="container-fluid mt-4">
                    <SiteStats sites={dataToDisplay} />

                    <TableManager
                        data={sites}
                        filterConfig={filterConfig}
                        onFiltersChange={this.handleFilterChange}
                        onDataFiltered={this.onDataFiltered}
                        enableDateFilter={true}
                        dateFields={['created_at', 'domain_expiry']}
                        dateFilterWidth={2}
                        searchFields={['domain_name', 'ticket_id', 'registrar', 'rtir']}
                        defaultSort="created_at"
                        moduleKey="siteMonitoring"
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
                            <SuspiciousSites 
                                globalFilters={globalFilters} 
                                filteredData={hasActiveFilters && filteredSites.length > 0 ? filteredSites : null}
                                onDataFiltered={this.onDataFiltered}
                            />
                        </div>
                    </div>
                </div>
            </Fragment>
        );
    }
}

const mapStateToProps = state => ({
    sites: state.SiteMonitoring.sites || []
});

export default connect(mapStateToProps, { getSites })(Dashboard);