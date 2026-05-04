import { PROFILE_LOADED, PROFILE_UPDATED, PROFILE_LOADING, PROFILE_ERROR } from "../actions/types";

const initialState = {
    theme: 'bootstrap',
    preferences: {},
    isLoading: false,
    error: false
};

export default function profileReducer(state = initialState, action) {
    switch (action.type) {
        case PROFILE_LOADING:
            return { ...state, isLoading: true, error: false };
        case PROFILE_LOADED:
        case PROFILE_UPDATED:
            return { ...state, isLoading: false, error: false, ...action.payload };
        case PROFILE_ERROR:
            return { ...state, isLoading: false, error: true };
        default:
            return state;
    }
}
