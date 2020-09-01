import React, {Component} from "react";
import {Link, Redirect} from "react-router-dom";
import {connect} from "react-redux";
import PropTypes from "prop-types";
import {passwordChange} from "../../actions/auth";
import Button from "react-bootstrap/Button";

export class PasswordChange extends Component {
    state = {
        old_password: "",
        password: "",
        confirmed_password: ""
    };

    static propTypes = {
        passwordChange: PropTypes.func.isRequired,
        isPasswordChanged: PropTypes.bool,
    };

    onSubmit = e => {
        e.preventDefault();
        this.props.passwordChange(this.state.old_password, this.state.password);
    };

    onChange = e => this.setState({[e.target.name]: e.target.value});

    render() {
        if (this.props.isPasswordChanged) {
            return <Redirect to="/"/>;
        }
        const {old_password, password, confirmed_password} = this.state;
        return (
            <div className="col-md-6 m-auto">
                <div className="card card-body mt-5">
                    <h2 className="text-center">Password Change</h2>
                    <form onSubmit={this.onSubmit}>
                        <div className="form-group">
                            <label>Old Password</label>
                            <input
                                type="password"
                                className="form-control"
                                name="old_password"
                                onChange={this.onChange}
                                value={old_password}
                                maxLength="30"
                            />
                        </div>
                        <div className="form-group">
                            <label>New Password</label>
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
                            <label>Confirmed Password</label>
                            <input
                                type="password"
                                className="form-control"
                                name="confirmed_password"
                                onChange={this.onChange}
                                value={confirmed_password}
                                maxLength="30"
                            />
                        </div>
                        <div className="form-group">
                            <Button type="submit" className="btn btn-primary"
                                    disabled={(this.state.password !== this.state.confirmed_password) || this.state.password === "" || this.state.confirmed_password === "" || this.state.old_password === ""}>
                                Change Password
                            </Button>
                        </div>
                    </form>
                </div>
            </div>
        );
    }
}

const mapStateToProps = state => ({
    isPasswordChanged: state.auth.isPasswordChanged
});

export default connect(
    mapStateToProps,
    {passwordChange}
)(PasswordChange);