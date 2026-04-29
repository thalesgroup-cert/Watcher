import axios from 'axios';
import { WORLDMAP_GET_SOURCES, WORLDMAP_PATCH_SOURCE } from './types';
import { tokenConfig } from './auth';
import { returnErrors } from './messages';

export const getSources = () => (dispatch, getState) => {
    axios
        .get('/api/threats_watcher/source/', tokenConfig(getState))
        .then(res => dispatch({ type: WORLDMAP_GET_SOURCES, payload: res.data }))
        .catch(err =>
            dispatch(returnErrors(err.response?.data, err.response?.status))
        );
};

export const patchSource = (id, data) => (dispatch, getState) => {
    axios
        .patch(`/api/threats_watcher/source/${id}/`, data, tokenConfig(getState))
        .then(res => dispatch({ type: WORLDMAP_PATCH_SOURCE, payload: res.data }))
        .catch(err =>
            dispatch(returnErrors(err.response?.data, err.response?.status))
        );
};
