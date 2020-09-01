import React, {Component} from "react";
import {Redirect} from "react-router-dom";
import {connect} from "react-redux";
import PropTypes from "prop-types";
import {login} from "../../actions/auth";
import DataLeakDashboard from "../DataLeak/Dashboard";
import PasswordChange from "./PasswordChange";
import SiteMonitoringDashboard from "../SiteMonitoring/Dashboard";
import DnsFinderDashboard from "../DnsFinder/Dashboard";

export class Login extends Component {
    state = {
        username: "",
        password: ""
    };

    static propTypes = {
        login: PropTypes.func.isRequired,
        isAuthenticated: PropTypes.bool
    };

    onSubmit = e => {
        e.preventDefault();
        this.props.login(this.state.username, this.state.password);
    };

    onChange = e => this.setState({[e.target.name]: e.target.value});

    render() {
        if (this.props.isAuthenticated) {
            if (typeof this.props.location.state !== 'undefined') {
                switch (this.props.location.state.redirectToComponent) {
                    case DataLeakDashboard:
                        return <Redirect to="/data_leak"/>;
                    case SiteMonitoringDashboard:
                        return <Redirect to="/website_monitoring"/>;
                    case DnsFinderDashboard:
                        return <Redirect to="/dns_finder"/>;
                    case PasswordChange:
                        return <Redirect to="/password_change"/>;
                }
            }
            return <Redirect to="/"/>;
        }
        const {username, password} = this.state;
        return (
            <div className="col-md-6 m-auto">
                <div className="card card-body mt-5">
                    <h2 className="text-center">Login</h2>
                    <form onSubmit={this.onSubmit}>
                        <div className="form-group">
                            <label>Username</label>
                            <input
                                type="text"
                                className="form-control"
                                name="username"
                                onChange={this.onChange}
                                value={username}
                            />
                        </div>
                        <div className="form-group">
                            <label>Password</label>
                            <input
                                type="password"
                                className="form-control"
                                name="password"
                                onChange={this.onChange}
                                value={password}
                                maxLength="30"
                            />
                        </div>
                        <div className="form-group">
                            <button type="submit" className="btn btn-primary"
                                    disabled={this.state.username === "" || this.state.password === ""}>
                                Login
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        );
    }
}

const mapStateToProps = state => ({
    isAuthenticated: state.auth.isAuthenticated
});

export default connect(
    mapStateToProps,
    {login}
)(Login);