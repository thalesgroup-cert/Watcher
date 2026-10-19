import React from "react";
import PropTypes from "prop-types";
import {connect} from "react-redux";
import {ProgressBar, Spinner} from "react-bootstrap";

// Shown while a bulk request is being processed (add, edit, delete, export...), for every module. Mounted once in
// App and fed by the "bulk" reducer, which actions/Bulk.js updates around each request.
export const BulkProgress = ({running}) => {
    if (!running) return null;
    const {label, total} = running;
    return (
        <div
            className="card shadow position-fixed top-0 start-50 translate-middle-x mt-3"
            style={{zIndex: 2000, minWidth: 320}}
            role="status"
            aria-live="polite"
        >
            <div className="card-body py-2">
                <div className="d-flex align-items-center">
                    <Spinner animation="border" size="sm" className="me-2"/>
                    <span>
                        {label || "Bulk action"}
                        {total > 0 && <span className="text-muted"> - {total} item{total === 1 ? "" : "s"}...</span>}
                    </span>
                </div>
                <ProgressBar animated now={100} className="mt-2" style={{height: 4}}/>
            </div>
        </div>
    );
};

BulkProgress.propTypes = {
    running: PropTypes.shape({label: PropTypes.string, total: PropTypes.number}),
};

const mapStateToProps = state => ({running: state.bulk.running});

export default connect(mapStateToProps)(BulkProgress);
