import React, {Component, Fragment} from 'react';
import Toast from 'react-bootstrap/Toast';
import TableManager from '../common/TableManager';

const FILTER_CONFIG = [];

export class PostUrls extends Component {
    constructor(props) {
        super(props);
        this.state = {
            viewedUrls: localStorage.getItem("viewedUrls") ? JSON.parse(localStorage.getItem("viewedUrls")) : [],
            show: false
        }
    }

    // Check if the clicked url is in the local storage and if it is change the link url
    checkUrlState = (url) => {
        if (this.state.viewedUrls.find(element => element === url)) {
            return "text-warning"
        }
    };

    // Check if the clicked url is in the local storage and if it is change the link url
    setUrlStateLocalStorage = (url) => {
        this.setState(state => {
            const list = [...state.viewedUrls, url];
            // Store the new list into the localstorage
            localStorage.setItem("viewedUrls", JSON.stringify(list));
            //Set the new state for the list
            return {
                viewedUrls: list
            };
        });
    };

    getTitleAtUrl = (url) => {
        let lastChar = url.substr(url.length - 1);
        let domainName = url.split('//', 2)[1]?.split('/', 20)[0];
        if (lastChar === '/') {
            let urlTab = url.split('/', 20);
            return urlTab[urlTab.length - 2];
        } else {
            if (domainName === "twitter.com") {
                return '@' + url.split('/', 6)[3];
            }
            return url.split('/', 20).pop();
        }
    };

    parsePostUrls = () => {
        return this.props.postUrls.map((url_date, index) => {
            let url = url_date.split(',', 2)[0];
            let date = new Date(url_date.split(',', 2)[1]);
            
            const urlParts = url.split('//', 2);
            if (!urlParts[1]) {
                console.warn('Invalid URL format:', url);
                return null;
            }
            
            let domainName = urlParts[1].split('/', 20)[0];
            
            return {
                id: index,
                url: url,
                domainName: domainName,
                title: this.getTitleAtUrl(url),
                created_at: date.toISOString()
            };
        }).filter(item => item !== null);
    };

    render() {
        let title;
        let clearButton;
        
        if (this.props.word) {
            title = <h4>Article(s) related to <b>{this.props.word}</b></h4>;
            clearButton = (
                <button 
                    onClick={() => {
                        // Clear local storage
                        localStorage.clear();
                        // Clear state
                        this.setState({
                            viewedUrls: [],
                            show: true
                        })
                    }} 
                    className="btn btn-outline-warning btn-sm"
                >
                    Clear visited article(s)
                </button>
            );
        }

        const parsedData = this.parsePostUrls();

        return (
            <Fragment>
                <div className="d-flex justify-content-between align-items-center mb-3">
                    {title}
                </div>

                {this.props.word && (
                    <TableManager
                        data={parsedData}
                        filterConfig={FILTER_CONFIG}
                        searchFields={[]}
                        dateFields={['created_at']}
                        defaultSort="created_at"
                        moduleKey="threatsWatcher_posturls"
                    >
                        {({
                            paginatedData,
                            handleSort,
                            renderSortIcons,
                            renderPagination,
                            renderItemsInfo,
                            getTableContainerStyle
                        }) => (
                            <Fragment>
                                {renderItemsInfo()}

                                <div className="row">
                                    <div className="col-lg-12">
                                        <div style={{ ...getTableContainerStyle(), overflowX: 'auto' }}>
                                            <table className="table table-striped table-hover">
                                                <thead>
                                                    <tr>
                                                        <th 
                                                            className="user-select-none" 
                                                            role="button" 
                                                            onClick={() => handleSort('domainName')}
                                                        >
                                                            Domain Name
                                                            {renderSortIcons('domainName')}
                                                        </th>
                                                        <th 
                                                            className="user-select-none" 
                                                            role="button" 
                                                            onClick={() => handleSort('title')}
                                                        >
                                                            Data
                                                            {renderSortIcons('title')}
                                                        </th>
                                                        <th 
                                                            className="text-end user-select-none" 
                                                            role="button" 
                                                            onClick={() => handleSort('created_at')}
                                                        >
                                                            Found
                                                            {renderSortIcons('created_at')}
                                                        </th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {paginatedData.length === 0 ? (
                                                        <tr>
                                                            <td colSpan="3" className="text-center text-muted py-4">
                                                                No articles found
                                                            </td>
                                                        </tr>
                                                    ) : (
                                                        paginatedData.map((item) => (
                                                            <tr 
                                                                key={item.id} 
                                                                onClick={() => {
                                                                    this.setUrlStateLocalStorage(item.url);
                                                                    window.open(item.url, '_blank', 'noreferrer');
                                                                }}
                                                                style={{ cursor: 'pointer' }}
                                                            >
                                                                <td className={this.checkUrlState(item.url)}>{item.domainName}</td>
                                                                <td className={this.checkUrlState(item.url)}>{item.title}</td>
                                                                <td className={"text-end " + this.checkUrlState(item.url)}>
                                                                    <DateWithTooltip 
                                                                        date={item.created_at} 
                                                                        includeTime={true}
                                                                        type="created"
                                                                    />
                                                                </td>
                                                            </tr>
                                                        ))
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
                )}

                {clearButton && (
                    <div className="row mt-3">
                        <div className="col-lg-12">
                            {clearButton}
                        </div>
                    </div>
                )}

                <Toast 
                    onClose={() => this.setState({show: false})} 
                    show={this.state.show} 
                    delay={3000}
                    autohide 
                    className="alert-success" 
                    style={{
                        position: 'fixed',
                        bottom: 20,
                        right: 20,
                        zIndex: 9999,
                        minWidth: '300px',
                        display: this.state.show ? undefined : 'none'
                    }}
                >
                    <Toast.Header className="alert-success">
                        <strong className="me-auto text-white">Success</strong>
                    </Toast.Header>
                    <Toast.Body className="text-white">Visited Article(s) were Cleared!</Toast.Body>
                </Toast>
            </Fragment>
        )
    }
}

export default (PostUrls);