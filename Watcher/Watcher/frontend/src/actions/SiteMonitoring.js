import axios from 'axios';

import {
    GET_SITES,
    GET_SITE_ALERTS,
    DELETE_SITE,
    ADD_SITE,
    PATCH_SITE,
    UPDATE_SITE_ALERT,
    EXPORT_MISP
} from "./types";
import {createMessage, returnErrors} from "./messages";
import {tokenConfig} from "./auth";


// GET SITES
export const getSites = (page = 1, pageSize = 100) => (dispatch, getState) => {
    return axios
        .get(`/api/site_monitoring/site/?page=${page}&page_size=${pageSize}`, tokenConfig(getState))
        .then(res => {
            dispatch({
                type: GET_SITES,
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

// DELETE SITE
export const deleteSite = (id, site) => (dispatch, getState) => {
    axios
        .delete(`/api/site_monitoring/site/${id}/`, tokenConfig(getState))
        .then(res => {
            dispatch(createMessage({delete: `${site} Deleted`}));
            dispatch({
                type: DELETE_SITE,
                payload: id
            });
        })
        .catch(err =>
            dispatch(returnErrors(err.response.data, err.response.status))
        );
};

// ADD SITE
export const addSite = site => (dispatch, getState) => {
    axios
        .post("/api/site_monitoring/site/", site, tokenConfig(getState))
        .then(res => {
            dispatch(createMessage({add: `${site.domain_name} Monitoring`}));
            dispatch({
                type: ADD_SITE,
                payload: res.data
            });
        })
        .catch(err =>
            dispatch(returnErrors(err.response.data, err.response.status))
        );
};

// UPDATE SITE
export const patchSite = (id, patchedSite) => (dispatch, getState) => {
    axios
        .patch(`/api/site_monitoring/site/${id}/`, patchedSite, tokenConfig(getState))
        .then(res => {
            dispatch(createMessage({add: `${patchedSite.domain_name} Updated`}));
            dispatch({
                type: PATCH_SITE,
                payload: res.data
            });
        })
        .catch(err =>
            dispatch(returnErrors(err.response.data, err.response.status))
        );
};

// GET ALERTS
export const getSiteAlerts = (page = 1, pageSize = 100) => (dispatch, getState) => {
    return axios
        .get(`/api/site_monitoring/alert/?page=${page}&page_size=${pageSize}`, tokenConfig(getState))
        .then(res => {
            dispatch({
                type: GET_SITE_ALERTS,
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
export const updateSiteAlertStatus = (id, status) => (dispatch, getState) => {
    axios
        .patch(`/api/site_monitoring/alert/${id}/`, status, tokenConfig(getState))
        .then(res => {
            dispatch(createMessage({add: `Alert Updated`}));
            dispatch({
                type: UPDATE_SITE_ALERT,
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
        .post(`/api/site_monitoring/misp/`, site, tokenConfig(getState))
        .then(res => {
            const message = res.data.message || "Website Exported to MISP";
            
            dispatch(createMessage({add: message}));
            
            if (res.data.misp_event_uuid) {
                dispatch({
                    type: EXPORT_MISP,
                    payload: {
                        id: site.id,
                        misp_event_uuid: res.data.misp_event_uuid,
                        message: message
                    }
                });
            }
            
            dispatch(getSites());
        })
        .catch(err => {
            const errorMsg = err.response?.data?.message || 'Failed to export to MISP';
            dispatch(returnErrors(err.response.data, err.response.status));
            dispatch(createMessage({error: errorMsg}));
        });
};

// GET SITE MONITORING STATISTICS
export const getSiteStatistics = () => (dispatch, getState) => {
    const endpoint = '/api/site_monitoring/site/statistics/';
    
    axios.get(endpoint, tokenConfig(getState))
        .then(res => {
            dispatch({
                type: 'GET_SITE_STATISTICS',
                payload: res.data
            });
        })
        .catch(err => {
            if (err.response) {
                dispatch(returnErrors(err.response.data, err.response.status));
            }
            dispatch({
                type: 'GET_SITE_STATISTICS',
                payload: {
                    total: 0,
                    malicious: 0,
                    takedownRequests: 0,
                    legalTeam: 0
                }
            });
        });
};