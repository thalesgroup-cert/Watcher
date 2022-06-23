import React, {Component, Fragment} from 'react';
import {connect} from 'react-redux';
import PropTypes from 'prop-types';
import {getSites, deleteSite, addSite, patchSite, exportToTheHive, exportToMISP} from "../../actions/SiteMonitoring";
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
            name: "",
            rtir: "",
            expiry: null,
            ipMonitoring: null,
            webContentMonitoring: null,
            emailMonitoring: null,
            theHiveCaseId: null,
            mispEventId: null,
            addLoading: false,
            exportLoading: false
        };
        this.inputDomainRef = React.createRef();
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
        exportToTheHive: PropTypes.func.isRequired,
        exportToMISP: PropTypes.func.isRequired,
        auth: PropTypes.object.isRequired,
        error: PropTypes.object.isRequired,
    };

    componentDidMount() {
        this.props.getSites();
    }

    componentDidUpdate(prevProps) {
        if (this.props.sites !== prevProps.sites) {
            this.setState({
                addLoading: false,
                exportLoading: false
            });
        }
        if (this.props.error !== prevProps.error) {
            if (this.props.error.status !== null) {
                this.setState({
                    addLoading: false,
                    exportLoading: false
                });
            }
        }
    }

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
            const rtir = this.inputRtirRef.current.value;
            const expiry = this.state.expiry ? this.state.expiry : null;
            const ip_monitoring = this.ipMonitoringRef.current.checked;
            const content_monitoring = this.webContentMonitoringRef.current.checked;
            const mail_monitoring = this.emailMonitoringRef.current.checked;

            const site = {domain_name, rtir, expiry, ip_monitoring, content_monitoring, mail_monitoring};

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
                                                          pattern="(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9][a-z0-9-]{0,61}[a-z0-9]"
                                                          placeholder="example.com"
                                                          defaultValue={this.state.domainName}
                                                          onChange={handleOnChange}/>
                                        </Col>
                                        <Form.Label column sm="4">Ticket ID</Form.Label>
                                        <Col sm="8">
                                            <Form.Control required ref={this.inputRtirRef} size="md"
                                                          type="number" placeholder="number"
                                                          defaultValue={this.state.rtir}/>
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
        let handleClose;
        handleClose = () => {
            this.setState({
                showAddModal: false
            });
        };

        let getMax;
        getMax = (arr, prop) => {
            var max;
            if (arr.length !== 0) {
                for (var i=0 ; i<arr.length ; i++) {
                    if (max == null || parseInt(arr[i][prop]) > parseInt(max[prop]))
                        max = arr[i];
                }
                max=max.rtir
            } else {
                max=0;
            }
            return max;
        };

        let onSubmit;
        onSubmit = e => {
            e.preventDefault();
            const domain_name = this.inputDomainRef.current.value;
            const rtir = this.inputRtirRef.current.value ? this.inputRtirRef.current.value : getMax(this.props.sites, "rtir")+1;
            const expiry = this.state.day;
            const ip_monitoring = this.ipMonitoringRef.current.checked;
            const content_monitoring = this.webContentMonitoringRef.current.checked;
            const mail_monitoring = this.emailMonitoringRef.current.checked;
            const site = expiry ? {domain_name, rtir, expiry, ip_monitoring, content_monitoring, mail_monitoring} : {domain_name, rtir, ip_monitoring, content_monitoring, mail_monitoring};

            this.props.addSite(site);
            this.setState({
                domainName: "",
                day: "",
                id: 0,
                addLoading: true
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
                                            <Form.Control required ref={this.inputDomainRef} size="md"
                                                          type="text"
                                                          pattern="(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9][a-z0-9-]{0,61}[a-z0-9]"
                                                          placeholder="example.com"/>
                                        </Col>
                                        <Form.Label column sm="4">Ticket ID</Form.Label>
                                        <Col sm="8">
                                            <Form.Control ref={this.inputRtirRef} size="md"
                                                          type="number" placeholder="number"/>
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


    displayExportModal = (id, domainName, theHiveCaseId, mispEventId) => {
        this.setState({
            showExportModal: true,
            id: id,
            domainName: domainName,
            theHiveCaseId: theHiveCaseId,
            mispEventId: mispEventId
        });
    };

    exportModal = () => {
        let handleClose;
        handleClose = () => {
            this.setState({
                showExportModal: false
            });
        };

        let onSubmitTheHive;
        onSubmitTheHive = e => {
            e.preventDefault();
            const id = this.state.id;
            const site = {id};

            this.props.exportToTheHive(site);
            this.setState({
                domainName: "",
                id: 0,
                exportLoading: id
            });
            handleClose();
        };

        let onSubmitMisp;
        onSubmitMisp = e => {
            e.preventDefault();
            const id = this.state.id;
            const site = {id};

            this.props.exportToMISP(site);
            this.setState({
                domainName: "",
                id: 0,
                exportLoading: id
            });
            handleClose();
        };

        const theHiveExportButton = (
            <Button type="submit" className="btn-thehive">
                Export to TheHive
            </Button>);
        const theHiveUpdateButton = (
            <Button type="submit" className="btn-thehive">
                Update TheHive IOCs
            </Button>);
        const mispExportButton = (
            <Button type="submit" className="btn-misp">
                Export to MISP
            </Button>);
        const mispUpdateButton = (
            <Button type="submit" className="btn-misp">
                Update MISP IOCs
            </Button>);

        return (
            <Modal show={this.state.showExportModal} onHide={handleClose} centered>
                <Modal.Header closeButton>
                    <Container fluid>
                        <Row className="show-grid">
                            <Col md={{span: 12}}>
                                <Modal.Title>Action Requested</Modal.Title>
                            </Col>
                            <Col md={{span: 12}} style={{paddingTop: 12, marginLeft: 20}} className="my-auto">
                                <img src="/static/img/thehive_misp_logo.png" style={{maxWidth: "60%", maxHeight: "60%"}}
                                     className="mx-auto d-block"
                                     alt="TheHive & MISP Logo"/>
                            </Col>
                        </Row>
                    </Container>
                </Modal.Header>
                <Modal.Body>
                    <p>Export <b>{this.state.domainName}</b> & <b>IOCs</b> to <b><u>TheHive</u></b> or <b><u>MISP</u></b>:
                    </p>
                </Modal.Body>
                <Modal.Footer>
                    <form onSubmit={onSubmitTheHive}>
                        <Button variant="secondary" className="mr-2" onClick={handleClose}>
                            Close
                        </Button>
                        {this.state.theHiveCaseId ? theHiveUpdateButton : theHiveExportButton}
                    </form>
                    <form onSubmit={onSubmitMisp}>
                        {this.state.mispEventId ? mispUpdateButton : mispExportButton}
                    </form>
                </Modal.Footer>
            </Modal>
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
        const exportButton = site => (
            <button className="btn btn-outline-primary btn-sm mr-2"
                    data-toggle="tooltip"
                    data-placement="top" title="Export" onClick={() => {
                this.displayExportModal(site.id, site.domain_name, site.the_hive_case_id, site.misp_event_id)
            }} disabled={this.state.exportLoading === site.id}>

                {this.state.exportLoading === site.id && (
                    <div className="loader">Loading...</div>
                )}
                {this.state.exportLoading !== site.id && (
                    <i className="material-icons"
                       style={{fontSize: 17, lineHeight: 1.8, margin: -2.5}}>cloud_upload</i>
                )}
            </button>
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
                                    <th>Ticket ID</th>
                                    <th>Domain Name</th>
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
                                        <td><h5>#{site.rtir}</h5></td>
                                        <td><h5>{site.domain_name}</h5></td>
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
                                            {site.monitored ? exportButton(site) : null}
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
    error: state.errors
});

export default connect(mapStateToProps, {
    getSites,
    deleteSite,
    addSite,
    patchSite,
    exportToTheHive,
    exportToMISP
})(SuspiciousSites);