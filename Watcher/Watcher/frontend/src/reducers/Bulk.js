import {BULK_CREATE_RESULT, CLEAR_BULK_RESULT} from "../actions/types";

const initialState = {result: null};

export default function (state = initialState, action) {
    switch (action.type) {
        case BULK_CREATE_RESULT:
            return {...state, result: action.payload};
        case CLEAR_BULK_RESULT:
            return {...state, result: null};
        default:
            return state;
    }
}
