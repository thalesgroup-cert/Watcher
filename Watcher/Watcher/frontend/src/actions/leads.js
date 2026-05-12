import axios from 'axios';

import {
    GET_LEADS, DELETE_LEAD, ADD_BANNED_WORD,
    GET_MONITORED_KEYWORDS, ADD_MONITORED_KEYWORD,
    DELETE_MONITORED_KEYWORD, PATCH_MONITORED_KEYWORD,
    GET_THREATS_WATCHER_STATISTICS,
    GET_SOURCES, ADD_SOURCE, DELETE_SOURCE, PATCH_SOURCE,
    GET_BANNED_WORDS, DELETE_BANNED_WORD, PATCH_BANNED_WORD,
} from "./types";
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
export const getMonitoredKeywords = () => dispatch => {
    axios.get('/api/threats_watcher/monitored-keywords/')
        .then(res => {
            dispatch({ type: GET_MONITORED_KEYWORDS, payload: res.data });
        })
        .catch(err =>
            dispatch(returnErrors(err.response?.data, err.response?.status))
        );
};

// ADD MONITORED KEYWORD
export const addMonitoredKeyword = keyword => (dispatch, getState) => {
    axios
        .post('/api/threats_watcher/monitored-keywords/', keyword, tokenConfig(getState))
        .then(res => {
            dispatch(createMessage({ add: `"${keyword.name}" added to Monitored Keywords` }));
            dispatch({ type: ADD_MONITORED_KEYWORD, payload: res.data });
        })
        .catch(err =>
            dispatch(returnErrors(err.response?.data, err.response?.status))
        );
};

// DELETE MONITORED KEYWORD
export const deleteMonitoredKeyword = (id, name) => (dispatch, getState) => {
    axios
        .delete(`/api/threats_watcher/monitored-keywords/${id}/`, tokenConfig(getState))
        .then(() => {
            dispatch(createMessage({ delete: `"${name}" removed from Monitored Keywords` }));
            dispatch({ type: DELETE_MONITORED_KEYWORD, payload: id });
        })
        .catch(err =>
            dispatch(returnErrors(err.response?.data, err.response?.status))
        );
};

// GET THREATS WATCHER STATISTICS
export const getThreatsWatcherStatistics = () => (dispatch, getState) => {
    axios
        .get('/api/threats_watcher/source/statistics/', tokenConfig(getState))
        .then(res => {
            dispatch({ type: GET_THREATS_WATCHER_STATISTICS, payload: res.data });
        })
        .catch(err => {
            dispatch({ type: GET_THREATS_WATCHER_STATISTICS, payload: { totalWords: 0, newToday: 0, newThisWeek: 0, totalSources: 0, bannedWords: 0, monitoredKeywords: 0, topWords: [], dailyNew: [0,0,0,0,0,0,0] } });
            if (err.response) dispatch(returnErrors(err.response.data, err.response.status));
        });
};

// PATCH MONITORED KEYWORD
export const patchMonitoredKeyword = (id, data) => (dispatch, getState) => {
    axios
        .patch(`/api/threats_watcher/monitored-keywords/${id}/`, data, tokenConfig(getState))
        .then(res => {
            dispatch(createMessage({ add: 'Monitored Keyword updated' }));
            dispatch({ type: PATCH_MONITORED_KEYWORD, payload: res.data });
        })
        .catch(err =>
            dispatch(returnErrors(err.response?.data, err.response?.status))
        );
};

// SOURCES (RSS Feeds)
export const getSources = () => dispatch => {
    axios.get('/api/threats_watcher/source/')
        .then(res => {
            dispatch({ type: GET_SOURCES, payload: res.data });
        })
        .catch(err =>
            dispatch(returnErrors(err.response?.data, err.response?.status))
        );
};

export const addSource = source => (dispatch, getState) => {
    axios.post('/api/threats_watcher/source/', source, tokenConfig(getState))
        .then(res => {
            dispatch(createMessage({ add: `Source "${source.url}" added` }));
            dispatch({ type: ADD_SOURCE, payload: res.data });
        })
        .catch(err =>
            dispatch(returnErrors(err.response?.data, err.response?.status))
        );
};

export const deleteSource = (id, url) => (dispatch, getState) => {
    axios.delete(`/api/threats_watcher/source/${id}/`, tokenConfig(getState))
        .then(() => {
            dispatch(createMessage({ delete: `Source "${url}" deleted` }));
            dispatch({ type: DELETE_SOURCE, payload: id });
        })
        .catch(err =>
            dispatch(returnErrors(err.response?.data, err.response?.status))
        );
};

export const patchSource = (id, data) => (dispatch, getState) => {
    axios.patch(`/api/threats_watcher/source/${id}/`, data, tokenConfig(getState))
        .then(res => {
            dispatch(createMessage({ add: 'Source updated' }));
            dispatch({ type: PATCH_SOURCE, payload: res.data });
        })
        .catch(err =>
            dispatch(returnErrors(err.response?.data, err.response?.status))
        );
};

// BANNED WORDS

export const getBannedWords = () => (dispatch, getState) => {
    axios.get('/api/threats_watcher/bannedword/', tokenConfig(getState))
        .then(res => {
            dispatch({ type: GET_BANNED_WORDS, payload: res.data });
        })
        .catch(err =>
            dispatch(returnErrors(err.response?.data, err.response?.status))
        );
};

export const deleteBannedWord = (id, name) => (dispatch, getState) => {
    axios.delete(`/api/threats_watcher/bannedword/${id}/`, tokenConfig(getState))
        .then(() => {
            dispatch(createMessage({ delete: `"${name}" removed from Banned Words` }));
            dispatch({ type: DELETE_BANNED_WORD, payload: id });
        })
        .catch(err =>
            dispatch(returnErrors(err.response?.data, err.response?.status))
        );
};

export const patchBannedWord = (id, data) => (dispatch, getState) => {
    axios.patch(`/api/threats_watcher/bannedword/${id}/`, data, tokenConfig(getState))
        .then(res => {
            dispatch(createMessage({ add: 'Banned word updated' }));
            dispatch({ type: PATCH_BANNED_WORD, payload: res.data });
        })
        .catch(err =>
            dispatch(returnErrors(err.response?.data, err.response?.status))
        );
};
