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
            // The actual session token lives in an httpOnly cookie set by
            // the server response — never persisted here, so it's not
            // reachable via localStorage/XSS. action.payload.token (present
            // for non-browser API clients) is intentionally not stored.
            return {
                ...state,
                isAuthenticated: true,
                isLoading: false
            };
        case AUTH_ERROR:
        case LOGIN_FAIL:
        case LOGOUT_SUCCESS:
            return {
                ...state,
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