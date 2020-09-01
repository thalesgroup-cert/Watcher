import React, {Component, Fragment} from 'react';
import SuspiciousSites from "./SuspiciousSites";
import Alerts from "./Alerts";
import ArchivedAlerts from "./ArchivedAlerts";

export default class Dashboard extends Component {
    render() {
        return (
            <Fragment>
                <div className="container-fluid mt-4">
                    <div className="row">
                        <div className="col-lg-12 ml-auto">
                            <Alerts/>
                        </div>
                        <div className="col-lg-12 mt-4 l-auto">
                            <SuspiciousSites/>
                        </div>
                    </div>
                    <div className="row">
                        <div className="col-lg-12 mt-4">
                            <ArchivedAlerts/>
                        </div>
                    </div>
                </div>
            </Fragment>
        )
    }
}