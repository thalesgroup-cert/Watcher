import React, {Component, Fragment} from 'react';
import {connect } from 'react-redux';
import PropTypes from 'prop-types';
import { getAlerts, updateAlertStatus } from "../../actions/DnsFinder";
import { Button, Modal } from 'react-bootstrap';
import TableManager from '../common/TableManager';

export class ArchivedAlerts extends Component {
    constructor(props) {
        super(props);
        this.state = {
            show: false,
            id: 0,
            isLoading: true,
        };
    }

    static propTypes = {
        alerts: PropTypes.array.isRequired,
        getAlerts: PropTypes.func.isRequired,
        updateAlertStatus: PropTypes.func.isRequired,
        auth: PropTypes.object.isRequired,
        globalFilters: PropTypes.object,
        filteredData: PropTypes.array
    };

    componentDidMount() {
        this.props.getAlerts();
    }

    componentDidUpdate(prevProps) {
        if (this.props.alerts !== prevProps.alerts && this.state.isLoading) {
            this.setState({ isLoading: false });
        }
    }

    customFilters = (filtered, filters) => {
        const alertsToFilter = this.props.filteredData || this.props.alerts;
        const { globalFilters = {} } = this.props;
        
        filtered = (alertsToFilter || []).filter(alert => alert.status === false);

        if (globalFilters.search) {
            const searchTerm = globalFilters.search.toLowerCase();
            filtered = filtered.filter(alert =>
                (alert.dns_twisted?.domain_name || '').toLowerCase().includes(searchTerm) ||
                (alert.dns_twisted?.keyword_monitored?.name || '').toLowerCase().includes(searchTerm) ||
                (alert.dns_twisted?.dns_monitored?.domain_name || '').toLowerCase().includes(searchTerm) ||
                (alert.dns_twisted?.fuzzer || '').toLowerCase().includes(searchTerm) ||
                (alert.id || '').toString().includes(searchTerm)
            );
        }

        if (globalFilters.domain) {
            filtered = filtered.filter(alert => 
                alert.dns_twisted?.dns_monitored?.domain_name === globalFilters.domain
            );
        }

        if (globalFilters.keyword) {
            filtered = filtered.filter(alert => 
                alert.dns_twisted?.keyword_monitored?.name === globalFilters.keyword
            );
        }

        if (globalFilters.fuzzer) {
            filtered = filtered.filter(alert => 
                alert.dns_twisted?.fuzzer === globalFilters.fuzzer
            );
        }

        return filtered;
    };

    displayModal = (id) => {
        this.setState({
            show: true,
            id: id,
        });
    };

    modal = () => {
        const handleClose = () => this.setState({ show: false });

        const onSubmit = e => {
            e.preventDefault();
            const status = true;
            const json_status = { status };
            this.props.updateAlertStatus(this.state.id, json_status);
            this.setState({ id: 0 });
            handleClose();
        };

        return (
            <Modal show={this.state.show} onHide={handleClose} centered>
                <Modal.Header closeButton>
                    <Modal.Title>Action Requested</Modal.Title>
                </Modal.Header>
                <Modal.Body>Are you sure you want to <b><u>enable</u></b> this alert?</Modal.Body>
                <Modal.Footer>
                    <form onSubmit={onSubmit}>
                        <Button variant="secondary" className="me-2" onClick={handleClose}>
                            Close
                        </Button>
                        <Button type="submit" variant="warning">
                            Yes, I'm sure
                        </Button>
                    </form>
                </Modal.Footer>
            </Modal>
        );
    };

    render() {
        const { globalFilters, filteredData } = this.props;
        const dataToUse = filteredData || this.props.alerts;

        const renderLoadingState = () => (
            <tr>
                <td colSpan="7" className="text-center py-5">
                    <div className="d-flex flex-column align-items-center">
                        <div className="spinner-border text-primary mb-3" role="status">
                            <span className="visually-hidden">Loading...</span>
                        </div>
                        <p className="text-muted mb-0">Loading data...</p>
                    </div>
                </td>
            </tr>
        );

        return (
            <Fragment>
                <div className="row">
                    <div className="col-lg-12">
                        <div className="d-flex justify-content-between align-items-center" style={{ marginBottom: 12 }}>
                            <h4>Archived Alerts</h4>
                        </div>
                    </div>
                </div>

                <TableManager
                    data={dataToUse}
                    filterConfig={[]}
                    customFilters={this.customFilters}
                    searchFields={['dns_twisted.domain_name', 'dns_twisted.keyword_monitored.name', 'dns_twisted.dns_monitored.domain_name', 'dns_twisted.fuzzer', 'id']}
                    dateFields={['created_at']}
                    defaultSort="created_at"
                    globalFilters={globalFilters}
                    moduleKey="dnsFinder_archived"
                >
                    {({
                        paginatedData,
                        renderItemsInfo,
                        renderPagination,
                        handleSort,
                        renderSortIcons,
                        getTableContainerStyle
                    }) => (
                        <Fragment>
                            {renderItemsInfo()}

                            <div className="row">
                                <div className="col-lg-12">
                                    <div style={{ ...getTableContainerStyle(),  overflowX: 'auto' }}>
                                        <table className="table table-striped table-hover">
                                            <thead>
                                                <tr>
                                                    <th style={{ cursor: 'pointer' }} onClick={() => handleSort('id')}>
                                                        ID{renderSortIcons('id')}
                                                    </th>
                                                    <th style={{ cursor: 'pointer' }} onClick={() => handleSort('dns_twisted.domain_name')}>
                                                        Twisted DNS{renderSortIcons('dns_twisted.domain_name')}
                                                    </th>
                                                    <th style={{ cursor: 'pointer' }} onClick={() => handleSort('dns_twisted.keyword_monitored.name')}>
                                                        Corporate Keyword{renderSortIcons('dns_twisted.keyword_monitored.name')}
                                                    </th>
                                                    <th style={{ cursor: 'pointer' }} onClick={() => handleSort('dns_twisted.dns_monitored.domain_name')}>
                                                        Corporate DNS{renderSortIcons('dns_twisted.dns_monitored.domain_name')}
                                                    </th>
                                                    <th style={{ cursor: 'pointer' }} onClick={() => handleSort('dns_twisted.fuzzer')}>
                                                        Fuzzer{renderSortIcons('dns_twisted.fuzzer')}
                                                    </th>
                                                    <th style={{ cursor: 'pointer' }} onClick={() => handleSort('created_at')}>
                                                        Created At{renderSortIcons('created_at')}
                                                    </th>
                                                    <th />
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {this.state.isLoading ? (
                                                    renderLoadingState()
                                                ) : paginatedData.length === 0 ? (
                                                    <tr>
                                                        <td colSpan="7" className="text-center text-muted py-4">
                                                            No results found
                                                        </td>
                                                    </tr>
                                                ) : (
                                                    paginatedData.map(alert => (
                                                        <tr key={alert.id}>
                                                            <td><h5>#{alert.id}</h5></td>
                                                            <td>{alert?.dns_twisted?.domain_name || "-"}</td>
                                                            <td>{alert.dns_twisted.keyword_monitored ? alert.dns_twisted.keyword_monitored.name : "-"}</td>
                                                            <td>{alert.dns_twisted.dns_monitored ? alert.dns_twisted.dns_monitored.domain_name : "-"}</td>
                                                            <td>{alert.dns_twisted.fuzzer ? alert.dns_twisted.fuzzer : "-"}</td>
                                                            <td>{(new Date(alert.created_at)).toLocaleString()}</td>
                                                            <td>
                                                                <button
                                                                    onClick={() => this.displayModal(alert.id)}
                                                                    className="btn btn-outline-primary btn-sm"
                                                                >
                                                                    Enable
                                                                </button>
                                                            </td>
                                                        </tr>
                                                    ))
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>

                            {renderPagination()}
                        </Fragment>
                    )}
                </TableManager>

                {this.modal()}
            </Fragment>
        );
    }
}

const mapStateToProps = state => ({
    alerts: state.DnsFinder.alerts,
    auth: state.auth
});

export default connect(mapStateToProps, { getAlerts, updateAlertStatus })(ArchivedAlerts);