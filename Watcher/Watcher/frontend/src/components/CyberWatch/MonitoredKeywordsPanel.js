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
    { value: 'warm',      label: 'Warm',      desc: 'Low activity – keyword seen rarely' },
    { value: 'hot',       label: 'Hot',       desc: 'Moderate activity (≥ 3 hits)' },
    { value: 'super_hot', label: 'Super Hot', desc: 'High activity (≥ 10 hits)' },
];

const FILTER_CONFIG = [
    { key: 'search', type: 'search', label: 'Search', placeholder: 'Search by keyword name...', width: 4 },
    {
        key: 'level', type: 'select', label: 'Level', width: 2,
        options: LEVEL_OPTIONS.map(o => ({ value: o.value, label: o.label }))
    }
];

const SOURCES_FILTER_CONFIG = [
    { key: 'search', type: 'search', label: 'Search', placeholder: 'Filter by domain or URL…', width: 8 }
];

function parsePostUrls(posturls = []) {
    return posturls.map((raw, idx) => {
        const commaIdx = raw.indexOf(',');
        const url      = commaIdx > -1 ? raw.slice(0, commaIdx) : raw;
        const dateStr  = commaIdx > -1 ? raw.slice(commaIdx + 1) : null;
        let domainName = '';
        try { domainName = new URL(url).hostname; } catch (_) { domainName = url; }
        return { id: idx, url, domainName, created_at: dateStr };
    });
}


class MonitoredKeywordsPanel extends Component {
    constructor(props) {
        super(props);
        this.state = {
            showAddModal:    false,
            addName:         '',
            addLevel:        'warm',
            showEditModal:   false,
            editId:          null,
            editName:        '',
            editLevel:       'warm',
            showDeleteModal: false,
            selectedId:      null,
            selectedName:    '',
            showSourcesModal:   false,
            sourcesKeyword:     '',
            sourcesPosturls:    [],
            showHelp: false,
        };
    }

    static propTypes = {
        monitoredKeywords:      PropTypes.array.isRequired,
        getMonitoredKeywords:   PropTypes.func.isRequired,
        addMonitoredKeyword:    PropTypes.func.isRequired,
        deleteMonitoredKeyword: PropTypes.func.isRequired,
        patchMonitoredKeyword:  PropTypes.func.isRequired,
        auth:                   PropTypes.object.isRequired,
    };

    componentDidMount() {
        this.props.getMonitoredKeywords();
    }

    customFilters = (filtered, filters) => {
        if (filters.level) filtered = filtered.filter(mk => mk.level === filters.level);
        return filtered;
    };

    handleAdd = e => {
        e.preventDefault();
        const name = this.state.addName.trim();
        if (!name) return;
        this.props.addMonitoredKeyword({ name, level: this.state.addLevel });
        this.setState({ addName: '', addLevel: 'warm', showAddModal: false });
    };

    openEditModal = (mk) => {
        this.setState({ showEditModal: true, editId: mk.id, editName: mk.name, editLevel: mk.level || 'warm' });
    };

    handleEdit = e => {
        e.preventDefault();
        const name = this.state.editName.trim();
        if (!name) return;
        this.props.patchMonitoredKeyword(this.state.editId, { name, level: this.state.editLevel });
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
        this.setState({ showSourcesModal: true, sourcesKeyword: mk.name, sourcesPosturls: mk.posturls || [] });
    };

    renderLevelFlames = (level) => (
        <span title={level} style={{ fontSize: '1.1rem', letterSpacing: 1 }}>{LEVEL_FLAMES[level] || '?'}</span>
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
                        min={0} max={2} step={1}
                        value={safeIdx}
                        onChange={e => onChange(LEVEL_VALUES[parseInt(e.target.value)])}
                    />
                    <div className="d-flex justify-content-between">
                        {LEVEL_OPTIONS.map(o => (
                            <div key={o.value} className="text-center" style={{ flex: '1', fontSize: '0.78rem' }}>
                                <div style={{ fontSize: '1.2rem' }}>{LEVEL_FLAMES[o.value]}</div>
                                <div className={`fw-semibold ${value === o.value ? 'text-primary' : 'text-muted'}`}>
                                    {o.label}
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

    render() {
        const { monitoredKeywords, auth } = this.props;
        const { isAuthenticated } = auth;
        const { showHelp, showAddModal, addName, addLevel, showEditModal, editName, editLevel,
                showDeleteModal, selectedName, showSourcesModal, sourcesKeyword, sourcesPosturls } = this.state;

        return (
            <Fragment>
                <div className="d-flex justify-content-between align-items-center mb-3">
                    <h4>Monitored Keywords</h4>
                    {isAuthenticated && (
                        <button className="btn btn-success" onClick={() => this.setState({ showAddModal: true })}>
                            <i className="material-icons me-1" style={{ verticalAlign: 'middle', fontSize: '18px' }}>add_circle</i>
                            Add Keyword
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
                        <span className="text-muted">Need help with Monitored Keywords?</span>
                    </div>
                    {showHelp && (
                        <div className="mt-3 ps-4 border-start border-primary">
                            <ul className="mb-0 ps-3 text-muted">
                                <li>Add a keyword/phrase to watch across all RSS feed articles</li>
                                <li>🔥 <strong>Warm</strong> – default; seen infrequently</li>
                                <li>🔥🔥 <strong>Hot</strong> – detected in ≥ 3 articles</li>
                                <li>🔥🔥🔥 <strong>Super Hot</strong> – detected in ≥ 10 articles</li>
                                <li>Click any row to see all articles where the keyword was detected</li>
                            </ul>
                        </div>
                    )}
                </div>

                <TableManager
                    data={monitoredKeywords}
                    filterConfig={FILTER_CONFIG}
                    searchFields={['name']}
                    defaultSort="occurrences"
                    customFilters={this.customFilters}
                    moduleKey="cyberWatch_monitoredKeywords"
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
                                            <th role="button" onClick={() => handleSort('name')}>Keyword {renderSortIcons('name')}</th>
                                            <th className="text-center" role="button" onClick={() => handleSort('level')}>Level {renderSortIcons('level')}</th>
                                            <th className="text-center" role="button" onClick={() => handleSort('occurrences')}>Occurrences {renderSortIcons('occurrences')}</th>
                                            <th className="text-center" role="button" onClick={() => handleSort('last_seen')}>Last Seen {renderSortIcons('last_seen')}</th>
                                            {isAuthenticated && <th className="text-end">Actions</th>}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {paginatedData.length === 0 ? (
                                            <tr><td colSpan={isAuthenticated ? 5 : 4} className="text-center text-muted py-4">No results found</td></tr>
                                        ) : paginatedData.map(mk => (
                                            <tr key={mk.id} style={{ cursor: 'pointer' }} onClick={() => this.openSourcesModal(mk)} title="Click to see detected sources">
                                                <td className="align-middle fw-semibold">{mk.name}</td>
                                                <td className="text-center align-middle">{this.renderLevelFlames(mk.level)}</td>
                                                <td className="text-center align-middle"><span className="badge bg-secondary">{mk.occurrences}</span></td>
                                                <td className="text-center align-middle">
                                                    {mk.last_seen
                                                        ? <DateWithTooltip date={mk.last_seen} includeTime={true} type="updated" />
                                                        : <span className="text-muted fst-italic">Never</span>}
                                                </td>
                                                {isAuthenticated && (
                                                    <td className="text-end align-middle" style={{ whiteSpace: 'nowrap' }} onClick={e => e.stopPropagation()}>
                                                        <button className="btn btn-outline-warning btn-sm me-2" title="Edit" onClick={() => this.openEditModal(mk)}>
                                                            <i className="material-icons" style={{ fontSize: 17 }}>edit</i>
                                                        </button>
                                                        <button className="btn btn-outline-danger btn-sm" title="Delete" onClick={() => this.openDeleteModal(mk.id, mk.name)}>
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
                    <Modal.Header closeButton><Modal.Title>Add Monitored Keyword</Modal.Title></Modal.Header>
                    <Modal.Body>
                        <form id="panel-add-mk-form" onSubmit={this.handleAdd}>
                            <Form.Group className="mb-3">
                                <Form.Label><strong>Keyword</strong></Form.Label>
                                <Form.Control
                                    type="text"
                                    placeholder='company, company.com...'
                                    value={addName}
                                    onChange={e => this.setState({ addName: e.target.value })}
                                    autoFocus required
                                />
                            </Form.Group>
                            {this.renderLevelSelector(addLevel, v => this.setState({ addLevel: v }))}
                        </form>
                    </Modal.Body>
                    <Modal.Footer>
                        <Button variant="secondary" className="me-2" onClick={() => this.setState({ showAddModal: false })}>Close</Button>
                        <Button type="submit" form="panel-add-mk-form" variant="success" disabled={!addName.trim()}>
                            Add
                        </Button>
                    </Modal.Footer>
                </Modal>

                <Modal show={showEditModal} onHide={() => this.setState({ showEditModal: false })} centered>
                    <Modal.Header closeButton><Modal.Title>Edit Monitored Keyword</Modal.Title></Modal.Header>
                    <Modal.Body>
                        <form id="panel-edit-mk-form" onSubmit={this.handleEdit}>
                            <Form.Group className="mb-3">
                                <Form.Label><strong>Keyword</strong></Form.Label>
                                <Form.Control
                                    type="text"
                                    value={editName}
                                    onChange={e => this.setState({ editName: e.target.value })}
                                    autoFocus required
                                />
                            </Form.Group>
                            {this.renderLevelSelector(editLevel, v => this.setState({ editLevel: v }))}
                        </form>
                    </Modal.Body>
                    <Modal.Footer>
                        <Button variant="secondary" className="me-2" onClick={() => this.setState({ showEditModal: false })}>Close</Button>
                        <Button type="submit" form="panel-edit-mk-form" variant="warning" disabled={!editName.trim()}>
                            Update
                        </Button>
                    </Modal.Footer>
                </Modal>

                <Modal show={showDeleteModal} onHide={() => this.setState({ showDeleteModal: false })} centered>
                    <Modal.Header closeButton><Modal.Title>Confirm Deletion</Modal.Title></Modal.Header>
                    <Modal.Body>Remove <b>{selectedName}</b> from Monitored Keywords?</Modal.Body>
                    <Modal.Footer>
                        <Button variant="secondary" className="me-2" onClick={() => this.setState({ showDeleteModal: false })}>Close</Button>
                        <form onSubmit={this.submitDelete} style={{ display: 'inline' }}>
                            <Button type="submit" variant="danger">Yes, I'm sure</Button>
                        </form>
                    </Modal.Footer>
                </Modal>

                <Modal show={showSourcesModal} onHide={() => this.setState({ showSourcesModal: false })} size="xl" centered>
                    <Modal.Header closeButton>
                        <Modal.Title>
                            <i className="material-icons me-2 align-middle text-primary" style={{ fontSize: 20 }}>rss_feed</i>
                            Sources for <b>{sourcesKeyword}</b>
                        </Modal.Title>
                    </Modal.Header>
                    <Modal.Body style={{ maxHeight: 'calc(90vh - 160px)', overflowY: 'auto' }}>
                        {(() => {
                            const allUrls = parsePostUrls(sourcesPosturls);
                            if (allUrls.length === 0) {
                                return (
                                    <div className="text-center text-muted py-5">
                                        <i className="material-icons" style={{ fontSize: 40 }}>rss_feed</i>
                                        <p className="mt-2 mb-1">No results found</p>
                                    </div>
                                );
                            }
                            return (
                                <TableManager
                                    data={allUrls}
                                    filterConfig={SOURCES_FILTER_CONFIG}
                                    searchFields={['url', 'domainName']}
                                    dateFields={['created_at']}
                                    defaultSort="created_at"
                                    moduleKey="cyberWatch_mkSources"
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
                                                            <th role="button" onClick={() => handleSort('domainName')}>Domain {renderSortIcons('domainName')}</th>
                                                            <th>URL</th>
                                                            <th className="text-end" role="button" onClick={() => handleSort('created_at')}>Detected {renderSortIcons('created_at')}</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {paginatedData.length === 0 ? (
                                                            <tr><td colSpan={3} className="text-center text-muted py-4">No results found</td></tr>
                                                        ) : paginatedData.map(item => (
                                                            <tr key={item.id} style={{ cursor: 'pointer' }} onClick={() => window.open(item.url, '_blank', 'noreferrer')}>
                                                                <td className="align-middle fw-semibold" style={{ whiteSpace: 'nowrap' }}>{item.domainName}</td>
                                                                <td className="align-middle" style={{ maxWidth: 340, wordBreak: 'break-all' }}>
                                                                    <a href={item.url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="text-decoration-none">{item.url}</a>
                                                                </td>
                                                                <td className="align-middle text-end text-muted" style={{ whiteSpace: 'nowrap' }}>
                                                                    {item.created_at ? new Date(item.created_at).toLocaleString() : '-'}
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
                            );
                        })()}
                    </Modal.Body>
                    <Modal.Footer>
                        <Button variant="secondary" onClick={() => this.setState({ showSourcesModal: false })}>Close</Button>
                    </Modal.Footer>
                </Modal>
            </Fragment>
        );
    }
}

const mapStateToProps = state => ({
    monitoredKeywords: state.leads.monitoredKeywords,
    auth: state.auth,
});

export default connect(mapStateToProps, {
    getMonitoredKeywords,
    addMonitoredKeyword,
    deleteMonitoredKeyword,
    patchMonitoredKeyword,
})(MonitoredKeywordsPanel);
