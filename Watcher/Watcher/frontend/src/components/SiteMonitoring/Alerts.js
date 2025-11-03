import React, { Component, Fragment } from 'react';
import { connect } from 'react-redux';
import PropTypes from 'prop-types';
import { getSiteAlerts, updateSiteAlertStatus } from "../../actions/SiteMonitoring";
import { Button, Modal, Container, Row, Col, Form, Tabs, Tab, Badge } from 'react-bootstrap';

import TableManager from '../common/TableManager';

const ALERT_TYPE_BADGES = {
    'Web content': 'info',
    'IP address': 'primary', 
    'Mail': 'success',
    'RDAP': 'warning',
    'WHOIS': 'warning'
};

const getAlertTypeBadge = (alertType) => {
    return 'primary';
};

export class Alerts extends Component {
    constructor(props) {
        super(props);
        this.state = {
            showStatusModal: false,
            showInfoModal: false,
            selectedAlert: null,
            selectedAlertId: 0,
            activeTab: 'active'
        };
    }

    static propTypes = {
        show: PropTypes.bool.isRequired,
        onHide: PropTypes.func.isRequired,
        site: PropTypes.object,
        alerts: PropTypes.array.isRequired,
        getSiteAlerts: PropTypes.func.isRequired,
        updateSiteAlertStatus: PropTypes.func.isRequired,
        auth: PropTypes.object.isRequired
    };

    componentDidMount() {
        this.props.getSiteAlerts();
    }

    componentDidUpdate(prevProps) {
        if (this.props.show && !prevProps.show) {
            this.props.getSiteAlerts();
        }
    }

    filterAlertsBySite = (alerts, status) => {
        if (!this.props.site) return [];
        return alerts.filter(alert => 
            alert.site?.domain_name === this.props.site.domain_name && 
            alert.status === status
        );
    };

    displayStatusModal = (id) => {
        this.setState({ showStatusModal: true, selectedAlertId: id });
    };

    displayInfo = (alert) => {
        this.setState({
            showInfoModal: true,
            selectedAlert: alert
        });
    };

    statusModal = () => {
        const handleClose = () => this.setState({ showStatusModal: false });
        const isActive = this.state.activeTab === 'active';

        const onSubmit = e => {
            e.preventDefault();
            const status = !isActive;
            const json_status = { status };
            this.props.updateSiteAlertStatus(this.state.selectedAlertId, json_status);
            this.setState({ selectedAlertId: 0 });
            handleClose();
        };

        return (
            <Modal show={this.state.showStatusModal} onHide={handleClose} centered>
                <Modal.Header closeButton>
                    <Modal.Title>Action Requested</Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    Are you sure you want to <b><u>{isActive ? 'disable' : 'enable'}</u></b> this alert?
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

    infoModal = () => {
        const handleClose = () => this.setState({ showInfoModal: false, selectedAlert: null });
        const alert = this.state.selectedAlert;
    
        if (!alert) return null;
    
        const isRdapAlert = alert.new_registrar !== null || alert.old_registrar !== null || 
                           alert.new_expiry_date !== null || alert.old_expiry_date !== null;
    
        return (
            <Modal 
                show={this.state.showInfoModal} 
                onHide={handleClose} 
                centered 
                size="lg"
                style={{ zIndex: 1060 }}
            >
                <Modal.Header closeButton>
                    <Modal.Title>
                        Alerts Details - <span style={{ fontWeight: "bold" }}>{alert.type}</span>
                    </Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    <Container>
                        <Row>
                            <Col md={12}>
                                <Form.Group as={Row}>
                                    <Form.Label column sm="4">Alert Type</Form.Label>
                                    <Col sm="8" className="mt-2">
                                        {alert.type}
                                    </Col>
                                    
                                    <Form.Label column sm="4">Domain</Form.Label>
                                    <Col sm="8" className="mt-2">
                                        <strong>{alert.site?.domain_name}</strong>
                                    </Col>
    
                                    <Form.Label column sm="4">Created At</Form.Label>
                                    <Col sm="8" className="mt-2">
                                        {new Date(alert.created_at).toLocaleString()}
                                    </Col>
    
                                    <Form.Label column sm="4">Status</Form.Label>
                                    <Col sm="8" className="mt-2">
                                        {alert.status ? "Active" : "Archived"}
                                    </Col>
    
                                    {isRdapAlert ? this.renderRdapAlertDetails(alert) : this.renderMonitoringAlertDetails(alert)}
                                </Form.Group>
    
                                <div className="text-end mt-4">
                                    <Button variant="secondary" onClick={handleClose}>
                                        Close
                                    </Button>
                                </div>
                            </Col>
                        </Row>
                    </Container>
                </Modal.Body>
            </Modal>
        );
    };

    renderRdapAlertDetails = (alert) => {
        const calculateDateDifference = () => {
            if (!alert.new_expiry_date || !alert.old_expiry_date) return null;
            const oldDate = new Date(alert.old_expiry_date);
            const newDate = new Date(alert.new_expiry_date);
            const diffTime = newDate - oldDate;
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            if (diffDays > 0) return `Extended by ${diffDays} days`;
            if (diffDays < 0) return `Reduced by ${Math.abs(diffDays)} days`;
            return "No change in duration";
        };
    
        return (
            <Fragment>
                <Col sm="12" className="mt-4">
                    <hr />
                </Col>
    
                {(alert.new_registrar || alert.old_registrar) && (
                    <Fragment>
                        <Form.Label column sm="4" className="fw-bold">
                            Registrar
                        </Form.Label>
                        <Col sm="8" className="mt-1">
                            <div>
                                <strong>Current:</strong> {alert.new_registrar || "-"}
                            </div>
                            <div className="text-muted small">
                                Previous: {alert.old_registrar || "-"}
                            </div>
                        </Col>
                    </Fragment>
                )}
    
                {(alert.new_expiry_date || alert.old_expiry_date) && (
                    <Fragment>
                        <Form.Label column sm="4" className="fw-bold">
                            Expiry Date
                        </Form.Label>
                        <Col sm="8" className="mt-1">
                            <div>
                                <strong>Current:</strong>{" "}
                                {alert.new_expiry_date
                                    ? new Date(alert.new_expiry_date).toLocaleDateString()
                                    : "-"}
                            </div>
                            <div className="text-muted small">
                                Previous:{" "}
                                {alert.old_expiry_date
                                    ? new Date(alert.old_expiry_date).toLocaleDateString()
                                    : "-"}
                            </div>
                            {calculateDateDifference() && (
                                <div className="fw-bold mt-1">
                                    {calculateDateDifference()}
                                </div>
                            )}
                        </Col>
                    </Fragment>
                )}
    
                <Form.Label column sm="4" className="fw-bold">
                    Detection Method
                </Form.Label>
                <Col sm="8" className="mt-1">
                    <div>
                        <strong>
                            {alert.type.includes("RDAP") ? "RDAP Protocol" : "WHOIS Fallback"}
                        </strong>
                    </div>
                    <div className="text-muted small">
                        Automated domain registration data monitoring
                    </div>
                </Col>
            </Fragment>
        );
    };

    renderMonitoringAlertDetails = (alert) => {
        const formatMXRecords = (records) => {
            if (!records) return "-";
            if (Array.isArray(records)) return records.join(", ");
            return records;
        };
    
        return (
            <Fragment>
                <Col sm="12" className="mt-4">
                    <hr />
                </Col>
    
                {alert.difference_score && (
                    <>
                        <Form.Label column sm="4" className="fw-bold">
                            Content Difference Score
                        </Form.Label>
                        <Col sm="8" className="mt-1">
                            <div className="fw-bold">{alert.difference_score}</div>
                            <div className="text-muted small">
                                TLSH fuzzy hash comparison score
                            </div>
                        </Col>
                    </>
                )}
    
                {(alert.new_ip || alert.old_ip) && (
                    <>
                        <Form.Label column sm="4" className="fw-bold">
                            New Ip
                        </Form.Label>
                        <Col sm="8" className="mt-1">
                            <div>
                                <strong>Current:</strong> {alert.new_ip || "-"}
                            </div>
                            <div className="text-muted small">
                                Old Ip: {alert.old_ip || "-"}
                            </div>
                        </Col>
                    </>
                )}
    
                {(alert.new_ip_second || alert.old_ip_second) && (
                    <>
                        <Form.Label column sm="4" className="fw-bold">
                            New Ip Second
                        </Form.Label>
                        <Col sm="8" className="mt-1">
                            <div>
                                <strong>Current:</strong> {alert.new_ip_second || "-"}
                            </div>
                            <div className="text-muted small">
                                Old Ip Second: {alert.old_ip_second || "-"}
                            </div>
                        </Col>
                    </>
                )}
    
                {(alert.new_MX_records || alert.old_MX_records) && (
                    <>
                        <Form.Label column sm="4" className="fw-bold">
                            New MX Records
                        </Form.Label>
                        <Col sm="8" className="mt-1">
                            <div>
                                <strong>Current:</strong> {formatMXRecords(alert.new_MX_records)}
                            </div>
                            <div className="text-muted small">
                                Old MX Records: {formatMXRecords(alert.old_MX_records)}
                            </div>
                        </Col>
                    </>
                )}
    
                {(alert.new_mail_A_record_ip || alert.old_mail_A_record_ip) && (
                    <>
                        <Form.Label column sm="4" className="fw-bold">
                            New Mail Server
                        </Form.Label>
                        <Col sm="8" className="mt-1">
                            <div>
                                <strong>Current:</strong> {alert.new_mail_A_record_ip || "-"}
                            </div>
                            <div className="text-muted small">
                                Old Mail Server: {alert.old_mail_A_record_ip || "-"}
                            </div>
                        </Col>
                    </>
                )}
            </Fragment>
        );
    };
    

    renderAlertsTable = (alerts, isActive) => {
        return (
            <TableManager
                data={alerts}
                filterConfig={[]}
                searchFields={['type', 'id']}
                dateFields={['created_at']}
                defaultSort="created_at"
                itemsPerPage={10}
            >
                {({
                    paginatedData,
                    renderItemsInfo,
                    renderPagination,
                    handleSort,
                    renderSortIcons
                }) => (
                    <Fragment>
                        {renderItemsInfo()}

                        <div style={{ maxHeight: '400px', overflowX: 'auto' }}>
                            <table className="table table-striped table-hover">
                                <thead>
                                    <tr style={{ fontSize: "16px" }}>
                                        <th style={{ cursor: 'pointer' }} onClick={() => handleSort('id')}>
                                            ID{renderSortIcons('id')}
                                        </th>
                                        <th style={{ cursor: 'pointer' }} onClick={() => handleSort('type')}>
                                            Type{renderSortIcons('type')}
                                        </th>
                                        <th style={{ cursor: 'pointer' }} onClick={() => handleSort('created_at')}>
                                            Created At{renderSortIcons('created_at')}
                                        </th>
                                        <th></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {paginatedData.map(alert => {
                                        return (
                                            <tr key={alert.id}>
                                                <td><strong>#{alert.id}</strong></td>
                                                <td>
                                                    <Badge variant={getAlertTypeBadge(alert.type)} className="me-1" style={{ fontSize: '14px' }}>
                                                        {alert.type}
                                                    </Badge>
                                                </td>
                                                <td>{new Date(alert.created_at).toLocaleString()}</td>
                                                <td>
                                                    <button
                                                        onClick={() => this.displayInfo(alert)}
                                                        className="btn btn-primary btn-sm me-2"
                                                    >
                                                        View Details
                                                    </button>
                                                    <button
                                                        onClick={() => this.displayStatusModal(alert.id)}
                                                        className={`btn btn-sm ${isActive ? 'btn-outline-warning' : 'btn-outline-success'}`}
                                                    >
                                                        {isActive ? 'Disable' : 'Enable'}
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                    {paginatedData.length === 0 && (
                                        <tr>
                                            <td colSpan="4" className="text-center text-muted py-3">
                                                No results found
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>

                        {renderPagination()}
                    </Fragment>
                )}
            </TableManager>
        );
    };

    render() {
        const { show, onHide, site } = this.props;

        if (!site) return null;

        const activeAlerts = this.filterAlertsBySite(this.props.alerts, true);
        const archivedAlerts = this.filterAlertsBySite(this.props.alerts, false);

        const modalBackdrop = this.state.showInfoModal ? (
            <div
                onClick={() => this.setState({ showInfoModal: false, selectedAlert: null })}
                style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                    backgroundColor: 'rgba(0, 0, 0, 0.5)',
                    zIndex: 1055,
                    cursor: 'pointer'
                }}
            />
        ) : null;

        return (
            <Fragment>
                <Modal 
                    show={show} 
                    onHide={onHide} 
                    size="xl" 
                    centered
                    style={{ 
                        zIndex: this.state.showInfoModal ? 1050 : 1050,
                        filter: this.state.showInfoModal ? 'brightness(0.7)' : 'none'
                    }}
                    backdrop={this.state.showInfoModal ? false : true}
                >
                    <Modal.Header closeButton>
                        <Modal.Title>
                            Alerts for <strong>{site.domain_name}</strong>
                            <Badge variant={activeAlerts.length > 0 ? 'success' : 'success'} className="ms-2">
                                {activeAlerts.length} Active
                            </Badge>
                            <Badge variant="secondary" className="ms-2">
                                {archivedAlerts.length} Archived
                            </Badge>
                        </Modal.Title>
                    </Modal.Header>
                    <Modal.Body>
                        <Tabs
                            activeKey={this.state.activeTab}
                            onSelect={(tab) => this.setState({ activeTab: tab })}
                            className="mb-3"
                        >
                            <Tab 
                                eventKey="active" 
                                title={
                                    <span>
                                        Active{' '}
                                        <Badge variant={activeAlerts.length > 0 ? 'success' : 'success'}>
                                            {activeAlerts.length}
                                        </Badge>
                                    </span>
                                }
                            >
                                {this.renderAlertsTable(activeAlerts, true)}
                            </Tab>
                            <Tab 
                                eventKey="archived" 
                                title={
                                    <span>
                                        Archived{' '}
                                        <Badge variant="secondary">
                                            {archivedAlerts.length}
                                        </Badge>
                                    </span>
                                }
                            >
                                {this.renderAlertsTable(archivedAlerts, false)}
                            </Tab>
                        </Tabs>
                    </Modal.Body>
                    <Modal.Footer>
                        <Button variant="secondary" onClick={onHide}>
                            Close
                        </Button>
                    </Modal.Footer>
                </Modal>

                {modalBackdrop}
                {this.statusModal()}
                {this.infoModal()}
            </Fragment>
        );
    }
}

const mapStateToProps = state => ({
    alerts: state.SiteMonitoring.alerts || [],
    auth: state.auth
});

export default connect(mapStateToProps, {
    getSiteAlerts,
    updateSiteAlertStatus
})(Alerts);