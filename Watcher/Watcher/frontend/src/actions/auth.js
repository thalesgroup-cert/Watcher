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

// LOAD USER — auth now rides an httpOnly cookie the browser sends
// automatically, so there's no token to gate this on; a 401 from the
// cookie being absent/expired is handled by the AUTH_ERROR branch below.
export const loadUser = () => (dispatch, getState) => {
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
    // Read CSRF token from cookie
    const csrfToken = document.cookie.split(';')
        .map(c => c.trim())
        .find(c => c.startsWith('csrftoken='))
        ?.split('=')[1] || '';

    // Headers
    const config = {
        headers: {
            "Content-Type": "application/json",
            "X-CSRFToken": csrfToken,
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

// Base request config. Auth is carried by the httpOnly knox_token cookie,
// sent automatically by the browser — nothing to attach here. Kept as a
// named helper since every action in this app threads it through.
export const tokenConfig = () => ({
    headers: {
        "Content-Type": "application/json"
    }
});

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