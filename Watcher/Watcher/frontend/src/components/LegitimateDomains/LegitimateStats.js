import React, { Component } from 'react';
import { connect } from 'react-redux';
import PropTypes from 'prop-types';
import { Bar, HorizontalBar, Doughnut } from 'react-chartjs-2';

function last12MonthLabels() {
    const labels = [];
    const now = new Date();
    for (let i = 11; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        labels.push(d.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' }));
    }
    return labels;
}

function monthKey(dateStr) {
    if (!dateStr) return null;
    const d = new Date(dateStr);
    if (isNaN(d)) return null;
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}

function bucketByMonth(domains, fieldFn) {
    const now = new Date();
    const buckets = {};
    for (let i = 11; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const k = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
        buckets[k] = 0;
    }
    domains.forEach(dom => {
        const k = monthKey(fieldFn(dom));
        if (k && k in buckets) buckets[k]++;
    });
    return Object.values(buckets);
}
import { getLegitimateDomainStatistics, getLegitimateDomains } from '../../actions/LegitimateDomain';

const C = {
    primary: { solid: '#4e73df', faded: 'rgba(78,115,223,0.7)',  hover: 'rgba(78,115,223,1)'  },
    success: { solid: '#1cc88a', faded: 'rgba(28,200,138,0.7)',  hover: 'rgba(28,200,138,1)'  },
    info:    { solid: '#36b9cc', faded: 'rgba(54,185,204,0.7)',  hover: 'rgba(54,185,204,1)'  },
    warning: { solid: '#f6c23e', faded: 'rgba(246,194,62,0.7)',  hover: 'rgba(246,194,62,1)'  },
    danger:  { solid: '#e74a3b', faded: 'rgba(231,74,59,0.7)',   hover: 'rgba(231,74,59,1)'   },
};

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
    title: PropTypes.string.isRequired,
    value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
    sub: PropTypes.string, icon: PropTypes.string.isRequired, variant: PropTypes.string.isRequired,
};

const EmptyState = ({ icon, label }) => (
    <div className="d-flex flex-column align-items-center justify-content-center py-5 text-muted">
        <i className="material-icons mb-2" style={{ fontSize: 40, opacity: 0.2 }}>{icon}</i>
        <small>{label}</small>
    </div>
);

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

const doughnutOptions = {
    maintainAspectRatio: false,
    legend: { display: true, position: 'bottom', labels: { fontColor: '#858796', padding: 14, boxWidth: 12 } },
    tooltips: { bodyFontColor: '#fff', backgroundColor: 'rgba(0,0,0,0.8)' },
    cutoutPercentage: 72,
};

function topN(items, keyFn, n = 5) {
    const counts = {};
    items.forEach(item => {
        const k = keyFn(item);
        if (k) counts[k] = (counts[k] || 0) + 1;
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, n);
}

function dateToYMD(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

class LegitimateStats extends Component {
    static propTypes = {
        statistics:                    PropTypes.object.isRequired,
        domains:                       PropTypes.array.isRequired,
        getLegitimateDomainStatistics: PropTypes.func.isRequired,
        getLegitimateDomains:          PropTypes.func.isRequired,
    };

    componentDidMount() {
        this.props.getLegitimateDomainStatistics();
        this.props.getLegitimateDomains();
    }

    render() {
        const { statistics, domains } = this.props;

        const today = new Date();
        const monthLabels     = last12MonthLabels();
        const registeredCounts = bucketByMonth(domains, d => d.domain_created_at);
        const addedCounts      = bucketByMonth(domains, d => d.created_at);
        const expiringCounts   = bucketByMonth(domains, d => d.expiry);
        const hasLifecycleData = [...registeredCounts, ...addedCounts, ...expiringCounts].some(v => v > 0);
        const lifecycleChartData = {
            labels: monthLabels,
            datasets: [
                { label: 'Registered',       data: registeredCounts, backgroundColor: C.info.faded,    hoverBackgroundColor: C.info.hover,    borderWidth: 0, barPercentage: 0.7, categoryPercentage: 0.85 },
                { label: 'Added to Watcher', data: addedCounts,      backgroundColor: C.primary.faded, hoverBackgroundColor: C.primary.hover, borderWidth: 0, barPercentage: 0.7, categoryPercentage: 0.85 },
                { label: 'Expiring',         data: expiringCounts,   backgroundColor: C.warning.faded, hoverBackgroundColor: C.warning.hover, borderWidth: 0, barPercentage: 0.7, categoryPercentage: 0.85 },
            ],
        };
        const lifecycleOptions = {
            maintainAspectRatio: false,
            legend: { display: true, position: 'bottom', labels: { fontColor: '#858796', padding: 12, boxWidth: 12, fontSize: 11 } },
            tooltips: { mode: 'index', intersect: false, bodyFontColor: '#fff', backgroundColor: 'rgba(0,0,0,0.8)' },
            scales: {
                xAxes: [{ ticks: { fontColor: '#858796', fontSize: 10 }, gridLines: { display: false } }],
                yAxes: [{ ticks: { beginAtZero: true, precision: 0, fontColor: '#858796' }, gridLines: { color: 'rgba(100,100,120,0.12)', drawBorder: false } }],
            },
        };

        const topTLDs = topN(domains, d => {
            const parts = (d.domain_name || '').split('.');
            return parts.length >= 2 ? '.' + parts[parts.length - 1] : null;
        });
        const TOP_COLORS = [C.primary, C.success, C.info, C.warning, C.danger];
        const tldChartData = {
            labels: topTLDs.map(([k]) => k),
            datasets: [{ label: 'Domains', data: topTLDs.map(([, v]) => v),
                backgroundColor: TOP_COLORS.map(c => c.faded),
                hoverBackgroundColor: TOP_COLORS.map(c => c.hover), borderWidth: 0 }],
        };

        const todayYMD = dateToYMD(today);
        const soonYMD  = dateToYMD(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 30));
        let countRepurchased = 0, countExpired = 0, countExpiringSoon = 0, countActive = 0;
        domains.forEach(d => {
            if (d.repurchased) { countRepurchased++; return; }
            const exp = d.expiry;
            if (exp && exp < todayYMD) { countExpired++; return; }
            if (exp && exp >= todayYMD && exp <= soonYMD) { countExpiringSoon++; return; }
            countActive++;
        });
        const statusData = [
            { label: 'Active',        count: countActive,       color: C.success },
            { label: 'Repurchased',   count: countRepurchased,  color: C.primary },
            { label: 'Expiring Soon', count: countExpiringSoon, color: C.warning },
            { label: 'Expired',       count: countExpired,      color: C.danger  },
        ].filter(x => x.count > 0);
        const statusChartData = {
            labels: statusData.map(x => x.label),
            datasets: [{ data: statusData.map(x => x.count),
                backgroundColor: statusData.map(x => x.color.faded),
                hoverBackgroundColor: statusData.map(x => x.color.hover), borderWidth: 2 }],
        };

        return (
            <div>
                {/* KPI Cards */}
                <div className="row mb-4">
                    <div className="col-xl-3 col-md-6 mb-4">
                        <KpiCard title="TOTAL DOMAINS" value={statistics.total || 0}
                                 sub="all tracked domains" icon="link" variant="primary" />
                    </div>
                    <div className="col-xl-3 col-md-6 mb-4">
                        <KpiCard title="REPURCHASED" value={statistics.repurchased || 0}
                                 sub="successfully reclaimed" icon="check_circle" variant="success" />
                    </div>
                    <div className="col-xl-3 col-md-6 mb-4">
                        <KpiCard title="EXPIRED" value={statistics.expired || 0}
                                 sub="past expiry, not renewed" icon="error" variant="danger" />
                    </div>
                    <div className="col-xl-3 col-md-6 mb-4">
                        <KpiCard title="EXPIRING SOON" value={statistics.expiringSoon || 0}
                                 sub="within the next 30 days" icon="warning" variant="warning" />
                    </div>
                </div>

                {/* Charts */}
                <div className="row">
                    <div className="col-xl-4 col-lg-6 mb-4">
                        <div className="card shadow h-100">
                            <div className="card-header py-3 d-flex align-items-center justify-content-between">
                                <h6 className="m-0 font-weight-bold text-body d-flex align-items-center gap-2">
                                    Domain Lifecycle
                                    <InfoTip text="Monthly breakdown over 12 months: when domains were originally registered, added to Watcher, and when they expire." />
                                </h6>
                            </div>
                            <div className="card-body">
                                {hasLifecycleData
                                    ? <div style={{ height: 200 }}><Bar data={lifecycleChartData} options={lifecycleOptions} /></div>
                                    : <EmptyState icon="date_range" label="No lifecycle data yet" />}
                            </div>
                        </div>
                    </div>

                    <div className="col-xl-4 col-lg-6 mb-4">
                        <div className="card shadow h-100">
                            <div className="card-header py-3 d-flex align-items-center justify-content-between">
                                <h6 className="m-0 font-weight-bold text-body d-flex align-items-center gap-2">
                                    Top 5 TLDs
                                    <InfoTip text="The 5 most common top-level domains (e.g. .com, .fr) among all tracked domains." />
                                </h6>
                                <span className="badge badge-primary badge-pill">{topTLDs.length} TLDs</span>
                            </div>
                            <div className="card-body">
                                {topTLDs.length > 0
                                    ? <div style={{ height: 200 }}><HorizontalBar data={tldChartData} options={hbarOptions} /></div>
                                    : <EmptyState icon="public" label="No domain data yet" />}
                            </div>
                        </div>
                    </div>

                    <div className="col-xl-4 col-lg-12 mb-4">
                        <div className="card shadow h-100">
                            <div className="card-header py-3 d-flex align-items-center justify-content-between">
                                <h6 className="m-0 font-weight-bold text-body d-flex align-items-center gap-2">
                                    Domain Status
                                    <InfoTip text="Current status breakdown: Active (valid), Repurchased, Expiring Soon (within 30 days), or Expired." />
                                </h6>
                            </div>
                            <div className="card-body d-flex align-items-center justify-content-center">
                                {statusData.length > 0
                                    ? <div style={{ height: 230, width: '100%' }}><Doughnut data={statusChartData} options={doughnutOptions} /></div>
                                    : <EmptyState icon="donut_large" label="No domain data yet" />}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }
}

const mapStateToProps = state => ({
    statistics: state.LegitimateDomain.statistics || {},
    domains:    state.LegitimateDomain.domains    || [],
});

export default connect(mapStateToProps, { getLegitimateDomainStatistics, getLegitimateDomains })(LegitimateStats);