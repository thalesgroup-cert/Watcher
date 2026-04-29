import React, { Component } from 'react';
import { connect } from 'react-redux';
import PropTypes from 'prop-types';
import { Bar, HorizontalBar, Doughnut } from 'react-chartjs-2';
import { getSiteStatistics, getSites, getSiteAlerts } from '../../actions/SiteMonitoring';

const C = {
    primary: { solid: '#4e73df', faded: 'rgba(78,115,223,0.7)',  hover: 'rgba(78,115,223,1)'  },
    success: { solid: '#1cc88a', faded: 'rgba(28,200,138,0.7)',  hover: 'rgba(28,200,138,1)'  },
    info:    { solid: '#36b9cc', faded: 'rgba(54,185,204,0.7)',  hover: 'rgba(54,185,204,1)'  },
    warning: { solid: '#f6c23e', faded: 'rgba(246,194,62,0.7)',  hover: 'rgba(246,194,62,1)'  },
    danger:  { solid: '#e74a3b', faded: 'rgba(231,74,59,0.7)',   hover: 'rgba(231,74,59,1)'   },
};

const TOP_COLORS = [C.danger, C.primary, C.warning, C.info, C.success,
    { faded: 'rgba(133,103,196,0.7)', hover: 'rgba(133,103,196,1)' },
    { faded: 'rgba(150,150,150,0.7)', hover: 'rgba(150,150,150,1)' }];

const LEGIT_LABELS = [
    'Unknown',
    'Suspicious, not harmful',
    'Suspicious, likely harmful (reg.)',
    'Suspicious, likely harmful (avail.)',
    'Malicious (registered)',
    'Malicious (avail./disabled)',
];
const LEGIT_COLORS = [C.info, C.warning, C.warning, C.danger, C.danger, C.primary];

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
                <i className={"material-icons text-" + variant}
                   style={{ fontSize: 28, lineHeight: 1, display: 'block' }}>{icon}</i>
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
    sub: PropTypes.string,
    icon: PropTypes.string.isRequired,
    variant: PropTypes.string.isRequired,
};

const EmptyState = ({ icon, label }) => (
    <div className="d-flex flex-column align-items-center justify-content-center py-5 text-muted">
        <i className="material-icons mb-2" style={{ fontSize: 40, opacity: 0.2 }}>{icon}</i>
        <small>{label}</small>
    </div>
);

function last14DayLabels() {
    const labels = [];
    for (let i = 13; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        labels.push(d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }));
    }
    return labels;
}

function dayKey(dateStr) {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

function topN(items, keyFn, n = 7) {
    const counts = {};
    items.forEach(item => {
        const k = keyFn(item);
        if (k) counts[k] = (counts[k] || 0) + 1;
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, n);
}

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

const barOptions = {
    maintainAspectRatio: false,
    legend: { display: false },
    tooltips: { mode: 'index', intersect: false, bodyFontColor: '#fff', backgroundColor: 'rgba(0,0,0,0.8)' },
    scales: {
        xAxes: [{ gridLines: { display: false }, ticks: { fontColor: '#858796', fontSize: 10, maxRotation: 45 } }],
        yAxes: [{ ticks: { beginAtZero: true, precision: 0, fontColor: '#858796' },
                  gridLines: { color: 'rgba(100,100,120,0.15)', drawBorder: false } }],
    },
};

const doughnutOptions = {
    maintainAspectRatio: false,
    legend: { display: true, position: 'bottom', labels: { fontColor: '#858796', padding: 12, boxWidth: 11, fontSize: 10 } },
    tooltips: { bodyFontColor: '#fff', backgroundColor: 'rgba(0,0,0,0.8)' },
    cutoutPercentage: 72,
};

class SiteStats extends Component {
    static propTypes = {
        statistics:        PropTypes.object.isRequired,
        sites:             PropTypes.array.isRequired,
        alerts:            PropTypes.array.isRequired,
        getSiteStatistics: PropTypes.func.isRequired,
        getSites:          PropTypes.func.isRequired,
        getSiteAlerts:     PropTypes.func.isRequired,
    };

    componentDidMount() {
        this.props.getSiteStatistics();
        this.props.getSites();
        this.props.getSiteAlerts();
    }

    render() {
        const { statistics, sites, alerts } = this.props;

        const activeAlerts  = alerts.filter(a => a.status).length;
        const dayLabels     = last14DayLabels();
        const dayCounts     = dayLabels.map(d => alerts.filter(a => dayKey(a.created_at) === d).length);

        const topTypes      = topN(alerts, a => a.type || null);
        const typeLabels    = topTypes.map(([k]) => k);
        const typeVals      = topTypes.map(([, v]) => v);

        const legitBuckets  = [0, 0, 0, 0, 0, 0];
        sites.forEach(s => { if (s.legitimacy >= 1 && s.legitimacy <= 6) legitBuckets[s.legitimacy - 1]++; });
        const nonZeroLegit  = LEGIT_LABELS.map((l, i) => ({ l, v: legitBuckets[i], c: LEGIT_COLORS[i] })).filter(x => x.v > 0);

        const timelineData = {
            labels: dayLabels,
            datasets: [{
                label: 'Alerts',
                data: dayCounts,
                backgroundColor: C.warning.faded,
                hoverBackgroundColor: C.warning.hover,
                borderWidth: 0,
            }],
        };

        const typeChartData = {
            labels: typeLabels,
            datasets: [{
                label: 'Alerts',
                data: typeVals,
                backgroundColor: TOP_COLORS.map(c => c.faded),
                hoverBackgroundColor: TOP_COLORS.map(c => c.hover),
                borderWidth: 0,
            }],
        };

        const legitChartData = {
            labels: nonZeroLegit.map(x => x.l),
            datasets: [{
                data: nonZeroLegit.map(x => x.v),
                backgroundColor: nonZeroLegit.map(x => x.c.faded),
                hoverBackgroundColor: nonZeroLegit.map(x => x.c.hover),
                borderWidth: 2,
            }],
        };

        return (
            <div>
                <div className="row mb-4">
                    <div className="col-xl-3 col-md-6 mb-4">
                        <KpiCard title="TOTAL SITES" value={statistics.total ?? 0}
                                 sub="suspicious websites tracked" icon="link" variant="primary" />
                    </div>
                    <div className="col-xl-3 col-md-6 mb-4">
                        <KpiCard title="MALICIOUS" value={statistics.malicious ?? 0}
                                 sub="confirmed malicious" icon="dangerous" variant="danger" />
                    </div>
                    <div className="col-xl-3 col-md-6 mb-4">
                        <KpiCard title="TAKEDOWN REQUESTS" value={statistics.takedownRequests ?? 0}
                                 sub="sites under takedown" icon="block" variant="warning" />
                    </div>
                    <div className="col-xl-3 col-md-6 mb-4">
                        <KpiCard title="LEGAL TEAM" value={statistics.legalTeam ?? 0}
                                 sub="legal team involvement" icon="gavel" variant="success" />
                    </div>
                </div>

                <div className="row">
                    <div className="col-xl-6 col-lg-12 mb-4">
                        <div className="card shadow h-100">
                            <div className="card-header py-3 d-flex align-items-center justify-content-between">
                                <h6 className="m-0 font-weight-bold text-body d-flex align-items-center gap-2">
                                    Alert Activity - Last 14 Days
                                    <InfoTip text="Number of website monitoring alerts triggered per day over the past two weeks." />
                                </h6>
                                <span className="badge badge-warning badge-pill">{alerts.length} total</span>
                            </div>
                            <div className="card-body">
                                {alerts.length > 0
                                    ? <div style={{ height: 200 }}><Bar data={timelineData} options={barOptions} /></div>
                                    : <EmptyState icon="show_chart" label="No alert data yet" />}
                            </div>
                        </div>
                    </div>

                    <div className="col-xl-3 col-lg-6 mb-4">
                        <div className="card shadow h-100">
                            <div className="card-header py-3 d-flex align-items-center justify-content-between">
                                <h6 className="m-0 font-weight-bold text-body d-flex align-items-center gap-2">
                                    Alert Types
                                    <InfoTip text="Most frequent change types triggering alerts (IP change, MX change, content diff, etc.)." />
                                </h6>
                            </div>
                            <div className="card-body">
                                {typeLabels.length > 0
                                    ? <div style={{ height: 200 }}><HorizontalBar data={typeChartData} options={hbarOptions} /></div>
                                    : <EmptyState icon="category" label="No alert types yet" />}
                            </div>
                        </div>
                    </div>

                    <div className="col-xl-3 col-lg-6 mb-4">
                        <div className="card shadow h-100">
                            <div className="card-header py-3">
                                <h6 className="m-0 font-weight-bold text-body d-flex align-items-center gap-2">
                                    Legitimacy Breakdown
                                    <InfoTip text="Distribution of tracked sites by their assigned threat legitimacy level." />
                                </h6>
                            </div>
                            <div className="card-body d-flex align-items-center justify-content-center">
                                {nonZeroLegit.length > 0
                                    ? <div style={{ height: 200, width: '100%' }}><Doughnut data={legitChartData} options={doughnutOptions} /></div>
                                    : <EmptyState icon="donut_large" label="No legitimacy data yet" />}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }
}

const mapStateToProps = state => ({
    statistics: state.SiteMonitoring.statistics || {},
    sites:      state.SiteMonitoring.sites      || [],
    alerts:     state.SiteMonitoring.alerts     || [],
});

export default connect(mapStateToProps, { getSiteStatistics, getSites, getSiteAlerts })(SiteStats);