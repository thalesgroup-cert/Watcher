import React, { Component } from 'react';
import { Modal, Button, Form, Row, Col } from 'react-bootstrap';
import { connect } from 'react-redux';

const LEGITIMACY_LABELS = {
    1: { label: "Unknown", color: "#6c757d", textColor: "#000" },
    2: { label: "Suspicious, not harmful", color: "#ffc107", textColor: "#000" },
    3: { label: "Suspicious, likely harmful (registered)", color: "#fd7e14", textColor: "#000" },
    4: { label: "Suspicious, likely harmful (available/disabled)", color: "#fd7e14", textColor: "#000" },
    5: { label: "Malicious (registered)", color: "#dc3545", textColor: "#000" },
    6: { label: "Malicious (available/disabled)", color: "#dc3545", textColor: "#000" },
};

class ExportModal extends Component {
    constructor(props) {
        super(props);
        this.state = {
            exportToMisp: false,
            exportToLegitimateDomain: false,
            exportToWebsiteMonitoring: false,
            mispLoading: false,
            legitimateDomainLoading: false,
            websiteMonitoringLoading: false,
            eventUuid: "",
            showHelp: false,
            showAllUuid: false,
            showLegitimateHelp: false,
            showWebsiteMonitoringHelp: false,
            ticketId: "",
            legitimacy: 2,
            ipMonitoring: true,
            contentMonitoring: true,
            mailMonitoring: true,
            takedownRequest: false,
            legalTeam: false,
            blockingRequest: false
        };
    }

    componentDidUpdate(prevProps) {
        if (this.props.show && !prevProps.show && this.props.domain) {
            const { domain, mode } = this.props;
            
            this.setState({
                exportToMisp: false,
                exportToLegitimateDomain: false,
                exportToWebsiteMonitoring: false,
                mispLoading: false,
                legitimateDomainLoading: false,
                websiteMonitoringLoading: false,
                eventUuid: mode !== 'legitimate' ? this.extractUUID(domain.misp_event_uuid).at(-1) || '' : '',
                showHelp: false,
                showAllUuid: false,
                showLegitimateHelp: false,
                showWebsiteMonitoringHelp: false,
                ticketId: "",
                legitimacy: 2,
                ipMonitoring: true,
                contentMonitoring: true,
                mailMonitoring: true,
                takedownRequest: false,
                legalTeam: false,
                blockingRequest: false
            });
        }
    }

    extractUUID = (raw) => {
        if (!raw) return [];
        if (Array.isArray(raw)) {return raw.map(item => String(item)).filter(uuid => uuid && uuid.trim() !== '');}

        if (typeof raw === 'string') {
            return raw.replace(/[\[\]'"\s]/g, '').split(',').filter(Boolean);
        };

        return [];
    };

    handleFieldChange = (field, value) => {
        this.setState({ [field]: value });
    };

    generateComment = () => {
        const { domain, mode, sourceData } = this.props;
        
        switch (mode) {
            case 'websiteMonitoring': {
                    const originalLegitimacy = LEGITIMACY_LABELS[domain?.legitimacy]?.label || domain?.legitimacy;
                if (originalLegitimacy) {
                    return `Exported from Website Monitoring - Original legitimacy: ${originalLegitimacy}`;
                }
                return `Exported from Website Monitoring`;
            }
            
            case 'dnsFinder':
            case 'subdomainTakeover': {
                const parts = ['Exported from DNS Threats Monitored'];

                if (sourceData?.dns_monitored) {
                    parts.push(`Corporate DNS: ${sourceData.dns_monitored}`);
                } else if (sourceData?.keyword_monitored) {
                    parts.push(`Corporate Keyword: ${sourceData.keyword_monitored}`);
                }

                if (sourceData?.fuzzer) {
                    parts.push(`${sourceData.fuzzer} technique`);
                }

                if (sourceData?.comments) {
                    parts.push(sourceData.comments);
                }

                return parts.join(' - ');
            }
            
            case 'legitimate':
            default:
                return `Domain added to Legitimate Domains`;
        }
    };

    handleMispExportSuccess = () => {
        this.props.onClose();
    };

    handleLegitimateDomainExportSuccess = () => {
        const { mode, domain } = this.props;
        
        if (mode === 'websiteMonitoring' || mode === 'dnsFinder') {
            const itemId = mode === 'dnsFinder' ? this.props.alertId : domain.id;
            if (this.props.onDeleteRequest) {
                try {
                    this.props.onDeleteRequest(itemId, domain.domain_name);
                } catch (e) {
                    console.error('onDeleteRequest failed:', e);
                }
            }
            this.props.onClose();
        } else {
            this.props.onClose();
        }
    };

    renderMispModal = () => {
        const { domain, mode } = this.props;
        const { eventUuid, showHelp, showAllUuid, mispLoading } = this.state;

        const uuid = this.extractUUID(domain?.misp_event_uuid);
        const latestUuid = uuid.at(-1) || '';
        const isUpdate = Boolean(uuid.length) || (typeof eventUuid === 'string' && Boolean(eventUuid.trim()));

        return (
            <Modal show={true} onHide={this.props.onClose} size="lg" centered>
                <Modal.Header closeButton>
                    <Modal.Title>
                        <img
                            src="/static/img/misp_logo.png"
                            alt="MISP Logo"
                            className="me-2"
                            style={{ width: '32px', height: '32px', objectFit: 'cover', verticalAlign: 'middle' }}
                        />
                        Export <strong>{domain.domain_name}</strong> to MISP
                    </Modal.Title>
                </Modal.Header>

                <Modal.Body className="px-4">
                    <div className="mb-4">
                        <div
                            className="d-flex align-items-center"
                            onClick={() => this.setState(prev => ({ showHelp: !prev.showHelp }))}
                            style={{ cursor: 'pointer' }}
                        >
                            <i className="material-icons text-primary me-2">
                                {showHelp ? 'expand_less' : 'expand_more'}
                            </i>
                            <span className="text-muted">Need help with MISP export?</span>
                        </div>

                        {showHelp && (
                            <div className="mt-3 ps-4 border-start border-primary">
                                <ul className="mb-0 ps-3 text-muted">
                                    {!isUpdate ? (
                                        <>
                                            <li>To create a new MISP event: leave the Event UUID field empty</li>
                                            <li>To update an existing event: provide its Event UUID</li>
                                        </>
                                    ) : (
                                        <>
                                            <li>The latest event will automatically be updated if no new Event UUID is provided</li>
                                            <li>To update a different event: provide its Event UUID</li>
                                        </>
                                    )}
                                </ul>
                            </div>
                        )}
                    </div>

                    <Form.Group className="mb-3">
                        <Form.Label className="d-flex align-items-center">
                            <strong>MISP Event UUID</strong>
                            <span style={{ display: 'inline-block', width: '10px' }}></span>
                            <span className={`ms-2 badge ${isUpdate ? 'bg-success' : 'bg-primary'}`}>
                                {isUpdate ? 'Update' : 'Create'}
                            </span>
                        </Form.Label>
                        <Form.Control
                            type="text"
                            placeholder="Enter MISP event UUID to update an existing event"
                            value={eventUuid}
                            onChange={(e) => {
                                const value = e.target.value.replace(/[\[\]'"\s]/g, '');
                                if (/^[a-f0-9-]*$/.test(value)) this.setState({ eventUuid: value });
                            }}
                            pattern="^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$"
                        />
                    </Form.Group>

                    {uuid.length > 0 && (
                        <div className="mb-3">
                            <label className="form-label fw-bold">Event UUID History:</label>
                            <div className="list-group">
                                {uuid
                                    .slice()
                                    .reverse()
                                    .slice(0, showAllUuid ? uuid.length : 2)
                                    .map((uuid, index) => (
                                        <div
                                            key={index}
                                            className="list-group-item d-flex justify-content-between align-items-center"
                                        >
                                            <span className="font-monospace">{uuid}</span>
                                            {index === 0 && <span className="badge bg-secondary">Latest</span>}
                                        </div>
                                    ))}

                                {uuid.length > 2 && (
                                    <div
                                        className="list-group-item text-center text-primary"
                                        onClick={() => this.setState(prev => ({ showAllUuid: !prev.showAllUuid }))}
                                        style={{ cursor: 'pointer' }}
                                    >
                                        <i className="material-icons align-middle me-1">
                                            {showAllUuid ? 'remove_circle_outline' : 'add_circle_outline'}
                                        </i>
                                        {showAllUuid ? 'Show Less' : `Show ${uuid.length - 2} More`}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </Modal.Body>

                <Modal.Footer>
                    <Button variant="outline-secondary" onClick={this.props.onClose}>
                        Close
                    </Button>
                    <Button
                        variant={isUpdate ? 'success' : 'primary'}
                        onClick={async () => {
                            this.setState({ mispLoading: true });
                            try {
                                await this.props.onMispExport({
                                    id: domain.id,
                                    event_uuid: eventUuid.trim() || (isUpdate ? latestUuid : '')
                                });
                                this.handleMispExportSuccess();
                            } catch (err) {
                                console.error('MISP export failed:', err);
                                this.setState({ mispLoading: false });
                            }
                        }}
                        disabled={mispLoading}
                    >
                        {mispLoading ? (
                            <>
                                <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                                Exporting...
                            </>
                        ) : isUpdate ? (
                            'Update MISP Event'
                        ) : (
                            'Create MISP Event'
                        )}
                    </Button>
                </Modal.Footer>
            </Modal>
        );
    };

    renderLegitimateDomainModal = () => {
        const { domain, mode, sourceData } = this.props;
        const { legitimateDomainLoading, showLegitimateHelp } = this.state;
    
        const comment = this.generateComment();
        
        return (
            <Modal show={true} onHide={this.props.onClose} size="lg" centered>
                <Modal.Header closeButton>
                    <Modal.Title>
                        Export <strong>{domain.domain_name}</strong> to Legitimate Domains
                    </Modal.Title>
                </Modal.Header>
    
                <Modal.Body className="px-4">
                    <div className="mb-4">
                        <div
                            className="d-flex align-items-center"
                            onClick={() => this.setState(prev => ({ showLegitimateHelp: !prev.showLegitimateHelp }))}
                            style={{ cursor: 'pointer' }}
                        >
                            <i className="material-icons text-primary me-2">
                                {showLegitimateHelp ? 'expand_less' : 'expand_more'}
                            </i>
                            <span className="text-muted">Need help with Legitimate Domains export?</span>
                        </div>
    
                        {showLegitimateHelp && (
                            <div className="mt-3 ps-4 border-start border-primary">
                                <ul className="mb-0 ps-3 text-muted">
                                    <li>The domain will be added to Legitimate Domains</li>
                                    <li>All metadata will be preserved</li>
                                    <li>A comment indicating the source will be added automatically</li>
                                    {mode === 'dnsFinder' && <li>The alert will be archived automatically after export</li>}
                                    {mode === 'websiteMonitoring' && <li>The domain will be removed from monitoring automatically after export</li>}
                                </ul>
                            </div>
                        )}
                    </div>
    
                    {mode === 'websiteMonitoring' && (
                        <div className="row mb-2">
                            <div className="col-md-6 mb-3">
                                <h6 className="text-muted mb-2" style={{ fontSize: 15 }}>
                                    <i className="material-icons align-middle me-1" style={{ fontSize: 16, verticalAlign: 'middle' }}>info</i>
                                    Current Information
                                </h6>
                                <div style={{ fontSize: 14 }}>
                                    <div className="mb-2">
                                        <strong>Expiry Date:</strong>{' '}
                                        {domain.domain_expiry ? new Date(domain.domain_expiry).toLocaleDateString() : '-'}
                                    </div>
                                    <div className="mb-2">
                                        <strong>Status:</strong>{' '}
                                        <span
                                            className="badge"
                                            style={{
                                                fontSize: 12,
                                                backgroundColor: LEGITIMACY_LABELS[domain.legitimacy]?.color || '#6c757d',
                                                color: LEGITIMACY_LABELS[domain.legitimacy]?.textColor || '#000',
                                            }}
                                        >
                                            {LEGITIMACY_LABELS[domain.legitimacy]?.label || 'Unknown'}
                                        </span>
                                    </div>
                                </div>
                            </div>
        
                            <div className="col-md-6 mb-3">
                                <h6 className="text-muted mb-2" style={{ fontSize: 15 }}>
                                    <i className="material-icons align-middle me-1" style={{ fontSize: 16, verticalAlign: 'middle' }}>trending_flat</i>
                                    After Export
                                </h6>
                                <div style={{ fontSize: 14 }}>
                                    <div className="mb-2">
                                        <strong>Expiry Date:</strong>{' '}
                                        {domain.domain_expiry ? new Date(domain.domain_expiry).toLocaleDateString() : 'Preserved'}
                                    </div>
                                    <div className="mb-2">
                                        <strong>Status:</strong>{' '}
                                        <span className="badge bg-success" style={{ fontSize: 12, color: "#000" }}>
                                            Legitimate
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {(mode === 'dnsFinder' || mode === 'subdomainTakeover') && sourceData && (
                        <div className="row mb-3">
                            <div className="col-12">
                                <h6 className="text-muted mb-2" style={{ fontSize: 15 }}>
                                    <i className="material-icons align-middle me-1" style={{ fontSize: 16, verticalAlign: 'middle' }}>info</i>
                                    Detection Information
                                </h6>
                                <div style={{ fontSize: 14 }}>
                                    {sourceData.dns_monitored && (
                                        <div className="mb-2">
                                            <strong>Corporate DNS:</strong> {sourceData.dns_monitored}
                                        </div>
                                    )}
                                    {sourceData.keyword_monitored && (
                                        <div className="mb-2">
                                            <strong>Corporate Keyword:</strong> {sourceData.keyword_monitored}
                                        </div>
                                    )}
                                    {sourceData.fuzzer && (
                                        <div className="mb-2">
                                            <strong>Detection Technique:</strong> {sourceData.fuzzer}
                                        </div>
                                    )}
                                    {sourceData.comments && (
                                        <div className="mb-2">
                                            <strong>Comments:</strong> {sourceData.comments}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
    
                    <div className="mt-3 ps-4 border-start border-success text-muted">
                        <strong>Comment to be added:</strong>
                        <div className="mt-2">
                            <em>"{comment}"</em>
                        </div>
                    </div>
                </Modal.Body>
    
                <Modal.Footer>
                    <Button variant="outline-secondary" onClick={this.props.onClose}>
                        Close
                    </Button>
                    <Button
                        variant="success"
                        onClick={async () => {
                            this.setState({ legitimateDomainLoading: true });
                            try {
                                await this.props.onLegitimateDomainExport({
                                    domain_name: domain.domain_name,
                                    comment: comment
                                });
                                this.handleLegitimateDomainExportSuccess();
                            } catch (err) {
                                console.error('Export to Legitimate Domains failed:', err);
                                this.setState({ legitimateDomainLoading: false });
                            }
                        }}
                        disabled={legitimateDomainLoading}
                    >
                        {legitimateDomainLoading ? (
                            <>
                                <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                                Exporting...
                            </>
                        ) : (
                            'Export to Legitimate Domains'
                        )}
                    </Button>
                </Modal.Footer>
            </Modal>
        );
    };

    renderWebsiteMonitoringModal = () => {
        const { domain } = this.props;
        const {
            websiteMonitoringLoading, showWebsiteMonitoringHelp, ticketId, legitimacy,
            ipMonitoring, contentMonitoring, mailMonitoring,
            takedownRequest, legalTeam, blockingRequest
        } = this.state;

        return (
            <Modal show={true} onHide={this.props.onClose} size="lg" centered>
                <Modal.Header closeButton>
                    <Modal.Title>
                        Export <strong>{domain.domain_name}</strong> to Website Monitoring
                    </Modal.Title>
                </Modal.Header>

                <Modal.Body className="px-4">
                    <div className="mb-4">
                        <div
                            className="d-flex align-items-center"
                            onClick={() => this.setState(prev => ({ showWebsiteMonitoringHelp: !prev.showWebsiteMonitoringHelp }))}
                            style={{ cursor: 'pointer' }}
                        >
                            <i className="material-icons text-primary me-2">
                                {showWebsiteMonitoringHelp ? 'expand_less' : 'expand_more'}
                            </i>
                            <span className="text-muted">Need help with Website Monitoring export?</span>
                        </div>

                        {showWebsiteMonitoringHelp && (
                            <div className="mt-3 ps-4 border-start border-primary">
                                <ul className="mb-0 ps-3 text-muted">
                                    <li>The domain will be added to Website Monitoring</li>
                                    <li>Toggle which checks to run: IP, web content and/or mail (MX) monitoring</li>
                                    <li>An optional ticket ID can be attached for tracking</li>
                                    <li>Legitimacy, takedown, legal and blocking status can be set right away</li>
                                </ul>
                            </div>
                        )}
                    </div>

                    <Form.Group className="mb-3">
                        <Form.Label><strong>Ticket ID</strong></Form.Label>
                        <Form.Control
                            type="text"
                            placeholder="230509-200a2"
                            pattern="^[a-zA-Z0-9]+(-[a-zA-Z0-9]+)*(\.[a-zA-Z0-9]+(-[a-zA-Z0-9]+)*)*$"
                            value={ticketId}
                            onChange={e => this.handleFieldChange('ticketId', e.target.value)}
                        />
                    </Form.Group>

                    <Form.Group className="mb-3">
                        <Form.Label><strong>Legitimacy</strong></Form.Label>
                        <Form.Control
                            as="select"
                            value={legitimacy}
                            onChange={e => this.handleFieldChange('legitimacy', parseInt(e.target.value, 10))}
                        >
                            {Object.entries(LEGITIMACY_LABELS).map(([value, label]) => (
                                <option key={value} value={value}>{label.label}</option>
                            ))}
                        </Form.Control>
                    </Form.Group>

                    <Row>
                        <Col md={6}>
                            <Form.Group className="mb-3">
                                <Form.Check
                                    type="switch"
                                    id="export-ip-monitoring"
                                    label="IP Monitoring"
                                    checked={ipMonitoring}
                                    onChange={e => this.handleFieldChange('ipMonitoring', e.target.checked)}
                                />
                                <Form.Text className="text-muted">
                                    Monitor IP address changes
                                </Form.Text>
                            </Form.Group>

                            <Form.Group className="mb-3">
                                <Form.Check
                                    type="switch"
                                    id="export-content-monitoring"
                                    label="Web Content Monitoring"
                                    checked={contentMonitoring}
                                    onChange={e => this.handleFieldChange('contentMonitoring', e.target.checked)}
                                />
                                <Form.Text className="text-muted">
                                    Monitor website content changes
                                </Form.Text>
                            </Form.Group>

                            <Form.Group className="mb-3">
                                <Form.Check
                                    type="switch"
                                    id="export-email-monitoring"
                                    label="Email Monitoring"
                                    checked={mailMonitoring}
                                    onChange={e => this.handleFieldChange('mailMonitoring', e.target.checked)}
                                />
                                <Form.Text className="text-muted">
                                    Monitor MX records and mail servers
                                </Form.Text>
                            </Form.Group>
                        </Col>

                        <Col md={6}>
                            <div className="ps-md-3">
                                <Form.Group className="mb-3">
                                    <Form.Check
                                        type="switch"
                                        id="export-takedown-request"
                                        label="Takedown Request"
                                        checked={takedownRequest}
                                        onChange={e => this.handleFieldChange('takedownRequest', e.target.checked)}
                                    />
                                    <Form.Text className="text-muted">
                                        Takedown request submitted
                                    </Form.Text>
                                </Form.Group>

                                <Form.Group className="mb-3">
                                    <Form.Check
                                        type="switch"
                                        id="export-legal-team"
                                        label="Legal Team"
                                        checked={legalTeam}
                                        onChange={e => this.handleFieldChange('legalTeam', e.target.checked)}
                                    />
                                    <Form.Text className="text-muted">
                                        Legal team involvement
                                    </Form.Text>
                                </Form.Group>

                                <Form.Group className="mb-3">
                                    <Form.Check
                                        type="switch"
                                        id="export-blocking-request"
                                        label="Blocking Request"
                                        checked={blockingRequest}
                                        onChange={e => this.handleFieldChange('blockingRequest', e.target.checked)}
                                    />
                                    <Form.Text className="text-muted">
                                        Domain blocking requested
                                    </Form.Text>
                                </Form.Group>
                            </div>
                        </Col>
                    </Row>
                </Modal.Body>

                <Modal.Footer>
                    <Button variant="outline-secondary" onClick={this.props.onClose}>
                        Close
                    </Button>
                    <Button
                        variant="success"
                        onClick={async () => {
                            this.setState({ websiteMonitoringLoading: true });
                            try {
                                await this.props.onWebsiteMonitoringExport({
                                    domain_name: domain.domain_name,
                                    ticket_id: ticketId,
                                    legitimacy: legitimacy,
                                    ip_monitoring: ipMonitoring,
                                    content_monitoring: contentMonitoring,
                                    mail_monitoring: mailMonitoring,
                                    takedown_request: takedownRequest,
                                    legal_team: legalTeam,
                                    blocking_request: blockingRequest
                                });
                                this.props.onClose();
                            } catch (err) {
                                console.error('Export to Website Monitoring failed:', err);
                                this.setState({ websiteMonitoringLoading: false });
                            }
                        }}
                        disabled={websiteMonitoringLoading}
                    >
                        {websiteMonitoringLoading ? (
                            <>
                                <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                                Exporting...
                            </>
                        ) : (
                            'Export to Website Monitoring'
                        )}
                    </Button>
                </Modal.Footer>
            </Modal>
        );
    };

    render() {
        const { show, domain, onClose, mode, alreadyMonitored } = this.props;
        const { exportToMisp, exportToLegitimateDomain, exportToWebsiteMonitoring } = this.state;

        if (!show || !domain) return null;

        if (mode === 'legitimate') {
            return this.renderMispModal();
        }

        if (exportToMisp) {
            return this.renderMispModal();
        }

        if (exportToLegitimateDomain) {
            return this.renderLegitimateDomainModal();
        }

        if (exportToWebsiteMonitoring) {
            return this.renderWebsiteMonitoringModal();
        }

        if (mode === 'websiteMonitoring' || mode === 'dnsFinder' || mode === 'subdomainTakeover') {
            const modalTitle = mode === 'websiteMonitoring'
                ? 'Export domain'
                : 'Export alert';
            const showLegitimateDomains = mode !== 'subdomainTakeover';
            const showWebsiteMonitoring = mode === 'dnsFinder' || mode === 'subdomainTakeover';
            const secondRowCount = (showLegitimateDomains ? 1 : 0) + (showWebsiteMonitoring ? 1 : 0);
            const secondRowColWidth = String(12 / secondRowCount);

            return (
                <Modal show={show} onHide={onClose} centered>
                    <Modal.Header closeButton>
                        <Modal.Title>
                            {modalTitle} <strong>{domain.domain_name}</strong>
                        </Modal.Title>
                    </Modal.Header>
                    <Modal.Body>
                        <div className="text-center mb-4">
                            <p className="text-muted">Choose your export destination:</p>
                        </div>

                        <div className="text-muted small text-uppercase fw-bold mb-1" style={{ letterSpacing: '0.05em' }}>
                            External
                        </div>
                        <Form.Group as={Row} className="mb-3">
                            <Col sm="12">
                                <Button
                                    variant="outline-primary"
                                    className="w-100 d-flex align-items-center justify-content-center"
                                    style={{ height: '48px', fontWeight: '500', fontSize: '16px' }}
                                    onClick={e => { e.preventDefault(); this.handleFieldChange('exportToMisp', true); }}
                                >
                                    MISP Export
                                </Button>
                            </Col>
                        </Form.Group>

                        <div className="text-muted small text-uppercase fw-bold mb-1" style={{ letterSpacing: '0.05em' }}>
                            Internal
                        </div>
                        <Form.Group as={Row} className="mb-0">
                            {showLegitimateDomains && (
                                <Col sm={secondRowColWidth}>
                                    <Button
                                        variant="outline-success"
                                        className="w-100 d-flex align-items-center justify-content-center"
                                        style={{ height: '48px', fontWeight: '500', fontSize: '16px' }}
                                        onClick={e => { e.preventDefault(); this.handleFieldChange('exportToLegitimateDomain', true); }}
                                    >
                                        Legitimate Domains
                                    </Button>
                                </Col>
                            )}
                            {showWebsiteMonitoring && (
                                <Col sm={secondRowColWidth}>
                                    <Button
                                        variant="outline-warning"
                                        className="w-100 d-flex flex-column align-items-center justify-content-center"
                                        style={{ height: '48px', fontWeight: '500', fontSize: '16px' }}
                                        onClick={e => { e.preventDefault(); this.handleFieldChange('exportToWebsiteMonitoring', true); }}
                                        disabled={alreadyMonitored}
                                        title={alreadyMonitored ? `${domain.domain_name} is already monitored` : undefined}
                                    >
                                        Website Monitoring
                                        {alreadyMonitored && <small style={{ fontSize: '11px', fontWeight: 400 }}>Already monitored</small>}
                                    </Button>
                                </Col>
                            )}
                        </Form.Group>
                    </Modal.Body>
                </Modal>
            );
        }

        return null;
    }
}

const mapStateToProps = state => ({});

export default connect(mapStateToProps, {})(ExportModal);