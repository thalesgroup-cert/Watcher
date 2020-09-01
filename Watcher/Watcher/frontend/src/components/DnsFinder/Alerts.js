import React, {Component, Fragment} from 'react';
import {connect} from 'react-redux';
import PropTypes from 'prop-types';
import {getAlerts, updateAlertStatus} from "../../actions/DnsFinder";
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
            id: 0,
            exportLoading: false,
            domainName: ""
        };
        this.inputRtirRef = React.createRef();
    }

    static propTypes = {
        sites: PropTypes.array.isRequired,
        addSite: PropTypes.func.isRequired,
        getSite: PropTypes.func.isRequired,
        alerts: PropTypes.array.isRequired,
        getAlerts: PropTypes.func.isRequired,
        updateAlertStatus: PropTypes.func.isRequired,
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
        if (this.props.error !== prevProps.error) {
            if (this.props.error.status !== null) {
                this.setState({
                    exportLoading: false
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
            const site = expiry ? {domain_name, rtir, expiry} : {domain_name, rtir};

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

export default connect(mapStateToProps, {getAlerts, updateAlertStatus, addSite, getSites})(Alerts);