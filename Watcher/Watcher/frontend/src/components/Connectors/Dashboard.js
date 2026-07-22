import React, { Component, Fragment, useState, useEffect, useRef } from 'react';
import { connect } from 'react-redux';
import PropTypes from 'prop-types';
import { Modal, Form, Button, Badge, Spinner, Alert } from 'react-bootstrap';
import { Link } from 'react-router-dom';
import TableManager from '../common/TableManager';
import { getConnectors, updateConnector, revealConnector, testConnector, resetConnectorField } from '../../actions/Connectors';

const LOGO_BASE = '/static/frontend/images/connectors/';

const STATUS_CFG = {
    configured: { bg: 'success',   label: 'Configured'  },
    partial:    { bg: 'warning',   label: 'Incomplete', text: 'dark' },
    disabled:   { bg: 'secondary', label: 'Disabled'    },
};

const HEALTH_CFG = {
    healthy:   { bg: 'success',   label: 'Healthy'   },
    unhealthy: { bg: 'danger',    label: 'Unhealthy' },
    unknown:   { bg: 'secondary', label: 'Not tested yet' },
};

const CATEGORY_ORDER = ['Notifications', 'Incident Response', 'Threat Intelligence', 'Certificate Monitoring', 'Domain Monitoring', 'Search', 'Authentication', 'Database', 'Other'];

// KpiCard
function KpiCard({ title, value, icon, variant }) {
    return (
        <div className={`card border-0 shadow-sm h-100 bg-${variant}`}>
            <div className="card-body d-flex align-items-center p-3">
                <div
                    className="d-flex align-items-center justify-content-center bg-white rounded-circle me-3 flex-shrink-0"
                    style={{ width: 48, height: 48, minWidth: 48 }}
                >
                    <i
                        className={variant === 'secondary' ? 'material-icons' : `material-icons text-${variant}`}
                        style={variant === 'secondary' ? { fontSize: 26, color: '#6c757d' } : { fontSize: 26 }}
                    >
                        {icon}
                    </i>
                </div>
                <div className="flex-fill" style={{ minWidth: 0 }}>
                    <div className="text-white-50 text-uppercase fw-bold"
                         style={{ fontSize: '0.7rem', letterSpacing: '0.05em' }}>
                        {title}
                    </div>
                    <div className="text-white fw-bold"
                         style={{ fontSize: 'clamp(1.1rem, 2.5vw, 1.7rem)', lineHeight: 1.15 }}>
                        {value}
                    </div>
                </div>
            </div>
        </div>
    );
}

// StatusBadge
function StatusBadge({ status }) {
    const c = STATUS_CFG[status] || STATUS_CFG.disabled;
    return <Badge bg={c.bg} text={c.text}>{c.label}</Badge>;
}

// HealthBadge
function HealthBadge({ health }) {
    const status = health?.status || 'unknown';
    const c = HEALTH_CFG[status] || HEALTH_CFG.unknown;
    const title = health?.checked_at
        ? `Last checked ${new Date(health.checked_at).toLocaleString()}${health.message ? ' - ' + health.message : ''}`
        : 'Never tested yet';
    return <Badge bg={c.bg} text={c.text} title={title}>{c.label}</Badge>;
}

// ConnectorLogo - brand image if available, emoji fallback otherwise
function ConnectorLogo({ connector, size = 72 }) {
    const [failed, setFailed] = useState(false);
    if (!failed) {
        return (
            <img
                src={`${LOGO_BASE}${connector.id}.png`}
                alt={connector.name}
                onError={() => setFailed(true)}
                style={{ height: size, width: 'auto', maxWidth: size * 2, objectFit: 'contain' }}
            />
        );
    }
    return (
        <span style={{ fontSize: size * 0.7, lineHeight: 1, opacity: 0.85 }}>
            {connector.logo || '🔌'}
        </span>
    );
}

// ConnectorEditModal
function ConnectorEditModal({ connector, show, onClose, onReveal, onSave, onResetField }) {
    const [fields, setFields]       = useState([]);
    const [revealed, setRevealed]   = useState(new Set());
    const [revealing, setRevealing] = useState({});
    const [resetting, setResetting] = useState({});
    const [saving, setSaving]       = useState(false);
    const [saveError, setSaveError] = useState(null);
    const [dirty, setDirty]         = useState(false);

    useEffect(() => {
        if (connector) {
            setFields((connector.fields || []).map(f => ({ ...f })));
            setRevealed(new Set());
            setSaveError(null);
            setDirty(false);
        }
    }, [connector]);

    const handleChange = (name, value) => {
        setFields(prev => prev.map(f => f.name === name ? { ...f, value } : f));
        setDirty(true);
    };

    const handleReveal = async (fieldName) => {
        if (!connector) return;
        setRevealing(prev => ({ ...prev, [fieldName]: true }));
        try {
            const data = await onReveal(connector.id);
            const field = data && (data.fields || []).find(f => f.name === fieldName);
            if (field) {
                setRevealed(prev => new Set([...prev, fieldName]));
                setFields(prev => prev.map(f => f.name === fieldName ? { ...f, value: field.value } : f));
            }
        } catch (err) {
            console.error('Reveal failed', err);
        } finally {
            setRevealing(prev => ({ ...prev, [fieldName]: false }));
        }
    };

    const handleHide = (fieldName) =>
        setRevealed(prev => { const n = new Set(prev); n.delete(fieldName); return n; });

    const handleReset = async (fieldName) => {
        if (!connector) return;
        setResetting(prev => ({ ...prev, [fieldName]: true }));
        try {
            const data = await onResetField(connector.id, fieldName);
            const field = data && (data.fields || []).find(f => f.name === fieldName);
            if (field) {
                setFields(prev => prev.map(f => f.name === fieldName ? { ...field } : f));
                setRevealed(prev => { const n = new Set(prev); n.delete(fieldName); return n; });
            }
        } catch (err) {
            console.error('Reset failed', err);
        } finally {
            setResetting(prev => ({ ...prev, [fieldName]: false }));
        }
    };

    const handleSave = async (e) => {
        e.preventDefault();
        if (!connector) return;
        setSaving(true);
        setSaveError(null);
        try {
            const fieldsToSave = {};
            fields.forEach(f => { fieldsToSave[f.name] = f.value; });
            await onSave(connector.id, fieldsToSave);
            setDirty(false);
            onClose();
        } catch (err) {
            setSaveError(err.message);
        } finally {
            setSaving(false);
        }
    };

    if (!connector) return null;

    return (
        <Modal show={show} onHide={onClose} centered size="lg">
            <Modal.Header closeButton>
                <Modal.Title>
                    Edit {connector.name}
                    <Badge bg="secondary" className="ms-2"
                           style={{ fontSize: 11, fontWeight: 500, verticalAlign: 'middle' }}>
                        {connector.category}
                    </Badge>
                </Modal.Title>
            </Modal.Header>
            <form onSubmit={handleSave}>
                <Modal.Body>
                    {connector.description && (
                        <p className="text-muted mb-3" style={{ fontSize: 13 }}>
                            {connector.description}
                        </p>
                    )}
                    {fields.map(f => (
                        <Form.Group className="mb-3" key={f.name}>
                            <Form.Label className="fw-semibold mb-1" style={{ fontSize: 13 }}>
                                {f.label}
                                {f.sensitive && (
                                    <Badge bg="secondary" className="ms-2"
                                           style={{ fontSize: 9, fontWeight: 400 }}>
                                        sensitive
                                    </Badge>
                                )}
                                <Badge bg={f.overridden ? 'info' : 'light'}
                                       text={f.overridden ? undefined : 'dark'}
                                       className="ms-2"
                                       style={{ fontSize: 9, fontWeight: 400 }}>
                                    {f.overridden ? 'Manually set' : 'From .env'}
                                </Badge>
                            </Form.Label>
                            <div className="input-group input-group-sm">
                                <Form.Control
                                    type={f.sensitive && !revealed.has(f.name) ? 'password' : 'text'}
                                    value={f.value || ''}
                                    onChange={e => handleChange(f.name, e.target.value)}
                                    disabled={connector.readonly}
                                    className="font-monospace"
                                    style={{ fontSize: 13 }}
                                />
                                {f.sensitive && !revealed.has(f.name) && (
                                    <Button type="button" variant="outline-secondary"
                                            disabled={!!revealing[f.name]}
                                            onClick={() => handleReveal(f.name)}
                                            title="Reveal stored value">
                                        {revealing[f.name]
                                            ? <Spinner animation="border" size="sm" />
                                            : <i className="material-icons"
                                                 style={{ fontSize: 16, verticalAlign: 'middle' }}>visibility</i>
                                        }
                                    </Button>
                                )}
                                {f.sensitive && revealed.has(f.name) && (
                                    <Button type="button" variant="outline-secondary"
                                            onClick={() => handleHide(f.name)}
                                            title="Hide value">
                                        <i className="material-icons"
                                           style={{ fontSize: 16, verticalAlign: 'middle' }}>visibility_off</i>
                                    </Button>
                                )}
                                {!connector.readonly && f.overridden && (
                                    <Button type="button" variant="outline-secondary"
                                            disabled={!!resetting[f.name]}
                                            onClick={() => handleReset(f.name)}
                                            title="Reset to .env default">
                                        {resetting[f.name]
                                            ? <Spinner animation="border" size="sm" />
                                            : <i className="material-icons"
                                                 style={{ fontSize: 16, verticalAlign: 'middle' }}>refresh</i>
                                        }
                                    </Button>
                                )}
                            </div>
                            <div className="text-muted mt-1" style={{ fontSize: 11, fontFamily: 'monospace' }}>
                                {f.name}
                            </div>
                        </Form.Group>
                    ))}

                    {connector.readonly && (
                        <Alert variant="warning" className="py-2 px-3 mb-0" style={{ fontSize: 13 }}>
                            This connector is informational only. Settings are managed in <code>settings.py</code>.
                        </Alert>
                    )}

                    {saveError && (
                        <Alert variant="danger" className="py-2 px-3 mb-0 mt-3" style={{ fontSize: 13 }}>
                            <i className="material-icons me-1"
                               style={{ fontSize: 14, verticalAlign: 'text-bottom' }}>error</i>
                            {saveError}
                        </Alert>
                    )}
                </Modal.Body>
                <Modal.Footer>
                    <Button variant="secondary" onClick={onClose} disabled={saving}>
                        Close
                    </Button>
                    {!connector.readonly && (
                        <Button type="submit" variant="primary" disabled={saving || !dirty}>
                            {saving
                                ? <><Spinner animation="border" size="sm" className="me-1" />Saving&hellip;</>
                                : 'Save changes'
                            }
                        </Button>
                    )}
                </Modal.Footer>
            </form>
        </Modal>
    );
}

// ConnectorCard
class ConnectorCard extends Component {
    constructor(props) {
        super(props);
        this.state = { testResult: null, testing: false };
    }

    handleTest = async () => {
        this.setState({ testing: true, testResult: null });
        clearTimeout(this._testTimer);
        try {
            const result = await this.props.onTest(this.props.connector.id);
            this.setState({ testResult: result });
        } catch (err) {
            this.setState({ testResult: { success: false, message: err.message } });
        } finally {
            this.setState({ testing: false });
            this._testTimer = setTimeout(
                () => this.setState({ testResult: null }),
                10000
            );
        }
    };

    componentWillUnmount() {
        clearTimeout(this._testTimer);
    }

    render() {
        const { connector, onEditClick } = this.props;
        const { testResult, testing } = this.state;

        return (
            <div className="card shadow-sm h-100 d-flex flex-column text-center">
                <div className="card-body flex-grow-1 d-flex flex-column align-items-center justify-content-center py-4 px-3">
                    <div className="mb-3 d-flex align-items-center justify-content-center"
                         style={{ height: 72, minWidth: 72, maxWidth: 144 }}>
                        <ConnectorLogo connector={connector} size={72} />
                    </div>
                    <div className="fw-bold mb-1" style={{ fontSize: 15 }}>{connector.name}</div>
                    <div className="text-muted mb-2" style={{ fontSize: 11 }}>
                        v{connector.version}
                    </div>
                    <div className="d-flex align-items-center gap-2 flex-wrap justify-content-center">
                        <StatusBadge status={connector.status} />
                        <HealthBadge health={connector.health} />
                        {connector.readonly && <Badge bg="warning" text="dark">Read-only</Badge>}
                    </div>

                    {testResult && (
                        <div className={`mt-3 d-flex align-items-start justify-content-between gap-1 p-2 rounded border border-${testResult.success ? 'success' : 'danger'} w-100`}
                             style={{ fontSize: 12, textAlign: 'left',
                                      background: testResult.success
                                          ? 'rgba(28,200,138,0.07)'
                                          : 'rgba(231,74,59,0.07)' }}>
                            <span style={{ color: `var(--bs-${testResult.success ? 'success' : 'danger'})` }}>
                                <i className="material-icons me-1"
                                   style={{ fontSize: 13, verticalAlign: 'text-bottom' }}>
                                    {testResult.success ? 'check_circle' : 'error'}
                                </i>
                                {testResult.message}
                            </span>
                            <button type="button" className="btn-close flex-shrink-0"
                                    style={{ fontSize: '0.5rem' }}
                                    onClick={() => this.setState({ testResult: null })} />
                        </div>
                    )}
                </div>

                <div className="card-footer d-flex gap-2 py-2 px-3">
                    <button className="btn btn-primary btn-sm flex-fill"
                            onClick={() => onEditClick(connector)}>
                        <i className="material-icons me-1"
                           style={{ fontSize: 14, verticalAlign: 'text-bottom' }}>edit</i>
                        {connector.readonly ? 'View' : 'Edit'}
                    </button>
                    <button className="btn btn-outline-success btn-sm flex-fill"
                            onClick={this.handleTest} disabled={testing}>
                        {testing
                            ? <Spinner animation="border" size="sm" className="me-1" />
                            : <i className="material-icons me-1"
                                 style={{ fontSize: 14, verticalAlign: 'text-bottom' }}>wifi_tethering</i>
                        }
                        {testing ? 'Testing…' : 'Test'}
                    </button>
                </div>
            </div>
        );
    }
}

// ConnectorsDashboard
class ConnectorsDashboard extends Component {
    static propTypes = {
        connectors: PropTypes.array.isRequired,
        user: PropTypes.object,
        getConnectors: PropTypes.func.isRequired,
        revealConnector: PropTypes.func.isRequired,
        updateConnector: PropTypes.func.isRequired,
        testConnector: PropTypes.func.isRequired,
    };

    constructor(props) {
        super(props);
        this.state = {
            loading:         true,
            error:           null,
            editConnector:   null,
            showEdit:        false,
            groupByCategory: false,
            showHelp:        false,
        };
    }

    componentDidMount() {
        if (this.props.user && this.props.user.is_superuser) {
            this.setState({ loading: true, error: null });
            this.props.getConnectors()
                .then(() => this.setState({ loading: false }))
                .catch(err => this.setState({ loading: false, error: err?.message || 'Failed to load connectors.' }));
        }
    }

    customFilters = (filtered, filters) => {
        if (filters.status) {
            filtered = filtered.filter(c => c.status === filters.status);
        }
        if (filters.health) {
            filtered = filtered.filter(c => (c.health?.status || 'unknown') === filters.health);
        }
        if (filters.category) {
            filtered = filtered.filter(c => c.category === filters.category);
        }
        return filtered;
    };

    getFilterConfig = () => {
        const categories = [...new Set(this.props.connectors.map(c => c.category))];
        return [
            {
                key:         'search',
                type:        'search',
                label:       'Search',
                placeholder: 'Search by name, category, description…',
                width:       4,
            },
            {
                key:     'status',
                type:    'select',
                label:   'Status',
                width:   3,
                options: [
                    { value: 'configured', label: 'Configured' },
                    { value: 'partial',    label: 'Incomplete' },
                    { value: 'disabled',   label: 'Disabled'   },
                ],
            },
            {
                key:     'health',
                type:    'select',
                label:   'Health',
                width:   3,
                options: [
                    { value: 'healthy',   label: 'Healthy'        },
                    { value: 'unhealthy', label: 'Unhealthy'      },
                    { value: 'unknown',   label: 'Not tested yet' },
                ],
            },
            {
                key:     'category',
                type:    'select',
                label:   'Category',
                width:   3,
                options: categories.map(c => ({ value: c, label: c })),
            },
        ];
    };

    openEdit  = (c) => this.setState({ editConnector: c, showEdit: true });
    closeEdit = ()  => this.setState({ showEdit: false, editConnector: null });

    handleSave       = (connectorId, fields) => this.props.updateConnector(connectorId, fields);
    handleReveal     = (connectorId) => this.props.revealConnector(connectorId);
    handleTest       = (connectorId) => this.props.testConnector(connectorId);
    handleResetField = (connectorId, fieldName) => this.props.resetConnectorField(connectorId, fieldName);

    toggleGroupByCategory = () => this.setState(prev => ({ groupByCategory: !prev.groupByCategory }));
    toggleHelp = () => this.setState(prev => ({ showHelp: !prev.showHelp }));

    renderConnectorsGrid = (data) => {
        if (data.length === 0) {
            return (
                <div className="text-center py-5 text-muted">
                    <i className="material-icons" style={{ fontSize: 48, opacity: 0.3 }}>power_off</i>
                    <p className="mt-2">No connectors match your filters.</p>
                </div>
            );
        }

        if (!this.state.groupByCategory) {
            return (
                <div className="row g-3 mb-3 row-cols-2 row-cols-sm-3 row-cols-lg-4 row-cols-xl-5">
                    {data.map(c => (
                        <div className="col" key={c.id}>
                            <ConnectorCard connector={c} onEditClick={this.openEdit} onTest={this.handleTest} />
                        </div>
                    ))}
                </div>
            );
        }

        const byCategory = {};
        data.forEach(c => {
            const cat = c.category || 'Other';
            if (!byCategory[cat]) byCategory[cat] = [];
            byCategory[cat].push(c);
        });
        const sortedCategories = CATEGORY_ORDER.filter(cat => byCategory[cat])
            .concat(Object.keys(byCategory).filter(cat => !CATEGORY_ORDER.includes(cat)));

        return sortedCategories.map(category => (
            <div key={category} className="mb-4">
                <h6 className="text-uppercase text-muted fw-bold mb-2"
                    style={{ letterSpacing: '0.08em', fontSize: '0.75rem' }}>
                    {category}
                </h6>
                <div className="row g-3 mb-1 row-cols-2 row-cols-sm-3 row-cols-lg-4 row-cols-xl-5">
                    {byCategory[category].map(c => (
                        <div className="col" key={c.id}>
                            <ConnectorCard connector={c} onEditClick={this.openEdit} onTest={this.handleTest} />
                        </div>
                    ))}
                </div>
            </div>
        ));
    };

    render() {
        const { user } = this.props;
        const { loading, error, editConnector, showEdit } = this.state;
        const connectors = this.props.connectors || [];

        if (!user || !user.is_superuser) {
            return (
                <div className="container mt-5 text-center">
                    <i className="material-icons text-danger" style={{ fontSize: 56 }}>lock</i>
                    <h4 className="mt-3">Access Restricted</h4>
                    <p className="text-muted">This page requires superuser privileges.</p>
                    <Link to="/" className="btn btn-primary">Back to Dashboard</Link>
                </div>
            );
        }

        const stats = {
            total:      connectors.length,
            configured: connectors.filter(c => c.status === 'configured').length,
            partial:    connectors.filter(c => c.status === 'partial').length,
            disabled:   connectors.filter(c => c.status === 'disabled').length,
        };

        return (
            <div className="container-fluid py-3 px-3 px-md-4">
                {/* Page title */}
                <div className="d-flex justify-content-between align-items-center mb-4 flex-wrap gap-2">
                    <h4 className="mb-0 d-flex align-items-center gap-2">
                        <i className="material-icons" style={{ fontSize: 24 }}>power</i>
                        Connectors
                    </h4>
                    <div className="d-flex gap-2 align-items-center flex-wrap">
                        <Link to="/profile" className="btn btn-outline-secondary btn-sm">
                            <i className="material-icons me-1 align-middle"
                               style={{ fontSize: 16 }}>arrow_back</i>
                            Profile
                        </Link>
                    </div>
                </div>

                {/* KPI Stats */}
                <div className="row g-3 mb-4">
                    <div className="col-6 col-sm-3">
                        <KpiCard title="Total" value={stats.total} icon="power" variant="primary" />
                    </div>
                    <div className="col-6 col-sm-3">
                        <KpiCard title="Configured" value={stats.configured} icon="check_circle" variant="success" />
                    </div>
                    <div className="col-6 col-sm-3">
                        <KpiCard title="Incomplete" value={stats.partial} icon="warning" variant="warning" />
                    </div>
                    <div className="col-6 col-sm-3">
                        <KpiCard title="Disabled" value={stats.disabled} icon="do_not_disturb" variant="secondary" />
                    </div>
                </div>

                {/* Help */}
                <div className="mb-4">
                    <div
                        className="d-flex align-items-center"
                        onClick={this.toggleHelp}
                        style={{ cursor: 'pointer' }}
                    >
                        <i className="material-icons text-primary me-2">
                            {this.state.showHelp ? 'expand_less' : 'expand_more'}
                        </i>
                        <span className="text-muted">Need help with connectors?</span>
                    </div>

                    {this.state.showHelp && (
                        <div className="mt-3 ps-4 border-start border-primary">
                            <ul className="mb-0 ps-3 text-muted">
                                <li>
                                    The first time a connector's fields are read, they're seeded from your <strong>settings.py</strong> / <strong>.env</strong> values
                                </li>
                                <li>
                                    Click <strong>Edit</strong> on a card to override a value, saving stores it in the database and takes effect
                                    immediately across the whole app (SMTP, Slack, Citadel, TheHive, MISP, CertStream, SearxNG, CyberWatch...), not just this page's own <strong>Test</strong> button
                                </li>
                                <li>
                                    Once a field has been saved here, even cleared to empty, it stops following <strong>settings.py</strong>/<strong>.env</strong> for good.
                                    Each field shows a <strong>From .env</strong> or <strong>Manually set</strong> badge, and manually-set fields get a reset
                                    button to drop the override and resume following <strong>settings.py</strong>/<strong>.env</strong> live
                                </li>
                                <li>
                                    Passwords, tokens and API keys are encrypted before being stored, and shown masked by default, click the eye icon to reveal
                                </li>
                                <li>
                                    <strong>Test</strong> runs a real connectivity check using the values currently saved for that connector, and reports
                                    success or failure right on the card
                                </li>
                                <li>
                                    Connectors marked <Badge bg="warning" text="dark" style={{ fontSize: 9 }}>Read-only</Badge>{' '} are informational only.
                                    Their configuration lives exclusively in <strong>settings.py</strong> and can't be changed from this page, for LDAP and
                                    OIDC/SSO this is because Django builds its authentication backends from <strong>settings.py</strong> at process startup, not per-request
                                </li>
                            </ul>
                        </div>
                    )}
                </div>

                {error && (
                    <div className="alert alert-danger mb-3">
                        <i className="material-icons me-2 align-middle" style={{ fontSize: 16 }}>error</i>
                        {error}
                    </div>
                )}

                {loading && (
                    <div className="text-center py-5">
                        <Spinner animation="border" variant="primary" />
                        <p className="text-muted mt-2 mb-0">Loading connectors…</p>
                    </div>
                )}

                {!loading && (
                    <TableManager
                        data={connectors}
                        filterConfig={this.getFilterConfig()}
                        searchFields={['name', 'category', 'description']}
                        customFilters={this.customFilters}
                        moduleKey="connectors_dashboard"
                        itemsPerPage={10}
                        defaultSort="name"
                    >
                        {({ paginatedData, renderFilterControls, renderFilters, renderPagination, renderItemsInfo }) => (
                            <Fragment>
                                {renderFilterControls()}
                                {renderFilters()}

                                {renderItemsInfo()}

                                <div className="mb-2">
                                    <button
                                        type="button"
                                        className={`btn btn-sm ${this.state.groupByCategory ? 'btn-secondary' : 'btn-outline-secondary'}`}
                                        onClick={this.toggleGroupByCategory}
                                        title="Group connectors by category"
                                    >
                                        <i className="material-icons me-1"
                                           style={{ fontSize: 14, verticalAlign: 'text-bottom' }}>category</i>
                                        Group by category
                                    </button>
                                </div>

                                {this.renderConnectorsGrid(paginatedData)}

                                {renderPagination()}
                            </Fragment>
                        )}
                    </TableManager>
                )}

                <ConnectorEditModal
                    connector={editConnector}
                    show={showEdit}
                    onClose={this.closeEdit}
                    onReveal={this.handleReveal}
                    onSave={this.handleSave}
                    onResetField={this.handleResetField}
                />
            </div>
        );
    }
}

const mapStateToProps = state => ({
    user:       state.auth.user,
    connectors: state.connectors.connectors,
});

export default connect(mapStateToProps, {
    getConnectors,
    updateConnector,
    revealConnector,
    testConnector,
    resetConnectorField,
})(ConnectorsDashboard);
