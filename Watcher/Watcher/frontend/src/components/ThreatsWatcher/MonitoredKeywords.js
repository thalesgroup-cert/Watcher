import React, { Component, Fragment } from 'react';
import { connect } from 'react-redux';
import PropTypes from 'prop-types';
import {
    getMonitoredKeywords,
    addMonitoredKeyword,
    deleteMonitoredKeyword,
    patchMonitoredKeyword
} from '../../actions/leads';
import { Button, Modal, Form } from 'react-bootstrap';
import TableManager from '../common/TableManager';
import DateWithTooltip from '../common/DateWithTooltip';


const LEVEL_VALUES = ['warm', 'hot', 'super_hot'];

const LEVEL_FLAMES = { warm: '🔥', hot: '🔥🔥', super_hot: '🔥🔥🔥' };

const LEVEL_OPTIONS = [
    { value: 'warm',      label: 'Warm',         desc: 'Low activity - keyword seen rarely' },
    { value: 'hot',       label: 'Hot',         desc: 'Moderate activity (≥ 3 hits)' },
    { value: 'super_hot', label: 'Super Hot', desc: 'High activity (≥ 10 hits)' },
];

const FILTER_CONFIG = [
    {
        key: 'search',
        type: 'search',
        label: 'Search',
        placeholder: 'Search by keyword name...',
        width: 3
    },
    {
        key: 'level',
        type: 'select',
        label: 'Level',
        width: 2,
        options: LEVEL_OPTIONS.map(o => ({ value: o.value, label: o.label }))
    }
];

const SOURCES_FILTER_CONFIG = [
    {
        key: 'search',
        type: 'search',
        label: 'Search',
        placeholder: 'Filter by domain or URL…',
        width: 8
    }
];

function parsePostUrls(posturls = []) {
    return posturls.map((raw, idx) => {
        const commaIdx = raw.indexOf(',');
        const url  = commaIdx > -1 ? raw.slice(0, commaIdx) : raw;
        const dateStr = commaIdx > -1 ? raw.slice(commaIdx + 1) : null;
        let domainName = '';
        try { domainName = new URL(url).hostname; } catch (_) { domainName = url; }
        return { id: idx, url, domainName, created_at: dateStr };
    });
}


export class MonitoredKeywords extends Component {
    constructor(props) {
        super(props);
        this.state = {
            // Add modal
            showAddModal:    false,
            addName:         '',
            addLevel:        'warm',

            // Edit modal
            showEditModal:   false,
            editId:          null,
            editName:        '',
            editLevel:       'warm',

            // Delete modal
            showDeleteModal: false,
            selectedId:      null,
            selectedName:    '',

            // Sources modal (clicked row)
            showSourcesModal:   false,
            sourcesKeyword:     '',
            sourcesPosturls:    [],

            showHelp: false,
            isLoading: true,
        };
    }

    static propTypes = {
        show: PropTypes.bool.isRequired,
        onHide: PropTypes.func.isRequired,
        monitoredKeywords: PropTypes.array.isRequired,
        getMonitoredKeywords: PropTypes.func.isRequired,
        addMonitoredKeyword: PropTypes.func.isRequired,
        deleteMonitoredKeyword: PropTypes.func.isRequired,
        patchMonitoredKeyword: PropTypes.func.isRequired,
        auth: PropTypes.object.isRequired
    };

    componentDidUpdate(prevProps) {
        if (this.props.show && !prevProps.show) {
            this.setState({ isLoading: this.props.monitoredKeywords.length === 0 });
            this.props.getMonitoredKeywords();
        }
        if (this.props.monitoredKeywords !== prevProps.monitoredKeywords && this.state.isLoading) {
            this.setState({ isLoading: false });
        }
    }

    customFilters = (filtered, filters) => {
        if (filters.level) {
            filtered = filtered.filter(mk => mk.level === filters.level);
        }
        return filtered;
    };


    handleAdd = e => {
        e.preventDefault();
        const { addName, addLevel } = this.state;
        const name = addName.trim();
        if (!name) return;
        this.props.addMonitoredKeyword({ name, level: addLevel });
        this.setState({ addName: '', addLevel: 'warm', showAddModal: false });
    };


    openEditModal = (mk) => {
        this.setState({
            showEditModal: true,
            editId: mk.id,
            editName: mk.name,
            editLevel: mk.level || 'warm',
        });
    };

    handleEdit = e => {
        e.preventDefault();
        const { editId, editName, editLevel } = this.state;
        const name = editName.trim();
        if (!name) return;
        this.props.patchMonitoredKeyword(editId, { name, level: editLevel });
        this.setState({ showEditModal: false, editId: null });
    };


    openDeleteModal = (id, name) => {
        this.setState({ showDeleteModal: true, selectedId: id, selectedName: name });
    };

    submitDelete = e => {
        e.preventDefault();
        this.props.deleteMonitoredKeyword(this.state.selectedId, this.state.selectedName);
        this.setState({ showDeleteModal: false, selectedId: null });
    };


    openSourcesModal = (mk) => {
        this.setState({
            showSourcesModal: true,
            sourcesKeyword:   mk.name,
            sourcesPosturls:  mk.posturls || [],
        });
    };


    renderLevelFlames = (level) => (
        <span title={level} style={{ fontSize: '1.1rem', letterSpacing: 1 }}>
            {LEVEL_FLAMES[level] || '?'}
        </span>
    );


    renderLevelSelector = (value, onChange) => {
        const idx = LEVEL_VALUES.indexOf(value);
        const safeIdx = idx === -1 ? 0 : idx;
        return (
            <Form.Group className="mb-3">
                <Form.Label><strong>Alert Level</strong></Form.Label>
                <div className="px-1 pt-1">
                    <input
                        type="range"
                        className="form-range"
                        min={0}
                        max={2}
                        step={1}
                        value={safeIdx}
                        onChange={e => onChange(LEVEL_VALUES[parseInt(e.target.value)])}
                    />
                    <div className="d-flex justify-content-between">
                        {LEVEL_OPTIONS.map(o => (
                            <div key={o.value} className="text-center" style={{ flex: '1', fontSize: '0.78rem' }}>
                                <div style={{ fontSize: '1.2rem' }}>{LEVEL_FLAMES[o.value]}</div>
                                <div className={`fw-semibold ${value === o.value ? 'text-primary' : 'text-muted'}`}>
                                    {o.label.replace(/🔥+\s*/, '')}
                                </div>
                                <div className="text-muted" style={{ fontSize: '0.72rem' }}>{o.desc}</div>
                            </div>
                        ))}
                    </div>
                </div>
                <Form.Text className="text-muted mt-2 d-block">
                    The level auto-escalates based on occurrence count. You can override it here.
                </Form.Text>
            </Form.Group>
        );
    };


    renderAddModal = () => {
        const { showAddModal, addName, addLevel } = this.state;
        const handleClose = () => this.setState({ showAddModal: false, addName: '', addLevel: 'warm' });
        return (
            <Modal show={showAddModal} onHide={handleClose} centered backdropClassName="modal-backdrop-dark">
                <Modal.Header closeButton>
                    <Modal.Title>Add Monitored Keyword</Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    <form id="add-mk-form" onSubmit={this.handleAdd}>
                        <Form.Group className="mb-3">
                            <Form.Label><strong>Keyword</strong></Form.Label>
                            <Form.Control
                                type="text"
                                placeholder='company, company.com...'
                                value={addName}
                                onChange={e => this.setState({ addName: e.target.value })}
                                autoFocus
                                required
                            />
                        </Form.Group>
                        {this.renderLevelSelector(addLevel, v => this.setState({ addLevel: v }))}
                    </form>
                </Modal.Body>
                <Modal.Footer className="justify-content-between">
                    <Button variant="secondary" onClick={handleClose}>Cancel</Button>
                    <Button
                        type="submit"
                        form="add-mk-form"
                        variant="primary"
                        disabled={!addName.trim()}
                    >
                        <i className="material-icons me-1 align-middle" style={{ fontSize: 18 }}>add</i>
                        <span className="align-middle">Add Keyword</span>
                    </Button>
                </Modal.Footer>
            </Modal>
        );
    };

    renderEditModal = () => {
        const { showEditModal, editName, editLevel } = this.state;
        const handleClose = () => this.setState({ showEditModal: false, editId: null });
        return (
            <Modal show={showEditModal} onHide={handleClose} centered>
                <Modal.Header closeButton>
                    <Modal.Title>Edit Monitored Keyword</Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    <form id="edit-mk-form" onSubmit={this.handleEdit}>
                        <Form.Group className="mb-3">
                            <Form.Label><strong>Keyword</strong></Form.Label>
                            <Form.Control
                                type="text"
                                value={editName}
                                onChange={e => this.setState({ editName: e.target.value })}
                                autoFocus
                                required
                            />
                        </Form.Group>
                        {this.renderLevelSelector(editLevel, v => this.setState({ editLevel: v }))}
                    </form>
                </Modal.Body>
                <Modal.Footer className="justify-content-between">
                    <Button variant="secondary" onClick={handleClose}>Cancel</Button>
                    <Button
                        type="submit"
                        form="edit-mk-form"
                        variant="primary"
                        disabled={!editName.trim()}
                    >
                        Save Changes
                    </Button>
                </Modal.Footer>
            </Modal>
        );
    };

    renderDeleteModal = () => {
        const { showDeleteModal, selectedName } = this.state;
        const handleClose = () => this.setState({ showDeleteModal: false });
        return (
            <Modal show={showDeleteModal} onHide={handleClose} centered>
                <Modal.Header closeButton>
                    <Modal.Title>Confirm Deletion</Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    Remove <b>{selectedName}</b> from Monitored Keywords?
                </Modal.Body>
                <Modal.Footer className="justify-content-between">
                    <Button variant="secondary" onClick={handleClose}>Cancel</Button>
                    <form onSubmit={this.submitDelete} style={{ display: 'inline' }}>
                        <Button type="submit" variant="danger">Delete</Button>
                    </form>
                </Modal.Footer>
            </Modal>
        );
    };

    renderSourcesModal = () => {
        const { showSourcesModal, sourcesKeyword, sourcesPosturls } = this.state;
        const handleClose = () => this.setState({ showSourcesModal: false });
        const allUrls = parsePostUrls(sourcesPosturls);

        return (
            <Modal show={showSourcesModal} onHide={handleClose} size="xl" centered backdropClassName="modal-backdrop-dark">
                <Modal.Header closeButton>
                    <Modal.Title>
                        <i className="material-icons me-2 align-middle text-primary" style={{ fontSize: 20 }}>rss_feed</i>
                        <span className="align-middle">Sources for <b>{sourcesKeyword}</b></span>
                    </Modal.Title>
                </Modal.Header>
                <Modal.Body style={{ maxHeight: 'calc(90vh - 160px)', overflowY: 'auto' }}>
                    {allUrls.length === 0 ? (
                        <div className="text-center text-muted py-5">
                            <i className="material-icons" style={{ fontSize: 40 }}>rss_feed</i>
                            <p className="mt-2 mb-1">No articles recorded yet for this keyword.</p>
                            <small>Sources are logged automatically when the RSS fetch task runs.</small>
                        </div>
                    ) : (
                        <TableManager
                            data={allUrls}
                            filterConfig={SOURCES_FILTER_CONFIG}
                            searchFields={['url', 'domainName']}
                            dateFields={['created_at']}
                            defaultSort="created_at"
                            moduleKey="threatsWatcher_sources"
                        >
                            {({
                                paginatedData,
                                handleSort,
                                renderSortIcons,
                                renderFilters,
                                renderPagination,
                                renderItemsInfo,
                                renderFilterControls,
                                renderSaveModal,
                                getTableContainerStyle
                            }) => (
                                <Fragment>
                                    {renderFilterControls()}
                                    {renderFilters()}
                                    {renderItemsInfo()}
                                    <div style={{ ...getTableContainerStyle(), overflowX: 'auto' }}>
                                        <table className="table table-striped table-hover mb-0">
                                            <thead>
                                                <tr>
                                                    <th role="button" onClick={() => handleSort('domainName')}>
                                                        Domain {renderSortIcons('domainName')}
                                                    </th>
                                                    <th>URL</th>
                                                    <th className="text-end" role="button" onClick={() => handleSort('created_at')} style={{ whiteSpace: 'nowrap' }}>
                                                        Detected {renderSortIcons('created_at')}
                                                    </th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {paginatedData.length === 0 ? (
                                                    <tr>
                                                        <td colSpan={3} className="text-center text-muted py-4">No results match your search.</td>
                                                    </tr>
                                                ) : paginatedData.map(item => (
                                                    <tr
                                                        key={item.id}
                                                        style={{ cursor: 'pointer' }}
                                                        onClick={() => window.open(item.url, '_blank', 'noreferrer')}
                                                        title="Open article in new tab"
                                                    >
                                                        <td className="align-middle fw-semibold" style={{ whiteSpace: 'nowrap' }}>{item.domainName}</td>
                                                        <td className="align-middle" style={{ maxWidth: 340, wordBreak: 'break-all' }}>
                                                            <a
                                                                href={item.url}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                onClick={e => e.stopPropagation()}
                                                                className="text-decoration-none"
                                                            >
                                                                {item.url}
                                                            </a>
                                                        </td>
                                                        <td className="align-middle text-end text-muted" style={{ whiteSpace: 'nowrap' }}>
                                                            {item.created_at
                                                                ? new Date(item.created_at).toLocaleString()
                                                                : '-'}
                                                        </td>
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
                    )}
                </Modal.Body>
                <Modal.Footer>
                    <Button variant="secondary" onClick={handleClose}>Close</Button>
                </Modal.Footer>
            </Modal>
        );
    };


    render() {
        const { show, onHide, monitoredKeywords, auth } = this.props;
        const { isAuthenticated } = auth;
        const { isLoading, showHelp } = this.state;

        return (
            <Fragment>
                <Modal show={show} onHide={onHide} size="xl" centered>
                    <Modal.Header closeButton>
                        <Modal.Title>
                            <i className="material-icons me-2 align-middle text-primary" style={{ fontSize: 22 }}>track_changes</i>
                            <span className="align-middle">Monitored Keywords</span>
                        </Modal.Title>
                    </Modal.Header>
                    <Modal.Body>
                        {/* Header row: Add button (right) + Help toggle */}
                        <div className="d-flex justify-content-between align-items-start mb-3">
                            <div className="flex-grow-1 me-3">
                                <div
                                    className="d-flex align-items-center"
                                    onClick={() => this.setState(prev => ({ showHelp: !prev.showHelp }))}
                                    style={{ cursor: 'pointer' }}
                                >
                                    <i className="material-icons text-primary me-2">
                                        {showHelp ? 'expand_less' : 'expand_more'}
                                    </i>
                                    <span className="text-muted">Need help with Monitored Keywords?</span>
                                </div>
                                {showHelp && (
                                    <div className="mt-3 ps-4 border-start border-primary">
                                        <ul className="mb-0 ps-3 text-muted">
                                            <li>Add a keyword (or phrase) that will be watched across all RSS feed articles</li>
                                            <li>🔥 <strong>Warm</strong> - default level, seen infrequently</li>
                                            <li>🔥🔥 <strong>Hot</strong> - detected in ≥ 3 articles</li>
                                            <li>🔥🔥🔥 <strong>Super Hot</strong> - detected in ≥ 10 articles</li>
                                            <li>The alert level auto-escalates based on occurrence count - you can also override it manually</li>
                                            <li><strong>Tip:</strong> Click any row to see all RSS articles where the keyword was detected</li>
                                        </ul>
                                    </div>
                                )}
                            </div>
                            {isAuthenticated && (
                                <button
                                    className="btn btn-success"
                                    onClick={() => this.setState({ showAddModal: true })}
                                    style={{ whiteSpace: 'nowrap' }}
                                >
                                    <i className="material-icons me-1" style={{ verticalAlign: 'middle', fontSize: '18px' }}>add_circle</i>
                                    Add Keyword
                                </button>
                            )}
                        </div>

                        {isLoading ? (
                            <div className="text-center py-5">
                                <div className="spinner-border text-primary" role="status" />
                                <div className="mt-2 text-muted">Loading keywords…</div>
                            </div>
                        ) : (
                            <TableManager
                                data={monitoredKeywords}
                                filterConfig={FILTER_CONFIG}
                                searchFields={['name']}
                                defaultSort="occurrences"
                                customFilters={this.customFilters}
                                moduleKey="threatsWatcher_monitoredKeywords"
                            >
                                {({
                                    paginatedData,
                                    handleSort,
                                    renderSortIcons,
                                    renderFilters,
                                    renderPagination,
                                    renderItemsInfo,
                                    renderFilterControls,
                                    renderSaveModal,
                                    getTableContainerStyle
                                }) => (
                                    <Fragment>
                                        {renderFilterControls()}
                                        {renderFilters()}
                                        {renderItemsInfo()}
                                        <div className="row">
                                            <div className="col-lg-12">
                                                <div style={{ ...getTableContainerStyle(), overflowX: 'auto' }}>
                                                    <table className="table table-striped table-hover mb-0">
                                                        <thead>
                                                            <tr>
                                                                <th role="button" onClick={() => handleSort('name')}>
                                                                    Keyword {renderSortIcons('name')}
                                                                </th>
                                                                <th className="text-center" role="button" onClick={() => handleSort('level')}>
                                                                    Level {renderSortIcons('level')}
                                                                </th>
                                                                <th className="text-center" role="button" onClick={() => handleSort('occurrences')}>
                                                                    Occurrences {renderSortIcons('occurrences')}
                                                                </th>
                                                                <th className="text-center" role="button" onClick={() => handleSort('last_seen')}>
                                                                    Last Seen {renderSortIcons('last_seen')}
                                                                </th>
                                                                {isAuthenticated && <th className="text-end">Actions</th>}
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {paginatedData.length === 0 ? (
                                                                <tr>
                                                                    <td colSpan={isAuthenticated ? 5 : 4} className="text-center text-muted py-4">
                                                                        No monitored keywords found.
                                                                    </td>
                                                                </tr>
                                                            ) : (
                                                                paginatedData.map(mk => (
                                                                    <tr
                                                                        key={mk.id}
                                                                        style={{ cursor: 'pointer' }}
                                                                        onClick={() => this.openSourcesModal(mk)}
                                                                        title="Click to see detected sources"
                                                                    >
                                                                        <td className="align-middle">
                                                                            <span className="fw-semibold">{mk.name}</span>
                                                                        </td>
                                                                        <td className="text-center align-middle">
                                                                            {this.renderLevelFlames(mk.level)}
                                                                        </td>
                                                                        <td className="text-center align-middle">
                                                                            <span className="badge bg-secondary">{mk.occurrences}</span>
                                                                        </td>
                                                                        <td className="text-center align-middle">
                                                                            {mk.last_seen ? (
                                                                                <DateWithTooltip date={mk.last_seen} includeTime={true} type="updated" />
                                                                            ) : (
                                                                                <span className="text-muted fst-italic">Never</span>
                                                                            )}
                                                                        </td>
                                                                        {isAuthenticated && (
                                                                            <td
                                                                                className="text-end align-middle"
                                                                                style={{ whiteSpace: 'nowrap' }}
                                                                                onClick={e => e.stopPropagation()}
                                                                            >
                                                                                <button
                                                                                    className="btn btn-outline-warning btn-sm me-2"
                                                                                    title="Edit"
                                                                                    onClick={() => this.openEditModal(mk)}
                                                                                >
                                                                                    <i className="material-icons" style={{ fontSize: 17 }}>edit</i>
                                                                                </button>
                                                                                <button
                                                                                    className="btn btn-outline-danger btn-sm"
                                                                                    title="Delete"
                                                                                    onClick={() => this.openDeleteModal(mk.id, mk.name)}
                                                                                >
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
                                            </div>
                                        </div>
                                        {renderPagination()}
                                        {renderSaveModal()}
                                    </Fragment>
                                )}
                            </TableManager>
                        )}
                    </Modal.Body>
                    <Modal.Footer>
                        <Button variant="secondary" onClick={onHide}>Close</Button>
                    </Modal.Footer>
                </Modal>

                {this.renderAddModal()}
                {this.renderEditModal()}
                {this.renderDeleteModal()}
                {this.renderSourcesModal()}
            </Fragment>
        );
    }
}

const mapStateToProps = state => ({
    monitoredKeywords: state.leads.monitoredKeywords,
    auth: state.auth
});

export default connect(mapStateToProps, {
    getMonitoredKeywords,
    addMonitoredKeyword,
    deleteMonitoredKeyword,
    patchMonitoredKeyword
})(MonitoredKeywords);
