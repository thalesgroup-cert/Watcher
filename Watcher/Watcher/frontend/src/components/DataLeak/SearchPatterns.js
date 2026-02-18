import React, {Component, Fragment} from 'react';
import {connect} from 'react-redux';
import PropTypes from 'prop-types';
import {getKeyWords, deleteKeyWord, addKeyWord, patchKeyWord} from "../../actions/DataLeak";
import {Button, Modal, Container, Row, Col, Form, Badge, Alert, Accordion, Card} from 'react-bootstrap';
import TableManager from '../common/TableManager';
import DateWithTooltip from '../common/DateWithTooltip';

// Regex patterns organized by theme (inspired by AIL)
const REGEX_PATTERNS = {
    'Data Leaks & Breaches': [
        { name: 'Leak Keywords', pattern: '(leak|breach|dump|database)', description: 'Common leak-related terms' },
        { name: 'Data Dump', pattern: 'data[_-]?(dump|leak|breach)', description: 'Data dump variations' },
        { name: 'Password Files', pattern: '(password|passwd|credentials)\\.(txt|csv|sql)', description: 'Password file patterns' },
        { name: 'Company Leak', pattern: 'company[_-]?(leak|dump|data)', description: 'Company-specific leaks' },
    ],
    'Credentials & Auth': [
        { name: 'Email Pattern', pattern: '[a-zA-Z0-9._%+-]+@company\\.com', description: 'Company email addresses' },
        { name: 'Email with Password', pattern: '[^\\s]+@[^\\s]+:[^\\s]+', description: 'Email:password format' },
        { name: 'Username:Password', pattern: '[a-zA-Z0-9_]+:[^\\s]+', description: 'Credential pairs' },
        { name: 'API Keys', pattern: 'api[_-]?key|apikey|api[_-]?secret', description: 'API key patterns' },
        { name: 'Bearer Tokens', pattern: 'Bearer [A-Za-z0-9\\-._~+/]+', description: 'JWT Bearer tokens' },
    ],
    'Sensitive Data': [
        { name: 'Credit Card', pattern: '\\b[0-9]{4}[- ]?[0-9]{4}[- ]?[0-9]{4}[- ]?[0-9]{4}\\b', description: 'Card number format' },
        { name: 'SSN Pattern', pattern: '\\b[0-9]{3}-[0-9]{2}-[0-9]{4}\\b', description: 'Social Security Number' },
        { name: 'Phone Numbers', pattern: '\\+?[0-9]{1,3}[-\\.\\s]?\\(?[0-9]{1,4}\\)?[-\\.\\s]?[0-9]{1,4}[-\\.\\s]?[0-9]{1,9}', description: 'International phone' },
        { name: 'Secret/Confidential', pattern: '(secret|confidential|private|internal)', description: 'Sensitive labels' },
        { name: 'Private Key Headers', pattern: '-----BEGIN (RSA|EC|DSA|OPENSSH) PRIVATE KEY-----', description: 'Private key detection' },
    ],
    'Database & Infrastructure': [
        { name: 'Database URI', pattern: '(mongodb|mysql|postgres|redis)://[^\\s]+', description: 'Database connection strings' },
        { name: 'Connection String', pattern: 'Server=[^;]+;Database=[^;]+;', description: 'SQL Server connections' },
        { name: 'AWS Keys', pattern: 'AKIA[0-9A-Z]{16}', description: 'AWS Access Key ID' },
        { name: 'AWS Secret', pattern: '[A-Za-z0-9/+=]{40}', description: 'AWS Secret Access Key' },
        { name: 'IPv4 Address', pattern: '\\b(?:[0-9]{1,3}\\.){3}[0-9]{1,3}\\b', description: 'IP address pattern' },
    ],
    'File Patterns': [
        { name: 'Archive Files', pattern: '\\.(zip|rar|7z|tar\\.gz|tgz)$', description: 'Compressed archives' },
        { name: 'Database Files', pattern: '\\.(sql|db|sqlite|mdb)$', description: 'Database file extensions' },
        { name: 'Backup Files', pattern: '\\.(bak|backup|old|~)$', description: 'Backup file patterns' },
        { name: 'Config Files', pattern: '\\.(conf|config|ini|env)$', description: 'Configuration files' },
        { name: 'Log Files', pattern: '\\.(log|logs)$', description: 'Log file extensions' },
    ],
    'Code & Secrets': [
        { name: 'GitHub Token', pattern: 'ghp_[A-Za-z0-9]{36}', description: 'GitHub personal access token' },
        { name: 'Slack Token', pattern: 'xox[baprs]-[0-9]{10,12}-[0-9]{10,12}-[a-zA-Z0-9]{24}', description: 'Slack API tokens' },
        { name: 'Generic Secret', pattern: '(secret|password|passwd|pwd)\\s*[:=]\\s*["\']?[^\\s"\';]+', description: 'Secret assignments' },
        { name: 'Private Repo', pattern: 'github\\.com/[^/]+/[^/]+', description: 'GitHub repository URLs' },
        { name: 'SSH Keys', pattern: 'ssh-(rsa|dss|ed25519) [A-Za-z0-9+/=]+', description: 'SSH public keys' },
    ]
};

export class KeyWords extends Component {

    constructor(props) {
        super(props);
        this.state = {
            showDeleteModal: false,
            showEditModal: false,
            showAddModal: false,
            id: 0,
            word: "",
            is_regex: false,
            isLoading: true,
            regexValid: null,
            regexError: "",
            testString: "",
            testMatches: [],
            showExamples: false,
        };
        this.inputRef = React.createRef();
        this.isRegexRef = React.createRef();
    }

    static propTypes = {
        keywords: PropTypes.array.isRequired,
        getKeyWords: PropTypes.func.isRequired,
        deleteKeyWord: PropTypes.func.isRequired,
        addKeyWord: PropTypes.func.isRequired,
        patchKeyWord: PropTypes.func.isRequired,
        auth: PropTypes.object.isRequired,
        globalFilters: PropTypes.object
    };

    componentDidMount() {
        this.props.getKeyWords();
    }

    componentDidUpdate(prevProps) {
        if (this.props.keywords !== prevProps.keywords && this.state.isLoading) {
            this.setState({ isLoading: false });
        }
    }

    validateRegex = (pattern, isRegexEnabled) => {
        if (!pattern || pattern.trim() === '' || !isRegexEnabled) {
            this.setState({ 
                regexValid: null, 
                regexError: "",
                testMatches: [] 
            });
            return true;
        }

        try {
            new RegExp(pattern);
            this.setState({ 
                regexValid: true, 
                regexError: "",
            });
            this.testRegexPattern(pattern);
            return true;
        } catch (e) {
            this.setState({ 
                regexValid: false, 
                regexError: e.message,
                testMatches: []
            });
            return false;
        }
    };

    testRegexPattern = (pattern) => {
        const { testString } = this.state;
        if (!testString || !pattern) {
            this.setState({ testMatches: [] });
            return;
        }

        try {
            const regex = new RegExp(pattern, 'g');
            const matches = [...testString.matchAll(regex)];
            this.setState({ testMatches: matches.map(m => m[0]) });
        } catch (e) {
            this.setState({ testMatches: [] });
        }
    };

    handlePatternChange = (e) => {
        const pattern = e.target.value;
        this.setState({ word: pattern });
        const isRegexEnabled = this.isRegexRef.current?.checked || false;
        this.validateRegex(pattern, isRegexEnabled);
    };

    handleRegexToggle = (e) => {
        const isRegexEnabled = e.target.checked;
        this.setState({ is_regex: isRegexEnabled });
        const pattern = this.inputRef.current?.value || "";
        this.validateRegex(pattern, isRegexEnabled);
    };

    handleTestStringChange = (e) => {
        const testString = e.target.value;
        this.setState({ testString }, () => {
            if (this.state.word && this.state.is_regex) {
                this.testRegexPattern(this.state.word);
            }
        });
    };

    usePattern = (pattern) => {
        if (this.inputRef.current) {
            this.inputRef.current.value = pattern;
            this.setState({ word: pattern, is_regex: true });
            if (this.isRegexRef.current) {
                this.isRegexRef.current.checked = true;
            }
            this.validateRegex(pattern, true);
        }
    };

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
        this.setState({ showDeleteModal: true, id, word });
    };

    displayEditModal = (id, word, is_regex) => {
        this.setState({
            showEditModal: true,
            id,
            word,
            is_regex,
            regexValid: null,
            regexError: "",
            testString: "",
            testMatches: [],
            showExamples: false,
        }, () => {
            if (is_regex) {
                this.validateRegex(word, is_regex);
            }
        });
    };

    displayAddModal = () => {
        this.setState({
            showAddModal: true,
            word: "",
            is_regex: false,
            regexValid: null,
            regexError: "",
            testString: "",
            testMatches: [],
            showExamples: false,
        });
    };

    deleteModal = () => {
        const handleClose = () => this.setState({ showDeleteModal: false });

        const onSubmit = e => {
            e.preventDefault();
            this.props.deleteKeyWord(this.state.id, this.state.word);
            this.setState({ word: "", id: 0 });
            handleClose();
        };

        return (
            <Modal show={this.state.showDeleteModal} onHide={handleClose} centered>
                <Modal.Header closeButton>
                    <Modal.Title>Action Requested</Modal.Title>
                </Modal.Header>
                <Modal.Body>Are you sure you want to <b><u>delete</u></b> <b>{this.state.word}</b> pattern and the <b>associated
                    alerts</b>?</Modal.Body>
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

    editModal = () => {
        const handleClose = () => this.setState({
            showEditModal: false,
            regexValid: null,
            regexError: "",
            testString: "",
            testMatches: [],
            showExamples: false,
        });

        const onSubmit = e => {
            e.preventDefault();
            const name = this.inputRef.current.value;
            const is_regex = this.isRegexRef.current.checked;
            
            if (is_regex && !this.validateRegex(name, is_regex)) {
                return;
            }
            
            const keyword = { name, is_regex };
            this.props.patchKeyWord(this.state.id, keyword);
            this.setState({ word: "", id: 0, is_regex: false });
            handleClose();
        };

        const { regexValid, regexError, testString, testMatches, showExamples, is_regex } = this.state;

        return (
            <Modal show={this.state.showEditModal} onHide={handleClose} centered size="lg">
                <Modal.Header closeButton>
                    <Modal.Title>
                        Edit Search Pattern
                    </Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    <Container>
                        <Form onSubmit={onSubmit}>
                            {/* Main Input */}
                            <Form.Group className="mb-3">
                                <Form.Label>
                                    <strong>Pattern</strong>
                                    {is_regex && <Badge bg="info" className="ms-2">Regex Enabled</Badge>}
                                </Form.Label>
                                <Form.Control
                                    required
                                    ref={this.inputRef}
                                    type="text"
                                    placeholder="leak, data leak, .*@company\.com"
                                    defaultValue={this.state.word}
                                    onChange={this.handlePatternChange}
                                    isValid={is_regex && regexValid === true}
                                    isInvalid={is_regex && regexValid === false}
                                    style={{ fontFamily: 'monospace' }}
                                />
                                {is_regex && (
                                    <>
                                        <Form.Control.Feedback type="invalid">
                                            Invalid regex: {regexError}
                                        </Form.Control.Feedback>
                                        <Form.Control.Feedback type="valid">
                                            ✓ Valid regex pattern
                                        </Form.Control.Feedback>
                                    </>
                                )}
                                <Form.Text className="text-muted">
                                    Enter a simple keyword or enable regex below for pattern matching
                                </Form.Text>
                            </Form.Group>

                            {/* Regex Toggle */}
                            <Form.Group className="mb-3">
                                <Form.Check
                                    ref={this.isRegexRef}
                                    type="switch"
                                    id="edit-regex-switch"
                                    defaultChecked={this.state.is_regex}
                                    onChange={this.handleRegexToggle}
                                    label={
                                        <span>
                                            <strong>Use RegEx Pattern</strong>
                                            <Form.Text className="d-block text-muted" style={{marginTop: '4px'}}>
                                                When enabled, the keyword will be treated as a regular expression pattern
                                            </Form.Text>
                                        </span>
                                    }
                                />
                            </Form.Group>

                            {/* Examples Section - Only show when regex is enabled */}
                            {is_regex && (
                                <>
                                    <div className="mb-3">
                                        <Button
                                            variant="outline-primary"
                                            size="sm"
                                            onClick={() => this.setState({ showExamples: !showExamples })}
                                            className="w-100"
                                        >
                                            <i className="material-icons align-middle me-1" style={{fontSize: 18}}>
                                                {showExamples ? 'expand_less' : 'expand_more'}
                                            </i>
                                            {showExamples ? 'Hide' : 'Show'} Pattern Examples & Templates
                                        </Button>
                                    </div>

                                    {showExamples && (
                                        <div className="mb-3" style={{ maxHeight: '400px', overflowY: 'auto', border: '1px solid #dee2e6', borderRadius: '4px', padding: '10px' }}>
                                            {Object.entries(REGEX_PATTERNS).map(([category, patterns], catIdx) => (
                                                <div key={catIdx} className="mb-3">
                                                    <h6 className="mb-2">
                                                        <strong>{category}</strong>
                                                        <Badge bg="secondary" className="ms-2">{patterns.length}</Badge>
                                                    </h6>
                                                    {patterns.map((item, idx) => (
                                                        <Card key={idx} className="mb-2" style={{ fontSize: '0.9em' }}>
                                                            <Card.Body className="p-2">
                                                                <div className="d-flex justify-content-between align-items-start">
                                                                    <div style={{ flex: 1 }}>
                                                                        <div><strong>{item.name}</strong></div>
                                                                        <code style={{ 
                                                                            backgroundColor: '#f8f9fa', 
                                                                            padding: '2px 6px', 
                                                                            borderRadius: '3px',
                                                                            fontSize: '0.9em',
                                                                            display: 'inline-block',
                                                                            marginTop: '4px'
                                                                        }}>
                                                                            {item.pattern}
                                                                        </code>
                                                                        <div className="text-muted" style={{ fontSize: '0.85em', marginTop: '4px' }}>
                                                                            {item.description}
                                                                        </div>
                                                                    </div>
                                                                    <Button
                                                                        variant="outline-success"
                                                                        size="sm"
                                                                        onClick={() => this.usePattern(item.pattern)}
                                                                        style={{ whiteSpace: 'nowrap' }}
                                                                    >
                                                                        Use
                                                                    </Button>
                                                                </div>
                                                            </Card.Body>
                                                        </Card>
                                                    ))}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </>
                            )}

                            <div className="d-flex justify-content-end gap-2 modal-buttons-group">
                                <Button variant="secondary" onClick={handleClose}>
                                    Close
                                </Button>
                                <Button type="submit" variant="warning" disabled={is_regex && regexValid === false}>
                                    Update
                                </Button>
                            </div>
                        </Form>
                    </Container>
                </Modal.Body>
            </Modal>
        );
    };

    addModal = () => {
        const handleClose = () => this.setState({
            showAddModal: false,
            regexValid: null,
            regexError: "",
            testString: "",
            testMatches: [],
            showExamples: false,
        });

        const onSubmit = e => {
            e.preventDefault();
            const name = this.inputRef.current.value;
            const is_regex = this.isRegexRef.current.checked;
            
            if (is_regex && !this.validateRegex(name, is_regex)) {
                return;
            }
            
            const keyword = { name, is_regex };
            this.props.addKeyWord(keyword);
            this.setState({ word: "", is_regex: false });
            handleClose();
        };

        const { regexValid, regexError, testString, testMatches, showExamples, is_regex } = this.state;

        return (
            <Modal show={this.state.showAddModal} onHide={handleClose} centered size="lg">
                <Modal.Header closeButton>
                    <Modal.Title>
                        Add New Search Pattern
                    </Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    <Container>
                        <Form onSubmit={onSubmit}>
                            {/* Main Input */}
                            <Form.Group className="mb-3">
                                <Form.Label>
                                    <strong>Pattern</strong>
                                    {is_regex && <Badge bg="info" className="ms-2">Regex Enabled</Badge>}
                                </Form.Label>
                                <Form.Control
                                    required
                                    ref={this.inputRef}
                                    type="text"
                                    placeholder="leak, data leak, .*@company\.com"
                                    onChange={this.handlePatternChange}
                                    isValid={is_regex && regexValid === true}
                                    isInvalid={is_regex && regexValid === false}
                                    style={{ fontFamily: 'monospace' }}
                                />
                                {is_regex && (
                                    <>
                                        <Form.Control.Feedback type="invalid">
                                            Invalid regex: {regexError}
                                        </Form.Control.Feedback>
                                        <Form.Control.Feedback type="valid">
                                            ✓ Valid regex pattern
                                        </Form.Control.Feedback>
                                    </>
                                )}
                                <Form.Text className="text-muted">
                                    Enter a simple keyword or enable regex below for pattern matching
                                </Form.Text>
                            </Form.Group>

                            {/* Regex Toggle */}
                            <Form.Group className="mb-3">
                                <Form.Check
                                    ref={this.isRegexRef}
                                    type="switch"
                                    id="add-regex-switch"
                                    defaultChecked={false}
                                    onChange={this.handleRegexToggle}
                                    label={
                                        <span>
                                            <strong>Use RegEx Pattern</strong>
                                            <Form.Text className="d-block text-muted" style={{marginTop: '4px'}}>
                                                When enabled, the keyword will be treated as a regular expression pattern
                                            </Form.Text>
                                        </span>
                                    }
                                />
                            </Form.Group>

                            {/* Examples Section - Only show when regex is enabled */}
                            {is_regex && (
                                <>
                                    <div className="mb-3">
                                        <Button
                                            variant="outline-primary"
                                            size="sm"
                                            onClick={() => this.setState({ showExamples: !showExamples })}
                                            className="w-100"
                                        >
                                            <i className="material-icons align-middle me-1" style={{fontSize: 18}}>
                                                {showExamples ? 'expand_less' : 'expand_more'}
                                            </i>
                                            {showExamples ? 'Hide' : 'Show'} Pattern Examples & Templates
                                        </Button>
                                    </div>

                                    {showExamples && (
                                        <div className="mb-3" style={{ maxHeight: '400px', overflowY: 'auto', border: '1px solid #dee2e6', borderRadius: '4px', padding: '10px' }}>
                                            {Object.entries(REGEX_PATTERNS).map(([category, patterns], catIdx) => (
                                                <div key={catIdx} className="mb-3">
                                                    <h6 className="mb-2">
                                                        <strong>{category}</strong>
                                                        <Badge bg="secondary" className="ms-2">{patterns.length}</Badge>
                                                    </h6>
                                                    {patterns.map((item, idx) => (
                                                        <Card key={idx} className="mb-2" style={{ fontSize: '0.9em' }}>
                                                            <Card.Body className="p-2">
                                                                <div className="d-flex justify-content-between align-items-start">
                                                                    <div style={{ flex: 1 }}>
                                                                        <div><strong>{item.name}</strong></div>
                                                                        <code style={{ 
                                                                            backgroundColor: '#f8f9fa', 
                                                                            padding: '2px 6px', 
                                                                            borderRadius: '3px',
                                                                            fontSize: '0.9em',
                                                                            display: 'inline-block',
                                                                            marginTop: '4px'
                                                                        }}>
                                                                            {item.pattern}
                                                                        </code>
                                                                        <div className="text-muted" style={{ fontSize: '0.85em', marginTop: '4px' }}>
                                                                            {item.description}
                                                                        </div>
                                                                    </div>
                                                                    <Button
                                                                        variant="outline-success"
                                                                        size="sm"
                                                                        onClick={() => this.usePattern(item.pattern)}
                                                                        style={{ whiteSpace: 'nowrap' }}
                                                                    >
                                                                        Use
                                                                    </Button>
                                                                </div>
                                                            </Card.Body>
                                                        </Card>
                                                    ))}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </>
                            )}

                            <div className="d-flex justify-content-end gap-2 modal-buttons-group">
                                <Button variant="secondary" onClick={handleClose}>
                                    Close
                                </Button>
                                <Button type="submit" variant="success" disabled={is_regex && regexValid === false}>
                                    Add Pattern
                                </Button>
                            </div>
                        </Form>
                    </Container>
                </Modal.Body>
            </Modal>
        );
    };

    renderLoadingState = () => (
        <tr>
            <td colSpan="4" className="text-center py-5">
                <div className="d-flex flex-column align-items-center">
                    <div className="spinner-border text-primary mb-3" role="status">
                        <span className="visually-hidden">Loading...</span>
                    </div>
                    <p className="text-muted mb-0">Loading data...</p>
                </div>
            </td>
        </tr>
    );

    render() {
        const { keywords, auth, globalFilters } = this.props;
        const { isAuthenticated } = auth;

        return (
            <Fragment>
                <div className="row">
                    <div className="col-lg-12">
                        <div className="d-flex justify-content-between align-items-center" style={{marginBottom: 12}}>
                            <h4>Search Patterns</h4>
                            <div>
                                <button className="btn btn-success" onClick={() => this.displayAddModal()}>
                                    <i className="material-icons me-1 align-middle" style={{fontSize: 23}}>&#xE147;</i>
                                    <span className="align-middle">Add Pattern</span>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                <TableManager
                    data={keywords}
                    filterConfig={[]}
                    customFilters={this.customFilters}
                    searchFields={['name']}
                    dateFields={['created_at']}
                    defaultSort="created_at"
                    globalFilters={globalFilters}
                    moduleKey="dataLeak_keywords"
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
                                                    <th style={{ cursor: 'pointer' }} onClick={() => handleSort('is_regex')}>
                                                        Type{renderSortIcons('is_regex')}
                                                    </th>
                                                    <th style={{ cursor: 'pointer' }} onClick={() => handleSort('created_at')}>
                                                        Created At{renderSortIcons('created_at')}
                                                    </th>
                                                    <th/>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {this.state.isLoading ? (
                                                    this.renderLoadingState()
                                                ) : paginatedData.length === 0 ? (
                                                    <tr>
                                                        <td colSpan="4" className="text-center text-muted py-4">
                                                            No results found
                                                        </td>
                                                    </tr>
                                                ) : (
                                                    paginatedData.map(keyword => (
                                                        <tr key={keyword.id}>
                                                            <td><h5>{keyword.name}</h5></td>
                                                            <td>
                                                                {keyword.is_regex ? (
                                                                    <span className="badge bg-info">RegEx</span>
                                                                ) : (
                                                                    <span className="badge bg-secondary">Exact</span>
                                                                )}
                                                            </td>
                                                            <td>
                                                                <DateWithTooltip 
                                                                    date={keyword.created_at} 
                                                                    includeTime={false}
                                                                    type="created"
                                                                />
                                                            </td>
                                                            <td className="text-end" style={{whiteSpace: 'nowrap'}}>
                                                                {isAuthenticated && (
                                                                    <>
                                                                        <button 
                                                                            className="btn btn-outline-warning btn-sm me-2"
                                                                            data-toggle="tooltip"
                                                                            data-placement="top" 
                                                                            title="Edit" 
                                                                            onClick={() => this.displayEditModal(keyword.id, keyword.name, keyword.is_regex)}
                                                                        >
                                                                            <i className="material-icons" style={{fontSize: 17, lineHeight: 1.8, margin: -2.5}}>edit</i>
                                                                        </button>
                                                                        <button 
                                                                            className="btn btn-outline-danger btn-sm" 
                                                                            data-toggle="tooltip"
                                                                            data-placement="top" 
                                                                            title="Delete" 
                                                                            onClick={() => this.displayDeleteModal(keyword.id, keyword.name)}
                                                                        >
                                                                            <i className="material-icons" style={{fontSize: 17, lineHeight: 1.8, margin: -2.5}}>delete</i>
                                                                        </button>
                                                                    </>
                                                                )}
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
    keywords: state.DataLeak.keywords,
    auth: state.auth
});

export default connect(mapStateToProps, {getKeyWords, deleteKeyWord, addKeyWord, patchKeyWord})(KeyWords);