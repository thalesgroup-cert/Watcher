import React, {Component, Fragment} from 'react';

import 'd3-transition';
import {select} from 'd3-selection';
import ReactWordcloud from 'react-wordcloud';
import PropTypes from "prop-types";
import {connect} from "react-redux";
import {getLeads, getMonitoredKeywords} from "../../actions/leads";

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
        monitoredKeywords: PropTypes.array,
        filteredData: PropTypes.array,
        fromSourceFilter: PropTypes.string,
        getLeads: PropTypes.func.isRequired,
        getMonitoredKeywords: PropTypes.func.isRequired
    };

    componentDidMount() {
        this.props.getLeads();
        this.props.getMonitoredKeywords();

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

    getMonitoredInfo = (wordText) => {
        const { monitoredKeywords = [] } = this.props;
        const cleanText = wordText.replace(' *', '');
        return monitoredKeywords.find(mk =>
            mk.name.toLowerCase() === cleanText.toLowerCase() && mk.last_seen
        ) || null;
    };

    getCallback = (callback) => {
        return (word, event) => {
            const isActive = callback !== 'onWordMouseOut';
            const element = event.target;
            const text = select(element);
            text
                .on('click', () => {
                    if (isActive) {
                        const dataToUse = this.props.filteredData || this.props.leads;
                        const { monitoredKeywords = [] } = this.props;
                        const cleanName = word.text.replace(' *', '');
                        // First try to find in leads
                        const lead = dataToUse.find(l => l.name === cleanName);
                        if (lead) {
                            if (this.props.setPostUrls) this.props.setPostUrls(lead.posturls, cleanName);
                        } else {
                            // Monitored keyword not (yet) in leads - use mk.posturls
                            const mk = monitoredKeywords.find(m => m.name.toLowerCase() === cleanName.toLowerCase() && m.last_seen);
                            if (mk && this.props.setPostUrls) this.props.setPostUrls(mk.posturls || [], cleanName);
                        }
                    }
                })
                .transition()
                .attr('font-weight', isActive ? 'bold' : 'normal');
        };
    };

    callbacks = {
        getWordTooltip: word => {
            const mk = this.getMonitoredInfo(word.text);
            if (mk) {
                return `Monitored - Level: ${mk.level_display || mk.level} - ${mk.occurrences} occurrences\nCaught ${word.value} times.`;
            }
            return `The word "${word.text}" caught ${word.value} times.`;
        },
        onWordClick: this.getCallback('onWordClick'),
        onWordMouseOut: this.getCallback('onWordMouseOut'),
        onWordMouseOver: this.getCallback('onWordMouseOver'),
        getWordColor: word => {
            const dataToUse = this.props.filteredData || this.props.leads;
            const lead = dataToUse.find(l => l.name === word.text);
            const score = lead && (typeof lead.score !== 'undefined') ? Number(lead.score) : null;
            if (score === null || isNaN(score)) {
                return '#9e9e9e';
            }
            if (score >= 70) return this.state.colors.success;
            if (score >= 40) return this.state.colors.warning;
            return this.state.colors.danger;
        }
    };

    render() {
        const dataToUse = this.props.filteredData || this.props.leads;
        const { monitoredKeywords = [] } = this.props;
        const { fromSourceFilter } = this.props;

        // Build a set of monitored keyword names that have been seen (last_seen != null)
        const monitoredSeen = new Set(
            monitoredKeywords
                .filter(mk => mk.last_seen)
                .map(mk => mk.name.toLowerCase())
        );

        const words = dataToUse.map(lead => {
            const isMonitored = monitoredSeen.has(lead.name.toLowerCase());
            return {
                text: isMonitored ? `${lead.name} *` : lead.name,
                value: lead.occurrences,
            };
        });

        if (fromSourceFilter !== 'trendy_words') {
            const existingNames = new Set(dataToUse.map(l => l.name.toLowerCase()));
            monitoredKeywords
                .filter(mk => mk.last_seen && !existingNames.has(mk.name.toLowerCase()))
                .forEach(mk => words.push({ text: `${mk.name} *`, value: 1 }));
        }

        if (words.length === 0) {
            return (
                <div className="d-flex align-items-center justify-content-center h-100 text-muted">
                    <div className="text-center py-4">
                        <i className="material-icons d-block mb-2" style={{ fontSize: '2.5rem', opacity: 0.25 }}>cloud</i>
                        <div className="fw-semibold mb-1">No data yet</div>
                        <small>Words will appear here once Watcher collects threat intelligence</small>
                    </div>
                </div>
            );
        }

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

export default connect(mapStateToProps, {getLeads, getMonitoredKeywords})(WordCloud);