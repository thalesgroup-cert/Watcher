import React from "react";
import PropTypes from "prop-types";
import {connect} from "react-redux";
import {Badge, Button, Modal, Table} from "react-bootstrap";
import {clearBulkResult} from "../../actions/Bulk";

const OK_VARIANTS = {skipped: "warning", error: "danger"};
// Wording of the success counter, per kind of bulk action
const OK_WORDS = {created: "created", deleted: "deleted", updated: "updated", exported: "exported"};

// Per-item summary of a bulk action, mounted once in App and fed by the "bulk" reducer.
export const BulkResultModal = ({result, clearBulkResult}) => {
    if (!result) return null;
    const okStatus = result.ok_status || "created";
    const okWord = result.dry_run ? `would be ${okStatus}` : (OK_WORDS[okStatus] || okStatus);
    return (
        <Modal show onHide={clearBulkResult} centered size="lg" scrollable backdropClassName="modal-backdrop-dark">
            <Modal.Header closeButton>
                <Modal.Title>{result.label || "Bulk action"} - summary</Modal.Title>
            </Modal.Header>
            <Modal.Body>
                {result.dry_run && (
                    <p className="text-muted">Preview only: nothing has been saved yet.</p>
                )}
                <p>
                    <Badge bg="success" className="me-2">{result.succeeded} {okWord}</Badge>
                    <Badge bg="warning" text="dark" className="me-2">{result.skipped} skipped</Badge>
                    <Badge bg="danger">{result.errors} error{result.errors === 1 ? "" : "s"}</Badge>
                </p>
                <Table size="sm" striped>
                    <thead>
                        <tr><th>Value</th><th>Status</th><th>Reason</th></tr>
                    </thead>
                    <tbody>
                        {result.results.map((item, index) => (
                            <tr key={`${item.value}-${index}`}>
                                <td>{item.value}</td>
                                <td>
                                    <Badge bg={OK_VARIANTS[item.status] || "success"} text={item.status === "skipped" ? "dark" : undefined}>
                                        {item.status}
                                    </Badge>
                                </td>
                                <td>{item.reason}</td>
                            </tr>
                        ))}
                    </tbody>
                </Table>
            </Modal.Body>
            <Modal.Footer>
                <Button variant="secondary" onClick={clearBulkResult}>Close</Button>
            </Modal.Footer>
        </Modal>
    );
};

BulkResultModal.propTypes = {
    result: PropTypes.object,
    clearBulkResult: PropTypes.func.isRequired,
};

const mapStateToProps = state => ({result: state.bulk.result});

export default connect(mapStateToProps, {clearBulkResult})(BulkResultModal);
