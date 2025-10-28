import React, {Component} from "react";
import {Link, Redirect} from "react-router-dom";
import {connect} from "react-redux";
import PropTypes from "prop-types";
import {passwordChange} from "../../actions/auth";
import {Button, Form, Container, Row, Col, Card} from "react-bootstrap";

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
            <Container>
                <Row className="justify-content-center mt-5">
                    <Col md={6}>
                        <Card>
                            <Card.Body>
                                <h2 className="text-center mb-4">Password Change</h2>
                                <Form onSubmit={this.onSubmit}>
                                    <Form.Group className="mb-3">
                                        <Form.Label>Old Password</Form.Label>
                                        <Form.Control
                                            type="password"
                                            name="old_password"
                                            onChange={this.onChange}
                                            value={old_password}
                                            maxLength="30"
                                        />
                                    </Form.Group>

                                    <Form.Group className="mb-3">
                                        <Form.Label>New Password</Form.Label>
                                        <Form.Control
                                            type="password"
                                            name="password"
                                            onChange={this.onChange}
                                            value={password}
                                            maxLength="30"
                                        />
                                    </Form.Group>

                                    <Form.Group className="mb-3">
                                        <Form.Label>Confirmed Password</Form.Label>
                                        <Form.Control
                                            type="password"
                                            name="confirmed_password"
                                            onChange={this.onChange}
                                            value={confirmed_password}
                                            maxLength="30"
                                        />
                                    </Form.Group>

                                    <div className="d-flex justify-content-end">
                                        <Button 
                                            type="submit" 
                                            variant="primary"
                                            disabled={(password !== confirmed_password) || password === "" || confirmed_password === "" || old_password === ""}
                                        >
                                            Change Password
                                        </Button>
                                    </div>
                                </Form>
                            </Card.Body>
                        </Card>
                    </Col>
                </Row>
            </Container>
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