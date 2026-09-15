import {
    DNS_GET_ALERTS,
    DNS_GET_ALERTS_ALL,
    DELETE_ALERT,
    ADD_ALERT,
    UPDATE_ALERT_STATUS,
    GET_DNS_MONITORED,
    GET_DNS_MONITORED_ALL,
    DELETE_DNS_MONITORED,
    ADD_DNS_MONITORED,
    PATCH_DNS_MONITORED,
    GET_KEYWORD_MONITORED,
    GET_KEYWORD_MONITORED_ALL,
    DELETE_KEYWORD_MONITORED,
    ADD_KEYWORD_MONITORED,
    PATCH_KEYWORD_MONITORED,
    EXPORT_TO_MISP,
    GET_DNS_FINDER_STATISTICS,
    PATCH_DANGLING_SUBDOMAIN,
    GET_THREATS_MONITORED
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
    keywordMonitoredPrevious: null,
    // Stats-only: all items loaded at once
    allAlerts: [],
    allDnsMonitored: [],
    allKeywordMonitored: [],
    statistics: {
        totalAlerts: 0,
        newToday: 0,
        newThisWeek: 0,
        totalDnsMonitored: 0,
        totalKeywords: 0,
    },
    // Kept for PATCH_DANGLING_SUBDOMAIN below (patched via patchDanglingSubdomain,
    // e.g. from the ThreatsMonitored/DnsMonitored confirm-status modals); the
    // paginated GET_DANGLING_SUBDOMAINS/GET_DANGLING_ALERTS fetch actions that used
    // to populate a full dangling list were removed as dead code (unified into
    // the threatsMonitored feed instead), but this bare array must stay so this
    // reducer case has something to map over.
    danglingSubdomains: [],
    threatsMonitored: [],
    threatsMonitoredCount: 0,
    threatsMonitoredNext: null,
    threatsMonitoredPrevious: null,
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
                ),
                threatsMonitored: state.threatsMonitored.map(item =>
                    item.source !== 'subdomain_takeover' && item.id === action.payload.id
                        ? { ...item, status_tag: action.payload.status ? 'active' : 'archived' }
                        : item
                )
            };

        case GET_DNS_MONITORED: {
            const newResults = action.payload.results || action.payload;
            return {
                ...state,
                dnsMonitored: newResults.slice(),
                dnsMonitoredCount: action.payload.count || newResults.length,
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
            return {
                ...state,
                keywordMonitored: newResults.slice(),
                keywordMonitoredCount: action.payload.count || newResults.length,
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
            // action.payload.id is in the same id-space the export was requested with:
            // the Alert id for dnstwist/certstream_keyword items (matched the same way
            // UPDATE_ALERT_STATUS does), or the DanglingSubdomain id for subdomain_takeover
            // items (matched the same way PATCH_DANGLING_SUBDOMAIN does), since
            // ThreatsMonitored.displayExportModal sends technical_details.dangling_subdomain_id
            // as the id for takeover items.
            return {
                ...state,
                threatsMonitored: state.threatsMonitored.map(item => {
                    const matchesExportedItem = item.source === 'subdomain_takeover'
                        ? item.technical_details?.dangling_subdomain_id === action.payload.id
                        : item.id === action.payload.id;
                    return matchesExportedItem
                        ? { ...item, misp_event_uuid: action.payload.misp_event_uuid }
                        : item;
                })
            };

        case GET_DNS_FINDER_STATISTICS:
            return {
                ...state,
                statistics: action.payload
            };

        case DNS_GET_ALERTS_ALL:
            return { ...state, allAlerts: Array.isArray(action.payload) ? action.payload : [] };

        case GET_DNS_MONITORED_ALL:
            return { ...state, allDnsMonitored: Array.isArray(action.payload) ? action.payload : [] };

        case GET_KEYWORD_MONITORED_ALL:
            return { ...state, allKeywordMonitored: Array.isArray(action.payload) ? action.payload : [] };

        case PATCH_DANGLING_SUBDOMAIN:
            return {
                ...state,
                danglingSubdomains: state.danglingSubdomains.map(sub =>
                    sub.id === action.payload.id ? action.payload : sub
                ),
                threatsMonitored: state.threatsMonitored.map(item =>
                    item.source === 'subdomain_takeover' &&
                    item.technical_details?.dangling_subdomain_id === action.payload.id
                        ? {
                            ...item,
                            status_tag: action.payload.status,
                            technical_details: {
                                ...item.technical_details,
                                provider: action.payload.provider,
                                cname_target: action.payload.cname_target,
                                http_status_code: action.payload.http_status_code,
                                last_checked_at: action.payload.last_checked_at
                            }
                        }
                        : item
                )
            };

        case GET_THREATS_MONITORED: {
            const newResults = action.payload.results || action.payload;

            if (!action.payload.results) {
                return {
                    ...state,
                    threatsMonitored: newResults,
                    threatsMonitoredCount: newResults.length,
                    threatsMonitoredNext: null,
                    threatsMonitoredPrevious: null
                };
            }

            const threatKey = (item) => `${item.source}:${item.id}`;
            const existingKeys = new Set(state.threatsMonitored.map(threatKey));
            const uniqueNewItems = newResults.filter(item => !existingKeys.has(threatKey(item)));

            return {
                ...state,
                threatsMonitored: [...state.threatsMonitored, ...uniqueNewItems],
                threatsMonitoredCount: action.payload.count || state.threatsMonitoredCount,
                threatsMonitoredNext: action.payload.next || null,
                threatsMonitoredPrevious: action.payload.previous || null
            };
        }

        default:
            return state;
    }
}