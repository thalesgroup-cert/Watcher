import React, {Component, Fragment} from 'react';
import {connect} from 'react-redux';
import PropTypes from 'prop-types';
import {getSiteAlerts, updateSiteAlertStatus} from "../../actions/SiteMonitoring";
import Modal from "react-bootstrap/Modal";
import Button from "react-bootstrap/Button";


export class Alerts extends Component {

    constructor(props) {
        super(props);
        this.state = {
            show: false,
            id: 0,
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
                                    <th>New Ip</th>
                                    <th>New Ip Second</th>
                                    <th>Old Ip</th>
                                    <th>Old Ip Second</th>
                                    <th>Difference Score</th>
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
                                                <td>{alert.new_ip ? alert.new_ip : "-"}</td>
                                                <td>{alert.new_ip_second ? alert.new_ip_second : "-"}</td>
                                                <td>{alert.old_ip ? alert.old_ip : "-"}</td>
                                                <td>{alert.old_ip_second ? alert.old_ip_second : "-"}</td>
                                                <td>{alert.difference_score ? alert.difference_score : "-"}</td>
                                                <td>{(new Date(alert.created_at)).toLocaleString()}</td>
                                                <td>
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
            </Fragment>
        )
    }
}

const mapStateToProps = state => ({
    alerts: state.SiteMonitoring.alerts,
    auth: state.auth
});

export default connect(mapStateToProps, {getSiteAlerts, updateSiteAlertStatus})(Alerts);