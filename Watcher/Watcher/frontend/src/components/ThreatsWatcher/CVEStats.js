import React, { Component } from 'react';
import { connect } from 'react-redux';
import PropTypes from 'prop-types';
import { Bar, Doughnut, HorizontalBar } from 'react-chartjs-2';
import { getCVEs, getWatchRuleHits } from '../../actions/CyberWatch';

const C = {
    primary: { solid: '#4e73df', faded: 'rgba(78,115,223,0.7)',  hover: 'rgba(78,115,223,1)'  },
    success: { solid: '#1cc88a', faded: 'rgba(28,200,138,0.7)',  hover: 'rgba(28,200,138,1)'  },
    info:    { solid: '#36b9cc', faded: 'rgba(54,185,204,0.7)',  hover: 'rgba(54,185,204,1)'  },
    warning: { solid: '#f6c23e', faded: 'rgba(246,194,62,0.7)',  hover: 'rgba(246,194,62,1)'  },
    danger:  { solid: '#e74a3b', faded: 'rgba(231,74,59,0.7)',   hover: 'rgba(231,74,59,1)'   },
};

const SEVERITY_ORDER   = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'UNKNOWN'];
const SEVERITY_COLORS  = [C.danger, C.warning, C.info, C.success, { faded: 'rgba(150,150,150,0.7)', hover: 'rgba(150,150,150,1)' }];

const InfoTip = ({ text }) => (
    <i className="material-icons text-muted"
       style={{ fontSize: '0.95rem', lineHeight: 1, cursor: 'help', opacity: 0.6 }}
       title={text}>info</i>
);
InfoTip.propTypes = { text: PropTypes.string.isRequired };

const KpiCard = ({ title, value, sub, icon, variant }) => (
    <div className={"card border-0 shadow-sm h-100 bg-" + variant}>
        <div className="card-body d-flex align-items-center p-4">
            <div className="d-flex align-items-center justify-content-center bg-white rounded-circle me-3 flex-shrink-0"
                 style={{ width: 50, height: 50, minWidth: 50, minHeight: 50 }}>
                <i className={"material-icons text-" + variant} style={{ fontSize: 28 }}>{icon}</i>
            </div>
            <div className="flex-fill">
                <div className="text-white-50 text-uppercase fw-bold small mb-1"
                     style={{ fontSize: '0.75rem', letterSpacing: '0.05em' }}>{title}</div>
                <div className="text-white fw-bold h2 mb-1" style={{ fontSize: '2rem', lineHeight: 1 }}>
                    {typeof value === 'number' ? value.toLocaleString() : value}
                </div>
                {sub && <div className="text-white-50 small" style={{ fontSize: '0.8rem' }}>{sub}</div>}
            </div>
        </div>
    </div>
);
KpiCard.propTypes = {
    title: PropTypes.string.isRequired, value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
    sub: PropTypes.string, icon: PropTypes.string.isRequired, variant: PropTypes.string.isRequired,
};

const EmptyState = ({ icon, label }) => (
    <div className="d-flex flex-column align-items-center justify-content-center py-5 text-muted">
        <i className="material-icons mb-2" style={{ fontSize: 40, opacity: 0.2 }}>{icon}</i>
        <small>{label}</small>
    </div>
);

const doughnutOptions = {
    maintainAspectRatio: false,
    legend: { display: true, position: 'bottom', labels: { fontColor: '#858796', padding: 14, boxWidth: 12 } },
    tooltips: { bodyFontColor: '#fff', backgroundColor: 'rgba(0,0,0,0.8)' },
    cutoutPercentage: 72,
};

const barOptions = {
    maintainAspectRatio: false,
    legend: { display: false },
    tooltips: { mode: 'index', intersect: false, bodyFontColor: '#fff', backgroundColor: 'rgba(0,0,0,0.8)' },
    scales: {
        xAxes: [{ ticks: { fontColor: '#858796' }, gridLines: { display: false } }],
        yAxes: [{ ticks: { beginAtZero: true, precision: 0, fontColor: '#858796' },
                  gridLines: { color: 'rgba(100,100,120,0.15)', drawBorder: false } }],
    },
};

const hbarOptions = {
    maintainAspectRatio: false,
    legend: { display: false },
    tooltips: { mode: 'index', intersect: false, bodyFontColor: '#fff', backgroundColor: 'rgba(0,0,0,0.8)' },
    scales: {
        xAxes: [{ ticks: { beginAtZero: true, precision: 0, fontColor: '#858796' },
                  gridLines: { color: 'rgba(100,100,120,0.15)', drawBorder: false } }],
        yAxes: [{ gridLines: { display: false }, ticks: { fontColor: '#858796', fontSize: 11 } }],
    },
};

const CVSS_RANGES = [
    { label: '0 – 3.9',  min: 0,   max: 3.9  },
    { label: '4 – 6.9',  min: 4,   max: 6.9  },
    { label: '7 – 8.9',  min: 7,   max: 8.9  },
    { label: '9 – 10',   min: 9,   max: 10   },
];
const RANGE_COLORS = [C.success, C.warning, C.danger, { faded: 'rgba(100,0,0,0.7)', hover: 'rgba(100,0,0,1)' }];

class CVEStats extends Component {
    static propTypes = {
        cves:             PropTypes.array.isRequired,
        watchRuleHits:    PropTypes.array.isRequired,
        getCVEs:          PropTypes.func.isRequired,
        getWatchRuleHits: PropTypes.func.isRequired,
    };

    componentDidMount() {
        this.props.getCVEs();
        this.props.getWatchRuleHits();
    }

    render() {
        const { cves, watchRuleHits } = this.props;

        const cveHits    = watchRuleHits.filter(h => h.hit_type === 'cve');
        const critical   = cves.filter(c => (c.severity || '').toUpperCase() === 'CRITICAL').length;
        const high       = cves.filter(c => (c.severity || '').toUpperCase() === 'HIGH').length;

        // Severity doughnut
        const severityData = SEVERITY_ORDER.map(s =>
            cves.filter(c => (c.severity || 'UNKNOWN').toUpperCase() === s).length
        );
        const severityNonZero = SEVERITY_ORDER.map((s, i) => ({ s, count: severityData[i], color: SEVERITY_COLORS[i] }))
            .filter(x => x.count > 0);

        const severityChartData = {
            labels: severityNonZero.map(x => x.s),
            datasets: [{
                data: severityNonZero.map(x => x.count),
                backgroundColor: severityNonZero.map(x => x.color.faded),
                hoverBackgroundColor: severityNonZero.map(x => x.color.hover),
                borderWidth: 2,
            }],
        };

        const cvssWithScore = cves.filter(c => c.cvss_score != null);
        const cvssRangeCounts = CVSS_RANGES.map(r =>
            cvssWithScore.filter(c => c.cvss_score >= r.min && c.cvss_score <= r.max).length
        );
        const cvssChartData = {
            labels: CVSS_RANGES.map(r => r.label),
            datasets: [{
                label: 'CVEs',
                data: cvssRangeCounts,
                backgroundColor: RANGE_COLORS.map(c => c.faded),
                hoverBackgroundColor: RANGE_COLORS.map(c => c.hover),
                borderWidth: 0,
            }],
        };

        const kwCounts = {};
        cveHits.forEach(h => {
            const kw = h.matched_keyword || 'Unknown';
            kwCounts[kw] = (kwCounts[kw] || 0) + 1;
        });
        const topKw = Object.entries(kwCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);
        const TOP_COLORS = [C.primary, C.success, C.info, C.warning, C.danger];
        const kwChartData = {
            labels: topKw.map(([k]) => k),
            datasets: [{
                label: 'Hits',
                data: topKw.map(([, v]) => v),
                backgroundColor: TOP_COLORS.map(c => c.faded),
                hoverBackgroundColor: TOP_COLORS.map(c => c.hover),
                borderWidth: 0,
            }],
        };

        return (
            <div>
                {/* KPI Cards */}
                <div className="row mb-4">
                    <div className="col-xl-3 col-md-6 mb-4">
                        <KpiCard title="Total CVEs" value={cves.length}
                                 sub="all tracked vulnerabilities" icon="security" variant="primary" />
                    </div>
                    <div className="col-xl-3 col-md-6 mb-4">
                        <KpiCard title="Watch Rule Hits" value={cveHits.length}
                                 sub="matches on your rules" icon="notifications_active" variant="danger" />
                    </div>
                    <div className="col-xl-3 col-md-6 mb-4">
                        <KpiCard title="Critical" value={critical}
                                 sub="CVSS critical severity" icon="warning" variant="danger" />
                    </div>
                    <div className="col-xl-3 col-md-6 mb-4">
                        <KpiCard title="High" value={high}
                                 sub="CVSS high severity" icon="report_problem" variant="warning" />
                    </div>
                </div>

                {/* Charts */}
                <div className="row">
                    <div className="col-xl-4 col-lg-6 mb-4">
                        <div className="card shadow h-100">
                            <div className="card-header py-3 d-flex align-items-center justify-content-between">
                                <h6 className="m-0 font-weight-bold text-body d-flex align-items-center gap-2">
                                    Severity Breakdown
                                    <InfoTip text="Distribution of CVEs across CRITICAL / HIGH / MEDIUM / LOW severity levels as reported by NVD." />
                                </h6>
                            </div>
                            <div className="card-body d-flex align-items-center justify-content-center">
                                {severityNonZero.length > 0
                                    ? <div style={{ height: 230, width: '100%' }}><Doughnut data={severityChartData} options={doughnutOptions} /></div>
                                    : <EmptyState icon="donut_large" label="No CVE data yet" />}
                            </div>
                        </div>
                    </div>

                    <div className="col-xl-4 col-lg-6 mb-4">
                        <div className="card shadow h-100">
                            <div className="card-header py-3 d-flex align-items-center justify-content-between">
                                <h6 className="m-0 font-weight-bold text-body d-flex align-items-center gap-2">
                                    CVSS Score Distribution
                                    <InfoTip text="Number of CVEs per CVSS score range: Low (0-3.9), Medium (4-6.9), High (7-8.9), Critical (9-10)." />
                                </h6>
                                <span className="badge badge-secondary badge-pill">{cvssWithScore.length} scored</span>
                            </div>
                            <div className="card-body">
                                {cvssWithScore.length > 0
                                    ? <div style={{ height: 200 }}><Bar data={cvssChartData} options={barOptions} /></div>
                                    : <EmptyState icon="bar_chart" label="No CVSS scores available" />}
                            </div>
                        </div>
                    </div>

                    <div className="col-xl-4 col-lg-12 mb-4">
                        <div className="card shadow h-100">
                            <div className="card-header py-3 d-flex align-items-center justify-content-between">
                                <h6 className="m-0 font-weight-bold text-body d-flex align-items-center gap-2">
                                    Top 5 Matched Keywords
                                    <InfoTip text="The 5 keywords from your watch rules that triggered the most CVE hits." />
                                </h6>
                                <span className="badge badge-danger badge-pill">{cveHits.length} hits</span>
                            </div>
                            <div className="card-body">
                                {topKw.length > 0
                                    ? <div style={{ height: 200 }}><HorizontalBar data={kwChartData} options={hbarOptions} /></div>
                                    : <EmptyState icon="label_off" label="No watch rule hits yet" />}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }
}

const mapStateToProps = state => ({
    cves:          state.CyberWatch.cves          || [],
    watchRuleHits: state.CyberWatch.watchRuleHits || [],
});

export default connect(mapStateToProps, { getCVEs, getWatchRuleHits })(CVEStats);
