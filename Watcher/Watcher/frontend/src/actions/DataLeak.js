import axios from 'axios';

import {GET_KEYWORDS, GET_ALERTS, DELETE_KEYWORD, ADD_KEYWORD, PATCH_KEYWORD, UPDATE_ALERT} from "./types";
import {createMessage, returnErrors} from "./messages";
import {tokenConfig} from "./auth";

// Here you will find all the API Requests

// GET KEYWORDS
export const getKeyWords = () => (dispatch, getState) => {
    axios.get('/api/data_leak/keyword/', tokenConfig(getState))
        .then(res => {
            dispatch({
                type: GET_KEYWORDS,
                payload: res.data
            });
        })
        .catch(err =>
            dispatch(returnErrors(err.response.data, err.response.status))
        );
};

// DELETE KEYWORD
export const deleteKeyWord = (id, word) => (dispatch, getState) => {
    axios
        .delete(`/api/data_leak/keyword/${id}/`, tokenConfig(getState))
        .then(res => {
            dispatch(createMessage({delete: `${word} Deleted`}));
            dispatch({
                type: DELETE_KEYWORD,
                payload: id
            });
        })
        .catch(err =>
            dispatch(returnErrors(err.response.data, err.response.status))
        );
};

// ADD KEYWORD
export const addKeyWord = word => (dispatch, getState) => {
    axios
        .post("/api/data_leak/keyword/", word, tokenConfig(getState))
        .then(res => {
            dispatch(createMessage({add: `${word.name} Monitoring`}));
            dispatch({
                type: ADD_KEYWORD,
                payload: res.data
            });
        })
        .catch(err =>
            dispatch(returnErrors(err.response.data, err.response.status))
        );
};

// UPDATE KEYWORD
export const patchKeyWord = (id, patchedWord) => (dispatch, getState) => {
    axios
        .patch(`/api/data_leak/keyword/${id}/`, patchedWord, tokenConfig(getState))
        .then(res => {
            dispatch(createMessage({add: `${patchedWord.name} Updated`}));
            dispatch({
                type: PATCH_KEYWORD,
                payload: res.data
            });
        })
        .catch(err =>
            dispatch(returnErrors(err.response.data, err.response.status))
        );
};

// GET ALERTS
export const getAlerts = () => (dispatch, getState) => {
    axios.get('/api/data_leak/alert/', tokenConfig(getState))
        .then(res => {
            dispatch({
                type: GET_ALERTS,
                payload: res.data
            });
        })
        .catch(err =>
            dispatch(returnErrors(err.response.data, err.response.status))
        );
};

// UPDATE ALERT
export const updateAlertStatus = (id, status) => (dispatch, getState) => {
    axios
        .patch(`/api/data_leak/alert/${id}/`, status, tokenConfig(getState))
        .then(res => {
            dispatch(createMessage({add: `Alert Updated`}));
            dispatch({
                type: UPDATE_ALERT,
                payload: res.data
            });
        })
        .catch(err =>
            dispatch(returnErrors(err.response.data, err.response.status))
        );
};