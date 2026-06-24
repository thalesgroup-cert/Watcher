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
    deterministic: true,
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
        this._selectedEl = null;
    }

    static propTypes = {
        leads: PropTypes.array.isRequired,
        monitoredKeywords: PropTypes.array,
        filteredData: PropTypes.array,
        fromSourceFilter: PropTypes.string,
        getLeads: PropTypes.func.isRequired,
        getMonitoredKeywords: PropTypes.func.isRequired,
        selectedWord: PropTypes.string,
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

        if (prevProps.selectedWord !== this.props.selectedWord) {
            const newWord = this.props.selectedWord;

            // If the clicked element in the cloud already matches, the click handler already
            // applied the halo - skip clearing to avoid flickering.
            const currentText = this._selectedEl
                ? this._selectedEl.textContent.replace(/\*$/, '').toLowerCase().trim()
                : null;
            if (newWord && currentText === newWord.toLowerCase().trim()) return;

            // Clear old selection
            if (this._selectedEl) {
                select(this._selectedEl)
                    .attr('stroke', null)
                    .attr('stroke-width', null)
                    .attr('paint-order', null)
                    .attr('stroke-linejoin', null);
                this._selectedEl = null;
            }
            // Apply from external selection (e.g. WordList click)
            if (newWord) {
                requestAnimationFrame(() => this._applyExternalSelection(newWord));
            }
        }
    }

    _applyExternalSelection = (word) => {
        if (!this.containerRef.current || !word) return;
        const needle = word.toLowerCase().trim();
        this.containerRef.current.querySelectorAll('text').forEach(el => {
            const text = el.textContent.replace(/\*$/, '').toLowerCase().trim();
            if (text === needle && !this._selectedEl) {
                select(el)
                    .attr('stroke', '#4e73df')
                    .attr('stroke-width', '1.5')
                    .attr('paint-order', 'stroke')
                    .attr('stroke-linejoin', 'round');
                this._selectedEl = el;
            }
        });
    };

    componentWillUnmount() {
        if (this.resizeTimeout) {
            clearTimeout(this.resizeTimeout);
        }
    }

    getMonitoredInfo = (wordText) => {
        const { monitoredKeywords = [] } = this.props;
        const cleanText = wordText.replace(/\*$/, '');
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
                        const cleanName = word.text.replace(/\*$/, '');

                        // Clear stroke on previously selected element
                        if (this._selectedEl && this._selectedEl !== element) {
                            select(this._selectedEl)
                                .attr('stroke', null)
                                .attr('stroke-width', null)
                                .attr('paint-order', null)
                                .attr('stroke-linejoin', null);
                        }

                        // Apply stroke halo on newly selected element
                        text
                            .attr('stroke', '#4e73df')
                            .attr('stroke-width', '1.5')
                            .attr('paint-order', 'stroke')
                            .attr('stroke-linejoin', 'round');
                        this._selectedEl = element;

                        // Trigger postUrls update - fall back to monitored keyword posturls if the lead has none
                        const lead = dataToUse.find(l => l.name === cleanName);
                        let posturls = lead ? (lead.posturls || []) : null;
                        if (!posturls || posturls.length === 0) {
                            const mk = monitoredKeywords.find(m => m.name.toLowerCase() === cleanName.toLowerCase() && m.last_seen);
                            if (mk) posturls = mk.posturls || [];
                        }
                        if (this.props.setPostUrls) this.props.setPostUrls(posturls || [], cleanName);
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
                text: isMonitored ? `${lead.name}*` : lead.name,
                value: lead.occurrences,
            };
        });

        if (fromSourceFilter !== 'trendy_words') {
            const existingNames = new Set(dataToUse.map(l => l.name.toLowerCase()));
            monitoredKeywords
                .filter(mk => mk.last_seen && !existingNames.has(mk.name.toLowerCase()))
                .forEach(mk => words.push({ text: `${mk.name}*`, value: 1 }));
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