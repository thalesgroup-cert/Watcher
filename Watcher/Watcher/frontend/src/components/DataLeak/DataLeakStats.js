import React, { Component } from 'react';
import { connect } from 'react-redux';
import PropTypes from 'prop-types';
import { Bar, HorizontalBar, Doughnut } from 'react-chartjs-2';
import { getDataLeakStatistics, getAlerts, getKeyWords } from '../../actions/DataLeak';

const C = {
    primary: { solid: '#4e73df', faded: 'rgba(78,115,223,0.7)',  hover: 'rgba(78,115,223,1)'  },
    success: { solid: '#1cc88a', faded: 'rgba(28,200,138,0.7)',  hover: 'rgba(28,200,138,1)'  },
    info:    { solid: '#36b9cc', faded: 'rgba(54,185,204,0.7)',  hover: 'rgba(54,185,204,1)'  },
    warning: { solid: '#f6c23e', faded: 'rgba(246,194,62,0.7)',  hover: 'rgba(246,194,62,1)'  },
    danger:  { solid: '#e74a3b', faded: 'rgba(231,74,59,0.7)',   hover: 'rgba(231,74,59,1)'   },
};

const TOP_COLORS = [C.primary, C.success, C.info, C.warning, C.danger];

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
    legend: { display: true, position: 'bottom', labels: { fontColor: '#858796', padding: 14, boxWidth: 12 } },
    tooltips: { bodyFontColor: '#fff', backgroundColor: 'rgba(0,0,0,0.8)' },
    cutoutPercentage: 72,
};

class DataLeakStats extends Component {
    static propTypes = {
        statistics:            PropTypes.object.isRequired,
        alerts:                PropTypes.array.isRequired,
        keywords:              PropTypes.array.isRequired,
        getDataLeakStatistics: PropTypes.func.isRequired,
        getAlerts:             PropTypes.func.isRequired,
        getKeyWords:           PropTypes.func.isRequired,
    };

    componentDidMount() {
        this.props.getDataLeakStatistics();
        this.props.getAlerts();
        this.props.getKeyWords();
    }

    render() {
        const { statistics, alerts, keywords } = this.props;

        const dayLabels     = last14DayLabels();
        const dayCounts     = dayLabels.map(d => alerts.filter(a => dayKey(a.created_at) === d).length);
        const activeCount   = alerts.filter(a => a.status).length;
        const archivedCount = alerts.filter(a => !a.status).length;

        const topKeywords      = topN(alerts, a => a.keyword && a.keyword.name ? a.keyword.name : null);
        const topKeywordLabels = topKeywords.map(([k]) => k);
        const topKeywordVals   = topKeywords.map(([, v]) => v);

        const timelineData = {
            labels: dayLabels,
            datasets: [{
                label: 'Alerts',
                data: dayCounts,
                backgroundColor: C.danger.faded,
                hoverBackgroundColor: C.danger.hover,
                borderWidth: 0,
            }],
        };

        const keywordChartData = {
            labels: topKeywordLabels,
            datasets: [{
                label: 'Alerts',
                data: topKeywordVals,
                backgroundColor: TOP_COLORS.map(c => c.faded),
                hoverBackgroundColor: TOP_COLORS.map(c => c.hover),
                borderWidth: 0,
            }],
        };

        const statusChartData = {
            labels: ['Active', 'Archived'],
            datasets: [{
                data: [activeCount, archivedCount],
                backgroundColor: [C.danger.faded, C.success.faded],
                hoverBackgroundColor: [C.danger.hover, C.success.hover],
                borderWidth: 2,
            }],
        };

        return (
            <div>
                <div className="row mb-4">
                    <div className="col-xl-3 col-md-6 mb-4">
                        <KpiCard title="Total Alerts" value={statistics.totalAlerts ?? 0}
                                 sub="all detected leaks" icon="notifications" variant="primary" />
                    </div>
                    <div className="col-xl-3 col-md-6 mb-4">
                        <KpiCard title="Active Alerts" value={statistics.activeAlerts ?? 0}
                                 sub="currently unresolved" icon="warning" variant="danger" />
                    </div>
                    <div className="col-xl-3 col-md-6 mb-4">
                        <KpiCard title="New This Week" value={statistics.newThisWeek ?? 0}
                                 sub="last 7 days" icon="today" variant="warning" />
                    </div>
                    <div className="col-xl-3 col-md-6 mb-4">
                        <KpiCard title="Keywords" value={keywords.length}
                                 sub="search patterns monitored" icon="search" variant="info" />
                    </div>
                </div>

                <div className="row">
                    <div className="col-xl-6 col-lg-12 mb-4">
                        <div className="card shadow h-100">
                            <div className="card-header py-3 d-flex align-items-center justify-content-between">
                                <h6 className="m-0 font-weight-bold text-body d-flex align-items-center gap-2">
                                    Alert Activity - Last 14 Days
                                    <InfoTip text="Number of data leak alerts detected per day over the past two weeks." />
                                </h6>
                                <span className="badge badge-danger badge-pill">{alerts.length} total</span>
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
                                    Top Keywords
                                    <InfoTip text="The most frequently triggered search keywords ranked by number of alerts." />
                                </h6>
                                <span className="badge badge-primary badge-pill">{keywords.length} patterns</span>
                            </div>
                            <div className="card-body">
                                {topKeywordLabels.length > 0
                                    ? <div style={{ height: 200 }}><HorizontalBar data={keywordChartData} options={hbarOptions} /></div>
                                    : <EmptyState icon="search" label="No keyword matches yet" />}
                            </div>
                        </div>
                    </div>

                    <div className="col-xl-3 col-lg-6 mb-4">
                        <div className="card shadow h-100">
                            <div className="card-header py-3">
                                <h6 className="m-0 font-weight-bold text-body d-flex align-items-center gap-2">
                                    Alert Status
                                    <InfoTip text="Proportion of active (unresolved) alerts versus archived (resolved) ones." />
                                </h6>
                            </div>
                            <div className="card-body d-flex align-items-center justify-content-center">
                                {alerts.length > 0
                                    ? <div style={{ height: 200, width: '100%' }}><Doughnut data={statusChartData} options={doughnutOptions} /></div>
                                    : <EmptyState icon="donut_large" label="No alert data yet" />}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }
}

const mapStateToProps = state => ({
    statistics: state.DataLeak.statistics || {},
    alerts:     state.DataLeak.alerts     || [],
    keywords:   state.DataLeak.keywords   || [],
});

export default connect(mapStateToProps, { getDataLeakStatistics, getAlerts, getKeyWords })(DataLeakStats);
