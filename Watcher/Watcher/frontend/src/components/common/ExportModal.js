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
            mispLoading: false,
            legitimateDomainLoading: false,
            eventUuid: "",
            showHelp: false,
            showAllUuid: false,
            showLegitimateHelp: false,
            showDeleteConfirmation: false,
            deleteConfirmationData: null
        };
    }

    componentDidUpdate(prevProps) {
        if (this.props.show && !prevProps.show && this.props.domain) {
            const { domain, mode } = this.props;
            
            this.setState({
                exportToMisp: false,
                exportToLegitimateDomain: false,
                mispLoading: false,
                legitimateDomainLoading: false,
                eventUuid: mode !== 'legitimate' ? this.extractUUID(domain.misp_event_uuid).at(-1) || '' : '',
                showHelp: false,
                showAllUuid: false,
                showLegitimateHelp: false
            });
        }
    }

    extractUUID = (raw) => {
        if (!raw) return [];
        if (Array.isArray(raw)) return raw.filter(uuid => uuid && uuid.trim() !== '');
        return raw.replace(/[\[\]'"\s]/g, '').split(',').filter(Boolean);
    };

    handleFieldChange = (field, value) => {
        this.setState({ [field]: value });
    };

    generateComment = () => {
        const { domain, mode, sourceData } = this.props;
        
        switch (mode) {
            case 'websiteMonitoring':
                const originalLegitimacy = LEGITIMACY_LABELS[domain.legitimacy]?.label || domain.legitimacy;
                return `Exported from Website Monitoring - Original legitimacy: ${originalLegitimacy}`;
            
            case 'dnsFinder':
                const parts = ['Exported from DNS Finder'];
                
                if (sourceData?.dns_monitored) {
                    parts.push(`Corporate DNS: ${sourceData.dns_monitored}`);
                } else if (sourceData?.keyword_monitored) {
                    parts.push(`Corporate Keyword: ${sourceData.keyword_monitored}`);
                }
                
                if (sourceData?.fuzzer) {
                    parts.push(`${sourceData.fuzzer} technique`);
                }
                
                return parts.join(' - ');
            
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
            const alertId = mode === 'dnsFinder' ? this.props.alertId : domain.id;
            
            this.setState({
                showDeleteConfirmation: true,
                deleteConfirmationData: {
                    domainName: domain.domain_name,
                    itemId: alertId,
                    mode: mode
                }
            });
        } else {
            this.props.onClose();
        }
    };

    handleDeleteConfirmation = (shouldDelete) => {
        const { deleteConfirmationData } = this.state;
        
        if (shouldDelete && this.props.onDeleteRequest) {
            this.props.onDeleteRequest(deleteConfirmationData.itemId, deleteConfirmationData.domainName);
        }
        
        this.setState({
            showDeleteConfirmation: false,
            deleteConfirmationData: null
        });
        
        this.props.onClose();
    };

    renderDeleteConfirmationModal = () => {
        const { showDeleteConfirmation, deleteConfirmationData } = this.state;
        
        if (!showDeleteConfirmation || !deleteConfirmationData) return null;

        const { mode, domainName } = deleteConfirmationData;
        
        const title = mode === 'websiteMonitoring' 
            ? 'Export Successful'
            : 'Export Successful';
        
        const message = mode === 'websiteMonitoring'
            ? `The domain ${domainName} has been successfully exported to Legitimate Domains. Would you like to remove it from Website Monitoring?`
            : `The alert for ${domainName} has been successfully exported to Legitimate Domains. Would you like to archive this alert?`;
        
        const noButtonText = mode === 'websiteMonitoring' 
            ? 'No, keep it'
            : 'No, keep it';
        
        const yesButtonText = mode === 'websiteMonitoring'
            ? 'Yes, delete'
            : 'Yes, archive';

        return (
            <Modal show={true} onHide={() => this.handleDeleteConfirmation(false)} centered>
                <Modal.Header closeButton>
                    <Modal.Title>{title}</Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    <p>
                        The domain <strong>{domainName}</strong> has been successfully exported to Legitimate Domains.
                    </p>
                    <p>
                        {mode === 'websiteMonitoring' 
                            ? 'Would you like to remove it from Website Monitoring?'
                            : 'Would you like to archive this alert?'}
                    </p>
                </Modal.Body>
                <Modal.Footer>
                    <Button variant="secondary" onClick={() => this.handleDeleteConfirmation(false)}>
                        {noButtonText}
                    </Button>
                    <Button 
                        variant={mode === 'websiteMonitoring' ? 'danger' : 'warning'} 
                        onClick={() => this.handleDeleteConfirmation(true)}
                    >
                        {yesButtonText}
                    </Button>
                </Modal.Footer>
            </Modal>
        );
    };

    renderMispModal = () => {
        const { domain, mode } = this.props;
        const { eventUuid, showHelp, showAllUuid, mispLoading } = this.state;

        const uuid = this.extractUUID(domain?.misp_event_uuid);
        const latestUuid = uuid.at(-1) || '';
        const isUpdate = Boolean(uuid.length) || Boolean(eventUuid.trim());

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
                                    {mode === 'dnsFinder' && <li>You will be prompted to archive the alert</li>}
                                    {mode === 'websiteMonitoring' && <li>You will be prompted to remove the domain from monitoring</li>}
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

                    {mode === 'dnsFinder' && sourceData && (
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

    render() {
        const { show, domain, onClose, mode } = this.props;
        const { exportToMisp, exportToLegitimateDomain, showDeleteConfirmation } = this.state;

        if (!show || !domain) return null;

        if (showDeleteConfirmation) {
            return this.renderDeleteConfirmationModal();
        }

        if (mode === 'legitimate') {
            return this.renderMispModal();
        }

        if (exportToMisp) {
            return this.renderMispModal();
        }

        if (exportToLegitimateDomain) {
            return this.renderLegitimateDomainModal();
        }

        if (mode === 'websiteMonitoring' || mode === 'dnsFinder') {
            const modalTitle = mode === 'websiteMonitoring' 
                ? 'Export domain'
                : 'Export alert';

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

                        <Form.Group as={Row} className="mb-0">
                            <Col sm="6">
                                <Button
                                    variant="outline-primary"
                                    className="w-100 d-flex align-items-center justify-content-center"
                                    style={{ height: '48px', fontWeight: '500', fontSize: '16px' }}
                                    onClick={e => { e.preventDefault(); this.handleFieldChange('exportToMisp', true); }}
                                >
                                    MISP Export
                                </Button>
                            </Col>
                            <Col sm="6">
                                <Button
                                    variant="outline-success"
                                    className="w-100 d-flex align-items-center justify-content-center"
                                    style={{ height: '48px', fontWeight: '500', fontSize: '16px' }}
                                    onClick={e => { e.preventDefault(); this.handleFieldChange('exportToLegitimateDomain', true); }}
                                >
                                    Legitimate Domains
                                </Button>
                            </Col>
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