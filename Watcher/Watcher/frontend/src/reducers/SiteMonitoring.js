import {
    GET_SITES,
    GET_SITE_ALERTS,
    DELETE_SITE,
    ADD_SITE,
    PATCH_SITE,
    UPDATE_SITE_ALERT,
    EXPORT_MISP
} from '../actions/types';

const initialState = {
    sites: [],
    alerts: [],
    mispMessage: null,
    loading: {}
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
                sites: [...state.sites, action.payload].sort((a, b) => b.rtir - a.rtir)
            };
        case PATCH_SITE:
            return {
                ...state,
                sites: state.sites.map(site =>
                    site.id === action.payload.id
                        ? { ...site, ...action.payload }
                        : site
                )
            };
        case UPDATE_SITE_ALERT:
            return {
                ...state,
                alerts: state.alerts.map(alert => 
                    alert.id === action.payload.id
                        ? { ...alert, ...action.payload }
                        : alert
                )
            };
        case EXPORT_MISP:
            return {
                ...state,
                sites: state.sites.map(site =>
                    site.id === action.payload.id
                        ? { ...site, misp_event_uuid: action.payload.misp_event_uuid }
                        : site
                ),
                mispMessage: action.payload.message
            };
        default:
            return state;
    }
}