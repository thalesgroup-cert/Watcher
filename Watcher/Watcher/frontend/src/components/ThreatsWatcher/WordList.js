import React, { Component, Fragment } from 'react';
import { connect } from 'react-redux';
import PropTypes from 'prop-types';
import { getLeads, deleteLead, addBannedWord } from "../../actions/leads";
import { updateDateFilter } from "../../actions/dateFilter";  
import Button from 'react-bootstrap/Button';
import Modal from 'react-bootstrap/Modal';

export class WordList extends Component {
    constructor(props) {
        super(props);
        this.state = {
            show: false,
            id: 0,
            word: "",
            name: ""
        };
    }

    static propTypes = {
        leads: PropTypes.array.isRequired,
        getLeads: PropTypes.func.isRequired,
        deleteLead: PropTypes.func.isRequired,
        addBannedWord: PropTypes.func.isRequired,
        updateDateFilter: PropTypes.func.isRequired,  
        auth: PropTypes.object.isRequired,
        dateFilter: PropTypes.object.isRequired 
    };

    componentDidMount() {
        this.props.getLeads();
    }

    displayModal = (id, word) => {
        this.setState({
            show: true,
            id: id,
            word: word,
        });
    };

    modal = () => {
        let handleClose = () => {
            this.setState({ show: false });
        };

        let onSubmit = e => {
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
                <Modal.Body>Are you sure you want to <u>delete</u> and add to <u>blocklist</u>
                    <b> {this.state.word}</b> word?</Modal.Body>
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

    handleFilterChange = (e) => {
        const { name, value } = e.target;
        this.props.updateDateFilter({ ...this.props.dateFilter, [name]: value });
    };

    render() {
        const { leads, dateFilter, auth: { isAuthenticated } } = this.props;

      
        const filteredLeads = leads.filter(lead => {
            if (!lead.created_at) return false;

            const leadDateTime = new Date(lead.created_at);
            const { startDate, startTime, endDate, endTime } = dateFilter;

            if (!startDate && !endDate) return true;

            const startDateTime = startDate 
                ? new Date(`${startDate}T${startTime}:00`) 
                : null;
            const endDateTime = endDate 
                ? new Date(`${endDate}T${endTime}:59`) 
                : null;

            return (!startDateTime || leadDateTime >= startDateTime) && 
                   (!endDateTime || leadDateTime <= endDateTime);
        });

        return (
            <Fragment>
                <h4>Trendy Words</h4>

              
                <div className="filters mb-3" style={{
                    padding: '15px',
                    backgroundColor: 'rgba(30, 30, 30, 0.5)',
                    borderRadius: '5px',
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '15px'
                }}>
                    <div>
                        <label style={{ color: '#fff', marginRight: '10px' }}>
                            Start Date:
                            <input
                                type="date"
                                name="startDate"
                                value={dateFilter.startDate || ''}
                                onChange={this.handleFilterChange}
                                style={{
                                    marginLeft: '5px',
                                    backgroundColor: "#1e1e1e",
                                    color: "#ffffff",
                                    border: "1px solid #0288d1",
                                    borderRadius: "4px",
                                    padding: "4px"
                                }}
                            />
                        </label>
                    </div>
                    <div>
                        <label style={{ color: '#fff', marginRight: '10px' }}>
                            End Date:
                            <input
                                type="date"
                                name="endDate"
                                value={dateFilter.endDate || ''}
                                onChange={this.handleFilterChange}
                                style={{
                                    marginLeft: '5px',
                                    backgroundColor: "#1e1e1e",
                                    color: "#ffffff",
                                    border: "1px solid #0288d1",
                                    borderRadius: "4px",
                                    padding: "4px"
                                }}
                            />
                        </label>
                    </div>
                </div>

                <div style={{ height: '415px', overflow: 'auto' }}>
                    <table className="table table-striped table-hover">
                        <thead>
                            <tr>
                                <th>Name</th>
                                <th>Caught</th>
                                <th>Found</th>
                                <th />
                            </tr>
                        </thead>
                        <tbody>
                            {filteredLeads.map(lead => (
                                <tr key={lead.id}>
                                    <td onClick={() => {
                                        this.props.setPostUrls(lead.posturls, lead.name);
                                    }}>
                                        <h5>{lead.name}</h5>
                                    </td>
                                    <td className="text-center">{lead.occurrences}</td>
                                    <td>{new Date(lead.created_at).toLocaleString()}</td>
                                    <td>
                                        {isAuthenticated && (
                                            <button
                                                onClick={() => this.displayModal(lead.id, lead.name)}
                                                className="btn btn-danger btn-sm"
                                            >
                                                Delete
                                            </button>
                                        )}
                                    </td>
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
    dateFilter: state.dateFilter, 
    leads: state.leads.leads,
    auth: state.auth
});

export default connect(mapStateToProps, { getLeads, deleteLead, addBannedWord, updateDateFilter })(WordList);