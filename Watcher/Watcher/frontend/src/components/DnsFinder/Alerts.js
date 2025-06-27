import React, {Component, Fragment} from 'react';
import {connect} from 'react-redux';
import PropTypes from 'prop-types';
import {getAlerts, updateAlertStatus, exportToMISP} from "../../actions/DnsFinder";
import {addSite, getSites} from "../../actions/SiteMonitoring";
import Modal from "react-bootstrap/Modal";
import Button from "react-bootstrap/Button";
import Container from "react-bootstrap/Container";
import Row from "react-bootstrap/Row";
import Col from "react-bootstrap/Col";
import Form from "react-bootstrap/Form";
import DayPickerInput from "react-day-picker/DayPickerInput";
import {formatDate, parseDate} from "react-day-picker/moment";


export class Alerts extends Component {

    constructor(props) {
        super(props);
        this.state = {
            show: false,
            showAddModal: false,
            showExportModal: false,
            id: 0,
            exportLoading: false,
            exportLoadingMISPTh: false,
            domainName: "",
            eventUuid: "",
            showHelp: false,
            showAllUuid: false,
            showMispMessage: false,
            mispMessage: ""
        };
        this.inputTicketRef = React.createRef();
        this.ipMonitoringRef = React.createRef();
        this.webContentMonitoringRef = React.createRef();
        this.emailMonitoringRef = React.createRef();
        this.mispMessageTimeout = null;
    }

    static propTypes = {
        sites: PropTypes.array.isRequired,
        addSite: PropTypes.func.isRequired,
        getSites: PropTypes.func.isRequired,
        alerts: PropTypes.array.isRequired,
        getAlerts: PropTypes.func.isRequired,
        updateAlertStatus: PropTypes.func.isRequired,
        exportToMISP: PropTypes.func.isRequired,
        auth: PropTypes.object.isRequired,
        error: PropTypes.object.isRequired,
    };

    componentDidMount() {
        this.props.getAlerts();
        this.props.getSites();
    }

    componentDidUpdate(prevProps) {
        if (this.props.sites !== prevProps.sites) {
            this.setState({
                exportLoading: false
            });
        }
        if (this.props.alerts !== prevProps.alerts) {
            this.setState({
                exportLoadingMISPTh: false
            });
        }
        if (this.props.error !== prevProps.error) {
            if (this.props.error.status !== null) {
                this.setState({
                    exportLoading: false,
                    exportLoadingMISPTh: false
                });
            }
        }
    }

    displayModal = (id) => {
        this.setState({
            show: true,
            id: id,
        });
    };

    modal = () => {
        let handleClose;
        handleClose = () => {
            this.setState({
                show: false
            });
        };

        let onSubmit;
        onSubmit = e => {
            e.preventDefault();
            const status = false; // status = false -> Disable the alert
            const json_status = {status};
            this.props.updateAlertStatus(this.state.id, json_status);
            this.setState({
                id: 0
            });
            handleClose();
        };

        return (
            <Modal show={this.state.show} onHide={handleClose} centered>
                <Modal.Header closeButton>
                    <Modal.Title>Action Requested</Modal.Title>
                </Modal.Header>
                <Modal.Body>Are you sure you want to <b><u>disable</u></b> this alert?</Modal.Body>
                <Modal.Footer>
                    <form onSubmit={onSubmit}>
                        <Button variant="secondary" className="mr-2" onClick={handleClose}>
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

    displayAddModal = (id, domainName) => {
        this.setState({
            showAddModal: true,
            id: id,
            domainName: domainName
        });
    };

    addModal = () => {
        let handleClose;
        handleClose = () => {
            this.setState({
                showAddModal: false
            });
        };

        let getMax;
        getMax = (arr, prop) => {
            var max;
            for (var i=0 ; i<arr.length ; i++) {
                if (max == null || parseInt(arr[i][prop]) > parseInt(max[prop]))
                    max = arr[i];
            }
            return max;
        };

        let onSubmit;
        onSubmit = e => {
            e.preventDefault();
            const domain_name = this.state.domainName;
            const ticket_id = this.inputTicketRef.current.value;
            const expiry = this.state.day;
            const ip_monitoring = this.ipMonitoringRef.current.checked;
            const content_monitoring = this.webContentMonitoringRef.current.checked;
            const mail_monitoring = this.emailMonitoringRef.current.checked;
            const site = expiry ? {domain_name, ticket_id, expiry, ip_monitoring, content_monitoring, mail_monitoring} : {domain_name, ticket_id, ip_monitoring, content_monitoring, mail_monitoring};

            this.props.addSite(site);
            this.setState({
                domainName: "",
                day: "",
                id: 0,
                exportLoading: this.state.id
            });
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
                            <Col md={{span: 12}}>
                                <Form onSubmit={onSubmit}>
                                    <Form.Group as={Row}>
                                        <Form.Label column sm="4">Domain name</Form.Label>
                                        <Col sm="8">
                                            {this.state.domainName}
                                        </Col>
                                        <Form.Label column sm="4">Ticket ID</Form.Label>
                                        <Col sm="8">
                                            <Form.Control ref={this.inputTicketRef} size="md" type="text"
                                                          pattern="^[a-zA-Z0-9]+(-[a-zA-Z0-9]+)*(\.[a-zA-Z0-9]+(-[a-zA-Z0-9]+)*)*$"
                                                          placeholder="230509-200a2"/>
                                        </Col>
                                        <Form.Label column sm="4">Expiry Date</Form.Label>
                                        <Col sm="8">
                                            <DayPickerInput
                                                style={{color: "black"}}
                                                formatDate={formatDate}
                                                parseDate={parseDate}
                                                placeholder={`${formatDate(new Date())}`}
                                                dayPickerProps={{
                                                    disabledDays: {before: new Date()},
                                                    fromMonth: new Date(),
                                                    firstDayOfWeek: 1,
                                                    fixedWeeks: true,
                                                    showWeekNumbers: true
                                                }}
                                                onDayChange={day => this.setState({day})}/>
                                        </Col>
                                        <Form.Label column sm="6">Ip Monitoring</Form.Label>
                                        <Col sm="6">
                                            <Form.Check
                                                ref={this.ipMonitoringRef}
                                                defaultChecked={true}
                                                className="mt-2"
                                                type="switch"
                                                id="custom-switch"
                                                label=""
                                            />
                                        </Col>
                                        <Form.Label column sm="6">Web Content Monitoring</Form.Label>
                                        <Col sm="6">
                                            <Form.Check
                                                ref={this.webContentMonitoringRef}
                                                defaultChecked={true}
                                                className="mt-2"
                                                type="switch"
                                                id="custom-switch-2"
                                                label=""
                                            />
                                        </Col>
                                        <Form.Label column sm="6">Email Monitoring</Form.Label>
                                        <Col sm="6">
                                            <Form.Check
                                                ref={this.emailMonitoringRef}
                                                defaultChecked={true}
                                                className="mt-2"
                                                type="switch"
                                                id="custom-switch-3"
                                                label=""
                                            />
                                        </Col>
                                    </Form.Group>
                                    <Col md={{span: 5, offset: 8}}>
                                        <Button variant="secondary" className="mr-2" onClick={handleClose}>
                                            Close
                                        </Button>
                                        <Button type="submit" variant="success">
                                            Add
                                        </Button>
                                    </Col>
                                </Form>
                            </Col>
                        </Row>
                    </Container>
                </Modal.Body>
            </Modal>
        );
    };

    isDisabled = (domainName, id) => {
        let back = false;

        if (this.state.exportLoading === id) {
            return true;
        }

        this.props.sites.map(site => {
            if (site.domain_name === domainName) {
                back = true;
            }
        });
        return back;
    };

    extractUUID = (raw, domainName = this.state.domainName) => {
        if (!raw) {
            // Check if domain exists in Site Monitoring
            const site = this.props.sites.find(site => site.domain_name === domainName);
            if (site && site.misp_event_uuid) {
                raw = site.misp_event_uuid;
            } else {
                return [];
            }
        }
        
        if (Array.isArray(raw)) return raw.filter(uuid => uuid && uuid.trim() !== '');
        return raw.replace(/[\[\]'"\s]/g, '').split(',').filter(Boolean);
    };

    displayExportModal = (id, domainName) => {
        const dnsTwisted = this.props.alerts
            .find(alert => alert.dns_twisted.id === id)?.dns_twisted;
        
        if (!dnsTwisted) return;
        
        const uuid = Array.isArray(dnsTwisted?.misp_event_uuid) ? dnsTwisted.misp_event_uuid :
                     (dnsTwisted?.misp_event_uuid ? this.extractUUID(dnsTwisted.misp_event_uuid) : []);
        
        this.setState({
            showExportModal: true,
            id,
            domainName,
            eventUuid: uuid.length > 0 ? uuid[uuid.length - 1] : ''
        });
    };

    exportModal = () => {
        const handleClose = () => {
            this.setState({
                showExportModal: false
            });
        };

        const onSubmitMisp = e => {
            e.preventDefault();
            const id = this.state.id;
            
            const alert = this.props.alerts.find(a => a.dns_twisted.id === id);
            if (!alert) return;
            
            const dnsTwisted = alert.dns_twisted;
            const uuid = this.extractUUID(dnsTwisted.misp_event_uuid);
            const latestUuid = uuid.length > 0 ? uuid[uuid.length - 1] : '';

            const isUpdate = Boolean(uuid.length) || Boolean(this.state.eventUuid.trim());
            
            const payload = {
                id: id
            };
            
            if (this.state.eventUuid.trim()) {
                payload.event_uuid = this.state.eventUuid.trim();
            } else if (isUpdate && latestUuid) {
                payload.event_uuid = latestUuid;
            }
        
            this.props.exportToMISP(payload);
            this.setState({
                exportLoadingMISPTh: id
            });
            handleClose();
        };

        const alert = this.props.alerts.find(a => a.dns_twisted.id === this.state.id);
        if (!alert) return null;
        
        const dnsTwisted = alert.dns_twisted;
        const uuid = this.extractUUID(dnsTwisted.misp_event_uuid);
        const isUpdate = Boolean(uuid.length) || Boolean(this.state.eventUuid.trim());

        return (
            <Modal show={this.state.showExportModal} onHide={handleClose} size="lg" centered>
                <Modal.Header closeButton className="d-flex align-items-center">
                    <img
                        src="/static/img/misp_logo.png"
                        alt="MISP Logo"
                        className="me-4 rounded-circle"
                        style={{ width: '50px', height: '50px', objectFit: 'cover' }}
                    />
                    <Modal.Title className="h4 text-white mb-0">
                        &nbsp;Export <strong>{this.state.domainName}</strong> & <strong>IOCs</strong> to{' '}
                        <strong><u>MISP</u></strong>
                    </Modal.Title>
                </Modal.Header>

                <Modal.Body className="px-4">
                    <div className="mb-4">
                        <div
                            className="d-flex align-items-center cursor-pointer user-select-none"
                            onClick={() => this.setState((prev) => ({ showHelp: !prev.showHelp }))}
                        >
                            <i className="material-icons text-info me-2">
                                {this.state.showHelp ? 'expand_less' : 'expand_more'}
                            </i>
                            <span className="text-white">Need help with MISP export?</span>
                        </div>

                        {this.state.showHelp && (
                            <div className="mt-3 ps-4 border-start border-info cursor-pointer">
                                <div className="text-white">
                                    <ul className="mb-0 ps-3">
                                        {!isUpdate ? (
                                            <>
                                                <li>To create a new MISP event: leave the Event UUID field empty</li>
                                                <li>To update an existing event: provide its Event UUID</li>
                                            </>
                                        ) : (
                                            <>
                                                <li>The latest event will automatically be updated if no new Event UUID is provided</li>
                                                <li>To update an existing event: provide its Event UUID</li>
                                            </>
                                        )}
                                    </ul>
                                </div>
                            </div>
                        )}
                    </div>

                    <Form.Group>
                        <Form.Label className="d-flex align-items-center">
                            <strong>MISP Event UUID</strong>
                            <span className={`ms-2 badge ${isUpdate ? 'bg-success' : 'bg-primary'}`}>
                                {isUpdate ? 'Update' : 'Create'}
                            </span>
                        </Form.Label>
                        <Form.Control
                            type="text"
                            placeholder="Enter MISP event UUID to update an existing event"
                            value={this.state.eventUuid}
                            onChange={(e) => {
                                const value = e.target.value.replace(/[\[\]'\"\s]/g, '');
                                if (/^[a-f0-9-]*$/.test(value)) this.setState({ eventUuid: value });
                            }}
                            pattern="^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$"
                            className="mb-3"
                        />

                        {uuid.length > 0 && (
                            <div className="mt-4">
                                <label className="form-label fw-semibold">Event UUID History:</label>
                                <div className="list-group">
                                    {uuid
                                        .slice()
                                        .reverse()
                                        .slice(0, this.state.showAllUuid ? uuid.length : 2)
                                        .map((uuid, index) => (
                                            <div
                                                key={index}
                                                className="list-group-item d-flex justify-content-between align-items-center"
                                            >
                                                {uuid}
                                                {index === 0 && <span className="badge bg-secondary">Latest</span>}
                                            </div>
                                        ))}

                                    {uuid.length > 2 && (
                                        <div
                                            className="list-group-item text-center cursor-pointer user-select-none"
                                            onClick={() => this.setState((prev) => ({ showAllUuid: !prev.showAllUuid }))}
                                            style={{ cursor: 'pointer' }}
                                        >
                                            <i className="material-icons align-middle">
                                                {this.state.showAllUuid ? 'remove_circle_outline' : 'add_circle_outline'}
                                            </i>
                                            <span className="ms-2">
                                                {this.state.showAllUuid ? 'Show Less' : `Show ${uuid.length - 2} More`}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </Form.Group>
                </Modal.Body>

                <Modal.Footer>
                    <Button
                        variant={isUpdate ? 'success' : 'primary'}
                        onClick={onSubmitMisp}
                        className="min-width-140"
                        disabled={this.state.exportLoadingMISPTh === this.state.id}
                    >
                        {this.state.exportLoadingMISPTh === this.state.id ? (
                            <div className="loader">Loading...</div>
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

    exportButtonMISPTh = alert => {
        const dnsTwisted = alert.dns_twisted;
        
        const hasMispEvent = dnsTwisted.misp_event_uuid && 
                            (Array.isArray(dnsTwisted.misp_event_uuid) ? 
                                dnsTwisted.misp_event_uuid.length > 0 : 
                                this.extractUUID(dnsTwisted.misp_event_uuid).length > 0);
        
        return (
            <button 
                className={`btn btn-sm mr-2 ${
                    this.state.exportLoadingMISPTh === dnsTwisted.id ? 
                    'btn-outline-secondary disabled' : 
                    hasMispEvent ? 'btn-outline-success' : 'btn-outline-primary'
                }`}
                data-toggle="tooltip"
                data-placement="top" 
                title={hasMispEvent ? "Update MISP" : "Export to MISP"}
                onClick={() => this.displayExportModal(dnsTwisted.id, dnsTwisted.domain_name)}
                disabled={this.state.exportLoadingMISPTh === dnsTwisted.id}
            >
                {this.state.exportLoadingMISPTh === dnsTwisted.id ? (
                    <div className="loader">Loading...</div>
                ) : (
                    <i className="material-icons"
                       style={{fontSize: 17, lineHeight: 1.8, margin: -2.5}}>
                      {hasMispEvent ? 'cloud_done' : 'cloud_upload'}
                    </i>
                )}
            </button>
        );
    };

    renderMispNotification = () => {
        if (!this.state.showMispMessage) return null;
        
        return (
            <div 
                className="position-fixed top-0 end-0 p-3" 
                style={{ zIndex: 1050, maxWidth: '400px', marginTop: '60px', marginRight: '20px' }}
            >
                <div className="alert alert-success alert-dismissible fade show d-flex align-items-center" role="alert">
                    <img 
                        src="/static/img/misp_logo.png" 
                        alt="MISP Logo" 
                        className="me-3 rounded-circle"
                        style={{ width: '30px', height: '30px', objectFit: 'cover' }}
                    />
                    <div>
                        <strong className="me-2">MISP:</strong>
                        {this.state.mispMessage}
                    </div>
                    <button 
                        type="button" 
                        className="btn-close" 
                        onClick={() => this.setState({ showMispMessage: false })}
                        aria-label="Close"
                    />
                </div>
            </div>
        );
    };

    getMispStatusBadge = (dns) => {
        const uuid = this.extractUUID(dns.misp_event_uuid);
        return uuid.length ? (
            <span className="badge bg-info me-2" title="MISP Events">
                <i className="material-icons align-middle me-1" style={{ fontSize: 14 }}>
                    cloud_done
                </i>
                {uuid.length}
            </span>
        ) : null;
    };

    render() {
        const exportButton = alert => (
            this.isDisabled(alert.dns_twisted.domain_name, alert.id) ?
                (<button className="btn btn-success btn-sm"
                         data-toggle="tooltip"
                         data-placement="top" title={alert.dns_twisted.domain_name + " is monitored"}
                         onClick={() => {
                             this.displayAddModal(alert.id, alert.dns_twisted.domain_name)
                         }}
                         disabled={true}>

                    {this.state.exportLoading === alert.id && (
                        <div className="loader">Loading...</div>
                    )}
                    {this.state.exportLoading !== alert.id && <i className="material-icons"
                                                                 style={{
                                                                     fontSize: 18.5,
                                                                     lineHeight: 1.85,
                                                                     margin: -2.5
                                                                 }}>playlist_add_check</i>}
                </button>) :
                (<button className="btn btn-secondary btn-sm"
                         data-toggle="tooltip"
                         data-placement="top" title={"Monitor " + alert.dns_twisted.domain_name}
                         onClick={() => {
                             this.displayAddModal(alert.id, alert.dns_twisted.domain_name)
                         }}
                         disabled={false}>

                    {this.state.exportLoading === alert.id && (
                        <div className="loader">Loading...</div>
                    )}
                    {this.state.exportLoading !== alert.id && <i className="material-icons"
                                                                 style={{
                                                                     fontSize: 18.5,
                                                                     lineHeight: 1.85,
                                                                     margin: -2.5
                                                                 }}>playlist_add</i>}
                </button>)
        );
        
        return (
            <Fragment>
                <div className="row">
                    <div className="col-lg-12">
                        <div className="float-left" style={{marginBottom: 12}}>
                            <h4>Alerts</h4>
                        </div>
                    </div>
                </div>
                <div className="row">
                    <div className="col-lg-12">
                        <div style={{height: '600px', overflow: 'auto'}}>
                            <table className="table table-striped table-hover">
                                <thead>
                                <tr>
                                    <th>ID</th>
                                    <th>Twisted DNS</th>
                                    <th>Corporate Keyword</th>
                                    <th>Corporate DNS</th>
                                    <th>Fuzzer</th>
                                    <th>Created At</th>
                                    <th/>
                                </tr>
                                </thead>
                                <tbody>
                                {this.props.alerts.map(alert => {
                                    if (alert.status === true) {
                                        return (
                                            <tr key={alert.id}>
                                                <td><h5>#{alert.id}</h5></td>
                                                <td>{alert.dns_twisted.domain_name}</td>
                                                <td>{alert.dns_twisted.keyword_monitored ? alert.dns_twisted.keyword_monitored.name : "-"}</td>
                                                <td>{alert.dns_twisted.dns_monitored ? alert.dns_twisted.dns_monitored.domain_name : "-"}</td>
                                                <td>{alert.dns_twisted.fuzzer ? alert.dns_twisted.fuzzer : "-"}</td>
                                                <td>{(new Date(alert.created_at)).toLocaleString()}</td>
                                                <td className="text-right" style={{whiteSpace: 'nowrap'}}>
                                                    <button onClick={() => {
                                                        this.displayModal(alert.id)
                                                    }}
                                                            className="btn btn-outline-primary btn-sm mr-2">Disable
                                                    </button>
                                                    {this.exportButtonMISPTh(alert)}
                                                    {exportButton(alert)}
                                                </td>
                                            </tr>);
                                    }
                                })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
                {this.modal()}
                {this.addModal()}
                {this.exportModal()}
                {this.renderMispNotification()}
            </Fragment>
        )
    }
}

const mapStateToProps = state => ({
    alerts: state.DnsFinder.alerts,
    sites: state.SiteMonitoring.sites,
    auth: state.auth,
    error: state.errors
});

export default connect(mapStateToProps, {getAlerts, updateAlertStatus, addSite, getSites, exportToMISP})(Alerts);