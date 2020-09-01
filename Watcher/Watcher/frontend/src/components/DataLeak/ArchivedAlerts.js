import React, {Component, Fragment} from 'react';
import {connect} from 'react-redux';
import PropTypes from 'prop-types';
import {getAlerts, updateAlertStatus} from "../../actions/DataLeak";
import Modal from "react-bootstrap/Modal";
import Button from "react-bootstrap/Button";
import InputGroup from "react-bootstrap/InputGroup";
import FormControl from "react-bootstrap/FormControl";

export class ArchivedAlerts extends Component {

    constructor(props) {
        super(props);
        this.state = {
            show: false,
            showContentModal: false,
            id: 0,
            keyword: "",
            name: "",
            content: ""
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
                <Modal.Body>Are you sure you want to <u><b>enable</b></u> this alert?</Modal.Body>
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

    displayContentModal = (id, keyword, content) => {
        this.setState({
            showContentModal: true,
            id: id,
            keyword: keyword,
            content: content
        });
    };

    contentModal = () => {
        let handleClose;
        handleClose = () => {
            this.setState({
                showContentModal: false
            });
        };

        function download(filename, text) {
            let element = document.createElement('a');
            element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(text));
            element.setAttribute('download', filename);

            element.style.display = 'none';
            document.body.appendChild(element);

            element.click();

            document.body.removeChild(element);
        }

        let onSubmit;
        onSubmit = e => {
            e.preventDefault();
            // Start file download.
            download(`#${this.state.id}_raw.txt`, this.state.content);
        };

        return (
            <Modal size="lg" show={this.state.showContentModal} onHide={handleClose} centered>
                <Modal.Header closeButton>
                    <Modal.Title><b>#{this.state.id}</b>: <b>{this.state.keyword}</b> was found</Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    <InputGroup>
                        <InputGroup.Prepend>
                            <InputGroup.Text>Raw</InputGroup.Text>
                        </InputGroup.Prepend>
                        <FormControl as="textarea" rows={10} value={this.state.content} readOnly={true}/>
                    </InputGroup>
                </Modal.Body>
                <Modal.Footer>
                    <form onSubmit={onSubmit}>
                        <Button type="submit" variant="success" className="mr-2">
                            Download
                        </Button>
                        <Button variant="secondary" onClick={handleClose}>
                            Close
                        </Button>
                    </form>
                </Modal.Footer>
            </Modal>
        );
    };

    getTitleAtUrl = (url) => {
        let lastChar = url.substr(url.length - 1);
        if (lastChar === '/') {
            let urlTab = url.split('/', 20);
            return urlTab[urlTab.length - 2];
        } else {
            return url.split('/', 20).pop();
        }
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
                        <div style={{height: '300px', overflow: 'auto'}}>
                            <table className="table table-striped table-hover">
                                <thead>
                                <tr>
                                    <th>ID</th>
                                    <th>Keyword</th>
                                    <th>From</th>
                                    <th>Info</th>
                                    <th>Source</th>
                                    <th>Created At</th>
                                    <th/>
                                </tr>
                                </thead>
                                <tbody>
                                {this.props.alerts.map(alert => {
                                    let domainName = alert.url.split('//', 2)[1].split('/', 20)[0];
                                    if (alert.status === false) {
                                        let pastContentButton;
                                        if (domainName === "pastebin.com") {
                                            pastContentButton =
                                                <button onClick={() => {
                                                    this.displayContentModal(alert.id, alert.keyword.name, alert.content)
                                                }}
                                                        className="btn btn-info btn-sm ml-2">Content
                                                </button>;
                                        }
                                        return (
                                            <tr key={alert.id}>
                                                <td><h5>#{alert.id}</h5></td>
                                                <td>{alert.keyword.name}</td>
                                                <td>{domainName}</td>
                                                <td><h5>{this.getTitleAtUrl(alert.url)}</h5></td>
                                                <td style={{whiteSpace: 'nowrap'}}>
                                                    <button onClick={() => {
                                                        window.open(alert.url, '_blank', 'noreferrer');
                                                    }} rel="noreferrer"
                                                            className="btn btn-primary btn-sm">Link
                                                    </button>
                                                    {pastContentButton}
                                                </td>
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
                {this.contentModal()}
            </Fragment>
        )
    }
}

const mapStateToProps = state => ({
    alerts: state.DataLeak.alerts,
    auth: state.auth
});

export default connect(mapStateToProps, {getAlerts, updateAlertStatus})(ArchivedAlerts);