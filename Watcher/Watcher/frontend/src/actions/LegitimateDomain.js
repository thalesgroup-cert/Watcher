import axios from 'axios';
import {
    GET_LEGITIMATE_DOMAINS,
    DELETE_LEGITIMATE_DOMAIN,
    ADD_LEGITIMATE_DOMAIN,
    PATCH_LEGITIMATE_DOMAIN,
} from "./types";
import { createMessage, returnErrors } from "./messages";
import { tokenConfig } from "./auth";

// GET LEGITIMATE DOMAINS
export const getLegitimateDomains = (page = 1, pageSize = 100) => (dispatch, getState) => {
    const isAuthenticated = getState().auth.isAuthenticated;
    
    const endpoint = `/api/common/legitimate_domains/?page=${page}&page_size=${pageSize}`;
    
    const config = isAuthenticated ? tokenConfig(getState) : {
        headers: {
            'Content-Type': 'application/json'
        }
    };
    
    return axios.get(endpoint, config)
        .then(res => {
            dispatch({
                type: GET_LEGITIMATE_DOMAINS,
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
            if (err.response) {
                dispatch(returnErrors(err.response.data, err.response.status));
            }
            dispatch({
                type: GET_LEGITIMATE_DOMAINS,
                payload: {
                    results: [],
                    count: 0,
                    next: null,
                    previous: null
                }
            });
            throw err;
        });
};

// ADD LEGITIMATE DOMAIN
export const addLegitimateDomain = domain => (dispatch, getState) => {
    axios.post('/api/common/legitimate_domains/', domain, tokenConfig(getState))
        .then(res => {
            dispatch(createMessage({ add: `${domain.domain_name} Added` }));
            dispatch({
                type: ADD_LEGITIMATE_DOMAIN,
                payload: res.data
            });
            
            dispatch(getLegitimateDomains());
        })
        .catch(err =>
            dispatch(returnErrors(err.response.data, err.response.status))
        );
};

// PATCH LEGITIMATE DOMAIN
export const patchLegitimateDomain = (id, domain) => (dispatch, getState) => {
    axios.patch(`/api/common/legitimate_domains/${id}/`, domain, tokenConfig(getState))
        .then(res => {
            dispatch(createMessage({ add: `${domain.domain_name} Updated` }));
            dispatch({
                type: PATCH_LEGITIMATE_DOMAIN,
                payload: res.data
            });
            
            dispatch(getLegitimateDomains());
        })
        .catch(err =>
            dispatch(returnErrors(err.response.data, err.response.status))
        );
};

// DELETE LEGITIMATE DOMAIN
export const deleteLegitimateDomain = (id, domain_name) => (dispatch, getState) => {
    axios.delete(`/api/common/legitimate_domains/${id}/`, tokenConfig(getState))
        .then(res => {
            dispatch(createMessage({ delete: `${domain_name} Deleted` }));
            dispatch({
                type: DELETE_LEGITIMATE_DOMAIN,
                payload: id
            });
        })
        .catch(err =>
            dispatch(returnErrors(err.response.data, err.response.status))
        );
};

// EXPORT TO MISP
export const exportToMISP = (payload) => (dispatch, getState) => {
    axios
        .post('/api/common/legitimate_domains/misp/', payload, tokenConfig(getState))
        .then(res => {
            const message = res.data.message || "Legitimate Domain exported to MISP";
            
            dispatch(createMessage({ add: message }));
            
            if (res.data.misp_event_uuid) {
                dispatch({
                    type: 'EXPORT_LEGITIMATE_DOMAIN_TO_MISP',
                    payload: {
                        id: payload.id,
                        misp_event_uuid: res.data.misp_event_uuid,
                        message: message
                    }
                });
            }
            
            dispatch(getLegitimateDomains());
        })
        .catch(err => {
            const errorMsg = err.response?.data?.message || 'Failed to export to MISP';
            dispatch(returnErrors(err.response.data, err.response.status));
            dispatch(createMessage({ error: errorMsg }));
        })
        .finally(() => {
            dispatch({ 
                type: 'RESET_EXPORT_LOADING', 
                payload: payload.id 
            });
        });
};