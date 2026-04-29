import React, { Component, Fragment } from 'react';
import { connect } from 'react-redux';
import PropTypes from 'prop-types';
import { getCVEs, getWatchRuleHits, archiveCVE, archiveHit } from '../../actions/CyberWatch';
import { OverlayTrigger, Tooltip, Modal, Badge } from 'react-bootstrap';
import TableManager from '../common/TableManager';
import DateWithTooltip from '../common/DateWithTooltip';

const SEVERITY_BADGE = {
    CRITICAL: 'bg-danger',
    HIGH:     'bg-warning text-dark',
    MEDIUM:   'bg-info text-dark',
    LOW:      'bg-success'
};

const FILTER_CONFIG = [
    {
        key: 'search',
        type: 'search',
        label: 'Search',
        placeholder: 'Search by CVE ID or description...',
        width: 4
    },
    {
        key: 'severity',
        type: 'select',
        label: 'Severity',
        width: 2,
        options: [
            { value: 'CRITICAL', label: 'Critical' },
            { value: 'HIGH',     label: 'High' },
            { value: 'MEDIUM',   label: 'Medium' },
            { value: 'LOW',      label: 'Low' },
        ]
    },
];

const HITS_FILTER_CONFIG = [
    {
        key: 'search',
        type: 'search',
        label: 'Search',
        placeholder: 'Search by CVE ID or keyword...',
        width: 4
    },
    {
        key: 'severity',
        type: 'select',
        label: 'Severity',
        width: 2,
        options: [
            { value: 'CRITICAL', label: 'Critical' },
            { value: 'HIGH',     label: 'High' },
            { value: 'MEDIUM',   label: 'Medium' },
            { value: 'LOW',      label: 'Low' },
        ]
    },
];

class CVEVulnerabilities extends Component {
    constructor(props) {
        super(props);
        this.state = {
            activeTab:       'all',
            selectedHit:     null,
            showDetailModal: false,
        };
    }

    static propTypes = {
        cves:             PropTypes.array.isRequired,
        watchRuleHits:    PropTypes.array.isRequired,
        getCVEs:          PropTypes.func.isRequired,
        getWatchRuleHits: PropTypes.func.isRequired,
        archiveCVE:       PropTypes.func.isRequired,
        archiveHit:       PropTypes.func.isRequired,
        auth:             PropTypes.object.isRequired,
    };

    componentDidMount() {
        this.props.getCVEs({});
        if (!this.props.watchRuleHits.length) {
            this.props.getWatchRuleHits();
        }
    }

    componentDidUpdate(prevProps) {
    }

    getCVEHits = () =>
        this.props.watchRuleHits.filter(h => h.hit_type === 'cve');

    getCVEForHit = (hit) =>
        this.props.cves.find(c => c.cve_id === hit.object_id) || null;

    customFilters = (filtered, filters) => {
        if (filters.severity) {
            filtered = filtered.filter(c => c.severity === filters.severity);
        }
        return filtered;
    };

    hitsCustomFilters = (filtered, filters) => {
        if (filters.severity) {
            const { cves } = this.props;
            filtered = filtered.filter(hit => {
                const cve = cves.find(c => c.cve_id === hit.object_id);
                return cve && cve.severity === filters.severity;
            });
        }
        return filtered;
    };

    renderSeverityBadge = (severity) => {
        if (!severity) return <span className="text-muted">-</span>;
        return <span className={`badge ${SEVERITY_BADGE[severity] || 'bg-secondary'}`}>{severity}</span>;
    };

    openDetailModal = (hit) =>
        this.setState({ selectedHit: hit, showDetailModal: true });

    closeDetailModal = () =>
        this.setState({ selectedHit: null, showDetailModal: false });

    renderDetailModal = () => {
        const { selectedHit, showDetailModal } = this.state;
        if (!selectedHit) return null;
        const cve = this.getCVEForHit(selectedHit);
        return (
            <Modal show={showDetailModal} onHide={this.closeDetailModal} size="lg" centered>
                <Modal.Header closeButton>
                    <Modal.Title>
                        <a
                            href={`https://www.cve.org/CVERecord?id=${selectedHit.object_id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-decoration-none fw-semibold"
                        >
                            {selectedHit.object_id}
                        </a>
                        {cve && (
                            <span className="ms-2">
                                {this.renderSeverityBadge(cve.severity)}
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

                        {cve && (
                            <Fragment>
                                <dt className="col-sm-3">CVSS Score</dt>
                                <dd className="col-sm-9">
                                    {cve.cvss_score != null ? (
                                        <span className="fw-semibold">{cve.cvss_score}</span>
                                    ) : (
                                        <span className="text-muted">-</span>
                                    )}
                                </dd>

                                <dt className="col-sm-3">Published</dt>
                                <dd className="col-sm-9">
                                    {cve.published
                                        ? <DateWithTooltip date={cve.published} includeTime={false} type="created" />
                                        : <span className="text-muted">-</span>}
                                </dd>

                                <dt className="col-sm-3">Information</dt>
                                <dd className="col-sm-9" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                                    {cve.description || <span className="text-muted fst-italic">No information</span>}
                                </dd>

                                {Array.isArray(cve.references) && cve.references.length > 0 && (
                                    <Fragment>
                                        <dt className="col-sm-3">References</dt>
                                        <dd className="col-sm-9">
                                            <ul className="mb-0 ps-3">
                                                {cve.references.slice(0, 5).map((ref, i) => {
                                                    const url = typeof ref === 'object' ? (ref.url || '') : ref;
                                                    if (!url) return null;
                                                    return (
                                                        <li key={i}>
                                                            <a href={url} target="_blank" rel="noopener noreferrer"
                                                                style={{ wordBreak: 'break-all' }}>{url}</a>
                                                        </li>
                                                    );
                                                })}
                                                {cve.references.length > 5 && (
                                                    <li className="text-muted">...and {cve.references.length - 5} more</li>
                                                )}
                                            </ul>
                                        </dd>
                                    </Fragment>
                                )}
                            </Fragment>
                        )}

                        {!cve && (
                            <Fragment>
                                <dt className="col-sm-3">Details</dt>
                                <dd className="col-sm-9 text-muted fst-italic">
                                    CVE details not loaded - switch to "All CVEs" tab to load them.
                                </dd>
                            </Fragment>
                        )}
                    </dl>
                </Modal.Body>
            </Modal>
        );
    };

    render() {
        const { cves, auth } = this.props;
        const { activeTab } = this.state;
        const { isAuthenticated } = auth;
        const cveHits = this.getCVEHits();
        const colCount = 5;

        return (
            <Fragment>
                <h4 className="mb-3">CVE Vulnerabilities</h4>

                <ul className="nav nav-tabs mb-3">
                    <li className="nav-item">
                        <button
                            className={`nav-link ${activeTab === 'hits' ? 'active' : ''}`}
                            onClick={() => this.setState({ activeTab: 'hits' })}
                        >
                            CVE Hits ({cveHits.length})
                        </button>
                    </li>
                    <li className="nav-item">
                        <button
                            className={`nav-link ${activeTab === 'all' ? 'active' : ''}`}
                            onClick={() => this.setState({ activeTab: 'all' })}
                        >
                            All CVEs ({cves.length})
                        </button>
                    </li>
                </ul>

                {activeTab === 'hits' && (
                    <TableManager
                        data={cveHits}
                        filterConfig={HITS_FILTER_CONFIG}
                        searchFields={['object_id', 'matched_keyword', 'rule_name']}
                        dateFields={['hit_at']}
                        defaultSort="hit_at"
                        customFilters={this.hitsCustomFilters}
                        enableDateFilter={true}
                        dateFilterWidth={4}
                        moduleKey="cyberWatch_cveHits"
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
                                                        <th role="button" onClick={() => handleSort('rule_name')}>
                                                            Rule {renderSortIcons('rule_name')}
                                                        </th>
                                                        <th role="button" onClick={() => handleSort('object_id')}>
                                                            CVE ID {renderSortIcons('object_id')}
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
                                                            <td colSpan={colCount} className="text-center text-muted py-4">
                                                                No results found
                                                            </td>
                                                        </tr>
                                                    ) : (
                                                        paginatedData.map(hit => {
                                                            const cve = this.getCVEForHit(hit);
                                                            return (
                                                                <tr
                                                                    key={hit.id}
                                                                >
                                                                    <td className="align-middle fw-semibold">
                                                                        {hit.rule_name || '-'}
                                                                    </td>
                                                                    <td className="align-middle">
                                                                        <a
                                                                            href={`https://www.cve.org/CVERecord?id=${hit.object_id}`}
                                                                            target="_blank"
                                                                            rel="noopener noreferrer"
                                                                            className="fw-semibold text-decoration-none"
                                                                        >
                                                                            {hit.object_id}
                                                                        </a>
                                                                        {cve && (
                                                                            <span className="ms-2">
                                                                                {this.renderSeverityBadge(cve.severity)}
                                                                            </span>
                                                                        )}
                                                                    </td>
                                                                    <td className="align-middle">
                                                                        <Badge bg="secondary">{hit.matched_keyword}</Badge>
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
                )}

                {activeTab === 'all' && (
                    <TableManager
                        data={cves}
                        filterConfig={FILTER_CONFIG}
                        searchFields={['cve_id', 'description']}
                        dateFields={['published']}
                        defaultSort="published"
                        customFilters={this.customFilters}
                        enableDateFilter={true}
                        dateFilterWidth={4}
                        moduleKey="cyberWatch_cveVulnerabilities"
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
                                                        <th role="button" onClick={() => handleSort('cve_id')}>
                                                            CVE ID {renderSortIcons('cve_id')}
                                                        </th>
                                                        <th className="text-center" role="button" onClick={() => handleSort('severity')}>
                                                            Severity {renderSortIcons('severity')}
                                                        </th>
                                                        <th className="text-center" role="button" onClick={() => handleSort('cvss_score')}>
                                                            CVSS {renderSortIcons('cvss_score')}
                                                        </th>
                                                        <th>Information</th>
                                                        <th className="text-center" role="button" onClick={() => handleSort('published')}>
                                                            Published {renderSortIcons('published')}
                                                        </th>
                                                        {isAuthenticated && <th className="text-end">Actions</th>}
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {paginatedData.length === 0 ? (
                                                        <tr>
                                                            <td colSpan={isAuthenticated ? 6 : 5} className="text-center text-muted py-4">
                                                                No results found
                                                            </td>
                                                        </tr>
                                                    ) : (
                                                        paginatedData.map(cve => (
                                                            <tr key={cve.id}>
                                                                <td className="align-middle">
                                                                    <a
                                                                        href={`https://www.cve.org/CVERecord?id=${cve.cve_id}`}
                                                                        target="_blank"
                                                                        rel="noopener noreferrer"
                                                                        className="fw-semibold text-decoration-none"
                                                                    >
                                                                        {cve.cve_id}
                                                                    </a>
                                                                </td>
                                                                <td className="text-center align-middle">
                                                                    {this.renderSeverityBadge(cve.severity)}
                                                                </td>
                                                                <td className="text-center align-middle">
                                                                    {cve.cvss_score != null ? (
                                                                        <span className="fw-semibold">{cve.cvss_score}</span>
                                                                    ) : (
                                                                        <span className="text-muted">-</span>
                                                                    )}
                                                                </td>
                                                                <td className="align-middle" style={{ maxWidth: '380px' }}>
                                                                    {cve.description && cve.description.length > 50 ? (
                                                                        <OverlayTrigger
                                                                            placement="left"
                                                                            delay={{ show: 250, hide: 400 }}
                                                                            overlay={
                                                                                <Tooltip id={`tooltip-desc-${cve.id}`}>
                                                                                    <div style={{ 
                                                                                        textAlign: 'left',
                                                                                        maxWidth: '400px',
                                                                                        whiteSpace: 'pre-wrap',
                                                                                        wordBreak: 'break-word'
                                                                                    }}>
                                                                                        {cve.description}
                                                                                    </div>
                                                                                </Tooltip>
                                                                            }
                                                                        >
                                                                            <div style={{ 
                                                                                display: 'inline-flex', 
                                                                                alignItems: 'center',
                                                                                cursor: 'help',
                                                                                gap: '6px'
                                                                            }}>
                                                                                <span
                                                                                    style={{
                                                                                        maxWidth: 300,
                                                                                        whiteSpace: 'nowrap',
                                                                                        overflow: 'hidden',
                                                                                        textOverflow: 'ellipsis',
                                                                                        borderBottom: '1px dotted currentColor'
                                                                                    }}
                                                                                >
                                                                                    {cve.description}
                                                                                </span>
                                                                                <i 
                                                                                    className="material-icons text-info" 
                                                                                    style={{ 
                                                                                        fontSize: 16,
                                                                                        verticalAlign: 'middle',
                                                                                        flexShrink: 0
                                                                                    }}
                                                                                >
                                                                                    info
                                                                                </i>
                                                                            </div>
                                                                        </OverlayTrigger>
                                                                    ) : (
                                                                        <span className="text-muted fst-italic">
                                                                            {cve.description || 'No information'}
                                                                        </span>
                                                                    )}
                                                                </td>
                                                                <td className="text-center align-middle">
                                                                    {cve.published ? (
                                                                        <DateWithTooltip date={cve.published} includeTime={false} type="created" />
                                                                    ) : (
                                                                        <span className="text-muted">-</span>
                                                                    )}
                                                                </td>
                                                                {isAuthenticated && (
                                                                    <td className="text-end align-middle">
                                                                        <button
                                                                            className="btn btn-outline-warning btn-sm"
                                                                            onClick={() => this.props.archiveCVE(cve.id)}
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
    cves:          state.CyberWatch.cves,
    watchRuleHits: state.CyberWatch.watchRuleHits || [],
    auth:          state.auth,
});

export default connect(mapStateToProps, { getCVEs, getWatchRuleHits, archiveCVE, archiveHit })(CVEVulnerabilities);
