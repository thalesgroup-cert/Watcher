import React, {Component, Fragment} from 'react';
import Toast from 'react-bootstrap/Toast';

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
        let domainName = url.split('//', 2)[1].split('/', 20)[0];
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

    displayTable = () => {
        if (this.props.word) {
            return (
                <table className="table table-striped table-hover">
                    <thead>
                        <tr>
                            <th>Domain Name</th>
                            <th>Data</th>
                            <th className="text-end">Found</th>
                        </tr>
                    </thead>
                    <tbody>
                        {this.props.postUrls.map((url_date, index) => {
                            let url = url_date.split(',', 2)[0];
                            let date = new Date(url_date.split(',', 2)[1]);
                            
                            const urlParts = url.split('//', 2);
                            if (!urlParts[1]) {
                                console.warn('Invalid URL format:', url);
                                return null;
                            }
                            
                            let domainName = urlParts[1].split('/', 20)[0];
                            if (!this.props.withoutTwitterPosts) {
                                return (
                                    <tr 
                                        key={index} 
                                        onClick={() => {
                                            this.setUrlStateLocalStorage(url);
                                            window.open(url, '_blank', 'noreferrer');
                                        }}
                                        style={{ cursor: 'pointer' }}
                                    >
                                        <td className={this.checkUrlState(url)}>{domainName}</td>
                                        <td className={this.checkUrlState(url)}>{this.getTitleAtUrl(url)}</td>
                                        <td className={"text-end " + this.checkUrlState(url)}>{date.toLocaleString()}</td>
                                    </tr>
                                )
                            }
                            return null;
                        })}
                    </tbody>
                </table>
            )
        }
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

        return (
            <Fragment>
                <div className="d-flex justify-content-between align-items-center mb-3">
                    {title}
                </div>

                <div className="row">
                    <div className="col-lg-12">
                        <div style={{ maxHeight: '400px', overflow: 'auto'}}>
                            {this.displayTable()}
                        </div>
                    </div>
                </div>

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