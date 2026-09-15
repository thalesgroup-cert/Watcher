import React, { Component, Fragment } from 'react';
import { connect } from 'react-redux';
import PropTypes from 'prop-types';
import {
    getThreatsMonitored, updateAlertStatus, patchDanglingSubdomain, exportToMISP
} from "../../actions/DnsFinder";
import { addSite, getSites } from "../../actions/SiteMonitoring";
import { exportToLegitimateDomains } from '../../actions/Common';
import { Button, Modal, Container, Row, Col, Form } from 'react-bootstrap';
import TableManager from '../common/TableManager';
import DateWithTooltip from '../common/DateWithTooltip';
import ExportModal from '../common/ExportModal';
import { TimelineModal, LastEventCell, LastEventHeader } from '../Timeline/TimelineModal';

const SOURCE_BADGES = {
    dnstwist: { label: 'Dnstwist Algorithm', className: 'bg-primary' },
    certstream_keyword: { label: 'Certificate Transparency Stream', className: 'bg-info text-dark' },
    subdomain_takeover: { label: 'Subdomain Takeover Detection', className: 'bg-danger' },
};

const DANGLING_STATUS_BADGES = {
    pending: { label: 'Pending', className: 'bg-secondary' },
    ok: { label: 'OK', className: 'bg-success' },
    dangling_suspected: { label: 'Suspected', className: 'bg-warning text-dark' },
    dangling_confirmed: { label: 'Confirmed', className: 'bg-danger' },
    resolved: { label: 'Resolved', className: 'bg-info text-dark' },
    false_positive: { label: 'False Positive', className: 'bg-dark' },
};

export class ThreatsMonitored extends Component {
    constructor(props) {
        super(props);
        this.state = {
            showDisableModal: false,
            showConfirmModal: false,
            confirmAction: null,
            confirmLabel: '',
            showAddModal: false,
            showExportModal: false,
            showDetailsModal: false,
            showTimelineModal: false,
            timelineId: null,
            timelineLabel: '',
            selectedItem: null,
            exportDomain: null,
            exportSourceData: null,
            exportMode: 'dnsFinder',
            domainName: '',
            isLoading: true,
        };
        this.inputTicketRef = React.createRef();
        this.ipMonitoringRef = React.createRef();
        this.webContentMonitoringRef = React.createRef();
        this.emailMonitoringRef = React.createRef();
    }

    static propTypes = {
        threatsMonitored: PropTypes.array.isRequired,
        sites: PropTypes.array.isRequired,
        getThreatsMonitored: PropTypes.func.isRequired,
        updateAlertStatus: PropTypes.func.isRequired,
        patchDanglingSubdomain: PropTypes.func.isRequired,
        exportToMISP: PropTypes.func.isRequired,
        exportToLegitimateDomains: PropTypes.func.isRequired,
        addSite: PropTypes.func.isRequired,
        getSites: PropTypes.func.isRequired,
        auth: PropTypes.object.isRequired,
        globalFilters: PropTypes.object,
        filteredData: PropTypes.array
    };

    componentDidMount() {
        this.props.getThreatsMonitored();
        this.props.getSites();
    }

    componentDidUpdate(prevProps) {
        if (this.props.threatsMonitored !== prevProps.threatsMonitored && this.state.isLoading) {
            this.setState({ isLoading: false });
        }
    }

    extractUUID = (raw) => {
        if (!raw) return [];
        if (Array.isArray(raw)) return raw.filter(uuid => uuid && uuid.trim() !== '');
        return raw.replace(/[\[\]'"\s]/g, '').split(',').filter(Boolean);
    };

    customFilters = (filtered, filters) => {
        const itemsToFilter = this.props.filteredData || this.props.threatsMonitored;
        const { globalFilters = {} } = this.props;

        filtered = itemsToFilter || [];

        if (globalFilters.search) {
            const term = globalFilters.search.toLowerCase();
            filtered = filtered.filter(item =>
                (item.domain_name || '').toLowerCase().includes(term) ||
                (item.corporate_dns || '').toLowerCase().includes(term) ||
                (item.corporate_keyword || '').toLowerCase().includes(term) ||
                (item.technical_details?.fuzzer || '').toLowerCase().includes(term) ||
                (item.technical_details?.provider || '').toLowerCase().includes(term)
            );
        }

        if (globalFilters.source) {
            filtered = filtered.filter(item => item.source === globalFilters.source);
        }
        if (globalFilters.corporate_dns) {
            filtered = filtered.filter(item => item.corporate_dns === globalFilters.corporate_dns);
        }
        if (globalFilters.fuzzer) {
            filtered = filtered.filter(item => item.technical_details?.fuzzer === globalFilters.fuzzer);
        }
        if (globalFilters.corporate_keyword) {
            filtered = filtered.filter(item => item.corporate_keyword === globalFilters.corporate_keyword);
        }
        if (globalFilters.provider) {
            filtered = filtered.filter(item => item.technical_details?.provider === globalFilters.provider);
        }
        if (globalFilters.cname_target) {
            filtered = filtered.filter(item => item.technical_details?.cname_target === globalFilters.cname_target);
        }
        if (globalFilters.dangling_status) {
            filtered = filtered.filter(item => item.source === 'subdomain_takeover' && item.status_tag === globalFilters.dangling_status);
        }

        return filtered;
    };

    isTakeover = (item) => item.source === 'subdomain_takeover';

    getMispStatusBadge = (item) => {
        const uuid = this.extractUUID(item.misp_event_uuid);
        return uuid.length ? (
            <span className="badge bg-info me-2" title="MISP Events">
                <i className="material-icons align-middle me-1" style={{ fontSize: 14 }}>cloud_done</i>
                {uuid.length}
            </span>
        ) : null;
    };

    renderStatusTag = (item) => {
        if (this.isTakeover(item)) {
            const badge = DANGLING_STATUS_BADGES[item.status_tag] || { label: item.status_tag, className: 'bg-secondary' };
            return <span className={`badge ${badge.className}`}>{badge.label}</span>;
        }
        return (
            <span className={`badge ${item.status_tag === 'active' ? 'bg-danger' : 'bg-secondary'}`}>
                {item.status_tag === 'active' ? 'Active' : 'Archived'}
            </span>
        );
    };

    renderSourceBadge = (item) => {
        const badge = SOURCE_BADGES[item.source] || { label: item.source, className: 'bg-secondary' };
        return <span className={`badge ${badge.className}`}>{badge.label}</span>;
    };

    displayDisableModal = (item) => {
        this.setState({ showDisableModal: true, selectedItem: item });
    };

    disableModal = () => {
        const handleClose = () => this.setState({ showDisableModal: false, selectedItem: null });
        const item = this.state.selectedItem;
        if (!item) return null;
        const isActive = item.status_tag === 'active';

        const onSubmit = e => {
            e.preventDefault();
            this.props.updateAlertStatus(item.id, { status: !isActive });
            handleClose();
        };

        return (
            <Modal show={this.state.showDisableModal} onHide={handleClose} centered>
                <Modal.Header closeButton>
                    <Modal.Title>Action Requested</Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    Are you sure you want to <b><u>{isActive ? 'disable' : 'enable'}</u></b> this alert?
                </Modal.Body>
                <Modal.Footer>
                    <form onSubmit={onSubmit}>
                        <Button variant="secondary" className="me-2" onClick={handleClose}>Close</Button>
                        <Button type="submit" variant="warning">Yes, I'm sure</Button>
                    </form>
                </Modal.Footer>
            </Modal>
        );
    };

    displayConfirmModal = (item, action, label) => {
        this.setState({ showConfirmModal: true, selectedItem: item, confirmAction: action, confirmLabel: label });
    };

    confirmModal = () => {
        const handleClose = () => this.setState({ showConfirmModal: false, selectedItem: null });
        const item = this.state.selectedItem;
        if (!item) return null;

        const onSubmit = e => {
            e.preventDefault();
            this.props.patchDanglingSubdomain(
                item.technical_details.dangling_subdomain_id, { status: this.state.confirmAction }
            );
            handleClose();
        };

        return (
            <Modal show={this.state.showConfirmModal} onHide={handleClose} centered>
                <Modal.Header closeButton>
                    <Modal.Title>Action Requested</Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    Are you sure you want to mark <b>{item.domain_name}</b> as <b>{this.state.confirmLabel}</b>?
                </Modal.Body>
                <Modal.Footer>
                    <form onSubmit={onSubmit}>
                        <Button variant="secondary" className="me-2" onClick={handleClose}>Close</Button>
                        <Button type="submit" variant="warning">Yes, I'm sure</Button>
                    </form>
                </Modal.Footer>
            </Modal>
        );
    };

    displayAddModal = (item) => {
        this.setState({ showAddModal: true, selectedItem: item, domainName: item.domain_name });
    };

    addModal = () => {
        const handleClose = () => this.setState({ showAddModal: false, selectedItem: null });
        const item = this.state.selectedItem;

        const onSubmit = e => {
            e.preventDefault();
            const domain_name = this.state.domainName;
            const ticket_id = this.inputTicketRef.current.value;
            const expiry = this.state.day;
            const ip_monitoring = this.ipMonitoringRef.current.checked;
            const content_monitoring = this.webContentMonitoringRef.current.checked;
            const mail_monitoring = this.emailMonitoringRef.current.checked;
            const site = expiry
                ? { domain_name, ticket_id, expiry, ip_monitoring, content_monitoring, mail_monitoring }
                : { domain_name, ticket_id, ip_monitoring, content_monitoring, mail_monitoring };

            this.props.addSite(site);
            handleClose();
        };

        return (
            <Modal show={this.state.showAddModal} onHide={handleClose} centered>
                <Modal.Header closeButton>
                    <Modal.Title>Action Requested</Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    <Container>
                        <Row className="show-grid">
                            <Col md={{ span: 12 }}>
                                <Form onSubmit={onSubmit}>
                                    <Form.Group as={Row}>
                                        <Form.Label column sm="4">Domain name</Form.Label>
                                        <Col sm="8">{item?.domain_name}</Col>
                                        <Form.Label column sm="4">Ticket ID</Form.Label>
                                        <Col sm="8">
                                            <Form.Control ref={this.inputTicketRef} size="md" type="text"
                                                          pattern="^[a-zA-Z0-9]+(-[a-zA-Z0-9]+)*(\.[a-zA-Z0-9]+(-[a-zA-Z0-9]+)*)*$"
                                                          placeholder="230509-200a2" />
                                        </Col>
                                        <Form.Label column sm="6">Ip Monitoring</Form.Label>
                                        <Col sm="6">
                                            <Form.Check ref={this.ipMonitoringRef} defaultChecked={true} className="mt-2" type="switch" id="threats-ip-monitoring" label="" />
                                        </Col>
                                        <Form.Label column sm="6">Web Content Monitoring</Form.Label>
                                        <Col sm="6">
                                            <Form.Check ref={this.webContentMonitoringRef} defaultChecked={true} className="mt-2" type="switch" id="threats-content-monitoring" label="" />
                                        </Col>
                                        <Form.Label column sm="6">Email Monitoring</Form.Label>
                                        <Col sm="6">
                                            <Form.Check ref={this.emailMonitoringRef} defaultChecked={true} className="mt-2" type="switch" id="threats-email-monitoring" label="" />
                                        </Col>
                                    </Form.Group>
                                    <Col md={{ span: 5, offset: 8 }}>
                                        <Button variant="secondary" className="me-2" onClick={handleClose}>Close</Button>
                                        <Button type="submit" variant="success">Add</Button>
                                    </Col>
                                </Form>
                            </Col>
                        </Row>
                    </Container>
                </Modal.Body>
            </Modal>
        );
    };

    isMonitored = (domainName) => this.props.sites.some(site => site.domain_name === domainName);

    displayExportModal = (item) => {
        const isTakeover = this.isTakeover(item);
        const td = item.technical_details;

        this.setState({
            showExportModal: true,
            exportMode: isTakeover ? 'subdomainTakeover' : 'dnsFinder',
            selectedItem: item,
            exportDomain: {
                id: item.id,
                domain_name: item.domain_name,
                misp_event_uuid: item.misp_event_uuid,
            },
            exportSourceData: isTakeover ? null : {
                dns_monitored: item.corporate_dns || null,
                keyword_monitored: item.corporate_keyword || null,
                fuzzer: td?.fuzzer || null,
            }
        });
    };

    closeExportModal = () => {
        this.setState({ showExportModal: false, exportDomain: null, exportSourceData: null, selectedItem: null });
        this.props.getThreatsMonitored();
    };

    handleMispExport = async ({ id, event_uuid }) => {
        const item = this.state.selectedItem;
        if (!item) return;
        await this.props.exportToMISP(id, event_uuid, item.domain_name, this.isTakeover(item) ? 'subdomain_takeover' : undefined);
    };

    handleLegitimateDomainExport = async ({ domain_name, comment }) => {
        try {
            await this.props.exportToLegitimateDomains({ domain_name }, comment);
            return { success: true };
        } catch (err) {
            console.error('Export to Legitimate Domains failed:', err);
            throw err;
        }
    };

    handleDeleteRequest = async (alertId, domainName) => {
        try {
            await this.props.updateAlertStatus(alertId, { status: false });
            await new Promise(resolve => setTimeout(resolve, 300));
            await this.props.getThreatsMonitored();
        } catch (err) {
            console.error('Failed to archive alert:', err);
        }
    };

    displayDetailsModal = (item) => {
        this.setState({ showDetailsModal: true, selectedItem: item });
    };

    detailsModal = () => {
        const handleClose = () => this.setState({ showDetailsModal: false, selectedItem: null });
        const item = this.state.selectedItem;
        if (!item) return null;
        const td = item.technical_details || {};

        const renderFields = () => {
            if (item.source === 'dnstwist') {
                return (
                    <Fragment>
                        <Form.Label column sm="4">Fuzzer</Form.Label>
                        <Col sm="8" className="mt-2">{td.fuzzer || '-'}</Col>
                        <Form.Label column sm="4">Corporate DNS</Form.Label>
                        <Col sm="8" className="mt-2">{td.corporate_dns || '-'}</Col>
                        <Form.Label column sm="4">Detected At</Form.Label>
                        <Col sm="8" className="mt-2"><DateWithTooltip date={td.detected_at} includeTime={true} type="created" /></Col>
                    </Fragment>
                );
            }
            if (item.source === 'certstream_keyword') {
                return (
                    <Fragment>
                        <Form.Label column sm="4">Corporate Keyword</Form.Label>
                        <Col sm="8" className="mt-2">{td.corporate_keyword || '-'}</Col>
                        <Form.Label column sm="4">Issuer</Form.Label>
                        <Col sm="8" className="mt-2">{td.issuer || '-'}</Col>
                        <Form.Label column sm="4">SAN</Form.Label>
                        <Col sm="8" className="mt-2">{Array.isArray(td.san_list) && td.san_list.length ? td.san_list.join(', ') : '-'}</Col>
                        <Form.Label column sm="4">Not Before</Form.Label>
                        <Col sm="8" className="mt-2"><DateWithTooltip date={td.not_before} includeTime={true} type="created" /></Col>
                        <Form.Label column sm="4">Not After</Form.Label>
                        <Col sm="8" className="mt-2"><DateWithTooltip date={td.not_after} includeTime={true} type="expiry" /></Col>
                        <Form.Label column sm="4">Serial Number</Form.Label>
                        <Col sm="8" className="mt-2">{td.serial_number || '-'}</Col>
                        <Form.Label column sm="4">Fingerprint SHA-256</Form.Label>
                        <Col sm="8" className="mt-2" style={{ wordBreak: 'break-all' }}>{td.fingerprint_sha256 || '-'}</Col>
                    </Fragment>
                );
            }
            return (
                <Fragment>
                    <Form.Label column sm="4">Provider</Form.Label>
                    <Col sm="8" className="mt-2">{td.provider || '-'}</Col>
                    <Form.Label column sm="4">CNAME Target</Form.Label>
                    <Col sm="8" className="mt-2">{td.cname_target || '-'}</Col>
                    <Form.Label column sm="4">HTTP Status</Form.Label>
                    <Col sm="8" className="mt-2">{td.http_status_code || '-'}</Col>
                    <Form.Label column sm="4">Last Checked</Form.Label>
                    <Col sm="8" className="mt-2"><DateWithTooltip date={td.last_checked_at} includeTime={true} type="checked" /></Col>
                    <Form.Label column sm="4">Corporate DNS</Form.Label>
                    <Col sm="8" className="mt-2">{td.corporate_dns || '-'}</Col>
                </Fragment>
            );
        };

        return (
            <Modal show={this.state.showDetailsModal} onHide={handleClose} centered>
                <Modal.Header closeButton>
                    <Modal.Title>Technical details for <b>{item.domain_name}</b></Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    <Container>
                        <Row className="show-grid">
                            <Col md={12}>
                                <Form.Group as={Row}>{renderFields()}</Form.Group>
                                <Col md={{ span: 3, offset: 10 }}>
                                    <Button variant="secondary" onClick={handleClose}>Close</Button>
                                </Col>
                            </Col>
                        </Row>
                    </Container>
                </Modal.Body>
            </Modal>
        );
    };

    render() {
        const { globalFilters, filteredData, threatsMonitored } = this.props;
        const dataToUse = filteredData || threatsMonitored;
        const { showTimelineModal, timelineId, timelineLabel } = this.state;

        const renderLoadingState = () => (
            <tr>
                <td colSpan="6" className="text-center py-5">
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
                        <div className="float-start" style={{ marginBottom: 12 }}>
                            <h4>DNS Threats Monitored</h4>
                        </div>
                    </div>
                </div>

                <TableManager
                    data={dataToUse}
                    filterConfig={[]}
                    customFilters={this.customFilters}
                    searchFields={['domain_name', 'corporate_dns', 'corporate_keyword']}
                    dateFields={['created_at']}
                    defaultSort="created_at"
                    globalFilters={globalFilters}
                    moduleKey="dnsFinder_threats"
                >
                    {({
                        paginatedData, renderItemsInfo, renderPagination, handleSort, renderSortIcons,
                        getTableContainerStyle, theadRef
                    }) => (
                        <Fragment>
                            {renderItemsInfo()}
                            <div className="row">
                                <div className="col-lg-12">
                                    <div style={{ ...getTableContainerStyle(), overflowX: 'auto' }}>
                                        <table className="table table-striped table-hover">
                                            <thead ref={theadRef}>
                                                <tr>
                                                    <th style={{ cursor: 'pointer' }} onClick={() => handleSort('domain_name')}>
                                                        Domain Name{renderSortIcons('domain_name')}
                                                    </th>
                                                    <th style={{ cursor: 'pointer' }} onClick={() => handleSort('source')}>
                                                        Source{renderSortIcons('source')}
                                                    </th>
                                                    <th>Corporate Keyword</th>
                                                    <th style={{ cursor: 'pointer' }} onClick={() => handleSort('corporate_dns')}>
                                                        Corporate DNS{renderSortIcons('corporate_dns')}
                                                    </th>
                                                    <th style={{ cursor: 'pointer' }} onClick={() => handleSort('created_at')}>
                                                        Created At{renderSortIcons('created_at')}
                                                    </th>
                                                    <th />
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {this.state.isLoading ? renderLoadingState() : paginatedData.length === 0 ? (
                                                    <tr><td colSpan="6" className="text-center text-muted py-4">No results found</td></tr>
                                                ) : (
                                                    paginatedData.map(item => (
                                                        <tr key={`${item.source}-${item.id}`}>
                                                            <td>
                                                                <div>
                                                                    <strong>
                                                                        {this.getMispStatusBadge(item)}
                                                                        {item.domain_name}
                                                                    </strong>
                                                                    <div style={{ marginTop: 4 }}>{this.renderStatusTag(item)}</div>
                                                                </div>
                                                            </td>
                                                            <td>{this.renderSourceBadge(item)}</td>
                                                            <td>{item.corporate_keyword || '-'}</td>
                                                            <td>{item.corporate_dns || '-'}</td>
                                                            <td><DateWithTooltip date={item.created_at} includeTime={true} type="created" /></td>
                                                            <td className="text-end" style={{ whiteSpace: 'nowrap' }}>
                                                                <button onClick={() => this.displayDetailsModal(item)} className="btn btn-outline-info btn-sm me-2" title="Technical Details">
                                                                    <i className="material-icons" style={{ fontSize: 17, lineHeight: 1.8, margin: -2.5 }}>info</i>
                                                                </button>
                                                                <button onClick={() => this.displayExportModal(item)} className="btn btn-outline-primary btn-sm me-2" title="Export">
                                                                    <i className="material-icons" style={{ fontSize: 17, lineHeight: 1.8, margin: -2.5 }}>
                                                                        {this.extractUUID(item.misp_event_uuid).length ? 'cloud_done' : 'cloud_upload'}
                                                                    </i>
                                                                </button>
                                                                {!this.isTakeover(item) && (
                                                                    <Fragment>
                                                                        <button
                                                                            onClick={() => this.displayAddModal(item)}
                                                                            className={`btn btn-sm me-2 ${this.isMonitored(item.domain_name) ? 'btn-success' : 'btn-secondary'}`}
                                                                            title={this.isMonitored(item.domain_name) ? `${item.domain_name} is monitored` : `Monitor ${item.domain_name}`}
                                                                            disabled={this.isMonitored(item.domain_name)}
                                                                        >
                                                                            <i className="material-icons" style={{ fontSize: 17, lineHeight: 1.8, margin: -2.5 }}>
                                                                                {this.isMonitored(item.domain_name) ? 'playlist_add_check' : 'playlist_add'}
                                                                            </i>
                                                                        </button>
                                                                        <button onClick={() => this.displayDisableModal(item)} className="btn btn-outline-primary btn-sm me-2">
                                                                            {item.status_tag === 'active' ? 'Disable' : 'Enable'}
                                                                        </button>
                                                                    </Fragment>
                                                                )}
                                                                {this.isTakeover(item) && (
                                                                    <Fragment>
                                                                        <button className="btn btn-outline-success btn-sm me-2" title="Mark Resolved"
                                                                                onClick={() => this.displayConfirmModal(item, 'resolved', 'Resolved')}>
                                                                            <i className="material-icons" style={{ fontSize: 17, lineHeight: 1.8, margin: -2.5 }}>check_circle</i>
                                                                        </button>
                                                                        <button className="btn btn-outline-secondary btn-sm me-2" title="Mark False Positive"
                                                                                onClick={() => this.displayConfirmModal(item, 'false_positive', 'False Positive')}>
                                                                            <i className="material-icons" style={{ fontSize: 17, lineHeight: 1.8, margin: -2.5 }}>block</i>
                                                                        </button>
                                                                        <button className="btn btn-outline-warning btn-sm me-2" title="Re-check"
                                                                                onClick={() => this.displayConfirmModal(item, 'pending', 'Pending Re-check')}>
                                                                            <i className="material-icons" style={{ fontSize: 17, lineHeight: 1.8, margin: -2.5 }}>refresh</i>
                                                                        </button>
                                                                        <button
                                                                            className="btn btn-outline-secondary btn-sm"
                                                                            title="History"
                                                                            onClick={() => this.setState({
                                                                                showTimelineModal: true,
                                                                                timelineId: item.technical_details.dangling_subdomain_id,
                                                                                timelineLabel: item.domain_name
                                                                            })}
                                                                        >
                                                                            <i className="material-icons" style={{ fontSize: 17, lineHeight: 1.8, margin: -2.5 }}>history</i>
                                                                        </button>
                                                                    </Fragment>
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

                {this.disableModal()}
                {this.confirmModal()}
                {this.addModal()}
                {this.detailsModal()}

                <ExportModal
                    show={this.state.showExportModal}
                    domain={this.state.exportDomain}
                    sourceData={this.state.exportSourceData}
                    alertId={this.state.selectedItem?.id}
                    onClose={this.closeExportModal}
                    onMispExport={this.handleMispExport}
                    onLegitimateDomainExport={this.handleLegitimateDomainExport}
                    onDeleteRequest={this.handleDeleteRequest}
                    mode={this.state.exportMode}
                />

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
    threatsMonitored: state.DnsFinder.threatsMonitored,
    sites: state.SiteMonitoring.sites,
    auth: state.auth,
    error: state.errors
});

export default connect(mapStateToProps, {
    getThreatsMonitored, updateAlertStatus, patchDanglingSubdomain, exportToMISP,
    exportToLegitimateDomains, addSite, getSites
})(ThreatsMonitored);
