import axios from "axios";
import { PROFILE_LOADED, PROFILE_UPDATED, PROFILE_LOADING, PROFILE_ERROR } from "./types";
import { tokenConfig } from "./auth";

// LOAD USER PROFILE
export const loadProfile = () => (dispatch, getState) => {
    dispatch({ type: PROFILE_LOADING });
    axios
        .get("/api/auth/profile", tokenConfig(getState))
        .then(res => {
            dispatch({ type: PROFILE_LOADED, payload: res.data });
        })
        .catch(() => {
            dispatch({ type: PROFILE_ERROR });
        });
};

// UPDATE USER PROFILE
export const updateProfile = (data) => (dispatch, getState) => {
    axios
        .patch("/api/auth/profile", data, tokenConfig(getState))
        .then(res => {
            dispatch({ type: PROFILE_UPDATED, payload: res.data });
        })
        .catch(() => {
            dispatch({ type: PROFILE_ERROR });
        });
};
