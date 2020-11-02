import axios from 'axios';

import {GET_LEADS, DELETE_LEAD, ADD_BANNED_WORD} from "./types";
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