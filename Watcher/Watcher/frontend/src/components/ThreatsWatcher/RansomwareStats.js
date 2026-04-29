import React, { Component } from 'react';
import { connect } from 'react-redux';
import PropTypes from 'prop-types';
import { HorizontalBar, Doughnut } from 'react-chartjs-2';
import { getRansomwareVictims, getWatchRuleHits } from '../../actions/CyberWatch';

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

function topN(items, keyFn, n = 5) {
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

const doughnutOptions = {
    maintainAspectRatio: false,
    legend: { display: true, position: 'bottom', labels: { fontColor: '#858796', padding: 14, boxWidth: 12 } },
    tooltips: { bodyFontColor: '#fff', backgroundColor: 'rgba(0,0,0,0.8)' },
    cutoutPercentage: 72,
};

const EmptyState = ({ icon, label }) => (
    <div className="d-flex flex-column align-items-center justify-content-center py-5 text-muted">
        <i className="material-icons mb-2" style={{ fontSize: 40, opacity: 0.2 }}>{icon}</i>
        <small>{label}</small>
    </div>
);

class RansomwareStats extends Component {
    static propTypes = {
        ransomwareVictims:   PropTypes.array.isRequired,
        watchRuleHits:       PropTypes.array.isRequired,
        getRansomwareVictims: PropTypes.func.isRequired,
        getWatchRuleHits:    PropTypes.func.isRequired,
    };

    componentDidMount() {
        this.props.getRansomwareVictims();
        this.props.getWatchRuleHits();
    }

    render() {
        const { ransomwareVictims, watchRuleHits } = this.props;

        const victimHits = watchRuleHits.filter(h => h.hit_type === 'ransomware_victim');
        const uniqueGroups    = new Set(ransomwareVictims.map(v => v.group_name).filter(Boolean)).size;
        const uniqueCountries = new Set(ransomwareVictims.map(v => v.country).filter(Boolean)).size;

        const topGroups     = topN(ransomwareVictims, v => v.group_name);
        const topGroupLabels = topGroups.map(([k]) => k);
        const topGroupVals   = topGroups.map(([, v]) => v);

        const topCountries     = topN(ransomwareVictims, v => v.country || 'Unknown');
        const topCountryLabels = topCountries.map(([k]) => k);
        const topCountryVals   = topCountries.map(([, v]) => v);

        const sectorMap = {};
        ransomwareVictims.forEach(v => {
            const s = v.sector || 'Unknown';
            sectorMap[s] = (sectorMap[s] || 0) + 1;
        });
        const sortedSectors = Object.entries(sectorMap).sort((a, b) => b[1] - a[1]);
        const topSectors = sortedSectors.slice(0, 6);
        const otherCount = sortedSectors.slice(6).reduce((s, [, v]) => s + v, 0);
        if (otherCount > 0) topSectors.push(['Other', otherCount]);
        const DONUT_COLORS = [C.primary, C.success, C.info, C.warning, C.danger,
            { faded: 'rgba(133,103,196,0.7)', hover: 'rgba(133,103,196,1)' },
            { faded: 'rgba(150,150,150,0.7)', hover: 'rgba(150,150,150,1)' }];

        const groupChartData = {
            labels: topGroupLabels,
            datasets: [{ label: 'Victims', data: topGroupVals,
                backgroundColor: TOP_COLORS.map(c => c.faded),
                hoverBackgroundColor: TOP_COLORS.map(c => c.hover), borderWidth: 0 }],
        };
        const countryChartData = {
            labels: topCountryLabels,
            datasets: [{ label: 'Victims', data: topCountryVals,
                backgroundColor: TOP_COLORS.map(c => c.faded),
                hoverBackgroundColor: TOP_COLORS.map(c => c.hover), borderWidth: 0 }],
        };
        const sectorChartData = {
            labels: topSectors.map(([k]) => k),
            datasets: [{ data: topSectors.map(([, v]) => v),
                backgroundColor: DONUT_COLORS.slice(0, topSectors.length).map(c => c.faded),
                hoverBackgroundColor: DONUT_COLORS.slice(0, topSectors.length).map(c => c.hover),
                borderWidth: 2 }],
        };

        return (
            <div>
                {/* KPI Cards */}
                <div className="row mb-4">
                    <div className="col-xl-3 col-md-6 mb-4">
                        <KpiCard title="Total Victims" value={ransomwareVictims.length}
                                 sub="all tracked victims" icon="people" variant="primary" />
                    </div>
                    <div className="col-xl-3 col-md-6 mb-4">
                        <KpiCard title="Watch Rule Hits" value={victimHits.length}
                                 sub="matches on your rules" icon="notifications_active" variant="danger" />
                    </div>
                    <div className="col-xl-3 col-md-6 mb-4">
                        <KpiCard title="Unique Groups" value={uniqueGroups}
                                 sub="ransomware operators" icon="group" variant="warning" />
                    </div>
                    <div className="col-xl-3 col-md-6 mb-4">
                        <KpiCard title="Countries" value={uniqueCountries}
                                 sub="victim geographies" icon="public" variant="info" />
                    </div>
                </div>

                {/* Charts */}
                <div className="row">
                    <div className="col-xl-4 col-lg-6 mb-4">
                        <div className="card shadow h-100">
                            <div className="card-header py-3 d-flex align-items-center justify-content-between">
                                <h6 className="m-0 font-weight-bold text-body d-flex align-items-center gap-2">
                                    Top 5 Groups
                                    <InfoTip text="The 5 most active ransomware groups ranked by number of victims tracked from public leak sites." />
                                </h6>
                                <span className="badge badge-primary badge-pill">{uniqueGroups} groups</span>
                            </div>
                            <div className="card-body">
                                {topGroupLabels.length > 0
                                    ? <div style={{ height: 200 }}><HorizontalBar data={groupChartData} options={hbarOptions} /></div>
                                    : <EmptyState icon="groups" label="No victim data yet" />}
                            </div>
                        </div>
                    </div>

                    <div className="col-xl-4 col-lg-6 mb-4">
                        <div className="card shadow h-100">
                            <div className="card-header py-3 d-flex align-items-center justify-content-between">
                                <h6 className="m-0 font-weight-bold text-body d-flex align-items-center gap-2">
                                    Top 5 Countries
                                    <InfoTip text="The 5 most targeted countries based on recorded ransomware victim locations." />
                                </h6>
                                <span className="badge badge-info badge-pill">{uniqueCountries} countries</span>
                            </div>
                            <div className="card-body">
                                {topCountryLabels.length > 0
                                    ? <div style={{ height: 200 }}><HorizontalBar data={countryChartData} options={hbarOptions} /></div>
                                    : <EmptyState icon="public" label="No country data yet" />}
                            </div>
                        </div>
                    </div>

                    <div className="col-xl-4 col-lg-12 mb-4">
                        <div className="card shadow h-100">
                            <div className="card-header py-3 d-flex align-items-center justify-content-between">
                                <h6 className="m-0 font-weight-bold text-body d-flex align-items-center gap-2">
                                    Sector Breakdown
                                    <InfoTip text="Distribution of victim organizations by industry sector. 'Unknown' means no sector data was available." />
                                </h6>
                            </div>
                            <div className="card-body d-flex align-items-center justify-content-center">
                                {topSectors.length > 0
                                    ? <div style={{ height: 230, width: '100%' }}><Doughnut data={sectorChartData} options={doughnutOptions} /></div>
                                    : <EmptyState icon="donut_large" label="No sector data yet" />}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }
}

const mapStateToProps = state => ({
    ransomwareVictims: state.CyberWatch.ransomwareVictims || [],
    watchRuleHits:     state.CyberWatch.watchRuleHits     || [],
});

export default connect(mapStateToProps, { getRansomwareVictims, getWatchRuleHits })(RansomwareStats);
