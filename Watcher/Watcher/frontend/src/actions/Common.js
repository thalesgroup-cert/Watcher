import axios from 'axios';
import { createMessage, returnErrors } from "./messages";
import { tokenConfig } from "./auth";
import { GET_WEEKLY_SUMMARY, GET_BREAKING_NEWS, GET_WORD_SUMMARY, GENERATE_WORD_SUMMARY } from "./types";

// EXPORT TO LEGITIMATE DOMAINS
export const exportToLegitimateDomains = (domain, comment) => (dispatch, getState) => {
    const legitimatePayload = {
        domain_name: domain.domain_name,
        ticket_id: domain.ticket_id || "",
        contact: "",
        expiry: domain.domain_expiry || "",
        repurchased: false,
        comments: comment || `Exported from Website Monitoring - Original legitimacy: ${domain.legitimacy}`
    };

    return axios.post('/api/common/legitimate_domains/', legitimatePayload, tokenConfig(getState))
        .then(res => {
            dispatch(createMessage({ add: `${domain.domain_name} exported to Legitimate Domains` }));
            return res.data;
        })
        .catch(err => {
            dispatch(returnErrors(err.response?.data || { error: 'Export failed' }, err.response?.status || 500));
            throw err;
        });
};

// GET WEEKLY SUMMARY
export const getWeeklySummary = () => (dispatch, getState) => {
    return axios.get('/api/threats_watcher/summary/?type=weekly_summary', tokenConfig(getState))
        .then(res => {
            dispatch({
                type: GET_WEEKLY_SUMMARY,
                payload: res.data
            });
            return res.data;
        })
        .catch(err => {
            dispatch(returnErrors(err.response?.data || { error: 'Failed to load weekly summary' }, err.response?.status || 500));
            throw err;
        });
};

// GET BREAKING NEWS
export const getBreakingNews = () => (dispatch, getState) => {
    return axios.get('/api/threats_watcher/summary/?type=breaking_news', tokenConfig(getState))
        .then(res => {
            dispatch({
                type: GET_BREAKING_NEWS,
                payload: res.data
            });
            return res.data;
        })
        .catch(err => {
            dispatch(returnErrors(err.response?.data || { error: 'Failed to load breaking news' }, err.response?.status || 500));
            throw err;
        });
};

// GET WORD SUMMARY
export const getWordSummary = (keyword) => (dispatch, getState) => {
    return axios.get(`/api/threats_watcher/summary/?type=trendy_word_summary&keyword=${encodeURIComponent(keyword)}`, tokenConfig(getState))
        .then(res => {
            dispatch({
                type: GET_WORD_SUMMARY,
                payload: res.data
            });
            return res.data;
        })
        .catch(err => {
            dispatch(returnErrors(err.response?.data || { error: 'Failed to load word summary' }, err.response?.status || 500));
            throw err;
        });
};

// GENERATE WORD SUMMARY
export const generateWordSummary = (keyword) => (dispatch, getState) => {
    return axios.get(`/api/threats_watcher/summary/by-keyword/${encodeURIComponent(keyword)}/`, tokenConfig(getState))
        .then(res => {
            dispatch({
                type: GENERATE_WORD_SUMMARY,
                payload: res.data
            });
            return res.data;
        })
        .catch(err => {
            const errorData = err.response?.data || { error: 'unknown', message: 'Failed to generate summary' };
            dispatch(returnErrors(errorData, err.response?.status || 500));
            throw { status: err.response?.status, data: errorData };
        });
};