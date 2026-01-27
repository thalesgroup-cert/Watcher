import {GET_LEADS, DELETE_LEAD, GET_MONITORED_KEYWORDS, ADD_MONITORED_KEYWORD, UPDATE_MONITORED_KEYWORD, DELETE_MONITORED_KEYWORD} from '../actions/types.js';

const initialState = {
    leads: [],
    monitoredKeywords: []
};

export default function (state = initialState, action) {
    switch (action.type) {
        case GET_LEADS:
            return {
                ...state,
                leads: action.payload
            };
        case DELETE_LEAD:
            return {
                ...state,
                leads: state.leads.filter(lead => lead.id !== action.payload)
            };
        case GET_MONITORED_KEYWORDS:
            return {
                ...state,
                monitoredKeywords: action.payload
            };
        case ADD_MONITORED_KEYWORD:
            return {
                ...state,
                monitoredKeywords: [...state.monitoredKeywords, action.payload]
            };
        case DELETE_MONITORED_KEYWORD:
            return {
                ...state,
                monitoredKeywords: state.monitoredKeywords.filter(k => k.id !== action.payload)
            };
        case UPDATE_MONITORED_KEYWORD:
            return {
                ...state,
                monitoredKeywords: state.monitoredKeywords.map(k => 
                    k.id === action.payload.id ? action.payload : k
                )
            };
        default:
            return state;
    }
}