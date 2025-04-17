import React, {Component, Fragment} from 'react';

import 'd3-transition';
import {select} from 'd3-selection';
import ReactWordcloud from 'react-wordcloud';
import PropTypes from "prop-types";
import {connect} from "react-redux";
import {getLeads} from "../../actions/leads";

const options = {
    colors: ['#0288d1', '#005b9f', '#00bcd4', '#008ba3', '#62efff', '#90caf9', '#c3fdff', '#5d99c6'],
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
    }

    static propTypes = {
        leads: PropTypes.array.isRequired
    };

    getCallback = (callback) => {
        return (word, event) => {
            const isActive = callback !== 'onWordMouseOut';
            const element = event.target;
            const text = select(element);
            text
                .on('click', () => {
                    if (isActive) {
                        this.props.leads.map(lead => {
                            if (lead.name === word.text) {
                                this.props.setPostUrls(lead.posturls, word.text)
                            }
                        });
                    }
                })
                .transition()
                .attr('font-weight', isActive ? 'bold' : 'normal');
        };
    };

    callbacks = {
        //getWordColor: word => (word.value > 50 ? 'orange' : 'purple'),
        getWordTooltip: word =>
            `The word "${word.text}" caught ${word.value} times.`,
        onWordClick: this.getCallback('onWordClick'),
        onWordMouseOut: this.getCallback('onWordMouseOut'),
        onWordMouseOver: this.getCallback('onWordMouseOver'),
    };

    // Called when this component is load on the dashboard
    componentDidMount() {
        // Remember that getLeads() send HTTP GET request to the Backend API
        this.props.getLeads();
    };

    render() {
        const {leads} = this.props;

        const words = leads.map(lead => {
            return {
                text: lead.name,
                value: lead.occurrences,
            };
        });

        return (
            <Fragment>
                <ReactWordcloud options={options} callbacks={this.callbacks} words={words}/>
            </Fragment>
        )
    }
}

const mapStateToProps = state => ({
    leads: state.leads.leads
});

export default connect(mapStateToProps, {getLeads})(WordCloud);