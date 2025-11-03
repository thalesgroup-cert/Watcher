import React, { Fragment } from 'react';
import { Link } from 'react-router-dom';

const NotFound = () => {
    return (
        <Fragment>
            <div className="container-fluid mt-5">
                <div className="row justify-content-center">
                    <div className="col-md-8 col-lg-6">
                        <div className="card bg-secondary border-0 shadow-lg" style={{ borderRadius: '1em' }}>
                            <div className="card-body text-center py-5">
                                <div className="mb-4">
                                    <span 
                                        className="material-icons text-primary" 
                                        style={{ 
                                            fontSize: '8em',
                                            opacity: 0.8
                                        }}
                                    >
                                        error_outline
                                    </span>
                                </div>
                                
                                <h1 className="display-1 fw-bold text-white mb-3">404</h1>
                                
                                <h3 className="text-white mb-4">Page Not Found</h3>
                                
                                <p className="text-muted mb-4" style={{ fontSize: '1.1em' }}>
                                    The page you are looking for doesn't exist or has been moved.
                                </p>
                                
                                <div className="d-flex justify-content-center gap-3 flex-wrap">
                                    <Link 
                                        to="/" 
                                        className="btn btn-primary btn-lg d-flex align-items-center"
                                        style={{ 
                                            borderRadius: '0.5em',
                                            padding: '0.75em 1.5em'
                                        }}
                                    >
                                        <span className="material-icons me-2" style={{ marginRight: '8px' }}>home</span>
                                        Go to Dashboard
                                    </Link>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </Fragment>
    );
};

export default NotFound;