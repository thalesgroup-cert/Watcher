import React, { Component } from 'react';
import { connect } from 'react-redux';
import PropTypes from 'prop-types';
import { Bar, HorizontalBar, Doughnut } from 'react-chartjs-2';
import { getDnsFinderStatistics, getAllThreatsMonitored, getAllDnsMonitored, getAllKeywordMonitored } from '../../actions/DnsFinder';

const C = {
    primary: { solid: '#4e73df', faded: 'rgba(78,115,223,0.7)',  hover: 'rgba(78,115,223,1)'  },
    success: { solid: '#1cc88a', faded: 'rgba(28,200,138,0.7)',  hover: 'rgba(28,200,138,1)'  },
    info:    { solid: '#36b9cc', faded: 'rgba(54,185,204,0.7)',  hover: 'rgba(54,185,204,1)'  },
    warning: { solid: '#f6c23e', faded: 'rgba(246,194,62,0.7)',  hover: 'rgba(246,194,62,1)'  },
    danger:  { solid: '#e74a3b', faded: 'rgba(231,74,59,0.7)',   hover: 'rgba(231,74,59,1)'   },
    secondary: { solid: '#858796', faded: 'rgba(133,135,150,0.7)', hover: 'rgba(133,135,150,1)' },
    dark:    { solid: '#5a5c69', faded: 'rgba(90,92,105,0.7)',   hover: 'rgba(90,92,105,1)'   },
};

const TOP_COLORS = [C.primary, C.info, C.success, C.warning, C.danger,
    { faded: 'rgba(133,103,196,0.7)', hover: 'rgba(133,103,196,1)' },
    { faded: 'rgba(150,150,150,0.7)', hover: 'rgba(150,150,150,1)' }];

const SOURCE_LABELS = {
    dnstwist: 'Dnstwist Algorithm',
    certstream_keyword: 'Certificate Transparency Stream',
    subdomain_takeover: 'Subdomain Takeover Detection',
};
const SOURCE_COLORS = { dnstwist: C.primary, certstream_keyword: C.info, subdomain_takeover: C.danger };

const STATUS_LABELS = {
    pending: 'Pending', suspected: 'Suspected', confirmed: 'Confirmed',
    resolved: 'Resolved', false_positive: 'False Positive',
};
const STATUS_COLORS = {
    pending: C.secondary, suspected: C.warning, confirmed: C.danger,
    resolved: C.success, false_positive: C.dark,
};

const InfoTip = ({ text }) => (
    <i className="material-icons text-muted"
       style={{ fontSize: '0.95rem', lineHeight: 1, cursor: 'help', opacity: 0.6 }}
       title={text}>info</i>
);
InfoTip.propTypes = { text: PropTypes.string.isRequired };

const KpiCard = ({ title, value, sub, icon, variant }) => (
    <div className={"card border-0 shadow-sm h-100 bg-" + variant}>
        <div className="card-body d-flex align-items-center p-3">
            <div className="d-flex align-items-center justify-content-center bg-white rounded-circle me-2 flex-shrink-0"
                 style={{ width: 38, height: 38, minWidth: 38, minHeight: 38 }}>
                <i className={"material-icons text-" + variant}
                   style={{ fontSize: 20, lineHeight: 1, display: 'block' }}>{icon}</i>
            </div>
            <div className="flex-fill" style={{ minWidth: 0 }}>
                <div className="text-white-50 text-uppercase fw-bold small mb-1 text-truncate"
                     style={{ fontSize: '0.65rem', letterSpacing: '0.05em' }}>{title}</div>
                <div className="text-white fw-bold mb-0" style={{ fontSize: '1.4rem', lineHeight: 1 }}>
                    {typeof value === 'number' ? value.toLocaleString() : value}
                </div>
                {sub && <div className="text-white-50 small text-truncate" style={{ fontSize: '0.7rem' }}>{sub}</div>}
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

class DnsFinderStats extends Component {
    static propTypes = {
        statistics:              PropTypes.object.isRequired,
        threatsMonitored:        PropTypes.array.isRequired,
        dnsMonitored:            PropTypes.array.isRequired,
        keywordMonitored:        PropTypes.array.isRequired,
        getDnsFinderStatistics:  PropTypes.func.isRequired,
        getAllThreatsMonitored:  PropTypes.func.isRequired,
        getAllDnsMonitored:       PropTypes.func.isRequired,
        getAllKeywordMonitored:   PropTypes.func.isRequired,
    };

    componentDidMount() {
        this.props.getDnsFinderStatistics();
        this.props.getAllThreatsMonitored();
        this.props.getAllDnsMonitored();
        this.props.getAllKeywordMonitored();
    }

    render() {
        const { statistics, threatsMonitored, dnsMonitored, keywordMonitored } = this.props;
        const realAlerts = threatsMonitored.filter(a => a.status !== 'false_positive');
        const openAlerts = realAlerts.filter(a => a.status !== 'resolved').length;

        const dayLabels  = last14DayLabels();
        const dayCounts  = dayLabels.map(d => realAlerts.filter(a => dayKey(a.created_at) === d).length);

        const dnstwistAlerts   = realAlerts.filter(a => a.source === 'dnstwist');
        const certstreamAlerts = realAlerts.filter(a => a.source === 'certstream_keyword');

        const topFuzzers   = topN(dnstwistAlerts, a => a.technical_details?.fuzzer);
        const fuzzerLabels = topFuzzers.map(([k]) => k);
        const fuzzerVals   = topFuzzers.map(([, v]) => v);

        const topIssuers   = topN(certstreamAlerts, a => a.technical_details?.issuer);
        const issuerLabels = topIssuers.map(([k]) => k);
        const issuerVals   = topIssuers.map(([, v]) => v);

        const sourceCounts = ['dnstwist', 'certstream_keyword', 'subdomain_takeover']
            .map(source => [source, realAlerts.filter(a => a.source === source).length]);

        const statusCounts = Object.keys(STATUS_LABELS)
            .map(statusValue => [statusValue, threatsMonitored.filter(a => a.status === statusValue).length])
            .filter(([, count]) => count > 0);

        const timelineData = {
            labels: dayLabels,
            datasets: [{
                label: 'Alerts',
                data: dayCounts,
                backgroundColor: C.info.faded,
                hoverBackgroundColor: C.info.hover,
                borderWidth: 0,
            }],
        };

        const fuzzerChartData = {
            labels: fuzzerLabels,
            datasets: [{
                label: 'Alerts',
                data: fuzzerVals,
                backgroundColor: TOP_COLORS.map(c => c.faded),
                hoverBackgroundColor: TOP_COLORS.map(c => c.hover),
                borderWidth: 0,
            }],
        };

        const issuerChartData = {
            labels: issuerLabels,
            datasets: [{
                label: 'Alerts',
                data: issuerVals,
                backgroundColor: TOP_COLORS.map(c => c.faded),
                hoverBackgroundColor: TOP_COLORS.map(c => c.hover),
                borderWidth: 0,
            }],
        };

        const sourceChartData = {
            labels: sourceCounts.map(([source]) => SOURCE_LABELS[source]),
            datasets: [{
                data: sourceCounts.map(([, count]) => count),
                backgroundColor: sourceCounts.map(([source]) => SOURCE_COLORS[source].faded),
                hoverBackgroundColor: sourceCounts.map(([source]) => SOURCE_COLORS[source].hover),
                borderWidth: 2,
            }],
        };

        const statusChartData = {
            labels: statusCounts.map(([statusValue]) => STATUS_LABELS[statusValue]),
            datasets: [{
                data: statusCounts.map(([, count]) => count),
                backgroundColor: statusCounts.map(([statusValue]) => STATUS_COLORS[statusValue].faded),
                hoverBackgroundColor: statusCounts.map(([statusValue]) => STATUS_COLORS[statusValue].hover),
                borderWidth: 2,
            }],
        };

        return (
            <div>
                <div className="row row-cols-2 row-cols-md-3 row-cols-xl-5 g-3 mb-4">
                    <div className="col mb-2">
                        <KpiCard title="Total Alerts" value={realAlerts.length}
                                 sub="across all 3 sources" icon="notifications" variant="primary" />
                    </div>
                    <div className="col mb-2">
                        <KpiCard title="Open Alerts" value={openAlerts}
                                 sub="not yet resolved" icon="warning" variant="danger" />
                    </div>
                    <div className="col mb-2">
                        <KpiCard title="DNS Monitored" value={statistics.totalDnsMonitored ?? dnsMonitored.length}
                                 sub="corporate domains watched" icon="dns" variant="info" />
                    </div>
                    <div className="col mb-2">
                        <KpiCard title="Keywords" value={statistics.totalKeywords ?? keywordMonitored.length}
                                 sub="patterns monitored" icon="search" variant="warning" />
                    </div>
                    <div className="col mb-2">
                        <KpiCard title="Subdomain Takeover" value={statistics.totalDanglingConfirmed ?? 0}
                                 sub="confirmed takeover risk" icon="link" variant="danger" />
                    </div>
                </div>

                <div className="row">
                    <div className="col-xl-6 col-lg-12 mb-4">
                        <div className="card shadow h-100">
                            <div className="card-header py-3 d-flex align-items-center justify-content-between">
                                <h6 className="m-0 font-weight-bold text-body d-flex align-items-center gap-2">
                                    Alert Activity - Last 14 Days
                                    <InfoTip text="Number of DNS threat alerts detected per day over the past two weeks, across all three sources." />
                                </h6>
                                <span className="badge badge-info badge-pill">{realAlerts.length} total</span>
                            </div>
                            <div className="card-body">
                                {realAlerts.length > 0
                                    ? <div style={{ height: 200 }}><Bar data={timelineData} options={barOptions} /></div>
                                    : <EmptyState icon="show_chart" label="No alert data yet" />}
                            </div>
                        </div>
                    </div>

                    <div className="col-xl-3 col-lg-6 mb-4">
                        <div className="card shadow h-100">
                            <div className="card-header py-3">
                                <h6 className="m-0 font-weight-bold text-body d-flex align-items-center gap-2">
                                    Alerts by Source
                                    <InfoTip text="Split of alerts across the three detection sources: Dnstwist, Certificate Transparency Stream and Subdomain Takeover." />
                                </h6>
                            </div>
                            <div className="card-body d-flex align-items-center justify-content-center">
                                {realAlerts.length > 0
                                    ? <div style={{ height: 200, width: '100%' }}><Doughnut data={sourceChartData} options={doughnutOptions} /></div>
                                    : <EmptyState icon="donut_large" label="No alert data yet" />}
                            </div>
                        </div>
                    </div>

                    <div className="col-xl-3 col-lg-6 mb-4">
                        <div className="card shadow h-100">
                            <div className="card-header py-3">
                                <h6 className="m-0 font-weight-bold text-body d-flex align-items-center gap-2">
                                    Alert Status
                                    <InfoTip text="Breakdown of every alert by its SOC triage status, across all three sources." />
                                </h6>
                            </div>
                            <div className="card-body d-flex align-items-center justify-content-center">
                                {realAlerts.length > 0
                                    ? <div style={{ height: 200, width: '100%' }}><Doughnut data={statusChartData} options={doughnutOptions} /></div>
                                    : <EmptyState icon="donut_large" label="No alert data yet" />}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="row">
                    <div className="col-xl-6 col-lg-6 mb-4">
                        <div className="card shadow h-100">
                            <div className="card-header py-3">
                                <h6 className="m-0 font-weight-bold text-body d-flex align-items-center gap-2">
                                    Top Fuzzers
                                    <InfoTip text="Most frequent typosquatting techniques used to generate the Dnstwist-detected domains." />
                                </h6>
                            </div>
                            <div className="card-body">
                                {fuzzerLabels.length > 0
                                    ? <div style={{ height: 200 }}><HorizontalBar data={fuzzerChartData} options={hbarOptions} /></div>
                                    : <EmptyState icon="category" label="No fuzzer data yet" />}
                            </div>
                        </div>
                    </div>

                    <div className="col-xl-6 col-lg-6 mb-4">
                        <div className="card shadow h-100">
                            <div className="card-header py-3">
                                <h6 className="m-0 font-weight-bold text-body d-flex align-items-center gap-2">
                                    Top Certificate Issuers
                                    <InfoTip text="Most frequent certificate authorities behind the Certificate Transparency Stream detections." />
                                </h6>
                            </div>
                            <div className="card-body">
                                {issuerLabels.length > 0
                                    ? <div style={{ height: 200 }}><HorizontalBar data={issuerChartData} options={hbarOptions} /></div>
                                    : <EmptyState icon="verified" label="No issuer data yet" />}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }
}

const mapStateToProps = state => ({
    statistics:       state.DnsFinder.statistics       || {},
    threatsMonitored: state.DnsFinder.allThreatsMonitored || [],
    dnsMonitored:     state.DnsFinder.allDnsMonitored     || [],
    keywordMonitored: state.DnsFinder.allKeywordMonitored || [],
});

export default connect(mapStateToProps, { getDnsFinderStatistics, getAllThreatsMonitored, getAllDnsMonitored, getAllKeywordMonitored })(DnsFinderStats);
