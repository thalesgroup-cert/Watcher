import React, {Component, Fragment} from 'react';
import {connect} from 'react-redux';
import PropTypes from 'prop-types';
import {getAlerts, updateAlertStatus} from "../../actions/DataLeak";
import {Button, Modal, InputGroup, FormControl} from 'react-bootstrap';
import TableManager from '../common/TableManager';

export class ArchivedAlerts extends Component {
    constructor(props) {
        super(props);
        this.state = {
            show: false,
            showContentModal: false,
            id: 0,
            keyword: "",
            content: "",
            isLoading: true
        };
    }

    static propTypes = {
        alerts: PropTypes.array.isRequired,
        getAlerts: PropTypes.func.isRequired,
        updateAlertStatus: PropTypes.func.isRequired,
        auth: PropTypes.object.isRequired,
        globalFilters: PropTypes.object,
        filteredData: PropTypes.array
    };

    componentDidMount() {
        this.props.getAlerts();
    }

    componentDidUpdate(prevProps) {
        if (this.props.alerts !== prevProps.alerts && this.state.isLoading) {
            this.setState({ isLoading: false });
        }
    }

    customFilters = (filtered, filters) => {
        const alertsToFilter = this.props.filteredData || this.props.alerts;
        const { globalFilters = {} } = this.props;
        
        filtered = (alertsToFilter || []).filter(alert => alert.status === false);

        if (globalFilters.search) {
            const searchTerm = globalFilters.search.toLowerCase();
            filtered = filtered.filter(alert =>
                (alert.keyword?.name || '').toLowerCase().includes(searchTerm) ||
                (alert.content || '').toLowerCase().includes(searchTerm) ||
                (alert.url || '').toLowerCase().includes(searchTerm) ||
                (alert.id || '').toString().includes(searchTerm)
            );
        }

        if (globalFilters.keyword) {
            filtered = filtered.filter(alert => 
                alert.keyword?.name === globalFilters.keyword
            );
        }

        if (globalFilters.source) {
            filtered = filtered.filter(alert => {
                if (!alert.url) return false;
                try {
                    const domain = alert.url.split('//', 2)[1].split('/', 20)[0];
                    return domain === globalFilters.source;
                } catch {
                    return false;
                }
            });
        }

        return filtered;
    };

    displayModal = (id) => {
        this.setState({ show: true, id });
    };

    displayContentModal = (id, keyword, content) => {
        this.setState({
            showContentModal: true,
            id,
            keyword,
            content
        });
    };

    modal = () => {
        const handleClose = () => this.setState({ show: false });

        const onSubmit = e => {
            e.preventDefault();
            const status = true;
            const json_status = { status };
            this.props.updateAlertStatus(this.state.id, json_status);
            this.setState({ id: 0 });
            handleClose();
        };

        return (
            <Modal show={this.state.show} onHide={handleClose} centered>
                <Modal.Header closeButton>
                    <Modal.Title>Action Requested</Modal.Title>
                </Modal.Header>
                <Modal.Body>Are you sure you want to <u><b>enable</b></u> this alert?</Modal.Body>
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

    contentModal = () => {
        const handleClose = () => this.setState({ showContentModal: false });

        const download = (filename, text) => {
            const element = document.createElement('a');
            element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(text));
            element.setAttribute('download', filename);

            element.style.display = 'none';
            document.body.appendChild(element);

            element.click();

            document.body.removeChild(element);
        };

        const onSubmit = e => {
            e.preventDefault();
            download(`#${this.state.id}_raw.txt`, this.state.content);
        };

        return (
            <Modal size="lg" show={this.state.showContentModal} onHide={handleClose} centered>
                <Modal.Header closeButton>
                    <Modal.Title><b>#{this.state.id}</b>: <b>{this.state.keyword}</b> was found</Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    <InputGroup>
                        <InputGroup.Prepend>
                            <InputGroup.Text>Raw</InputGroup.Text>
                        </InputGroup.Prepend>
                        <FormControl as="textarea" rows={10} value={this.state.content} readOnly={true}/>
                    </InputGroup>
                </Modal.Body>
                <Modal.Footer>
                    <form onSubmit={onSubmit}>
                        <Button type="submit" variant="success" className="me-2">
                            Download
                        </Button>
                        <Button variant="secondary" onClick={handleClose}>
                            Close
                        </Button>
                    </form>
                </Modal.Footer>
            </Modal>
        );
    };

    getTitleAtUrl = (url) => {
        const lastChar = url.substr(url.length - 1);
        if (lastChar === '/') {
            const urlTab = url.split('/', 20);
            return urlTab[urlTab.length - 2];
        } else {
            return url.split('/', 20).pop();
        }
    };

    renderLoadingState = () => (
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

    render() {
        const { globalFilters, filteredData } = this.props;
        const dataToUse = filteredData || this.props.alerts;

        return (
            <Fragment>
                <div className="row">
                    <div className="col-lg-12">
                        <div className="d-flex justify-content-between align-items-center" style={{marginBottom: 12}}>
                            <h4>Archived Alerts</h4>
                        </div>
                    </div>
                </div>

                <TableManager
                    data={dataToUse}
                    filterConfig={[]}
                    customFilters={this.customFilters}
                    searchFields={['keyword.name', 'content', 'url', 'id']}
                    dateFields={['created_at']}
                    defaultSort="created_at"
                    globalFilters={globalFilters}
                    moduleKey="dataLeak_archived"
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
                                                    <th style={{ cursor: 'pointer' }} onClick={() => handleSort('keyword.name')}>
                                                        Keyword{renderSortIcons('keyword.name')}
                                                    </th>
                                                    <th>From</th>
                                                    <th>Info</th>
                                                    <th>Source</th>
                                                    <th style={{ cursor: 'pointer' }} onClick={() => handleSort('created_at')}>
                                                        Created At{renderSortIcons('created_at')}
                                                    </th>
                                                    <th/>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {this.state.isLoading ? (
                                                    this.renderLoadingState()
                                                ) : paginatedData.length === 0 ? (
                                                    <tr>
                                                        <td colSpan="7" className="text-center text-muted py-4">
                                                            No results found
                                                        </td>
                                                    </tr>
                                                ) : (
                                                    paginatedData.map(alert => {
                                                        const domainName = alert.url.split('//', 2)[1].split('/', 20)[0];
                                                        let pastContentButton;
                                                        if (domainName === "pastebin.com") {
                                                            pastContentButton = (
                                                                <button 
                                                                    onClick={() => this.displayContentModal(alert.id, alert.keyword.name, alert.content)}
                                                                    className="btn btn-info btn-sm ms-2"
                                                                >
                                                                    Content
                                                                </button>
                                                            );
                                                        }
                                                        
                                                        return (
                                                            <tr key={alert.id}>
                                                                <td><h5>#{alert.id}</h5></td>
                                                                <td>{alert.keyword.name}</td>
                                                                <td>{domainName}</td>
                                                                <td><h5>{this.getTitleAtUrl(alert.url)}</h5></td>
                                                                <td style={{whiteSpace: 'nowrap'}}>
                                                                    <button 
                                                                        onClick={() => window.open(alert.url, '_blank', 'noreferrer')} 
                                                                        rel="noreferrer"
                                                                        className="btn btn-primary btn-sm"
                                                                    >
                                                                        Link
                                                                    </button>
                                                                    {pastContentButton}
                                                                </td>
                                                                <td>{(new Date(alert.created_at)).toLocaleString()}</td>
                                                                <td>
                                                                    <button 
                                                                        onClick={() => this.displayModal(alert.id)}
                                                                        className="btn btn-outline-primary btn-sm"
                                                                    >
                                                                        Enable
                                                                    </button>
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
                {this.contentModal()}
            </Fragment>
        );
    }
}

const mapStateToProps = state => ({
    alerts: state.DataLeak.alerts,
    auth: state.auth
});

export default connect(mapStateToProps, { getAlerts, updateAlertStatus })(ArchivedAlerts);