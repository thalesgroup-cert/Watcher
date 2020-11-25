import axios from 'axios';

import {
    GET_DNS_MONITORED,
    GET_DNS_FINDER_ALERTS,
    DELETE_DNS_MONITORED,
    ADD_DNS_MONITORED,
    PATCH_DNS_MONITORED,
    UPDATE_DNS_FINDER_ALERT,
    EXPORT_THE_HIVE_DNS_FINDER,
    EXPORT_MISP_DNS_FINDER
} from "./types";
import {createMessage, returnErrors} from "./messages";
import {tokenConfig} from "./auth";

// Here you will find all the API Requests

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

// EXPORT TO THE HIVE
export const exportToTheHive = (site) => (dispatch, getState) => {
    axios
        .post(`/api/dns_finder/thehive/`, site, tokenConfig(getState))
        .then(res => {
            dispatch(createMessage({add: `Twisted DNS Exported to Thehive`}));
            dispatch({
                type: EXPORT_THE_HIVE_DNS_FINDER,
                payload: res.data
            });
        })
        .catch(err =>
            dispatch(returnErrors(err.response.data, err.response.status))
        );
};

// EXPORT TO MISP
export const exportToMISP = (site) => (dispatch, getState) => {
    axios
        .post(`/api/dns_finder/misp/`, site, tokenConfig(getState))
        .then(res => {
            dispatch(createMessage({add: `Twisted DNS Exported to MISP`}));
            dispatch({
                type: EXPORT_MISP_DNS_FINDER,
                payload: res.data
            });
        })
        .catch(err =>
            dispatch(returnErrors(err.response.data, err.response.status))
        );
};