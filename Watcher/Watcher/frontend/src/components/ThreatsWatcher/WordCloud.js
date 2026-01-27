import React, {Component, Fragment} from 'react';

import 'd3-transition';
import {select} from 'd3-selection';
import ReactWordcloud from 'react-wordcloud';
import PropTypes from "prop-types";
import {connect} from "react-redux";
import {getLeads} from "../../actions/leads";

const getBootstrapColor = (className) => {
    const el = document.createElement("span");
    el.className = `badge ${className}`;
    el.style.display = "none";
    document.body.appendChild(el);
    const color = window.getComputedStyle(el).backgroundColor;
    document.body.removeChild(el);
    return color || "#6c757d";
};

const options = {
    enableTooltip: true,
    deterministic: false,
    fontFamily: 'arial',
    fontSizes: [20, 90],
    fontStyle: 'normal',
    fontWeight: 'normal',
    padding: 3,
    rotations: 1,
    rotationAngles: [0, 90],
    scale: 'sqrt',
    spiral: 'archimedean',
    transitionDuration: 650,
};

export class WordCloud extends Component {

    constructor(props) {
        super(props);
        this.state = {
            key: 0,
            containerHeight: 'auto',
            colors: {
                success: "#28a745",
                warning: "#ffc107",
                danger: "#dc3545"
            }
        };
        this.containerRef = React.createRef();
        this.resizeTimeout = null;
    }

    static propTypes = {
        leads: PropTypes.array.isRequired,
        monitoredKeywords: PropTypes.array.isRequired,
        filteredData: PropTypes.array,
        getLeads: PropTypes.func.isRequired
    };

    componentDidMount() {
        this.props.getLeads();

        this.setState({
            colors: {
                success: getBootstrapColor("bg-success"),
                warning: getBootstrapColor("bg-warning"),
                danger: getBootstrapColor("bg-danger")
            }
        });
    }

    componentDidUpdate(prevProps) {
        const prevDataLength = prevProps.filteredData ? prevProps.filteredData.length : prevProps.leads.length;
        const currentDataLength = this.props.filteredData ? this.props.filteredData.length : this.props.leads.length;
        
        if (prevDataLength !== currentDataLength) {
            if (this.resizeTimeout) {
                clearTimeout(this.resizeTimeout);
            }

            const baseHeight = Math.min(Math.max(currentDataLength * 20, 200), 600);
            
            this.setState({ 
                containerHeight: `${baseHeight}px`,
                key: this.state.key + 1 
            });

            this.resizeTimeout = setTimeout(() => {
                this.setState(prevState => ({ 
                    key: prevState.key + 1 
                }));
            }, 150);
        }
    }

    componentWillUnmount() {
        if (this.resizeTimeout) {
            clearTimeout(this.resizeTimeout);
        }
    }

    getCallback = (callback) => {
        return (word, event) => {
            const isActive = callback !== 'onWordMouseOut';
            const element = event.target;
            const text = select(element);
            text
                .on('click', () => {
                    if (isActive) {
                        const dataToUse = this.props.filteredData || this.props.leads;
                        dataToUse.map(lead => {
                            if (lead.name === word.text) {
                                if (this.props.setPostUrls) {
                                    this.props.setPostUrls(lead.posturls, word.text)
                                }
                            }
                            return null;
                        });
                    }
                })
                .transition()
                .attr('font-weight', isActive ? 'bold' : 'normal');
        };
    };

    callbacks = {
        getWordTooltip: word =>
            `The word "${word.text}" caught ${word.value} times.`,
        onWordClick: this.getCallback('onWordClick'),
        onWordMouseOut: this.getCallback('onWordMouseOut'),
        onWordMouseOver: this.getCallback('onWordMouseOver'),
        getWordColor: word => {
            const dataToUse = this.props.filteredData || this.props.leads;
            const lead = dataToUse.find(l => l.name === word.text);
            
            // Check if word is monitored and has temperature
            if (lead && lead.is_monitored && lead.monitored_temperature) {
                const temperatureColors = {
                    'WARN': '#ffc107',
                    'HOT': '#fd7e14',
                    'SUPER_HOT': '#dc3545'
                };
                return temperatureColors[lead.monitored_temperature] || '#ffc107';
            }
            
            // Default color based on reliability score for non-monitored words
            const score = lead && (typeof lead.score !== 'undefined') ? Number(lead.score) : null;
            if (score === null || isNaN(score)) {
                return this.state.colors.danger;
            }
            if (score >= 70) return this.state.colors.success;
            if (score >= 40) return this.state.colors.warning;
            return this.state.colors.danger;
        }
    };

    render() {
        const dataToUse = this.props.filteredData || this.props.leads;

        const words = dataToUse.map(lead => {
            return {
                text: lead.name,
                value: lead.occurrences,
            };
        });

        return (
            <Fragment>
                <div 
                    ref={this.containerRef} 
                    style={{ 
                        width: '100%', 
                        height: this.state.containerHeight,
                        minHeight: '200px',
                        maxHeight: '600px',
                        overflow: 'hidden'
                    }}
                >
                    <ReactWordcloud 
                        key={this.state.key} 
                        options={options} 
                        callbacks={this.callbacks} 
                        words={words}
                    />
                </div>
            </Fragment>
        )
    }
}

const mapStateToProps = state => ({
    leads: state.leads.leads,
    monitoredKeywords: state.leads.monitoredKeywords
});

export default connect(mapStateToProps, {getLeads})(WordCloud);