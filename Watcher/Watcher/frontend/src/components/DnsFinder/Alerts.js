import React, {Component, Fragment} from 'react';
import {connect} from 'react-redux';
import PropTypes from 'prop-types';
import {getAlerts, updateAlertStatus, exportToTheHive, exportToMISP} from "../../actions/DnsFinder";
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
            showExportModal: false,
            id: 0,
            exportLoading: false,
            exportLoadingMISPTh: false,
            theHiveCaseId: null,
            mispEventId: null,
            domainName: ""
        };
        this.inputRtirRef = React.createRef();
        this.ipMonitoringRef = React.createRef();
        this.webContentMonitoringRef = React.createRef();
        this.emailMonitoringRef = React.createRef();
    }

    static propTypes = {
        sites: PropTypes.array.isRequired,
        addSite: PropTypes.func.isRequired,
        getSite: PropTypes.func.isRequired,
        alerts: PropTypes.array.isRequired,
        getAlerts: PropTypes.func.isRequired,
        updateAlertStatus: PropTypes.func.isRequired,
        exportToTheHive: PropTypes.func.isRequired,
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

        let onSubmit;
        onSubmit = e => {
            e.preventDefault();
            const domain_name = this.state.domainName;
            const rtir = this.inputRtirRef.current.value;
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
                                        <Form.Label column sm="4">RTIR</Form.Label>
                                        <Col sm="8">
                                            <Form.Control required ref={this.inputRtirRef} size="md"
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
                exportLoadingMISPTh: id
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
                exportLoadingMISPTh: id
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
        const exportButtonMISPTh = alert => (
            <button className="btn btn-outline-primary btn-sm mr-2"
                    data-toggle="tooltip"
                    data-placement="top" title="Export" onClick={() => {
                this.displayExportModal(alert.dns_twisted.id, alert.dns_twisted.domain_name, alert.dns_twisted.the_hive_case_id, alert.dns_twisted.misp_event_id)
            }} disabled={this.state.exportLoadingMISPTh === alert.id}>

                {this.state.exportLoadingMISPTh === alert.id && (
                    <div className="loader">Loading...</div>
                )}
                {this.state.exportLoadingMISPTh !== alert.id && (
                    <i className="material-icons"
                       style={{fontSize: 17, lineHeight: 1.8, margin: -2.5}}>cloud_upload</i>
                )}
            </button>
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
                                    <th>Fuzzer</th>
                                    <th>Twisted DNS</th>
                                    <th>Related To</th>
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
                                                <td>{alert.dns_twisted.fuzzer}</td>
                                                <td>{alert.dns_twisted.domain_name}</td>
                                                <td>{alert.dns_twisted.dns_monitored.domain_name}</td>
                                                <td>{(new Date(alert.created_at)).toLocaleString()}</td>
                                                <td className="text-right" style={{whiteSpace: 'nowrap'}}>
                                                    <button onClick={() => {
                                                        this.displayModal(alert.id)
                                                    }}
                                                            className="btn btn-outline-primary btn-sm mr-2">Disable
                                                    </button>
                                                    {exportButtonMISPTh(alert)}
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

export default connect(mapStateToProps, {getAlerts, updateAlertStatus, addSite, getSites, exportToTheHive, exportToMISP})(Alerts);