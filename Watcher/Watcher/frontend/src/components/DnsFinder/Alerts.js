import React, {Component, Fragment} from 'react';
import {connect} from 'react-redux';
import PropTypes from 'prop-types';
import {getAlerts, updateAlertStatus, exportToMISP} from "../../actions/DnsFinder";
import {addSite, getSites} from "../../actions/SiteMonitoring";
import { exportToLegitimateDomains } from '../../actions/Common';
import Modal from "react-bootstrap/Modal";
import Button from "react-bootstrap/Button";
import Container from "react-bootstrap/Container";
import Row from "react-bootstrap/Row";
import Col from "react-bootstrap/Col";
import Form from "react-bootstrap/Form";
import DayPickerInput from 'react-day-picker/DayPickerInput';
import {formatDate, parseDate} from 'react-day-picker/moment';
import TableManager from '../common/TableManager';
import ExportModal from '../common/ExportModal';

export class Alerts extends Component {

    constructor(props) {
        super(props);
        this.state = {
            show: false,
            showAddModal: false,
            showExportModal: false,
            exportDomain: null,
            exportSourceData: null,
            id: 0,
            exportLoading: false,
            domainName: "",
            isLoading: true,
        };
        this.inputTicketRef = React.createRef();
        this.ipMonitoringRef = React.createRef();
        this.webContentMonitoringRef = React.createRef();
        this.emailMonitoringRef = React.createRef();
    }

    static propTypes = {
        sites: PropTypes.array.isRequired,
        addSite: PropTypes.func.isRequired,
        getSites: PropTypes.func.isRequired,
        alerts: PropTypes.array.isRequired,
        getAlerts: PropTypes.func.isRequired,
        updateAlertStatus: PropTypes.func.isRequired,
        exportToMISP: PropTypes.func.isRequired,
        exportToLegitimateDomains: PropTypes.func.isRequired,
        auth: PropTypes.object.isRequired,
        error: PropTypes.object.isRequired,
        globalFilters: PropTypes.object,
        filteredData: PropTypes.array
    };

    componentDidMount() {
        this.props.getAlerts();
        this.props.getSites();
    }

    componentDidUpdate(prevProps) {
        if (this.props.alerts !== prevProps.alerts && this.state.isLoading) {
            this.setState({ isLoading: false });
        }

        if (this.props.sites !== prevProps.sites) {
            this.setState({
                exportLoading: false
            });
        }
        if (this.props.error !== prevProps.error) {
            if (this.props.error.status !== null) {
                this.setState({
                    exportLoading: false,
                    isLoading: false
                });
            }
        }
    }

    displayModal = (id) => {
        this.setState({
            show: true,
            id: id,
        });
    };

    modal = () => {
        let handleClose = () => {
            this.setState({
                show: false
            });
        };

        let onSubmit = e => {
            e.preventDefault();
            const status = false;
            const json_status = {status};
            this.props.updateAlertStatus(this.state.id, json_status);
            this.setState({
                id: 0
            });
            handleClose();
        };

        return (
            <Modal show={this.state.show} onHide={handleClose} centered>
                <Modal.Header closeButton>
                    <Modal.Title>Action Requested</Modal.Title>
                </Modal.Header>
                <Modal.Body>Are you sure you want to <b><u>disable</u></b> this alert?</Modal.Body>
                <Modal.Footer>
                    <form onSubmit={onSubmit}>
                        <Button variant="secondary" className="me-2" onClick={handleClose}>
                            Close
                        </Button>
                        <Button type="submit" variant="warning">
                            Yes, I'm sure
                        </Button>
                    </form>
                </Modal.Footer>
            </Modal>
        );
    };

    displayAddModal = (id, domainName) => {
        this.setState({
            showAddModal: true,
            id: id,
            domainName: domainName
        });
    };

    addModal = () => {
        let handleClose = () => {
            this.setState({
                showAddModal: false
            });
        };

        let onSubmit = e => {
            e.preventDefault();
            const domain_name = this.state.domainName;
            const ticket_id = this.inputTicketRef.current.value;
            const expiry = this.state.day;
            const ip_monitoring = this.ipMonitoringRef.current.checked;
            const content_monitoring = this.webContentMonitoringRef.current.checked;
            const mail_monitoring = this.emailMonitoringRef.current.checked;
            const site = expiry ? {domain_name, ticket_id, expiry, ip_monitoring, content_monitoring, mail_monitoring} : {domain_name, ticket_id, ip_monitoring, content_monitoring, mail_monitoring};

            this.props.addSite(site);
            this.setState({
                exportLoading: this.state.id
            });
            handleClose();
        };

        return (
            <Modal show={this.state.showAddModal} onHide={handleClose} centered>
                <Modal.Header closeButton>
                    <Modal.Title>Action Requested</Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    <Container>
                        <Row className="show-grid">
                            <Col md={{span: 12}}>
                                <Form onSubmit={onSubmit}>
                                    <Form.Group as={Row}>
                                        <Form.Label column sm="4">Domain name</Form.Label>
                                        <Col sm="8">
                                            {this.state.domainName}
                                        </Col>
                                        <Form.Label column sm="4">Ticket ID</Form.Label>
                                        <Col sm="8">
                                            <Form.Control ref={this.inputTicketRef} size="md" type="text"
                                                          pattern="^[a-zA-Z0-9]+(-[a-zA-Z0-9]+)*(\.[a-zA-Z0-9]+(-[a-zA-Z0-9]+)*)*$"
                                                          placeholder="230509-200a2"/>
                                        </Col>
                                        <Form.Label column sm="4">Expiry Date</Form.Label>
                                        <Col sm="8">
                                            <DayPickerInput
                                                style={{color: "black"}}
                                                formatDate={formatDate}
                                                parseDate={parseDate}
                                                placeholder={`${formatDate(new Date())}`}
                                                dayPickerProps={{
                                                    disabledDays: {before: new Date()},
                                                    fromMonth: new Date(),
                                                    firstDayOfWeek: 1,
                                                    fixedWeeks: true,
                                                    showWeekNumbers: true
                                                }}
                                                onDayChange={day => this.setState({day})}/>
                                        </Col>
                                        <Form.Label column sm="6">Ip Monitoring</Form.Label>
                                        <Col sm="6">
                                            <Form.Check
                                                ref={this.ipMonitoringRef}
                                                defaultChecked={true}
                                                className="mt-2"
                                                type="switch"
                                                id="custom-switch"
                                                label=""
                                            />
                                        </Col>
                                        <Form.Label column sm="6">Web Content Monitoring</Form.Label>
                                        <Col sm="6">
                                            <Form.Check
                                                ref={this.webContentMonitoringRef}
                                                defaultChecked={true}
                                                className="mt-2"
                                                type="switch"
                                                id="custom-switch-2"
                                                label=""
                                            />
                                        </Col>
                                        <Form.Label column sm="6">Email Monitoring</Form.Label>
                                        <Col sm="6">
                                            <Form.Check
                                                ref={this.emailMonitoringRef}
                                                defaultChecked={true}
                                                className="mt-2"
                                                type="switch"
                                                id="custom-switch-3"
                                                label=""
                                            />
                                        </Col>
                                    </Form.Group>
                                    <Col md={{span: 5, offset: 8}}>
                                        <Button variant="secondary" className="me-2" onClick={handleClose}>
                                            Close
                                        </Button>
                                        <Button type="submit" variant="success">
                                            Add
                                        </Button>
                                    </Col>
                                </Form>
                            </Col>
                        </Row>
                    </Container>
                </Modal.Body>
            </Modal>
        );
    };

    isDisabled = (domainName, id) => {
        let back = false;

        if (this.state.exportLoading === id) {
            back = true;
        }

        this.props.sites.map(site => {
            if (site.domain_name === domainName) {
                back = true;
            }
        });
        return back;
    };

    extractUUID = (raw) => {
        if (!raw) return [];
        if (Array.isArray(raw)) return raw.filter(uuid => uuid && uuid.trim() !== '');
        return raw.replace(/[\[\]'"\s]/g, '').split(',').filter(Boolean);
    };

    displayExportModal = (alert) => {
        const dnsTwisted = alert.dns_twisted;
        
        const sourceData = {
            dns_monitored: dnsTwisted.dns_monitored?.domain_name || null,
            keyword_monitored: dnsTwisted.keyword_monitored?.name || null,
            fuzzer: dnsTwisted.fuzzer || null
        };
        
        const domainData = {
            id: dnsTwisted.id,
            domain_name: dnsTwisted.domain_name,
            misp_event_uuid: dnsTwisted.misp_event_uuid,
        };
        
        this.setState({
            showExportModal: true,
            exportDomain: domainData,
            exportSourceData: sourceData,
            currentAlertId: alert.id 
        });
    };

    closeExportModal = () => {
        this.setState({
            showExportModal: false,
            exportDomain: null,
            exportSourceData: null
        });
        
        this.props.getAlerts();
    };

    handleMispExport = async ({ id, event_uuid }) => {
        const alert = this.props.alerts.find(a => a.dns_twisted.id === id);
        if (!alert) return;
        
        await this.props.exportToMISP(id, event_uuid, alert.dns_twisted.domain_name);
        
        setTimeout(() => {
            this.props.getAlerts();
        }, 1000);
    };

    handleLegitimateDomainExport = async ({ domain_name, comment, expiry }) => {
        try {
            const alert = this.props.alerts.find(a => a.dns_twisted.domain_name === domain_name);
            if (!alert) {
                throw new Error('Alert not found');
            }

            const domainData = { domain_name };
            if (expiry) domainData.expiry = expiry;
            await this.props.exportToLegitimateDomains(domainData, comment);
            
            return { success: true };
            
        } catch (err) {
            console.error('Export to Legitimate Domains failed:', err);
            throw err;
        }
    };

    handleDeleteRequest = async (alertId, domainName) => {
        try {
            const json_status = { status: false };
            await this.props.updateAlertStatus(alertId, json_status);
            
            await new Promise(resolve => setTimeout(resolve, 300));
            
            await this.props.getAlerts();
        } catch (err) {
            console.error('Failed to archive alert:', err);
        }
    };

    getMispStatusBadge = (dns) => {
        const uuid = this.extractUUID(dns.misp_event_uuid);
        return uuid.length ? (
            <span className="badge bg-info me-2" title="MISP Events">
                <i className="material-icons align-middle me-1" style={{ fontSize: 14 }}>
                    cloud_done
                </i>
                {uuid.length}
            </span>
        ) : null;
    };

    exportButtonMISPTh = alert => {
        const dnsTwisted = alert.dns_twisted;
        
        const hasMispEvent = dnsTwisted.misp_event_uuid && 
                            (Array.isArray(dnsTwisted.misp_event_uuid) ? 
                                dnsTwisted.misp_event_uuid.length > 0 : 
                                this.extractUUID(dnsTwisted.misp_event_uuid).length > 0);
        
        return (
            <button 
                className={`btn btn-sm me-2 ${
                    hasMispEvent ? 'btn-outline-success' : 'btn-outline-primary'
                }`}
                data-toggle="tooltip"
                data-placement="top" 
                title={hasMispEvent ? "Update MISP or Export to Legitimate Domains" : "Export to MISP or Legitimate Domains"}
                onClick={() => this.displayExportModal(alert)}
            >
                <i className="material-icons"
                   style={{fontSize: 17, lineHeight: 1.8, margin: -2.5}}>
                  {hasMispEvent ? 'cloud_done' : 'cloud_upload'}
                </i>
            </button>
        );
    };

    render() {
        const { globalFilters, filteredData } = this.props;
        const dataToUse = filteredData || this.props.alerts;

        const renderLoadingState = () => (
            <tr>
                <td colSpan="7" className="text-center py-5">
                    <div className="d-flex flex-column align-items-center">
                        <div className="spinner-border text-primary mb-3" role="status">
                            <span className="visually-hidden">Loading...</span>
                        </div>
                        <p className="text-muted mb-0">Loading data...</p>
                    </div>
                </td>
            </tr>
        );

        const customFilters = (filtered, filters) => {
            const alertsToFilter = this.props.filteredData || this.props.alerts;
            const { globalFilters = {} } = this.props;
            
            filtered = (alertsToFilter || []).filter(alert => alert.status === true);

            if (globalFilters.search) {
                const searchTerm = globalFilters.search.toLowerCase();
                filtered = filtered.filter(alert =>
                    (alert.dns_twisted?.domain_name || '').toLowerCase().includes(searchTerm) ||
                    (alert.dns_twisted?.keyword_monitored?.name || '').toLowerCase().includes(searchTerm) ||
                    (alert.dns_twisted?.dns_monitored?.domain_name || '').toLowerCase().includes(searchTerm) ||
                    (alert.dns_twisted?.fuzzer || '').toLowerCase().includes(searchTerm) ||
                    (alert.id || '').toString().includes(searchTerm)
                );
            }

            if (globalFilters.domain) {
                filtered = filtered.filter(alert => 
                    alert.dns_twisted?.dns_monitored?.domain_name === globalFilters.domain
                );
            }

            if (globalFilters.keyword) {
                filtered = filtered.filter(alert => 
                    alert.dns_twisted?.keyword_monitored?.name === globalFilters.keyword
                );
            }

            if (globalFilters.fuzzer) {
                filtered = filtered.filter(alert => 
                    alert.dns_twisted?.fuzzer === globalFilters.fuzzer
                );
            }

            return filtered;
        };

        const exportButton = alert => (
            this.isDisabled(alert.dns_twisted.domain_name, alert.id) ?
                (<button className="btn btn-success btn-sm"
                         data-toggle="tooltip"
                         data-placement="top" title={alert.dns_twisted.domain_name + " is monitored"}
                         onClick={() => {
                             this.displayAddModal(alert.id, alert.dns_twisted.domain_name)
                         }}
                         disabled={true}>

                    {this.state.exportLoading === alert.id && (
                        <div className="loader">Loading...</div>
                    )}
                    {this.state.exportLoading !== alert.id && <i className="material-icons"
                                                                 style={{
                                                                     fontSize: 18.5,
                                                                     lineHeight: 1.85,
                                                                     margin: -2.5
                                                                 }}>playlist_add_check</i>}
                </button>) :
                (<button className="btn btn-secondary btn-sm"
                         data-toggle="tooltip"
                         data-placement="top" title={"Monitor " + alert.dns_twisted.domain_name}
                         onClick={() => {
                             this.displayAddModal(alert.id, alert.dns_twisted.domain_name)
                         }}
                         disabled={false}>

                    {this.state.exportLoading === alert.id && (
                        <div className="loader">Loading...</div>
                    )}
                    {this.state.exportLoading !== alert.id && <i className="material-icons"
                                                                 style={{
                                                                     fontSize: 18.5,
                                                                     lineHeight: 1.85,
                                                                     margin: -2.5
                                                                 }}>playlist_add</i>}
                </button>)
        );

        return (
            <Fragment>
                <div className="row">
                    <div className="col-lg-12">
                        <div className="float-start" style={{marginBottom: 12}}>
                            <h4>Alerts</h4>
                        </div>
                    </div>
                </div>

                <TableManager
                    data={dataToUse}
                    filterConfig={[]}
                    customFilters={customFilters}
                    searchFields={['dns_twisted.domain_name', 'dns_twisted.keyword_monitored.name', 'dns_twisted.dns_monitored.domain_name', 'dns_twisted.fuzzer', 'id']}
                    dateFields={['created_at']}
                    defaultSort="created_at"
                    globalFilters={globalFilters}
                    moduleKey="dnsFinder_alerts"
                >
                    {({
                        paginatedData,
                        renderItemsInfo,
                        renderPagination,
                        handleSort,
                        renderSortIcons,
                        getTableContainerStyle
                    }) => (
                        <Fragment>
                            {renderItemsInfo()}
                            
                            <div className="row">
                                <div className="col-lg-12">
                                    <div style={{ ...getTableContainerStyle(),  overflowX: 'auto' }}>
                                        <table className="table table-striped table-hover">
                                            <thead>
                                            <tr>
                                                <th style={{ cursor: 'pointer' }} onClick={() => handleSort('id')}>
                                                    ID{renderSortIcons('id')}
                                                </th>
                                                <th style={{ cursor: 'pointer' }} onClick={() => handleSort('dns_twisted.domain_name')}>
                                                    Twisted DNS{renderSortIcons('dns_twisted.domain_name')}
                                                </th>
                                                <th style={{ cursor: 'pointer' }} onClick={() => handleSort('dns_twisted.keyword_monitored.name')}>
                                                    Corporate Keyword{renderSortIcons('dns_twisted.keyword_monitored.name')}
                                                </th>
                                                <th style={{ cursor: 'pointer' }} onClick={() => handleSort('dns_twisted.dns_monitored.domain_name')}>
                                                    Corporate DNS{renderSortIcons('dns_twisted.dns_monitored.domain_name')}
                                                </th>
                                                <th style={{ cursor: 'pointer' }} onClick={() => handleSort('dns_twisted.fuzzer')}>
                                                    Fuzzer{renderSortIcons('dns_twisted.fuzzer')}
                                                </th>
                                                <th style={{ cursor: 'pointer' }} onClick={() => handleSort('created_at')}>
                                                    Created At{renderSortIcons('created_at')}
                                                </th>
                                                <th/>
                                            </tr>
                                            </thead>
                                            <tbody>
                                            {this.state.isLoading ? (
                                                renderLoadingState()
                                            ) : paginatedData.length === 0 ? (
                                                <tr>
                                                    <td colSpan="7" className="text-center text-muted py-4">
                                                        No results found
                                                    </td>
                                                </tr>
                                            ) : (
                                                paginatedData.map(alert => {
                                                    return (
                                                        <tr key={alert.id}>
                                                            <td><h5>#{alert.id}</h5></td>
                                                            <td>
                                                                <div className="d-flex align-items-center">
                                                                    {this.getMispStatusBadge(alert.dns_twisted)}
                                                                    <span>{alert.dns_twisted.domain_name}</span>
                                                                </div>
                                                            </td>
                                                            <td>
                                                                {alert.dns_twisted.keyword_monitored ? 
                                                                    (typeof alert.dns_twisted.keyword_monitored === 'object' ? 
                                                                        alert.dns_twisted.keyword_monitored.name : 
                                                                        alert.dns_twisted.keyword_monitored) : 
                                                                    "-"}
                                                            </td>
                                                            <td>
                                                                {alert.dns_twisted.dns_monitored ? 
                                                                    (typeof alert.dns_twisted.dns_monitored === 'object' ? 
                                                                        alert.dns_twisted.dns_monitored.domain_name : 
                                                                        alert.dns_twisted.dns_monitored) : 
                                                                    "-"}
                                                            </td>
                                                            <td>{alert.dns_twisted.fuzzer ? alert.dns_twisted.fuzzer : "-"}</td>
                                                            <td>{(new Date(alert.created_at)).toLocaleString()}</td>
                                                            <td className="text-end" style={{whiteSpace: 'nowrap'}}>
                                                                <button onClick={() => {
                                                                    this.displayModal(alert.id)
                                                                }}
                                                                        className="btn btn-outline-primary btn-sm me-2">Disable
                                                                </button>
                                                                {this.exportButtonMISPTh(alert)}
                                                                {exportButton(alert)}
                                                            </td>
                                                        </tr>
                                                    );
                                                })
                                            )}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                            
                            {renderPagination()}
                        </Fragment>
                    )}
                </TableManager>
                
                {this.modal()}
                {this.addModal()}
                
                <ExportModal
                    show={this.state.showExportModal}
                    domain={this.state.exportDomain}
                    sourceData={this.state.exportSourceData}
                    alertId={this.state.currentAlertId}
                    onClose={this.closeExportModal}
                    onMispExport={this.handleMispExport}
                    onLegitimateDomainExport={this.handleLegitimateDomainExport}
                    onDeleteRequest={this.handleDeleteRequest}
                    mode="dnsFinder"
                />
            </Fragment>
        )
    }
}

const mapStateToProps = state => ({
    alerts: state.DnsFinder.alerts,
    sites: state.SiteMonitoring.sites,
    auth: state.auth,
    error: state.errors
});

export default connect(mapStateToProps, {
    getAlerts, 
    updateAlertStatus, 
    addSite, 
    getSites, 
    exportToMISP,
    exportToLegitimateDomains
})(Alerts);