import axios from 'axios';

import {
    GET_DNS_MONITORED,
    GET_DNS_FINDER_ALERTS,
    DELETE_DNS_MONITORED,
    ADD_DNS_MONITORED,
    PATCH_DNS_MONITORED,
    UPDATE_DNS_FINDER_ALERT,
    EXPORT_MISP_DNS_FINDER,
    GET_KEYWORD_MONITORED,
    DELETE_KEYWORD_MONITORED,
    ADD_KEYWORD_MONITORED,
    PATCH_KEYWORD_MONITORED
} from "./types";
import {createMessage, returnErrors} from "./messages";
import {tokenConfig} from "./auth";
import {getSites} from "./SiteMonitoring";

// GET DNS MONITORED
export const getDnsMonitored = () => (dispatch, getState) => {
    axios.get('/api/dns_finder/dns_monitored/', tokenConfig(getState))
        .then(res => {
            dispatch({
                type: GET_DNS_MONITORED,
                payload: res.data
            });
        })
        .catch(err =>
            dispatch(returnErrors(err.response.data, err.response.status))
        );
};

// DELETE DNS MONITORED
export const deleteDnsMonitored = (id, dns_monitored) => (dispatch, getState) => {
    axios
        .delete(`/api/dns_finder/dns_monitored/${id}/`, tokenConfig(getState))
        .then(res => {
            dispatch(createMessage({delete: `${dns_monitored} Deleted`}));
            dispatch({
                type: DELETE_DNS_MONITORED,
                payload: id
            });
        })
        .catch(err =>
            dispatch(returnErrors(err.response.data, err.response.status))
        );
};

// ADD DNS MONITORED
export const addDnsMonitored = dns_monitored => (dispatch, getState) => {
    axios
        .post("/api/dns_finder/dns_monitored/", dns_monitored, tokenConfig(getState))
        .then(res => {
            dispatch(createMessage({add: `${dns_monitored.domain_name} Monitoring`}));
            dispatch({
                type: ADD_DNS_MONITORED,
                payload: res.data
            });
        })
        .catch(err =>
            dispatch(returnErrors(err.response.data, err.response.status))
        );
};

// UPDATE DNS MONITORED
export const patchDnsMonitored = (id, dns_monitored) => (dispatch, getState) => {
    axios
        .patch(`/api/dns_finder/dns_monitored/${id}/`, dns_monitored, tokenConfig(getState))
        .then(res => {
            dispatch(createMessage({add: `${dns_monitored.domain_name} Updated`}));
            dispatch({
                type: PATCH_DNS_MONITORED,
                payload: res.data
            });
        })
        .catch(err =>
            dispatch(returnErrors(err.response.data, err.response.status))
        );
};

// GET KEYWORD MONITORED
export const getKeywordMonitored = () => (dispatch, getState) => {
    axios.get('/api/dns_finder/keyword_monitored/', tokenConfig(getState))
        .then(res => {
            dispatch({
                type: GET_KEYWORD_MONITORED,
                payload: res.data
            });
        })
        .catch(err =>
            dispatch(returnErrors(err.response.data, err.response.status))
        );
};

// DELETE KEYWORD MONITORED
export const deleteKeywordMonitored = (id, keyword_monitored) => (dispatch, getState) => {
    axios
        .delete(`/api/dns_finder/keyword_monitored/${id}/`, tokenConfig(getState))
        .then(res => {
            dispatch(createMessage({delete: `${keyword_monitored} Deleted`}));
            dispatch({
                type: DELETE_KEYWORD_MONITORED,
                payload: id
            });
        })
        .catch(err =>
            dispatch(returnErrors(err.response.data, err.response.status))
        );
};

// ADD KEYWORD MONITORED
export const addKeywordMonitored = keyword_monitored => (dispatch, getState) => {
    axios
        .post("/api/dns_finder/keyword_monitored/", keyword_monitored, tokenConfig(getState))
        .then(res => {
            dispatch(createMessage({add: `${keyword_monitored.name} Monitoring`}));
            dispatch({
                type: ADD_KEYWORD_MONITORED,
                payload: res.data
            });
        })
        .catch(err =>
            dispatch(returnErrors(err.response.data, err.response.status))
        );
};

// UPDATE KEYWORD MONITORED
export const patchKeywordMonitored = (id, keyword_monitored) => (dispatch, getState) => {
    axios
        .patch(`/api/dns_finder/keyword_monitored/${id}/`, keyword_monitored, tokenConfig(getState))
        .then(res => {
            dispatch(createMessage({add: `${keyword_monitored.name} Updated`}));
            dispatch({
                type: PATCH_KEYWORD_MONITORED,
                payload: res.data
            });
        })
        .catch(err =>
            dispatch(returnErrors(err.response.data, err.response.status))
        );
};

// GET DNS FINDER ALERTS
export const getAlerts = () => (dispatch, getState) => {
    axios.get('/api/dns_finder/alert/', tokenConfig(getState))
        .then(res => {
            dispatch({
                type: GET_DNS_FINDER_ALERTS,
                payload: res.data
            });
        })
        .catch(err =>
            dispatch(returnErrors(err.response.data, err.response.status))
        );
};

// UPDATE DNS FINDER ALERT
export const updateAlertStatus = (id, status) => (dispatch, getState) => {
    axios
        .patch(`/api/dns_finder/alert/${id}/`, status, tokenConfig(getState))
        .then(res => {
            dispatch(createMessage({add: `Alert Updated`}));
            dispatch({
                type: UPDATE_DNS_FINDER_ALERT,
                payload: res.data
            });
        })
        .catch(err =>
            dispatch(returnErrors(err.response.data, err.response.status))
        );
};

// EXPORT TO MISP
export const exportToMISP = (payload) => (dispatch, getState) => {
    axios
        .post("/api/dns_finder/misp/", payload, tokenConfig(getState))
        .then(res => {
            const message = res.data.message || "DNS twisted exported to MISP";
            
            dispatch(createMessage({add: message}));
            
            dispatch({
                type: EXPORT_MISP_DNS_FINDER,
                payload: {
                    id: dnsTwistedId,
                    misp_event_uuid: res.data.misp_event_uuid,
                    message: message
                }
            });
            
            dispatch(getSites());
            dispatch(getAlerts());
        })
        .catch(err => {
            const errorMsg = err.response?.data?.message || 'Failed to export to MISP';
            dispatch(returnErrors(err.response.data, err.response.status));
            dispatch(createMessage({error: errorMsg}));
        })
        .finally(() => {
            dispatch({ 
                type: 'RESET_EXPORT_LOADING', 
                payload: dnsTwistedId 
            });
        });
};