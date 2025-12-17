import {
    DATALEAK_GET_KEYWORDS,
    DATALEAK_GET_ALERTS,
    DATALEAK_DELETE_KEYWORD,
    DATALEAK_ADD_KEYWORD,
    DATALEAK_PATCH_KEYWORD,
    DATALEAK_UPDATE_ALERT
} from '../actions/types.js';

const initialState = {
    keywords: [],
    keywordsCount: 0,
    keywordsNext: null,
    keywordsPrevious: null,
    alerts: [],
    alertsCount: 0,
    alertsNext: null,
    alertsPrevious: null
};

export default function (state = initialState, action) {
    switch (action.type) {
        case DATALEAK_GET_KEYWORDS: {
            const newResults = action.payload.results || action.payload;
            
            if (!action.payload.results) {
                return {
                    ...state,
                    keywords: newResults,
                    keywordsCount: newResults.length,
                    keywordsNext: null,
                    keywordsPrevious: null
                };
            }
            
            const existingIds = new Set(state.keywords.map(k => k.id));
            const uniqueNewKeywords = newResults.filter(keyword => !existingIds.has(keyword.id));
            
            return {
                ...state,
                keywords: [...state.keywords, ...uniqueNewKeywords].sort((a, b) => a.name.localeCompare(b.name)),
                keywordsCount: action.payload.count || state.keywordsCount,
                keywordsNext: action.payload.next || null,
                keywordsPrevious: action.payload.previous || null
            };
        }

        case DATALEAK_GET_ALERTS: {
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

        case DATALEAK_DELETE_KEYWORD:
            return {
                ...state,
                keywords: state.keywords.filter(keyword => keyword.id !== action.payload),
                keywordsCount: Math.max(0, state.keywordsCount - 1)
            };

        case DATALEAK_ADD_KEYWORD:
            return {
                ...state,
                keywords: [...state.keywords, action.payload].sort((a, b) => a.name.localeCompare(b.name)),
                keywordsCount: state.keywordsCount + 1
            };

        case DATALEAK_PATCH_KEYWORD:
            return {
                ...state,
                keywords: state.keywords.map(keyword =>
                    keyword.id === action.payload.id ? action.payload : keyword
                ).sort((a, b) => a.name.localeCompare(b.name))
            };

        case DATALEAK_UPDATE_ALERT:
            return {
                ...state,
                alerts: state.alerts.map(alert =>
                    alert.id === action.payload.id ? action.payload : alert
                )
            };

        default:
            return state;
    }
}