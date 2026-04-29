import React, {Component, Fragment} from 'react';
import Chart from "chart.js";
import moment from 'moment';

export class TrendChart extends Component {

    chartRef = React.createRef();
    chartInstance = null;

    componentDidMount() {
        if (this.props.word) {
            this.buildChart();
        }
    }

    componentDidUpdate(prevProps) {
        if (prevProps.word !== this.props.word || prevProps.postUrls !== this.props.postUrls) {
            this.buildChart();
        }
    }

    componentWillUnmount() {
        this.destroyChart();
    }

    destroyChart() {
        if (this.chartInstance) {
            this.chartInstance.destroy();
            this.chartInstance = null;
        }
    }

    buildChart() {
        if (!this.props.word) {
            this.destroyChart();
            return;
        }

        const canvas = this.chartRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');

        let postUrlsFormatted = [];
        (this.props.postUrls || []).forEach(element => {
            try {
                const date = moment(new Date(element.split(',', 2)[1].split(' ', 2)[0])).format("YYYY-MM-DD");
                postUrlsFormatted.push({ date });
            } catch (_) {}
        });

        const groupBy = key => array =>
            array.reduce((acc, obj) => {
                const value = obj[key];
                acc[value] = (acc[value] || []).concat(obj);
                return acc;
            }, {});

        const grouped = groupBy('date')(postUrlsFormatted);
        const postsByDate = Object.entries(grouped).map(([key, value]) => ({ x: key, y: value.length }));

        this.destroyChart();
        this.chartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                datasets: [
                    {
                        label: `${this.props.word} trend`,
                        data: postsByDate,
                        fill: true,
                        borderColor: 'rgba(2,136,209,1)',
                        backgroundColor: 'rgba(2,136,209,0.4)',
                        lineTension: 0.15,
                        borderJoinStyle: 'round'
                    }
                ]
            },
            options: {
                events: null,
                scales: {
                    xAxes: [{
                        type: 'time',
                        time: { unit: 'day' }
                    }],
                    yAxes: [{
                        ticks: { stepSize: 1 }
                    }]
                }
            }
        });
    }

    render() {
        return (
            <Fragment>
                <div className="row">
                    <canvas ref={this.chartRef} height="50"
                            style={{
                                background: 'white',
                                display: this.props.word ? 'block' : 'none',
                                borderRadius: 5
                            }}></canvas>
                </div>
            </Fragment>
        );
    }
}

export default (TrendChart);