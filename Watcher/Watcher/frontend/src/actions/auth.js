import axios from "axios";
import {createMessage, returnErrors} from "./messages";

import {
    USER_LOADED,
    USER_LOADING,
    AUTH_ERROR,
    LOGIN_SUCCESS,
    LOGIN_FAIL,
    LOGOUT_SUCCESS,
    PASSWORD_CHANGE_SUCCESS,
    PASSWORD_CHANGE_FAIL,
    IS_PASSWORD_CHANGED
} from "./types";

// CHECK TOKEN & LOAD USER
export const loadUser = () => (dispatch, getState) => {
    // User Loading
    dispatch({type: USER_LOADING});

    axios
        .get("/api/auth/user", tokenConfig(getState))
        .then(res => {
            dispatch({
                type: USER_LOADED,
                payload: res.data
            });
        })
        .catch(err => {
            dispatch(returnErrors(err.response.data, err.response.status));
            dispatch({
                type: AUTH_ERROR
            });
        });
};

// LOGIN USER
export const login = (username, password) => dispatch => {
    // Headers
    const config = {
        headers: {
            "Content-Type": "application/json"
        }
    };

    // Request Body
    const body = JSON.stringify({username, password});

    axios
        .post("/api/auth/login", body, config)
        .then(res => {
            dispatch(createMessage({login: "Successful Login"}));
            dispatch({
                type: LOGIN_SUCCESS,
                payload: res.data
            });
        })
        .catch(err => {
            dispatch(returnErrors(err.response.data, err.response.status));
            dispatch({
                type: LOGIN_FAIL
            });
        });
};

// LOGOUT USER
export const logout = () => (dispatch, getState) => {
    axios
        .post("/api/auth/logout/", null, tokenConfig(getState))
        .then(res => {
            dispatch(createMessage({logout: "Successful Logout"}));
            dispatch({
                type: LOGOUT_SUCCESS
            });
        })
        .catch(err => {
            dispatch(returnErrors(err.response.data, err.response.status));
        });
};

// Setup config with token - helper function
export const tokenConfig = getState => {
    // Get token from state
    const token = getState().auth.token;

    // Headers
    const config = {
        headers: {
            "Content-Type": "application/json"
        }
    };

    // If token, add to headers config
    if (token) {
        config.headers["Authorization"] = `Token ${token}`;
    }

    return config;
};

// PASSWORD CHANGE USER
export const passwordChange = (old_password, password) => (dispatch, getState) => {

    // Request Body
    const body = JSON.stringify({old_password, password});

    axios
        .post("api/auth/passwordchange/", body, tokenConfig(getState))
        .then(res => {
            dispatch(createMessage({passwordChange: "Password Change Successful"}));
            dispatch({
                type: PASSWORD_CHANGE_SUCCESS,
                payload: res.data
            });
        })
        .catch(err => {
            dispatch(returnErrors(err.response.data, err.response.status));
            dispatch({
                type: PASSWORD_CHANGE_FAIL,
            });
        });
};

export const setIsPasswordChanged = () => (dispatch) => {
    dispatch({type: IS_PASSWORD_CHANGED});
};