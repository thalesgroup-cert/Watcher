import React, { Component, Fragment } from 'react';
import { connect } from 'react-redux';
import PropTypes from 'prop-types';
import { getDanglingSubdomains, patchDanglingSubdomain } from "../../actions/DnsFinder";
import { Button, Modal } from 'react-bootstrap';
import TableManager from '../common/TableManager';
import DateWithTooltip from '../common/DateWithTooltip';
import { TimelineModal, LastEventCell, LastEventHeader } from '../Timeline/TimelineModal';

const STATUS_BADGES = {
    pending: { label: 'Pending', className: 'bg-secondary' },
    ok: { label: 'OK', className: 'bg-success' },
    dangling_suspected: { label: 'Suspected', className: 'bg-warning text-dark' },
    dangling_confirmed: { label: 'Confirmed', className: 'bg-danger' },
    resolved: { label: 'Resolved', className: 'bg-info text-dark' },
    false_positive: { label: 'False Positive', className: 'bg-dark' },
};

export class DanglingSubdomains extends Component {
    constructor(props) {
        super(props);
        this.state = {
            showConfirmModal: false,
            confirmAction: null,
            confirmLabel: '',
            id: 0,
            subdomain: '',
            showTimelineModal: false,
            timelineId: null,
            timelineLabel: '',
            isLoading: true,
        };
    }

    static propTypes = {
        danglingSubdomains: PropTypes.array.isRequired,
        getDanglingSubdomains: PropTypes.func.isRequired,
        patchDanglingSubdomain: PropTypes.func.isRequired,
        auth: PropTypes.object.isRequired,
        globalFilters: PropTypes.object,
        filteredData: PropTypes.array
    };

    componentDidMount() {
        this.props.getDanglingSubdomains();
    }

    componentDidUpdate(prevProps) {
        if (this.props.danglingSubdomains !== prevProps.danglingSubdomains && this.state.isLoading) {
            this.setState({ isLoading: false });
        }
    }

    customFilters = (filtered, filters) => {
        const { globalFilters = {} } = this.props;

        if (globalFilters.search) {
            const searchTerm = globalFilters.search.toLowerCase();
            filtered = filtered.filter(sub =>
                (sub.subdomain || '').toLowerCase().includes(searchTerm) ||
                (sub.provider || '').toLowerCase().includes(searchTerm)
            );
        }

        return filtered;
    };

    displayConfirmModal = (id, subdomain, action, label) => {
        this.setState({
            showConfirmModal: true,
            confirmAction: action,
            confirmLabel: label,
            id,
            subdomain
        });
    };

    confirmModal = () => {
        const handleClose = () => this.setState({ showConfirmModal: false });

        const onSubmit = e => {
            e.preventDefault();
            this.props.patchDanglingSubdomain(this.state.id, { status: this.state.confirmAction });
            handleClose();
        };

        return (
            <Modal show={this.state.showConfirmModal} onHide={handleClose} centered>
                <Modal.Header closeButton>
                    <Modal.Title>Action Requested</Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    Are you sure you want to mark <b>{this.state.subdomain}</b> as <b>{this.state.confirmLabel}</b>?
                </Modal.Body>
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

    renderStatusBadge = (status) => {
        const badge = STATUS_BADGES[status] || { label: status, className: 'bg-secondary' };
        return <span className={`badge ${badge.className}`}>{badge.label}</span>;
    };

    render() {
        const { danglingSubdomains, auth, globalFilters } = this.props;
        const { isAuthenticated, user } = auth;
        const canManage = isAuthenticated && !!user && (user.is_superuser || user.is_staff || (Array.isArray(user.permissions) && user.permissions.some(p => p === 'dns_finder.change_danglingsubdomain')));
        const { showTimelineModal, timelineId, timelineLabel } = this.state;

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
                        <div style={{ marginBottom: 12 }}>
                            <h4>Dangling Subdomains</h4>
                            <h6 className="text-muted">Subdomain Takeover Detection</h6>
                        </div>
                    </div>
                </div>

                <TableManager
                    data={danglingSubdomains}
                    filterConfig={[]}
                    customFilters={this.customFilters}
                    searchFields={['subdomain', 'provider']}
                    dateFields={['discovered_at']}
                    defaultSort="discovered_at"
                    globalFilters={globalFilters}
                    moduleKey="dnsFinder_dangling"
                >
                    {({
                        paginatedData,
                        renderItemsInfo,
                        renderPagination,
                        handleSort,
                        renderSortIcons,
                        getTableContainerStyle,
                        theadRef
                    }) => (
                        <Fragment>
                            {renderItemsInfo()}

                            <div className="row">
                                <div className="col-lg-12">
                                    <div style={{ ...getTableContainerStyle(), overflowX: 'auto' }}>
                                        <table className="table table-striped table-hover">
                                            <thead ref={theadRef}>
                                                <tr>
                                                    <th style={{ cursor: 'pointer' }} onClick={() => handleSort('subdomain')}>
                                                        Subdomain{renderSortIcons('subdomain')}
                                                    </th>
                                                    <th style={{ cursor: 'pointer' }} onClick={() => handleSort('dns_monitored.domain_name')}>
                                                        Corporate DNS{renderSortIcons('dns_monitored.domain_name')}
                                                    </th>
                                                    <th>Provider</th>
                                                    <th>CNAME Target</th>
                                                    <th style={{ cursor: 'pointer' }} onClick={() => handleSort('status')}>
                                                        Status{renderSortIcons('status')}
                                                    </th>
                                                    <th style={{ cursor: 'pointer' }} onClick={() => handleSort('last_checked_at')}>
                                                        Last Checked{renderSortIcons('last_checked_at')}
                                                    </th>
                                                    <LastEventHeader />
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
                                                    paginatedData.map(sub => (
                                                        <tr key={sub.id}>
                                                            <td><h5>{sub.subdomain}</h5></td>
                                                            <td>{sub.dns_monitored ? sub.dns_monitored.domain_name : '-'}</td>
                                                            <td>{sub.provider || '-'}</td>
                                                            <td>{sub.cname_target || '-'}</td>
                                                            <td>{this.renderStatusBadge(sub.status)}</td>
                                                            <td>
                                                                <DateWithTooltip
                                                                    date={sub.last_checked_at}
                                                                    includeTime={true}
                                                                    type="checked"
                                                                />
                                                            </td>
                                                            <LastEventCell event={sub.last_event} />
                                                            <td className="text-end" style={{ whiteSpace: 'nowrap' }}>
                                                                {canManage && (
                                                                    <>
                                                                        <button
                                                                            className="btn btn-outline-success btn-sm me-2"
                                                                            data-toggle="tooltip"
                                                                            data-placement="top"
                                                                            title="Mark Resolved"
                                                                            onClick={() => this.displayConfirmModal(sub.id, sub.subdomain, 'resolved', 'Resolved')}
                                                                        >
                                                                            <i className="material-icons" style={{ fontSize: 17, lineHeight: 1.8, margin: -2.5 }}>check_circle</i>
                                                                        </button>
                                                                        <button
                                                                            className="btn btn-outline-secondary btn-sm me-2"
                                                                            data-toggle="tooltip"
                                                                            data-placement="top"
                                                                            title="Mark False Positive"
                                                                            onClick={() => this.displayConfirmModal(sub.id, sub.subdomain, 'false_positive', 'False Positive')}
                                                                        >
                                                                            <i className="material-icons" style={{ fontSize: 17, lineHeight: 1.8, margin: -2.5 }}>block</i>
                                                                        </button>
                                                                        <button
                                                                            className="btn btn-outline-warning btn-sm me-2"
                                                                            data-toggle="tooltip"
                                                                            data-placement="top"
                                                                            title="Re-check"
                                                                            onClick={() => this.displayConfirmModal(sub.id, sub.subdomain, 'pending', 'Pending Re-check')}
                                                                        >
                                                                            <i className="material-icons" style={{ fontSize: 17, lineHeight: 1.8, margin: -2.5 }}>refresh</i>
                                                                        </button>
                                                                        <button
                                                                            className="btn btn-outline-secondary btn-sm"
                                                                            data-toggle="tooltip"
                                                                            data-placement="top"
                                                                            title="History"
                                                                            onClick={() => this.setState({ showTimelineModal: true, timelineId: sub.id, timelineLabel: sub.subdomain })}
                                                                        >
                                                                            <i className="material-icons" style={{ fontSize: 17, lineHeight: 1.8, margin: -2.5 }}>history</i>
                                                                        </button>
                                                                    </>
                                                                )}
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

                {this.confirmModal()}
                <TimelineModal
                    show={showTimelineModal}
                    onHide={() => this.setState({ showTimelineModal: false, timelineId: null, timelineLabel: '' })}
                    contentType="dns_finder.danglingsubdomain"
                    objectId={timelineId}
                    label={timelineLabel}
                />
            </Fragment>
        );
    }
}

const mapStateToProps = state => ({
    danglingSubdomains: state.DnsFinder.danglingSubdomains,
    auth: state.auth
});

export default connect(mapStateToProps, {
    getDanglingSubdomains,
    patchDanglingSubdomain
})(DanglingSubdomains);
