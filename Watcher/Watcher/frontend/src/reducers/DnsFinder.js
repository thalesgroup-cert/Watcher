import {
    GET_DNS_MONITORED,
    GET_DNS_FINDER_ALERTS,
    DELETE_DNS_MONITORED,
    ADD_DNS_MONITORED,
    PATCH_DNS_MONITORED,
    UPDATE_DNS_FINDER_ALERT,
    EXPORT_MISP_DNS_FINDER,
    GET_KEYWORD_MONITORED,
    DELETE_KEYWORD_MONITORED,
    ADD_KEYWORD_MONITORED,
    PATCH_KEYWORD_MONITORED
} from '../actions/types.js';

const initialState = {
    dnsMonitored: [],
    keywordMonitored: [],
    alerts: [],
    loading: {},
    mispMessage: null
};

export default function(state = initialState, action) {
    switch (action.type) {
        case GET_DNS_MONITORED:
            return {
                ...state,
                dnsMonitored: action.payload
            };
        case DELETE_DNS_MONITORED:
            return {
                ...state,
                dnsMonitored: state.dnsMonitored.filter(dns_monitored => dns_monitored.id !== action.payload)
            };
        case ADD_DNS_MONITORED:
            return {
                ...state,
                dnsMonitored: [...state.dnsMonitored, action.payload].sort((a, b) => {
                    return a.domain_name.localeCompare(b.domain_name);
                })
            };
        case PATCH_DNS_MONITORED:
            return {
                ...state,
                dnsMonitored: state.dnsMonitored.map(dns_monitored => {
                    if (dns_monitored.id === action.payload.id) {
                        return { ...dns_monitored, ...action.payload };
                    }
                    return dns_monitored;
                })
            };
            
        case GET_KEYWORD_MONITORED:
            return {
                ...state,
                keywordMonitored: action.payload
            };
        case DELETE_KEYWORD_MONITORED:
            return {
                ...state,
                keywordMonitored: state.keywordMonitored.filter(keyword_monitored => keyword_monitored.id !== action.payload)
            };
        case ADD_KEYWORD_MONITORED:
            return {
                ...state,
                keywordMonitored: [...state.keywordMonitored, action.payload].sort((a, b) => {
                    return a.name.localeCompare(b.name);
                })
            };
        case PATCH_KEYWORD_MONITORED:
            return {
                ...state,
                keywordMonitored: state.keywordMonitored.map(keyword_monitored => {
                    if (keyword_monitored.id === action.payload.id) {
                        return { ...keyword_monitored, ...action.payload };
                    }
                    return keyword_monitored;
                })
            };
        case GET_DNS_FINDER_ALERTS:
            return {
                ...state,
                alerts: action.payload
            };
        case UPDATE_DNS_FINDER_ALERT:
            return {
                ...state,
                alerts: state.alerts.map(alert => {
                    if (alert.id === action.payload.id) {
                        return { ...alert, ...action.payload };
                    }
                    return alert;
                })
            };
            
        case EXPORT_MISP_DNS_FINDER:
            return {
                ...state,
                alerts: state.alerts.map(alert => {
                    if (alert.dns_twisted && alert.dns_twisted.id === action.payload.id) {
                        return {
                            ...alert,
                            dns_twisted: {
                                ...alert.dns_twisted,
                                misp_event_uuid: action.payload.misp_event_uuid
                            }
                        };
                    }
                    return alert;
                }),
                mispMessage: action.payload.message
            };
        default:
            return state;
    }
}