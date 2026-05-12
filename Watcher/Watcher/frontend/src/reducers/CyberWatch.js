import {
    CYBERWATCH_GET_CVES,
    CYBERWATCH_GET_RANSOMWARE_VICTIMS,
    CYBERWATCH_GET_WATCH_RULES,
    CYBERWATCH_ADD_WATCH_RULE,
    CYBERWATCH_DELETE_WATCH_RULE,
    CYBERWATCH_PATCH_WATCH_RULE,
    CYBERWATCH_GET_WATCH_RULE_HITS,
    CYBERWATCH_ARCHIVE_CVE,
    CYBERWATCH_ARCHIVE_VICTIM,
    CYBERWATCH_GET_ARCHIVED_CVES,
    CYBERWATCH_GET_ARCHIVED_VICTIMS,
    CYBERWATCH_GET_ARCHIVED_HITS,
    CYBERWATCH_UNARCHIVE_CVE,
    CYBERWATCH_UNARCHIVE_VICTIM,
    CYBERWATCH_ARCHIVE_HIT,
    CYBERWATCH_UNARCHIVE_HIT,
} from '../actions/types';

const initialState = {
    cves: [],
    ransomwareVictims: [],
    watchRules: [],
    watchRuleHits: [],
    archivedCVEs: [],
    archivedVictims: [],
    archivedHits: [],
};

export default function (state = initialState, action) {
    switch (action.type) {
        case CYBERWATCH_GET_CVES:
            return { ...state, cves: action.payload.results || action.payload };
        case CYBERWATCH_GET_RANSOMWARE_VICTIMS:
            return { ...state, ransomwareVictims: action.payload.results || action.payload };
        case CYBERWATCH_GET_WATCH_RULES:
            return { ...state, watchRules: action.payload.results || action.payload };
        case CYBERWATCH_ADD_WATCH_RULE:
            return { ...state, watchRules: [...state.watchRules, action.payload] };
        case CYBERWATCH_DELETE_WATCH_RULE:
            return { ...state, watchRules: state.watchRules.filter(r => r.id !== action.payload) };
        case CYBERWATCH_PATCH_WATCH_RULE:
            return {
                ...state,
                watchRules: state.watchRules.map(r => r.id === action.payload.id ? action.payload : r)
            };
        case CYBERWATCH_GET_WATCH_RULE_HITS:
            return { ...state, watchRuleHits: action.payload.results || action.payload };
        case CYBERWATCH_ARCHIVE_CVE:
            return {
                ...state,
                cves: state.cves.filter(c => c.id !== action.payload.id),
                archivedCVEs: [action.payload, ...state.archivedCVEs],
            };
        case CYBERWATCH_ARCHIVE_VICTIM:
            return {
                ...state,
                ransomwareVictims: state.ransomwareVictims.filter(v => v.id !== action.payload.id),
                archivedVictims: [action.payload, ...state.archivedVictims],
            };
        case CYBERWATCH_UNARCHIVE_CVE:
            return {
                ...state,
                archivedCVEs: state.archivedCVEs.filter(c => c.id !== action.payload.id),
                cves: [action.payload, ...state.cves],
            };
        case CYBERWATCH_UNARCHIVE_VICTIM:
            return {
                ...state,
                archivedVictims: state.archivedVictims.filter(v => v.id !== action.payload.id),
                ransomwareVictims: [action.payload, ...state.ransomwareVictims],
            };
        case CYBERWATCH_GET_ARCHIVED_CVES:
            return { ...state, archivedCVEs: action.payload.results || action.payload };
        case CYBERWATCH_GET_ARCHIVED_VICTIMS:
            return { ...state, archivedVictims: action.payload.results || action.payload };
        case CYBERWATCH_GET_ARCHIVED_HITS:
            return { ...state, archivedHits: action.payload.results || action.payload };
        case CYBERWATCH_ARCHIVE_HIT:
            return {
                ...state,
                watchRuleHits: state.watchRuleHits.filter(h => h.id !== action.payload.id),
                archivedHits: [action.payload, ...state.archivedHits],
            };
        case CYBERWATCH_UNARCHIVE_HIT:
            return {
                ...state,
                archivedHits: state.archivedHits.filter(h => h.id !== action.payload.id),
                watchRuleHits: [action.payload, ...state.watchRuleHits],
            };
        default:
            return state;
    }
}
