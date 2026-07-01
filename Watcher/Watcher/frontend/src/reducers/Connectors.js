import { GET_CONNECTORS, UPDATE_CONNECTOR } from '../actions/types';

const initialState = {
    connectors: [],
};

export default function connectors(state = initialState, action) {
    switch (action.type) {
        case GET_CONNECTORS:
            return { ...state, connectors: action.payload };

        case UPDATE_CONNECTOR:
            return {
                ...state,
                connectors: state.connectors.map(c =>
                    c.id === action.payload.id ? action.payload : c
                ),
            };

        default:
            return state;
    }
}
