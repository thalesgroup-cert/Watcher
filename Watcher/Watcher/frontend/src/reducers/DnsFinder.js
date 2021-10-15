import {
    GET_DNS_MONITORED,
    GET_DNS_FINDER_ALERTS,
    DELETE_DNS_MONITORED,
    ADD_DNS_MONITORED,
    PATCH_DNS_MONITORED,
    UPDATE_DNS_FINDER_ALERT,
    EXPORT_THE_HIVE_DNS_FINDER,
    EXPORT_MISP_DNS_FINDER,
    GET_KEYWORD_MONITORED,
    DELETE_KEYWORD_MONITORED,
    ADD_KEYWORD_MONITORED,
    PATCH_KEYWORD_MONITORED
} from '../actions/types.js';

const initialState = {
    dnsMonitored: [],
    keywordMonitored: [],
    alerts: []
};

export default function (state = initialState, action) {
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
                dnsMonitored: [...state.dnsMonitored, action.payload].sort(function (a, b) {
                    let rv;
                    rv = a.domain_name.localeCompare(b.domain_name);
                    return rv;
                })
            };
        case PATCH_DNS_MONITORED:
            state.dnsMonitored.map(dns_monitored => {
                if (dns_monitored.id === action.payload.id) {
                    dns_monitored.domain_name = action.payload.domain_name
                }
            });
            return {
                ...state,
                dnsMonitored: [...state.dnsMonitored]
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
                keywordMonitored: [...state.keywordMonitored, action.payload].sort(function (a, b) {
                    let rv;
                    rv = a.name.localeCompare(b.name);
                    return rv;
                })
            };
        case PATCH_KEYWORD_MONITORED:
            state.keywordMonitored.map(keyword_monitored => {
                if (keyword_monitored.id === action.payload.id) {
                    keyword_monitored.name = action.payload.name
                }
            });
            return {
                ...state,
                keywordMonitored: [...state.keywordMonitored]
            };
        case GET_DNS_FINDER_ALERTS:
            return {
                ...state,
                alerts: action.payload
            };
        case UPDATE_DNS_FINDER_ALERT:
            state.alerts.map(alert => {
                if (alert.id === action.payload.id) {
                    alert.status = action.payload.status
                }
            });
            return {
                ...state,
                alerts: [...state.alerts]
            };
        case EXPORT_THE_HIVE_DNS_FINDER:
            state.alerts.map(alert => {
                if (alert.id === action.payload.id) {
                    alert.dns_twisted.the_hive_case_id = action.payload.the_hive_case_id;
                }
            });
            return {
                ...state,
                alerts: [...state.alerts]
            };
        case EXPORT_MISP_DNS_FINDER:
            state.alerts.map(alert => {
                if (alert.id === action.payload.id) {
                    alert.dns_twisted.misp_event_id = action.payload.misp_event_id;
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