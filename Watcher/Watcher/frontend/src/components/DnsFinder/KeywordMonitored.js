import React, {Component, Fragment} from 'react';
import {connect} from 'react-redux';
import PropTypes from 'prop-types';
import { getKeywordMonitored, deleteKeywordMonitored, addKeywordMonitored, patchKeywordMonitored } from "../../actions/DnsFinder";
import { Button, Modal, Container, Row, Col, Form } from 'react-bootstrap';
import TableManager from '../common/TableManager';

export class KeywordMonitored extends Component {

    constructor(props) {
        super(props);
        this.state = {
            showDeleteModal: false,
            showEditModal: false,
            showAddModal: false,
            id: 0,
            word: ""
        };
        this.inputRef = React.createRef();
    }

    static propTypes = {
        keywordMonitored: PropTypes.array.isRequired,
        getKeywordMonitored: PropTypes.func.isRequired,
        deleteKeywordMonitored: PropTypes.func.isRequired,
        addKeywordMonitored: PropTypes.func.isRequired,
        patchKeywordMonitored: PropTypes.func.isRequired,
        auth: PropTypes.object.isRequired,
        globalFilters: PropTypes.object
    };

    componentDidMount() {
        this.props.getKeywordMonitored();
    }

    customFilters = (filtered, filters) => {
        const { globalFilters = {} } = this.props;

        if (globalFilters.search) {
            const searchTerm = globalFilters.search.toLowerCase();
            filtered = filtered.filter(keyword =>
                (keyword.name || '').toLowerCase().includes(searchTerm)
            );
        }

        if (globalFilters.keyword) {
            filtered = filtered.filter(keyword => 
                keyword.name === globalFilters.keyword
            );
        }

        return filtered;
    };

    displayDeleteModal = (id, word) => {
        this.setState({
            showDeleteModal: true,
            id: id,
            word: word,
        });
    };

    deleteModal = () => {
        const handleClose = () => this.setState({ showDeleteModal: false });

        const onSubmit = e => {
            e.preventDefault();
            this.props.deleteKeywordMonitored(this.state.id, this.state.word);
            this.setState({
                word: "",
                id: 0
            });
            handleClose();
        };

        return (
            <Modal show={this.state.showDeleteModal} onHide={handleClose} centered>
                <Modal.Header closeButton>
                    <Modal.Title>Action Requested</Modal.Title>
                </Modal.Header>
                <Modal.Body>Are you sure you want to <b><u>delete</u></b> <b>{this.state.word}</b> keyword, the
                <b> associated alerts</b>, and <b>twisted dns</b>?</Modal.Body>
                <Modal.Footer>
                    <form onSubmit={onSubmit}>
                        <Button variant="secondary" className="me-2" onClick={handleClose}>
                            Close
                        </Button>
                        <Button type="submit" variant="danger">
                            Yes, I'm sure
                        </Button>
                    </form>
                </Modal.Footer>
            </Modal>
        );
    };

    displayEditModal = (id, word) => {
        this.setState({
            showEditModal: true,
            id: id,
            word: word,
        });
    };

    editModal = () => {
        const handleClose = () => this.setState({ showEditModal: false });

        const onSubmit = e => {
            e.preventDefault();
            const name = this.inputRef.current.value;
            const keyword_monitored = { name };
            this.props.patchKeywordMonitored(this.state.id, keyword_monitored);
            this.setState({
                word: "",
                id: 0
            });
            handleClose();
        };

        return (
            <Modal show={this.state.showEditModal} onHide={handleClose} centered>
                <Modal.Header closeButton>
                    <Modal.Title>Edit Keyword</Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    <Container>
                        <Row>
                            <Col>
                                <Form onSubmit={onSubmit}>
                                    <Form.Group as={Row} className="mb-3 align-items-center">
                                        <Form.Label column sm={4}>
                                            Keyword
                                        </Form.Label>
                                        <Col sm={8}>
                                            <Form.Control 
                                                required 
                                                ref={this.inputRef}
                                                type="text"
                                                placeholder="company, company.com..."
                                                defaultValue={this.state.word}
                                            />
                                        </Col>
                                    </Form.Group>
                                    
                                    <div className="d-flex justify-content-end gap-2 modal-buttons-group">
                                        <Button variant="secondary" onClick={handleClose}>
                                            Close
                                        </Button>
                                        <Button type="submit" variant="warning">
                                            Update
                                        </Button>
                                    </div>
                                </Form>
                            </Col>
                        </Row>
                    </Container>
                </Modal.Body>
            </Modal>
        );
    };

    displayAddModal = () => {
        this.setState({
            showAddModal: true
        });
    };

    addModal = () => {
        const handleClose = () => this.setState({ showAddModal: false });

        const onSubmit = e => {
            e.preventDefault();
            const name = this.inputRef.current.value;
            const keyword_monitored = { name };
            this.props.addKeywordMonitored(keyword_monitored);
            this.setState({
                word: ""
            });
            handleClose();
        };

        return (
            <Modal show={this.state.showAddModal} onHide={handleClose} centered>
                <Modal.Header closeButton>
                    <Modal.Title>Add New Keyword</Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    <Container>
                        <Row>
                            <Col>
                                <Form onSubmit={onSubmit}>
                                    <Form.Group as={Row} className="mb-3 align-items-center">
                                        <Form.Label column sm={4}>
                                            Keyword
                                        </Form.Label>
                                        <Col sm={8}>
                                            <Form.Control 
                                                required 
                                                ref={this.inputRef}
                                                type="text"
                                                placeholder="company, company.com..."
                                            />
                                        </Col>
                                    </Form.Group>
                                    
                                    <div className="d-flex justify-content-end gap-2 modal-buttons-group">
                                        <Button variant="secondary" onClick={handleClose}>
                                            Close
                                        </Button>
                                        <Button type="submit" variant="success">
                                            Add
                                        </Button>
                                    </div>
                                </Form>
                            </Col>
                        </Row>
                    </Container>
                </Modal.Body>
            </Modal>
        );
    };

    render() {
        const { keywordMonitored, auth, globalFilters } = this.props;
        const { isAuthenticated } = auth;

        return (
            <Fragment>
                <div className="row">
                    <div className="col-lg-12">
                        <div className="d-flex justify-content-between align-items-center" style={{marginBottom: 12}}>
                            <div>
                                <h4>Corporate Keywords Monitored</h4>
                                <h6 className="text-muted">Certificate Transparency Stream Monitoring</h6>
                            </div>
                            <div>
                                <button className="btn btn-success" onClick={() => {
                                    this.displayAddModal()
                                }}>
                                    <i className="material-icons me-1 align-middle"
                                       style={{fontSize: 23}}>&#xE147;</i>
                                    <span className="align-middle">Add New Keyword</span>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                <TableManager
                    data={keywordMonitored}
                    filterConfig={[]}
                    customFilters={this.customFilters}
                    searchFields={['name']}
                    dateFields={['created_at']}
                    defaultSort="created_at"
                    globalFilters={globalFilters}
                    moduleKey="dnsFinder_keywords"
                >
                    {({
                        paginatedData,
                        renderItemsInfo,
                        renderPagination,
                        handleSort,
                        renderSortIcons,
                        getTableContainerStyle
                    }) => (
                        <Fragment>
                            {renderItemsInfo()}

                            <div className="row">
                                <div className="col-lg-12">
                                    <div style={{ ...getTableContainerStyle(),  overflowX: 'auto' }}>
                                        <table className="table table-striped table-hover">
                                            <thead>
                                                <tr>
                                                    <th style={{ cursor: 'pointer' }} onClick={() => handleSort('name')}>
                                                        Name{renderSortIcons('name')}
                                                    </th>
                                                    <th style={{ cursor: 'pointer' }} onClick={() => handleSort('created_at')}>
                                                        Created At{renderSortIcons('created_at')}
                                                    </th>
                                                    <th />
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {paginatedData.map(keyword => (
                                                    <tr key={keyword.id}>
                                                        <td><h5>{keyword.name}</h5></td>
                                                        <td>{(new Date(keyword.created_at)).toDateString()}</td>
                                                        <td className="text-end" style={{ whiteSpace: 'nowrap' }}>
                                                            {isAuthenticated && (
                                                                <>
                                                                    <button
                                                                        className="btn btn-outline-warning btn-sm me-2"
                                                                        data-toggle="tooltip"
                                                                        data-placement="top"
                                                                        title="Edit"
                                                                        onClick={() => this.displayEditModal(keyword.id, keyword.name)}
                                                                    >
                                                                        <i className="material-icons" style={{ fontSize: 17, lineHeight: 1.8, margin: -2.5 }}>edit</i>
                                                                    </button>
                                                                    <button
                                                                        className="btn btn-outline-danger btn-sm"
                                                                        data-toggle="tooltip"
                                                                        data-placement="top"
                                                                        title="Delete"
                                                                        onClick={() => this.displayDeleteModal(keyword.id, keyword.name)}
                                                                    >
                                                                        <i className="material-icons" style={{ fontSize: 17, lineHeight: 1.8, margin: -2.5 }}>delete</i>
                                                                    </button>
                                                                </>
                                                            )}
                                                        </td>
                                                    </tr>
                                                ))}
                                                {paginatedData.length === 0 && (
                                                    <tr>
                                                        <td colSpan="3" className="text-center text-muted py-4">
                                                            No keywords found
                                                        </td>
                                                    </tr>
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>

                            {renderPagination()}
                        </Fragment>
                    )}
                </TableManager>

                {this.deleteModal()}
                {this.editModal()}
                {this.addModal()}
            </Fragment>
        );
    }
}

const mapStateToProps = state => ({
    keywordMonitored: state.DnsFinder.keywordMonitored,
    auth: state.auth
});

export default connect(mapStateToProps, {
    getKeywordMonitored,
    deleteKeywordMonitored,
    addKeywordMonitored,
    patchKeywordMonitored
})(KeywordMonitored);