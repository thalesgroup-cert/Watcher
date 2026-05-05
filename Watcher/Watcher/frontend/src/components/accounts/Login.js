import React, { Component } from "react";
import { Redirect } from "react-router-dom";
import { connect } from "react-redux";
import PropTypes from "prop-types";
import { login } from "../../actions/auth";
import { createMessage } from "../../actions/messages";

export class Login extends Component {
    state = {
        username: "",
        password: "",
    };

    static propTypes = {
        login: PropTypes.func.isRequired,
        createMessage: PropTypes.func.isRequired,
        isAuthenticated: PropTypes.bool,
        location: PropTypes.object
    };

    componentDidMount() {
        const params = new URLSearchParams(window.location.search);
        if (params.get('sso_error')) {
            window.history.replaceState({}, document.title, window.location.pathname + window.location.hash);
            this.props.createMessage({ ssoError: "SSO authentication failed. Please try again or sign in with your credentials." });
        }
    }

    onSubmit = e => {
        e.preventDefault();
        this.props.login(this.state.username, this.state.password);
    };

    onChange = e => this.setState({ [e.target.name]: e.target.value });

    render() {
        if (this.props.isAuthenticated) {
            const redirectPath = this.props.location.state?.from || '/';
            
            return <Redirect to={redirectPath} />;
        }

        const { username, password } = this.state;
        return (
            <div className="col-md-6 m-auto">
                <div className="card card-body mt-5">
                    <h2 className="text-center text-body mb-4">Login</h2>
                    <div className="mb-3">
                        <a
                            href={window.OIDC_ENABLED ? "/api/auth/oidc/login/" : "#"}
                            className={`btn w-100 ${window.OIDC_ENABLED ? 'btn-outline-primary' : 'btn-secondary disabled'}`}
                            style={{ pointerEvents: window.OIDC_ENABLED ? 'auto' : 'none', opacity: window.OIDC_ENABLED ? 1 : 0.55 }}
                            tabIndex={window.OIDC_ENABLED ? 0 : -1}
                            aria-disabled={!window.OIDC_ENABLED}
                        >
                            <i className="material-icons me-1 align-middle" style={{fontSize: 18, verticalAlign: 'middle'}}>vpn_key</i>
                            {' '}Sign in with {window.OIDC_COMPANY_NAME ? `${window.OIDC_COMPANY_NAME} SSO` : 'SSO'}
                        </a>
                    </div>
                    <div className="text-center text-body mb-3" style={{fontSize: 12}}>OR</div>
                    <form onSubmit={this.onSubmit}>
                        <div className="mb-3">
                            <label>Username</label>
                            <input
                                type="text"
                                className="form-control"
                                name="username"
                                onChange={this.onChange}
                                value={username}
                            />
                        </div>
                        <div style={{ marginBottom: "1.5rem" }} />
                        <div className="mb-3">
                            <label>Password</label>
                            <input
                                type="password"
                                className="form-control"
                                name="password"
                                onChange={this.onChange}
                                value={password}
                                maxLength="100"
                            />
                        </div>
                        <div style={{ marginBottom: "1.5rem" }} />
                        <div className="mb-3">
                            <button 
                                type="submit" 
                                className="btn btn-primary"
                                disabled={this.state.username === "" || this.state.password === ""}
                            >
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
    { login, createMessage }
)(Login);