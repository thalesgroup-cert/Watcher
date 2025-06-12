import React, {Component, Fragment} from 'react';
import {connect} from 'react-redux';
import PropTypes from 'prop-types';
import {getSites, deleteSite, addSite, patchSite, exportToMISP} from "../../actions/SiteMonitoring";
import Modal from "react-bootstrap/Modal";
import Button from "react-bootstrap/Button";
import Container from "react-bootstrap/Container";
import Row from "react-bootstrap/Row";
import Col from "react-bootstrap/Col";
import Form from "react-bootstrap/Form";
import DayPickerInput from "react-day-picker/DayPickerInput";
import {formatDate, parseDate} from 'react-day-picker/moment';
 
export class SuspiciousSites extends Component {
 
    constructor(props) {
        super(props);
        this.state = {
            showDeleteModal: false,
            showEditModal: false,
            showAddModal: false,
            showExportModal: false,
            id: 0,
            domainName: "",
            ticketId: "",
            name: "",
            rtir: "",
            expiry: null,
            ipMonitoring: null,
            webContentMonitoring: null,
            emailMonitoring: null,
            mispEventId: null,
            addLoading: false,
            exportLoading: false,
            eventUuid: "",
            showHelp: false,
            showAllUuid: false
        };
        this.inputDomainRef = React.createRef();
        this.inputTicketRef = React.createRef();
        this.inputRtirRef = React.createRef();
        this.ipMonitoringRef = React.createRef();
        this.webContentMonitoringRef = React.createRef();
        this.emailMonitoringRef = React.createRef();
    }
 
    static propTypes = {
        sites: PropTypes.array.isRequired,
        getSites: PropTypes.func.isRequired,
        deleteSite: PropTypes.func.isRequired,
        addSite: PropTypes.func.isRequired,
        patchSite: PropTypes.func.isRequired,
        exportToMISP: PropTypes.func.isRequired,
        auth: PropTypes.object.isRequired,
        error: PropTypes.object.isRequired
    };
 
    componentDidMount() {
        this.props.getSites();
    }
 
    componentDidUpdate(prevProps) {
        const { sites, error } = this.props;
    
        if (sites !== prevProps.sites) {
            if (this.state.showExportModal) {
                const currentSite = sites.find((s) => s.id === this.state.id);
                if (currentSite) {
                    const uuid = this.extractUUID(currentSite?.misp_event_uuid);
                    this.setState({
                        eventUuid: uuid.at(-1) || ''
                    });
                }
            }
            this.setState({ addLoading: false, exportLoading: false });
        }
    
        if (error !== prevProps.error && error.status !== null) {
            this.setState({ addLoading: false, exportLoading: false });
        }
    
        if (sites !== prevProps.sites || error !== prevProps.error) {
            this.setState({ exportLoading: null });
        }
    }

    extractUUID = (raw) => {
        if (!raw) return [];
        if (Array.isArray(raw)) return raw.filter(uuid => uuid && uuid.trim() !== '');
        return raw.replace(/[\[\]'"\s]/g, '').split(',').filter(Boolean);
    };
 
    displayDeleteModal = (id, domainName) => {
        this.setState({
            showDeleteModal: true,
            id: id,
            domainName: domainName,
        });
    };
 
    deleteModal = () => {
        let handleClose;
        handleClose = () => {
            this.setState({
                showDeleteModal: false
            });
        };
 
        let onSubmit;
        onSubmit = e => {
            e.preventDefault();
            this.props.deleteSite(this.state.id, this.state.domainName);
            this.setState({
                domainName: "",
                id: 0
            });
            handleClose();
        };
 
        return (
            <Modal show={this.state.showDeleteModal} onHide={handleClose} centered>
                <Modal.Header closeButton>
                    <Modal.Title>Action Requested</Modal.Title>
                </Modal.Header>
                <Modal.Body>Are you sure you want to <b><u>delete</u></b> <b>{this.state.domainName}</b> website and
                    the <b>associated
                        alerts</b>?</Modal.Body>
                <Modal.Footer>
                    <form onSubmit={onSubmit}>
                        <Button variant="secondary" className="mr-2" onClick={handleClose}>
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
 
    displayEditModal = (site) => {
        site.expiry = site.expiry ? new Date(site.expiry) : null;
        this.setState({
            showEditModal: true,
            id: site.id,
            domainName: site.domain_name,
            ticketId: site.ticket_id,
            rtir: site.rtir,
            expiry: site.expiry,
            ipMonitoring: site.ip_monitoring,
            webContentMonitoring: site.content_monitoring,
            emailMonitoring: site.mail_monitoring
        });
    };
 
    editModal = () => {
        let handleClose;
        handleClose = () => {
            this.setState({
                showEditModal: false
            });
        };
 
        let onSubmit;
        onSubmit = e => {
            e.preventDefault();
            const domain_name = this.inputDomainRef.current.value;
            const ticket_id = this.inputTicketRef.current.value;
            const rtir = this.inputRtirRef.current ? this.inputRtirRef.current.value : null;
            const expiry = this.state.expiry ? this.state.expiry : null;
            const ip_monitoring = this.ipMonitoringRef.current.checked;
            const content_monitoring = this.webContentMonitoringRef.current.checked;
            const mail_monitoring = this.emailMonitoringRef.current.checked;
 
            const site = {domain_name, ticket_id, rtir, expiry, ip_monitoring, content_monitoring, mail_monitoring};
 
            this.props.patchSite(this.state.id, site);
            this.setState({
                day: "",
                id: 0
            });
            handleClose();
        };
 
        let handleOnChange;
        handleOnChange = e => {
            e.preventDefault();
        };
 
        return (
            <Modal show={this.state.showEditModal} onHide={handleClose} centered>
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
                                            <Form.Control required ref={this.inputDomainRef} size="md"
                                                          type="text"
                                                          pattern="^[a-zA-Z0-9]+(-[a-zA-Z0-9]+)*\.[a-zA-Z0-9]+(-[a-zA-Z0-9]+)*(?:\.[a-zA-Z]{2,})*$"
                                                          placeholder="example.com"
                                                          defaultValue={this.state.domainName}
                                                          onChange={handleOnChange}/>
                                        </Col>
                                        <Form.Label column sm="4">Ticket ID</Form.Label>
                                        <Col sm="8">
                                            <Form.Control
                                                ref={this.inputTicketRef} size="md"
                                                type="text"
                                                pattern="^[a-zA-Z0-9]+(-[a-zA-Z0-9]+)*(\.[a-zA-Z0-9]+(-[a-zA-Z0-9]+)*)*$"
                                                placeholder="240529-2e0a2"
                                                defaultValue={this.state.ticketId}/>
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
                                                value={this.state.expiry}
                                                onDayChange={expiry => this.setState({expiry})}/>
                                        </Col>
                                        <Form.Label column sm="6">Ip Monitoring</Form.Label>
                                        <Col sm="6">
                                            <Form.Check
                                                ref={this.ipMonitoringRef}
                                                defaultChecked={this.state.ipMonitoring}
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
                                                defaultChecked={this.state.webContentMonitoring}
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
                                                defaultChecked={this.state.emailMonitoring}
                                                className="mt-2"
                                                type="switch"
                                                id="custom-switch-3"
                                                label=""
                                            />
                                        </Col>
                                    </Form.Group>
                                    <Col md={{span: 6, offset: 7}}>
                                        <Button variant="secondary" className="mr-2" onClick={handleClose}>
                                            Close
                                        </Button>
                                        <Button type="submit" variant="warning">
                                            Update
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
 
    displayAddModal = () => {
        this.setState({
            showAddModal: true
        });
    };
 
    addModal = () => {
        let handleClose = () => {
            this.setState({ showAddModal: false });
        };
    
        let onSubmit = e => {
            e.preventDefault();
            const domain_name = this.inputDomainRef.current.value;
            const ticket_id = this.inputTicketRef.current.value;
            const expiry = this.state.day;
            const ip_monitoring = this.ipMonitoringRef.current.checked;
            const content_monitoring = this.webContentMonitoringRef.current.checked;
            const mail_monitoring = this.emailMonitoringRef.current.checked;
    
            const site = { domain_name, ticket_id, expiry, ip_monitoring, content_monitoring, mail_monitoring };
    
            this.props.addSite(site);
            this.setState({ domainName: "", day: "", ticketId: "", addLoading: true });
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
                                        <Col sm="8">
                                            <Form.Control required ref={this.inputDomainRef} size="md"
                                                          type="text"
                                                          pattern="^[a-zA-Z0-9]+(-[a-zA-Z0-9]+)*\.[a-zA-Z0-9]+(-[a-zA-Z0-9]+)*(?:\.[a-zA-Z]{2,})*$"
                                                          placeholder="example.com"
                                                          />
                                        </Col>
                                        <Form.Label column sm="4">Ticket ID</Form.Label>
                                        <Col sm="8">
                                            <Form.Control ref={this.inputTicketRef} size="md" type="text"
                                                          pattern="^[a-zA-Z0-9]+(-[a-zA-Z0-9]+)*(\.[a-zA-Z0-9]+(-[a-zA-Z0-9]+)*)*$"
                                                          placeholder="230509-200a2"
                                                          defaultValue={this.state.ticketId}/>
                                        </Col>
                                        <Form.Label column sm="4">Expiry Date</Form.Label>
                                        <Col sm="8">
                                            <DayPickerInput style={{ color: "black" }} formatDate={formatDate}
                                                            parseDate={parseDate}
                                                            placeholder={`${formatDate(new Date())}`}
                                                            dayPickerProps={{
                                                                disabledDays: { before: new Date() },
                                                                fromMonth: new Date(),
                                                                firstDayOfWeek: 1,
                                                                fixedWeeks: true,
                                                                showWeekNumbers: true
                                                            }}
                                                            onDayChange={day => this.setState({ day })}/>
                                        </Col>
                                        <Form.Label column sm="6">Ip Monitoring</Form.Label>
                                        <Col sm="6">
                                            <Form.Check ref={this.ipMonitoringRef} defaultChecked={true}
                                                        className="mt-2" type="switch" id="custom-switch" label=""/>
                                        </Col>
                                        <Form.Label column sm="6">Web Content Monitoring</Form.Label>
                                        <Col sm="6">
                                            <Form.Check ref={this.webContentMonitoringRef} defaultChecked={true}
                                                        className="mt-2" type="switch" id="custom-switch-2" label=""/>
                                        </Col>
                                        <Form.Label column sm="6">Email Monitoring</Form.Label>
                                        <Col sm="6">
                                            <Form.Check ref={this.emailMonitoringRef} defaultChecked={true}
                                                        className="mt-2" type="switch" id="custom-switch-3" label=""/>
                                        </Col>
                                    </Form.Group>
                                    <Col md={{ span: 5, offset: 8 }}>
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

    displayExportModal = (id, domainName, ticketId) => {
        const site = this.props.sites.find((s) => s.id === id);
        const uuid = this.extractUUID(site?.misp_event_uuid);
        this.setState({
          showExportModal: true,
          id,
          domainName,
          ticketId,
          eventUuid: uuid.at(-1) || ''
        });
      };
    
      exportModal = () => {
        const handleClose = () => {
          this.setState({ 
            showExportModal: false, 
            eventUuid: '', 
            showHelp: false 
        });
        };
    
        const currentSite = this.props.sites.find((site) => site.id === this.state.id);
        const uuid = this.extractUUID(currentSite?.misp_event_uuid);
        const latestUuid = uuid.at(-1) || '';
        
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
                onClick={() => {
                  const site = { 
                    id: this.state.id, 
                    event_uuid: (this.state.eventUuid.trim() || (isUpdate ? latestUuid : ''))
                  };
                  this.setState({ exportLoading: this.state.id });
                  this.props.exportToMISP(site);
                  handleClose();
                }}
                className="min-width-140"
                disabled={this.state.exportLoading === this.state.id}
              >
                {this.state.exportLoading === this.state.id ? (
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
    
      getMispStatusBadge = (site) => {
        const uuid = this.extractUUID(site.misp_event_uuid);
        return uuid.length ? (
          <span className="badge bg-info me-2" title="MISP Events">
            <i className="material-icons align-middle me-1" style={{ fontSize: 14 }}>
              cloud_done
            </i>
            {uuid.length}
          </span>
        ) : null;
      };

      exportButton = site => {
        const uuid = this.extractUUID(site.misp_event_uuid);
        const hasUuid = uuid.length > 0;
        
        return (
            <button 
                className={`btn btn-sm mr-2 ${
                    this.state.exportLoading === site.id ? 
                    'btn-outline-secondary disabled' : 
                    hasUuid ? 'btn-outline-success' : 'btn-outline-primary'
                }`}
                data-toggle="tooltip"
                data-placement="top" 
                title={hasUuid ? "Update MISP" : "Export to MISP"}
                onClick={() => this.displayExportModal(site.id, site.domain_name, site.ticket_id)}
                disabled={this.state.exportLoading === site.id}
            >
                {this.state.exportLoading === site.id ? (
                    <div className="loader">Loading...</div>
                ) : (
                    <i className="material-icons"
                    style={{fontSize: 17, lineHeight: 1.8, margin: -2.5}}>
                    {hasUuid ? 'cloud_done' : 'cloud_upload'}
                    </i>
                )}
            </button>
        );
    };

    render() {
        const yes_monitoring = (
            <i className="material-icons text-success mt-1 col-lg-12"
               data-toggle="tooltip" data-placement="top" title="Monitoring ongoing"
               style={{fontSize: 21}}>check_circle</i>
        );
        const no_monitoring = (
            <i className="material-icons text-warning mt-1 col-lg-12"
               data-toggle="tooltip" data-placement="top" title="Pending"
               style={{fontSize: 21}}>error</i>
        );
        const yes_status = status => (
            <i className="material-icons text-success mt-1 col-lg-12"
               data-toggle="tooltip" data-placement="top" title={status}
               style={{fontSize: 21}}>check_circle</i>
        );
        const no_status = status => (
            <i className="material-icons text-danger mt-1 col-lg-12"
               data-toggle="tooltip" data-placement="top" title={status === null ? "Website unreachable" : status}
               style={{fontSize: 21}}>error</i>
        );
 
        return (
            <Fragment>
                <div className="row">
                    <div className="col-lg-12">
                        <div className="float-left">
                            <h4>Suspicious Websites Monitored</h4>
                        </div>
                        <div className="float-right mr-1 mb-2">
                            <button className="btn btn-success" onClick={() => {
                                this.displayAddModal()
                            }} disabled={this.state.addLoading}>
                                {this.state.addLoading && (
                                    <div className="loader">Loading...</div>
                                )}
                                {!this.state.addLoading && (
                                    <i className="material-icons mr-1 align-middle"
                                       style={{fontSize: 23}}>&#xE147;</i>
                                )}
                                {!this.state.addLoading && <span className="align-middle">Add New Website</span>}
                            </button>
                        </div>
                    </div>
                </div>
                <div className="row">
                    <div className="col-lg-12">
                        <div style={{height: '500px', overflow: 'auto'}}>
                            <table className="table table-striped table-hover">
                                <thead>
                                <tr>
                                    <th>Domain Name</th>
                                    <th>Ticket ID</th>
                                    <th>Ip</th>
                                    <th>Ip Second</th>
                                    <th>MX Records</th>
                                    <th>Mail Server</th>
                                    <th>Monitored</th>
                                    <th style={{whiteSpace: 'nowrap'}}>Web Status</th>
                                    <th>Created At</th>
                                    <th>Expiry</th>
                                    <th/>
                                </tr>
                                </thead>
                                <tbody>
                                {this.props.sites.map(site => (
                                    <tr key={site.id}>
                                        <td><h5>{site.domain_name}</h5></td>
                                        <td><h5>{site.ticket_id ? site.ticket_id : "-"}</h5></td>
                                        <td>{site.ip ? site.ip : "-"}</td>
                                        <td>{site.ip_second ? site.ip_second : "-"}</td>
                                        <td>{site.MX_records ? site.MX_records.replace('[', '').replace(']', '').split("'").map(record => record) : "-"}</td>
                                        <td data-toggle="tooltip"
                                            title={"mail." + site.domain_name}>{site.mail_A_record_ip ? site.mail_A_record_ip : "-"}</td>
                                        <td>{site.monitored ? yes_monitoring : no_monitoring}</td>
                                        <td>{site.web_status === 200 ? yes_status(site.web_status) : no_status(site.web_status)}</td>
                                        <td>{(new Date(site.created_at)).toDateString()}</td>
                                        <td>{site.expiry ? (new Date(site.expiry)).toDateString() : "-"}</td>
                                        <td className="text-right" style={{whiteSpace: 'nowrap'}}>
                                            {site.monitored ? this.exportButton(site) : null}
                                            <button className="btn btn-outline-warning btn-sm mr-2"
                                                    data-toggle="tooltip"
                                                    data-placement="top" title="Edit" onClick={() => {
                                                this.displayEditModal(site)
                                            }}>
                                                <i className="material-icons"
                                                   style={{fontSize: 17, lineHeight: 1.8, margin: -2.5}}>edit</i>
                                            </button>
                                            <button className="btn btn-outline-danger btn-sm" data-toggle="tooltip"
                                                    data-placement="top" title="Delete" onClick={() => {
                                                this.displayDeleteModal(site.id, site.domain_name)
                                            }}>
                                                <i className="material-icons"
                                                   style={{fontSize: 17, lineHeight: 1.8, margin: -2.5}}>delete</i>
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
                {this.deleteModal()}
                {this.editModal()}
                {this.addModal()}
                {this.exportModal()}
            </Fragment>
        )
    }
}
 
const mapStateToProps = state => ({
    sites: state.SiteMonitoring.sites,
    auth: state.auth,
    error: state.errors,
    mispMessage: state.SiteMonitoring.mispMessage
});
 
export default connect(mapStateToProps, {
    getSites,
    deleteSite,
    addSite,
    patchSite,
    exportToMISP
})(SuspiciousSites);