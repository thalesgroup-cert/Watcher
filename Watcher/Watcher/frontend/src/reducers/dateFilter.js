import { SET_DATE_FILTER } from '../actions/types';

const initialState = {
    startDate: '',
    startTime: '00:00',
    endDate: '',
    endTime: '23:59',
};

export default function dateFilterReducer(state = initialState, action) {
    switch (action.type) {
        case SET_DATE_FILTER:
            return {
                ...state,
                ...action.payload
            };
        default:
            return state;
    }
}