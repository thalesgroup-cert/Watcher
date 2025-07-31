import React, {Component, Fragment} from 'react';
import {connect} from 'react-redux';
import PropTypes from 'prop-types';
import {getLeads, deleteLead, addBannedWord} from "../../actions/leads";
import Button from 'react-bootstrap/Button';
import Modal from 'react-bootstrap/Modal';

const InfoTooltip = ({ text }) => (
    <i
        className="material-icons text-info ml-1"
        style={{ fontSize: '16px', verticalAlign: 'middle', cursor: 'pointer' }}
        title={text}
        aria-label={text}
        tabIndex={0}
    >
        info
    </i>
);

export class WordList extends Component {
    constructor(props) {
        super(props);
        this.state = {
            show: false,
            id: 0,
            word: "",
            name: ""
        }
    }

    static propTypes = {
        leads: PropTypes.array.isRequired,
        getLeads: PropTypes.func.isRequired,
        deleteLead: PropTypes.func.isRequired,
        addBannedWord: PropTypes.func.isRequired,
        auth: PropTypes.object.isRequired
    };

    // Called when this component is load on the dashboard
    componentDidMount() {
        // Remember that getLeads() send HTTP GET request to the Backend API
        this.props.getLeads();
    }

    displayModal = (id, word) => {
        this.setState({ show: true, id, word });
    };

    modal = () => {
        const handleClose = () => this.setState({ show: false });

        const onSubmit = e => {
            e.preventDefault();
            const name = this.state.word;
            const banned_word = { name };
            this.props.deleteLead(this.state.id, this.state.word);
            this.props.addBannedWord(banned_word);
            this.setState({ word: "", id: 0 });
            handleClose();
        };

        return (
            <Modal show={this.state.show} onHide={handleClose} centered>
                <Modal.Header closeButton>
                    <Modal.Title>Action Requested</Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    Are you sure you want to <u>delete</u> and add to <u>blocklist</u>
                    <b> {this.state.word}</b> word?
                </Modal.Body>
                <Modal.Footer>
                    <form onSubmit={onSubmit}>
                        <Button variant="secondary" className="mr-2" onClick={handleClose}>
                            Close
                        </Button>
                        <Button type="submit" variant="danger">
                            Yes, I'm sure
                        </Button>
                    </form>
                </Modal.Footer>
            </Modal>
        );
    };

    render() {
        const { isAuthenticated } = this.props.auth;

        const authLinks = (id, name) => (
            <button onClick={() => this.displayModal(id, name)} className="btn btn-outline-primary btn-sm">
                Delete & BlockList
            </button>
        );

        const infoTexts = {
            name: "The word identified as trending",
            caught: "Number of times this word has been detected",
            reliability: "Indicates how reliable this word is, based on the average reliability of its sources",
            found: "Date and time this word first appeared on Watcher"
        };        

        return (
            <Fragment>
                <h4>Trendy Words</h4>
                <div style={{ height: '415px', overflow: 'auto' }}>
                    <table className="table table-striped table-hover">
                        <thead>
                            <tr>
                                <th>
                                    Name
                                    <InfoTooltip text={infoTexts.name} />
                                </th>
                                <th>
                                    Caught
                                    <InfoTooltip text={infoTexts.caught} />
                                </th>
                                <th>
                                    Reliability
                                    <InfoTooltip text={infoTexts.reliability} />
                                </th>
                                <th>
                                    Found
                                    <InfoTooltip text={infoTexts.found} />
                                </th>
                                <th />
                            </tr>
                        </thead>
                        <tbody>
                            {this.props.leads.map(lead => (
                                <tr key={lead.id}>
                                    <td onClick={() => this.props.setPostUrls(lead.posturls, lead.name)}>
                                        <h5>{lead.name}</h5>
                                    </td>
                                    <td className="text-center">{lead.occurrences}</td>
                                    <td className="text-center">{lead.score ? `${lead.score.toFixed(1)}%` : 'N/A'}</td>
                                    <td>{new Date(lead.created_at).toLocaleString()}</td>
                                    <td>{isAuthenticated && authLinks(lead.id, lead.name)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                {this.modal()}
            </Fragment>
        );
    }
}

const mapStateToProps = state => ({
    leads: state.leads.leads,
    auth: state.auth
});

export default connect(mapStateToProps, { getLeads, deleteLead, addBannedWord })(WordList);