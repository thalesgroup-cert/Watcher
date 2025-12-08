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
        domainsCount: PropTypes.number,
        domainsNext: PropTypes.string,
        getLegitimateDomains: PropTypes.func.isRequired,
    };

    constructor(props) {
        super(props);
        this.state = {
            filteredDomains: []
        };
        this.loadingTimer = null;
    }

    componentDidMount() {
        store.dispatch(setIsPasswordChanged());
        this.loadInitialData();
    }

    componentWillUnmount() {
        if (this.loadingTimer) {
            clearTimeout(this.loadingTimer);
        }
    }

    loadInitialData = async () => {
        try {
            await this.props.getLegitimateDomains(1, 100);

            this.loadingTimer = setTimeout(() => {
                this.loadRemainingDomainsInBackground();
            }, 500);
        } catch (error) {
        }
    };

    loadRemainingDomainsInBackground = async () => {
        const { domainsNext } = this.props;
        
        if (!domainsNext) {
            return;
        }

        try {
            let currentPage = 2;
            let hasMore = true;

            while (hasMore) {
                try {
                    const response = await this.props.getLegitimateDomains(currentPage, 100);
                    hasMore = response.next !== null;
                    currentPage++;

                    if (hasMore) {
                        await new Promise(resolve => setTimeout(resolve, 300));
                    }
                } catch (error) {
                    hasMore = false;
                }
            }
        } catch (error) {
        }
    };

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
    domains: state.LegitimateDomain.domains || [],
    domainsCount: state.LegitimateDomain.domainsCount || 0,
    domainsNext: state.LegitimateDomain.domainsNext || null
});

export default connect(mapStateToProps, {
    getLegitimateDomains
})(Dashboard);