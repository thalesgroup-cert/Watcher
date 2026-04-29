import React, { Component, Fragment } from 'react';
import { connect } from 'react-redux';
import PropTypes from 'prop-types';
import { getBannedWords, addBannedWord, deleteBannedWord, patchBannedWord } from '../../actions/leads';
import { Button, Modal, Form } from 'react-bootstrap';
import TableManager from '../common/TableManager';
import DateWithTooltip from '../common/DateWithTooltip';

const FILTER_CONFIG = [
    { key: 'search', type: 'search', label: 'Search', placeholder: 'Search by word...', width: 5 },
];

class BannedWordsPanel extends Component {
    constructor(props) {
        super(props);
        this.state = {
            showHelp:        false,
            showAddModal:    false,
            addName:         '',
            showEditModal:   false,
            editId:          null,
            editName:        '',
            showDeleteModal: false,
            deleteId:        null,
            deleteName:      '',
        };
    }

    static propTypes = {
        bannedWords:     PropTypes.array.isRequired,
        getBannedWords:  PropTypes.func.isRequired,
        addBannedWord:   PropTypes.func.isRequired,
        deleteBannedWord: PropTypes.func.isRequired,
        patchBannedWord: PropTypes.func.isRequired,
        auth:            PropTypes.object.isRequired,
    };

    componentDidMount() {
        this.props.getBannedWords();
    }

    handleAdd = e => {
        e.preventDefault();
        const name = this.state.addName.trim();
        if (!name) return;
        this.props.addBannedWord({ name });
        this.setState({ addName: '', showAddModal: false });
    };

    openEditModal = bw => {
        this.setState({ showEditModal: true, editId: bw.id, editName: bw.name });
    };

    handleEdit = e => {
        e.preventDefault();
        const name = this.state.editName.trim();
        if (!name) return;
        this.props.patchBannedWord(this.state.editId, { name });
        this.setState({ showEditModal: false, editId: null });
    };

    openDeleteModal = (id, name) => {
        this.setState({ showDeleteModal: true, deleteId: id, deleteName: name });
    };

    submitDelete = e => {
        e.preventDefault();
        this.props.deleteBannedWord(this.state.deleteId, this.state.deleteName);
        this.setState({ showDeleteModal: false, deleteId: null });
    };

    render() {
        const { bannedWords, auth } = this.props;
        const { isAuthenticated } = auth;
        const { showHelp, showAddModal, addName, showEditModal, editName, showDeleteModal, deleteName } = this.state;

        return (
            <Fragment>
                <div className="d-flex justify-content-between align-items-center mb-3">
                    <h4>Banned Words</h4>
                    {isAuthenticated && (
                        <button className="btn btn-success" onClick={() => this.setState({ showAddModal: true })}>
                            <i className="material-icons me-1" style={{ verticalAlign: 'middle', fontSize: '18px' }}>add_circle</i>
                            Add Banned Word
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
                        <span className="text-muted">Need help with Banned Words?</span>
                    </div>
                    {showHelp && (
                        <div className="mt-3 ps-4 border-start border-primary">
                            <ul className="mb-0 ps-3 text-muted">
                                <li>Words added here are <strong>permanently excluded</strong> from trending word detection</li>
                                <li>Use this to filter out common noise words (e.g. "the", "and", "security")</li>
                                <li>Changes take effect on the next crawl cycle</li>
                            </ul>
                        </div>
                    )}
                </div>

                <TableManager
                    data={bannedWords}
                    filterConfig={FILTER_CONFIG}
                    searchFields={['name']}
                    dateFields={['created_at']}
                    defaultSort="created_at"
                    enableDateFilter={true}
                    moduleKey="cyberWatch_bannedWords"
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
                                            <th role="button" onClick={() => handleSort('name')}>Word {renderSortIcons('name')}</th>
                                            <th className="text-center" role="button" onClick={() => handleSort('created_at')}>Added {renderSortIcons('created_at')}</th>
                                            {isAuthenticated && <th className="text-end">Actions</th>}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {paginatedData.length === 0 ? (
                                            <tr><td colSpan={isAuthenticated ? 3 : 2} className="text-center text-muted py-4">No results found</td></tr>
                                        ) : paginatedData.map(bw => (
                                            <tr key={bw.id}>
                                                <td className="align-middle fw-semibold">{bw.name}</td>
                                                <td className="text-center align-middle">
                                                    {bw.created_at
                                                        ? <DateWithTooltip date={bw.created_at} type="created" />
                                                        : <span className="text-muted">-</span>}
                                                </td>
                                                {isAuthenticated && (
                                                    <td className="text-end align-middle" style={{ whiteSpace: 'nowrap' }}>
                                                        <button className="btn btn-outline-warning btn-sm me-2" title="Edit" onClick={() => this.openEditModal(bw)}>
                                                            <i className="material-icons" style={{ fontSize: 17 }}>edit</i>
                                                        </button>
                                                        <button className="btn btn-outline-danger btn-sm" title="Delete" onClick={() => this.openDeleteModal(bw.id, bw.name)}>
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
                    <Modal.Header closeButton><Modal.Title>Add Banned Word</Modal.Title></Modal.Header>
                    <Modal.Body>
                        <form id="banned-add-form" onSubmit={this.handleAdd}>
                            <Form.Group className="mb-3">
                                <Form.Label><strong>Word</strong></Form.Label>
                                <Form.Control
                                    type="text"
                                    placeholder="Enter word to ban..."
                                    value={addName}
                                    onChange={e => this.setState({ addName: e.target.value })}
                                    autoFocus required
                                />
                            </Form.Group>
                        </form>
                    </Modal.Body>
                    <Modal.Footer>
                        <Button variant="secondary" className="me-2" onClick={() => this.setState({ showAddModal: false })}>Close</Button>
                        <Button type="submit" form="banned-add-form" variant="success" disabled={!addName.trim()}>
                            Add
                        </Button>
                    </Modal.Footer>
                </Modal>

                <Modal show={showEditModal} onHide={() => this.setState({ showEditModal: false })} centered>
                    <Modal.Header closeButton><Modal.Title>Edit Banned Word</Modal.Title></Modal.Header>
                    <Modal.Body>
                        <form id="banned-edit-form" onSubmit={this.handleEdit}>
                            <Form.Group className="mb-3">
                                <Form.Label><strong>Word</strong></Form.Label>
                                <Form.Control
                                    type="text"
                                    value={editName}
                                    onChange={e => this.setState({ editName: e.target.value })}
                                    autoFocus required
                                />
                            </Form.Group>
                        </form>
                    </Modal.Body>
                    <Modal.Footer>
                        <Button variant="secondary" className="me-2" onClick={() => this.setState({ showEditModal: false })}>Close</Button>
                        <Button type="submit" form="banned-edit-form" variant="warning" disabled={!editName.trim()}>
                            Update
                        </Button>
                    </Modal.Footer>
                </Modal>

                <Modal show={showDeleteModal} onHide={() => this.setState({ showDeleteModal: false })} centered>
                    <Modal.Header closeButton><Modal.Title>Confirm Deletion</Modal.Title></Modal.Header>
                    <Modal.Body>Remove <b>{deleteName}</b> from the Banned Words list?</Modal.Body>
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
    bannedWords: state.leads.bannedWords,
    auth:        state.auth,
});

export default connect(mapStateToProps, {
    getBannedWords,
    addBannedWord,
    deleteBannedWord,
    patchBannedWord,
})(BannedWordsPanel);
