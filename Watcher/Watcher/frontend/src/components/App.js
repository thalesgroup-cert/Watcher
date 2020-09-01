import React, {Component, Fragment} from 'react';
import ReactDOM from 'react-dom';
import {
    HashRouter as Router,
    Route,
    Switch
} from "react-router-dom";

import Header from "./layout/Header";
import Alerts from "./layout/Alerts";
import {transitions, positions, Provider as AlertProvider} from "react-alert";
import AlertTemplate from "react-alert-template-oldschool-dark";
import Dashboard from "./ThreatsWatcher/Dashboard";
import Login from "./accounts/Login";
import PasswordChange from "./accounts/PasswordChange";
import DataLeakDashboard from './DataLeak/Dashboard'
import SiteMonitoringDashboard from './SiteMonitoring/Dashboard'
import DnsFinderDashboard from './DnsFinder/Dashboard'

import PrivateRoute from "./common/PrivateRoute";

import {Provider} from 'react-redux';
import store from "../store";
import {loadUser} from "../actions/auth";

// Alert Options
const alertOptions = {
    timeout: 4000,
    position: positions.TOP_CENTER,
    transition: transitions.SCALE
};

class App extends Component {
    componentDidMount() {
        store.dispatch(loadUser());
    }

    render() {
        return (
            <Provider store={store}>
                <AlertProvider template={AlertTemplate} {...alertOptions}>
                    <Router>
                        <Fragment>
                            <Header/>
                            <Alerts/>
                            <div className="container-fluid">
                                <Switch>
                                    <Route exact path="/" component={Dashboard}/>
                                    <Route exact path="/login" component={Login}/>
                                    <PrivateRoute exact path="/password_change" component={PasswordChange}/>
                                    <PrivateRoute exact path="/data_leak" component={DataLeakDashboard}/>
                                    <PrivateRoute exact path="/website_monitoring" component={SiteMonitoringDashboard}/>
                                    <PrivateRoute exact path="/dns_finder" component={DnsFinderDashboard}/>
                                </Switch>
                            </div>
                            <br/>
                        </Fragment>
                    </Router>
                </AlertProvider>
            </Provider>
        );
    }
}

ReactDOM.render(<App/>, document.getElementById('app'));