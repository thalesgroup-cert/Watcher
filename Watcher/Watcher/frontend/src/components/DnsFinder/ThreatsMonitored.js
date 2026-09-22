import React, { Component, Fragment } from 'react';
import { connect } from 'react-redux';
import PropTypes from 'prop-types';
import {
    getThreatsMonitored, updateAlertStatus, exportToMISP, patchDnsTwisted
} from "../../actions/DnsFinder";
import { addSite, getSites } from "../../actions/SiteMonitoring";
import { exportToLegitimateDomains } from '../../actions/Common';
import { Button, Modal, Container, Row, Col, Form, OverlayTrigger, Tooltip, SplitButton, Dropdown } from 'react-bootstrap';
import TableManager from '../common/TableManager';
import DateWithTooltip from '../common/DateWithTooltip';
import ExportModal from '../common/ExportModal';
import { TimelineModal } from '../Timeline/TimelineModal';

const SOURCE_BADGES = {
    dnstwist: { label: 'Dnstwist Algorithm', className: 'bg-primary' },
    certstream_keyword: { label: 'Certificate Transparency Stream', className: 'bg-info text-dark' },
    subdomain_takeover: { label: 'Subdomain Takeover Detection', className: 'bg-danger' },
};

const STATUS_BADGES = {
    pending: { label: 'Pending', variant: 'secondary' },
    suspected: { label: 'Suspected', variant: 'warning' },
    confirmed: { label: 'Confirmed', variant: 'danger' },
    resolved: { label: 'Resolved', variant: 'success' },
    false_positive: { label: 'False Positive', variant: 'dark' },
};

const CONTEXT_TAG = {
    fuzzer:       'bg-primary',
    issuer:       'bg-info text-dark',
    san:          'bg-primary',
    provider:     'bg-dark',
    cname_target: 'bg-secondary',
    http_status:  'bg-light text-dark border',
    last_checked: 'bg-light text-dark border',
};

export class ThreatsMonitored extends Component {
    constructor(props) {
        super(props);
        this.state = {
            showEditModal: false,
            editForm: {},
            showExportModal: false,
            showTimelineModal: false,
            timelineId: null,
            timelineContentType: 'dns_finder.dnstwisted',
            timelineId2: null,
            timelineContentType2: 'dns_finder.alert',
            timelineLabel: '',
            selectedItem: null,
            exportDomain: null,
            exportSourceData: null,
            exportMode: 'dnsFinder',
            isLoading: true,
        };
    }

    static propTypes = {
        threatsMonitored: PropTypes.array.isRequired,
        sites: PropTypes.array.isRequired,
        getThreatsMonitored: PropTypes.func.isRequired,
        updateAlertStatus: PropTypes.func.isRequired,
        patchDnsTwisted: PropTypes.func.isRequired,
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
        const itemsToFilter = this.props.filteredData ?? this.props.threatsMonitored;
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
        if (globalFilters.status === 'open') {
            filtered = filtered.filter(item => !['resolved', 'false_positive'].includes(item.status));
        } else if (globalFilters.status) {
            filtered = filtered.filter(item => item.status === globalFilters.status);
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
        const td = item.technical_details || {};

        if (this.isTakeover(item)) {
            return (
                <Fragment>
                    {td.provider && <span className={`badge ${CONTEXT_TAG.provider} me-1`}>Provider: {td.provider}</span>}
                    {td.cname_target && <span className={`badge ${CONTEXT_TAG.cname_target} me-1`}>CNAME: {td.cname_target}</span>}
                    {td.http_status_code && <span className={`badge ${CONTEXT_TAG.http_status} me-1`}>HTTP: {td.http_status_code}</span>}
                    {td.last_checked_at && (
                        <span className={`badge ${CONTEXT_TAG.last_checked} me-1`}>
                            Checked: <DateWithTooltip date={td.last_checked_at} includeTime={false} type="default" />
                        </span>
                    )}
                </Fragment>
            );
        }

        if (item.source === 'dnstwist') {
            return td.fuzzer ? <span className={`badge ${CONTEXT_TAG.fuzzer} me-1`}>Fuzzer: {td.fuzzer}</span> : null;
        }

        return (
            <Fragment>
                {td.issuer && <span className={`badge ${CONTEXT_TAG.issuer} me-1`}>Issuer: {td.issuer}</span>}
                {Array.isArray(td.san_list) && td.san_list.length > 0 && (
                    <span className={`badge ${CONTEXT_TAG.san} me-1`}>SAN: {td.san_list.join(', ')}</span>
                )}
            </Fragment>
        );
    };

    renderSourceBadge = (item) => {
        const badge = SOURCE_BADGES[item.source] || { label: item.source, className: 'bg-secondary' };
        return <span className={`badge ${badge.className}`}>{badge.label}</span>;
    };

    renderStatusSelect = (item) => {
        const badge = STATUS_BADGES[item.status] || { label: item.status, variant: 'secondary' };
        return (
            <SplitButton
                id={`status-dropdown-${item.source}-${item.id}`}
                title={badge.label}
                variant={badge.variant}
                size="sm"
            >
                {Object.entries(STATUS_BADGES).map(([value, statusBadge]) => (
                    <Dropdown.Item
                        key={value}
                        active={value === item.status}
                        onClick={() => this.props.updateAlertStatus(item.id, { status: value })}
                    >
                        {statusBadge.label}
                    </Dropdown.Item>
                ))}
            </SplitButton>
        );
    };

    renderComments = (item) => {
        if (!item.comments || item.comments.length === 0) return '-';

        if (item.comments.length > 50) {
            return (
                <OverlayTrigger
                    placement="left"
                    delay={{ show: 250, hide: 400 }}
                    overlay={
                        <Tooltip id={`tooltip-comment-${item.source}-${item.id}`}>
                            <div style={{ textAlign: 'left', maxWidth: '400px', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                                {item.comments}
                            </div>
                        </Tooltip>
                    }
                >
                    <div style={{ display: 'inline-flex', alignItems: 'center', cursor: 'help', gap: '6px' }}>
                        <span style={{
                            maxWidth: 180, whiteSpace: 'nowrap', overflow: 'hidden',
                            textOverflow: 'ellipsis', borderBottom: '1px dotted currentColor'
                        }}>
                            {item.comments}
                        </span>
                        <i className="material-icons text-info" style={{ fontSize: 16, verticalAlign: 'middle' }}>info</i>
                    </div>
                </OverlayTrigger>
            );
        }

        return <div style={{ maxWidth: 200 }}>{item.comments}</div>;
    };

    displayEditModal = (item) => {
        const td = item.technical_details || {};
        const sourceFields = this.isTakeover(item)
            ? {
                cname_target: td.cname_target || '',
                provider: td.provider || '',
                http_status_code: td.http_status_code ?? '',
            }
            : item.source === 'dnstwist'
                ? { fuzzer: td.fuzzer || '' }
                : { issuer: td.issuer || '' };

        this.setState({
            showEditModal: true, selectedItem: item,
            editForm: { ...sourceFields, comments: item.comments || '' },
        });
    };

    handleEditFieldChange = (field, value) => {
        this.setState(prev => ({ editForm: { ...prev.editForm, [field]: value } }));
    };

    editModal = () => {
        const handleClose = () => this.setState({ showEditModal: false, selectedItem: null, editForm: {} });
        const item = this.state.selectedItem;
        if (!item) return null;
        const { editForm } = this.state;
        const isTakeover = this.isTakeover(item);

        const onSubmit = e => {
            e.preventDefault();
            const technicalPayload = isTakeover
                ? {
                    cname_target: editForm.cname_target || null,
                    provider: editForm.provider || null,
                    http_status_code: editForm.http_status_code === '' ? null : Number(editForm.http_status_code),
                }
                : item.source === 'dnstwist'
                    ? { fuzzer: editForm.fuzzer }
                    : { issuer: editForm.issuer };
            this.props.patchDnsTwisted(item.technical_details.dns_twisted_id, technicalPayload);
            this.props.updateAlertStatus(item.id, { comments: editForm.comments || '' });
            handleClose();
        };

        return (
            <Modal show={this.state.showEditModal} onHide={handleClose} centered>
                <Modal.Header closeButton>
                    <Modal.Title>Edit <b>{item.domain_name}</b></Modal.Title>
                </Modal.Header>
                <Form onSubmit={onSubmit}>
                    <Modal.Body>
                        <Container>
                            <Row className="show-grid">
                                <Col md={{ span: 12 }}>
                                    <Form.Group as={Row} className="align-items-center mb-2">
                                        {isTakeover ? (
                                            <Fragment>
                                                <Form.Label column sm="4">CNAME Target</Form.Label>
                                                <Col sm="8">
                                                    <Form.Control
                                                        type="text"
                                                        placeholder="mybucket.s3.amazonaws.com"
                                                        value={editForm.cname_target}
                                                        onChange={e => this.handleEditFieldChange('cname_target', e.target.value)}
                                                    />
                                                </Col>
                                                <Form.Label column sm="4" className="mt-2">Provider</Form.Label>
                                                <Col sm="8" className="mt-2">
                                                    <Form.Control
                                                        type="text"
                                                        placeholder="Amazon S3"
                                                        value={editForm.provider}
                                                        onChange={e => this.handleEditFieldChange('provider', e.target.value)}
                                                    />
                                                </Col>
                                                <Form.Label column sm="4" className="mt-2">HTTP Status Code</Form.Label>
                                                <Col sm="8" className="mt-2">
                                                    <Form.Control
                                                        type="number"
                                                        placeholder="404"
                                                        value={editForm.http_status_code}
                                                        onChange={e => this.handleEditFieldChange('http_status_code', e.target.value)}
                                                    />
                                                </Col>
                                            </Fragment>
                                        ) : item.source === 'dnstwist' ? (
                                            <Fragment>
                                                <Form.Label column sm="4">Fuzzer</Form.Label>
                                                <Col sm="8">
                                                    <Form.Control
                                                        type="text"
                                                        placeholder="homoglyph"
                                                        value={editForm.fuzzer}
                                                        onChange={e => this.handleEditFieldChange('fuzzer', e.target.value)}
                                                    />
                                                </Col>
                                            </Fragment>
                                        ) : (
                                            <Fragment>
                                                <Form.Label column sm="4">Issuer</Form.Label>
                                                <Col sm="8">
                                                    <Form.Control
                                                        type="text"
                                                        placeholder="Let's Encrypt"
                                                        value={editForm.issuer}
                                                        onChange={e => this.handleEditFieldChange('issuer', e.target.value)}
                                                    />
                                                </Col>
                                            </Fragment>
                                        )}
                                        <Form.Label column sm="4" className="mt-2">Comments</Form.Label>
                                        <Col sm="8" className="mt-2">
                                            <Form.Control
                                                as="textarea"
                                                rows={3}
                                                maxLength={300}
                                                placeholder="Add notes, context, actions taken, or any relevant information about this domain"
                                                value={editForm.comments}
                                                style={{ borderColor: 300 - editForm.comments.length < 50 ? '#dc3545' : '' }}
                                                onChange={e => this.handleEditFieldChange('comments', e.target.value)}
                                            />
                                            <div style={{ fontSize: 12, color: '#888', textAlign: 'right' }}>
                                                {editForm.comments.length}/300
                                            </div>
                                        </Col>
                                    </Form.Group>
                                </Col>
                            </Row>
                        </Container>
                    </Modal.Body>
                    <Modal.Footer>
                        <Button variant="secondary" className="me-2" onClick={handleClose}>Close</Button>
                        <Button type="submit" variant="success">Save</Button>
                    </Modal.Footer>
                </Form>
            </Modal>
        );
    };

    isMonitored = (domainName) => this.props.sites.some(site => site.domain_name === domainName);

    handleWebsiteMonitoringExport = async (site) => {
        const result = await this.props.addSite(site);
        const item = this.state.selectedItem;
        if (item) {
            await this.props.updateAlertStatus(item.id, { status: 'resolved' });
        }
        return result;
    };

    displayExportModal = (item) => {
        const isTakeover = this.isTakeover(item);
        const td = item.technical_details;

        this.setState({
            showExportModal: true,
            exportMode: isTakeover ? 'subdomainTakeover' : 'dnsFinder',
            selectedItem: item,
            exportDomain: {
                id: td?.dns_twisted_id,
                domain_name: item.domain_name,
                misp_event_uuid: item.misp_event_uuid,
            },
            exportSourceData: {
                dns_monitored: item.corporate_dns || null,
                keyword_monitored: item.corporate_keyword || null,
                fuzzer: td?.fuzzer || null,
                comments: item.comments || null,
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
        await this.props.exportToMISP(id, event_uuid, item.domain_name);
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
            await this.props.updateAlertStatus(alertId, { status: 'resolved' });
            await new Promise(resolve => setTimeout(resolve, 300));
            await this.props.getThreatsMonitored();
        } catch (err) {
            console.error('Failed to archive alert:', err);
        }
    };

    render() {
        const { globalFilters, filteredData, threatsMonitored } = this.props;
        const dataToUse = filteredData ?? threatsMonitored;
        const {
            showTimelineModal, timelineId, timelineContentType,
            timelineId2, timelineContentType2, timelineLabel
        } = this.state;

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
                                                    <th style={{ cursor: 'pointer', maxWidth: 260 }} onClick={() => handleSort('domain_name')}>
                                                        Domain Name{renderSortIcons('domain_name')}
                                                    </th>
                                                    <th style={{ cursor: 'pointer' }} onClick={() => handleSort('status')}>
                                                        Status{renderSortIcons('status')}
                                                    </th>
                                                    <th style={{ cursor: 'pointer' }} onClick={() => handleSort('source')}>
                                                        Source{renderSortIcons('source')}
                                                    </th>
                                                    <th style={{ cursor: 'pointer' }} onClick={() => handleSort('corporate_dns')}>
                                                        Monitored{renderSortIcons('corporate_dns')}
                                                    </th>
                                                    <th>Comments</th>
                                                    <th style={{ cursor: 'pointer' }} onClick={() => handleSort('created_at')}>
                                                        Created At{renderSortIcons('created_at')}
                                                    </th>
                                                    <th />
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {this.state.isLoading ? renderLoadingState() : paginatedData.length === 0 ? (
                                                    <tr><td colSpan="7" className="text-center text-muted py-4">No results found</td></tr>
                                                ) : (
                                                    paginatedData.map(item => (
                                                        <tr key={`${item.source}-${item.id}`}>
                                                            <td style={{ maxWidth: 260 }}>
                                                                <div style={{ wordBreak: 'break-word' }}>
                                                                    <strong>
                                                                        {this.getMispStatusBadge(item)}
                                                                        {item.domain_name}
                                                                    </strong>
                                                                    <div style={{ marginTop: 4 }}>{this.renderStatusTag(item)}</div>
                                                                </div>
                                                            </td>
                                                            <td>{this.renderStatusSelect(item)}</td>
                                                            <td>{this.renderSourceBadge(item)}</td>
                                                            <td>{item.corporate_dns || item.corporate_keyword || '-'}</td>
                                                            <td>{this.renderComments(item)}</td>
                                                            <td><DateWithTooltip date={item.created_at} includeTime={true} type="created" /></td>
                                                            <td className="text-end" style={{ whiteSpace: 'nowrap' }}>
                                                                <button onClick={() => this.displayExportModal(item)} className="btn btn-outline-primary btn-sm me-2" title="Export">
                                                                    <i className="material-icons" style={{ fontSize: 17, lineHeight: 1.8, margin: -2.5 }}>
                                                                        {this.extractUUID(item.misp_event_uuid).length ? 'cloud_done' : 'cloud_upload'}
                                                                    </i>
                                                                </button>
                                                                <button onClick={() => this.displayEditModal(item)} className="btn btn-outline-warning btn-sm me-2" title="Edit">
                                                                    <i className="material-icons" style={{ fontSize: 17, lineHeight: 1.8, margin: -2.5 }}>edit</i>
                                                                </button>
                                                                <button
                                                                    className="btn btn-outline-secondary btn-sm"
                                                                    title="Timeline"
                                                                    onClick={() => this.setState({
                                                                        showTimelineModal: true,
                                                                        timelineId: item.technical_details.dns_twisted_id,
                                                                        timelineContentType: 'dns_finder.dnstwisted',
                                                                        timelineId2: item.id,
                                                                        timelineContentType2: 'dns_finder.alert',
                                                                        timelineLabel: item.domain_name
                                                                    })}
                                                                >
                                                                    <i className="material-icons" style={{ fontSize: 17, lineHeight: 1.8, margin: -2.5 }}>history</i>
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

                {this.editModal()}

                <ExportModal
                    show={this.state.showExportModal}
                    domain={this.state.exportDomain}
                    sourceData={this.state.exportSourceData}
                    alertId={this.state.selectedItem?.id}
                    alreadyMonitored={this.state.selectedItem ? this.isMonitored(this.state.selectedItem.domain_name) : false}
                    onClose={this.closeExportModal}
                    onMispExport={this.handleMispExport}
                    onLegitimateDomainExport={this.handleLegitimateDomainExport}
                    onWebsiteMonitoringExport={this.handleWebsiteMonitoringExport}
                    onDeleteRequest={this.handleDeleteRequest}
                    mode={this.state.exportMode}
                />

                <TimelineModal
                    show={showTimelineModal}
                    onHide={() => this.setState({ showTimelineModal: false, timelineId: null, timelineId2: null, timelineLabel: '' })}
                    contentType={timelineContentType}
                    objectId={timelineId}
                    contentType2={timelineContentType2}
                    objectId2={timelineId2}
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
    getThreatsMonitored, updateAlertStatus, exportToMISP, patchDnsTwisted,
    exportToLegitimateDomains, addSite, getSites
})(ThreatsMonitored);
