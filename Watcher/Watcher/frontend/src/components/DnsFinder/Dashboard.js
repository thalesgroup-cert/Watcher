import React, {Component, Fragment} from 'react';
import DnsMonitored from "./DnsMonitored";
import Alerts from "./Alerts";
import ArchivedAlerts from "./ArchivedAlerts";

export default class Dashboard extends Component {
    render() {
        return (
            <Fragment>
                <div className="container-fluid mt-4">
                    <div className="row">
                        <div className="col-lg-8 ml-auto">
                            <Alerts/>
                        </div>
                        <div className="col-lg-4 ml-auto">
                            <DnsMonitored/>
                        </div>
                    </div>
                    <div className="row">
                        <div className="col-lg-8 mt-4">
                            <ArchivedAlerts/>
                        </div>
                    </div>
                </div>
            </Fragment>
        )
    }
}