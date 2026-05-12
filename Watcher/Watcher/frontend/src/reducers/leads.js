import {
    GET_LEADS, DELETE_LEAD,
    GET_MONITORED_KEYWORDS, ADD_MONITORED_KEYWORD,
    DELETE_MONITORED_KEYWORD, PATCH_MONITORED_KEYWORD,
    GET_THREATS_WATCHER_STATISTICS,
    GET_SOURCES, ADD_SOURCE, DELETE_SOURCE, PATCH_SOURCE,
    GET_BANNED_WORDS, ADD_BANNED_WORD, DELETE_BANNED_WORD, PATCH_BANNED_WORD,
} from '../actions/types.js';

const initialState = {
    leads: [],
    monitoredKeywords: [],
    sources: [],
    bannedWords: [],
    statistics: {
        totalWords: 0,
        newToday: 0,
        newThisWeek: 0,
        totalSources: 0,
        bannedWords: 0,
        monitoredKeywords: 0,
    }
};

export default function (state = initialState, action) {
    switch (action.type) {
        case GET_LEADS:
            return {
                ...state,
                leads: action.payload
            };
        case DELETE_LEAD:
            return {
                ...state,
                leads: state.leads.filter(lead => lead.id !== action.payload)
            };
        case GET_MONITORED_KEYWORDS:
            return {
                ...state,
                monitoredKeywords: action.payload.results || action.payload
            };
        case ADD_MONITORED_KEYWORD:
            return {
                ...state,
                monitoredKeywords: [action.payload, ...state.monitoredKeywords]
            };
        case DELETE_MONITORED_KEYWORD:
            return {
                ...state,
                monitoredKeywords: state.monitoredKeywords.filter(mk => mk.id !== action.payload)
            };
        case PATCH_MONITORED_KEYWORD:
            return {
                ...state,
                monitoredKeywords: state.monitoredKeywords.map(mk =>
                    mk.id === action.payload.id ? action.payload : mk
                )
            };
        case GET_THREATS_WATCHER_STATISTICS:
            return {
                ...state,
                statistics: action.payload
            };
        // Sources
        case GET_SOURCES:
            return { ...state, sources: action.payload.results || action.payload };
        case ADD_SOURCE:
            return { ...state, sources: [action.payload, ...state.sources] };
        case DELETE_SOURCE:
            return { ...state, sources: state.sources.filter(s => s.id !== action.payload) };
        case PATCH_SOURCE:
            return { ...state, sources: state.sources.map(s => s.id === action.payload.id ? action.payload : s) };
        // Banned Words
        case GET_BANNED_WORDS:
            return { ...state, bannedWords: action.payload.results || action.payload };
        case ADD_BANNED_WORD:
            return { ...state, bannedWords: [action.payload, ...state.bannedWords] };
        case DELETE_BANNED_WORD:
            return { ...state, bannedWords: state.bannedWords.filter(bw => bw.id !== action.payload) };
        case PATCH_BANNED_WORD:
            return { ...state, bannedWords: state.bannedWords.map(bw => bw.id === action.payload.id ? action.payload : bw) };
        default:
            return state;
    }
}