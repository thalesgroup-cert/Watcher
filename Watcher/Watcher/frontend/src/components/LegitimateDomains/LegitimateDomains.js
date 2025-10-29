import React, { Component, Fragment, createRef } from 'react';
import { connect } from 'react-redux';
import PropTypes from 'prop-types';
import { Modal, Button, Container, Row, Col, Form } from 'react-bootstrap';
import ExportModal from '../common/ExportModal';
import TableManager from '../common/TableManager';
import DayPickerInput from "react-day-picker/DayPickerInput";
import { formatDate, parseDate } from 'react-day-picker/moment';

import {
    getLegitimateDomains,
    addLegitimateDomain,
    patchLegitimateDomain,
    deleteLegitimateDomain,
    exportToMISP
} from "../../actions/LegitimateDomain";

const INIT_DOMAIN = {
    domain_name: '',
    ticket_id: '',
    contact: '',
    expiry: '',
    repurchased: false,
    comments: ''
};

class LegitimateDomains extends Component {
    constructor(props) {
        super(props);
        this.state = {
            filteredDomains: [],
            showAddModal: false,
            showEditModal: false,
            showDeleteModal: false,
            showExportModal: false,
            editDomain: null,
            deleteDomainId: null,
            deleteDomainName: null,
            newDomain: { ...INIT_DOMAIN },
            exportDomain: null,
            domain_created_at: '',
            expiry: '',
            editCommentsLength: 0,
            addCommentsLength: 0
        };

        this.editRefs = {
            domain_name: createRef(),
            ticket_id: createRef(),
            contact: createRef(),
            domain_created_at: createRef(),
            expiry: createRef(),
            repurchased: createRef(),
            comments: createRef()
        };
        this.addRefs = {
            domain_name: createRef(),
            ticket_id: createRef(),
            contact: createRef(),
            domain_created_at: createRef(),
            expiry: createRef(),
            repurchased: createRef(),
            comments: createRef()
        };
    }

    static propTypes = {
        auth: PropTypes.object.isRequired,
        domains: PropTypes.array.isRequired,
        getLegitimateDomains: PropTypes.func.isRequired,
        addLegitimateDomain: PropTypes.func.isRequired,
        patchLegitimateDomain: PropTypes.func.isRequired,
        deleteLegitimateDomain: PropTypes.func.isRequired,
        onDataFiltered: PropTypes.func
    };

    componentDidMount() {
        this.props.getLegitimateDomains();
    }

    customFilters = (filtered, filters) => {
        const { isAuthenticated } = this.props.auth;
        
        if (filters.search) {
            const searchTerm = filters.search.toLowerCase();
            filtered = filtered.filter(domain => {
                const domainNameMatch = (domain.domain_name || '').toLowerCase().includes(searchTerm);
                
                // Only search in ticket_id and contact
                if (isAuthenticated && domain.ticket_id !== undefined && domain.contact !== undefined) {
                    return domainNameMatch ||
                        (domain.ticket_id || '').toLowerCase().includes(searchTerm) ||
                        (domain.contact || '').toLowerCase().includes(searchTerm);
                }
                
                return domainNameMatch;
            });
        }

        // Only apply repurchased filter
        if (filters.repurchased !== '' && isAuthenticated) {
            const isRep = filters.repurchased === 'true';
            filtered = filtered.filter(d => d.repurchased === isRep);
        }

        if (filters.expiry_status) {
            const now = new Date();
            const soon = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
            filtered = filtered.filter(d => {
                if (!d.expiry) return filters.expiry_status === 'no_date';
                const exp = new Date(d.expiry);
                switch (filters.expiry_status) {
                    case 'expired': return exp < now;
                    case 'expiring_soon': return exp >= now && exp <= soon;
                    case 'valid': return exp > soon;
                    case 'no_date': return false;
                    default: return true;
                }
            });
        }
        return filtered;
    };

    onDataFiltered = (filteredData) => {
        this.setState({ filteredDomains: filteredData });
        if (this.props.onDataFiltered) {
            this.props.onDataFiltered(filteredData);
        }
    };

    displayEditModal = (domain) => {
        this.setState({ 
            showEditModal: true, 
            editDomain: { ...domain }, 
            expiry: domain.expiry || "",
            domain_created_at: domain?.domain_created_at || "",
            editCommentsLength: domain?.comments ? domain.comments.length : 0
        }, () => {
            Object.keys(this.editRefs).forEach(k => {
                if (this.editRefs[k].current) {
                    if (k === 'repurchased')
                        this.editRefs[k].current.checked = !!domain.repurchased;
                    else
                        this.editRefs[k].current.value = domain[k] || '';
                }
            });
        });
    };

    displayDeleteModal = (id, domain_name) => this.setState({ showDeleteModal: true, deleteDomainId: id, deleteDomainName: domain_name });

    displayAddModal = () => {
        this.setState({ showAddModal: true, newDomain: { ...INIT_DOMAIN }, expiry: "", domain_created_at: "", addCommentsLength: 0 }, () => {
            Object.keys(this.addRefs).forEach(k => {
                if (this.addRefs[k].current) {
                    if (k === 'repurchased')
                        this.addRefs[k].current.checked = false;
                    else
                        this.addRefs[k].current.value = "";
                }
            });
        });
    };

    displayExportModal = (domain) => {
        this.setState({ showExportModal: true, exportDomain: domain });
    };

    closeExportModal = () => {
        this.setState({
            showExportModal: false,
            exportDomain: null
        });
        
        this.props.getLegitimateDomains();
    };

    handleMispExport = async ({ id, event_uuid }) => {
        try {
            const payload = {
                id: id,
                event_uuid: event_uuid
            };
            
            await this.props.exportToMISP(payload);
            
            setTimeout(() => {
                this.props.getLegitimateDomains();
                this.closeExportModal();
            }, 1000);
            
            return { success: true };
        } catch (err) {
            console.error('MISP export failed:', err);
            throw err;
        }
    };

    getExpiryBadge = (domain) => {
        if (!domain.expiry) return null;
    
        const now = new Date();
        const expiryDate = new Date(domain.expiry);
        const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    
        let badge = null;
    
        if (expiryDate < now) {
            badge = (
                <span 
                    className="badge bg-sm bg-danger" 
                    style={{ fontSize: '12px' }}
                    title={`Domain expired on ${expiryDate.toDateString()}`}
                >
                    Expired
                </span>
            );
        } else if (expiryDate <= thirtyDaysFromNow) {
            badge = (
                <span 
                    className="badge bg-sm bg-warning" 
                    style={{ fontSize: '12px' }}
                    title={`Domain expires soon (${expiryDate.toDateString()})`}
                >
                    Expiring Soon
                </span>
            );
        } else {
            badge = (
                <span 
                    className="badge bg-sm bg-success" 
                    style={{ fontSize: '12px' }}
                    title={`Domain valid until ${expiryDate.toDateString()}`}
                >
                    Valid
                </span>
            );
        }
    
        return (
            <div style={{ marginTop: '4px' }}>
                {badge}
            </div>
        );
    };

    getFilterConfig = () => {
        const { isAuthenticated } = this.props.auth;
        
        const baseFilters = [
            {
                key: 'search',
                type: 'search',
                label: 'Search',
                placeholder: 'Search by domain name, ticket, contact...',
                width: isAuthenticated ? 3 : 3
            }
        ];
        
        if (isAuthenticated) {
            baseFilters.push({
                key: 'repurchased',
                type: 'select',
                label: 'Repurchased',
                width: 2,
                options: [
                    { value: 'true', label: 'Yes' },
                    { value: 'false', label: 'No' }
                ]
            });
        }
        
        baseFilters.push({
            key: 'expiry_status',
            type: 'select',
            label: 'Expiry Status',
            width: isAuthenticated ? 2 : 4,
            options: [
                { value: 'expired', label: 'Expired' },
                { value: 'expiring_soon', label: 'Expiring Soon' },
                { value: 'valid', label: 'Valid' },
                { value: 'no_date', label: 'No Date' }
            ]
        });
        
        return baseFilters;
    }

    editModal = () => {
        const handleClose = () => this.setState({ showEditModal: false, editDomain: null, domain_created_at: '' });
        const onSubmit = e => {
            e.preventDefault();
            const domain = {
                domain_name: this.editRefs.domain_name.current.value,
                ticket_id: this.editRefs.ticket_id.current.value,
                contact: this.editRefs.contact.current.value,
                domain_created_at: this.state.domain_created_at,
                expiry: this.state.expiry,
                repurchased: this.editRefs.repurchased.current.checked,
                comments: this.editRefs.comments.current.value
            };
            this.props.patchLegitimateDomain(this.state.editDomain.id, domain);
            handleClose();
        };

        const { editDomain } = this.state;
        
        return (
            <Modal show={this.state.showEditModal} onHide={handleClose} centered>
                <Modal.Header closeButton>
                    <Modal.Title>Edit Domain</Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    <Container>
                        <Row>
                            <Col md={12}>
                                <Form onSubmit={onSubmit}>
                                    <Form.Group as={Row} className="mb-3">
                                        <Form.Label column sm="4">Domain Name</Form.Label>
                                        <Col sm="8">
                                            <Form.Control 
                                                required 
                                                ref={this.editRefs.domain_name} 
                                                type="text" 
                                                placeholder="example.com" 
                                                defaultValue={editDomain?.domain_name || ""} 
                                            />
                                        </Col>
                                    </Form.Group>
                                    
                                    <Form.Group as={Row} className="mb-3">
                                        <Form.Label column sm="4">Ticket ID</Form.Label>
                                        <Col sm="8">
                                            <Form.Control 
                                                ref={this.editRefs.ticket_id} 
                                                type="text" 
                                                defaultValue={editDomain?.ticket_id || ""} 
                                                placeholder="240529-2e0a2"
                                            />
                                        </Col>
                                    </Form.Group>
                                    
                                    <Form.Group as={Row} className="mb-3">
                                        <Form.Label column sm="4">Contact</Form.Label>
                                        <Col sm="8">
                                            <Form.Control 
                                                ref={this.editRefs.contact} 
                                                type="text" 
                                                defaultValue={editDomain?.contact || ""} 
                                                placeholder="IT Team, support@example.com"
                                            />
                                        </Col>
                                    </Form.Group>

                                    <Form.Group as={Row} className="mb-3">
                                        <Form.Label column sm="4">Registered At</Form.Label>
                                        <Col sm="8">
                                            <DayPickerInput
                                                style={{ color: "black" }}
                                                formatDate={formatDate}
                                                parseDate={parseDate}
                                                placeholder={editDomain?.domain_created_at ? editDomain.domain_created_at : `${formatDate(new Date())}`}
                                                value={this.state.expdomain_created_atiry}
                                                onDayChange={date => {
                                                    this.setState({ 
                                                        domain_created_at: date ? date.toISOString().split('T')[0] : '' 
                                                    });
                                                }}
                                            />
                                            <Form.Text className="text-muted d-block mt-1">
                                                Will be auto-detected via RDAP/WHOIS
                                            </Form.Text>                                            
                                        </Col>
                                    </Form.Group>

                                    <Form.Group as={Row} className="mb-3">
                                        <Form.Label column sm="4">Expiry Date</Form.Label>
                                        <Col sm="8">
                                            <DayPickerInput
                                                style={{ color: "black" }}
                                                formatDate={formatDate}
                                                parseDate={parseDate}
                                                placeholder={editDomain?.expiry ? editDomain.expiry : `${formatDate(new Date())}`}
                                                value={this.state.expiry}
                                                onDayChange={date => {
                                                    this.setState({ 
                                                        expiry: date ? date.toISOString().split('T')[0] : '' 
                                                    });
                                                }}
                                            />
                                            <Form.Text className="text-muted d-block mt-1">
                                                Will be auto-detected via RDAP/WHOIS
                                            </Form.Text>                                            
                                        </Col>
                                    </Form.Group>
                                    
                                    <Form.Group as={Row} className="mb-3">
                                        <Form.Label column sm="4">Repurchased</Form.Label>
                                        <Col sm="8" className="mt-2">
                                            <Form.Check
                                                type="switch"
                                                id="edit-repurchased-switch"
                                                ref={this.editRefs.repurchased}
                                                defaultChecked={!!editDomain?.repurchased}
                                            />
                                        </Col>
                                    </Form.Group>
                                    
                                    <Form.Group as={Row} className="mb-3">
                                        <Form.Label column sm="4">Comments</Form.Label>
                                        <Col sm="8">
                                            <Form.Control
                                                as="textarea"
                                                ref={this.editRefs.comments}
                                                rows={3}
                                                maxLength={300}
                                                defaultValue={editDomain?.comments || ""}
                                                placeholder="Add notes, context, actions taken, or any relevant information about this domain"
                                                onChange={e => {
                                                    const len = e.target.value.length;
                                                    const remaining = 300 - len;
                                                    e.target.style.borderColor = remaining < 50 ? '#dc3545' : '';
                                                    this.setState({ editCommentsLength: len });
                                                }}
                                            />
                                            <div style={{ fontSize: 12, color: "#888", textAlign: "right" }}>
                                                {this.state.editCommentsLength}/300
                                            </div>
                                        </Col>
                                    </Form.Group>
                                    
                                    <Row>
                                        <Col sm={{ span: 8, offset: 4 }} className="text-end">
                                            <Button variant="secondary" className="me-2" onClick={handleClose}>
                                                Close
                                            </Button>
                                            <Button type="submit" variant="warning">
                                                Update
                                            </Button>
                                        </Col>
                                    </Row>
                                </Form>
                            </Col>
                        </Row>
                    </Container>
                </Modal.Body>
            </Modal>
        );
    };

    addModal = () => {
        const handleClose = () => this.setState({ 
            showAddModal: false, 
            domain_created_at: '', 
            expiry: '' 
        });
        const onSubmit = e => {
            e.preventDefault();
            const domain = {
                domain_name: this.addRefs.domain_name.current.value,
                ticket_id: this.addRefs.ticket_id.current.value,
                contact: this.addRefs.contact.current.value,
                domain_created_at: this.state.domain_created_at,
                expiry: this.state.expiry,
                repurchased: this.addRefs.repurchased.current.checked,
                comments: this.addRefs.comments.current.value
            };
            this.props.addLegitimateDomain(domain);
            handleClose();
        };
        
        return (
            <Modal show={this.state.showAddModal} onHide={handleClose} centered>
                <Modal.Header closeButton>
                    <Modal.Title>Add New Domain</Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    <Container>
                        <Row>
                            <Col md={12}>
                                <Form onSubmit={onSubmit}>
                                    <Form.Group as={Row} className="mb-3">
                                        <Form.Label column sm="4">Domain Name</Form.Label>
                                        <Col sm="8">
                                            <Form.Control 
                                                required 
                                                ref={this.addRefs.domain_name} 
                                                size="md"
                                                type="text"
                                                pattern="^[a-zA-Z0-9]+(-[a-zA-Z0-9]+)*(\.[a-zA-Z0-9]+(-[a-zA-Z0-9]+)*)*$"
                                                placeholder="example.com" 
                                            />
                                        </Col>
                                    </Form.Group>
                                    
                                    <Form.Group as={Row} className="mb-3">
                                        <Form.Label column sm="4">Ticket ID</Form.Label>
                                        <Col sm="8">
                                            <Form.Control 
                                                ref={this.addRefs.ticket_id}
                                                type="text"
                                                pattern="^[a-zA-Z0-9]+(-[a-zA-Z0-9]+)*(\.[a-zA-Z0-9]+(-[a-zA-Z0-9]+)*)*$"
                                                placeholder="240529-2e0a2" 
                                            />
                                        </Col>
                                    </Form.Group>

                                    <Form.Group as={Row} className="mb-3">
                                        <Form.Label column sm="4">Contact</Form.Label>
                                        <Col sm="8">
                                            <Form.Control 
                                                ref={this.addRefs.contact}
                                                type="text"
                                                placeholder="IT Team, support@example.com" 
                                            />
                                        </Col>
                                    </Form.Group>

                                    <Form.Group as={Row} className="mb-3">
                                        <Form.Label column sm="4">Registered At</Form.Label>
                                        <Col sm="8">
                                            <DayPickerInput
                                                style={{ color: "black" }}
                                                formatDate={formatDate}
                                                parseDate={parseDate}
                                                placeholder={`${formatDate(new Date())}`}
                                                value={this.state.domain_created_at}
                                                onDayChange={date => {
                                                    this.setState({ 
                                                        domain_created_at: date ? date.toISOString().split('T')[0] : '' 
                                                    });
                                                }}
                                            />
                                            <Form.Text className="text-muted d-block mt-1">
                                                Will be auto-detected via RDAP/WHOIS
                                            </Form.Text>                                            
                                        </Col>
                                    </Form.Group>
                                    
                                    <Form.Group as={Row} className="mb-3">
                                        <Form.Label column sm="4">Expiry Date</Form.Label>
                                        <Col sm="8">
                                            <DayPickerInput
                                                style={{ color: "black" }}
                                                formatDate={formatDate}
                                                parseDate={parseDate}
                                                placeholder={`${formatDate(new Date())}`}
                                                value={this.state.expiry}
                                                onDayChange={date => {
                                                    this.setState({ 
                                                        expiry: date ? date.toISOString().split('T')[0] : '' 
                                                    });
                                                }}
                                            />
                                            <Form.Text className="text-muted d-block mt-1">
                                                Will be auto-detected via RDAP/WHOIS
                                            </Form.Text>  
                                        </Col>
                                    </Form.Group>
                                    
                                    <Form.Group as={Row} className="mb-3">
                                        <Form.Label column sm="4">Repurchased</Form.Label>
                                        <Col sm="8" className="mt-2">
                                            <Form.Check
                                                type="switch"
                                                id="add-repurchased-switch"
                                                ref={this.addRefs.repurchased}
                                            />
                                        </Col>
                                    </Form.Group>
                                    
                                    <Form.Group as={Row} className="mb-3">
                                        <Form.Label column sm="4">Comments</Form.Label>
                                        <Col sm="8">
                                            <Form.Control
                                                as="textarea"
                                                ref={this.addRefs.comments}
                                                rows={3}
                                                maxLength={300}
                                                placeholder="Add notes, context, actions taken, or any relevant information about this domain"
                                                onChange={e => {
                                                    const len = e.target.value.length;
                                                    const remaining = 300 - len;
                                                    e.target.style.borderColor = remaining < 50 ? '#dc3545' : '';
                                                    this.setState({ addCommentsLength: len });
                                                }}
                                            />
                                            <div style={{ fontSize: 12, color: "#888", textAlign: "right" }}>
                                                {this.state.addCommentsLength}/300
                                            </div>
                                        </Col>
                                    </Form.Group>
                                    
                                    <Row>
                                        <Col sm={{ span: 8, offset: 4 }} className="text-end">
                                            <Button variant="secondary" className="me-2" onClick={handleClose}>
                                                Close
                                            </Button>
                                            <Button type="submit" variant="success">
                                                Add
                                            </Button>
                                        </Col>
                                    </Row>
                                </Form>
                            </Col>
                        </Row>
                    </Container>
                </Modal.Body>
            </Modal>
        );
    };

    deleteModal = () => {
        const handleClose = () => this.setState({ showDeleteModal: false, deleteDomainId: null, deleteDomainName: null });
        const onDelete = () => {
            this.props.deleteLegitimateDomain(this.state.deleteDomainId, this.state.deleteDomainName);
            handleClose();
        };
        
        return (
            <Modal show={this.state.showDeleteModal} onHide={handleClose} centered>
                <Modal.Header closeButton>
                    <Modal.Title>Action Requested</Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    Are you sure you want to <u>delete</u> the domain
                    <b> {this.state.deleteDomainName}</b>?
                </Modal.Body>
                <Modal.Footer>
                    <Button variant="secondary" className="me-2" onClick={handleClose}>
                        Close
                    </Button>
                    <Button variant="danger" onClick={onDelete}>
                        Yes, I'm sure
                    </Button>
                </Modal.Footer>
            </Modal>
        );
    };

    render() {
        const domains = this.props.domains;
        const { isAuthenticated } = this.props.auth;

        return (
            <Fragment>
                <div className="d-flex justify-content-between align-items-center mb-3">
                    <h4>Legitimate Domains</h4>
                    {isAuthenticated && (
                        <button className="btn btn-success" onClick={this.displayAddModal}>
                            <i className="material-icons me-1" style={{ verticalAlign: 'middle', fontSize: '18px' }}>add_circle</i>
                            Add Domain
                        </button>
                    )}
                </div>

                <TableManager
                    data={domains}
                    filterConfig={this.getFilterConfig()}
                    searchFields={['domain_name', 'ticket_id', 'contact']}
                    dateFields={['domain_created_at', 'created_at', 'expiry']}
                    defaultSort="created_at"
                    customFilters={this.customFilters}
                    onDataFiltered={this.onDataFiltered}
                    enableDateFilter={true}
                    dateFilterWidth={3}
                    moduleKey="legitimateDomains_list"
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
                                    <div style={{ ...getTableContainerStyle(),  overflowX: 'auto' }}>
                                        <table className="table table-striped table-hover">
                                            <thead>
                                                <tr>
                                                    <th style={{ cursor: 'pointer' }} onClick={() => handleSort('domain_name')}>
                                                        Domain Name
                                                        {renderSortIcons('domain_name')}
                                                    </th>
                                                    {isAuthenticated && (
                                                        <th style={{ cursor: 'pointer' }} onClick={() => handleSort('ticket_id')}>
                                                            Ticket ID
                                                            {renderSortIcons('ticket_id')}
                                                        </th>
                                                    )}
                                                    {isAuthenticated && (
                                                        <th style={{ cursor: 'pointer' }} onClick={() => handleSort('contact')}>
                                                            Contact
                                                            {renderSortIcons('contact')}
                                                        </th>
                                                    )}
                                                    <th style={{ cursor: 'pointer' }} onClick={() => handleSort('created_at')}>
                                                        Created At
                                                        {renderSortIcons('created_at')}
                                                    </th>
                                                    <th style={{ cursor: 'pointer' }} onClick={() => handleSort('domain_created_at')}>
                                                        Registered At
                                                        {renderSortIcons('domain_created_at')}
                                                    </th>
                                                    <th style={{ cursor: 'pointer' }} onClick={() => handleSort('expiry')}>
                                                        Expiry
                                                        {renderSortIcons('expiry')}
                                                    </th>
                                                    {isAuthenticated && (
                                                        <th style={{ cursor: 'pointer' }} onClick={() => handleSort('repurchased')}>
                                                            Repurchased
                                                            {renderSortIcons('repurchased')}
                                                        </th>
                                                    )}
                                                    {isAuthenticated && (
                                                        <th>
                                                            Comments
                                                        </th>
                                                    )}
                                                    {isAuthenticated && <th />}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {paginatedData.map(domain => (
                                                    <tr key={domain.id}>
                                                        <td>
                                                            <h6 className="mb-0">{domain.domain_name || '-'}</h6>
                                                        </td>
                                                        {isAuthenticated && (
                                                            <td>
                                                                {domain.ticket_id || '-'}
                                                            </td>
                                                        )}
                                                        {isAuthenticated && (
                                                            <td>{domain.contact || '-'}</td>
                                                        )}
                                                        <td>{domain.created_at ? new Date(domain.created_at).toDateString() : '-'}</td>
                                                        <td>
                                                            {domain.domain_created_at
                                                                ? new Date(domain.domain_created_at).toDateString()
                                                                : '-'}
                                                        </td>
                                                        <td>
                                                            {domain.expiry ? new Date(domain.expiry).toDateString() : '-'}
                                                            {isAuthenticated && this.getExpiryBadge(domain)}
                                                        </td>
                                                        {isAuthenticated && (
                                                            <td>
                                                                {domain.repurchased
                                                                    ? <i className="material-icons text-success" style={{ fontSize: 22, verticalAlign: '-5px' }}>check_circle</i>
                                                                    : <i className="material-icons text-danger" style={{ fontSize: 22, verticalAlign: '-5px' }}>cancel</i>
                                                                }
                                                            </td>
                                                        )}
                                                        {isAuthenticated && (
                                                            // <td>{domain.comments || '-'}</td>
                                                            <td>
                                                                <div
                                                                    style={{
                                                                    maxWidth: 200,
                                                                    whiteSpace: 'nowrap',
                                                                    overflow: 'hidden',
                                                                    textOverflow: 'ellipsis'
                                                                    }}
                                                                    title={domain.comments || ''}
                                                                >
                                                                    {domain.comments || '-'}
                                                                </div>
                                                            </td>
                                                        )}
                                                        {isAuthenticated && (
                                                            <td className="text-end" style={{ whiteSpace: 'nowrap' }}>
                                                                <button className="btn btn-outline-warning btn-sm me-2" title="Edit" onClick={() => this.displayEditModal(domain)}>
                                                                    <i className="material-icons" style={{ fontSize: 17 }}>edit</i>
                                                                </button>
                                                                <button className="btn btn-outline-danger btn-sm me-2" title="Delete" onClick={() => this.displayDeleteModal(domain.id, domain.domain_name)}>
                                                                    <i className="material-icons" style={{ fontSize: 17 }}>delete</i>
                                                                </button>
                                                                <button className="btn btn-outline-primary btn-sm" title="Export" onClick={() => this.displayExportModal(domain)}>
                                                                    <i className="material-icons" style={{ fontSize: 17 }}>cloud_upload</i>
                                                                </button>
                                                            </td>
                                                        )}
                                                    </tr>
                                                ))}
                                                {paginatedData.length === 0 && (
                                                    <tr>
                                                        <td colSpan={isAuthenticated ? "9" : "3"} className="text-center text-muted py-4">
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
                            {renderSaveModal()}
                        </Fragment>
                    )}
                </TableManager>

                {this.editModal()}
                {this.addModal()}
                {this.deleteModal()}
                <ExportModal
                    show={this.state.showExportModal}
                    domain={this.state.exportDomain}
                    onClose={this.closeExportModal}
                    onMispExport={this.handleMispExport}
                    mode="legitimate"
                />
            </Fragment>
        );
    }
}

const mapStateToProps = state => ({
    auth: state.auth,
    domains: state.LegitimateDomain ? state.LegitimateDomain.domains || [] : []
});

export default connect(mapStateToProps, {
    getLegitimateDomains,
    addLegitimateDomain,
    patchLegitimateDomain,
    deleteLegitimateDomain,
    exportToMISP
})(LegitimateDomains);