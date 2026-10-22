import React, {Component} from "react";
import PropTypes from "prop-types";
import {connect} from "react-redux";
import {Button, Form, Modal} from "react-bootstrap";
import {bulkRun} from "../../actions/Bulk";
import { SITE_BULK } from "../../actions/SiteMonitoring";


const MODES = {
    legitimate: {
        title: "Export to Legitimate Domains",
        action: "bulk_export_legitimate",
        helpTitle: "Need help with Legitimate Domains export?",
        warning: "Each exported site is removed from Website Monitoring.",
        help: [
            "Each selected site is added to Legitimate Domains with its ticket ID and domain expiry date.",
            "Once a site is exported, it is deleted from Website Monitoring (with its alerts and timeline).",
            "A site is only deleted if it was exported: domains that already exist in Legitimate Domains are skipped and kept.",
            "You need the permission to delete sites to use this export.",
            "If you leave the comment empty, a default one is used for each site, including its original legitimacy.",
        ],
    },
    misp: {
        title: "Export to MISP",
        action: "bulk_export_misp",
        helpTitle: "Need help with MISP export?",
        help: [
            "One MISP event is used per site, never one event for the whole selection.",
            "A site that was never exported gets a new event, named after its domain.",
            "A site that was already exported updates its latest event, like the single export does by default.",
            "To send several sites to the same event, use the export of each site and give the same Event UUID.",
            "Sites are exported one after the other, so a large selection can take a while.",
        ],
    },
};

// "Export selected sites" confirmation, opened from the bulk action bar of Website Monitoring.
export class BulkSiteExportModal extends Component {
    state = {comment: "", showHelp: false, running: false};

    static propTypes = {
        show: PropTypes.bool.isRequired,
        mode: PropTypes.oneOf(["legitimate", "misp"]),
        ids: PropTypes.array,
        onClose: PropTypes.func.isRequired,
        onDone: PropTypes.func,
        bulkRun: PropTypes.func.isRequired,
    };

    close = () => {
        this.setState({comment: "", showHelp: false, running: false});
        this.props.onClose();
    };

    submit = async () => {
        const {mode, ids, onDone, bulkRun} = this.props;
        const config = MODES[mode];
        this.setState({running: true});
        await bulkRun({
            target: SITE_BULK,
            action: config.action,
            body: mode === "legitimate" ? {ids, comment: this.state.comment} : {ids},
            label: config.title,
            onDone,
        });
        this.close();
    };

    render() {
        const {show, mode, ids} = this.props;
        if (!show || !mode) return null;
        const config = MODES[mode];
        const {comment, showHelp, running} = this.state;
        return (
            <Modal show onHide={this.close} centered backdropClassName="modal-backdrop-dark">
                <Modal.Header closeButton>
                    <Modal.Title>{config.title}</Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    <p>{ids.length} site{ids.length === 1 ? "" : "s"} selected.</p>
                    {config.warning && <p className="text-danger fw-semibold">{config.warning}</p>}

                    <div className="mb-3">
                        <div
                            className="d-flex align-items-center"
                            onClick={() => this.setState(prev => ({showHelp: !prev.showHelp}))}
                            style={{cursor: "pointer"}}
                        >
                            <i className="material-icons text-primary me-2">{showHelp ? "expand_less" : "expand_more"}</i>
                            <span className="text-muted">{config.helpTitle}</span>
                        </div>
                        {showHelp && (
                            <div className="mt-3 ps-4 border-start border-primary">
                                <ul className="mb-0 ps-3 text-muted">
                                    {config.help.map(line => <li key={line}>{line}</li>)}
                                </ul>
                            </div>
                        )}
                    </div>

                    {mode === "legitimate" && (
                        <Form.Group>
                            <Form.Label><strong>Comment</strong> (optional, applied to every domain)</Form.Label>
                            <Form.Control
                                as="textarea"
                                rows={3}
                                maxLength={300}
                                value={comment}
                                onChange={e => this.setState({comment: e.target.value})}
                                placeholder="Exported from Website Monitoring"
                            />
                        </Form.Group>
                    )}
                </Modal.Body>
                <Modal.Footer className="justify-content-between">
                    <Button variant="secondary" onClick={this.close} disabled={running}>Cancel</Button>
                    <Button variant="primary" onClick={this.submit} disabled={running}>
                        <i className="material-icons me-1 align-middle" style={{ fontSize: 18 }}>cloud_upload</i>
                        <span className="align-middle">{running ? "Exporting..." : `Export ${ids.length} site${ids.length === 1 ? "" : "s"}`}</span>
                    </Button>
                </Modal.Footer>
            </Modal>
        );
    }
}

export default connect(null, {bulkRun})(BulkSiteExportModal);
