import axios from 'axios';
import { GET_TIMELINE_EVENTS, CLEAR_TIMELINE_EVENTS } from './types';
import { returnErrors } from './messages';
import { tokenConfig } from './auth';

export const getTimelineEvents = (contentType, objectId) => (dispatch, getState) => {
    dispatch({ type: CLEAR_TIMELINE_EVENTS });
    axios
        .get(`/api/timeline/events/?content_type=${contentType}&object_id=${objectId}`, tokenConfig(getState))
        .then(res => {
            dispatch({
                type: GET_TIMELINE_EVENTS,
                payload: res.data.results || res.data,
            });
        })
        .catch(err => {
            if (err.response) dispatch(returnErrors(err.response.data, err.response.status));
        });
};

export const clearTimelineEvents = () => ({ type: CLEAR_TIMELINE_EVENTS });
