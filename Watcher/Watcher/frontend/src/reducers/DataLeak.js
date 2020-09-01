import {GET_KEYWORDS, GET_ALERTS, DELETE_KEYWORD, ADD_KEYWORD, PATCH_KEYWORD, UPDATE_ALERT} from '../actions/types.js';

const initialState = {
    keywords: [],
    alerts: []
};

export default function (state = initialState, action) {
    switch (action.type) {
        case GET_KEYWORDS:
            return {
                ...state,
                keywords: action.payload
            };
        case GET_ALERTS:
            return {
                ...state,
                alerts: action.payload
            };
        case DELETE_KEYWORD:
            return {
                ...state,
                keywords: state.keywords.filter(keyword => keyword.id !== action.payload)
            };
        case ADD_KEYWORD:
            return {
                ...state,
                keywords: [...state.keywords, action.payload].sort(function (a, b) {
                    let rv;
                    rv = a.name.localeCompare(b.name);
                    return rv;
                })
            };
        case PATCH_KEYWORD:
            state.keywords.map(keyword => {
                if (keyword.id === action.payload.id) {
                    keyword.name = action.payload.name
                }
            });
            return {
                ...state,
                keywords: [...state.keywords]
            };
        case UPDATE_ALERT:
            state.alerts.map(alert => {
                if (alert.id === action.payload.id) {
                    alert.status = action.payload.status
                }
            });
            return {
                ...state,
                alerts: [...state.alerts]
            };
        default:
            return state;
    }
}