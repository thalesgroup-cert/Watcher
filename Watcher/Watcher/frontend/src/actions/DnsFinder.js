import axios from 'axios';
import {
    GET_ALERTS,
    DELETE_ALERT,
    ADD_ALERT,
    UPDATE_ALERT_STATUS,
    GET_DNS_MONITORED,
    DELETE_DNS_MONITORED,
    ADD_DNS_MONITORED,
    PATCH_DNS_MONITORED,
    GET_KEYWORD_MONITORED,
    DELETE_KEYWORD_MONITORED,
    ADD_KEYWORD_MONITORED,
    PATCH_KEYWORD_MONITORED,
    EXPORT_TO_MISP
} from './types';
import { createMessage, returnErrors } from './messages';
import { tokenConfig } from './auth';

export const getAlerts = (page = 1, pageSize = 100) => (dispatch, getState) => {
    return axios
        .get(`/api/dns_finder/alert/?page=${page}&page_size=${pageSize}`, tokenConfig(getState))
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

export const deleteAlert = (id) => (dispatch, getState) => {
    axios
        .delete(`/api/dns_finder/alert/${id}/`, tokenConfig(getState))
        .then(res => {
            dispatch(createMessage({ delete: 'Alert Deleted' }));
            dispatch({
                type: DELETE_ALERT,
                payload: id
            });
        })
        .catch(err =>
            dispatch(returnErrors(err.response.data, err.response.status))
        );
};

export const addAlert = (alert) => (dispatch, getState) => {
    axios
        .post('/api/dns_finder/alert/', alert, tokenConfig(getState))
        .then(res => {
            dispatch(createMessage({ add: 'Alert Added' }));
            dispatch({
                type: ADD_ALERT,
                payload: res.data
            });
        })
        .catch(err =>
            dispatch(returnErrors(err.response.data, err.response.status))
        );
};

export const updateAlertStatus = (id, status) => (dispatch, getState) => {
    axios
        .patch(`/api/dns_finder/alert/${id}/`, status, tokenConfig(getState))
        .then(res => {
            dispatch(createMessage({ add: 'Alert Updated' }));
            dispatch({
                type: UPDATE_ALERT_STATUS,
                payload: res.data
            });
        })
        .catch(err =>
            dispatch(returnErrors(err.response.data, err.response.status))
        );
};

export const getDnsMonitored = (page = 1, pageSize = 100) => (dispatch, getState) => {
    return axios
        .get(`/api/dns_finder/dns_monitored/?page=${page}&page_size=${pageSize}`, tokenConfig(getState))
        .then(res => {
            dispatch({
                type: GET_DNS_MONITORED,
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

export const deleteDnsMonitored = (id, domain_name) => (dispatch, getState) => {
    axios
        .delete(`/api/dns_finder/dns_monitored/${id}/`, tokenConfig(getState))
        .then(res => {
            dispatch(createMessage({ delete: `${domain_name} Deleted` }));
            dispatch({
                type: DELETE_DNS_MONITORED,
                payload: id
            });
        })
        .catch(err =>
            dispatch(returnErrors(err.response.data, err.response.status))
        );
};

export const addDnsMonitored = (dns_monitored) => (dispatch, getState) => {
    axios
        .post('/api/dns_finder/dns_monitored/', dns_monitored, tokenConfig(getState))
        .then(res => {
            dispatch(createMessage({ add: `${dns_monitored.domain_name} Monitoring` }));
            dispatch({
                type: ADD_DNS_MONITORED,
                payload: res.data
            });
        })
        .catch(err =>
            dispatch(returnErrors(err.response.data, err.response.status))
        );
};

export const patchDnsMonitored = (id, dns_monitored) => (dispatch, getState) => {
    axios
        .patch(`/api/dns_finder/dns_monitored/${id}/`, dns_monitored, tokenConfig(getState))
        .then(res => {
            dispatch(createMessage({ add: `${dns_monitored.domain_name} Updated` }));
            dispatch({
                type: PATCH_DNS_MONITORED,
                payload: res.data
            });
        })
        .catch(err =>
            dispatch(returnErrors(err.response.data, err.response.status))
        );
};

export const getKeywordMonitored = (page = 1, pageSize = 100) => (dispatch, getState) => {
    return axios
        .get(`/api/dns_finder/keyword_monitored/?page=${page}&page_size=${pageSize}`, tokenConfig(getState))
        .then(res => {
            dispatch({
                type: GET_KEYWORD_MONITORED,
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

export const deleteKeywordMonitored = (id, name) => (dispatch, getState) => {
    axios
        .delete(`/api/dns_finder/keyword_monitored/${id}/`, tokenConfig(getState))
        .then(res => {
            dispatch(createMessage({ delete: `${name} Deleted` }));
            dispatch({
                type: DELETE_KEYWORD_MONITORED,
                payload: id
            });
        })
        .catch(err =>
            dispatch(returnErrors(err.response.data, err.response.status))
        );
};

export const addKeywordMonitored = (keyword_monitored) => (dispatch, getState) => {
    axios
        .post('/api/dns_finder/keyword_monitored/', keyword_monitored, tokenConfig(getState))
        .then(res => {
            dispatch(createMessage({ add: `${keyword_monitored.name} Monitoring` }));
            dispatch({
                type: ADD_KEYWORD_MONITORED,
                payload: res.data
            });
        })
        .catch(err =>
            dispatch(returnErrors(err.response.data, err.response.status))
        );
};

export const patchKeywordMonitored = (id, keyword_monitored) => (dispatch, getState) => {
    axios
        .patch(`/api/dns_finder/keyword_monitored/${id}/`, keyword_monitored, tokenConfig(getState))
        .then(res => {
            dispatch(createMessage({ add: `${keyword_monitored.name} Updated` }));
            dispatch({
                type: PATCH_KEYWORD_MONITORED,
                payload: res.data
            });
        })
        .catch(err =>
            dispatch(returnErrors(err.response.data, err.response.status))
        );
};

export const exportToMISP = (id, event_uuid, domain_name) => (dispatch, getState) => {
    const payload = { id, event_uuid };
    
    return axios
        .post('/api/dns_finder/misp/', payload, tokenConfig(getState))
        .then(res => {
            const message = res.data.message || `${domain_name} exported to MISP`;
            
            dispatch(createMessage({ add: message }));
            
            if (res.data.misp_event_uuid) {
                dispatch({
                    type: EXPORT_TO_MISP,
                    payload: {
                        id: id,
                        misp_event_uuid: res.data.misp_event_uuid,
                        message: message
                    }
                });
            }
            
            dispatch(getAlerts());
            
            return res.data;
        })
        .catch(err => {
            const errorMsg = err.response?.data?.message || 'Failed to export to MISP';
            dispatch(returnErrors(err.response?.data, err.response?.status));
            dispatch(createMessage({ error: errorMsg }));
            throw err;
        });
};