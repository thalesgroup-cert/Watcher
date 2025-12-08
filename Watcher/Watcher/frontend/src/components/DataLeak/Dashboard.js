import React, {Component, Fragment} from 'react';
import {connect} from 'react-redux';
import {getAlerts, getKeyWords} from "../../actions/DataLeak";
import KeyWord from "./KeyWords";
import Alerts from "./Alerts";
import ArchivedAlerts from "./ArchivedAlerts";
import TableManager from '../common/TableManager';
import ResizableContainer from '../common/ResizableContainer';

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
            if (alertsNext) {
                let currentPage = 2;
                let hasMore = true;

                while (hasMore) {
                    try {
                        const response = await this.props.getAlerts(currentPage, 100);
                        hasMore = response.next !== null;
                        currentPage++;

                        if (hasMore) {
                            await new Promise(resolve => setTimeout(resolve, 300));
                        }
                    } catch (error) {
                        hasMore = false;
                    }
                }
            }

            if (keywordsNext) {
                promises.push(
                    this.props.getKeyWords(2, 500).catch(() => {})
                );
            }

            if (promises.length > 0) {
                await Promise.all(promises);
            }
        } catch (error) {
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
                                    <KeyWord 
                                        globalFilters={globalFilters}
                                        filteredData={dataToPass}
                                    />
                                }
                                defaultLeftWidth={70}
                                minLeftWidth={20}
                                maxLeftWidth={85}
                                storageKey="watcher_localstorage_layout_dataLeak"
                            />
                        </div>
                    </div>

                    <div className="row mt-4">
                        <div className="col-12">
                            <ArchivedAlerts 
                                globalFilters={globalFilters}
                                filteredData={dataToPass}
                            />
                        </div>
                    </div>
                </div>
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