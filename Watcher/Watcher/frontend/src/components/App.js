import React, {Component, Fragment, useState, useEffect} from 'react';
import ReactDOM from 'react-dom';
import {
    HashRouter as Router,
    Route,
    Switch,
    Redirect
} from "react-router-dom";

import Header from "./layout/Header";
import Alerts from "./layout/Alerts";
import {transitions, positions, Provider as AlertProvider} from "react-alert";
import Dashboard from "./ThreatsWatcher/Dashboard";
import Login from "./accounts/Login";
import PasswordChange from "./accounts/PasswordChange";
import DataLeakDashboard from './DataLeak/Dashboard'
import SiteMonitoringDashboard from './SiteMonitoring/Dashboard'
import DnsFinderDashboard from './DnsFinder/Dashboard'
import LegitimateDomainsDashboard from './LegitimateDomains/Dashboard';
import NotFound from './common/NotFound';
import AlertTemplate from "./common/AlertTemplate";

import PrivateRoute from "./common/PrivateRoute";

import {Provider} from 'react-redux';
import store from "../store";
import {loadUser} from "../actions/auth";
import { ThemeProvider } from '../contexts/ThemeContext';

// Alert Options
const alertOptions = {
    timeout: 3000,
    position: positions.TOP_CENTER,
    transition: transitions.SCALE
};

// Scroll to Top Button
function ScrollToTopButton() {
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        const handleScroll = () => setVisible(window.pageYOffset > 100);
        window.addEventListener("scroll", handleScroll);
        return () => window.removeEventListener("scroll", handleScroll);
    }, []);

    const scrollToTop = () => {
        const duration = 600, start = window.scrollY, startTime = performance.now();
        function animateScroll(now) {
            const progress = Math.min((now - startTime) / duration, 1);
            window.scrollTo(0, start * (1 - progress));
            if (progress < 1) requestAnimationFrame(animateScroll);
        }
        requestAnimationFrame(animateScroll);
    };

    return (
        <button
            onClick={scrollToTop}
            className="btn btn-primary rounded-circle shadow-lg"
            style={{
                display: visible ? "flex" : "none",
                alignItems: "center",
                justifyContent: "center",
                position: "fixed",
                bottom: 30,
                right: 30,
                zIndex: 9999,
                width: 68,
                height: 68,
                border: "3px solid #fff",
                transition: "opacity 0.3s",
            }}
            aria-label="Scroll to top"
            title="Scroll to top"
        >
            <svg width="36" height="36" viewBox="0 0 36 36" style={{display: "block"}}>
                <polyline
                    points="10,22 18,14 26,22"
                    fill="none"
                    stroke="#fff"
                    strokeWidth="3.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                />
            </svg>
        </button>
    );
}

class App extends Component {
    componentDidMount() {
        store.dispatch(loadUser());
    }

    render() {
        return (
            <Provider store={store}>
                <ThemeProvider>
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
                                        <Route exact path="/legitimate_domains" component={LegitimateDomainsDashboard}/>
                                        <PrivateRoute exact path="/data_leak" component={DataLeakDashboard}/>
                                        <PrivateRoute exact path="/website_monitoring" component={SiteMonitoringDashboard}/>
                                        <PrivateRoute exact path="/dns_finder" component={DnsFinderDashboard}/>
                                        <Route component={NotFound}/>
                                    </Switch>
                                </div>
                                <ScrollToTopButton />
                                <br/>
                            </Fragment>
                        </Router>
                    </AlertProvider>
                </ThemeProvider>
            </Provider>
        );
    }
}

ReactDOM.render(<App/>, document.getElementById('app'));