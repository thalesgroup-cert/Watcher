import {
    GET_SITES,
    GET_SITE_ALERTS,
    DELETE_SITE,
    ADD_SITE,
    PATCH_SITE,
    UPDATE_SITE_ALERT,
    EXPORT_THE_HIVE,
    EXPORT_MISP
} from '../actions/types.js';

const initialState = {
    sites: [],
    alerts: []
};


export default function (state = initialState, action) {
    switch (action.type) {
        case GET_SITES:
            return {
                ...state,
                sites: action.payload
            };
        case GET_SITE_ALERTS:
            return {
                ...state,
                alerts: action.payload
            };
        case DELETE_SITE:
            return {
                ...state,
                sites: state.sites.filter(site => site.id !== action.payload)
            };
        case ADD_SITE:
            return {
                ...state,
                sites: [...state.sites, action.payload].sort(function sortNumber(a, b) {
                    return b.rtir - a.rtir;
                })
            };
        case PATCH_SITE:
            state.sites.map(site => {
                if (site.id === action.payload.id) {
                    site.domain_name = action.payload.domain_name;
                    site.rtir = action.payload.rtir;
                    site.expiry = action.payload.expiry;
                    site.ip_monitoring = action.payload.ip_monitoring;
                    site.content_monitoring = action.payload.content_monitoring;
                    site.mail_monitoring = action.payload.mail_monitoring;
                }
            });
            return {
                ...state,
                sites: [...state.sites].sort(function sortNumber(a, b) {
                    return b.rtir - a.rtir;
                })
            };
        case UPDATE_SITE_ALERT:
            state.alerts.map(alert => {
                if (alert.id === action.payload.id) {
                    alert.status = action.payload.status
                }
            });
            return {
                ...state,
                alerts: [...state.alerts]
            };
        case EXPORT_THE_HIVE:
            state.sites.map(site => {
                if (site.id === action.payload.id) {
                    site.the_hive_case_id = action.payload.the_hive_case_id;
                }
            });
            return {
                ...state,
                sites: [...state.sites]
            };
        case EXPORT_MISP:
            state.sites.map(site => {
                if (site.id === action.payload.id) {
                    site.misp_event_id = action.payload.misp_event_id;
                }
            });
            return {
                ...state,
                sites: [...state.sites]
            };
        default:
            return state;
    }
}