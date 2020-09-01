import {createStore, applyMiddleware} from "redux";
import {composeWithDevTools} from "redux-devtools-extension";
import thunk from "redux-thunk";
import rootReducer from './reducers';

const initalState = {};

const middleware = [thunk];

const store = createStore(
    rootReducer,
    initalState,
    composeWithDevTools(applyMiddleware(...middleware))
);

export default store;