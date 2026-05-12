import axios from "axios";
import { CONFIG_LOADED } from "./types";

export const loadConfig = () => dispatch => {
    axios
        .get("/api/config/")
        .then(res => {
            dispatch({ type: CONFIG_LOADED, payload: res.data });
        })
        .catch(() => {
            dispatch({ type: CONFIG_LOADED, payload: {} });
        });
};
