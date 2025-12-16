import React, { Component } from 'react';
import { Form, Button, Modal, Container, Row, Col } from 'react-bootstrap';

export const renderSortIcons = (field, sortBy, sortDirection) => {
    const active = sortBy === field;
    const cA = '#375a7f', cI = '#bbb';
    const up = <span style={{ display: 'block', color: active && sortDirection === 'asc' ? cA : cI, margin: 0, padding: 0 }}>▲</span>;
    const down = <span style={{ display: 'block', color: active && sortDirection === 'desc' ? cA : cI, margin: 0, padding: 0 }}>▼</span>;
    return <span style={{ marginLeft: 6, fontSize: 13, verticalAlign: 'middle', display: 'inline-block', lineHeight: 0.8 }}>{up}{down}</span>;
};

const getDateRangeBounds = (range, customStart = null, customEnd = null) => {
    const now = new Date();
    let startDate = null;
    let endDate = now;

    switch (range) {
        case '1w':
            startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            break;
        case '30d':
            startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
            break;
        case '6m':
            startDate = new Date(now.getTime() - 6 * 30 * 24 * 60 * 60 * 1000);
            break;
        case '1y':
            startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
            break;
        case 'custom':
            startDate = customStart ? new Date(customStart) : null;
            endDate = customEnd ? new Date(customEnd) : null;
            break;
        case 'all':
        default:
            startDate = null;
            endDate = null;
            break;
    }

    return { startDate, endDate };
};

const filterDataByDateRange = (data, dateField, range, customStart = null, customEnd = null) => {
    if (range === 'all') {
        return data;
    }

    const { startDate, endDate } = getDateRangeBounds(range, customStart, customEnd);
    
    if (!startDate && !endDate) {
        return data;
    }

    return data.filter(item => {
        const itemDate = new Date(getNestedValue(item, dateField));
        if (isNaN(itemDate.getTime())) return false;
        
        if (startDate && itemDate < startDate) return false;
        if (endDate && itemDate > endDate) return false;
        
        return true;
    });
};

const getNestedValue = (obj, path) => {
    return path.split('.').reduce((current, key) => current?.[key], obj);
};

const DATE_RANGE_OPTIONS = [
    { value: 'all', label: 'All Time' },
    { value: '1w', label: 'Last Week' },
    { value: '30d', label: 'Last 30 Days' },
    { value: '6m', label: 'Last 6 Months' },
    { value: '1y', label: 'Last Year' },
    { value: 'custom', label: 'Custom Range' }
];

const GLOBAL_FILTER_VISIBILITY_KEY = 'watcher_localstorage_filterVisibility';

class TableManager extends Component {
    constructor(props) {
        super(props);
        this.moduleKey = props.moduleKey || 'default';
        const savedItemsPerPage = this.loadItemsPerPageFromStorage();
        const globalFilterVisibility = this.loadGlobalFilterVisibility();
        
        this.state = {
            currentPage: 1,
            itemsPerPage: savedItemsPerPage,
            filters: {},
            sortBy: props.defaultSort || 'created_at',
            sortDirection: 'desc',
            showFullCommentId: null,
            dateRange: 'all',
            customStartDate: '',
            customEndDate: '',
            showFilters: globalFilterVisibility,
            showSaveModal: false,
            filterName: '',
            savedFilters: {},
            containerHeight: 'auto'
        };
        this.containerRef = React.createRef();
        this.resizeObserver = null;
    }

    componentDidMount() {
        this.mounted = true;
        
        const initialFilters = {};
        this.props.filterConfig.forEach(filter => {
            initialFilters[filter.key] = '';
        });
        
        this.loadSavedFilters();
        
        this.setState({ filters: initialFilters }, () => {
            this.applyFilters();
        });

        setTimeout(() => {
            if (this.mounted) {
                this.setupResizeObserver();
            }
        }, 100);
    }

    componentWillUnmount() {
        this.mounted = false;
        
        if (this.resizeObserver) {
            this.resizeObserver.disconnect();
        }
        if (this.updateHeightTimer) {
            clearTimeout(this.updateHeightTimer);
        }
        window.removeEventListener('resize', this.updateContainerHeight);
    }

    componentDidUpdate(prevProps, prevState) {
        if (prevProps.data !== this.props.data || 
            JSON.stringify(prevProps.globalFilters) !== JSON.stringify(this.props.globalFilters)) {
            this.applyFilters();
        }

        if (prevState.itemsPerPage !== this.state.itemsPerPage ||
            prevState.currentPage !== this.state.currentPage ||
            prevState.filteredData !== this.state.filteredData) {
            setTimeout(() => {
                this.updateContainerHeight();
            }, 0);
        }
    }

    loadGlobalFilterVisibility = () => {
        try {
            const saved = localStorage.getItem(GLOBAL_FILTER_VISIBILITY_KEY);
            if (saved !== null) {
                return JSON.parse(saved);
            }
            return false;
        } catch (error) {
            console.error('Error loading global filter visibility:', error);
            return false;
        }
    };

    saveGlobalFilterVisibility = (isVisible) => {
        try {
            localStorage.setItem(GLOBAL_FILTER_VISIBILITY_KEY, JSON.stringify(isVisible));
        } catch (error) {
            console.error('Error saving global filter visibility:', error);
        }
    };

    loadItemsPerPageFromStorage = () => {
        try {
            const saved = localStorage.getItem(`watcher_localstorage_items_${this.moduleKey}`);
            return saved ? parseInt(saved, 10) : (this.props.itemsPerPage || 5);
        } catch (error) {
            return this.props.itemsPerPage || 5;
        }
    };

    saveItemsPerPageToStorage = (itemsPerPage) => {
        try {
            localStorage.setItem(`watcher_localstorage_items_${this.moduleKey}`, itemsPerPage.toString());
        } catch (error) {
            console.error('Error saving items per page:', error);
        }
    };

    setupResizeObserver = () => {
        if (!this.mounted) return;
        
        this.updateContainerHeight = this.updateContainerHeight.bind(this);
        window.addEventListener('resize', this.updateContainerHeight);

        if (window.ResizeObserver && this.containerRef.current) {
            this.resizeObserver = new ResizeObserver(() => {
                this.updateContainerHeight();
            });
            
            const parentElement = this.containerRef.current.closest('.h-100, .container-fluid, .row');
            if (parentElement) {
                this.resizeObserver.observe(parentElement);
            }
        }

        this.updateHeightTimer = setTimeout(() => {
            if (this.mounted) {
                this.updateContainerHeight();
            }
        }, 200);
    };

    updateContainerHeight = () => {
        if (!this.mounted) return;
        
        const paginatedData = this.getPaginatedData();
        
        const headerHeight = 50;
        const rowHeight = 60;
        const paddingHeight = 20;
        const actualItemsCount = paginatedData.length;
        const minHeight = headerHeight + rowHeight + paddingHeight;
        
        const calculatedHeight = actualItemsCount === 0 
            ? minHeight 
            : headerHeight + (actualItemsCount * rowHeight) + paddingHeight;
        
        const newHeight = `${calculatedHeight}px`;
        
        if (this.state.containerHeight !== newHeight) {
            this.setState({
                containerHeight: newHeight
            });
        }
    };

    handleFilterChange = (filterName, value) => {
        this.setState(prev => ({
            filters: { ...prev.filters, [filterName]: value },
            currentPage: 1
        }), () => {
            this.applyFilters();
            
            if (this.props.onFiltersChange) {
                this.props.onFiltersChange(this.state.filters);
            }
        });
    };

    handleDateRangeChange = (range) => {
        this.setState({ 
            dateRange: range,
            currentPage: 1
        }, this.applyFilters);
    };

    handleCustomDateChange = (startDate, endDate) => {
        this.setState({
            customStartDate: startDate,
            customEndDate: endDate,
            currentPage: 1
        }, this.applyFilters);
    };

    clearFilters = () => {
        const clearedFilters = {};
        this.props.filterConfig.forEach(filter => {
            clearedFilters[filter.key] = '';
        });
        this.setState({ 
            filters: clearedFilters, 
            currentPage: 1,
            dateRange: 'all',
            customStartDate: '',
            customEndDate: ''
        }, () => {
            this.applyFilters();
            
            if (this.props.onFiltersChange) {
                this.props.onFiltersChange(clearedFilters);
            }
        });
    };

    applyFilters = () => {
        const { data, customFilters, enableDateFilter = false, dateFields = [] } = this.props;
        const { filters, sortBy, sortDirection, dateRange, customStartDate, customEndDate } = this.state;
        
        let filtered = [...(data || [])];

        if (enableDateFilter && dateRange !== 'all' && dateFields.length > 0) {
            const primaryDateField = dateFields[0];
            filtered = filterDataByDateRange(filtered, primaryDateField, dateRange, customStartDate, customEndDate);
        }

        if (filters.global) {
            const val = filters.global.toLowerCase();
            const searchFields = this.props.searchFields || ['domain_name'];
            filtered = filtered.filter(item =>
                searchFields.some(field => {
                    const fieldValue = field.includes('.') 
                        ? field.split('.').reduce((obj, key) => obj?.[key], item)
                        : item[field];
                    return (fieldValue || '').toString().toLowerCase().includes(val);
                })
            );
        }

        if (customFilters) {
            filtered = customFilters(filtered, filters);
        }

        filtered = this.sortData(filtered, sortBy, sortDirection);
        
        if (this.props.onDataFiltered) {
            this.props.onDataFiltered(filtered);
        }
        
        this.setState({ filteredData: filtered });
    };

    sortData = (data, sortBy, sortDirection) => {
        const { dateFields = [] } = this.props;
        
        return [...data].sort((a, b) => {
            let av = a[sortBy], bv = b[sortBy];
            
            if (dateFields.includes(sortBy)) {
                av = av ? new Date(av) : new Date(0);
                bv = bv ? new Date(bv) : new Date(0);
            }
            
            if (typeof av === 'boolean' && typeof bv === 'boolean') {
                av = av ? 1 : 0; 
                bv = bv ? 1 : 0;
            }
            
            if (av == null && bv == null) return 0;
            if (av == null) return sortDirection === 'asc' ? 1 : -1;
            if (bv == null) return sortDirection === 'asc' ? -1 : 1;
            
            if (typeof av === 'string' && typeof bv === 'string') {
                av = av.toLowerCase(); 
                bv = bv.toLowerCase();
            }
            
            if (av < bv) return sortDirection === 'asc' ? -1 : 1;
            if (av > bv) return sortDirection === 'asc' ? 1 : -1;
            return 0;
        });
    };

    handleSort = (field) => {
        const { dateFields = [] } = this.props;
        this.setState(({ sortBy, sortDirection }) => ({
            sortBy: field,
            sortDirection: sortBy === field ? (sortDirection === 'asc' ? 'desc' : 'asc')
                : (dateFields.includes(field) ? 'desc' : 'asc')
        }), this.applyFilters);
    };

    handlePageChange = (pageNumber) => {
        this.setState({ currentPage: pageNumber });
    };

    handleItemsPerPageChange = (itemsPerPage) => {
        const newItemsPerPage = Number(itemsPerPage);
        this.saveItemsPerPageToStorage(newItemsPerPage);
        this.setState({ 
            itemsPerPage: newItemsPerPage, 
            currentPage: 1 
        });
    };

    getPaginatedData = () => {
        const { filteredData, currentPage, itemsPerPage } = this.state;
        const data = filteredData || [];
        const start = (currentPage - 1) * itemsPerPage;
        return data.slice(start, start + itemsPerPage);
    };

    getTotalPages = () => {
        const { filteredData, itemsPerPage } = this.state;
        return Math.ceil((filteredData?.length || 0) / itemsPerPage);
    };

    handleShowFullComment = (itemId) => {
        this.setState({ showFullCommentId: itemId });
    };

    handleHideFullComment = () => {
        this.setState({ showFullCommentId: null });
    };

    renderSortIcons = (field) => {
        const { sortBy, sortDirection } = this.state;
        return renderSortIcons(field, sortBy, sortDirection);
    };

    renderDateRangeFilter = () => {
        const { dateRange, customStartDate, customEndDate } = this.state;
        const { dateFilterWidth = 2 } = this.props;
        
        return (
            <div className={`col-12 col-md-${dateFilterWidth}`}>
                <Form.Label>Created</Form.Label>
                <Form.Control
                    as="select"
                    value={dateRange}
                    onChange={e => this.handleDateRangeChange(e.target.value)}
                >
                    {DATE_RANGE_OPTIONS.map(option => (
                        <option key={option.value} value={option.value}>
                            {option.label}
                        </option>
                    ))}
                </Form.Control>
                
                {dateRange === 'custom' && (
                    <div className="mt-2">
                        <div className="row">
                            <div className="col-6">
                                <Form.Control
                                    type="date"
                                    placeholder="Start Date"
                                    value={customStartDate}
                                    onChange={e => this.handleCustomDateChange(e.target.value, customEndDate)}
                                    size="sm"
                                />
                            </div>
                            <div className="col-6">
                                <Form.Control
                                    type="date"
                                    placeholder="End Date"
                                    value={customEndDate}
                                    onChange={e => this.handleCustomDateChange(customStartDate, e.target.value)}
                                    size="sm"
                                />
                            </div>
                        </div>
                    </div>
                )}
            </div>
        );
    };

    loadSavedFilters = () => {
        try {
            const saved = localStorage.getItem(`watcher_localstorage_filters_${this.moduleKey}`);
            if (saved) {
                this.setState({ savedFilters: JSON.parse(saved) });
            }
        } catch (error) {
            console.error('Error loading saved filters:', error);
        }
    };

    saveFiltersToStorage = (name, filters) => {
        try {
            const { dateRange, customStartDate, customEndDate } = this.state;
            const filterData = {
                filters,
                dateRange,
                customStartDate,
                customEndDate,
                savedAt: new Date().toISOString()
            };
            
            const currentSaved = { ...this.state.savedFilters };
            currentSaved[name] = filterData;
            
            localStorage.setItem(`watcher_localstorage_filters_${this.moduleKey}`, JSON.stringify(currentSaved));
            this.setState({ savedFilters: currentSaved });
        } catch (error) {
            console.error('Error saving filters:', error);
        }
    };

    loadFilterFromStorage = (name) => {
        const filterData = this.state.savedFilters[name];
        if (filterData) {
            this.setState({
                filters: filterData.filters,
                dateRange: filterData.dateRange || 'all',
                customStartDate: filterData.customStartDate || '',
                customEndDate: filterData.customEndDate || '',
                currentPage: 1
            }, () => {
                this.applyFilters();
                if (this.props.onFiltersChange) {
                    this.props.onFiltersChange(this.state.filters);
                }
            });
        }
    };

    deleteFilterFromStorage = (name) => {
        const currentSaved = { ...this.state.savedFilters };
        delete currentSaved[name];
        
        localStorage.setItem(`watcher_localstorage_filters_${this.moduleKey}`, JSON.stringify(currentSaved));
        this.setState({ savedFilters: currentSaved });
    };

    handleSaveFilter = () => {
        const { filterName, filters } = this.state;
        if (filterName.trim()) {
            this.saveFiltersToStorage(filterName.trim(), filters);
            this.setState({ 
                showSaveModal: false, 
                filterName: '' 
            });
        }
    };

    toggleFilters = () => {
        this.setState(prev => {
            const newShowFilters = !prev.showFilters;
            this.saveGlobalFilterVisibility(newShowFilters);
            return { showFilters: newShowFilters };
        });
    };

    resetToDefault = () => {
        const clearedFilters = {};
        this.props.filterConfig.forEach(filter => {
            clearedFilters[filter.key] = '';
        });
        
        const currentItemsPerPage = this.state.itemsPerPage;
        const currentShowFilters = this.state.showFilters;
        
        this.setState({ 
            filters: clearedFilters, 
            currentPage: 1,
            dateRange: 'all',
            customStartDate: '',
            customEndDate: '',
            sortBy: this.props.defaultSort || 'created_at',
            sortDirection: 'desc',
            itemsPerPage: currentItemsPerPage,
            showFilters: currentShowFilters
        }, () => {
            this.applyFilters();
            this.updateContainerHeight();
            
            if (this.props.onFiltersChange) {
                this.props.onFiltersChange(clearedFilters);
            }
        });
    };

    renderFilterControls = () => {
        const { savedFilters, showFilters } = this.state;
        const savedFilterNames = Object.keys(savedFilters);
    
        return (
            <div className="d-flex justify-content-start mb-3" style={{ gap: '10px' }}>
                <button 
                    className="btn btn-secondary"
                    onClick={this.resetToDefault}
                    title="Reset all filters and sorting to default state"
                >
                    <i className="material-icons me-1 align-middle" style={{ fontSize: 20 }}>refresh</i>
                    <span className="align-middle">Reset to Default</span>
                </button>
    
                <div className="btn-group">
                    <button 
                        className={`btn btn-secondary ${savedFilterNames.length > 0 ? 'dropdown-toggle' : ''}`}
                        type="button" 
                        data-toggle={savedFilterNames.length > 0 ? 'dropdown' : undefined}
                        aria-haspopup={savedFilterNames.length > 0 ? true : undefined}
                        aria-expanded={savedFilterNames.length > 0 ? false : undefined}
                        disabled={savedFilterNames.length === 0}
                        style={{ borderRadius: '0.25rem' }}
                    >
                        <i className="material-icons me-1 align-middle" style={{ fontSize: 20 }}>folder_open</i>
                        <span className="align-middle">Saved Filters ({savedFilterNames.length})</span>
                    </button>
                    <div className="dropdown-menu shadow" style={{ minWidth: '320px', borderRadius: '0.25rem' }}>
                        {savedFilterNames.length === 0 ? (
                            <span className="dropdown-item-text text-muted text-center py-3" style={{ fontSize: '15px' }}>
                                No saved filters
                            </span>
                        ) : (
                            savedFilterNames.map(name => (
                                <div
                                    key={name}
                                    className="dropdown-item d-flex align-items-center justify-content-between"
                                    style={{ cursor: 'pointer', padding: '10px 18px' }}
                                    onClick={() => this.loadFilterFromStorage(name)}
                                    title={`Load "${name}" filter`}
                                >
                                    <span className="d-flex align-items-center flex-grow-1">
                                        <i className="material-icons me-2 text-body" style={{ fontSize: 18 }}>filter_list</i>
                                        <span>
                                            <span className="fw-bold text-body">{name}</span>
                                            <br />
                                            <small className="text-muted">
                                                Saved: {savedFilters[name]?.savedAt ? new Date(savedFilters[name].savedAt).toLocaleDateString() : 'Unknown date'}
                                            </small>
                                        </span>
                                    </span>
                                    <button
                                        className="btn btn-outline-danger btn-sm"
                                        type="button"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            this.deleteFilterFromStorage(name);
                                        }}
                                        title={`Delete "${name}" filter`}
                                        tabIndex={-1}
                                        style={{ marginLeft: "15px" }}
                                    >
                                        <i className="material-icons" style={{ fontSize: 16 }}>delete</i>
                                    </button>
                                </div>
                            ))
                        )}
                    </div>
                </div>
    
                <button 
                    className="btn btn-primary"
                    onClick={this.toggleFilters}
                    title={showFilters ? 'Hide filters' : 'Show filters'}
                >
                    <i className="material-icons me-1 align-middle" style={{ fontSize: 20 }}>
                        {showFilters ? 'visibility_off' : 'visibility'}
                    </i>
                    <span className="align-middle">{showFilters ? 'Hide Filters' : 'Show Filters'}</span>
                </button>
    
                <button 
                    className="btn btn-success"
                    onClick={() => this.setState({ showSaveModal: true })}
                    title="Save current filter configuration"
                >
                    <i className="material-icons me-1 align-middle" style={{ fontSize: 20 }}>save_alt</i>
                    <span className="align-middle">Save Filter</span>
                </button>
            </div>
        );
    };

    renderSaveModal = () => {
        const { showSaveModal, filterName } = this.state;
    
        const handleClose = () => this.setState({ 
            showSaveModal: false, 
            filterName: '' 
        });
    
        return (
            <Modal show={showSaveModal} onHide={handleClose} centered>
                <Modal.Header closeButton>
                    <Modal.Title>Save Current Filter</Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    <Container>
                        <Row>
                            <Col>
                                <Form onSubmit={(e) => {
                                    e.preventDefault();
                                    this.handleSaveFilter();
                                }}>
                                    <Form.Group as={Row} className="mb-3 align-items-center">
                                        <Form.Label column sm={4}>
                                            Filter Name
                                        </Form.Label>
                                        <Col sm={8}>
                                            <Form.Control
                                                required
                                                type="text"
                                                placeholder="e.g., Critical Alerts, Last Week..."
                                                value={filterName}
                                                onChange={e => this.setState({ filterName: e.target.value })}
                                                autoFocus
                                            />
                                        </Col>
                                    </Form.Group>
                                    
                                    <div className="d-flex justify-content-end gap-2 modal-buttons-group">
                                        <Button variant="secondary" onClick={handleClose}>
                                            Close
                                        </Button>
                                        <Button 
                                            type="submit" 
                                            variant="success"
                                            disabled={!filterName.trim()}
                                        >
                                            Save Filter
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

    renderFilters = () => {
        const { filterConfig, enableDateFilter = false, dateFields = [] } = this.props;
        const { filters, showFilters } = this.state;

        if (!showFilters) return null;

        const hasDateFilter = enableDateFilter && dateFields.length > 0;
        
        return (
            <div className="card mb-3 shadow-sm border-0">
                <div className="card-body py-2 mb-2">
                    <div className="row align-items-center">
                        {filterConfig.map((filter) => (
                            <div key={filter.key} className={`col-12 col-md-${filter.width || 2}`}>
                                <Form.Label>{filter.label}</Form.Label>
                                {filter.type === 'search' ? (
                                    <Form.Control
                                        type="text"
                                        placeholder={filter.placeholder}
                                        value={filters[filter.key] || ''}
                                        onChange={e => this.handleFilterChange(filter.key, e.target.value)}
                                    />
                                ) : (
                                    <Form.Control
                                        as="select"
                                        value={filters[filter.key] || ''}
                                        onChange={e => this.handleFilterChange(filter.key, e.target.value)}
                                    >
                                        <option value="">All</option>
                                        {filter.options.map(option => (
                                            <option key={option.value} value={option.value}>
                                                {option.label}
                                            </option>
                                        ))}
                                    </Form.Control>
                                )}
                            </div>
                        ))}
                        
                        {hasDateFilter && this.renderDateRangeFilter()}
                        
                        <div className="col-12 col-md-2 text-md-end">
                            <Form.Label>&nbsp;</Form.Label>
                            <Button
                                variant="outline-primary"
                                className="w-100 d-block"
                                onClick={this.clearFilters}
                            >
                                Clear all filters
                            </Button>
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    renderPagination = () => {
        const { currentPage } = this.state;
        const totalPages = this.getTotalPages();
        
        if (totalPages <= 1) return null;
    
        const getPages = () => {
            const delta = 2, pages = [];
            if (totalPages <= 7) {
                for (let i = 1; i <= totalPages; i++) pages.push(i);
            } else {
                pages.push(1);
                const start = Math.max(2, currentPage - delta);
                const end = Math.min(totalPages - 1, currentPage + delta);
                if (start > 2) pages.push('...');
                for (let i = start; i <= end; i++) pages.push(i);
                if (end < totalPages - 1) pages.push('...');
                pages.push(totalPages);
            }
            return pages;
        };
    
        return (
            <nav className="mt-3">
                <ul className="pagination justify-content-center">
                    <li className={`page-item ${currentPage === 1 ? 'disabled' : ''}`}>
                        <button 
                            className="page-link" 
                            onClick={() => this.handlePageChange(currentPage - 1)} 
                            disabled={currentPage === 1}
                        >
                            Previous
                        </button>
                    </li>
                    {getPages().map((page, idx) =>
                        page === '...' ? (
                            <li key={`ellipsis-${idx}`} className="page-item disabled">
                                <span className="page-link">…</span>
                            </li>
                        ) : (
                            <li key={page} className={`page-item ${currentPage === page ? 'active' : ''}`}>
                                <button 
                                    className="page-link" 
                                    onClick={() => this.handlePageChange(page)}
                                >
                                    {page}
                                </button>
                            </li>
                        )
                    )}
                    <li className={`page-item ${currentPage === totalPages ? 'disabled' : ''}`}>
                        <button 
                            className="page-link" 
                            onClick={() => this.handlePageChange(currentPage + 1)} 
                            disabled={currentPage === totalPages}
                        >
                            Next
                        </button>
                    </li>
                </ul>
            </nav>
        );
    };

    renderItemsInfo = () => {
        const { filteredData, currentPage, itemsPerPage } = this.state;
        const dataLength = filteredData?.length || 0;
        
        return (
            <div ref={this.containerRef} className="d-flex justify-content-between align-items-center mb-2">
                <small className="text-muted">
                    Showing {dataLength === 0 ? 0 : ((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, dataLength)} of {dataLength} entries
                </small>
                <div className="d-flex align-items-center">
                    <small className="text-muted me-2">Items per page:</small>
                    <select
                        className="form-select form-select-sm"
                        value={itemsPerPage}
                        onChange={e => this.handleItemsPerPageChange(Number(e.target.value))}
                        style={{ width: 'auto' }}
                    >
                        <option value="5">5</option>
                        <option value="10">10</option>
                        <option value="25">25</option>
                        <option value="50">50</option>
                        <option value="100">100</option>
                    </select>
                </div>
            </div>
        );
    };

    getTableContainerStyle = () => {
        const paginatedData = this.getPaginatedData();
        if (paginatedData.length === 0) {
            return {
                height: 'auto',
                minHeight: '100px',
                overflow: 'hidden'
            };
        }
        return {
            height: 'auto',
            overflow: 'hidden',
            transition: 'height 0.3s ease'
        };
    };

    render() {
        const { children } = this.props;

        const renderProps = {
            paginatedData: this.getPaginatedData(),
            renderItemsInfo: this.renderItemsInfo,
            renderPagination: this.renderPagination,
            handleSort: this.handleSort,
            renderSortIcons: this.renderSortIcons,
            renderFilters: this.renderFilters,
            renderFilterControls: this.renderFilterControls,
            renderSaveModal: this.renderSaveModal,
            getTableContainerStyle: this.getTableContainerStyle
        };

        return children(renderProps);
    }
}

export default TableManager;