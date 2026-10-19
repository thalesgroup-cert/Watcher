import axios from 'axios';

import {
    GET_SITES,
    GET_SITE_ALERTS,
    GET_SITES_ALL,
    GET_SITE_ALERTS_ALL,
    DELETE_SITE,
    ADD_SITE,
    PATCH_SITE,
    UPDATE_SITE_ALERT,
    EXPORT_MISP,
    GET_SITE_STATISTICS
} from "./types";
import {createMessage, returnErrors} from "./messages";
import {tokenConfig} from "./auth";
import {fetchAllPages} from "./paginationUtils";
import {LEGITIMATE_DOMAIN_BULK} from "./LegitimateDomain";


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
    return axios
        .post("/api/site_monitoring/site/", site, tokenConfig(getState))
        .then(res => {
            dispatch(createMessage({add: `${site.domain_name} Monitoring`}));
            dispatch({ type: ADD_SITE, payload: res.data });
            dispatch(getSites());
            dispatch(watchSiteInit(true));
            return res.data;
        })
        .catch(err => {
            dispatch(returnErrors(err.response.data, err.response.status));
            throw err;
        });
};

// UPDATE SITE
export const patchSite = (id, patchedSite) => (dispatch, getState) => {
    axios
        .patch(`/api/site_monitoring/site/${id}/`, patchedSite, tokenConfig(getState))
        .then(res => {
            dispatch(createMessage({add: `${patchedSite.domain_name} Updated`}));
            dispatch({ type: PATCH_SITE, payload: res.data });
            dispatch(getSites());
        })
        .catch(err =>
            dispatch(returnErrors(err.response.data, err.response.status))
        );
};

// GET ALERTS
export const getSiteAlerts = (page = 1, pageSize = 100, siteId = null) => (dispatch, getState) => {
    const siteFilter = siteId ? `&site=${siteId}` : '';
    return axios
        .get(`/api/site_monitoring/alert/?page=${page}&page_size=${pageSize}${siteFilter}`, tokenConfig(getState))
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
                type: GET_SITE_STATISTICS,
                payload: res.data
            });
        })
        .catch(err => {
            if (err.response) {
                dispatch(returnErrors(err.response.data, err.response.status));
            }
            dispatch({
                type: GET_SITE_STATISTICS,
                payload: {
                    total: 0,
                    malicious: 0,
                    takedownRequests: 0,
                    legalTeam: 0
                }
            });
        });
};

// GET ALL SITES (stats only)
export const getAllSites = () => (dispatch, getState) => {
    return fetchAllPages('/api/site_monitoring/site/', getState)
        .then(results => {
            dispatch({
                type: GET_SITES_ALL,
                payload: results
            });
            return results;
        })
        .catch(err => {
            dispatch(returnErrors(err.response?.data, err.response?.status));
        });
};

// GET ALL SITE ALERTS (stats only)
export const getAllSiteAlerts = () => (dispatch, getState) => {
    return fetchAllPages('/api/site_monitoring/alert/', getState)
        .then(results => {
            dispatch({
                type: GET_SITE_ALERTS_ALL,
                payload: results
            });
            return results;
        })
        .catch(err => {
            dispatch(returnErrors(err.response?.data, err.response?.status));
        });
};

// GET SITE INIT PROGRESS: number of new sites whose first check is not finished yet
export const getSiteInitProgress = () => (dispatch, getState) => {
    return axios
        .get('/api/site_monitoring/site/init_progress/', tokenConfig(getState))
        .then(res => {
            return res.data.pending;
        })
        .catch(err => {
            dispatch(returnErrors(err.response?.data, err.response?.status));
            return 0;
        });
};

// New sites are checked in the background, one after the other: reload the rows and the statistics every few
// seconds until none is left, so they fill in without a page refresh. Only one watcher runs at a time.
const SITE_INIT_POLL_MS = 5000;
let siteInitWatching = false;

export const watchSiteInit = (justCreated = false) => dispatch => {
    if (siteInitWatching) return;
    siteInitWatching = true;
    let sawPending = justCreated;
    const tick = () => dispatch(getSiteInitProgress()).then(pending => {
        if (pending > 0) sawPending = true;
        if (sawPending) {
            dispatch(getSites());
            dispatch(getSiteStatistics());
        }
        if (pending > 0) {
            setTimeout(tick, SITE_INIT_POLL_MS);
        } else {
            siteInitWatching = false;
        }
    });
    tick();
};

// Bulk descriptor of this module (see actions/Bulk.js): the API base, the action that drops a removed row from the
// store (list reducers merge what the server returns) and what to reload afterwards (list + dashboard statistics).
export const SITE_BULK = {
    endpoint: "/api/site_monitoring/site/",
    removedType: DELETE_SITE,
    refresh: [getSites, getAllSites, getAllSiteAlerts, getSiteStatistics],
    // exporting to Legitimate Domains also changes that module
    extraRefresh: {bulk_export_legitimate: LEGITIMATE_DOMAIN_BULK.refresh},
    afterCreate: dispatch => dispatch(watchSiteInit(true)),
};

export const SITE_ALERT_BULK = {
    endpoint: "/api/site_monitoring/alert/",
    refresh: [getAllSiteAlerts, getSiteStatistics],
};
