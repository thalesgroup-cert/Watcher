import {GET_LEADS, DELETE_LEAD} from '../actions/types.js';

const initialState = {
    leads: [],
    leadsCount: 0,
    leadsNext: null,
    leadsPrevious: null
};

export default function (state = initialState, action) {
    switch (action.type) {
        case GET_LEADS: {
            const newResults = action.payload.results || action.payload;
            
            if (!action.payload.results) {
                return {
                    ...state,
                    leads: newResults,
                    leadsCount: newResults.length,
                    leadsNext: null,
                    leadsPrevious: null
                };
            }
            
            const existingIds = new Set(state.leads.map(l => l.id));
            const uniqueNewLeads = newResults.filter(lead => !existingIds.has(lead.id));
            
            return {
                ...state,
                leads: [...state.leads, ...uniqueNewLeads].sort((a, b) => 
                    new Date(b.created_at) - new Date(a.created_at)
                ),
                leadsCount: action.payload.count || state.leadsCount,
                leadsNext: action.payload.next || null,
                leadsPrevious: action.payload.previous || null
            };
        }

        case DELETE_LEAD:
            return {
                ...state,
                leads: state.leads.filter(lead => lead.id !== action.payload),
                leadsCount: Math.max(0, state.leadsCount - 1)
            };

        default:
            return state;
    }
}