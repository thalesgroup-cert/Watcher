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
            if (error.msg.username) {
                alert.error(`Username: ${error.msg.username.join()}`);
            }
            if (error.msg.password) {
                alert.error(`Password: ${error.msg.password.join()}`);
            }
            if (error.msg.non_field_errors) {
                error.msg.non_field_errors.map(error => {
                    alert.error(error);
                });
            }
            if (error.msg.name) {
                error.msg.name.map(error => {
                    alert.error(error);
                });
            }
            if (error.msg.old_password) {
                error.msg.old_password.map(error => {
                    alert.error(`Old Password: ${error}`);
                });
            }
            if (error.msg.domain_name) {
                alert.error(error.msg.domain_name.join());
            }
            if (error.msg.rtir) {
                alert.error(error.msg.rtir.join());
            }
            if (error.msg.detail) {
                alert.error(error.msg.detail);
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