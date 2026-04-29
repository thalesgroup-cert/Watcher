import React, { Component, Fragment } from 'react';
import { connect } from 'react-redux';
import PropTypes from 'prop-types';
import { getArchivedCVEs, getArchivedVictims, getArchivedHits, unarchiveCVE, unarchiveVictim, unarchiveHit } from '../../actions/CyberWatch';
import TableManager from '../common/TableManager';
import DateWithTooltip from '../common/DateWithTooltip';
import { OverlayTrigger, Tooltip, Badge } from 'react-bootstrap';

const SEVERITY_BADGE = {
    CRITICAL: 'bg-danger',
    HIGH: 'bg-warning text-dark',
    MEDIUM: 'bg-info text-dark',
    LOW: 'bg-success',
};

const CVE_FILTER_CONFIG = [
    { key: 'search', type: 'search', label: 'Search', placeholder: 'Search CVE ID or description...', width: 4 },
    {
        key: 'severity', type: 'select', label: 'Severity', width: 2,
        options: [
            { value: 'CRITICAL', label: 'Critical' },
            { value: 'HIGH', label: 'High' },
            { value: 'MEDIUM', label: 'Medium' },
            { value: 'LOW', label: 'Low' },
        ],
    },
];

const VICTIM_FILTER_CONFIG = [
    { key: 'search', type: 'search', label: 'Search', placeholder: 'Search victim or group...', width: 4 },
];

class ArchivedAlerts extends Component {
    constructor(props) {
        super(props);
        this.state = { activeTab: 'cves' };
    }

    static propTypes = {
        archivedCVEs:    PropTypes.array.isRequired,
        archivedVictims: PropTypes.array.isRequired,
        archivedHits:    PropTypes.array.isRequired,
        getArchivedCVEs:    PropTypes.func.isRequired,
        getArchivedVictims: PropTypes.func.isRequired,
        getArchivedHits:    PropTypes.func.isRequired,
        unarchiveCVE:    PropTypes.func.isRequired,
        unarchiveVictim: PropTypes.func.isRequired,
        unarchiveHit:    PropTypes.func.isRequired,
        auth:            PropTypes.object.isRequired,
    };

    componentDidMount() {
        this.props.getArchivedCVEs();
        this.props.getArchivedVictims();
        this.props.getArchivedHits();
    }

    cveCustomFilters = (filtered, filters) => {
        if (filters.severity) filtered = filtered.filter(c => c.severity === filters.severity);
        return filtered;
    };

    renderSeverityBadge = (severity) => {
        if (!severity) return <span className="text-muted">-</span>;
        return <span className={`badge ${SEVERITY_BADGE[severity] || 'bg-secondary'}`}>{severity}</span>;
    };

    renderCVETable = () => {
        const { archivedCVEs, unarchiveCVE, auth } = this.props;
        const { isAuthenticated } = auth;
        return (
            <TableManager
                data={archivedCVEs}
                filterConfig={CVE_FILTER_CONFIG}
                searchFields={['cve_id', 'description']}
                dateFields={['published']}
                defaultSort="published"
                customFilters={this.cveCustomFilters}
                moduleKey="cyberWatch_archivedCVEs"
            >
                {({ paginatedData, handleSort, renderSortIcons, renderFilters, renderPagination,
                    renderItemsInfo, renderFilterControls, renderSaveModal, getTableContainerStyle }) => (
                    <Fragment>
                        {renderFilterControls()}
                        {renderFilters()}
                        {renderItemsInfo()}
                        <div className="row"><div className="col-lg-12">
                            <div style={{ ...getTableContainerStyle(), overflowX: 'auto' }}>
                                <table className="table table-striped table-hover mb-0" style={{ fontSize: '0.95rem' }}>
                                    <thead>
                                        <tr>
                                            <th role="button" onClick={() => handleSort('cve_id')}>CVE ID {renderSortIcons('cve_id')}</th>
                                            <th className="text-center" role="button" onClick={() => handleSort('severity')}>Severity {renderSortIcons('severity')}</th>
                                            <th>Information</th>
                                            <th className="text-center" role="button" onClick={() => handleSort('published')}>Published {renderSortIcons('published')}</th>
                                            {isAuthenticated && <th className="text-end">Actions</th>}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {paginatedData.length === 0 ? (
                                            <tr>
                                                <td colSpan="5" className="text-center text-muted py-4">
                                                    No results found
                                                </td>
                                            </tr>
                                        ) : paginatedData.map(cve => (
                                            <tr key={cve.id}>
                                                <td className="align-middle">
                                                    <a
                                                        href={`https://www.cve.org/CVERecord?id=${cve.cve_id}`}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="fw-semibold text-decoration-none text-muted"
                                                    >
                                                        {cve.cve_id}
                                                    </a>
                                                </td>
                                                <td className="text-center align-middle">
                                                    {this.renderSeverityBadge(cve.severity)}
                                                </td>
                                                <td className="align-middle" style={{ maxWidth: '380px' }}>
                                                    {cve.description && cve.description.length > 50 ? (
                                                        <OverlayTrigger
                                                            placement="left"
                                                            delay={{ show: 250, hide: 400 }}
                                                            overlay={
                                                                <Tooltip id={`tooltip-arch-desc-${cve.id}`}>
                                                                    <div style={{ textAlign: 'left', maxWidth: '400px', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                                                                        {cve.description}
                                                                    </div>
                                                                </Tooltip>
                                                            }
                                                        >
                                                            <div style={{ display: 'inline-flex', alignItems: 'center', cursor: 'help', gap: '6px' }}>
                                                                <span style={{ maxWidth: 300, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', borderBottom: '1px dotted currentColor' }}>
                                                                    {cve.description}
                                                                </span>
                                                                <i className="material-icons text-info" style={{ fontSize: 16, verticalAlign: 'middle', flexShrink: 0 }}>info</i>
                                                            </div>
                                                        </OverlayTrigger>
                                                    ) : (
                                                        <span className="text-muted fst-italic">{cve.description || 'No information'}</span>
                                                    )}
                                                </td>
                                                <td className="text-center align-middle">
                                                    {cve.published
                                                        ? <DateWithTooltip date={cve.published} includeTime={false} type="created" />
                                                        : <span className="text-muted">-</span>
                                                    }
                                                </td>
                                                {isAuthenticated && (
                                                    <td className="text-end align-middle">
                                                        <button
                                                            className="btn btn-outline-primary btn-sm"
                                                            onClick={() => unarchiveCVE(cve.id)}
                                                        >
                                                            Enable
                                                        </button>
                                                    </td>
                                                )}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div></div>
                        {renderPagination()}
                        {renderSaveModal()}
                    </Fragment>
                )}
            </TableManager>
        );
    };

    renderHitsTable = () => {
        const { archivedHits, unarchiveHit, auth } = this.props;
        const { isAuthenticated } = auth;
        return (
            <TableManager
                data={archivedHits}
                filterConfig={[
                    { key: 'search', type: 'search', label: 'Search', placeholder: 'Search rule, victim or keyword...', width: 4 },
                    { key: 'hit_type', type: 'select', label: 'Type', width: 2,
                      options: [{ value: 'cve', label: 'CVE' }, { value: 'ransomware_victim', label: 'Ransomware Victim' }] },
                ]}
                searchFields={['rule_name', 'object_id', 'matched_keyword']}
                dateFields={['hit_at']}
                defaultSort="hit_at"
                customFilters={(filtered, filters) => {
                    if (filters.hit_type) filtered = filtered.filter(h => h.hit_type === filters.hit_type);
                    return filtered;
                }}
                moduleKey="cyberWatch_archivedHits"
            >
                {({ paginatedData, handleSort, renderSortIcons, renderFilters, renderPagination,
                    renderItemsInfo, renderFilterControls, renderSaveModal, getTableContainerStyle }) => (
                    <Fragment>
                        {renderFilterControls()}
                        {renderFilters()}
                        {renderItemsInfo()}
                        <div className="row"><div className="col-lg-12">
                            <div style={{ ...getTableContainerStyle(), overflowX: 'auto' }}>
                                <table className="table table-striped table-hover mb-0" style={{ fontSize: '0.95rem' }}>
                                    <thead>
                                        <tr>
                                            <th role="button" onClick={() => handleSort('rule_name')}>Rule {renderSortIcons('rule_name')}</th>
                                            <th role="button" onClick={() => handleSort('hit_type')}>Type {renderSortIcons('hit_type')}</th>
                                            <th role="button" onClick={() => handleSort('object_id')}>Match {renderSortIcons('object_id')}</th>
                                            <th role="button" onClick={() => handleSort('matched_keyword')}>Keyword {renderSortIcons('matched_keyword')}</th>
                                            <th className="text-center" role="button" onClick={() => handleSort('hit_at')}>Date {renderSortIcons('hit_at')}</th>
                                            {isAuthenticated && <th className="text-end">Actions</th>}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {paginatedData.length === 0 ? (
                                            <tr>
                                                <td colSpan={isAuthenticated ? 6 : 5} className="text-center text-muted py-4">
                                                    No archived hits
                                                </td>
                                            </tr>
                                        ) : paginatedData.map(hit => (
                                            <tr key={hit.id}>
                                                <td className="align-middle fw-semibold">{hit.rule_name || '-'}</td>
                                                <td className="align-middle">
                                                    <Badge bg={hit.hit_type === 'cve' ? 'info' : 'danger'}
                                                        text={hit.hit_type === 'cve' ? 'dark' : undefined}>
                                                        {hit.hit_type === 'cve' ? 'CVE' : 'Victim'}
                                                    </Badge>
                                                </td>
                                                <td className="align-middle text-muted"
                                                    style={{ maxWidth: 300, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                    {hit.object_id}
                                                </td>
                                                <td className="align-middle">
                                                    <Badge bg="secondary">{hit.matched_keyword}</Badge>
                                                </td>
                                                <td className="text-center align-middle">
                                                    <DateWithTooltip date={hit.hit_at} includeTime={true} type="created" />
                                                </td>
                                                {isAuthenticated && (
                                                    <td className="text-end align-middle">
                                                        <button
                                                            className="btn btn-outline-primary btn-sm"
                                                            onClick={() => unarchiveHit(hit.id)}
                                                        >
                                                            Enable
                                                        </button>
                                                    </td>
                                                )}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div></div>
                        {renderPagination()}
                        {renderSaveModal()}
                    </Fragment>
                )}
            </TableManager>
        );
    };

    renderVictimTable = () => {
        const { archivedVictims, unarchiveVictim, auth } = this.props;
        const { isAuthenticated } = auth;
        return (
            <TableManager
                data={archivedVictims}
                filterConfig={VICTIM_FILTER_CONFIG}
                searchFields={['victim_name', 'group_name']}
                dateFields={['attacked_at']}
                defaultSort="attacked_at"
                moduleKey="cyberWatch_archivedVictims"
            >
                {({ paginatedData, handleSort, renderSortIcons, renderFilters, renderPagination,
                    renderItemsInfo, renderFilterControls, renderSaveModal, getTableContainerStyle }) => (
                    <Fragment>
                        {renderFilterControls()}
                        {renderFilters()}
                        {renderItemsInfo()}
                        <div className="row"><div className="col-lg-12">
                            <div style={{ ...getTableContainerStyle(), overflowX: 'auto' }}>
                                <table className="table table-striped table-hover mb-0" style={{ fontSize: '0.95rem' }}>
                                    <thead>
                                        <tr>
                                            <th role="button" onClick={() => handleSort('victim_name')}>Victim {renderSortIcons('victim_name')}</th>
                                            <th className="text-center" role="button" onClick={() => handleSort('group_name')}>Group {renderSortIcons('group_name')}</th>
                                            <th className="text-center" role="button" onClick={() => handleSort('country')}>Country {renderSortIcons('country')}</th>
                                            <th className="text-center" role="button" onClick={() => handleSort('sector')}>Sector {renderSortIcons('sector')}</th>
                                            <th className="text-center" role="button" onClick={() => handleSort('attacked_at')}>Attacked {renderSortIcons('attacked_at')}</th>
                                            {isAuthenticated && <th className="text-end">Actions</th>}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {paginatedData.length === 0 ? (
                                            <tr>
                                                <td colSpan="6" className="text-center text-muted py-4">
                                                    No archived victims
                                                </td>
                                            </tr>
                                        ) : paginatedData.map(v => (
                                            <tr key={v.id}>
                                                <td className="align-middle fw-medium text-muted">{v.victim_name}</td>
                                                <td className="text-center align-middle">
                                                    <span className="badge bg-secondary" style={{ fontSize: 'inherit', padding: '0.3rem 0.55rem' }}>
                                                        {v.group_name || v.group}
                                                    </span>
                                                </td>
                                                <td className="text-center align-middle">
                                                    {v.country && v.country !== '-'
                                                        ? <span className="badge bg-secondary" style={{ fontSize: 'inherit', padding: '0.3rem 0.55rem' }}>{v.country}</span>
                                                        : <span className="text-muted">-</span>
                                                    }
                                                </td>
                                                <td className="text-center align-middle">
                                                    {v.sector && v.sector !== 'Not Found'
                                                        ? <span className="text-muted">{v.sector}</span>
                                                        : <span className="text-muted">-</span>
                                                    }
                                                </td>
                                                <td className="text-center align-middle">
                                                    <DateWithTooltip date={v.attacked_at} includeTime={true} type="created" />
                                                </td>
                                                {isAuthenticated && (
                                                    <td className="text-end align-middle">
                                                        <button
                                                            className="btn btn-outline-primary btn-sm"
                                                            onClick={() => unarchiveVictim(v.id)}
                                                        >
                                                            Enable
                                                        </button>
                                                    </td>
                                                )}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div></div>
                        {renderPagination()}
                        {renderSaveModal()}
                    </Fragment>
                )}
            </TableManager>
        );
    };

    render() {
        const { archivedCVEs, archivedVictims, archivedHits } = this.props;
        const { activeTab } = this.state;

        return (
            <Fragment>
                <h4 className="mb-3">
                    Archived Alerts
                </h4>

                <ul className="nav nav-tabs mb-3">
                    <li className="nav-item">
                        <button
                            className={`nav-link ${activeTab === 'cves' ? 'active' : ''}`}
                            onClick={() => this.setState({ activeTab: 'cves' })}
                        >
                            <i className="material-icons me-1" style={{ fontSize: '1rem', verticalAlign: 'middle' }}>security</i>
                            CVEs ({archivedCVEs.length})
                        </button>
                    </li>
                    <li className="nav-item">
                        <button
                            className={`nav-link ${activeTab === 'victims' ? 'active' : ''}`}
                            onClick={() => this.setState({ activeTab: 'victims' })}
                        >
                            <i className="material-icons me-1" style={{ fontSize: '1rem', verticalAlign: 'middle' }}>groups</i>
                            Victims ({archivedVictims.length})
                        </button>
                    </li>
                    <li className="nav-item">
                        <button
                            className={`nav-link ${activeTab === 'hits' ? 'active' : ''}`}
                            onClick={() => this.setState({ activeTab: 'hits' })}
                        >
                            <i className="material-icons me-1" style={{ fontSize: '1rem', verticalAlign: 'middle' }}>flag</i>
                            Hits ({archivedHits.length})
                        </button>
                    </li>
                </ul>

                {activeTab === 'cves'    && this.renderCVETable()}
                {activeTab === 'victims' && this.renderVictimTable()}
                {activeTab === 'hits'    && this.renderHitsTable()}
            </Fragment>
        );
    }
}

const mapStateToProps = state => ({
    archivedCVEs:    state.CyberWatch.archivedCVEs    || [],
    archivedVictims: state.CyberWatch.archivedVictims || [],
    archivedHits:    state.CyberWatch.archivedHits    || [],
    auth:            state.auth,
});

export default connect(mapStateToProps, {
    getArchivedCVEs,
    getArchivedVictims,
    getArchivedHits,
    unarchiveCVE,
    unarchiveVictim,
    unarchiveHit,
})(ArchivedAlerts);
