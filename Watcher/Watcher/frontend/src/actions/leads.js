import axios from 'axios';

import {GET_LEADS, DELETE_LEAD, ADD_BANNED_WORD, GET_MONITORED_KEYWORDS, ADD_MONITORED_KEYWORD, UPDATE_MONITORED_KEYWORD, DELETE_MONITORED_KEYWORD, GET_KEYWORD_ARTICLES} from "./types";
import {createMessage, returnErrors} from "./messages";
import {tokenConfig} from "./auth";

// Here you will find all the API Requests

// GET LEADS
export const getLeads = () => dispatch => {
    axios.get('/api/threats_watcher/trendyword/')
        .then(res => {
            dispatch({
                type: GET_LEADS,
                payload: res.data
            });
        })
        .catch(err =>
            dispatch(returnErrors(err.response.data, err.response.status))
        );
};

// DELETE LEAD
export const deleteLead = (id, word) => (dispatch, getState) => {
    axios
        .delete(`/api/threats_watcher/trendyword/${id}/`, tokenConfig(getState))
        .then(res => {
            dispatch(createMessage({delete: `${word} Deleted`}));
            dispatch({
                type: DELETE_LEAD,
                payload: id
            });
        })
        .catch(err =>
            dispatch(returnErrors(err.response.data, err.response.status))
        );
};

// ADD BANNED WORD
export const addBannedWord = word => (dispatch, getState) => {
    axios
        .post("/api/threats_watcher/bannedword/", word, tokenConfig(getState))
        .then(res => {
            dispatch(createMessage({add: `${word.name} added to the Blocklist`}));
            dispatch({
                type: ADD_BANNED_WORD,
                payload: res.data
            });
        })
        .catch(err =>
            dispatch(returnErrors(err.response.data, err.response.status))
        );
};

// GET MONITORED KEYWORDS
export const getMonitoredKeywords = () => (dispatch, getState) => {
    axios
        .get('/api/threats_watcher/monitoredkeyword/', tokenConfig(getState))
        .then(res => {
            dispatch({
                type: GET_MONITORED_KEYWORDS,
                payload: res.data
            });
        })
        .catch(err => dispatch(returnErrors(err.response.data, err.response.status)));
};

// ADD MONITORED KEYWORD
export const addMonitoredKeyword = (keyword) => (dispatch, getState) => {
    axios
        .post('/api/threats_watcher/monitoredkeyword/', keyword, tokenConfig(getState))
        .then(res => {
            dispatch(createMessage({addMonitoredKeyword: 'Keyword Added to Monitoring'}));
            dispatch({
                type: ADD_MONITORED_KEYWORD,
                payload: res.data
            });
            // Refresh TrendyWords to reflect new boosted values
            dispatch(getLeads());
        })
        .catch(err => dispatch(returnErrors(err.response.data, err.response.status)));
};

// DELETE MONITORED KEYWORD
export const deleteMonitoredKeyword = (id) => (dispatch, getState) => {
    axios
        .delete(`/api/threats_watcher/monitoredkeyword/${id}/`, tokenConfig(getState))
        .then(() => {
            dispatch(createMessage({deleteMonitoredKeyword: 'Keyword Removed from Monitoring'}));
            dispatch({
                type: DELETE_MONITORED_KEYWORD,
                payload: id
            });
            // Refresh TrendyWords to reflect removed boost
            dispatch(getLeads());
        })
        .catch(err => dispatch(returnErrors(err.response.data, err.response.status)));
};

// UPDATE MONITORED KEYWORD
export const updateMonitoredKeyword = (id, keyword) => (dispatch, getState) => {
    axios
        .patch(`/api/threats_watcher/monitoredkeyword/${id}/`, keyword, tokenConfig(getState))
        .then(res => {
            dispatch(createMessage({updateMonitoredKeyword: 'Keyword Updated'}));
            dispatch({
                type: UPDATE_MONITORED_KEYWORD,
                payload: res.data
            });
            dispatch(getLeads());
        })
        .catch(err => dispatch(returnErrors(err.response.data, err.response.status)));
};

// GET ARTICLES FOR A SPECIFIC KEYWORD
export const getKeywordArticles = (keywordId) => (dispatch, getState) => {
    return axios
        .get(`/api/threats_watcher/monitoredkeyword/${keywordId}/articles/`, tokenConfig(getState))
        .then(res => res.data.articles)
        .catch(err => {
            dispatch(returnErrors(err.response.data, err.response.status));
            return [];
        });
};