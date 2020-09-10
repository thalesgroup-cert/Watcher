import React, {Component, Fragment} from 'react';
import {connect} from 'react-redux';
import PropTypes from 'prop-types';
import {getAlerts, updateAlertStatus} from "../../actions/DnsFinder";
import Modal from "react-bootstrap/Modal";
import Button from "react-bootstrap/Button";


export class ArchivedAlerts extends Component {

    constructor(props) {
        super(props);
        this.state = {
            show: false,
            id: 0,
        }
    }

    static propTypes = {
        alerts: PropTypes.array.isRequired,
        getAlerts: PropTypes.func.isRequired,
        updateAlertStatus: PropTypes.func.isRequired,
        auth: PropTypes.object.isRequired
    };

    componentDidMount() {
        this.props.getAlerts();
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
            const status = true; // status = true -> Enable the alert
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
                <Modal.Body>Are you sure you want to <b><u>enable</u></b> this alert?</Modal.Body>
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

    render() {
        return (
            <Fragment>
                <div className="row">
                    <div className="col-lg-12">
                        <div className="float-left" style={{marginBottom: 12}}>
                            <h4>Archived Alerts</h4>
                        </div>
                    </div>
                </div>
                <div className="row">
                    <div className="col-lg-12">
                        <div style={{height: '400px', overflow: 'auto'}}>
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
                                    if (alert.status === false) {
                                        return (
                                            <tr key={alert.id}>
                                                <td><h5>#{alert.id}</h5></td>
                                                <td>{alert.dns_twisted.fuzzer}</td>
                                                <td>{alert.dns_twisted.domain_name}</td>
                                                <td>{alert.dns_twisted.dns_monitored.domain_name}</td>
                                                <td>{(new Date(alert.created_at)).toLocaleString()}</td>
                                                <td>
                                                    <button onClick={() => {
                                                        this.displayModal(alert.id)
                                                    }}
                                                            className="btn btn-outline-primary btn-sm">Enable
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
            </Fragment>
        )
    }
}

const mapStateToProps = state => ({
    alerts: state.DnsFinder.alerts,
    auth: state.auth
});

export default connect(mapStateToProps, {getAlerts, updateAlertStatus})(ArchivedAlerts);