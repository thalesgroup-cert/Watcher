import { WORLDMAP_GET_SOURCES, WORLDMAP_PATCH_SOURCE } from '../actions/types';

const initialState = {
    sources: [],
};

export default function WorldMapReducer(state = initialState, action) {
    switch (action.type) {
        case WORLDMAP_GET_SOURCES:
            return { ...state, sources: action.payload };
        case WORLDMAP_PATCH_SOURCE:
            return {
                ...state,
                sources: state.sources.map(s =>
                    s.id === action.payload.id ? action.payload : s
                ),
            };
        default:
            return state;
    }
}
