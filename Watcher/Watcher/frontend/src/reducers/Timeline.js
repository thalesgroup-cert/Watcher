import { GET_TIMELINE_EVENTS, CLEAR_TIMELINE_EVENTS } from '../actions/types';

const initialState = {
    events: [],
    loading: false,
};

export default function timelineReducer(state = initialState, action) {
    switch (action.type) {
        case CLEAR_TIMELINE_EVENTS:
            return { ...state, events: [], loading: true };
        case GET_TIMELINE_EVENTS:
            return { ...state, events: action.payload, loading: false };
        default:
            return state;
    }
}
