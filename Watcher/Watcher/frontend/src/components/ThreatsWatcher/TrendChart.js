import React, {Component, Fragment} from 'react';
import Chart from "chart.js";
import moment from 'moment';

export class TrendChart extends Component {

    chartRef = React.createRef();
    myChartRef;

    componentDidMount() {
        this.myChartRef = this.chartRef.current.getContext("2d");
    }

    render() {
        if (this.props.word) {
            let postUrlsFormatted = [];
            let dot = {}, formattedDate = {};
            this.props.postUrls.forEach(element => {
                formattedDate = {
                    date: moment(new Date(element.split(',', 2)[1].split(' ', 2)[0])).format("YYYY-MM-DD"),
                };
                postUrlsFormatted.push(formattedDate)
            });
            const groupBy = key => array =>
                array.reduce((objectsByKeyValue, obj) => {
                    const value = obj[key];
                    objectsByKeyValue[value] = (objectsByKeyValue[value] || []).concat(obj);
                    return objectsByKeyValue;
                }, {});

            const func = groupBy('date');
            postUrlsFormatted = func(postUrlsFormatted);
            
            const postsByDate = [];
            for (let [key, value] of Object.entries(postUrlsFormatted)) {
                dot = {
                    x: key,
                    y: value.length
                };
                postsByDate.push(dot);
            }

            const chart = new Chart(this.myChartRef, {
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
                            time: {
                                unit: 'day'
                            }
                        }],
                        yAxes: [{
                            ticks: {
                                stepSize: 1,
                            }
                        }]
                    }
                }
            });
        }
        return (
            <Fragment>
                <div className="row">
                    <canvas id="myChart" ref={this.chartRef} height="50"
                            style={{
                                background: 'white',
                                display: this.props.word ? 'block' : 'none',
                                borderRadius: 5
                            }}></canvas>
                </div>
            </Fragment>
        )
    }
}

export default (TrendChart);