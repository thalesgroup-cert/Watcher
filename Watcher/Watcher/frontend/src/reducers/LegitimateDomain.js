import {
    GET_LEGITIMATE_DOMAINS,
    ADD_LEGITIMATE_DOMAIN,
    PATCH_LEGITIMATE_DOMAIN,
    DELETE_LEGITIMATE_DOMAIN,
} from '../actions/types.js';

const initialState = {
    domains: [],
};

export default function(state = initialState, action) {
    switch (action.type) {
        case GET_LEGITIMATE_DOMAINS:
            return {
                ...state,
                domains: Array.isArray(action.payload)
                    ? action.payload
                    : (action.payload.results || [])
            };
        case ADD_LEGITIMATE_DOMAIN:
            return {
                ...state,
                domains: [...state.domains, action.payload]
            };
        case PATCH_LEGITIMATE_DOMAIN:
            return {
                ...state,
                domains: state.domains.map(domain =>
                    domain.id === action.payload.id
                        ? { ...domain, ...action.payload }
                        : domain
                )
            };
        case DELETE_LEGITIMATE_DOMAIN:
            return {
                ...state,
                domains: state.domains.filter(domain =>
                    domain.id !== action.payload
                )
            };
        default:
            return state;
    }
}