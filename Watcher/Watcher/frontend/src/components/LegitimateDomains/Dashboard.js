import React, { Component, Fragment } from 'react';
import { connect } from 'react-redux';
import PropTypes from 'prop-types';
import { getLegitimateDomains, getLegitimateDomainsBatch } from '../../actions/LegitimateDomain';
import LegitimateStats from './LegitimateStats';
import LegitimateDomains from './LegitimateDomains';
import PanelGrid from '../common/PanelGrid';
import store from "../../store";
import {setIsPasswordChanged} from "../../actions/auth";

const DEFAULT_LAYOUT = [
    { i: 'stats',   x: 0, y: 0, w: 12, h: 9,  minW: 2, minH: 3 },
    { i: 'domains', x: 0, y: 3, w: 12, h: 11, minW: 5, minH: 6 },
];

const DEFAULT_ACTIVE = ['stats', 'domains'];

class Dashboard extends Component {
    static propTypes = {
        auth: PropTypes.object.isRequired,
        domains: PropTypes.array.isRequired,
        domainsCount: PropTypes.number,
        domainsNext: PropTypes.string,
        getLegitimateDomains: PropTypes.func.isRequired,
        getLegitimateDomainsBatch: PropTypes.func.isRequired,
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

    loadRemainingDomainsInBackground = () => {
        if (this.props.domainsNext) {
            this.props.getLegitimateDomainsBatch(2, 100);
        }
    };

    onDataFiltered = (filteredDomains) => {
        this.setState({ filteredDomains });
    };

    buildPanels() {
        return {
            stats: {
                label: 'Statistics',
                icon: 'bar_chart',
                children: (
                    <div style={{ padding: '12px 16px', height: '100%', overflowY: 'auto' }}>
                        <LegitimateStats />
                    </div>
                ),
            },
            domains: {
                label: 'Legitimate Domains',
                icon: 'domain',
                children: (
                    <div style={{ padding: '12px 16px', height: '100%', overflowY: 'auto' }}>
                        <LegitimateDomains onDataFiltered={this.onDataFiltered} />
                    </div>
                ),
            },
        };
    }

    render() {
        return (
            <Fragment>
                <PanelGrid
                    panels={this.buildPanels()}
                    defaultLayout={DEFAULT_LAYOUT}
                    defaultActive={DEFAULT_ACTIVE}
                    storageKey="watcher_legitimate_domains_grid"
                />
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
    getLegitimateDomains,
    getLegitimateDomainsBatch,
})(Dashboard);