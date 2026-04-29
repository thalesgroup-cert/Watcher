import React, { Component, Fragment } from 'react';
import { connect } from 'react-redux';
import PropTypes from 'prop-types';
import { getSources, addSource, deleteSource, patchSource } from '../../actions/leads';
import { Button, Modal, Form } from 'react-bootstrap';
import TableManager from '../common/TableManager';
import DateWithTooltip from '../common/DateWithTooltip';

const FILTER_CONFIG = [
    { key: 'search',  type: 'search', label: 'Search',  placeholder: 'Search by URL or country...', width: 4 },
    { key: 'country', type: 'search', label: 'Country', placeholder: 'Filter by country code...', width: 2 },
];

const CONFIDENCE_OPTIONS = [
    { value: '1',  label: '1 - Low' },
    { value: '2',  label: '2 - Medium' },
    { value: '3',  label: '3 - High' },
];

const EMPTY_FORM = { url: '', confident: '3', country: '', country_code: '' };

class SourcesPanel extends Component {
    constructor(props) {
        super(props);
        this.state = {
            showHelp:        false,
            showAddModal:    false,
            showEditModal:   false,
            showDeleteModal: false,
            editId:          null,
            deleteId:        null,
            deleteUrl:       '',
            form:            { ...EMPTY_FORM },
        };
    }

    static propTypes = {
        sources:     PropTypes.array.isRequired,
        getSources:  PropTypes.func.isRequired,
        addSource:   PropTypes.func.isRequired,
        deleteSource: PropTypes.func.isRequired,
        patchSource: PropTypes.func.isRequired,
        auth:        PropTypes.object.isRequired,
    };

    componentDidMount() {
        this.props.getSources();
    }

    handleFormChange = (key, value) =>
        this.setState(prev => ({ form: { ...prev.form, [key]: value } }));

    openAddModal = () =>
        this.setState({ showAddModal: true, form: { ...EMPTY_FORM } });

    openEditModal = source =>
        this.setState({
            showEditModal: true,
            editId: source.id,
            form: {
                url:          source.url,
                confident:    String(source.confident || 3),
                country:      source.country || '',
                country_code: source.country_code || '',
            },
        });

    openDeleteModal = (id, url) =>
        this.setState({ showDeleteModal: true, deleteId: id, deleteUrl: url });

    submitAdd = e => {
        e.preventDefault();
        const { form } = this.state;
        this.props.addSource({
            url:          form.url.trim(),
            confident:    parseInt(form.confident),
            country:      form.country.trim(),
            country_code: form.country_code.trim().toUpperCase(),
        });
        this.setState({ showAddModal: false, form: { ...EMPTY_FORM } });
    };

    submitEdit = e => {
        e.preventDefault();
        const { form, editId } = this.state;
        this.props.patchSource(editId, {
            url:          form.url.trim(),
            confident:    parseInt(form.confident),
            country:      form.country.trim(),
            country_code: form.country_code.trim().toUpperCase(),
        });
        this.setState({ showEditModal: false, editId: null });
    };

    submitDelete = e => {
        e.preventDefault();
        this.props.deleteSource(this.state.deleteId, this.state.deleteUrl);
        this.setState({ showDeleteModal: false, deleteId: null });
    };

    customFilters = (filtered, filters) => {
        if (filters.country) {
            const q = filters.country.toUpperCase();
            filtered = filtered.filter(s =>
                (s.country_code || '').toUpperCase().includes(q) ||
                (s.country || '').toLowerCase().includes(filters.country.toLowerCase())
            );
        }
        return filtered;
    };

    renderConfidenceBar = (value) => {
        const pct = (value / 3) * 100;
        const color = value >= 3 ? 'bg-success' : value >= 2 ? 'bg-warning' : 'bg-danger';
        return (
            <div className="d-flex align-items-center gap-2">
                <div className="progress flex-grow-1" style={{ height: 8, minWidth: 60 }}>
                    <div className={`progress-bar ${color}`} style={{ width: `${pct}%` }} />
                </div>
                <small className="text-muted" style={{ minWidth: 20 }}>{value}/3</small>
            </div>
        );
    };

    renderForm = () => {
        const { form } = this.state;
        return (
            <Fragment>
                <Form.Group className="mb-3">
                    <Form.Label><strong>RSS Feed URL</strong></Form.Label>
                    <Form.Control
                        type="url"
                        placeholder="https://example.com/feed.rss"
                        value={form.url}
                        onChange={e => this.handleFormChange('url', e.target.value)}
                        required
                    />
                </Form.Group>
                <div className="row">
                    <div className="col-md-6">
                        <Form.Group className="mb-3">
                            <Form.Label><strong>Country</strong></Form.Label>
                            <Form.Control
                                type="text"
                                placeholder="e.g. France"
                                value={form.country}
                                onChange={e => this.handleFormChange('country', e.target.value)}
                            />
                        </Form.Group>
                    </div>
                    <div className="col-md-6">
                        <Form.Group className="mb-3">
                            <Form.Label><strong>Country Code</strong></Form.Label>
                            <Form.Control
                                type="text"
                                placeholder="e.g. FR"
                                maxLength={3}
                                value={form.country_code}
                                onChange={e => this.handleFormChange('country_code', e.target.value)}
                            />
                        </Form.Group>
                    </div>
                </div>
                <Form.Group className="mb-3">
                    <Form.Label><strong>Confidence Level</strong> <span className="text-muted small">({form.confident}/3)</span></Form.Label>
                    <Form.Select
                        value={form.confident}
                        onChange={e => this.handleFormChange('confident', e.target.value)}
                    >
                        {CONFIDENCE_OPTIONS.map(o => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                    </Form.Select>
                    <Form.Text className="text-muted">
                        How reliable is this source for cybersecurity content?
                    </Form.Text>
                </Form.Group>
            </Fragment>
        );
    };

    render() {
        const { sources, auth } = this.props;
        const { isAuthenticated } = auth;
        const { showHelp, showAddModal, showEditModal, showDeleteModal, deleteUrl, form, editId } = this.state;

        return (
            <Fragment>
                <div className="d-flex justify-content-between align-items-center mb-3">
                    <h4>RSS Sources</h4>
                    {isAuthenticated && (
                        <button className="btn btn-success" onClick={this.openAddModal}>
                            <i className="material-icons me-1" style={{ verticalAlign: 'middle', fontSize: '18px' }}>add_circle</i>
                            Add Source
                        </button>
                    )}
                </div>

                <div className="mb-3">
                    <div
                        className="d-flex align-items-center"
                        onClick={() => this.setState(p => ({ showHelp: !p.showHelp }))}
                        style={{ cursor: 'pointer' }}
                    >
                        <i className="material-icons text-primary me-2">{showHelp ? 'expand_less' : 'expand_more'}</i>
                        <span className="text-muted">Need help with RSS Sources?</span>
                    </div>
                    {showHelp && (
                        <div className="mt-3 ps-4 border-start border-primary">
                            <ul className="mb-0 ps-3 text-muted">
                                <li>Add RSS feed URLs from trusted cybersecurity news outlets</li>
                                <li>Set a <strong>confidence</strong> score (1–3) to weight the source reliability</li>
                                <li>Optionally specify a country and country code to tag regional sources</li>
                                <li>Sources are polled periodically - new articles trigger keyword detection</li>
                            </ul>
                        </div>
                    )}
                </div>

                <TableManager
                    data={sources}
                    filterConfig={FILTER_CONFIG}
                    searchFields={['url', 'country', 'country_code']}
                    dateFields={['created_at']}
                    defaultSort="created_at"
                    customFilters={this.customFilters}
                    enableDateFilter={true}
                    moduleKey="cyberWatch_sources"
                >
                    {({ paginatedData, handleSort, renderSortIcons, renderFilters, renderPagination,
                        renderItemsInfo, renderFilterControls, renderSaveModal, getTableContainerStyle }) => (
                        <Fragment>
                            {renderFilterControls()}
                            {renderFilters()}
                            {renderItemsInfo()}
                            <div style={{ ...getTableContainerStyle(), overflowX: 'auto' }}>
                                <table className="table table-striped table-hover mb-0">
                                    <thead>
                                        <tr>
                                            <th role="button" onClick={() => handleSort('url')}>URL {renderSortIcons('url')}</th>
                                            <th className="text-center" role="button" onClick={() => handleSort('country_code')}>Country {renderSortIcons('country_code')}</th>
                                            <th className="text-center" role="button" onClick={() => handleSort('confident')}>Confidence {renderSortIcons('confident')}</th>
                                            <th className="text-center" role="button" onClick={() => handleSort('created_at')}>Added {renderSortIcons('created_at')}</th>
                                            {isAuthenticated && <th className="text-end">Actions</th>}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {paginatedData.length === 0 ? (
                                            <tr><td colSpan={isAuthenticated ? 5 : 4} className="text-center text-muted py-4">No results found</td></tr>
                                        ) : paginatedData.map(source => (
                                            <tr key={source.id}>
                                                <td className="align-middle" style={{ maxWidth: 280, wordBreak: 'break-all' }}>
                                                    <a href={source.url} target="_blank" rel="noopener noreferrer" className="text-decoration-none small">
                                                        {source.url}
                                                    </a>
                                                </td>
                                                <td className="text-center align-middle">
                                                    {source.country_code
                                                        ? <span className="badge bg-secondary">{source.country_code}</span>
                                                        : <span className="text-muted">-</span>}
                                                    {source.country && (
                                                        <div className="text-muted small mt-1">{source.country}</div>
                                                    )}
                                                </td>
                                                <td className="align-middle" style={{ minWidth: 120 }}>
                                                    {this.renderConfidenceBar(source.confident || 1)}
                                                </td>
                                                <td className="text-center align-middle">
                                                    {source.created_at
                                                        ? <DateWithTooltip date={source.created_at} type="created" />
                                                        : <span className="text-muted">-</span>}
                                                </td>
                                                {isAuthenticated && (
                                                    <td className="text-end align-middle" style={{ whiteSpace: 'nowrap' }}>
                                                        <button className="btn btn-outline-warning btn-sm me-2" title="Edit" onClick={() => this.openEditModal(source)}>
                                                            <i className="material-icons" style={{ fontSize: 17 }}>edit</i>
                                                        </button>
                                                        <button className="btn btn-outline-danger btn-sm" title="Delete" onClick={() => this.openDeleteModal(source.id, source.url)}>
                                                            <i className="material-icons" style={{ fontSize: 17 }}>delete</i>
                                                        </button>
                                                    </td>
                                                )}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            {renderPagination()}
                            {renderSaveModal()}
                        </Fragment>
                    )}
                </TableManager>

                <Modal show={showAddModal} onHide={() => this.setState({ showAddModal: false })} centered>
                    <Modal.Header closeButton><Modal.Title>Add RSS Source</Modal.Title></Modal.Header>
                    <Modal.Body>
                        <form id="sources-add-form" onSubmit={this.submitAdd}>
                            {this.renderForm()}
                        </form>
                    </Modal.Body>
                    <Modal.Footer>
                        <Button variant="secondary" className="me-2" onClick={() => this.setState({ showAddModal: false })}>Close</Button>
                        <Button type="submit" form="sources-add-form" variant="success" disabled={!form.url.trim()}>
                            Add
                        </Button>
                    </Modal.Footer>
                </Modal>

                <Modal show={showEditModal} onHide={() => this.setState({ showEditModal: false })} centered>
                    <Modal.Header closeButton><Modal.Title>Edit RSS Source</Modal.Title></Modal.Header>
                    <Modal.Body>
                        <form id="sources-edit-form" onSubmit={this.submitEdit}>
                            {this.renderForm()}
                        </form>
                    </Modal.Body>
                    <Modal.Footer>
                        <Button variant="secondary" className="me-2" onClick={() => this.setState({ showEditModal: false })}>Close</Button>
                        <Button type="submit" form="sources-edit-form" variant="warning" disabled={!form.url.trim()}>
                            Update
                        </Button>
                    </Modal.Footer>
                </Modal>

                <Modal show={showDeleteModal} onHide={() => this.setState({ showDeleteModal: false })} centered>
                    <Modal.Header closeButton><Modal.Title>Confirm Deletion</Modal.Title></Modal.Header>
                    <Modal.Body>
                        Delete the source <b className="text-break">{deleteUrl}</b>?
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
    }
}

const mapStateToProps = state => ({
    sources: state.leads.sources,
    auth:    state.auth,
});

export default connect(mapStateToProps, {
    getSources,
    addSource,
    deleteSource,
    patchSource,
})(SourcesPanel);
