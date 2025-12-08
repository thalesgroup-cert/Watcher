import React from "react";
import {Route, Redirect} from "react-router-dom";
import {connect} from "react-redux";

const PrivateRoute = ({component: Component, auth, location, ...rest }) => (
    <Route
        {...rest}
        render={props => {
            if (auth.isLoading) {
                return (
                    <div className="text-center py-5">
                        <div className="spinner-border text-primary mb-3" role="status" style={{ width: '3rem', height: '3rem' }}>
                            <span className="visually-hidden">Loading...</span>
                        </div>
                    </div>
                );
            } else if (!auth.isAuthenticated) {
                return (
                    <Redirect 
                        to={{
                            pathname: '/login',
                            state: { from: props.location.pathname }
                        }} 
                    />
                );
            } else {
                return <Component {...props} />;
            }
        }}
    />
);

const mapStateToProps = state => ({
    auth: state.auth
});

export default connect(mapStateToProps)(PrivateRoute);