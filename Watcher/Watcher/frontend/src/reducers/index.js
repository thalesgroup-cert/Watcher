import {combineReducers} from "redux";
import leads from './leads';
import auth from './auth';
import messages from './messages';
import errors from "./errors";
import DataLeak from "./DataLeak";
import SiteMonitoring from "./SiteMonitoring";
import DnsFinder from "./DnsFinder";
import LegitimateDomain from "./LegitimateDomain";

export default combineReducers({
    leads,
    DataLeak,
    SiteMonitoring,
    DnsFinder,
    LegitimateDomain,
    errors,
    messages,
    auth
});

