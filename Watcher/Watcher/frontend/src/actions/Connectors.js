import axios from 'axios';
import { GET_CONNECTORS, UPDATE_CONNECTOR } from './types';
import { createMessage, returnErrors } from './messages';
import { tokenConfig } from './auth';


export const getConnectors = () => (dispatch, getState) => {
    return axios
        .get('/api/connectors/', tokenConfig(getState))
        .then(res => dispatch({ type: GET_CONNECTORS, payload: res.data }))
        .catch(err =>
            dispatch(returnErrors(err.response?.data, err.response?.status))
        );
};


// Returns the full connector data (with decrypted secrets) but does NOT dispatch to Redux.
// Secrets must never touch the Redux store.
export const revealConnector = (id) => (dispatch, getState) => {
    return axios
        .get(`/api/connectors/${id}/?reveal=true`, tokenConfig(getState))
        .then(res => res.data)
        .catch(err => {
            dispatch(returnErrors(err.response?.data, err.response?.status));
            return null;
        });
};


export const updateConnector = (id, fields) => (dispatch, getState) => {
    return axios
        .patch(`/api/connectors/${id}/`, { fields }, tokenConfig(getState))
        .then(res => {
            dispatch({ type: UPDATE_CONNECTOR, payload: res.data });
            dispatch(createMessage({ add: 'Connector updated' }));
        })
        .catch(err =>
            dispatch(returnErrors(err.response?.data, err.response?.status))
        );
};


export const testConnector = (id) => (dispatch, getState) => {
    return axios
        .post(`/api/connectors/${id}/test/`, {}, tokenConfig(getState))
        .then(res => res.data)
        .catch(err => {
            dispatch(returnErrors(err.response?.data, err.response?.status));
            return { success: false, message: 'Request failed' };
        });
};
