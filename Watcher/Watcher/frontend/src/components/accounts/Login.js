import React, { Component, Fragment } from "react";
import { Redirect } from "react-router-dom";
import { connect } from "react-redux";
import PropTypes from "prop-types";
import { login } from "../../actions/auth";
import { createMessage } from "../../actions/messages";

export class Login extends Component {
    state = {
        username: "",
        password: "",
        showPassword: false,
    };

    static propTypes = {
        login: PropTypes.func.isRequired,
        createMessage: PropTypes.func.isRequired,
        isAuthenticated: PropTypes.bool,
        location: PropTypes.object,
        loginMode: PropTypes.string,
        oidcCompanyName: PropTypes.string,
    };

    componentDidMount() {
        const params = new URLSearchParams(window.location.search);
        if (params.get("sso_error")) {
            window.history.replaceState({}, document.title, window.location.pathname + window.location.hash);
            this.props.createMessage({
                ssoError: "SSO authentication failed. Please try again or sign in with your credentials.",
            });
        }
    }

    onSubmit = e => {
        e.preventDefault();
        this.props.login(this.state.username, this.state.password);
    };

    onChange = e => this.setState({ [e.target.name]: e.target.value });

    togglePassword = () => this.setState(s => ({ showPassword: !s.showPassword }));

    render() {
        if (this.props.isAuthenticated) {
            const redirectPath = this.props.location?.state?.from || "/";
            return <Redirect to={redirectPath} />;
        }

        const { username, password, showPassword } = this.state;

        const loginMode = this.props.loginMode || "form_only";
        const hasSso    = loginMode === "both" || loginMode === "sso_only";
        const hasForm   = loginMode === "both" || loginMode === "form_only";
        const ssoLabel  = this.props.oidcCompanyName ? `${this.props.oidcCompanyName} SSO` : "SSO";

        return (
            <div className="container" style={{ maxWidth: 860, marginTop: "2.5rem" }}>
                <div className="card shadow border-0 overflow-hidden">
                    <div className="row g-0">

                        {/* ── Left panel — brand + features ─────────────────────── */}
                        <div className="col-lg-5 d-none d-lg-flex flex-column justify-content-between p-4 bg-primary text-white">
                            {/* Brand */}
                            <div>
                                <div className="d-flex align-items-center mb-3">
                                    <img
                                        src="/static/img/round-logo-fav.png"
                                        alt="Watcher"
                                        width={48}
                                        height={48}
                                        className="me-3"
                                    />
                                    <span className="fw-bold fs-4">Watcher</span>
                                </div>
                                <p className="small opacity-75" style={{ maxWidth: 260 }}>
                                    Open Source AI-powered Cyber Threat Intelligence & Hunting Platform.
                                </p>
                            </div>

                            {/* Feature bullets */}
                            <ul className="list-unstyled mb-0">
                                {[
                                    { icon: "security",      label: "AI-powered threat intelligence"  },
                                    { icon: "notifications", label: "Data leak & paste monitoring"    },
                                    { icon: "dns",           label: "Suspicious domain detection"     },
                                ].map(f => (
                                    <li key={f.label} className="d-flex align-items-center mb-2">
                                        <span
                                            className="material-icons me-2 d-flex align-items-center justify-content-center rounded"
                                            style={{
                                                fontSize: 16,
                                                width: 30,
                                                height: 30,
                                                background: "rgba(255,255,255,.15)",
                                                flexShrink: 0,
                                            }}
                                        >
                                            {f.icon}
                                        </span>
                                        <span className="small fw-semibold">{f.label}</span>
                                    </li>
                                ))}
                            </ul>

                            {/* Footer tag */}
                            <p
                                className="mb-0 text-uppercase fw-bold opacity-50"
                                style={{ letterSpacing: "0.06em", fontSize: 10 }}
                            >
                                Thales Group CERT
                            </p>
                        </div>

                        {/* ── Right panel — login form ───────────────────────────── */}
                        <div className="col-lg-7 col-12 p-4 p-lg-5">

                            {/* Mobile logo */}
                            <div className="d-flex d-lg-none align-items-center mb-4">
                                <img
                                    src="/static/img/round-logo-fav.png"
                                    alt="Watcher"
                                    width={36}
                                    height={36}
                                    className="me-2"
                                />
                                <span className="fw-bold fs-5">Watcher</span>
                            </div>

                            <h4 className="fw-bold mb-1">Sign in</h4>
                            <p className="text-muted small mb-4">Access the Watcher platform</p>

                            {/* SSO button */}
                            {hasSso && (
                                <a
                                    href="/api/auth/oidc/login/"
                                    className="btn btn-outline-primary w-100 mb-3 d-flex align-items-center justify-content-center gap-2"
                                >
                                    <i className="material-icons" style={{ fontSize: 18 }}>vpn_key</i>
                                    Continue with {ssoLabel}
                                </a>
                            )}

                            {/* Divider */}
                            {hasSso && hasForm && (
                                <div className="d-flex align-items-center mb-3">
                                    <hr className="flex-grow-1 my-0" />
                                    <span className="px-2 text-muted small fw-semibold">OR</span>
                                    <hr className="flex-grow-1 my-0" />
                                </div>
                            )}

                            {/* Credentials form */}
                            {hasForm && (
                                <form onSubmit={this.onSubmit} noValidate>
                                    <div className="mb-3">
                                        <label className="form-label fw-semibold small" htmlFor="login-username">
                                            Username
                                        </label>
                                        <input
                                            id="login-username"
                                            type="text"
                                            className="form-control"
                                            name="username"
                                            value={username}
                                            onChange={this.onChange}
                                            placeholder="Enter your username"
                                            autoComplete="username"
                                            autoFocus
                                        />
                                    </div>

                                    <div className="mb-4">
                                        <label className="form-label fw-semibold small" htmlFor="login-password">
                                            Password
                                        </label>
                                        <div className="input-group">
                                            <input
                                                id="login-password"
                                                type={showPassword ? "text" : "password"}
                                                className="form-control"
                                                name="password"
                                                value={password}
                                                onChange={this.onChange}
                                                placeholder="Enter your password"
                                                autoComplete="current-password"
                                                maxLength="100"
                                            />
                                            <button
                                                type="button"
                                                className="btn btn-outline-secondary"
                                                onClick={this.togglePassword}
                                                tabIndex={-1}
                                                aria-label={showPassword ? "Hide password" : "Show password"}
                                                title={showPassword ? "Hide password" : "Show password"}
                                            >
                                                <i className="material-icons" style={{ fontSize: 18, verticalAlign: "middle" }}>
                                                    {showPassword ? "visibility_off" : "visibility"}
                                                </i>
                                            </button>
                                        </div>
                                    </div>

                                    <button
                                        type="submit"
                                        className="btn btn-primary w-100 d-flex align-items-center justify-content-center gap-2"
                                        disabled={!username.trim() || !password}
                                    >
                                        Sign in
                                        <i className="material-icons" style={{ fontSize: 18 }}>arrow_forward</i>
                                    </button>
                                </form>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        );
    }
}

const mapStateToProps = state => ({
    isAuthenticated: state.auth.isAuthenticated,
    loginMode:       state.config.loginMode,
    oidcCompanyName: state.config.oidcCompanyName,
});

export default connect(
    mapStateToProps,
    { login, createMessage }
)(Login);
