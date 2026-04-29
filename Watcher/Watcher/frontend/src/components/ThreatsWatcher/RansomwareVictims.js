import React, { Component, Fragment } from 'react';
import { connect } from 'react-redux';
import PropTypes from 'prop-types';
import TableManager from '../common/TableManager';
import DateWithTooltip from '../common/DateWithTooltip';
import { getRansomwareVictims, getWatchRuleHits, archiveVictim, archiveHit } from '../../actions/CyberWatch';
import { ISO2_TO_GEO, isoToFlag } from '../../utils/isoCountries';
import { Modal, Badge } from 'react-bootstrap';

const FILTER_CONFIG = [
    {
        key: 'search',
        type: 'search',
        label: 'Search',
        placeholder: 'Search victim or group...',
        width: 2,
    },
    {
        key: 'country',
        type: 'select',
        label: 'Country',
        width: 2,
        options: [],
    },    
    {
        key: 'sector',
        type: 'select',
        label: 'Sector',
        width: 2,
        options: [],
    },
];

class RansomwareVictims extends Component {
    constructor(props) {
        super(props);
        this.state = {
            activeTab: 'all', // 'hits' or 'all'
            selectedHit:     null,
            showDetailModal: false,
        };
    }

    static propTypes = {
        ransomwareVictims: PropTypes.array.isRequired,
        watchRuleHits: PropTypes.array.isRequired,
        getRansomwareVictims: PropTypes.func.isRequired,
        getWatchRuleHits: PropTypes.func.isRequired,
        archiveVictim: PropTypes.func.isRequired,
        archiveHit: PropTypes.func.isRequired,
        auth: PropTypes.object.isRequired,
        filterCountry: PropTypes.string,
        onCountrySelect: PropTypes.func,
        onVictimClick: PropTypes.func,
    };

    componentDidMount() {
        if (!this.props.ransomwareVictims.length) {
            this.props.getRansomwareVictims();
        }
        if (!this.props.watchRuleHits.length) {
            this.props.getWatchRuleHits();
        }
    }

    componentDidUpdate(prevProps) {
    }

    getRansomwareHits = () => {
        const { watchRuleHits } = this.props;
        return watchRuleHits.filter(h => h.hit_type === 'ransomware_victim');
    };

    getVictimForHit = (hit) => {
        // object_id format: "GroupName::VictimName"
        const parts = (hit.object_id || '').split('::');
        const victimName = parts.length >= 2 ? parts.slice(1).join('::') : parts[0];
        const groupName  = parts.length >= 2 ? parts[0] : null;
        return this.props.ransomwareVictims.find(v => {
            const nameMatch = v.victim_name === victimName;
            if (!nameMatch) return false;
            if (groupName) return (v.group_name || '') === groupName || (v.group || '') === groupName;
            return true;
        }) || null;
    };

    openDetailModal = (hit) =>
        this.setState({ selectedHit: hit, showDetailModal: true });

    closeDetailModal = () =>
        this.setState({ selectedHit: null, showDetailModal: false });

    renderDetailModal = () => {
        const { selectedHit, showDetailModal } = this.state;
        if (!selectedHit) return null;
        const victim = this.getVictimForHit(selectedHit);
        const parts = (selectedHit.object_id || '').split('::');
        const victimDisplayName = parts.length >= 2 ? parts.slice(1).join('::') : parts[0];
        const groupDisplayName  = parts.length >= 2 ? parts[0] : null;
        return (
            <Modal show={showDetailModal} onHide={this.closeDetailModal} size="lg" centered>
                <Modal.Header closeButton>
                    <Modal.Title>
                        <span className="fw-semibold">{victimDisplayName}</span>
                        {groupDisplayName && (
                            <span className="ms-2">
                                <Badge bg="danger">{groupDisplayName}</Badge>
                            </span>
                        )}
                    </Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    <dl className="row mb-0">
                        <dt className="col-sm-3">Rule</dt>
                        <dd className="col-sm-9">{selectedHit.rule_name || '-'}</dd>

                        <dt className="col-sm-3">Keyword</dt>
                        <dd className="col-sm-9"><Badge bg="secondary">{selectedHit.matched_keyword}</Badge></dd>

                        <dt className="col-sm-3">Hit date</dt>
                        <dd className="col-sm-9">
                            <DateWithTooltip date={selectedHit.hit_at} includeTime={true} type="created" />
                        </dd>

                        {victim ? (
                            <Fragment>
                                <dt className="col-sm-3">Group</dt>
                                <dd className="col-sm-9">
                                    <Badge bg="danger">{victim.group_name || victim.group || '-'}</Badge>
                                </dd>

                                <dt className="col-sm-3">Country</dt>
                                <dd className="col-sm-9">{victim.country || <span className="text-muted">-</span>}</dd>

                                <dt className="col-sm-3">Sector</dt>
                                <dd className="col-sm-9">{victim.sector && victim.sector !== 'Not Found' ? victim.sector : <span className="text-muted">-</span>}</dd>

                                <dt className="col-sm-3">Attacked</dt>
                                <dd className="col-sm-9">
                                    {victim.attacked_at
                                        ? <DateWithTooltip date={victim.attacked_at} includeTime={false} type="created" />
                                        : <span className="text-muted">-</span>}
                                </dd>

                                {victim.url && (
                                    <Fragment>
                                        <dt className="col-sm-3">URL</dt>
                                        <dd className="col-sm-9">
                                            <a href={victim.url} target="_blank" rel="noopener noreferrer"
                                                style={{ wordBreak: 'break-all' }}>{victim.url}</a>
                                        </dd>
                                    </Fragment>
                                )}
                            </Fragment>
                        ) : (
                            <Fragment>
                                <dt className="col-sm-3">Details</dt>
                                <dd className="col-sm-9 text-muted fst-italic">
                                    {selectedHit.hit_display || 'No additional details available.'}
                                </dd>
                            </Fragment>
                        )}
                    </dl>
                </Modal.Body>
            </Modal>
        );
    };

    customFilters = (filtered, filters) => {
        if (filters.search) {
            const t = filters.search.toLowerCase();
            filtered = filtered.filter(v =>
                (v.victim_name || '').toLowerCase().includes(t) ||
                (v.group_name  || '').toLowerCase().includes(t)
            );
        }

        if (filters.sector) {
            filtered = filtered.filter(v =>
                (v.sector || '').toLowerCase() === filters.sector.toLowerCase()
            );
        }

        if (filters.country) {
            filtered = filtered.filter(v => (v.country || '') === filters.country);
        }

        return filtered;
    };

    render() {
        const { ransomwareVictims, filterCountry, auth } = this.props;
        const { activeTab } = this.state;
        const { isAuthenticated } = auth;
        const ransomwareHits = this.getRansomwareHits();

        // Pre-filter by country so TableManager sees a new data prop and re-applies filters.
        // If the country filter yields 0 results, fall back to showing all victims.
        const filteredByCountry = filterCountry
            ? ransomwareVictims.filter(v => v.country === filterCountry)
            : ransomwareVictims;
        const data = activeTab === 'all'
            ? (filteredByCountry.length > 0 ? filteredByCountry : ransomwareVictims)
            : ransomwareHits;

        // Build sector and country options dynamically from data
        const sectors = [...new Set(
            ransomwareVictims
                .map(v => v.sector)
                .filter(s => s && s !== 'Not Found')
        )].sort();
        const countries = [...new Set(
            ransomwareVictims
                .map(v => v.country)
                .filter(c => c && c !== '-')
        )].sort();
        const filterConfig = FILTER_CONFIG.map(f => {
            if (f.key === 'sector') return { ...f, options: sectors.map(s => ({ value: s, label: s })) };
            if (f.key === 'country') return { ...f, options: countries.map(c => ({ value: c, label: c })) };
            return f;
        });

        const ruleNames = [...new Set(ransomwareHits.map(h => h.rule_name).filter(Boolean))].sort();
        const hitsFilterConfig = [
            { key: 'search', type: 'search', label: 'Search', placeholder: 'Search by rule, match or keyword...', width: 4 },
            { key: 'rule_name', type: 'select', label: 'Rule', width: 2, options: ruleNames.map(r => ({ value: r, label: r })) },
        ];

        // Country display
        const countryName = filterCountry ? (ISO2_TO_GEO[filterCountry] || filterCountry) : null;

        return (
            <Fragment>
                <div className="d-flex justify-content-between align-items-center mb-3">
                    <h4 className="mb-0">Ransomware Victims</h4>
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
                            {this.props.onCountrySelect && (
                                <button
                                    className="btn btn-sm p-0 ms-1"
                                    style={{ color: '#dc3545', lineHeight: 1 }}
                                    title="Clear country filter"
                                    onClick={() => this.props.onCountrySelect(null)}
                                >
                                    <i className="material-icons" style={{ fontSize: '1rem' }}>close</i>
                                </button>
                            )}
                        </div>
                    )}
                </div>

                {/* Tabs */}
                <ul className="nav nav-tabs mb-3">
                    <li className="nav-item">
                        <button
                            className={`nav-link ${activeTab === 'hits' ? 'active' : ''}`}
                            onClick={() => this.setState({ activeTab: 'hits' })}
                        >
                            Hits Victims ({ransomwareHits.length})
                        </button>
                    </li>
                    <li className="nav-item">
                        <button
                            className={`nav-link ${activeTab === 'all' ? 'active' : ''}`}
                            onClick={() => this.setState({ activeTab: 'all' })}
                        >
                            All Victims ({ransomwareVictims.length})
                        </button>
                    </li>
                </ul>

                {activeTab === 'hits' ? (
                    <TableManager
                        data={data}
                        filterConfig={hitsFilterConfig}
                        searchFields={['rule_name', 'hit_display', 'matched_keyword']}
                        dateFields={['hit_at']}
                        defaultSort="hit_at"
                        customFilters={(filtered, filters) => {
                            if (filters.rule_name) {
                                filtered = filtered.filter(h => h.rule_name === filters.rule_name);
                            }
                            return filtered;
                        }}
                        onItemsPerPageChange={this.props.onItemsPerPageChange}
                        enableDateFilter={true}
                        dateFilterWidth={4}
                        moduleKey="threatsWatcher_victimHits"
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
                            getTableContainerStyle,
                        }) => (
                            <Fragment>
                                {renderFilterControls()}
                                {renderFilters()}
                                {renderItemsInfo()}

                                <div className="row">
                                    <div className="col-12">
                                        <div style={{ ...getTableContainerStyle(), overflowX: 'auto' }}>
                                            <table className="table table-striped table-hover mb-0" style={{ fontSize: '0.95rem' }}>
                                                <thead>
                                                    <tr>
                                                        <th role="button" onClick={() => handleSort('rule_name')}>
                                                            Rule {renderSortIcons('rule_name')}
                                                        </th>
                                                        <th role="button" onClick={() => handleSort('object_id')}>
                                                            Victim {renderSortIcons('object_id')}
                                                        </th>
                                                        <th role="button" onClick={() => handleSort('matched_keyword')}>
                                                            Keyword {renderSortIcons('matched_keyword')}
                                                        </th>
                                                        <th className="text-center" role="button" onClick={() => handleSort('hit_at')}>
                                                            Date {renderSortIcons('hit_at')}
                                                        </th>
                                                        <th className="text-end"></th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {paginatedData.length === 0 ? (
                                                        <tr>
                                                            <td colSpan={5} className="text-center text-muted py-4">
                                                                No results found
                                                            </td>
                                                        </tr>
                                                    ) : (
                                                        paginatedData.map(hit => {
                                                            const parts = (hit.object_id || '').split('::');
                                                            const victimName = parts.length >= 2 ? parts.slice(1).join('::') : parts[0];
                                                            const groupName  = parts.length >= 2 ? parts[0] : null;
                                                            return (
                                                                <tr key={hit.id}>
                                                                    <td className="align-middle fw-semibold">{hit.rule_name}</td>
                                                                    <td className="align-middle">
                                                                        <span className="fw-medium">{victimName}</span>
                                                                        {groupName && (
                                                                            <span className="ms-2">
                                                                                <Badge bg="danger" style={{ fontSize: '0.75em' }}>{groupName}</Badge>
                                                                            </span>
                                                                        )}
                                                                    </td>
                                                                    <td className="align-middle">
                                                                        <span className="badge bg-secondary">{hit.matched_keyword}</span>
                                                                    </td>
                                                                    <td className="text-center align-middle">
                                                                        <DateWithTooltip date={hit.hit_at} includeTime={true} type="created" />
                                                                    </td>
                                                                    <td className="text-end align-middle" style={{ whiteSpace: 'nowrap' }}>
                                                                        <button
                                                                            className="btn btn-outline-info btn-sm me-2"
                                                                            onClick={() => this.openDetailModal(hit)}
                                                                            title="Details"
                                                                        >
                                                                            <i className="material-icons" style={{ fontSize: '1rem', verticalAlign: 'middle' }}>info</i>
                                                                        </button>
                                                                        {isAuthenticated && (
                                                                            <button
                                                                                className="btn btn-outline-warning btn-sm"
                                                                                onClick={() => this.props.archiveHit(hit.id)}
                                                                            >
                                                                                Disable
                                                                            </button>
                                                                        )}
                                                                    </td>
                                                                </tr>
                                                            );
                                                        })
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
                ) : (
                    <TableManager
                        data={data}
                        filterConfig={filterConfig}
                        searchFields={['victim_name', 'group_name']}
                        dateFields={['attacked_at']}
                        defaultSort="attacked_at"
                        customFilters={this.customFilters}
                        onItemsPerPageChange={this.props.onItemsPerPageChange}
                        enableDateFilter={true}
                        dateFilterWidth={4}
                        moduleKey="threatsWatcher_ransomwareVictims"
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
                            getTableContainerStyle,
                        }) => (
                            <Fragment>
                                {renderFilterControls()}
                                {renderFilters()}
                                {renderItemsInfo()}

                            <div className="row">
                                <div className="col-12">
                                    <div style={{ ...getTableContainerStyle(), overflowX: 'auto' }}>
                                        <table className="table table-striped table-hover mb-0" style={{ fontSize: '0.95rem' }}>
                                            <thead>
                                                <tr>
                                                    <th className="user-select-none" role="button"
                                                        onClick={() => handleSort('victim_name')}>
                                                        Victim {renderSortIcons('victim_name')}
                                                    </th>
                                                    <th className="user-select-none" role="button"
                                                        onClick={() => handleSort('group_name')}>
                                                        Group {renderSortIcons('group_name')}
                                                    </th>
                                                    <th className="text-center user-select-none" role="button"
                                                        onClick={() => handleSort('country')}>
                                                        Country {renderSortIcons('country')}
                                                    </th>
                                                    <th className="text-center user-select-none" role="button"
                                                        onClick={() => handleSort('sector')}>
                                                        Sector {renderSortIcons('sector')}
                                                    </th>
                                                    <th className="text-center user-select-none" role="button"
                                                        onClick={() => handleSort('attacked_at')}>
                                                        Attacked {renderSortIcons('attacked_at')}
                                                    </th>
                                                    {isAuthenticated && <th className="text-center">Actions</th>}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {paginatedData.length === 0 ? (
                                                    <tr>
                                                        <td colSpan="6" className="text-center text-muted py-4">
                                                            {countryName
                                                                ? `No results found in ${countryName}`
                                                                : 'No results found'}
                                                        </td>
                                                    </tr>
                                                ) : (
                                                    paginatedData.map(v => (
                                                        <tr
                                                            key={v.id}
                                                            role="button"
                                                            style={{ cursor: v.url ? 'pointer' : 'default' }}
                                                            onClick={() => v.url && window.open(v.url, '_blank', 'noopener')}
                                                        >
                                                            <td className="align-middle fw-medium">
                                                                {v.victim_name}
                                                            </td>
                                                            <td className="align-middle">
                                                                <span className="badge bg-danger" style={{ fontSize: 'inherit', padding: '0.3rem 0.55rem' }}>
                                                                    {v.group_name || v.group}
                                                                </span>
                                                            </td>
                                                            <td className="text-center align-middle">
                                                                {v.country && v.country !== '-' ? (
                                                                    <span className="badge bg-secondary" style={{ fontSize: 'inherit', padding: '0.3rem 0.55rem' }}>
                                                                        {v.country}
                                                                    </span>
                                                                ) : (
                                                                    <span className="text-muted">-</span>
                                                                )}
                                                            </td>
                                                            <td className="text-center align-middle">
                                                                {v.sector && v.sector !== 'Not Found'
                                                                    ? <span className="text-muted">{v.sector}</span>
                                                                    : <span className="text-muted">-</span>
                                                                }
                                                            </td>
                                                            <td className="text-center align-middle">
                                                                <DateWithTooltip
                                                                    date={v.attacked_at}
                                                                    includeTime={false}
                                                                    type="created"
                                                                />
                                                            </td>
                                                            {isAuthenticated && (
                                                                <td className="text-center align-middle" onClick={e => e.stopPropagation()}>
                                                                    <button
                                                                        className="btn btn-outline-warning btn-sm"
                                                                        onClick={() => this.props.archiveVictim(v.id)}
                                                                    >
                                                                        Disable
                                                                    </button>
                                                                </td>
                                                            )}
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
                )}
                {this.renderDetailModal()}
            </Fragment>
        );
    }
}

const mapStateToProps = state => ({
    ransomwareVictims: state.CyberWatch.ransomwareVictims || [],
    watchRuleHits: state.CyberWatch.watchRuleHits || [],
    auth: state.auth,
});

export default connect(mapStateToProps, { getRansomwareVictims, getWatchRuleHits, archiveVictim, archiveHit })(RansomwareVictims);
