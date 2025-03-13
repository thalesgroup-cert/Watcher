import { SET_DATE_FILTER } from './types';

export const updateDateFilter = (filterData) => ({
    type: SET_DATE_FILTER,
    payload: filterData
});