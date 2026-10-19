import {BULK_CREATE_RESULT, CLEAR_BULK_RESULT, BULK_START, BULK_END} from "../actions/types";

// result: summary of the last bulk action; running: the bulk request being processed, if any ({label, total})
const initialState = {result: null, running: null};

export default function (state = initialState, action) {
    switch (action.type) {
        case BULK_CREATE_RESULT:
            return {...state, result: action.payload};
        case BULK_START:
            return {...state, running: action.payload};
        case BULK_END:
            return {...state, running: null};
        case CLEAR_BULK_RESULT:
            return {...state, result: null};
        default:
            return state;
    }
}
