import React, { Component } from 'react';
import { connect } from 'react-redux';
import PropTypes from 'prop-types';
import { Bar, HorizontalBar, Doughnut } from 'react-chartjs-2';
import { getThreatsWatcherStatistics } from '../../actions/leads';

const C = {
    primary: { solid: '#4e73df', faded: 'rgba(78,115,223,0.7)',  hover: 'rgba(78,115,223,1)'  },
    success: { solid: '#1cc88a', faded: 'rgba(28,200,138,0.7)',  hover: 'rgba(28,200,138,1)'  },
    info:    { solid: '#36b9cc', faded: 'rgba(54,185,204,0.7)',  hover: 'rgba(54,185,204,1)'  },
    warning: { solid: '#f6c23e', faded: 'rgba(246,194,62,0.7)',  hover: 'rgba(246,194,62,1)'  },
    danger:  { solid: '#e74a3b', faded: 'rgba(231,74,59,0.7)',   hover: 'rgba(231,74,59,1)'   },
};

const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function computeDailyNew(leads) {
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    const counts = new Array(7).fill(0);
    leads.forEach(lead => {
        const d = new Date(lead.created_at);
        const diff = Math.floor((today - d) / 86400000);
        if (diff >= 0 && diff < 7) counts[6 - diff]++;
    });
    return counts;
}

function computeDayLabels() {
    const today = new Date();
    return Array.from({ length: 7 }, (_, i) => {
        const d = new Date(today);
        d.setDate(today.getDate() - (6 - i));
        return DAY_SHORT[d.getDay()];
    });
}

const InfoTip = ({ text }) => (
    <i
        className="material-icons text-muted"
        style={{ fontSize: '0.95rem', lineHeight: 1, cursor: 'help', opacity: 0.6 }}
        title={text}
    >
        info
    </i>
);

InfoTip.propTypes = { text: PropTypes.string.isRequired };

const KpiCard = ({ title, value, sub, icon, variant }) => (
    <div className={"card border-0 shadow-sm h-100 bg-" + variant}>
        <div className="card-body d-flex align-items-center p-4">
            <div
                className="d-flex align-items-center justify-content-center bg-white rounded-circle me-3 flex-shrink-0"
                style={{ width: 50, height: 50, minWidth: 50, minHeight: 50 }}
            >
                <i className={"material-icons text-" + variant} style={{ fontSize: 28 }}>{icon}</i>
            </div>
            <div className="flex-fill">
                <div className="text-white-50 text-uppercase fw-bold small mb-1"
                     style={{ fontSize: '0.75rem', letterSpacing: '0.05em' }}>
                    {title}
                </div>
                <div className="text-white fw-bold h2 mb-1" style={{ fontSize: '2rem', lineHeight: 1 }}>
                    {typeof value === 'number' ? value.toLocaleString() : value}
                </div>
                {sub && <div className="text-white-50 small" style={{ fontSize: '0.8rem' }}>{sub}</div>}
            </div>
        </div>
    </div>
);

KpiCard.propTypes = {
    title:   PropTypes.string.isRequired,
    value:   PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
    sub:     PropTypes.string,
    icon:    PropTypes.string.isRequired,
    variant: PropTypes.string.isRequired,
};

class ThreatsWatcherStats extends Component {
    static propTypes = {
        statistics:                  PropTypes.object.isRequired,
        leads:                       PropTypes.array.isRequired,
        monitoredKeywords:           PropTypes.array.isRequired,
        bannedWords:                 PropTypes.array.isRequired,
        sources:                     PropTypes.array.isRequired,
        getThreatsWatcherStatistics: PropTypes.func.isRequired,
    };

    componentDidMount() {
        this.props.getThreatsWatcherStatistics();
    }

    render() {
        const { statistics, leads, monitoredKeywords, bannedWords, sources } = this.props;

        const totalWords   = statistics.totalWords  || leads.length;
        const newToday     = statistics.newToday    || 0;
        const newThisWeek  = statistics.newThisWeek || 0;
        const totalSources = sources.length         || statistics.totalSources || 0;
        const bannedCount  = bannedWords.length      || statistics.bannedWords  || 0;
        const monCount     = monitoredKeywords.length|| statistics.monitoredKeywords || 0;

        const top5      = [...leads].sort((a, b) => b.occurrences - a.occurrences).slice(0, 5);
        const topLabels = top5.map(w => w.name);
        const topValues = top5.map(w => w.occurrences);

        const dailyNew  = computeDailyNew(leads);
        const dayLabels = computeDayLabels();

        const regularCount = Math.max(0, totalWords - monCount - bannedCount);
        const hasTopData   = top5.length > 0;
        const hasDailyData = dailyNew.some(v => v > 0);

        const barDailyData = {
            labels: dayLabels,
            datasets: [{
                label: 'New words',
                data: dailyNew,
                backgroundColor: C.primary.faded,
                borderColor: C.primary.solid,
                borderWidth: 1,
                hoverBackgroundColor: C.primary.hover,
            }],
        };

        const TOP_COLORS = [C.primary, C.success, C.info, C.warning, C.danger];
        const barTopData = {
            labels: topLabels,
            datasets: [{
                label: 'Occurrences',
                data: topValues,
                backgroundColor: TOP_COLORS.map(c => c.faded),
                hoverBackgroundColor: TOP_COLORS.map(c => c.hover),
                borderWidth: 0,
            }],
        };

        const doughnutData = {
            labels: ['Unclassified', 'Monitored', 'Banned'],
            datasets: [{
                data: [regularCount || 1, monCount, bannedCount],
                backgroundColor: [C.primary.faded, C.success.faded, C.danger.faded],
                hoverBackgroundColor: [C.primary.hover, C.success.hover, C.danger.hover],
                borderWidth: 2,
            }],
        };

        const barOptions = {
            maintainAspectRatio: false,
            legend: { display: false },
            tooltips: { mode: 'index', intersect: false, bodyFontColor: '#fff', backgroundColor: 'rgba(0,0,0,0.8)' },
            scales: {
                xAxes: [{ gridLines: { display: false }, ticks: { maxTicksLimit: 7, fontColor: '#858796' } }],
                yAxes: [{ ticks: { maxTicksLimit: 5, beginAtZero: true, precision: 0, fontColor: '#858796' },
                          gridLines: { color: 'rgba(100,100,120,0.15)', borderDash: [2], drawBorder: false } }],
            },
        };

        const hbarOptions = {
            maintainAspectRatio: false,
            legend: { display: false },
            tooltips: { mode: 'index', intersect: false, bodyFontColor: '#fff', backgroundColor: 'rgba(0,0,0,0.8)' },
            scales: {
                xAxes: [{ ticks: { beginAtZero: true, precision: 0, fontColor: '#858796' },
                          gridLines: { color: 'rgba(100,100,120,0.15)', drawBorder: false } }],
                yAxes: [{ gridLines: { display: false }, ticks: { fontColor: '#858796', fontSize: 12 } }],
            },
        };

        const doughnutOptions = {
            maintainAspectRatio: false,
            legend: {
                display: true,
                position: 'bottom',
                labels: { fontColor: '#858796', padding: 16, boxWidth: 12 },
            },
            tooltips: { bodyFontColor: '#fff', backgroundColor: 'rgba(0,0,0,0.8)' },
            cutoutPercentage: 72,
        };

        return (
            <div>
                {/* KPI Cards */}
                <div className="row mb-4">
                    <div className="col-xl-3 col-md-6 mb-4">
                        <KpiCard title="Total Words" value={totalWords}
                                 sub={"+" + newThisWeek + " this week"}
                                 icon="list_alt" variant="primary" />
                    </div>
                    <div className="col-xl-3 col-md-6 mb-4">
                        <KpiCard title="New Today" value={newToday}
                                 sub="words discovered today"
                                 icon="add_circle_outline" variant="success" />
                    </div>
                    <div className="col-xl-3 col-md-6 mb-4">
                        <KpiCard title="RSS Sources" value={totalSources}
                                 sub="monitored feeds"
                                 icon="rss_feed" variant="info" />
                    </div>
                    <div className="col-xl-3 col-md-6 mb-4">
                        <KpiCard title="Banned Words" value={bannedCount}
                                 sub={monCount + " monitored keywords"}
                                 icon="block" variant="danger" />
                    </div>
                </div>

                {/* Charts */}
                <div className="row">
                    <div className="col-xl-5 col-lg-6 mb-4">
                        <div className="card shadow h-100">
                            <div className="card-header py-3 d-flex flex-row align-items-center justify-content-between">
                                <h6 className="m-0 font-weight-bold text-body d-flex align-items-center gap-2">
                                    7-day Activity
                                    <InfoTip text="Number of new trending words discovered each day over the last 7 days, based on RSS feed processing." />
                                </h6>
                                <span className="badge badge-primary badge-pill">{newThisWeek} new this week</span>
                            </div>
                            <div className="card-body">
                                {hasDailyData ? (
                                    <div style={{ height: 200 }}>
                                        <Bar data={barDailyData} options={barOptions} />
                                    </div>
                                ) : (
                                    <div className="d-flex flex-column align-items-center justify-content-center py-5 text-muted">
                                        <i className="material-icons mb-2" style={{ fontSize: 40, opacity: 0.2 }}>show_chart</i>
                                        <small>No activity recorded yet</small>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="col-xl-4 col-lg-6 mb-4">
                        <div className="card shadow h-100">
                            <div className="card-header py-3 d-flex flex-row align-items-center justify-content-between">
                                <h6 className="m-0 font-weight-bold text-body d-flex align-items-center gap-2">
                                    Top 5 Trending Words
                                    <InfoTip text="The 5 most frequently occurring words detected across all monitored RSS sources, ranked by total occurrence count." />
                                </h6>
                                <span className="badge badge-secondary badge-pill">by occurrences</span>
                            </div>
                            <div className="card-body">
                                {hasTopData ? (
                                    <div style={{ height: 200 }}>
                                        <HorizontalBar data={barTopData} options={hbarOptions} />
                                    </div>
                                ) : (
                                    <div className="d-flex flex-column align-items-center justify-content-center py-5 text-muted">
                                        <i className="material-icons mb-2" style={{ fontSize: 40, opacity: 0.2 }}>bar_chart</i>
                                        <small>Waiting for word data…</small>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="col-xl-3 col-lg-12 mb-4">
                        <div className="card shadow h-100">
                            <div className="card-header py-3 d-flex flex-row align-items-center justify-content-between">
                                <h6 className="m-0 font-weight-bold text-body d-flex align-items-center gap-2">
                                    Word Breakdown
                                    <InfoTip text="Distribution of all detected words: Regular (unclassified), Monitored (tracked via keywords), and Banned (excluded from analysis)." />
                                </h6>
                            </div>
                            <div className="card-body d-flex align-items-center justify-content-center">
                                <div style={{ height: 220, width: '100%' }}>
                                    <Doughnut data={doughnutData} options={doughnutOptions} />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }
}

const mapStateToProps = state => ({
    statistics:        state.leads.statistics        || {},
    leads:             state.leads.leads             || [],
    monitoredKeywords: state.leads.monitoredKeywords || [],
    bannedWords:       state.leads.bannedWords       || [],
    sources:           state.leads.sources           || [],
});

export default connect(mapStateToProps, { getThreatsWatcherStatistics })(ThreatsWatcherStats);
