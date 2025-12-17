import {
    DNS_GET_ALERTS,
    DELETE_ALERT,
    ADD_ALERT,
    UPDATE_ALERT_STATUS,
    GET_DNS_MONITORED,
    DELETE_DNS_MONITORED,
    ADD_DNS_MONITORED,
    PATCH_DNS_MONITORED,
    GET_KEYWORD_MONITORED,
    DELETE_KEYWORD_MONITORED,
    ADD_KEYWORD_MONITORED,
    PATCH_KEYWORD_MONITORED,
    EXPORT_TO_MISP
} from '../actions/types';

const initialState = {
    alerts: [],
    alertsCount: 0,
    alertsNext: null,
    alertsPrevious: null,
    dnsMonitored: [],
    dnsMonitoredCount: 0,
    dnsMonitoredNext: null,
    dnsMonitoredPrevious: null,
    keywordMonitored: [],
    keywordMonitoredCount: 0,
    keywordMonitoredNext: null,
    keywordMonitoredPrevious: null
};

export default function(state = initialState, action) {
    switch(action.type) {
        case DNS_GET_ALERTS: {
            const newResults = action.payload.results || action.payload;
            
            if (!action.payload.results) {
                return {
                    ...state,
                    alerts: newResults,
                    alertsCount: newResults.length,
                    alertsNext: null,
                    alertsPrevious: null
                };
            }
            
            const existingIds = new Set(state.alerts.map(a => a.id));
            const uniqueNewAlerts = newResults.filter(alert => !existingIds.has(alert.id));
            
            return {
                ...state,
                alerts: [...state.alerts, ...uniqueNewAlerts],
                alertsCount: action.payload.count || state.alertsCount,
                alertsNext: action.payload.next || null,
                alertsPrevious: action.payload.previous || null
            };
        }

        case DELETE_ALERT:
            return {
                ...state,
                alerts: state.alerts.filter(alert => alert.id !== action.payload),
                alertsCount: Math.max(0, state.alertsCount - 1)
            };

        case ADD_ALERT:
            return {
                ...state,
                alerts: [action.payload, ...state.alerts],
                alertsCount: state.alertsCount + 1
            };

        case UPDATE_ALERT_STATUS:
            return {
                ...state,
                alerts: state.alerts.map(alert =>
                    alert.id === action.payload.id ? action.payload : alert
                )
            };

        case GET_DNS_MONITORED: {
            const newResults = action.payload.results || action.payload;
            
            if (!action.payload.results) {
                return {
                    ...state,
                    dnsMonitored: newResults,
                    dnsMonitoredCount: newResults.length,
                    dnsMonitoredNext: null,
                    dnsMonitoredPrevious: null
                };
            }
            
            const existingIds = new Set(state.dnsMonitored.map(d => d.id));
            const uniqueNewDomains = newResults.filter(domain => !existingIds.has(domain.id));
            
            return {
                ...state,
                dnsMonitored: [...state.dnsMonitored, ...uniqueNewDomains],
                dnsMonitoredCount: action.payload.count || state.dnsMonitoredCount,
                dnsMonitoredNext: action.payload.next || null,
                dnsMonitoredPrevious: action.payload.previous || null
            };
        }

        case DELETE_DNS_MONITORED:
            return {
                ...state,
                dnsMonitored: state.dnsMonitored.filter(dns => dns.id !== action.payload),
                dnsMonitoredCount: Math.max(0, state.dnsMonitoredCount - 1)
            };

        case ADD_DNS_MONITORED:
            return {
                ...state,
                dnsMonitored: [action.payload, ...state.dnsMonitored],
                dnsMonitoredCount: state.dnsMonitoredCount + 1
            };

        case PATCH_DNS_MONITORED:
            return {
                ...state,
                dnsMonitored: state.dnsMonitored.map(dns =>
                    dns.id === action.payload.id ? action.payload : dns
                )
            };

        case GET_KEYWORD_MONITORED: {
            const newResults = action.payload.results || action.payload;
            
            if (!action.payload.results) {
                return {
                    ...state,
                    keywordMonitored: newResults,
                    keywordMonitoredCount: newResults.length,
                    keywordMonitoredNext: null,
                    keywordMonitoredPrevious: null
                };
            }
            
            const existingIds = new Set(state.keywordMonitored.map(k => k.id));
            const uniqueNewKeywords = newResults.filter(keyword => !existingIds.has(keyword.id));
            
            return {
                ...state,
                keywordMonitored: [...state.keywordMonitored, ...uniqueNewKeywords],
                keywordMonitoredCount: action.payload.count || state.keywordMonitoredCount,
                keywordMonitoredNext: action.payload.next || null,
                keywordMonitoredPrevious: action.payload.previous || null
            };
        }

        case DELETE_KEYWORD_MONITORED:
            return {
                ...state,
                keywordMonitored: state.keywordMonitored.filter(keyword => keyword.id !== action.payload),
                keywordMonitoredCount: Math.max(0, state.keywordMonitoredCount - 1)
            };

        case ADD_KEYWORD_MONITORED:
            return {
                ...state,
                keywordMonitored: [action.payload, ...state.keywordMonitored],
                keywordMonitoredCount: state.keywordMonitoredCount + 1
            };

        case PATCH_KEYWORD_MONITORED:
            return {
                ...state,
                keywordMonitored: state.keywordMonitored.map(keyword =>
                    keyword.id === action.payload.id ? action.payload : keyword
                )
            };

        case EXPORT_TO_MISP:
            return state;

        default:
            return state;
    }
}