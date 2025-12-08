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
        width: 2,
        options: []
    },
    {
        key: 'expiry_status',
        type: 'select',
        label: 'Expiry Status',
        width: 1,
        options: [
            { value: 'expired', label: 'Expired' },
            { value: 'expiring_soon', label: 'Expiring Soon' },
            { value: 'valid', label: 'Valid' },
            { value: 'no_date', label: 'No Date' }
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
                expiry_status: '',
                takedown: '',
                legal: '',
                blocking: ''
            },
            filteredSites: []
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
            await this.props.getSites(1, 100);

            this.loadingTimer = setTimeout(() => {
                this.loadRemainingSitesInBackground();
            }, 500);
        } catch (error) {
        }
    };

    loadRemainingSitesInBackground = async () => {
        const { sitesNext } = this.props;
        
        if (!sitesNext) {
            return;
        }

        try {
            let currentPage = 2;
            let hasMore = true;

            while (hasMore) {
                try {
                    const response = await this.props.getSites(currentPage, 100);
                    hasMore = response.next !== null;
                    currentPage++;

                    if (hasMore) {
                        await new Promise(resolve => setTimeout(resolve, 300));
                    }
                } catch (error) {
                    hasMore = false;
                }
            }
        } catch (error) {
        }
    };

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
                expiry_status: filters.expiry_status || '',
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
    sites: state.SiteMonitoring.sites || [],
    sitesCount: state.SiteMonitoring.sitesCount || 0,
    sitesNext: state.SiteMonitoring.sitesNext || null
});

export default connect(mapStateToProps, { getSites })(Dashboard);