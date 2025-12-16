import axios from 'axios';

import {GET_KEYWORDS, GET_ALERTS, DELETE_KEYWORD, ADD_KEYWORD, PATCH_KEYWORD, UPDATE_ALERT} from "./types";
import {createMessage, returnErrors} from "./messages";
import {tokenConfig} from "./auth";

// Here you will find all the API Requests

// GET KEYWORDS
export const getKeyWords = (page = 1, pageSize = 100) => (dispatch, getState) => {
    return axios
        .get(`/api/data_leak/keyword/?page=${page}&page_size=${pageSize}`, tokenConfig(getState))
        .then(res => {
            dispatch({
                type: GET_KEYWORDS,
                payload: {
                    results: res.data.results || res.data,
                    count: res.data.count || (Array.isArray(res.data) ? res.data.length : 0),
                    next: res.data.next || null,
                    previous: res.data.previous || null
                }
            });
            return res.data;
        })
        .catch(err => {
            dispatch(returnErrors(err.response?.data, err.response?.status));
            throw err;
        });
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
export const getAlerts = (page = 1, pageSize = 100) => (dispatch, getState) => {
    return axios
        .get(`/api/data_leak/alert/?page=${page}&page_size=${pageSize}`, tokenConfig(getState))
        .then(res => {
            dispatch({
                type: GET_ALERTS,
                payload: {
                    results: res.data.results || res.data,
                    count: res.data.count || (Array.isArray(res.data) ? res.data.length : 0),
                    next: res.data.next || null,
                    previous: res.data.previous || null
                }
            });
            return res.data;
        })
        .catch(err => {
            dispatch(returnErrors(err.response?.data, err.response?.status));
            throw err;
        });
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