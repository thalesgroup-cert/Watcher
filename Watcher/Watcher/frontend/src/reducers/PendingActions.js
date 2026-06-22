import {
    GET_PENDING_ACTIONS_COUNT,
    GET_PENDING_ACTIONS,
    APPROVE_PENDING_ACTION,
    REJECT_PENDING_ACTION,
} from '../actions/types';

const initialState = {
    count:   0,
    actions: [],
};

export default function pendingActions(state = initialState, action) {
    switch (action.type) {
        case GET_PENDING_ACTIONS_COUNT:
            return { ...state, count: action.payload };

        case GET_PENDING_ACTIONS:
            return {
                ...state,
                actions: action.payload,
                count:   action.payload.length,
            };

        case APPROVE_PENDING_ACTION:
        case REJECT_PENDING_ACTION:
            return {
                ...state,
                actions: state.actions.filter(a => a.id !== action.payload),
                count:   Math.max(0, state.count - 1),
            };

        default:
            return state;
    }
}
