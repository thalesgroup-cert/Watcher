import React, {Component} from 'react';
import {Link} from "react-router-dom";
import {connect} from "react-redux";
import PropTypes from "prop-types";
import {logout} from "../../actions/auth";
import Dropdown from "react-bootstrap/Dropdown";

export class Header extends Component {
    static  propTypes = {
        auth: PropTypes.object.isRequired,
        logout: PropTypes.func.isRequired
    };

    render() {
        const {isAuthenticated, user} = this.props.auth;

        const authLinks = (
            <ul className="navbar-nav ml-auto mt-lg-0">
                <Link to="/password_change" className="nav-link mr-2" replace>Password
                    Change</Link>
                <Dropdown>
                    <Dropdown.Toggle variant="secondary" id="dropdown-basic">
                        {user ? `Welcome ${user.first_name ? user.first_name : user.username}` : ""}
                    </Dropdown.Toggle>

                    <Dropdown.Menu>
                        <Dropdown.Item onClick={this.props.logout}>
                            Logout
                        </Dropdown.Item>
                    </Dropdown.Menu>
                </Dropdown>
            </ul>
        );

        const guestLinks = (
            <ul className="navbar-nav ml-auto mt-lg-0">
                <li className="nav-item">
                    <Link to="/login" className="nav-link" replace>Login</Link>
                </li>
            </ul>
        );

        return (
            <nav className="navbar navbar-expand-sm navbar-dark bg-primary">
                <div className="container-fluid">
                    <Link to="/" className="navbar-brand" replace><img src="static/img/round-logo-fav.png" width="41"
                                                                       height="41"
                                                                       alt="Watcher"/><span
                        className="ml-2" style={{verticalAlign: 'middle'}}>Watcher</span></Link>
                    <ul className="navbar-nav ml-auto mt-lg-0">
                        <Link to="/data_leak" className="nav-link" replace>Data Leak</Link>
                    </ul>
                    <ul className="navbar-nav ml-auto mt-lg-0">
                        <Link to="/website_monitoring" className="nav-link" replace>Website Monitoring</Link>
                    </ul>
                    <ul className="navbar-nav ml-auto mt-lg-0">
                        <Link to="/dns_finder" className="nav-link" replace>Twisted DNS Finder</Link>
                    </ul>
                    <button className="navbar-toggler" type="button" data-toggle="collapse" data-target="#navbarColor01"
                            aria-controls="navbarColor01" aria-expanded="false" aria-label="Toggle navigation">
                        <span className="navbar-toggler-icon"></span>
                    </button>
                    <div className="collapse navbar-collapse" id="navbarColor01">
                        {isAuthenticated ? authLinks : guestLinks}
                    </div>
                </div>
            </nav>
        )
    }
}

const mapStateToProps = state => ({
    auth: state.auth
});

export default connect(mapStateToProps, {logout})(Header);