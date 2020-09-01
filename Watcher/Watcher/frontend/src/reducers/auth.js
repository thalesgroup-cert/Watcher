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
} from "../actions/types";

const initialState = {
    token: localStorage.getItem("token"),
    isAuthenticated: null,
    isPasswordChanged: null,
    isLoading: false,
    user: null
};

export default function (state = initialState, action) {
    switch (action.type) {
        case USER_LOADING:
            return {
                ...state,
                isLoading: true,
            };
        case USER_LOADED:
            return {
                ...state,
                isAuthenticated: true,
                isLoading: false,
                user: action.payload,
            };
        case LOGIN_SUCCESS:
            localStorage.setItem('token', action.payload.token);
            return {
                ...state,
                ...action.payload,
                isAuthenticated: true,
                isLoading: false
            };
        case AUTH_ERROR:
        case LOGIN_FAIL:
        case LOGOUT_SUCCESS:
            localStorage.removeItem("token");
            return {
                ...state,
                token: null,
                user: null,
                isAuthenticated: false,
                isLoading: false,
            };
        case PASSWORD_CHANGE_SUCCESS:
            return {
                ...state,
                isPasswordChanged: true
            };
        case PASSWORD_CHANGE_FAIL:
        case IS_PASSWORD_CHANGED:
            return {
                ...state,
                isPasswordChanged: false
            };
        default:
            return state;
    }
}