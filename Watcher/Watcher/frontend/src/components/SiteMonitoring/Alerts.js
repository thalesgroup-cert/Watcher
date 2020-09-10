import React, {Component, Fragment} from 'react';
import {connect} from 'react-redux';
import PropTypes from 'prop-types';
import {getSiteAlerts, updateSiteAlertStatus} from "../../actions/SiteMonitoring";
import Modal from "react-bootstrap/Modal";
import Button from "react-bootstrap/Button";
import Container from "react-bootstrap/Container";
import Row from "react-bootstrap/Row";
import Col from "react-bootstrap/Col";
import Form from "react-bootstrap/Form";


export class Alerts extends Component {

    constructor(props) {
        super(props);
        this.state = {
            show: false,
            showInfoModal: false,
            alert: "",
            id: 0
        }
    }

    static propTypes = {
        alerts: PropTypes.array.isRequired,
        getSiteAlerts: PropTypes.func.isRequired,
        updateSiteAlertStatus: PropTypes.func.isRequired,
        auth: PropTypes.object.isRequired
    };

    componentDidMount() {
        this.props.getSiteAlerts();
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
            this.props.updateSiteAlertStatus(this.state.id, json_status);
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

    displayInfo = (alert) => {
        this.setState({
            showInfoModal: true,
            alert : alert
        });
    };

    infoModal = () => {
        let handleClose;
        handleClose = () => {
            this.setState({
                showInfoModal: false
            });
        };

        let onSubmit;
        onSubmit = e => {
            e.preventDefault();
            handleClose();
        };
        return (
            <Modal show={this.state.showInfoModal} onHide={handleClose} centered>
                <Modal.Header closeButton>
                    <Modal.Title><b>#{this.state.alert.id}</b>  Details of changes</Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    <Container>
                        <Row className="show-grid">
                            <Col md={{span: 12}}>
                                <Form onSubmit={onSubmit}>
                                    <Form.Group as={Row}>
                                        <Form.Label column sm="4">Difference Score</Form.Label>
                                        <Col sm="8" className="mt-2">
                                            {this.state.alert.difference_score ? this.state.alert.difference_score : "-"}
                                        </Col>
                                        <Form.Label column sm="4">New Ip</Form.Label>
                                        <Col sm="8" className="mt-2">
                                            {this.state.alert.new_ip ? this.state.alert.new_ip : "-"}
                                        </Col>
                                        <Form.Label column sm="4">Old Ip</Form.Label>
                                        <Col sm="8" className="mt-2">
                                            {this.state.alert.old_ip ? this.state.alert.old_ip : "-"}
                                        </Col>
                                        <Form.Label column sm="4">New Ip Second</Form.Label>
                                        <Col sm="8" className="mt-2">
                                            {this.state.alert.new_ip_second ? this.state.alert.new_ip_second : "-"}
                                        </Col>
                                        <Form.Label column sm="4">Old Ip Second</Form.Label>
                                        <Col sm="8" className="mt-2">
                                            {this.state.alert.old_ip_second ? this.state.alert.old_ip_second : "-"}
                                        </Col>
                                        <Form.Label column sm="4">New MX Records</Form.Label>
                                        <Col sm="8" className="mt-2">
                                            {this.state.alert.new_MX_records ? this.state.alert.new_MX_records : "-"}
                                        </Col>
                                        <Form.Label column sm="4">Old MX Records</Form.Label>
                                        <Col sm="8" className="mt-2">
                                            {this.state.alert.old_MX_records ? this.state.alert.old_MX_records : "-"}
                                        </Col>
                                        <Form.Label column sm="4">New Mail Server</Form.Label>
                                        <Col sm="8" className="mt-2">
                                            {this.state.alert.new_mail_A_record_ip ? this.state.alert.new_mail_A_record_ip : "-"}
                                        </Col>
                                        <Form.Label column sm="4">Old Mail Server</Form.Label>
                                        <Col sm="8" className="mt-2">
                                            {this.state.alert.old_mail_A_record_ip ? this.state.alert.old_mail_A_record_ip : "-"}
                                        </Col>
                                    </Form.Group>
                                    <Col md={{span: 3, offset: 10}}>
                                        <Button variant="secondary" onClick={handleClose}>
                                            Close
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

    render() {
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
                        <div style={{height: '300px', overflow: 'auto'}}>
                            <table className="table table-striped table-hover">
                                <thead>
                                <tr>
                                    <th>ID</th>
                                    <th>Type</th>
                                    <th>Domain Name</th>
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
                                                <td>{alert.type}</td>
                                                <td>{alert.site.domain_name}</td>
                                                <td>{(new Date(alert.created_at)).toLocaleString()}</td>
                                                <td>
                                                    <button onClick={() => {
                                                        this.displayInfo(alert)
                                                    }}
                                                            className="btn btn-primary btn-sm mr-2">Records Details
                                                    </button>
                                                    <button onClick={() => {
                                                        this.displayModal(alert.id)
                                                    }}
                                                            className="btn btn-outline-primary btn-sm">Disable
                                                    </button>
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
                {this.infoModal()}
            </Fragment>
        )
    }
}

const mapStateToProps = state => ({
    alerts: state.SiteMonitoring.alerts,
    auth: state.auth
});

export default connect(mapStateToProps, {getSiteAlerts, updateSiteAlertStatus})(Alerts);