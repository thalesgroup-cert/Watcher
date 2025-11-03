import React, { Component, Fragment } from 'react';
import { connect } from 'react-redux';
import PropTypes from 'prop-types';
import { getLegitimateDomains } from '../../actions/LegitimateDomain';
import LegitimateDomains from './LegitimateDomains';
import LegitimateStats from './LegitimateStats';
import store from "../../store";
import {setIsPasswordChanged} from "../../actions/auth";

class Dashboard extends Component {
    static propTypes = {
        auth: PropTypes.object.isRequired,
        domains: PropTypes.array.isRequired,
        getLegitimateDomains: PropTypes.func.isRequired,
    };

    constructor(props) {
        super(props);
        this.state = {
            filteredDomains: []
        };
    }

    componentDidMount() {
        store.dispatch(setIsPasswordChanged());
        this.props.getLegitimateDomains();
    }

    onDataFiltered = (filteredData) => {
        this.setState({ filteredDomains: filteredData });
    };

    render() {
        const { domains } = this.props;
        const { filteredDomains } = this.state;

        return (
            <Fragment>
                <div className="container-fluid mt-3">
                    <div className="row">
                        <div className="col-lg-12">
                            <LegitimateStats domains={filteredDomains.length > 0 ? filteredDomains : domains} />
                            <LegitimateDomains onDataFiltered={this.onDataFiltered} />
                        </div>
                    </div>
                </div>
            </Fragment>
        );
    }
}

const mapStateToProps = state => ({
    auth: state.auth,
    domains: state.LegitimateDomain ? state.LegitimateDomain.domains || [] : []
});

export default connect(mapStateToProps, {
    getLegitimateDomains
})(Dashboard);