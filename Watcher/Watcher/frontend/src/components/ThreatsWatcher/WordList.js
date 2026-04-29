import React, {Component, Fragment} from 'react';
import {connect} from 'react-redux';
import PropTypes from 'prop-types';
import {getLeads, deleteLead, addBannedWord, getMonitoredKeywords} from "../../actions/leads";
import Button from 'react-bootstrap/Button';
import Modal from 'react-bootstrap/Modal';
import TableManager from '../common/TableManager';
import DateWithTooltip from '../common/DateWithTooltip';
import { ISO2_TO_GEO, isoToFlag } from '../../utils/isoCountries';

/** Extract registrable domain from a URL (same logic as WorldMap). */
function extractDomain(url) {
    try {
        const hostname = new URL(url).hostname.replace(/^www\./, '').toLowerCase();
        const parts = hostname.split('.');
        if (
            parts.length >= 3 &&
            ['co', 'com', 'gov', 'org', 'net', 'edu', 'ac'].includes(parts[parts.length - 2])
        ) {
            return parts.slice(-3).join('.');
        }
        return parts.slice(-2).join('.');
    } catch {
        return '';
    }
}


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
        key: 'from_source',
        type: 'select',
        label: 'From',
        width: 2,
        options: [
            { value: 'trendy_words', label: 'Trendy Words' },
            { value: 'monitored_keywords', label: 'Monitored Keywords' }
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
            currentFilters: null
        }
    }

    static propTypes = {
        leads: PropTypes.array.isRequired,
        sources: PropTypes.array,
        monitoredKeywords: PropTypes.array,
        getLeads: PropTypes.func.isRequired,
        deleteLead: PropTypes.func.isRequired,
        addBannedWord: PropTypes.func.isRequired,
        getMonitoredKeywords: PropTypes.func.isRequired,
        auth: PropTypes.object.isRequired,
        globalFilters: PropTypes.object,
        filterCountry: PropTypes.string,
        onCountrySelect: PropTypes.func,
    };

    componentDidMount() {
        this.props.getLeads();
        this.props.getMonitoredKeywords();
    }

    componentDidUpdate(prevProps) {
        if (this.props.leads !== prevProps.leads && this.state.isLoading) {
            this.setState({ isLoading: false });
        }
    }


    buildFilteredNamesByCountry() {
        const { filterCountry, sources, leads } = this.props;
        if (!filterCountry || !sources) return null;

        const domainSet = new Set();
        (sources || []).forEach(s => {
            if (s.country_code === filterCountry) {
                const d = extractDomain(s.url);
                if (d) domainSet.add(d);
            }
        });
        if (domainSet.size === 0) return new Set(); 

        const names = new Set();
        (leads || []).forEach(lead => {
            for (const postStr of (lead.posturls || [])) {
                const articleUrl = typeof postStr === 'string'
                    ? postStr.split(',')[0]
                    : (postStr.url || '');
                if (domainSet.has(extractDomain(articleUrl))) {
                    names.add(lead.name);
                    break;
                }
            }
        });
        return names;
    }

    customFilters = (filtered, filters) => {
        this._lastFilters = filters;
        
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

        if (filters.from_source) {
            filtered = filtered.filter(lead => (lead._from_source || 'trendy_words') === filters.from_source);
        }

        const filteredNames = this.buildFilteredNamesByCountry();
        if (filteredNames !== null) {
            filtered = filtered.filter(lead => filteredNames.has(lead.name));
        }

        return filtered;
    };

    onDataFiltered = (filteredData) => {
        const fromSourceFilter = (this._lastFilters && this._lastFilters.from_source) || null;
        
        this.setState({ filteredData, currentFilters: this._lastFilters });
        
        if (this.props.onDataFiltered) {
            this.props.onDataFiltered(filteredData);
        }
        
        if (this.props.onFromSourceFilterChange) {
            this.props.onFromSourceFilterChange(fromSourceFilter);
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


    getAugmentedLeads() {
        const { leads } = this.props;
        const monitoredKeywords = this.props.monitoredKeywords || [];
        if (
            this._cachedLeads === leads &&
            this._cachedMK === monitoredKeywords
        ) {
            return this._cachedAugmented;
        }
        const existingNames = new Set(leads.map(l => l.name.toLowerCase()));
        const trendyLeads = leads.map(lead => ({
            ...lead,
            _from_source: 'trendy_words',
        }));
        const syntheticLeads = monitoredKeywords
            .filter(mk => mk.last_seen && !existingNames.has(mk.name.toLowerCase()))
            .map(mk => ({
                id: `mk_${mk.id}`,
                name: mk.name,
                occurrences: mk.occurrences || 1,
                posturls: mk.posturls || [],
                score: null,
                created_at: mk.last_seen,
                _monitored_only: true,
                _from_source: 'monitored_keywords',
            }));
        this._cachedLeads = leads;
        this._cachedMK = monitoredKeywords;
        this._cachedAugmented = [...trendyLeads, ...syntheticLeads];
        return this._cachedAugmented;
    }

    render() {
        const { isAuthenticated } = this.props.auth;
        const { filterCountry, onCountrySelect } = this.props;
        const monitoredKeywords = this.props.monitoredKeywords || [];
        const monitoredMap = new Map(monitoredKeywords.map(mk => [mk.name.toLowerCase(), mk]));
        const augmentedLeads = this.getAugmentedLeads();
        const countryName = filterCountry ? (ISO2_TO_GEO[filterCountry] || filterCountry) : null;

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
                    <h4 className="mb-0">Trendy Words</h4>
                    <div className="d-flex align-items-center gap-2 flex-wrap">
                        {countryName && (
                            <div
                                className="d-flex align-items-center gap-1 px-2 py-1"
                                style={{
                                    background: 'rgba(13,110,253,0.1)',
                                    border: '1.5px solid #0d6efd',
                                    borderRadius: 20,
                                    fontSize: '0.85rem',
                                    color: '#0d6efd',
                                    fontWeight: 500,
                                }}
                            >
                                <span style={{ fontSize: '1rem' }}>{isoToFlag(filterCountry)}</span>
                                <span>{countryName}</span>
                                {onCountrySelect && (
                                    <button
                                        className="btn btn-sm p-0 ms-1"
                                        style={{ color: '#0d6efd', lineHeight: 1 }}
                                        title="Clear country filter"
                                        onClick={() => onCountrySelect(null)}
                                    >
                                        <i className="material-icons" style={{ fontSize: '1rem' }}>close</i>
                                    </button>
                                )}
                            </div>
                        )}

                    </div>
                </div>

                <TableManager
                    data={augmentedLeads}
                    filterConfig={FILTER_CONFIG}
                    searchFields={['name']}
                    dateFields={['created_at']}
                    defaultSort="created_at"
                    customFilters={this.customFilters}
                    onDataFiltered={this.onDataFiltered}
                    onItemsPerPageChange={this.props.onItemsPerPageChange}
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
                                                                {(() => {
                                                                    const mk = monitoredMap.get((lead.name || '').toLowerCase());
                                                                    const FLAMES = { warm: '🔥', hot: '🔥🔥', super_hot: '🔥🔥🔥' };
                                                                    return (
                                                                        <span className="mb-0" style={{ fontSize: '1rem' }}>
                                                                            {mk && (
                                                                                <span
                                                                                    title={`Monitored keyword - level: ${mk.level}`}
                                                                                    style={{ marginRight: 6, fontSize: '1rem' }}
                                                                                >
                                                                                    {FLAMES[mk.level] || '🔥'}
                                                                                </span>
                                                                            )}
                                                                            {lead.name}
                                                                        </span>
                                                                    );
                                                                })()}
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
                                                                <small style={{ fontSize: '1rem' }}>
                                                                    <DateWithTooltip 
                                                                        date={lead.created_at} 
                                                                        includeTime={true}
                                                                        type="created"
                                                                    />
                                                                </small>
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
            </Fragment>
        );
    }
}

const mapStateToProps = state => ({
    leads: state.leads.leads,
    sources: state.WorldMap.sources || [],
    monitoredKeywords: state.leads.monitoredKeywords || [],
    auth: state.auth
});

export default connect(mapStateToProps, { getLeads, deleteLead, addBannedWord, getMonitoredKeywords })(WordList);