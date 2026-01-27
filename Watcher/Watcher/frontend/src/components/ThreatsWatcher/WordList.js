import React, {Component, Fragment} from 'react';
import {connect} from 'react-redux';
import PropTypes from 'prop-types';
import {getLeads, deleteLead, addBannedWord} from "../../actions/leads";
import Button from 'react-bootstrap/Button';
import Modal from 'react-bootstrap/Modal';
import TableManager from '../common/TableManager';
import MonitoredKeywords from './MonitoredKeywords';


const FILTER_CONFIG = [
    {
        key: 'search',
        type: 'search',
        label: 'Search',
        placeholder: 'Search by word name...',
        width: 2
    },
    {
        key: 'reliability_range',
        type: 'select',
        label: 'Confidence',
        width: 2,
        options: [
            { value: 'low', label: '0-30%' },
            { value: 'medium', label: '31-69%' },
            { value: 'high', label: '70-100%' }
        ]
    },
    {
        key: 'occurrences_range',
        type: 'select',
        label: 'Occurrences',
        width: 2,
        options: [
            { value: 'low', label: '1-10' },
            { value: 'medium', label: '11-50' },
            { value: 'high', label: '51-100+' }
        ]
    },
    {
        key: 'monitored_temperature',
        type: 'select',
        label: 'Monitored',
        width: 2,
        options: [
            { value: 'all_monitored', label: 'All Monitored' },
            { value: 'WARN', label: '🔥 Warn' },
            { value: 'HOT', label: '🔥🔥 Hot' },
            { value: 'SUPER_HOT', label: '🔥🔥🔥 Super Hot' }
        ]
    }
];

export class WordList extends Component {
    constructor(props) {
        super(props);
        this.state = {
            show: false,
            id: 0,
            word: "",
            name: "",
            filteredData: [],
            isLoading: true,
            showMonitoredKeywords: false
        }
    }

    static propTypes = {
        leads: PropTypes.array.isRequired,
        getLeads: PropTypes.func.isRequired,
        deleteLead: PropTypes.func.isRequired,
        addBannedWord: PropTypes.func.isRequired,
        auth: PropTypes.object.isRequired,
        globalFilters: PropTypes.object,
        monitoredKeywords: PropTypes.array.isRequired
    };

    componentDidMount() {
        this.props.getLeads();
    }

    componentDidUpdate(prevProps) {
        if (this.props.leads !== prevProps.leads && this.state.isLoading) {
            this.setState({ isLoading: false });
        }
    }

    customFilters = (filtered, filters) => {
        if (filters.search) {
            const searchTerm = filters.search.toLowerCase();
            filtered = filtered.filter(lead =>
                (lead.name || '').toLowerCase().includes(searchTerm)
            );
        }

        if (filters.reliability_range) {
            filtered = filtered.filter(lead => {
                const score = lead.score || 0;
                switch (filters.reliability_range) {
                    case 'low': return score >= 0 && score <= 30;
                    case 'medium': return score >= 31 && score <= 69;
                    case 'high': return score >= 70 && score <= 100;
                    default: return true;
                }
            });
        }

        if (filters.occurrences_range) {
            filtered = filtered.filter(lead => {
                const occurrences = lead.occurrences || 0;
                switch (filters.occurrences_range) {
                    case 'low': return occurrences >= 1 && occurrences <= 10;
                    case 'medium': return occurrences >= 11 && occurrences <= 50;
                    case 'high': return occurrences >= 51;
                    default: return true;
                }
            });
        }

        if (filters.monitored_temperature) {
            filtered = filtered.filter(lead => {
                if (filters.monitored_temperature === 'all_monitored') {
                    return lead.is_monitored === true;
                }
                return lead.is_monitored && lead.monitored_temperature === filters.monitored_temperature;
            });
        }

        return filtered;
    };

    onDataFiltered = (filteredData) => {
        this.setState({ filteredData });
        if (this.props.onDataFiltered) {
            this.props.onDataFiltered(filteredData);
        }
    };

    displayModal = (id, word) => {
        this.setState({ show: true, id, word });
    };

    modal = () => {
        const handleClose = () => this.setState({ show: false });

        const onSubmit = e => {
            e.preventDefault();
            const name = this.state.word;
            const banned_word = { name };
            this.props.deleteLead(this.state.id, this.state.word);
            this.props.addBannedWord(banned_word);
            this.setState({ word: "", id: 0 });
            handleClose();
        };

        return (
            <Modal show={this.state.show} onHide={handleClose} centered>
                <Modal.Header closeButton>
                    <Modal.Title>Action Requested</Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    Are you sure you want to <u>delete</u> and add to <u>blocklist</u> <b className="ms-1">{this.state.word}</b> word?
                </Modal.Body>
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

    renderLoadingState = () => (
        <tr>
            <td colSpan="5" className="text-center py-5">
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
        const { isAuthenticated } = this.props.auth;
        const { leads, monitoredKeywords } = this.props;

        const totalMonitored = monitoredKeywords.length;
        const totalDetections = monitoredKeywords.reduce((sum, kw) => sum + (kw.total_detections || 0), 0);
        const monitoredInList = leads.filter(lead => lead.is_monitored).length;

        const authLinks = (id, name) => (
            <button onClick={() => this.displayModal(id, name)} className="btn btn-outline-primary btn-sm">
                Delete & BlockList
            </button>
        );

        const infoTexts = {
            name: "The word identified as trending",
            caught: "Number of times this word has been detected",
            reliability: "Indicates how reliable this word is, based on the average reliability of its sources",
            found: "Date and time this word first appeared on Watcher"
        };

        return (
            <Fragment>
                <div className="d-flex justify-content-between align-items-center mb-3">
                    <div>
                        <h4 className="mb-1">Trendy Words</h4>
                        {totalMonitored > 0 && (
                            <small className="text-muted">
                                {totalMonitored} monitored keyword{totalMonitored !== 1 ? 's' : ''} ({monitoredInList} currently displayed)
                            </small>
                        )}
                    </div>
                    {isAuthenticated && (
                        <Button 
                            variant="primary"
                            onClick={() => this.setState({ showMonitoredKeywords: true })}
                        >
                            <i className="material-icons me-1 align-middle" style={{ fontSize: 20 }}>
                                bookmark
                            </i>
                            Manage Keywords
                        </Button>
                    )}
                </div>

                <TableManager
                    data={leads}
                    filterConfig={FILTER_CONFIG}
                    searchFields={['name']}
                    dateFields={['created_at']}
                    defaultSort="created_at"
                    customFilters={this.customFilters}
                    onDataFiltered={this.onDataFiltered}
                    enableDateFilter={true}
                    dateFilterWidth={4}
                    moduleKey="threatsWatcher_wordlist"
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
                                        <table className="table table-striped table-hover mb-0" style={{ fontSize: '0.95rem' }}>
                                            <thead>
                                                <tr>
                                                    <th className="user-select-none" role="button" onClick={() => handleSort('name')}>
                                                        Name
                                                        {renderSortIcons('name')}
                                                    </th>
                                                    <th
                                                        className="text-center user-select-none"
                                                        role="button"
                                                        onClick={() => handleSort('occurrences')}
                                                    >
                                                        Caught
                                                        {renderSortIcons('occurrences')}
                                                    </th>
                                                    <th
                                                        className="text-center user-select-none"
                                                        role="button"
                                                        onClick={() => handleSort('score')}
                                                    >
                                                        Reliability
                                                        {renderSortIcons('score')}
                                                    </th>
                                                    <th
                                                        className="text-center user-select-none"
                                                        role="button"
                                                        onClick={() => handleSort('created_at')}
                                                    >
                                                        Found
                                                        {renderSortIcons('created_at')}
                                                    </th>
                                                    <th className="text-center" />
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {this.state.isLoading ? (
                                                    this.renderLoadingState()
                                                ) : paginatedData.length === 0 ? (
                                                    <tr>
                                                        <td colSpan="5" className="text-center text-muted py-4">
                                                            No results found
                                                        </td>
                                                    </tr>
                                                ) : (
                                                    paginatedData.map(lead => (
                                                        <tr 
                                                            key={lead.id}
                                                            onClick={() => this.props.setPostUrls(lead.posturls, lead.name)}
                                                            role="button"
                                                            style={{ cursor: 'pointer' }}
                                                        >
                                                            <td className="align-middle">
                                                                <span className="d-flex align-items-center" style={{ fontSize: '1rem' }}>
                                                                    {lead.is_monitored && lead.monitored_temperature && (
                                                                        <span className="me-1" style={{ fontSize: '1.1rem' }}>
                                                                            {lead.monitored_temperature === 'WARN' && '🔥'}
                                                                            {lead.monitored_temperature === 'HOT' && '🔥🔥'}
                                                                            {lead.monitored_temperature === 'SUPER_HOT' && '🔥🔥🔥'}
                                                                        </span>
                                                                    )}
                                                                    {lead.name}
                                                                </span>
                                                            </td>
                                                            <td className="text-center align-middle">
                                                                <span className="badge bg-secondary" style={{ fontSize: 'inherit', padding: '0.35rem 0.6rem' }}>
                                                                    {lead.occurrences}
                                                                </span>
                                                            </td>
                                                            <td className="text-center align-middle">
                                                                {lead.score ? (
                                                                    (() => {
                                                                        const badgeBg = lead.score >= 70 ? 'bg-success' : (lead.score >= 40 ? 'bg-warning' : 'bg-danger');
                                                                        return (
                                                                            <span
                                                                                className={`badge ${badgeBg}`}
                                                                                style={{ fontSize: 'inherit', padding: '0.35rem 0.6rem', color: '#000' }}
                                                                            >
                                                                                {lead.score.toFixed(1)}%
                                                                            </span>
                                                                        );
                                                                    })()
                                                                ) : (
                                                                    <span className="text-muted" style={{ fontSize: 'inherit' }}>N/A</span>
                                                                )}
                                                            </td>
                                                            <td className="text-center align-middle">
                                                                <small style={{ fontSize: '1rem' }}>{new Date(lead.created_at).toLocaleString()}</small>
                                                            </td>
                                                            <td className="text-center align-middle" onClick={(e) => e.stopPropagation()}>
                                                                {isAuthenticated && authLinks(lead.id, lead.name)}
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

                {this.modal()}
                
                <MonitoredKeywords 
                    show={this.state.showMonitoredKeywords}
                    handleClose={() => this.setState({ showMonitoredKeywords: false })}
                />
            </Fragment>
        );
    }
}

const mapStateToProps = state => ({
    leads: state.leads.leads,
    auth: state.auth,
    monitoredKeywords: state.leads.monitoredKeywords || []
});

export default connect(mapStateToProps, { getLeads, deleteLead, addBannedWord })(WordList);