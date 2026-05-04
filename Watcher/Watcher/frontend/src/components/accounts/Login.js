import React, { Component } from "react";
import { Redirect } from "react-router-dom";
import { connect } from "react-redux";
import PropTypes from "prop-types";
import { login } from "../../actions/auth";

export class Login extends Component {
    state = {
        username: "",
        password: ""
    };

    static propTypes = {
        login: PropTypes.func.isRequired,
        isAuthenticated: PropTypes.bool,
        location: PropTypes.object
    };

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
                    <h2 className="text-center">Login</h2>
                    <div className="mb-3">
                        <a
                            href={window.OIDC_ENABLED ? "/api/auth/oidc/login/" : "#"}
                            className={`btn btn-outline-primary w-100${window.OIDC_ENABLED ? '' : ' disabled'}`}
                            style={window.OIDC_ENABLED ? {} : {opacity: 0.5, pointerEvents: 'none'}}
                        >
                            <i className="material-icons me-1 align-middle" style={{fontSize: 18, verticalAlign: 'middle'}}>vpn_key</i>
                            {' '}Sign in with {window.OIDC_COMPANY_NAME ? `${window.OIDC_COMPANY_NAME} SSO` : 'SSO'}
                        </a>
                    </div>
                    <div className="text-center text-muted mb-3" style={{fontSize: 12}}>OR</div>
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
    { login }
)(Login);