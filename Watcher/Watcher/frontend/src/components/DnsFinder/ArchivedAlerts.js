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

        if (globalFilters.dangling) {
            filtered = filtered.filter(alert => 
                alert.dns_twisted?.dangling_status === globalFilters.dangling
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

    getDanglingStatusCell = (dns) => {
        if (!dns || !dns.dangling_status) {
            return <span className="text-muted">-</span>;
        }
        
        const statusConfig = {
            'safe': {
                badge: 'bg-success',
                icon: 'check_circle',
                text: 'Safe',
                title: 'No dangling DNS detected'
            },
            'exploitable': {
                badge: 'bg-warning',
                icon: 'warning',
                text: 'Exploitable',
                title: 'Could be exploitable - potential subdomain takeover'
            },
            'takeover_possible': {
                badge: 'bg-danger',
                icon: 'error',
                text: 'Takeover',
                title: 'Takeover Likely Possible!'
            },
            'unknown': {
                badge: 'bg-secondary',
                icon: 'help',
                text: 'Unknown',
                title: 'Not yet checked or unknown status'
            }
        };
        
        const config = statusConfig[dns.dangling_status] || statusConfig['unknown'];
        
        // Build detailed tooltip with structured information
        let tooltipParts = [];
        tooltipParts.push(`Dangling DNS Detection`);
        tooltipParts.push(`\nStatus: ${config.title}`);
        
        if (dns.dangling_cname) {
            tooltipParts.push(`\n\nCNAME Record:\n${dns.dangling_cname}`);
            
            // Extract service name from CNAME
            const cnameMatch = dns.dangling_cname.match(/([^\.]+\.(?:com|net|org|io|co|app|dev|cloud|azure|amazonaws))/);
            if (cnameMatch) {
                tooltipParts.push(`\nService Provider: ${cnameMatch[1]}`);
            }
        }
        
        if (dns.dangling_info) {
            tooltipParts.push(`\n\nTechnical Details:\n${dns.dangling_info}`);
        }
        
        if (dns.dangling_checked_at) {
            const checkDate = new Date(dns.dangling_checked_at);
            tooltipParts.push(`\n\nLast Verified:\n${checkDate.toLocaleString()}`);
        }
                
        const tooltipText = tooltipParts.join('');
        
        return (
            <span 
                className={`badge ${config.badge}`}
                title={tooltipText}
                style={{ cursor: 'help', fontSize: '0.85rem', padding: '0.4rem 0.65rem' }}
            >
                <i className="material-icons align-middle" style={{ fontSize: 16, marginRight: 5 }}>
                    {config.icon}
                </i>
                {config.text}
            </span>
        );
    };

    render() {
        const { globalFilters, filteredData } = this.props;
        const dataToUse = filteredData || this.props.alerts;

        const renderLoadingState = () => (
            <tr>
                <td colSpan="8" className="text-center py-5">
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
                                                    <th style={{ cursor: 'pointer' }} onClick={() => handleSort('dns_twisted.dangling_status')}>
                                                        Dangling Status{renderSortIcons('dns_twisted.dangling_status')}
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
                                                        <td colSpan="8" className="text-center text-muted py-4">
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
                                                            <td>{this.getDanglingStatusCell(alert?.dns_twisted)}</td>
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