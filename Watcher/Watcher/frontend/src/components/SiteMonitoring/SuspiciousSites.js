import React, { Component, Fragment, createRef } from 'react';
import { connect } from 'react-redux';
import PropTypes from 'prop-types';
import { getSites, deleteSite, addSite, patchSite, exportToMISP, getSiteStatistics } from "../../actions/SiteMonitoring";
import { exportToLegitimateDomains } from '../../actions/Common';
import { Button, Modal, Container, Row, Col, Form } from 'react-bootstrap';
import DayPickerInput from 'react-day-picker/DayPickerInput';
import TableManager from '../common/TableManager';
import Alerts from './Alerts';
import ExportModal from '../common/ExportModal';

const formatDate = (date) => {
    return date.toLocaleDateString('fr-FR', {
        day: '2-digit',
        month: '2-digit', 
        year: 'numeric'
    });
};

const parseDate = (str) => {
    const parsed = Date.parse(str);
    if (isNaN(parsed)) return undefined;
    return new Date(parsed);
};

const LEGITIMACY_LABELS = {
    1: { label: "Unknown", color: "#6c757d", textColor: "#000" },
    2: { label: "Suspicious, not harmful", color: "#ffc107", textColor: "#000" },
    3: { label: "Suspicious, likely harmful (registered)", color: "#fd7e14", textColor: "#000" },
    4: { label: "Suspicious, likely harmful (available/disabled)", color: "#fd7e14", textColor: "#000" },
    5: { label: "Malicious (registered)", color: "#dc3545", textColor: "#000" },
    6: { label: "Malicious (available/disabled)", color: "#dc3545", textColor: "#000" },
};

export class SuspiciousSites extends Component {
    constructor(props) {
        super(props);
        this.state = {
            showDeleteModal: false,
            showEditModal: false,
            showAddModal: false,
            showExportModal: false,
            showDetailsModal: false,
            id: 0,
            domainName: "",
            ticketId: "",
            registrar: "",
            legitimacy: 2,
            rtir: "",
            expiry: null,
            domainExpiry: null,
            ipMonitoring: null,
            webContentMonitoring: null,
            emailMonitoring: null,
            takedownRequest: false,
            legalTeam: false,
            blockingRequest: false,
            selectedSite: null,
            addLoading: false,
            showAlerts: false,
            selectedSiteForAlerts: null,
            filteredSites: [],
            isLoading: true
        };

        this.inputDomainRef = createRef();
        this.inputTicketRef = createRef();
        this.inputRegistrarRef = createRef();
        this.inputLegitimacyRef = createRef();
        this.inputRtirRef = createRef();
        this.ipMonitoringRef = createRef();
        this.webContentMonitoringRef = createRef();
        this.emailMonitoringRef = createRef();
        this.takedownRequestRef = createRef();
        this.legalTeamRef = createRef();
        this.blockingRequestRef = createRef();
    }

    static propTypes = {
        sites: PropTypes.array.isRequired,
        getSites: PropTypes.func.isRequired,
        deleteSite: PropTypes.func.isRequired,
        addSite: PropTypes.func.isRequired,
        patchSite: PropTypes.func.isRequired,
        exportToMISP: PropTypes.func.isRequired,
        getSiteStatistics: PropTypes.func.isRequired,
        auth: PropTypes.object.isRequired,
        error: PropTypes.object.isRequired,
        globalFilters: PropTypes.object,
        filteredData: PropTypes.array,
        onDataFiltered: PropTypes.func
    };

    componentDidMount() {
        this.props.getSites();
    }

    componentDidUpdate(prevProps) {
        const { sites, error } = this.props;
    
        if (sites !== prevProps.sites) {
            this.setState({ 
                addLoading: false,
                isLoading: false 
            });
        }
    
        if (error !== prevProps.error && error.status !== null) {
            this.setState({ 
                addLoading: false,
                isLoading: false 
            });
        }
    }

    extractUUID = (raw) => {
        if (!raw) return [];
        if (Array.isArray(raw)) return raw.filter(uuid => uuid && uuid.trim() !== '');
        return raw.replace(/[\[\]'"\s]/g, '').split(',').filter(Boolean);
    };

    customFilters = (filtered, filters) => {
        const activeFilters = this.props.globalFilters || filters;
        
        if (activeFilters.search) {
            const searchTerm = activeFilters.search.toLowerCase();
            filtered = filtered.filter(site =>
                (site.domain_name || '').toLowerCase().includes(searchTerm) ||
                (site.ticket_id || '').toLowerCase().includes(searchTerm) ||
                (site.registrar || '').toLowerCase().includes(searchTerm) ||
                (site.rtir || '').toString().includes(searchTerm)
            );
        }

        if (activeFilters.legitimacy) {
            filtered = filtered.filter(site => 
                String(site.legitimacy) === activeFilters.legitimacy
            );
        }

        if (activeFilters.expiry_status) {
            const now = new Date();
            const soon = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
            filtered = filtered.filter(d => {
                if (!d.domain_expiry) return activeFilters.expiry_status === 'no_date';
                const exp = new Date(d.domain_expiry);
                switch (activeFilters.expiry_status) {
                    case 'expired': return exp < now;
                    case 'expiring_soon': return exp >= now && exp <= soon;
                    case 'valid': return exp > soon;
                    case 'no_date': return false;
                    default: return true;
                }
            });
        }

        if (activeFilters.takedown) {
            if (activeFilters.takedown === 'yes') {
                filtered = filtered.filter(site => !!site.takedown_request);
            } else if (activeFilters.takedown === 'no') {
                filtered = filtered.filter(site => !site.takedown_request);
            }
        }

        if (activeFilters.legal) {
            if (activeFilters.legal === 'yes') {
                filtered = filtered.filter(site => !!site.legal_team);
            } else if (activeFilters.legal === 'no') {
                filtered = filtered.filter(site => !site.legal_team);
            }
        }

        if (activeFilters.blocking) {
            if (activeFilters.blocking === 'yes') {
                filtered = filtered.filter(site => !!site.blocking_request);
            } else if (activeFilters.blocking === 'no') {
                filtered = filtered.filter(site => !site.blocking_request);
            }
        }

        return filtered;
    };

    getStatusBadges = (site) => {
        const monitoredBadge = (
            <span
                className={`badge me-1 ${site.monitored ? 'bg-success text-white' : 'bg-secondary text-white'}`}
                style={{ fontSize: '12px' }}
                title={site.monitored ? 'Actively monitored' : 'Monitoring pending'}
            >
                <i className="material-icons" style={{ fontSize: '12px', marginRight: '4px' }}>
                    {site.monitored ? 'visibility' : 'visibility_off'}
                </i>
                {site.monitored ? 'Active' : 'Pending'}
            </span>
        );
    
        const getWebStatusBadge = () => {
            if (site.web_status === 200) {
                return (
                    <span className="badge bg-success text-white" style={{ fontSize: '12px' }} title="Website is online">
                        <i className="material-icons" style={{ fontSize: '12px', marginRight: '4px' }}>cloud_done</i>
                        Online
                    </span>
                );
            } else if (site.web_status && site.web_status !== 200) {
                return (
                    <span className="badge bg-warning text-dark" style={{ fontSize: '12px' }} title={`HTTP status: ${site.web_status}`}>
                        <i className="material-icons" style={{ fontSize: '12px', marginRight: '4px' }}>warning</i>
                        {site.web_status}
                    </span>
                );
            } else {
                return (
                    <span className="badge bg-danger text-white" style={{ fontSize: '12px' }} title="Website is unreachable">
                        <i className="material-icons" style={{ fontSize: '12px', marginRight: '4px' }}>cloud_off</i>
                        Offline
                    </span>
                );
            }
        };
    
        return (
            <div style={{ marginTop: '4px' }}>
                {monitoredBadge}
                {getWebStatusBadge()}
            </div>
        );
    };

    getTotalAlerts = (site) => {
        const { alerts } = this.props;
        if (!site || !Array.isArray(alerts)) return 0;
        return alerts.filter(alert => alert.site?.domain_name === site.domain_name).length;
    };

    getDomainExpiryBadge = (site) => {
        if (!site.domain_expiry) return null;
    
        const now = new Date();
        const expiryDate = new Date(site.domain_expiry);
        const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    
        let badge = null;
    
        if (expiryDate < now) {
            badge = (
                <span 
                    className="badge bg-sm bg-danger" 
                    style={{ fontSize: '12px' }}
                    title={`Domain expired on ${expiryDate.toLocaleDateString()}`}
                >
                    Expired
                </span>
            );
        } else if (expiryDate <= thirtyDaysFromNow) {
            badge = (
                <span 
                    className="badge bg-sm bg-warning" 
                    style={{ fontSize: '12px' }}
                    title={`Domain expires soon (${expiryDate.toLocaleDateString()})`}
                >
                    Expiring Soon
                </span>
            );
        } else {
            badge = (
                <span 
                    className="badge bg-sm bg-success" 
                    style={{ fontSize: '12px' }}
                    title={`Domain valid until ${expiryDate.toLocaleDateString()}`}
                >
                    Valid
                </span>
            );
        }
    
        return (
            <div style={{ marginTop: '4px' }}>
                {badge}
            </div>
        );
    };

    displayDetailsModal = (site) => {
        this.setState({
            showDetailsModal: true,
            selectedSite: site
        });
    };

    displayDeleteModal = (id, domainName) => {
        this.setState({
            showDeleteModal: true,
            id: id,
            domainName: domainName
        });
    };

    displayExportModal = (site) => {
        this.setState({
            showExportModal: true,
            selectedSite: site
        });
    };

    closeExportModal = () => {
        this.setState({
            showExportModal: false,
            selectedSite: null
        });
    };

    handleMispExport = async (exportData) => {
        return this.props.exportToMISP(exportData);
    };

    handleLegitimateDomainExport = async ({ domain_name, comment }) => {
        try {
            const site = this.state.selectedSite;
            await this.props.exportToLegitimateDomains(site, comment);
            return { success: true };
        } catch (err) {
            console.error('Export to Legitimate Domains failed:', err);
            throw err;
        }
    };

    handleDeleteRequest = (siteId, domainName) => {
        this.props.deleteSite(siteId, domainName);
        this.props.getSites();
    };

    detailsModal = () => {
        const handleClose = () => this.setState({ showDetailsModal: false, selectedSite: null });
        const site = this.state.selectedSite;

        if (!site) return null;

        const formatMXRecords = (mxRecords) => {
            if (!mxRecords) return "-";
            
            if (Array.isArray(mxRecords)) {
                return mxRecords.length > 0 ? mxRecords.join(', ') : "-";
            }
            
            if (typeof mxRecords === 'string') {
                try {
                    const parsed = JSON.parse(mxRecords);
                    if (Array.isArray(parsed)) {
                        return parsed.length > 0 ? parsed.join(', ') : "-";
                    }
                    return mxRecords; 
                } catch (e) {
                    return mxRecords;
                }
            }
            
            return "-";
        };

        return (
            <Modal show={this.state.showDetailsModal} onHide={handleClose} centered>
                <Modal.Header closeButton>
                    <Modal.Title>Technical details for <b>{site.domain_name}</b></Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    <Container>
                        <Row className="show-grid">
                            <Col md={12}>
                            <Form.Group as={Row}>
                                <Form.Label column sm="4">Primary IP</Form.Label>
                                <Col sm="8" className="mt-2">
                                    {site.ip || "-"}
                                </Col>
                                <Form.Label column sm="4">Secondary IP</Form.Label>
                                <Col sm="8" className="mt-2">
                                    {site.ip_second || "-"}
                                </Col>
                                <Form.Label column sm="4">MX Records</Form.Label>
                                <Col sm="8" className="mt-2">
                                    {formatMXRecords(site.MX_records)}
                                </Col>
                                <Form.Label column sm="4">Mail Server IP</Form.Label>
                                <Col sm="8" className="mt-2">
                                    {site.mail_A_record_ip || "-"}
                                </Col>
                            </Form.Group>
                                <Col md={{span: 3, offset: 10}}>
                                    <Button variant="secondary" onClick={handleClose}>
                                        Close
                                    </Button>
                                </Col>
                            </Col>
                        </Row>
                    </Container>
                </Modal.Body>
            </Modal>
        );
    };

    deleteModal = () => {
        const handleClose = () => this.setState({ showDeleteModal: false });

        const onSubmit = e => {
            e.preventDefault();
            this.props.deleteSite(this.state.id, this.state.domainName);
            setTimeout(() => this.props.getSiteStatistics(), 500);
            handleClose();
        };

        return (
            <Modal show={this.state.showDeleteModal} onHide={handleClose} centered>
                <Modal.Header closeButton>
                    <Modal.Title>Action Requested</Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    Are you sure you want to <b><u>delete</u></b> <b>{this.state.domainName}</b>?
                </Modal.Body>
                <Modal.Footer>
                    <form onSubmit={onSubmit}>
                        <Button variant="secondary" className="me-2" onClick={handleClose}>
                            Close
                        </Button>
                        <Button type="submit" variant="danger">
                            Yes, I'm sure
                        </Button>
                    </form>
                </Modal.Footer>
            </Modal>
        );
    };

    exportButton = (site) => {
        return (
            <button
                onClick={(e) => { e.stopPropagation(); this.displayExportModal(site); }}
                className="btn btn-outline-primary btn-sm"
                title="Export"
            >
                <i className="material-icons" style={{fontSize: 17, lineHeight: 1.8, margin: -2.5}}>cloud_upload</i>
            </button>
        );
    };

    displayEditModal = (site) => {
        this.setState({
            showEditModal: true,
            id: site.id,
            domainName: site.domain_name,
            ticketId: site.ticket_id,
            registrar: site.registrar || "",
            legitimacy: site.legitimacy || 2,
            rtir: site.rtir,
            expiry: site.expiry ? new Date(site.expiry) : null,
            domainExpiry: site.domain_expiry ? new Date(site.domain_expiry) : null,
            ipMonitoring: site.ip_monitoring,
            webContentMonitoring: site.content_monitoring,
            emailMonitoring: site.mail_monitoring,
            takedownRequest: site.takedown_request || false,
            legalTeam: site.legal_team || false,
            blockingRequest: site.blocking_request || false
        });
    };

    editModal = () => {
        const handleClose = () => this.setState({ showEditModal: false });
    
        const onSubmit = e => {
            e.preventDefault();
    
            const formatDateForAPI = (date) => {
                if (!date) return null;
                if (date instanceof Date) {
                    return date.toISOString().split('T')[0];
                }
                return null;
            };
    
            const body = {
                domain_name: this.inputDomainRef.current.value,
                ticket_id: this.inputTicketRef.current.value,
                registrar: this.inputRegistrarRef.current.value,
                legitimacy: parseInt(this.inputLegitimacyRef.current.value),
                expiry: formatDateForAPI(this.state.expiry),
                domain_expiry: formatDateForAPI(this.state.domainExpiry),
                ip_monitoring: this.ipMonitoringRef.current.checked,
                content_monitoring: this.webContentMonitoringRef.current.checked,
                mail_monitoring: this.emailMonitoringRef.current.checked,
                takedown_request: this.takedownRequestRef.current.checked,
                legal_team: this.legalTeamRef.current.checked,
                blocking_request: this.blockingRequestRef.current.checked
            };
    
            this.props.patchSite(this.state.id, body);
            setTimeout(() => this.props.getSiteStatistics(), 500);
            handleClose();
        };
    
        const handleLegitimacyChange = (e) => {
            const selectedValue = parseInt(e.target.value);
            this.setState({ legitimacy: selectedValue });
            
            if (selectedValue === 1) {
                this.setState({
                    ipMonitoring: false,
                    webContentMonitoring: false,
                    emailMonitoring: false
                });
            }
        };
    
        return (
            <Modal show={this.state.showEditModal} onHide={handleClose} centered size="lg">
                <Modal.Header closeButton>
                    <Modal.Title>Edit Suspicious Website</Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    <Container>
                        <Form onSubmit={onSubmit}>
                            <Row className="mb-3">
                                <Col md={6}>
                                    <Form.Group>
                                        <Form.Label>Domain Name <span className="text-danger">*</span></Form.Label>
                                        <Form.Control
                                            required
                                            ref={this.inputDomainRef}
                                            type="text"
                                            placeholder="example.com"
                                            defaultValue={this.state.domainName}
                                        />
                                    </Form.Group>
                                </Col>
                                <Col md={6}>
                                    <Form.Group>
                                        <Form.Label>Ticket ID</Form.Label>
                                        <Form.Control
                                            ref={this.inputTicketRef}
                                            type="text"
                                            placeholder="240529-2e0a2"
                                            defaultValue={this.state.ticketId}
                                        />
                                    </Form.Group>
                                </Col>
                            </Row>
    
                            <Row className="mb-3">
                                <Col md={6}>
                                    <Form.Group>
                                        <Form.Label>Registrar</Form.Label>
                                        <Form.Control
                                            ref={this.inputRegistrarRef}
                                            type="text"
                                            placeholder="GoDaddy, Namecheap, OVH..."
                                            value={this.state.registrar}
                                            onChange={(e) => this.setState({ registrar: e.target.value })}
                                        />
                                        <Form.Text className="text-muted">
                                            Will be auto-detected via RDAP/WHOIS
                                        </Form.Text>
                                    </Form.Group>
                                </Col>
                                <Col md={6}>
                                    <Form.Group>
                                        <Form.Label>Legitimacy <span className="text-danger">*</span></Form.Label>
                                        <Form.Control
                                            as="select"
                                            ref={this.inputLegitimacyRef}
                                            value={this.state.legitimacy}
                                            onChange={handleLegitimacyChange}
                                            required
                                        >
                                            {Object.entries(LEGITIMACY_LABELS).map(([value, label]) => (
                                                <option key={value} value={value}>{label.label}</option>
                                            ))}
                                        </Form.Control>
                                    </Form.Group>
                                </Col>
                            </Row>
    
                            <Row className="mb-4">
                                <Col md={6}>
                                    <Form.Group>
                                        <Form.Label>End of Monitoring</Form.Label>
                                        <DayPickerInput
                                            style={{ color: "black", width: '100%' }}
                                            formatDate={formatDate}
                                            parseDate={parseDate}
                                            placeholder={`${formatDate(new Date())}`}
                                            value={this.state.expiry}
                                            onDayChange={date => {
                                                this.setState({ 
                                                    expiry: date ? date.toISOString().split('T')[0] : '' 
                                                });
                                            }}
                                        />
                                        <Form.Text className="text-muted">
                                            When to stop monitoring this domain
                                        </Form.Text>
                                    </Form.Group>
                                </Col>
                                <Col md={6}>
                                    <Form.Group>
                                        <Form.Label>Domain Expiry Date</Form.Label>
                                        <DayPickerInput
                                            style={{ color: "black", width: '100%' }}
                                            formatDate={formatDate}
                                            parseDate={parseDate}
                                            placeholder="Select expiry date"
                                            value={this.state.domainExpiry}
                                            onDayChange={date => this.setState({ domainExpiry: date })}
                                        />
                                        <Form.Text className="text-muted">
                                            Will be auto-detected via RDAP/WHOIS
                                        </Form.Text>
                                    </Form.Group>
                                </Col>
                            </Row>
    
                            <Row>
                                <Col md={6}>
                                    <Form.Group className="mb-3">
                                        <Form.Check
                                            type="switch"
                                            id="edit-ip-monitoring"
                                            ref={this.ipMonitoringRef}
                                            label="IP Monitoring"
                                            checked={this.state.ipMonitoring}
                                            onChange={(e) => this.setState({ ipMonitoring: e.target.checked })}
                                            disabled={this.state.legitimacy === 1}
                                        />
                                        <Form.Text className="text-muted">
                                            Monitor IP address changes
                                        </Form.Text>
                                    </Form.Group>
    
                                    <Form.Group className="mb-3">
                                        <Form.Check
                                            type="switch"
                                            id="edit-content-monitoring"
                                            ref={this.webContentMonitoringRef}
                                            label="Web Content Monitoring"
                                            checked={this.state.webContentMonitoring}
                                            onChange={(e) => this.setState({ webContentMonitoring: e.target.checked })}
                                            disabled={this.state.legitimacy === 1}
                                        />
                                        <Form.Text className="text-muted">
                                            Monitor website content changes
                                        </Form.Text>
                                    </Form.Group>
    
                                    <Form.Group className="mb-3">
                                        <Form.Check
                                            type="switch"
                                            id="edit-email-monitoring"
                                            ref={this.emailMonitoringRef}
                                            label="Email Monitoring"
                                            checked={this.state.emailMonitoring}
                                            onChange={(e) => this.setState({ emailMonitoring: e.target.checked })}
                                            disabled={this.state.legitimacy === 1}
                                        />
                                        <Form.Text className="text-muted">
                                            Monitor MX records and mail servers
                                        </Form.Text>
                                    </Form.Group>
                                </Col>
    
                                <Col md={6}>
                                    <div className="pl-3">
                                        <Form.Group className="mb-3">
                                            <Form.Check
                                                type="switch"
                                                id="edit-takedown"
                                                ref={this.takedownRequestRef}
                                                label="Takedown Request"
                                                defaultChecked={this.state.takedownRequest}
                                            />
                                            <Form.Text className="text-muted">
                                                Takedown request submitted
                                            </Form.Text>
                                        </Form.Group>
    
                                        <Form.Group className="mb-3">
                                            <Form.Check
                                                type="switch"
                                                id="edit-legal"
                                                ref={this.legalTeamRef}
                                                label="Legal Team"
                                                defaultChecked={this.state.legalTeam}
                                            />
                                            <Form.Text className="text-muted">
                                                Legal team involvement
                                            </Form.Text>
                                        </Form.Group>
    
                                        <Form.Group className="mb-3">
                                            <Form.Check
                                                type="switch"
                                                id="edit-blocking"
                                                ref={this.blockingRequestRef}
                                                label="Blocking Request"
                                                defaultChecked={this.state.blockingRequest}
                                            />
                                            <Form.Text className="text-muted">
                                                Domain blocking requested
                                            </Form.Text>
                                        </Form.Group>
                                    </div>
                                </Col>
                            </Row>
                                <Row>
                                <Col className="text-end">
                                    <Button variant="secondary" className="me-2" onClick={handleClose}>
                                        Close
                                    </Button>
                                    <Button type="submit" variant="warning" disabled={this.state.editLoading}>
                                        Update
                                    </Button>
                                </Col>
                            </Row>
                        </Form>
                    </Container>
                </Modal.Body>
            </Modal>
        );
    };


    displayAddModal = () => {
        this.setState({
            showAddModal: true
        });
    };

    addModal = () => {
        const handleClose = () => this.setState({ 
            showAddModal: false,
            expiry: null,
            domainExpiry: null,
            legitimacy: 2,
            ipMonitoring: null,
            webContentMonitoring: null,
            emailMonitoring: null,
            takedownRequest: false,
            legalTeam: false,
            blockingRequest: false
        });
    
        const onSubmit = e => {
            e.preventDefault();
            this.setState({ addLoading: true });
    
            const formatDateForAPI = (date) => {
                if (!date) return null;
                if (date instanceof Date) {
                    return date.toISOString().split('T')[0];
                }
                return null;
            };
    
            const body = {
                domain_name: this.inputDomainRef.current.value,
                ticket_id: this.inputTicketRef.current.value,
                registrar: this.inputRegistrarRef.current.value,
                legitimacy: parseInt(this.inputLegitimacyRef.current.value),
                expiry: formatDateForAPI(this.state.expiry),
                domain_expiry: formatDateForAPI(this.state.domainExpiry),
                ip_monitoring: this.ipMonitoringRef.current.checked,
                content_monitoring: this.webContentMonitoringRef.current.checked,
                mail_monitoring: this.emailMonitoringRef.current.checked,
                takedown_request: this.takedownRequestRef.current.checked,
                legal_team: this.legalTeamRef.current.checked,
                blocking_request: this.blockingRequestRef.current.checked
            };
    
            this.props.addSite(body);
            setTimeout(() => this.props.getSiteStatistics(), 500);
            handleClose();
        };
    
        const handleLegitimacyChange = (e) => {
            const selectedValue = parseInt(e.target.value);
            this.setState({ legitimacy: selectedValue });
            
            if (selectedValue === 1) {
                this.setState({
                    ipMonitoring: false,
                    webContentMonitoring: false,
                    emailMonitoring: false
                });
            }
        };
    
        return (
            <Modal show={this.state.showAddModal} onHide={handleClose} centered size="lg">
                <Modal.Header closeButton>
                    <Modal.Title>Add New Suspicious Website</Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    <Container>
                        <Form onSubmit={onSubmit}>
                            <Row className="mb-3">
                                <Col md={6}>
                                    <Form.Group>
                                        <Form.Label>Domain Name <span className="text-danger">*</span></Form.Label>
                                        <Form.Control
                                            required
                                            ref={this.inputDomainRef}
                                            type="text"
                                            placeholder="example.com"
                                        />
                                    </Form.Group>
                                </Col>
                                <Col md={6}>
                                    <Form.Group>
                                        <Form.Label>Ticket ID</Form.Label>
                                        <Form.Control
                                            ref={this.inputTicketRef}
                                            type="text"
                                            placeholder="240529-2e0a2"
                                        />
                                    </Form.Group>
                                </Col>
                            </Row>
    
                            <Row className="mb-3">
                                <Col md={6}>
                                    <Form.Group>
                                        <Form.Label>Registrar</Form.Label>
                                        <Form.Control
                                            ref={this.inputRegistrarRef}
                                            type="text"
                                            placeholder="GoDaddy, Namecheap, OVH..."
                                        />
                                        <Form.Text className="text-muted">
                                            Will be auto-detected via RDAP/WHOIS
                                        </Form.Text>
                                    </Form.Group>
                                </Col>
                                <Col md={6}>
                                    <Form.Group>
                                        <Form.Label>Legitimacy <span className="text-danger">*</span></Form.Label>
                                        <Form.Control
                                            as="select"
                                            ref={this.inputLegitimacyRef}
                                            defaultValue="2"
                                            onChange={handleLegitimacyChange}
                                            required
                                        >
                                            {Object.entries(LEGITIMACY_LABELS).map(([value, label]) => (
                                                <option key={value} value={value}>{label.label}</option>
                                            ))}
                                        </Form.Control>
                                    </Form.Group>
                                </Col>
                            </Row>
    
                            <Row className="mb-4">
                                <Col md={6}>
                                    <Form.Group>
                                        <Form.Label>End of Monitoring</Form.Label>
                                        <DayPickerInput
                                            style={{ color: "black", width: '100%' }}
                                            formatDate={formatDate}
                                            parseDate={parseDate}
                                            placeholder={`${formatDate(new Date())}`}
                                            value={this.state.expiry}
                                            onDayChange={date => this.setState({ expiry: date })}
                                        />
                                        <Form.Text className="text-muted">
                                            When to stop monitoring this domain
                                        </Form.Text>
                                    </Form.Group>
                                </Col>
                                <Col md={6}>
                                    <Form.Group>
                                        <Form.Label>Domain Expiry Date</Form.Label>
                                        <DayPickerInput
                                            style={{ color: "black", width: '100%' }}
                                            formatDate={formatDate}
                                            parseDate={parseDate}
                                            placeholder="Select expiry date"
                                            value={this.state.domainExpiry}
                                            onDayChange={date => this.setState({ domainExpiry: date })}
                                        />
                                        <Form.Text className="text-muted">
                                            Will be auto-detected via RDAP/WHOIS
                                        </Form.Text>
                                    </Form.Group>
                                </Col>

                            </Row>
    
                            <Row>
                                <Col md={6}>
                                        <Form.Group className="mb-3">
                                            <Form.Check
                                                type="switch"
                                                id="add-ip-monitoring"
                                                ref={this.ipMonitoringRef}
                                                label="IP Monitoring"
                                                defaultChecked={true}
                                            />
                                            <Form.Text className="text-muted">
                                                Monitor IP address changes
                                            </Form.Text>
                                        </Form.Group>
    
                                        <Form.Group className="mb-3">
                                            <Form.Check
                                                type="switch"
                                                id="add-content-monitoring"
                                                ref={this.webContentMonitoringRef}
                                                label="Web Content Monitoring"
                                                defaultChecked={true}
                                            />
                                            <Form.Text className="text-muted">
                                                Monitor website content changes
                                            </Form.Text>
                                        </Form.Group>
    
                                        <Form.Group className="mb-3">
                                            <Form.Check
                                                type="switch"
                                                id="add-email-monitoring"
                                                ref={this.emailMonitoringRef}
                                                label="Email Monitoring"
                                                defaultChecked={true}
                                            />
                                            <Form.Text className="text-muted">
                                                Monitor MX records and mail servers
                                            </Form.Text>
                                        </Form.Group>
                                </Col>

                                <Col md={6}>
                                    <div className="pl-3">    
                                        <Form.Group className="mb-3">
                                            <Form.Check
                                                type="switch"
                                                id="add-takedown"
                                                ref={this.takedownRequestRef}
                                                label="Takedown Request"
                                                defaultChecked={false}
                                            />
                                            <Form.Text className="text-muted">
                                                Takedown request submitted
                                            </Form.Text>
                                        </Form.Group>
    
                                        <Form.Group className="mb-3">
                                            <Form.Check
                                                type="switch"
                                                id="add-legal"
                                                ref={this.legalTeamRef}
                                                label="Legal Team"
                                                defaultChecked={false}
                                            />
                                            <Form.Text className="text-muted">
                                                Legal team involvement
                                            </Form.Text>
                                        </Form.Group>
    
                                        <Form.Group className="mb-3">
                                            <Form.Check
                                                type="switch"
                                                id="add-blocking"
                                                ref={this.blockingRequestRef}
                                                label="Blocking Request"
                                                defaultChecked={false}
                                            />
                                            <Form.Text className="text-muted">
                                                Domain blocking requested
                                            </Form.Text>
                                        </Form.Group>
                                    </div>
                                </Col>
                            </Row>
    
                            <hr />
                            <Row>
                                <Col className="text-end">
                                    <Button variant="secondary" className="me-2" onClick={handleClose}>
                                        Close
                                    </Button>
                                    <Button type="submit" variant="success" disabled={this.state.addLoading}>
                                        Add
                                    </Button>
                                </Col>
                            </Row>
                        </Form>
                    </Container>
                </Modal.Body>
            </Modal>
        );
    };

    displayAlerts = (site) => {
        this.setState({
            showAlerts: true,
            selectedSiteForAlerts: site
        });
    };

    closeAlerts = () => {
        this.setState({
            showAlerts: false,
            selectedSiteForAlerts: null
        });
    };

    onDataFiltered = (filteredData) => {
        if (!this.props.filteredData) {
            this.setState({ filteredSites: filteredData });
        }
        
        if (this.props.onDataFiltered) {
            this.props.onDataFiltered(filteredData);
        }
    };

    renderLoadingState = () => (
        <tr>
            <td colSpan="11" className="text-center py-5">
                <div className="d-flex flex-column align-items-center">
                    <div className="spinner-border text-primary mb-3" role="status">
                        <span className="visually-hidden">Loading...</span>
                    </div>
                    <p className="text-muted mb-0">Loading data...</p>
                </div>
            </td>
        </tr>
    );

    render() {
        const { sites, auth, globalFilters, filteredData } = this.props;
        const dataToUse = filteredData || this.state.filteredSites || sites;

        const filterConfig = [
            {
                id: 'expiry_status',
                label: 'Expiry Status',
                options: [
                    { value: '', label: 'All' },
                    { value: 'expired', label: 'Expired' },
                    { value: 'expiring_soon', label: 'Expiring Soon' },
                    { value: 'valid', label: 'Valid' },
                    { value: 'no_date', label: 'No Date' }
                ]
            },
            {
                id: 'takedown',
                label: 'Takedown',
                options: [
                    { value: '', label: 'All' },
                    { value: 'yes', label: 'Yes' },
                    { value: 'no', label: 'No' }
                ]
            },
            {
                id: 'legal',
                label: 'Legal',
                options: [
                    { value: '', label: 'All' },
                    { value: 'yes', label: 'Yes' },
                    { value: 'no', label: 'No' }
                ]
            },
            {
                id: 'blocking',
                label: 'Blocking',
                options: [
                    { value: '', label: 'All' },
                    { value: 'yes', label: 'Yes' },
                    { value: 'no', label: 'No' }
                ]
            }
        ];

        return (
            <Fragment>
                <div className="d-flex justify-content-between align-items-center mb-4">
                    <h4>Suspicious Websites Monitored</h4>
                    <div>
                        {auth.isAuthenticated && (
                            <Button variant="success" onClick={this.displayAddModal}>
                                <i className="material-icons" style={{ verticalAlign: 'middle' }}>add_circle</i>
                                <span className="ms-2">Add Domain</span>
                            </Button>
                        )}
                    </div>
                </div>

                <TableManager
                    data={sites}
                    filterConfig={filterConfig}
                    customFilters={this.customFilters}
                    searchFields={['domain_name', 'ticket_id', 'registrar', 'rtir']}
                    dateFields={['created_at', 'expiry', 'domain_expiry']}
                    defaultSort="created_at"
                    globalFilters={globalFilters}
                    onDataFiltered={this.onDataFiltered}
                    moduleKey="sitemonitoring_websitesmonitored"
                    skipFiltering={!!filteredData}
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
                                    <div style={{ ...getTableContainerStyle(), overflowX: 'auto' }}>
                                        <table className="table table-striped table-hover">
                                            <thead>
                                                <tr>
                                                    <th style={{ cursor: 'pointer' }} onClick={() => handleSort('domain_name')}>
                                                        Domain Name{renderSortIcons('domain_name')}
                                                    </th>
                                                    <th style={{ cursor: 'pointer' }} onClick={() => handleSort('ticket_id')}>
                                                        Ticket ID{renderSortIcons('ticket_id')}
                                                    </th>
                                                    <th style={{ cursor: 'pointer' }} onClick={() => handleSort('registrar')}>
                                                        Registrar{renderSortIcons('registrar')}
                                                    </th>
                                                    <th style={{ cursor: 'pointer' }} onClick={() => handleSort('legitimacy')}>
                                                        Legitimacy{renderSortIcons('legitimacy')}
                                                    </th>
                                                    <th style={{ cursor: 'pointer' }} onClick={() => handleSort('alerts')}>
                                                        Alerts{renderSortIcons('alerts')}
                                                    </th>
                                                    <th style={{ cursor: 'pointer' }} onClick={() => handleSort('created_at')}>
                                                        Created At{renderSortIcons('created_at')}
                                                    </th>
                                                    <th style={{ cursor: 'pointer' }} onClick={() => handleSort('domain_expiry')}>
                                                        Expiry{renderSortIcons('domain_expiry')}
                                                    </th>
                                                    <th>Takedown</th>
                                                    <th>Legal</th>
                                                    <th>Blocking</th>
                                                    <th></th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {this.state.isLoading ? (
                                                    this.renderLoadingState()
                                                ) : paginatedData.length === 0 ? (
                                                    <tr>
                                                        <td colSpan="11" className="text-center text-muted py-4">
                                                            No results found
                                                        </td>
                                                    </tr>
                                                ) : (
                                                    paginatedData.map(site => (
                                                        <tr 
                                                            key={site.id}
                                                            style={{ cursor: 'pointer' }}
                                                            onClick={() => this.displayAlerts(site)}
                                                            title="Click to view alerts for this domain"
                                                        >
                                                            <td>
                                                                <div>
                                                                    <strong>{site.domain_name}</strong>
                                                                    {this.getStatusBadges(site)}
                                                                </div>
                                                            </td>
                                                            <td>{site.ticket_id || '-'}</td>
                                                            <td>{site.registrar || '-'}</td>
                                                            <td>
                                                                <span 
                                                                    className="badge" 
                                                                    style={{ 
                                                                        backgroundColor: LEGITIMACY_LABELS[site.legitimacy]?.color || '#6c757d',
                                                                        color: LEGITIMACY_LABELS[site.legitimacy]?.textColor || '#000',
                                                                        fontSize: '14px'
                                                                    }}
                                                                >
                                                                    {LEGITIMACY_LABELS[site.legitimacy]?.label || 'Unknown'}
                                                                </span>
                                                            </td>
                                                            <td>
                                                                <span className="badge bg-primary" style={{ fontSize: '15px' }}>
                                                                    {this.getTotalAlerts(site)}
                                                                </span>
                                                            </td>
                                                            <td>{site.created_at ? new Date(site.created_at).toDateString() : '-'}</td>
                                                            <td>
                                                                <div>
                                                                    {site.domain_expiry ? new Date(site.domain_expiry).toDateString() : '-'}
                                                                    {this.getDomainExpiryBadge(site)}
                                                                </div>
                                                            </td>
                                                            <td 
                                                                className="text-center"
                                                                onClick={(e) => e.stopPropagation()}
                                                            >
                                                                {site.takedown_request
                                                                    ? <i className="material-icons text-success" style={{ fontSize: 22 }}>check_circle</i>
                                                                    : <i className="material-icons text-danger" style={{ fontSize: 22 }}>cancel</i>
                                                                }
                                                            </td>
                                                            <td 
                                                                className="text-center"
                                                                onClick={(e) => e.stopPropagation()}
                                                            >
                                                                {site.legal_team
                                                                    ? <i className="material-icons text-success" style={{ fontSize: 22 }}>check_circle</i>
                                                                    : <i className="material-icons text-danger" style={{ fontSize: 22 }}>cancel</i>
                                                                }
                                                            </td>
                                                            <td 
                                                                className="text-center"
                                                                onClick={(e) => e.stopPropagation()}
                                                            >
                                                                {site.blocking_request
                                                                    ? <i className="material-icons text-success" style={{ fontSize: 22 }}>check_circle</i>
                                                                    : <i className="material-icons text-danger" style={{ fontSize: 22 }}>cancel</i>
                                                                }
                                                            </td>
                                                            <td 
                                                                className="text-end" 
                                                                style={{ whiteSpace: 'nowrap' }}
                                                                onClick={(e) => e.stopPropagation()}
                                                            >
                                                                <button
                                                                    onClick={() => this.displayDetailsModal(site)}
                                                                    className="btn btn-outline-info btn-sm me-2"
                                                                    title="Technical Details"
                                                                >
                                                                    <i className="material-icons" style={{fontSize: 17, lineHeight: 1.8, margin: -2.5}}>info</i>
                                                                </button>
                                                                <span className="me-2">
                                                                    {this.exportButton(site)}
                                                                </span>
                                                                <button
                                                                    onClick={() => this.displayEditModal(site)}
                                                                    className="btn btn-outline-warning btn-sm me-2"
                                                                    title="Edit"
                                                                >
                                                                    <i className="material-icons" style={{fontSize: 17, lineHeight: 1.8, margin: -2.5}}>edit</i>
                                                                </button>
                                                                <button
                                                                    onClick={() => this.displayDeleteModal(site.id, site.domain_name)}
                                                                    className="btn btn-outline-danger btn-sm me-2"
                                                                    title="Delete"
                                                                >
                                                                    <i className="material-icons" style={{fontSize: 17, lineHeight: 1.8, margin: -2.5}}>delete</i>
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

                {this.detailsModal()}
                {this.editModal()}
                {this.addModal()}
                {this.deleteModal()}
                <ExportModal
                    show={this.state.showExportModal}
                    domain={this.state.selectedSite}
                    onClose={this.closeExportModal}
                    onMispExport={this.handleMispExport}
                    onLegitimateDomainExport={this.handleLegitimateDomainExport}
                    onDeleteRequest={this.handleDeleteRequest}
                    mode="websiteMonitoring"
                />

                <Alerts
                    show={this.state.showAlerts}
                    onHide={this.closeAlerts}
                    site={this.state.selectedSiteForAlerts}
                />

            </Fragment>
        );
    }
}

const mapStateToProps = state => ({
    sites: state.SiteMonitoring.sites,
    alerts: state.SiteMonitoring.alerts || [],
    auth: state.auth,
    error: state.errors,
    mispMessage: state.SiteMonitoring.mispMessage
});

export default connect(mapStateToProps, {
    getSites,
    deleteSite,
    addSite,
    patchSite,
    exportToMISP,
    exportToLegitimateDomains,
    getSiteStatistics
})(SuspiciousSites);