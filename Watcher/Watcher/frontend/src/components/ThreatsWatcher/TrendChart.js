import React, { Component } from 'react';
import { Line } from 'react-chartjs-2';
import moment from 'moment';
import PropTypes from 'prop-types';

const C = {
    primary: { solid: '#4e73df', faded: 'rgba(78,115,223,0.12)', hover: 'rgba(78,115,223,1)' },
};

class TrendChart extends Component {
    static propTypes = {
        postUrls: PropTypes.array,
        word:     PropTypes.string,
    };

    buildChartData() {
        const { postUrls = [], word } = this.props;

        const dateMap = {};
        postUrls.forEach(element => {
            try {
                const raw = element.split(',', 2)[1].split(' ', 2)[0];
                const date = moment(new Date(raw)).format('YYYY-MM-DD');
                if (date !== 'Invalid date') dateMap[date] = (dateMap[date] || 0) + 1;
            } catch (_) {}
        });

        const sorted = Object.entries(dateMap)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([x, y]) => ({ x, y }));

        return {
            datasets: [{
                label: word,
                data: sorted,
                fill: true,
                borderColor: C.primary.solid,
                backgroundColor: C.primary.faded,
                borderWidth: 2,
                lineTension: 0.3,
                pointRadius: 4,
                pointHoverRadius: 6,
                pointBackgroundColor: C.primary.solid,
                pointBorderColor: '#fff',
                pointBorderWidth: 2,
            }],
        };
    }

    render() {
        const { word, postUrls = [] } = this.props;

        if (!word) return null;

        const data     = this.buildChartData();
        const hasData  = data.datasets[0].data.length > 0;
        const total    = postUrls.length;
        const earliest = hasData ? moment(data.datasets[0].data[0].x).format('MMM D, YYYY') : null;
        const latest   = hasData ? moment(data.datasets[0].data[data.datasets[0].data.length - 1].x).format('MMM D, YYYY') : null;
        const span     = hasData ? data.datasets[0].data.length : 0;

        const options = {
            maintainAspectRatio: false,
            legend: { display: false },
            tooltips: {
                mode: 'index',
                intersect: false,
                bodyFontColor: '#fff',
                backgroundColor: 'rgba(0,0,0,0.82)',
                titleFontSize: 13,
                bodyFontSize: 12,
                cornerRadius: 6,
                callbacks: {
                    title: (items) => items[0] ? moment(items[0].xLabel).format('dddd, MMM D YYYY') : '',
                    label: (item) => ` ${item.yLabel} mention${item.yLabel !== 1 ? 's' : ''}`,
                },
            },
            scales: {
                xAxes: [{
                    type: 'time',
                    time: { unit: 'day', displayFormats: { day: 'MMM D' } },
                    gridLines: { display: false },
                    ticks: { fontColor: '#858796', maxTicksLimit: 10, fontSize: 11 },
                }],
                yAxes: [{
                    ticks: {
                        beginAtZero: true,
                        stepSize: 1,
                        precision: 0,
                        fontColor: '#858796',
                        maxTicksLimit: 5,
                        fontSize: 11,
                    },
                    gridLines: {
                        color: 'rgba(100,100,120,0.12)',
                        borderDash: [2],
                        drawBorder: false,
                    },
                }],
            },
        };

        return (
            <div style={{ padding: '8px 12px', height: '100%', display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div className="d-flex justify-content-end" style={{ flexShrink: 0 }}>
                    <span className="badge badge-primary badge-pill">
                        {total} mention{total !== 1 ? 's' : ''}
                    </span>
                </div>

                {hasData ? (
                    <>
                        <div style={{ flex: 1, minHeight: 0 }}>
                            <Line data={data} options={options} />
                        </div>
                        {span > 1 && (
                            <div className="d-flex justify-content-between" style={{ fontSize: '0.73rem', color: '#adb5bd', flexShrink: 0 }}>
                                <span>First: <strong>{earliest}</strong></span>
                                <span>{span} day{span !== 1 ? 's' : ''}</span>
                                <span>Last: <strong>{latest}</strong></span>
                            </div>
                        )}
                    </>
                ) : (
                    <div className="d-flex flex-column align-items-center justify-content-center flex-fill text-muted">
                        <i className="material-icons mb-2" style={{ fontSize: 40, opacity: 0.2 }}>show_chart</i>
                        <small>No dated mentions found for &ldquo;{word}&rdquo;</small>
                    </div>
                )}
            </div>
        );
    }
}

export default TrendChart;
