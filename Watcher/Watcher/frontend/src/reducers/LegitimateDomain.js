import {
    GET_LEGITIMATE_DOMAINS,
    ADD_LEGITIMATE_DOMAIN,
    PATCH_LEGITIMATE_DOMAIN,
    DELETE_LEGITIMATE_DOMAIN,
} from '../actions/types.js';

const initialState = {
    domains: [],
    domainsCount: 0,
    domainsNext: null,
    domainsPrevious: null
};

export default function(state = initialState, action) {
    switch (action.type) {
        case GET_LEGITIMATE_DOMAINS: {
            const newResults = action.payload.results || action.payload;
            
            if (!action.payload.results) {
                return {
                    ...state,
                    domains: Array.isArray(newResults) ? newResults : [],
                    domainsCount: Array.isArray(newResults) ? newResults.length : 0,
                    domainsNext: null,
                    domainsPrevious: null
                };
            }
            
            const existingIds = new Set(state.domains.map(d => d.id));
            const uniqueNewDomains = newResults.filter(domain => !existingIds.has(domain.id));
            
            return {
                ...state,
                domains: [...state.domains, ...uniqueNewDomains].sort((a, b) => 
                    a.domain_name.localeCompare(b.domain_name)
                ),
                domainsCount: action.payload.count || state.domainsCount,
                domainsNext: action.payload.next || null,
                domainsPrevious: action.payload.previous || null
            };
        }

        case ADD_LEGITIMATE_DOMAIN:
            return {
                ...state,
                domains: [...state.domains, action.payload].sort((a, b) => 
                    a.domain_name.localeCompare(b.domain_name)
                ),
                domainsCount: state.domainsCount + 1
            };

        case PATCH_LEGITIMATE_DOMAIN:
            return {
                ...state,
                domains: state.domains.map(domain =>
                    domain.id === action.payload.id
                        ? { ...domain, ...action.payload }
                        : domain
                ).sort((a, b) => a.domain_name.localeCompare(b.domain_name))
            };

        case DELETE_LEGITIMATE_DOMAIN:
            return {
                ...state,
                domains: state.domains.filter(domain => domain.id !== action.payload),
                domainsCount: Math.max(0, state.domainsCount - 1)
            };

        default:
            return state;
    }
}