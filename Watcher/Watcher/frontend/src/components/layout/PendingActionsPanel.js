import React, { useState, useEffect, useRef, useCallback } from 'react';
import { connect } from 'react-redux';
import PropTypes from 'prop-types';
import { Modal, Button, Badge, Card, ListGroup, Container, Row, Col, Form } from 'react-bootstrap';
import {
    getPendingActionsCount,
    getPendingActions,
    approvePendingAction,
    rejectPendingAction,
} from '../../actions/PendingActions';

const formatMetaValue = (key, value) => {
    if (key === 'decision_date' && value) {
        const d = new Date(value);
        if (!isNaN(d.getTime())) {
            return d.toLocaleString();
        }
    }
    return String(value ?? '-');
};

const HIDDEN_META_KEYS = new Set(['site_id', 'comment']);

const MetaLabel = (key) =>
    key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

const ActionDetailModal = ({ action, onClose, onApprove, onReject, loading }) => {
    if (!action) return null;

    const meta = action.metadata || {};
    const metaRows = Object.entries(meta).filter(([k]) => !HIDDEN_META_KEYS.has(k));

    return (
        <Modal show onHide={onClose} centered size="lg" style={{ zIndex: 1060 }}>
            <Modal.Header closeButton>
                <Modal.Title>
                    Pending Action -{' '}
                    <span style={{ fontWeight: 'bold' }}>{action.title}</span>
                </Modal.Title>
            </Modal.Header>

            <Modal.Body>
                <Container>
                    <Row>
                        <Col md={12}>
                            <Form.Group as={Row} className="mb-1">
                                <Form.Label column sm="4">Action Type</Form.Label>
                                <Col sm="8" className="mt-2">
                                    <Badge bg="secondary">
                                        {action.action_type_label || action.action_type}
                                    </Badge>
                                </Col>

                                <Form.Label column sm="4">Status</Form.Label>
                                <Col sm="8" className="mt-2">
                                    <Badge bg={
                                        action.status === 'approved' ? 'success' :
                                        action.status === 'rejected' ? 'danger' : 'warning'
                                    }>
                                        {action.status}
                                    </Badge>
                                </Col>

                                <Form.Label column sm="4">Created At</Form.Label>
                                <Col sm="8" className="mt-2">
                                    {new Date(action.created_at).toLocaleString()}
                                </Col>

                                <Col sm="12" className="mt-3 mb-2"><hr /></Col>

                                <Form.Label column sm="4" className="fw-bold">Description</Form.Label>
                                <Col sm="8" className="mt-2" style={{ whiteSpace: 'pre-wrap' }}>
                                    {action.description}
                                </Col>

                                {metaRows.length > 0 && (
                                    <>
                                        <Col sm="12" className="mt-3 mb-2"><hr /></Col>
                                        {metaRows.map(([k, v]) => (
                                            <React.Fragment key={k}>
                                                <Form.Label column sm="4" className="fw-bold">
                                                    {MetaLabel(k)}
                                                </Form.Label>
                                                <Col sm="8" className="mt-2">
                                                    {formatMetaValue(k, v)}
                                                </Col>
                                            </React.Fragment>
                                        ))}
                                    </>
                                )}

                                {meta.comment && (
                                    <>
                                        <Col sm="12" className="mt-3 mb-2"><hr /></Col>
                                        <Form.Label column sm="4" className="fw-bold">
                                            Comment that will be added
                                        </Form.Label>
                                        <Col sm="8" className="mt-2">
                                            <div className="alert alert-success mb-0 d-flex gap-2" role="alert">
                                                <i className="material-icons align-self-start" style={{ fontSize: 18 }}>comment</i>
                                                <span>{meta.comment}</span>
                                            </div>
                                        </Col>
                                    </>
                                )}
                            </Form.Group>

                            <div className="text-end mt-4 d-flex justify-content-end gap-2">
                                <Button variant="outline-danger" onClick={() => onReject(action.id)} disabled={loading}>
                                    Reject
                                </Button>
                                <Button variant="success" onClick={() => onApprove(action.id)} disabled={loading}>
                                    Approve &amp; Execute
                                </Button>
                            </div>
                        </Col>
                    </Row>
                </Container>
            </Modal.Body>
        </Modal>
    );
};

const ActionItem = ({ action, onSelectAction, onApprove, onReject, loading }) => (
    <ListGroup.Item className="px-3 py-2">
        <div className="d-flex align-items-start gap-2">
            <i className="material-icons text-warning flex-shrink-0" style={{ fontSize: 18, marginTop: 2 }}>
                notifications_none
            </i>
            <div className="flex-grow-1" style={{ minWidth: 0 }}>
                <div
                    className="fw-semibold mb-1 small"
                    style={{ cursor: 'pointer' }}
                    onClick={() => onSelectAction(action)}
                >
                    {action.title}
                </div>
                <div className="text-muted mb-2 small">
                    <Badge bg="secondary">
                        {action.action_type_label || action.action_type}
                    </Badge>
                    <span className="ms-2">
                        {new Date(action.created_at).toLocaleString()}
                    </span>
                </div>
                <div className="d-flex gap-1">
                    <Button
                        variant="outline-secondary"
                        size="sm"
                        className="py-0 px-2"
                        onClick={() => onSelectAction(action)}
                    >
                        Details
                    </Button>
                    <Button
                        variant="success"
                        size="sm"
                        className="py-0 px-2"
                        onClick={() => onApprove(action.id)}
                        disabled={loading}
                    >
                        Approve
                    </Button>
                    <Button
                        variant="outline-danger"
                        size="sm"
                        className="py-0 px-2"
                        onClick={() => onReject(action.id)}
                        disabled={loading}
                    >
                        Reject
                    </Button>
                </div>
            </div>
        </div>
    </ListGroup.Item>
);

const PendingActionsDropdown = ({ actions, onSelectAction, onApprove, onReject, onClose, loading }) => (
    <Card
        className="shadow"
        style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            right: 0,
            width: 400,
            maxHeight: 500,
            overflowY: 'auto',
            zIndex: 1050,
            border: '1px solid var(--bs-border-color)',
        }}
    >
        <Card.Header className="py-2 d-flex align-items-center justify-content-between">
            <span className="fw-semibold d-flex align-items-center gap-2 small">
                <i className="material-icons text-warning" style={{ fontSize: 17 }}>notifications_none</i>
                Pending Actions
                {actions.length > 0 && (
                    <Badge bg="danger">{actions.length}</Badge>
                )}
            </span>
            <Button variant="outline-secondary" size="sm" className="py-0 px-1 lh-1" onClick={onClose}>
                <i className="material-icons" style={{ fontSize: 15 }}>close</i>
            </Button>
        </Card.Header>

        {actions.length === 0 ? (
            <Card.Body className="text-center text-muted py-4">
                <i className="material-icons d-block mb-2" style={{ fontSize: 32, opacity: 0.3 }}>
                    notifications_none
                </i>
                No pending actions
            </Card.Body>
        ) : (
            <ListGroup variant="flush">
                {actions.map(a => (
                    <ActionItem
                        key={a.id}
                        action={a}
                        onSelectAction={onSelectAction}
                        onApprove={onApprove}
                        onReject={onReject}
                        loading={loading}
                    />
                ))}
            </ListGroup>
        )}
    </Card>
);

const POLL_INTERVAL_MS = 60_000;

export const PendingActionsPanel = ({
    count,
    actions,
    isAuthenticated,
    getPendingActionsCount,
    getPendingActions,
    approvePendingAction,
    rejectPendingAction,
}) => {
    const [open, setOpen]               = useState(false);
    const [selectedAction, setSelected] = useState(null);
    const [loading, setLoading]         = useState(false);

    const buttonRef = useRef(null);
    const panelRef  = useRef(null);

    useEffect(() => {
        if (!isAuthenticated) return;
        getPendingActionsCount();
        const id = setInterval(getPendingActionsCount, POLL_INTERVAL_MS);
        return () => clearInterval(id);
    }, [isAuthenticated, getPendingActionsCount]);

    useEffect(() => {
        if (open && isAuthenticated) getPendingActions();
    }, [open, isAuthenticated, getPendingActions]);

    useEffect(() => {
        if (!open) return;
        const handler = e => {
            if (
                buttonRef.current && !buttonRef.current.contains(e.target) &&
                panelRef.current  && !panelRef.current.contains(e.target)
            ) setOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [open]);

    const handleToggle = e => {
        e.preventDefault();
        e.stopPropagation();
        setOpen(o => !o);
    };

    const handleApprove = useCallback(async id => {
        setLoading(true);
        await approvePendingAction(id);
        setLoading(false);
        setSelected(null);
    }, [approvePendingAction]);

    const handleReject = useCallback(async id => {
        setLoading(true);
        await rejectPendingAction(id);
        setLoading(false);
        setSelected(null);
    }, [rejectPendingAction]);

    if (!isAuthenticated) return null;

    return (
        <>
            <div className="position-relative d-inline-flex me-1" ref={buttonRef}>
                <Button
                    variant="secondary"
                    className="ms-2 position-relative"
                    onClick={handleToggle}
                    title="Pending Actions"
                    aria-haspopup="true"
                    aria-expanded={open}
                >
                    <i className="material-icons align-middle small">
                        {count > 0 ? 'notifications_active' : 'notifications_none'}
                    </i>
                    {count > 0 && (
                        <Badge
                            bg="danger"
                            pill
                            className="position-absolute"
                            style={{ top: 2, right: 2, pointerEvents: 'none' }}
                        >
                            {count > 99 ? '99+' : count}
                        </Badge>
                    )}
                </Button>

                {open && (
                    <div ref={panelRef}>
                        <PendingActionsDropdown
                            actions={actions}
                            onSelectAction={a => setSelected(a)}
                            onApprove={handleApprove}
                            onReject={handleReject}
                            onClose={() => setOpen(false)}
                            loading={loading}
                        />
                    </div>
                )}
            </div>

            {selectedAction && (
                <ActionDetailModal
                    action={selectedAction}
                    onClose={() => setSelected(null)}
                    onApprove={handleApprove}
                    onReject={handleReject}
                    loading={loading}
                />
            )}
        </>
    );
};

PendingActionsPanel.propTypes = {
    count:                  PropTypes.number.isRequired,
    actions:                PropTypes.array.isRequired,
    isAuthenticated:        PropTypes.bool.isRequired,
    getPendingActionsCount: PropTypes.func.isRequired,
    getPendingActions:      PropTypes.func.isRequired,
    approvePendingAction:   PropTypes.func.isRequired,
    rejectPendingAction:    PropTypes.func.isRequired,
};

const mapStateToProps = state => ({
    count:           state.pendingActions.count,
    actions:         state.pendingActions.actions,
    isAuthenticated: state.auth.isAuthenticated,
});

export default connect(mapStateToProps, {
    getPendingActionsCount,
    getPendingActions,
    approvePendingAction,
    rejectPendingAction,
})(PendingActionsPanel);
