import React, { Component, Fragment } from 'react';
import { connect } from 'react-redux';
import PropTypes from 'prop-types';
import {
    getWatchRules,
    addWatchRule,
    deleteWatchRule,
    patchWatchRule,
} from '../../actions/CyberWatch';
import { Button, Modal, Form, Badge } from 'react-bootstrap';
import TableManager from '../common/TableManager';
import DateWithTooltip from '../common/DateWithTooltip';


const SCOPE_LABELS = { cve: 'CVE', ransomware: 'Ransomware', both: 'Both' };
const SCOPE_BADGE  = { cve: 'bg-info text-dark', ransomware: 'bg-danger', both: 'bg-primary' };

const EMPTY_FORM = { name: '', keywords: '', exceptions: '', scope: 'both', is_active: true };

const RULES_FILTER_CONFIG = [
    { key: 'search',    type: 'search', label: 'Search',    placeholder: 'Search by rule name...', width: 3 },
    { key: 'scope',     type: 'select', label: 'Scope',     width: 2,
      options: [{ value: 'cve', label: 'CVE' }, { value: 'ransomware', label: 'Ransomware' }, { value: 'both', label: 'Both' }] },
    { key: 'is_active', type: 'select', label: 'Active',    width: 2,
      options: [{ value: 'true', label: 'Active' }, { value: 'false', label: 'Inactive' }] },
];


class WatchRules extends Component {
    constructor(props) {
        super(props);
        this.state = {
            showHelp:        false,
            showAddModal:    false,
            showEditModal:   false,
            showDeleteModal: false,
            editId:          null,
            deleteId:        null,
            deleteName:      '',
            form:            { ...EMPTY_FORM },
        };
    }

    static propTypes = {
        watchRules:      PropTypes.array.isRequired,
        getWatchRules:   PropTypes.func.isRequired,
        addWatchRule:    PropTypes.func.isRequired,
        deleteWatchRule: PropTypes.func.isRequired,
        patchWatchRule:  PropTypes.func.isRequired,
        auth:            PropTypes.object.isRequired,
    };

    componentDidMount() {
        this.props.getWatchRules();
    }


    parseKeywords = str => str.split(',').map(s => s.trim()).filter(Boolean);

    handleFormChange = (key, value) =>
        this.setState(prev => ({ form: { ...prev.form, [key]: value } }));

    openAddModal = () =>
        this.setState({ showAddModal: true, form: { ...EMPTY_FORM } });

    openEditModal = rule =>
        this.setState({
            showEditModal: true,
            editId: rule.id,
            form: {
                name:       rule.name,
                keywords:   (rule.keywords   || []).join(', '),
                exceptions: (rule.exceptions || []).join(', '),
                scope:      rule.scope,
                is_active:  rule.is_active,
            },
        });

    openDeleteModal = (id, name) =>
        this.setState({ showDeleteModal: true, deleteId: id, deleteName: name });

    submitAdd = e => {
        e.preventDefault();
        const { form } = this.state;
        this.props.addWatchRule({
            name:       form.name.trim(),
            keywords:   this.parseKeywords(form.keywords),
            exceptions: this.parseKeywords(form.exceptions),
            scope:      form.scope,
            is_active:  form.is_active,
        });
        this.setState({ showAddModal: false, form: { ...EMPTY_FORM } });
    };

    submitEdit = e => {
        e.preventDefault();
        const { form, editId } = this.state;
        this.props.patchWatchRule(editId, {
            name:       form.name.trim(),
            keywords:   this.parseKeywords(form.keywords),
            exceptions: this.parseKeywords(form.exceptions),
            scope:      form.scope,
            is_active:  form.is_active,
        });
        this.setState({ showEditModal: false, editId: null });
    };

    submitDelete = e => {
        e.preventDefault();
        this.props.deleteWatchRule(this.state.deleteId);
        this.setState({ showDeleteModal: false, deleteId: null });
    };


    rulesCustomFilters = (filtered, filters) => {
        if (filters.scope)     filtered = filtered.filter(r => r.scope === filters.scope);
        if (filters.is_active === 'true')  filtered = filtered.filter(r => r.is_active);
        if (filters.is_active === 'false') filtered = filtered.filter(r => !r.is_active);
        return filtered;
    };




    renderForm = () => {
        const { form } = this.state;
        return (
            <Fragment>
                <Form.Group className="mb-3">
                    <Form.Label><strong>Rule name</strong></Form.Label>
                    <Form.Control
                        type="text"
                        required
                        placeholder="Watch, CVE watch…"
                        value={form.name}
                        onChange={e => this.handleFormChange('name', e.target.value)}
                    />
                </Form.Group>
                <Form.Group className="mb-3">
                    <Form.Label>
                        <strong>Keywords</strong>{' '}
                        <span className="text-muted">(comma-separated, case-insensitive)</span>
                    </Form.Label>
                    <Form.Control
                        as="textarea"
                        rows={2}
                        required
                        placeholder="company, company.com..."
                        value={form.keywords}
                        onChange={e => this.handleFormChange('keywords', e.target.value)}
                    />
                    <Form.Text className="text-muted">
                        A hit is recorded when ANY keyword appears in the matched fields.
                    </Form.Text>
                </Form.Group>
                <Form.Group className="mb-3">
                    <Form.Label>
                        <strong>Exceptions</strong>{' '}
                        <span className="text-muted">(comma-separated)</span>
                    </Form.Label>
                    <Form.Control
                        as="textarea"
                        rows={1}
                        placeholder="protected, confidential..."
                        value={form.exceptions}
                        onChange={e => this.handleFormChange('exceptions', e.target.value)}
                    />
                    <Form.Text className="text-muted">
                        If any exception string is found in the field, the match is cancelled.
                    </Form.Text>
                </Form.Group>
                <Form.Group className="mb-3">
                    <Form.Label><strong>Scope</strong></Form.Label>
                    <Form.Select
                        value={form.scope}
                        onChange={e => this.handleFormChange('scope', e.target.value)}
                    >
                        <option value="both">Both (CVE + Ransomware)</option>
                        <option value="cve">CVE only</option>
                        <option value="ransomware">Ransomware only</option>
                    </Form.Select>
                </Form.Group>
                <Form.Check
                    type="switch"
                    id="is-active-switch"
                    label="Active"
                    checked={form.is_active}
                    onChange={e => this.handleFormChange('is_active', e.target.checked)}
                />
            </Fragment>
        );
    };


    renderSubModals = () => {
        const { showAddModal, showEditModal, showDeleteModal } = this.state;
        return (
            <Fragment>
                <Modal show={showAddModal} onHide={() => this.setState({ showAddModal: false })} size="lg" centered>
                    <Modal.Header closeButton><Modal.Title>Add Watch Rule</Modal.Title></Modal.Header>
                    <Modal.Body>
                        <form id="add-wr-form" onSubmit={this.submitAdd}>{this.renderForm()}</form>
                    </Modal.Body>
                    <Modal.Footer>
                        <Button variant="secondary" className="me-2" onClick={() => this.setState({ showAddModal: false })}>Close</Button>
                        <Button variant="success" type="submit" form="add-wr-form">Add</Button>
                    </Modal.Footer>
                </Modal>

                <Modal show={showEditModal} onHide={() => this.setState({ showEditModal: false })} size="lg" centered>
                    <Modal.Header closeButton><Modal.Title>Edit Watch Rule</Modal.Title></Modal.Header>
                    <Modal.Body>
                        <form id="edit-wr-form" onSubmit={this.submitEdit}>{this.renderForm()}</form>
                    </Modal.Body>
                    <Modal.Footer>
                        <Button variant="secondary" className="me-2" onClick={() => this.setState({ showEditModal: false })}>Close</Button>
                        <Button variant="warning" type="submit" form="edit-wr-form">Update</Button>
                    </Modal.Footer>
                </Modal>

                <Modal show={showDeleteModal} onHide={() => this.setState({ showDeleteModal: false })} centered>
                    <Modal.Header closeButton><Modal.Title>Confirm Deletion</Modal.Title></Modal.Header>
                    <Modal.Body>
                        Delete watch rule <b>{this.state.deleteName}</b>? All associated hits will also be removed.
                    </Modal.Body>
                    <Modal.Footer>
                        <Button variant="secondary" className="me-2" onClick={() => this.setState({ showDeleteModal: false })}>Close</Button>
                        <form onSubmit={this.submitDelete} style={{ display: 'inline' }}>
                            <Button type="submit" variant="danger">Yes, I'm sure</Button>
                        </form>
                    </Modal.Footer>
                </Modal>
            </Fragment>
        );
    };


    render() {
        const { watchRules } = this.props;
        const { showHelp } = this.state;
        const { isAuthenticated: authd } = this.props.auth;

        return (
            <Fragment>
                {/* Section header */}
                <div className="d-flex justify-content-between align-items-center mb-3">
                    <h4>
                        Watch Rules
                    </h4>
                    {authd && (
                        <button className="btn btn-success" onClick={this.openAddModal}>
                            <i className="material-icons me-1" style={{ verticalAlign: 'middle', fontSize: '18px' }}>add_circle</i>
                            Add Rule
                        </button>
                    )}
                </div>

                {/* Help toggle */}
                <div className="mb-3">
                    <div
                        className="d-flex align-items-center"
                        onClick={() => this.setState(prev => ({ showHelp: !prev.showHelp }))}
                        style={{ cursor: 'pointer' }}
                    >
                        <i className="material-icons text-primary me-2">
                            {showHelp ? 'expand_less' : 'expand_more'}
                        </i>
                        <span className="text-muted">Need help with Watch Rules?</span>
                    </div>
                    {showHelp && (
                        <div className="mt-3 ps-4 border-start border-primary">
                            <ul className="mb-0 ps-3 text-muted">
                                <li>Watch Rules let you define keywords checked automatically against new CVEs and ransomware victims</li>
                                <li><strong>Keywords</strong> - any match (case-insensitive) triggers a hit</li>
                                <li><strong>Exceptions</strong> - if any exception string is found, the match is cancelled</li>
                                <li><strong>Scope</strong> - choose CVE, Ransomware, or Both</li>
                                <li><strong>Tip:</strong> View hits in Threats Watcher panels (Victims &amp; CVE Vulnerabilities)</li>
                            </ul>
                        </div>
                    )}
                </div>

                {/* Watch Rules table */}
                    <TableManager
                        data={watchRules}
                        filterConfig={RULES_FILTER_CONFIG}
                        searchFields={['name']}
                        defaultSort="name"
                        customFilters={this.rulesCustomFilters}
                        moduleKey="cyberWatch_watchRules"
                    >
                        {({ paginatedData, handleSort, renderSortIcons, renderFilters, renderPagination,
                            renderItemsInfo, renderFilterControls, renderSaveModal, getTableContainerStyle }) => (
                            <Fragment>
                                {renderFilterControls()}
                                {renderFilters()}
                                {renderItemsInfo()}
                                <div className="row"><div className="col-lg-12">
                                    <div style={{ ...getTableContainerStyle(), overflowX: 'auto' }}>
                                        <table className="table table-striped table-hover mb-0" style={{ fontSize: '0.95rem' }}>
                                            <thead>
                                                <tr>
                                                    <th role="button" onClick={() => handleSort('name')}>Name {renderSortIcons('name')}</th>
                                                    <th>Keywords</th>
                                                    <th className="text-center" role="button" onClick={() => handleSort('scope')}>Scope {renderSortIcons('scope')}</th>
                                                    <th className="text-center" role="button" onClick={() => handleSort('hits_count')}>Hits {renderSortIcons('hits_count')}</th>
                                                    <th className="text-end" role="button" onClick={() => handleSort('is_active')}>Active {renderSortIcons('is_active')}</th>
                                                    {authd && <th className="text-end">Actions</th>}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {paginatedData.length === 0 ? (
                                                    <tr>
                                                        <td colSpan={authd ? 6 : 5} className="text-center text-muted py-4">
                                                            No results found
                                                        </td>
                                                    </tr>
                                                ) : (
                                                    paginatedData.map(rule => (
                                                        <tr key={rule.id}>
                                                            <td className="align-middle fw-semibold">{rule.name}</td>
                                                            <td className="align-middle">
                                                                {(rule.keywords || []).map((kw, i) => (
                                                                    <Badge key={i} bg="secondary" className="me-1 mb-1">{kw}</Badge>
                                                                ))}
                                                            </td>
                                                            <td className="text-center align-middle">
                                                                <span className={`badge ${SCOPE_BADGE[rule.scope] || 'bg-secondary'}`}>
                                                                    {SCOPE_LABELS[rule.scope] || rule.scope}
                                                                </span>
                                                            </td>
                                                            <td className="text-center align-middle">
                                                                <span className="badge bg-secondary">{rule.hits_count || 0}</span>
                                                            </td>
                                                            <td className="text-center align-middle">
                                                                {rule.is_active
                                                                    ? <span className="badge bg-success">Yes</span>
                                                                    : <span className="badge bg-secondary">No</span>}
                                                            </td>
                                                            {authd && (
                                                                <td className="text-end align-middle" style={{ whiteSpace: 'nowrap' }}>
                                                                    <button className="btn btn-outline-warning btn-sm me-2"
                                                                        title="Edit"
                                                                        onClick={() => this.openEditModal(rule)}>
                                                                        <i className="material-icons" style={{ fontSize: 17 }}>edit</i>
                                                                    </button>
                                                                    <button className="btn btn-outline-danger btn-sm"
                                                                        title="Delete"
                                                                        onClick={() => this.openDeleteModal(rule.id, rule.name)}>
                                                                        <i className="material-icons" style={{ fontSize: 17 }}>delete</i>
                                                                    </button>
                                                                </td>
                                                            )}
                                                        </tr>
                                                    ))
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </div></div>
                                {renderPagination()}
                                {renderSaveModal()}
                            </Fragment>
                        )}
                    </TableManager>

                {this.renderSubModals()}
            </Fragment>
        );
    }
}

const mapStateToProps = state => ({
    watchRules: state.CyberWatch.watchRules,
    auth:       state.auth,
});

export default connect(mapStateToProps, {
    getWatchRules,
    addWatchRule,
    deleteWatchRule,
    patchWatchRule,
})(WatchRules);
