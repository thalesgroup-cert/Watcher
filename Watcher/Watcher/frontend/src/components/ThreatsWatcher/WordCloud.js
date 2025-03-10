import React, { Component, Fragment } from 'react';
import 'd3-transition';
import { select } from 'd3-selection';
import ReactWordcloud from 'react-wordcloud';
import PropTypes from "prop-types";
import { connect } from "react-redux";
import { getLeads } from "../../actions/leads";

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
        this.state = {
            startDate: "", 
            startTime: "00:00",
            endDate: "",   
            endTime: "23:59",
        };
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
        getWordTooltip: word => {
            console.log("🟢 Mot affiché dans WordCloud :", word.text);
            return `The word "${word.text}" appeared ${word.value} times.`;
        },
        onWordClick: this.getCallback('onWordClick'),
        onWordMouseOut: this.getCallback('onWordMouseOut'),
        onWordMouseOver: this.getCallback('onWordMouseOver'),
    };

    componentDidMount() {
        this.props.getLeads();
    }

    render() {
        const { leads } = this.props;
        const { startDate, endDate, startTime, endTime } = this.state;

        console.log("Filtres appliqués :");
        console.log("Start Date:", startDate, "Start Time:", startTime);
        console.log("End Date:", endDate, "End Time:", endTime);

        const filteredWords = leads
            .filter(lead => {
                if (!lead.created_at) return false; 

                const leadDateTime = new Date(lead.created_at); 

                if (!startDate && !endDate) return true; 

                const startDateTime = startDate 
                    ? new Date(`${startDate}T${startTime || "00:00"}:00`) 
                    : null;
                const endDateTime = endDate 
                    ? new Date(`${endDate}T${endTime || "23:59"}:59`) 
                    : null;

                if (isNaN(leadDateTime.getTime())) return false;

                return (!startDateTime || leadDateTime >= startDateTime) && 
                       (!endDateTime || leadDateTime <= endDateTime);
            })
            .map(lead => ({
                text: lead.name,
                value: lead.occurrences,
            }));

        console.log("📌 Nombre de mots après filtrage :", filteredWords.length);
        console.log("📌 Mots filtrés :", filteredWords);

        return (
            <Fragment>
                {/* Filtres de sélection des dates et heures */}
                <div style={{ marginBottom: '10px' }}>
                    <label>
                        Date de début :
                        <input 
                            type="date" 
                            value={startDate} 
                            onChange={(e) => this.setState({ startDate: e.target.value })} 
                            style={{
                                backgroundColor: "#1e1e1e",
                                color: "#ffffff",
                                border: "1px solid #0288d1",
                                padding: "5px",
                                borderRadius: "5px",
                                marginLeft: "5px"
                            }}
                        />
                    </label>
                    <label style={{ marginLeft: '10px' }}>
                        Heure de début :
                        <input 
                            type="time" 
                            value={startTime} 
                            onChange={(e) => this.setState({ startTime: e.target.value })} 
                            style={{
                                backgroundColor: "#1e1e1e",
                                color: "#ffffff",
                                border: "1px solid #0288d1",
                                padding: "5px",
                                borderRadius: "5px",
                                marginLeft: "5px"
                            }}
                        />
                    </label>

                    <label style={{ marginLeft: '10px' }}>
                        Date de fin :
                        <input 
                            type="date" 
                            value={endDate} 
                            onChange={(e) => this.setState({ endDate: e.target.value })} 
                            style={{
                                backgroundColor: "#1e1e1e",
                                color: "#ffffff",
                                border: "1px solid #0288d1",
                                padding: "5px",
                                borderRadius: "5px",
                                marginLeft: "5px"
                            }}
                        />
                    </label>
                    <label style={{ marginLeft: '10px' }}>
                        Heure de fin :
                        <input 
                            type="time" 
                            value={endTime} 
                            onChange={(e) => this.setState({ endTime: e.target.value })} 
                            style={{
                                backgroundColor: "#1e1e1e",
                                color: "#ffffff",
                                border: "1px solid #0288d1",
                                padding: "5px",
                                borderRadius: "5px",
                                marginLeft: "5px"
                            }}
                        />
                    </label>
                </div>

                {/* Affichage du nuage de mots filtré */}
                {filteredWords.length > 0 ? (
                    <div style={{ height: "500px", width: "100%", display: "flex", justifyContent: "center", alignItems: "center" }}>
                        <ReactWordcloud options={options} callbacks={this.callbacks} words={filteredWords} />
                    </div>
                ) : (
                    <p style={{ color: "white", textAlign: "center", marginTop: "20px" }}>
                        Aucun mot trouvé pour cette plage horaire.
                    </p>
                )}
            </Fragment>
        );
    }
}

const mapStateToProps = state => ({
    leads: state.leads.leads
});

export default connect(mapStateToProps, { getLeads })(WordCloud);
