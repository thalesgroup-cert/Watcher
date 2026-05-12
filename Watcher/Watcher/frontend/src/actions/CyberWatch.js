import axios from 'axios';
import {
    CYBERWATCH_GET_CVES,
    CYBERWATCH_GET_RANSOMWARE_VICTIMS,
    CYBERWATCH_GET_WATCH_RULES,
    CYBERWATCH_ADD_WATCH_RULE,
    CYBERWATCH_DELETE_WATCH_RULE,
    CYBERWATCH_PATCH_WATCH_RULE,
    CYBERWATCH_GET_WATCH_RULE_HITS,
    CYBERWATCH_ARCHIVE_CVE,
    CYBERWATCH_ARCHIVE_VICTIM,
    CYBERWATCH_GET_ARCHIVED_CVES,
    CYBERWATCH_GET_ARCHIVED_VICTIMS,
    CYBERWATCH_GET_ARCHIVED_HITS,
    CYBERWATCH_UNARCHIVE_CVE,
    CYBERWATCH_UNARCHIVE_VICTIM,
    CYBERWATCH_ARCHIVE_HIT,
    CYBERWATCH_UNARCHIVE_HIT,
} from './types';
import { returnErrors, createMessage } from './messages';
import { tokenConfig } from './auth';

// GET CVE ALERTS
export const getCVEs = (params = {}) => dispatch => {
    const query = new URLSearchParams(params).toString();
    const url = `/api/cyber_watch/cves/${query ? '?' + query : ''}`;
    axios.get(url)
        .then(res => {
            dispatch({ type: CYBERWATCH_GET_CVES, payload: res.data });
        })
        .catch(err =>
            dispatch(returnErrors(err.response?.data, err.response?.status))
        );
};

// GET RANSOMWARE VICTIMS
export const getRansomwareVictims = (params = {}) => dispatch => {
    const query = new URLSearchParams(params).toString();
    const url = `/api/cyber_watch/ransomware/victims/${query ? '?' + query : ''}`;
    axios.get(url)
        .then(res => {
            dispatch({ type: CYBERWATCH_GET_RANSOMWARE_VICTIMS, payload: res.data });
        })
        .catch(err =>
            dispatch(returnErrors(err.response?.data, err.response?.status))
        );
};

// GET WATCH RULES
export const getWatchRules = () => (dispatch, getState) => {
    axios.get('/api/cyber_watch/watch-rules/', tokenConfig(getState))
        .then(res => {
            dispatch({ type: CYBERWATCH_GET_WATCH_RULES, payload: res.data });
        })
        .catch(err =>
            dispatch(returnErrors(err.response?.data, err.response?.status))
        );
};

// ADD WATCH RULE
export const addWatchRule = (rule) => (dispatch, getState) => {
    axios.post('/api/cyber_watch/watch-rules/', rule, tokenConfig(getState))
        .then(res => {
            dispatch(createMessage({ addWatchRule: 'Watch rule added' }));
            dispatch({ type: CYBERWATCH_ADD_WATCH_RULE, payload: res.data });
        })
        .catch(err =>
            dispatch(returnErrors(err.response?.data, err.response?.status))
        );
};

// DELETE WATCH RULE
export const deleteWatchRule = (id) => (dispatch, getState) => {
    axios.delete(`/api/cyber_watch/watch-rules/${id}/`, tokenConfig(getState))
        .then(() => {
            dispatch(createMessage({ deleteWatchRule: 'Watch rule deleted' }));
            dispatch({ type: CYBERWATCH_DELETE_WATCH_RULE, payload: id });
        })
        .catch(err =>
            dispatch(returnErrors(err.response?.data, err.response?.status))
        );
};

// PATCH WATCH RULE
export const patchWatchRule = (id, data) => (dispatch, getState) => {
    axios.patch(`/api/cyber_watch/watch-rules/${id}/`, data, tokenConfig(getState))
        .then(res => {
            dispatch(createMessage({ patchWatchRule: 'Watch rule updated' }));
            dispatch({ type: CYBERWATCH_PATCH_WATCH_RULE, payload: res.data });
        })
        .catch(err =>
            dispatch(returnErrors(err.response?.data, err.response?.status))
        );
};

// GET WATCH RULE HITS
export const getWatchRuleHits = (params = {}) => (dispatch, getState) => {
    const query = new URLSearchParams(params).toString();
    const url = `/api/cyber_watch/watch-rule-hits/${query ? '?' + query : ''}`;
    axios.get(url, tokenConfig(getState))
        .then(res => {
            dispatch({ type: CYBERWATCH_GET_WATCH_RULE_HITS, payload: res.data });
        })
        .catch(err =>
            dispatch(returnErrors(err.response?.data, err.response?.status))
        );
};

// ARCHIVE CVE
export const archiveCVE = (id) => (dispatch, getState) => {
    axios.patch(`/api/cyber_watch/cves/${id}/archive/`, {}, tokenConfig(getState))
        .then(res => {
            dispatch(createMessage({ archiveCVE: 'CVE archived' }));
            dispatch({ type: CYBERWATCH_ARCHIVE_CVE, payload: res.data });
        })
        .catch(err =>
            dispatch(returnErrors(err.response?.data, err.response?.status))
        );
};

// UNARCHIVE CVE
export const unarchiveCVE = (id) => (dispatch, getState) => {
    axios.patch(`/api/cyber_watch/cves/${id}/archive/`, {}, tokenConfig(getState))
        .then(res => {
            dispatch(createMessage({ unarchiveCVE: 'CVE restored' }));
            dispatch({ type: CYBERWATCH_UNARCHIVE_CVE, payload: res.data });
        })
        .catch(err =>
            dispatch(returnErrors(err.response?.data, err.response?.status))
        );
};

// GET ARCHIVED CVES
export const getArchivedCVEs = () => dispatch => {
    axios.get('/api/cyber_watch/cves/?archived=true')
        .then(res => {
            dispatch({ type: CYBERWATCH_GET_ARCHIVED_CVES, payload: res.data });
        })
        .catch(err =>
            dispatch(returnErrors(err.response?.data, err.response?.status))
        );
};

// ARCHIVE VICTIM
export const archiveVictim = (id) => (dispatch, getState) => {
    axios.patch(`/api/cyber_watch/ransomware/victims/${id}/archive/`, {}, tokenConfig(getState))
        .then(res => {
            dispatch(createMessage({ archiveVictim: 'Alert archived' }));
            dispatch({ type: CYBERWATCH_ARCHIVE_VICTIM, payload: res.data });
        })
        .catch(err =>
            dispatch(returnErrors(err.response?.data, err.response?.status))
        );
};

// UNARCHIVE VICTIM
export const unarchiveVictim = (id) => (dispatch, getState) => {
    axios.patch(`/api/cyber_watch/ransomware/victims/${id}/archive/`, {}, tokenConfig(getState))
        .then(res => {
            dispatch(createMessage({ unarchiveVictim: 'Alert restored' }));
            dispatch({ type: CYBERWATCH_UNARCHIVE_VICTIM, payload: res.data });
        })
        .catch(err =>
            dispatch(returnErrors(err.response?.data, err.response?.status))
        );
};

// ARCHIVE WATCH RULE HIT
export const archiveHit = (id) => (dispatch, getState) => {
    axios.patch(`/api/cyber_watch/watch-rule-hits/${id}/archive/`, {}, tokenConfig(getState))
        .then(res => {
            dispatch(createMessage({ archiveHit: 'Hit archived' }));
            dispatch({ type: CYBERWATCH_ARCHIVE_HIT, payload: res.data });
        })
        .catch(err =>
            dispatch(returnErrors(err.response?.data, err.response?.status))
        );
};

// UNARCHIVE WATCH RULE HIT
export const unarchiveHit = (id) => (dispatch, getState) => {
    axios.patch(`/api/cyber_watch/watch-rule-hits/${id}/archive/`, {}, tokenConfig(getState))
        .then(res => {
            dispatch(createMessage({ unarchiveHit: 'Hit restored' }));
            dispatch({ type: CYBERWATCH_UNARCHIVE_HIT, payload: res.data });
        })
        .catch(err =>
            dispatch(returnErrors(err.response?.data, err.response?.status))
        );
};

// GET ARCHIVED VICTIMS
export const getArchivedVictims = () => dispatch => {
    axios.get('/api/cyber_watch/ransomware/victims/?archived=true')
        .then(res => {
            dispatch({ type: CYBERWATCH_GET_ARCHIVED_VICTIMS, payload: res.data });
        })
        .catch(err =>
            dispatch(returnErrors(err.response?.data, err.response?.status))
        );
};

// GET ARCHIVED HITS
export const getArchivedHits = (params = {}) => dispatch => {
    const query = new URLSearchParams({ ...params, archived: 'true' }).toString();
    axios.get(`/api/cyber_watch/watch-rule-hits/?${query}`)
        .then(res => {
            dispatch({ type: CYBERWATCH_GET_ARCHIVED_HITS, payload: res.data });
        })
        .catch(err =>
            dispatch(returnErrors(err.response?.data, err.response?.status))
        );
};
