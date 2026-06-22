import axios from 'axios';
import {
    GET_PENDING_ACTIONS_COUNT,
    GET_PENDING_ACTIONS,
    APPROVE_PENDING_ACTION,
    REJECT_PENDING_ACTION,
} from './types';
import { createMessage, returnErrors } from './messages';
import { tokenConfig } from './auth';


export const getPendingActionsCount = () => (dispatch, getState) => {
    return axios
        .get('/api/common/pending_actions/count/', tokenConfig(getState))
        .then(res =>
            dispatch({ type: GET_PENDING_ACTIONS_COUNT, payload: res.data.count })
        )
        .catch(() => {});
};


export const getPendingActions = () => (dispatch, getState) => {
    return axios
        .get('/api/common/pending_actions/?status=pending', tokenConfig(getState))
        .then(res =>
            dispatch({
                type: GET_PENDING_ACTIONS,
                payload: res.data.results ?? res.data,
            })
        )
        .catch(err =>
            dispatch(returnErrors(err.response?.data, err.response?.status))
        );
};


export const approvePendingAction = id => (dispatch, getState) => {
    return axios
        .post(`/api/common/pending_actions/${id}/approve/`, {}, tokenConfig(getState))
        .then(() => {
            dispatch({ type: APPROVE_PENDING_ACTION, payload: id });
            dispatch(createMessage({ add: 'Action approved and executed' }));
        })
        .catch(err =>
            dispatch(returnErrors(err.response?.data, err.response?.status))
        );
};


export const rejectPendingAction = id => (dispatch, getState) => {
    return axios
        .post(`/api/common/pending_actions/${id}/reject/`, {}, tokenConfig(getState))
        .then(() => {
            dispatch({ type: REJECT_PENDING_ACTION, payload: id });
            dispatch(createMessage({ add: 'Action rejected' }));
        })
        .catch(err =>
            dispatch(returnErrors(err.response?.data, err.response?.status))
        );
};
