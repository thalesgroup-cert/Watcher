import React, {Component, Fragment} from 'react';
import {connect} from 'react-redux';
import PropTypes from 'prop-types';
import { getDnsMonitored, deleteDnsMonitored, addDnsMonitored, patchDnsMonitored } from "../../actions/DnsFinder";
import { Button, Modal, Container, Row, Col, Form } from 'react-bootstrap';
import TableManager from '../common/TableManager';

export class DnsMonitored extends Component {
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
        dnsMonitored: PropTypes.array.isRequired,
        getDnsMonitored: PropTypes.func.isRequired,
        deleteDnsMonitored: PropTypes.func.isRequired,
        addDnsMonitored: PropTypes.func.isRequired,
        patchDnsMonitored: PropTypes.func.isRequired,
        auth: PropTypes.object.isRequired,
        globalFilters: PropTypes.object,
        filteredData: PropTypes.array
    };

    componentDidMount() {
        this.props.getDnsMonitored();
    }

    customFilters = (filtered, filters) => {
        const { globalFilters = {} } = this.props;

        if (globalFilters.search) {
            const searchTerm = globalFilters.search.toLowerCase();
            filtered = filtered.filter(domain =>
                (domain.domain_name || '').toLowerCase().includes(searchTerm)
            );
        }

        if (globalFilters.domain) {
            filtered = filtered.filter(domain => 
                domain.domain_name === globalFilters.domain
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
            this.props.deleteDnsMonitored(this.state.id, this.state.word);
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
                <Modal.Body>Are you sure you want to <b><u>delete</u></b> <b>{this.state.word}</b> domain name, the
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
            const domain_name = this.inputRef.current.value;
            const dns_monitored = { domain_name };
            this.props.patchDnsMonitored(this.state.id, dns_monitored);
            this.setState({
                word: "",
                id: 0
            });
            handleClose();
        };

        return (
            <Modal show={this.state.showEditModal} onHide={handleClose} centered>
                <Modal.Header closeButton>
                    <Modal.Title>Edit Domain Name</Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    <Container>
                        <Row>
                            <Col>
                                <Form onSubmit={onSubmit}>
                                    <Form.Group as={Row} className="mb-3 align-items-center">
                                        <Form.Label column sm={4}>
                                            Domain name
                                        </Form.Label>
                                        <Col sm={8}>
                                            <Form.Control 
                                                required 
                                                ref={this.inputRef}
                                                type="text"
                                                pattern="^[a-zA-Z0-9]+(-[a-zA-Z0-9]+)*\.[a-zA-Z0-9]+(-[a-zA-Z0-9]+)*(?:\.[a-zA-Z]{2,})*$"
                                                placeholder="example.com"
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
            const domain_name = this.inputRef.current.value;
            const dns_monitored = { domain_name };
            this.props.addDnsMonitored(dns_monitored);
            this.setState({
                word: ""
            });
            handleClose();
        };

        return (
            <Modal show={this.state.showAddModal} onHide={handleClose} centered>
                <Modal.Header closeButton>
                    <Modal.Title>Add New Domain Name</Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    <Container>
                        <Row>
                            <Col>
                                <Form onSubmit={onSubmit}>
                                    <Form.Group as={Row} className="mb-3 align-items-center">
                                        <Form.Label column sm={4}>
                                            Domain name
                                        </Form.Label>
                                        <Col sm={8}>
                                            <Form.Control 
                                                required 
                                                ref={this.inputRef} 
                                                type="text"
                                                pattern="^[a-zA-Z0-9]+(-[a-zA-Z0-9]+)*\.[a-zA-Z0-9]+(-[a-zA-Z0-9]+)*(?:\.[a-zA-Z]{2,})*$"
                                                placeholder="example.com"
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
        const { dnsMonitored, auth, globalFilters } = this.props;
        const { isAuthenticated } = auth;

        return (
            <Fragment>
                <div className="row">
                    <div className="col-lg-12">
                        <div className="d-flex justify-content-between align-items-center" style={{marginBottom: 12}}>
                            <div>
                                <h4>Corporate DNS Assets Monitored</h4>
                                <h6 className="text-muted">Dnstwist Algorithm</h6>
                            </div>
                            <div>
                                <button className="btn btn-success" onClick={() => {
                                    this.displayAddModal()
                                }}>
                                    <i className="material-icons me-1 align-middle"
                                       style={{fontSize: 23}}>&#xE147;</i>
                                    <span className="align-middle">Add New DNS</span>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                <TableManager
                    data={dnsMonitored}
                    filterConfig={[]}
                    customFilters={this.customFilters}
                    searchFields={['domain_name']}
                    dateFields={['created_at']}
                    defaultSort="created_at"
                    globalFilters={globalFilters}
                    moduleKey="dnsFinder_domains"
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
                                                    <th style={{ cursor: 'pointer' }} onClick={() => handleSort('domain_name')}>
                                                        Domain Name{renderSortIcons('domain_name')}
                                                    </th>
                                                    <th style={{ cursor: 'pointer' }} onClick={() => handleSort('created_at')}>
                                                        Created At{renderSortIcons('created_at')}
                                                    </th>
                                                    <th />
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {paginatedData.map(domain => (
                                                    <tr key={domain.id}>
                                                        <td><h5>{domain.domain_name}</h5></td>
                                                        <td>{(new Date(domain.created_at)).toDateString()}</td>
                                                        <td className="text-end" style={{ whiteSpace: 'nowrap' }}>
                                                            {isAuthenticated && (
                                                                <>
                                                                    <button
                                                                        className="btn btn-outline-warning btn-sm me-2"
                                                                        data-toggle="tooltip"
                                                                        data-placement="top"
                                                                        title="Edit"
                                                                        onClick={() => this.displayEditModal(domain.id, domain.domain_name)}
                                                                    >
                                                                        <i className="material-icons" style={{ fontSize: 17, lineHeight: 1.8, margin: -2.5 }}>edit</i>
                                                                    </button>
                                                                    <button
                                                                        className="btn btn-outline-danger btn-sm"
                                                                        data-toggle="tooltip"
                                                                        data-placement="top"
                                                                        title="Delete"
                                                                        onClick={() => this.displayDeleteModal(domain.id, domain.domain_name)}
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
                                                            No results found
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
    dnsMonitored: state.DnsFinder.dnsMonitored,
    auth: state.auth
});

export default connect(mapStateToProps, {
    getDnsMonitored,
    deleteDnsMonitored,
    addDnsMonitored,
    patchDnsMonitored
})(DnsMonitored);