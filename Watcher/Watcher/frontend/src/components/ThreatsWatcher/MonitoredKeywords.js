import React, { Component, Fragment } from 'react';
import { connect } from 'react-redux';
import PropTypes from 'prop-types';
import Button from 'react-bootstrap/Button';
import Modal from 'react-bootstrap/Modal';
import Form from 'react-bootstrap/Form';
import Badge from 'react-bootstrap/Badge';
import Alert from 'react-bootstrap/Alert';
import TableManager from '../common/TableManager';
import {
    getMonitoredKeywords,
    addMonitoredKeyword,
    updateMonitoredKeyword,
    deleteMonitoredKeyword,
    getKeywordArticles
} from '../../actions/leads';

const FILTER_CONFIG = [
    {
        key: 'global',
        type: 'search',
        label: 'Search Keywords',
        placeholder: 'Search by name or description...',
        width: 3
    },
    {
        key: 'temperature',
        type: 'select',
        label: 'Temperature',
        width: 3,
        options: [
            { value: 'WARN', label: '🔥 Warn' },
            { value: 'HOT', label: '🔥🔥 Hot' },
            { value: 'SUPER_HOT', label: '🔥🔥🔥 Super Hot' }
        ]
    }
];

class MonitoredKeywords extends Component {
    constructor(props) {
        super(props);
        this.state = {
            showAddModal: false,
            showArticlesModal: false,
            showEditModal: false,
            showDeleteModal: false,
            deleteKeywordId: null,
            deleteKeywordName: '',
            editingKeyword: null,
            selectedKeyword: null,
            keywordArticles: [],
            loadingArticles: false,
            showHelp: false,
            formData: {
                name: '',
                description: '',
                temperature: 'WARN'
            },
            formErrors: {}
        };
    }
    
    temperatureLevels = [
        { value: 'WARN', label: 'Warn', icon: '🔥', color: '#ffc107' },
        { value: 'HOT', label: 'Hot', icon: '🔥🔥', color: '#fd7e14' },
        { value: 'SUPER_HOT', label: 'Super Hot', icon: '🔥🔥🔥', color: '#dc3545' }
    ];

    static propTypes = {
        show: PropTypes.bool.isRequired,
        handleClose: PropTypes.func.isRequired,
        monitoredKeywords: PropTypes.array.isRequired,
        getMonitoredKeywords: PropTypes.func.isRequired,
        addMonitoredKeyword: PropTypes.func.isRequired,
        updateMonitoredKeyword: PropTypes.func.isRequired,
        deleteMonitoredKeyword: PropTypes.func.isRequired,
        getKeywordArticles: PropTypes.func.isRequired,
        auth: PropTypes.object.isRequired
    };

    componentDidUpdate(prevProps) {
        if (this.props.show && !prevProps.show) {
            this.props.getMonitoredKeywords();
        }
    }

    validateForm = () => {
        const errors = {};
        const { name, temperature } = this.state.formData;

        if (!name.trim()) {
            errors.name = 'Keyword name is required';
        }

        if (!temperature || !['WARN', 'HOT', 'SUPER_HOT'].includes(temperature)) {
            errors.temperature = 'Please select a valid temperature level';
        }

        this.setState({ formErrors: errors });
        return Object.keys(errors).length === 0;
    };

    handleInputChange = (e) => {
        this.setState({
            formData: {
                ...this.state.formData,
                [e.target.name]: e.target.value
            },
            formErrors: {}
        });
    };

    handleAddKeyword = (e) => {
        e.preventDefault();

        if (!this.validateForm()) {
            return;
        }

        this.props.addMonitoredKeyword(this.state.formData);
        this.setState({
            showAddModal: false,
            formData: { name: '', description: '', temperature: 'WARN' },
            formErrors: {}
        });
    };

    handleViewArticles = async (keyword) => {
        this.setState({ 
            loadingArticles: true,
            showArticlesModal: true,
            selectedKeyword: keyword,
            keywordArticles: []
        });

        try {
            const articles = await this.props.getKeywordArticles(keyword.id);
            
            this.setState({
                keywordArticles: articles || [],
                loadingArticles: false
            });
        } catch (error) {
            console.error('Failed to load articles:', error);
            this.setState({ 
                loadingArticles: false,
                keywordArticles: []
            });
        }
    };

    handleDeleteKeyword = (id, name) => {
        this.setState({
            showDeleteModal: true,
            deleteKeywordId: id,
            deleteKeywordName: name
        });
    };

    confirmDeleteKeyword = () => {
        this.props.deleteMonitoredKeyword(this.state.deleteKeywordId);
        this.setState({
            showDeleteModal: false,
            deleteKeywordId: null,
            deleteKeywordName: ''
        });
    };

    customFilters = (filtered, filters) => {
        // Temperature filter
        if (filters.temperature) {
            filtered = filtered.filter(item => item.temperature === filters.temperature);
        }

        return filtered;
    };

    handleEditKeyword = (keyword) => {
        this.setState({
            showEditModal: true,
            editingKeyword: keyword,
            formData: {
                name: keyword.name,
                description: keyword.description || '',
                temperature: keyword.temperature
            }
        });
    };

    handleUpdateKeyword = (e) => {
        e.preventDefault();

        if (!this.validateForm()) {
            return;
        }

        this.props.updateMonitoredKeyword(this.state.editingKeyword.id, this.state.formData);
        this.setState({
            showEditModal: false,
            editingKeyword: null,
            formData: { name: '', description: '', temperature: 'WARN' },
            formErrors: {}
        });
    };

    renderAddKeywordModal = () => {
        const { formData, formErrors } = this.state;

        return (
            <Modal
                show={this.state.showAddModal}
                onHide={() => this.setState({ showAddModal: false, formErrors: {} })}
                centered
                style={{ zIndex: 1060 }}
            >
                <Modal.Header closeButton>
                    <Modal.Title>
                        Add Monitored Keyword
                    </Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    <Form onSubmit={this.handleAddKeyword}>
                        <Form.Group className="mb-3">
                            <Form.Label>Keyword Name *</Form.Label>
                            <Form.Control
                                type="text"
                                name="name"
                                value={formData.name}
                                onChange={this.handleInputChange}
                                placeholder="e.g., Apache Log4j, Thales, CVE-2024-1234"
                                isInvalid={!!formErrors.name}
                                required
                            />
                            <Form.Control.Feedback type="invalid">
                                {formErrors.name}
                            </Form.Control.Feedback>
                            <Form.Text className="text-muted">
                                Case-insensitive. Will match partial words in articles.
                            </Form.Text>
                        </Form.Group>

                        <Form.Group className="mb-3">
                            <Form.Label>Description (Optional)</Form.Label>
                            <Form.Control
                                as="textarea"
                                name="description"
                                value={formData.description}
                                onChange={this.handleInputChange}
                                placeholder="Why are you monitoring this keyword?"
                                rows={2}
                            />
                        </Form.Group>

                        <Form.Group className="mb-4">
                            <Form.Label>Temperature Level</Form.Label>
                            <div className="mb-3">
                                <input
                                    type="range"
                                    className="form-range"
                                    min="0"
                                    max="2"
                                    step="1"
                                    value={['WARN', 'HOT', 'SUPER_HOT'].indexOf(formData.temperature)}
                                    onChange={(e) => {
                                        const temps = ['WARN', 'HOT', 'SUPER_HOT'];
                                        this.setState({
                                            formData: {
                                                ...this.state.formData,
                                                temperature: temps[parseInt(e.target.value)]
                                            }
                                        });
                                    }}
                                />
                            </div>
                            <div className="d-flex justify-content-between align-items-center px-2">
                                {this.temperatureLevels.map(level => (
                                    <div
                                        key={level.value}
                                        className="text-center"
                                        style={{
                                            opacity: formData.temperature === level.value ? 1 : 0.4,
                                            transform: formData.temperature === level.value ? 'scale(1.2)' : 'scale(1)',
                                            transition: 'all 0.2s ease'
                                        }}
                                    >
                                        <div style={{ fontSize: '1.5rem' }}>{level.icon}</div>
                                        <div style={{ fontSize: '0.75rem', fontWeight: 'bold', color: level.color }}>
                                            {level.label}
                                        </div>
                                    </div>
                                ))}
                            </div>
                            {formErrors.temperature && (
                                <div className="text-danger small mt-2">{formErrors.temperature}</div>
                            )}
                        </Form.Group>

                        <div className="d-flex justify-content-end gap-2 mt-3">
                            <Button
                                variant="outline-secondary"
                                onClick={() => this.setState({ showAddModal: false, formErrors: {} })}
                            >
                                Cancel
                            </Button>
                            <Button variant="primary" type="submit">
                                Add Keyword
                            </Button>
                        </div>
                    </Form>
                </Modal.Body>
            </Modal>
        );
    };

    renderEditModal = () => {
        const { formData, formErrors, editingKeyword } = this.state;

        if (!editingKeyword) return null;

        return (
            <Modal
                show={this.state.showEditModal}
                onHide={() => this.setState({ showEditModal: false, editingKeyword: null, formErrors: {} })}
                centered
                style={{ zIndex: 1060 }}
            >
                <Modal.Header closeButton>
                    <Modal.Title>Edit Monitored Keyword</Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    <Form onSubmit={this.handleUpdateKeyword}>
                        <Form.Group className="mb-3">
                            <Form.Label>Keyword Name</Form.Label>
                            <Form.Control
                                type="text"
                                value={formData.name}
                                disabled
                                className="bg-light"
                            />
                            <Form.Text className="text-muted">
                                Keyword name cannot be changed after creation.
                            </Form.Text>
                        </Form.Group>

                        <Form.Group className="mb-3">
                            <Form.Label>Description (optional)</Form.Label>
                            <Form.Control
                                as="textarea"
                                rows={2}
                                placeholder="Why are you monitoring this keyword?"
                                value={formData.description}
                                onChange={(e) => this.setState({
                                    formData: { ...this.state.formData, description: e.target.value }
                                })}
                            />
                        </Form.Group>

                        <Form.Group className="mb-4">
                            <Form.Label>Temperature Level</Form.Label>
                            <div className="mb-3">
                                <input
                                    type="range"
                                    className="form-range"
                                    min="0"
                                    max="2"
                                    step="1"
                                    value={['WARN', 'HOT', 'SUPER_HOT'].indexOf(formData.temperature)}
                                    onChange={(e) => {
                                        const temps = ['WARN', 'HOT', 'SUPER_HOT'];
                                        this.setState({
                                            formData: {
                                                ...this.state.formData,
                                                temperature: temps[parseInt(e.target.value)]
                                            }
                                        });
                                    }}
                                />
                            </div>
                            <div className="d-flex justify-content-between align-items-center px-2">
                                {this.temperatureLevels.map(level => (
                                    <div
                                        key={level.value}
                                        className="text-center"
                                        style={{
                                            opacity: formData.temperature === level.value ? 1 : 0.4,
                                            transform: formData.temperature === level.value ? 'scale(1.2)' : 'scale(1)',
                                            transition: 'all 0.2s ease'
                                        }}
                                    >
                                        <div style={{ fontSize: '1.5rem' }}>{level.icon}</div>
                                        <div style={{ fontSize: '0.75rem', fontWeight: 'bold', color: level.color }}>
                                            {level.label}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </Form.Group>

                        <div className="d-flex justify-content-end gap-2 mt-3">
                            <Button
                                variant="outline-secondary"
                                onClick={() => this.setState({ showEditModal: false, editingKeyword: null, formErrors: {} })}
                            >
                                Cancel
                            </Button>
                            <Button variant="primary" type="submit">
                                Update Keyword
                            </Button>
                        </div>
                    </Form>
                </Modal.Body>
            </Modal>
        );
    };

    renderArticlesModal = () => {
        const getTitleAtUrl = (url) => {
            let lastChar = url.substr(url.length - 1);
            let domainName = url.split('//', 2)[1]?.split('/', 20)[0];
            if (lastChar === '/') {
                let urlTab = url.split('/', 20);
                return urlTab[urlTab.length - 2];
            } else {
                if (domainName === "twitter.com") {
                    return '@' + url.split('/', 6)[3];
                }
                return url.split('/', 20).pop();
            }
        };

        const parseArticles = () => {
            return this.state.keywordArticles.map((article, index) => {
                const urlParts = article.url.split('//', 2);
                const domainName = urlParts[1] ? urlParts[1].split('/', 20)[0] : '';
                
                return {
                    id: index,
                    url: article.url,
                    domainName: domainName,
                    title: getTitleAtUrl(article.url),
                    created_at: article.created_at
                };
            });
        };

        const parsedArticles = parseArticles();

        return (
            <Modal
                show={this.state.showArticlesModal}
                onHide={() => this.setState({ showArticlesModal: false, keywordArticles: [] })}
                size="xl"
                centered
                style={{ zIndex: 1060 }}
            >
                <Modal.Header closeButton>
                    <Modal.Title>
                        Articles for <strong>{this.state.selectedKeyword?.name}</strong>
                    </Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    {this.state.loadingArticles ? (
                        <div className="text-center py-5">
                            <div className="spinner-border text-primary" role="status">
                                <span className="visually-hidden">Loading...</span>
                            </div>
                            <p className="text-muted mt-3">Loading articles...</p>
                        </div>
                    ) : parsedArticles.length === 0 ? (
                        <div className="text-center py-5">
                            <p className="text-muted mb-0">No articles found mentioning this keyword yet.</p>
                        </div>
                    ) : (
                        <div className="table-responsive">
                            <table className="table table-striped table-hover mb-0">
                                <thead>
                                    <tr>
                                        <th>Domain Name</th>
                                        <th>Data</th>
                                        <th className="text-end">Found</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {parsedArticles.map((article) => (
                                        <tr key={article.id}>
                                            <td className="align-middle">
                                                <strong>{article.domainName}</strong>
                                            </td>
                                            <td className="align-middle">
                                                <a 
                                                    href={article.url} 
                                                    target="_blank" 
                                                    rel="noopener noreferrer"
                                                    className="text-decoration-none"
                                                >
                                                    {article.title}
                                                </a>
                                            </td>
                                            <td className="text-end align-middle text-nowrap">
                                                <small>{new Date(article.created_at).toLocaleString()}</small>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </Modal.Body>
                <Modal.Footer>
                    <Button variant="secondary" onClick={() => this.setState({ showArticlesModal: false, keywordArticles: [] })}>
                        Close
                    </Button>
                </Modal.Footer>
            </Modal>
        );
    };

    renderDeleteModal = () => {
        const handleClose = () => this.setState({ showDeleteModal: false, deleteKeywordId: null, deleteKeywordName: '' });

        const onSubmit = e => {
            e.preventDefault();
            this.confirmDeleteKeyword();
        };

        return (
            <Modal show={this.state.showDeleteModal} onHide={handleClose} centered style={{ zIndex: 1060 }}>
                <Modal.Header closeButton>
                    <Modal.Title>Confirm Deletion</Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    Are you sure you want to <b><u>stop monitoring</u></b> <b>{this.state.deleteKeywordName}</b>?
                </Modal.Body>
                <Modal.Footer>
                    <form onSubmit={onSubmit} className="d-flex gap-2">
                        <Button variant="secondary" onClick={handleClose}>
                            Cancel
                        </Button>
                        <Button type="submit" variant="danger">
                            Yes, Delete
                        </Button>
                    </form>
                </Modal.Footer>
            </Modal>
        );
    };

    render() {
        const { show, handleClose, monitoredKeywords, auth } = this.props;
        const { isAuthenticated } = auth;

        return (
            <Fragment>
                <Modal
                    show={show}
                    onHide={handleClose}
                    size="xl"
                    centered
                    backdrop={this.state.showAddModal || this.state.showArticlesModal || this.state.showEditModal || this.state.showDeleteModal ? false : true}
                    style={{ 
                        filter: this.state.showAddModal || this.state.showArticlesModal || this.state.showEditModal || this.state.showDeleteModal ? 'brightness(0.7)' : 'none',
                        zIndex: 1050
                    }}
                >
                    <Modal.Header closeButton>
                        <Modal.Title>
                            Monitored Keywords
                        </Modal.Title>
                    </Modal.Header>
                    <Modal.Body>
                        {!isAuthenticated ? (
                            <Alert variant="warning">
                                You must be authenticated to manage monitored keywords.
                            </Alert>
                        ) : (
                            <Fragment>
                                <div className="d-flex justify-content-between align-items-center mb-3">
                                    <div
                                        className="d-flex align-items-center"
                                        onClick={() => this.setState(prev => ({ showHelp: !prev.showHelp }))}
                                        style={{ cursor: 'pointer' }}
                                    >
                                        <i className="material-icons text-primary me-2">
                                            {this.state.showHelp ? 'expand_less' : 'expand_more'}
                                        </i>
                                        <span className="text-muted">Need help with Monitored Keywords?</span>
                                    </div>
                                    <Button
                                        variant="primary"
                                        onClick={() => this.setState({ showAddModal: true })}
                                    >
                                        <i className="material-icons me-1 align-middle" style={{ fontSize: 20 }}>
                                            add_circle
                                        </i>
                                        Add Keyword
                                    </Button>
                                </div>
                                {this.state.showHelp && (
                                    <div className="mb-3 ps-4 border-start border-primary">
                                        <ul className="mb-0 ps-3 text-muted small">
                                            <li>Monitor specific keywords/technologies of interest (e.g., "Log4j", "Apache", "Ransomware")</li>
                                            <li>Monitored keywords are highlighted with colored flames in the word cloud based on temperature level</li>
                                            <li>Track all articles mentioning your monitored keywords in real-time</li>
                                            <li>Temperature levels: 🆕 New, 🔥 Warn, 🔥🔥 Hot, 🔥🔥🔥 Super Hot</li>
                                        </ul>
                                    </div>
                                )}

                                <TableManager
                                    data={monitoredKeywords}
                                    filterConfig={FILTER_CONFIG}
                                    searchFields={['name', 'description']}
                                    dateFields={['created_at', 'last_detected_at']}
                                    defaultSort="created_at"
                                    customFilters={this.customFilters}
                                    enableDateFilter={true}
                                    dateFilterWidth={4}
                                    moduleKey="threatsWatcher_monitoredKeywords"
                                    itemsPerPage={10}
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
                                                        <table className="table table-striped table-hover mb-0" style={{ fontSize: '0.95rem' }}>
                                                    <thead>
                                                        <tr>
                                                            <th
                                                                className="user-select-none"
                                                                role="button"
                                                                onClick={() => handleSort('name')}
                                                            >
                                                                Keyword
                                                                {renderSortIcons('name')}
                                                            </th>
                                                            <th className="text-center">Temperature</th>
                                                            <th
                                                                className="text-center user-select-none"
                                                                role="button"
                                                                onClick={() => handleSort('last_detected_at')}
                                                            >
                                                                Last Detected
                                                                {renderSortIcons('last_detected_at')}
                                                            </th>
                                                            <th className="text-center">Actions</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {paginatedData.length === 0 ? (
                                                            <tr>
                                                                <td colSpan="4" className="text-center text-muted py-4">
                                                                    No monitored keywords yet. Click "Add Keyword" to start monitoring!
                                                                </td>
                                                            </tr>
                                                        ) : (
                                                            paginatedData.map((keyword) => (
                                                                <tr key={keyword.id}>
                                                                    <td>
                                                                        <strong>{keyword.name}</strong>
                                                                        {keyword.description && (
                                                                            <div className="text-muted small mt-1">
                                                                                {keyword.description}
                                                                            </div>
                                                                        )}
                                                                    </td>
                                                                    <td className="text-center align-middle">
                                                                        <div className="d-flex align-items-center justify-content-center gap-1">
                                                                            <span style={{ fontSize: '1.3rem' }}>
                                                                                {this.temperatureLevels.find(l => l.value === keyword.temperature)?.icon || '🆕'}
                                                                            </span>
                                                                            <span style={{ 
                                                                                fontSize: '0.85rem', 
                                                                                fontWeight: 'bold',
                                                                                color: this.temperatureLevels.find(l => l.value === keyword.temperature)?.color || '#6c757d'
                                                                            }}>
                                                                                {keyword.temperature_display || 'N/A'}
                                                                            </span>
                                                                        </div>
                                                                    </td>
                                                                    <td className="text-center align-middle">
                                                                        {keyword.last_detected_at ? (
                                                                            <span style={{ fontSize: '0.9rem' }}>
                                                                                {new Date(keyword.last_detected_at).toLocaleString()}
                                                                            </span>
                                                                        ) : (
                                                                            <span className="text-muted">Never</span>
                                                                        )}
                                                                    </td>
                                                                    <td className="text-center align-middle">
                                                                        <div className="d-flex justify-content-center gap-1">
                                                                            <button
                                                                                onClick={() => this.handleViewArticles(keyword)}
                                                                                className="btn btn-outline-info btn-sm me-2"
                                                                                title="View Articles"
                                                                            >
                                                                                <i className="material-icons" style={{fontSize: 17, lineHeight: 1.8, margin: -2.5}}>info</i>
                                                                            </button>
                                                                            <button
                                                                                onClick={() => this.handleEditKeyword(keyword)}
                                                                                className="btn btn-outline-warning btn-sm me-2"
                                                                                title="Edit Keyword"
                                                                            >
                                                                                <i className="material-icons" style={{fontSize: 17, lineHeight: 1.8, margin: -2.5}}>edit</i>
                                                                            </button>
                                                                            <button
                                                                                onClick={() => this.handleDeleteKeyword(keyword.id, keyword.name)}
                                                                                className="btn btn-outline-danger btn-sm me-2"
                                                                                title="Delete Keyword"
                                                                            >
                                                                                <i className="material-icons" style={{fontSize: 17, lineHeight: 1.8, margin: -2.5}}>delete</i>
                                                                            </button>
                                                                        </div>
                                                                    </td>
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
                            </Fragment>
                        )}
                    </Modal.Body>
                    <Modal.Footer>
                        <Button variant="secondary" onClick={handleClose}>
                            Close
                        </Button>
                    </Modal.Footer>
                </Modal>

                {this.renderAddKeywordModal()}
                {this.renderEditModal()}
                {this.renderArticlesModal()}
                {this.renderDeleteModal()}
            </Fragment>
        );
    }
}

const mapStateToProps = state => ({
    monitoredKeywords: state.leads.monitoredKeywords || [],
    auth: state.auth
});

export default connect(mapStateToProps, {
    getMonitoredKeywords,
    addMonitoredKeyword,
    updateMonitoredKeyword,
    deleteMonitoredKeyword,
    getKeywordArticles
})(MonitoredKeywords);
