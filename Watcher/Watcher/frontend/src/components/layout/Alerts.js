import React, {Component, Fragment} from "react";
import {withAlert} from "react-alert";
import {connect} from "react-redux";
import PropTypes from "prop-types";

export class Alerts extends Component {

    static propTypes = {
        error: PropTypes.object.isRequired,
        message: PropTypes.object.isRequired
    };

    componentDidUpdate(prevProps) {
        const {error, alert, message} = this.props;
        if (error !== prevProps.error) {
            const msg = error && error.msg;
            if (msg) {
                if (msg.username) {
                    alert.error(`Username: ${msg.username.join()}`);
                }
                if (msg.password) {
                    alert.error(`Password: ${msg.password.join()}`);
                }
                if (msg.non_field_errors) {
                    msg.non_field_errors.map(err => alert.error(err));
                }
                if (msg.name) {
                    msg.name.map(err => alert.error(err));
                }
                if (msg.old_password) {
                    msg.old_password.map(err => alert.error(`Old Password: ${err}`));
                }
                if (msg.domain_name) {
                    alert.error(msg.domain_name.join());
                }
                if (msg.rtir) {
                    alert.error(msg.rtir.join());
                }
                if (msg.detail) {
                    alert.error(msg.detail);
                }
            }
        }

        if (message !== prevProps.message) {
            if (message.delete) {
                alert.success(message.delete);
            }
            if (message.login) {
                alert.success(message.login);
            }
            if (message.logout) {
                alert.success(message.logout);
            }
            if (message.add) {
                alert.success(message.add);
            }
            if (message.passwordChange) {
                alert.success(message.passwordChange);
            }
        }
    }

    render() {
        return <Fragment/>;
    }
}

const mapStateToProps = state => ({
    error: state.errors,
    message: state.messages
});

export default connect(mapStateToProps)(withAlert()(Alerts));