import {
    GET_SITES,
    GET_SITE_ALERTS,
    DELETE_SITE,
    ADD_SITE,
    PATCH_SITE,
    UPDATE_SITE_ALERT,
    EXPORT_MISP
} from '../actions/types.js';

const initialState = {
    sites: [],
    sitesCount: 0,
    sitesNext: null,
    sitesPrevious: null,
    alerts: [],
    alertsCount: 0,
    alertsNext: null,
    alertsPrevious: null
};

export default function (state = initialState, action) {
    switch (action.type) {
        case GET_SITES: {
            const newResults = action.payload.results || action.payload;
            
            if (!action.payload.results) {
                return {
                    ...state,
                    sites: newResults,
                    sitesCount: newResults.length,
                    sitesNext: null,
                    sitesPrevious: null
                };
            }
            
            const existingIds = new Set(state.sites.map(s => s.id));
            const uniqueNewSites = newResults.filter(site => !existingIds.has(site.id));
            
            return {
                ...state,
                sites: [...state.sites, ...uniqueNewSites].sort((a, b) => b.rtir - a.rtir),
                sitesCount: action.payload.count || state.sitesCount,
                sitesNext: action.payload.next || null,
                sitesPrevious: action.payload.previous || null
            };
        }

        case GET_SITE_ALERTS: {
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

        case DELETE_SITE:
            return {
                ...state,
                sites: state.sites.filter(site => site.id !== action.payload),
                sitesCount: Math.max(0, state.sitesCount - 1)
            };

        case ADD_SITE:
            return {
                ...state,
                sites: [...state.sites, action.payload].sort((a, b) => b.rtir - a.rtir),
                sitesCount: state.sitesCount + 1
            };

        case PATCH_SITE:
            return {
                ...state,
                sites: state.sites.map(site =>
                    site.id === action.payload.id ? action.payload : site
                ).sort((a, b) => b.rtir - a.rtir)
            };

        case UPDATE_SITE_ALERT:
            return {
                ...state,
                alerts: state.alerts.map(alert =>
                    alert.id === action.payload.id ? action.payload : alert
                )
            };

        case EXPORT_MISP:
            return {
                ...state,
                sites: state.sites.map(site =>
                    site.id === action.payload.id 
                        ? { ...site, misp_event_id: action.payload.misp_event_id }
                        : site
                )
            };

        default:
            return state;
    }
}