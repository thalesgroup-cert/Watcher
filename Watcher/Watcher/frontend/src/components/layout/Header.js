import React, { Component, Fragment, useRef, useEffect } from 'react';
import { Link, NavLink, withRouter } from "react-router-dom";
import { connect } from "react-redux";
import PropTypes from "prop-types";
import { logout } from "../../actions/auth";



function positionMenuUnderButton(button, menu, gap = 6) {
    const originalDisplay = menu.style.display;
    const originalVisibility = menu.style.visibility;
    menu.style.display = 'block';
    menu.style.visibility = 'hidden';

    const btnRect = button.getBoundingClientRect();
    const menuRect = menu.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    menu.style.position = 'absolute';
    menu.style.top = `${btnRect.height + gap}px`;

    const menuRight = btnRect.left + menuRect.width;
    if (menuRight > viewportWidth) {
        menu.style.left = 'auto';
        menu.style.right = '0';
    } else {
        menu.style.left = '0';
        menu.style.right = 'auto';
    }

    const spaceBelow = viewportHeight - btnRect.bottom - gap;
    if (menuRect.height > spaceBelow) {
        const maxHeight = Math.max(spaceBelow, 120);
        menu.style.maxHeight = `${maxHeight}px`;
        menu.style.overflowY = 'auto';
    } else {
        menu.style.maxHeight = 'none';
        menu.style.overflowY = 'visible';
    }

    menu.style.display = originalDisplay;
    menu.style.visibility = originalVisibility;
}

const HelpButton = () => {
    const [isOpen, setIsOpen] = React.useState(false);
    const buttonRef = useRef(null);
    const menuRef = useRef(null);

    const handleToggle = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!isOpen && buttonRef.current && menuRef.current) {
            positionMenuUnderButton(buttonRef.current, menuRef.current);
        }
        setIsOpen(!isOpen);
    };

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (buttonRef.current && !buttonRef.current.contains(event.target) &&
                menuRef.current && !menuRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        };
        if (isOpen) document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isOpen]);

    return (
        <div className="btn-group position-relative me-2">
            <button
                ref={buttonRef}
                className="btn btn-secondary dropdown-toggle ms-2"
                type="button"
                onClick={handleToggle}
                title="Help"
                aria-haspopup="true"
                aria-expanded={isOpen}
            >
                <i className="material-icons align-middle small">help_outline</i>
            </button>
            <div ref={menuRef} className={`dropdown-menu dropdown-menu-end ${isOpen ? 'show' : ''}`} style={{ minWidth: 200 }}>
                <a
                    className="dropdown-item"
                    href="https://thalesgroup-cert.github.io/Watcher/README.html#api-key-creation-management"
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => setIsOpen(false)}
                >
                    <i className="material-icons me-2 align-middle small">article</i>
                    API Docs
                </a>
                <a
                    className="dropdown-item"
                    href="https://github.com/thalesgroup-cert/Watcher"
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => setIsOpen(false)}
                >
                    <i className="material-icons me-2 align-middle small">info</i>
                    About Watcher
                </a>
            </div>
        </div>
    );
};

const UserDropdown = ({ user, logout }) => {
    const [isOpen, setIsOpen] = React.useState(false);
    const buttonRef = useRef(null);
    const menuRef = useRef(null);

    const handleToggle = (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        if (!isOpen && buttonRef.current && menuRef.current) {
            positionMenuUnderButton(buttonRef.current, menuRef.current);
        }
        setIsOpen(!isOpen);
    };

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (buttonRef.current && !buttonRef.current.contains(event.target) &&
                menuRef.current && !menuRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        };

        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isOpen]);

    return (
        <div className="btn-group position-relative me-2">
            <button 
                ref={buttonRef}
                className="btn btn-secondary dropdown-toggle ms-2" 
                type="button" 
                onClick={handleToggle}
                aria-haspopup="true" 
                aria-expanded={isOpen}
            >
                <i className="material-icons me-1 align-middle small">account_circle</i>
                <span className="align-middle">
                    {user ? `${user.first_name || user.username}` : "User"}
                </span>
            </button>
            <div ref={menuRef} className={`dropdown-menu dropdown-menu-end ${isOpen ? 'show' : ''}`}>
                <Link className="dropdown-item" to="/profile" onClick={() => setIsOpen(false)}>
                    <i className="material-icons me-2 align-middle small">person</i>
                    My Profile
                </Link>
                <div className="dropdown-divider"></div>
                <button className="dropdown-item" onClick={() => { logout(); setIsOpen(false); }}>
                    <i className="material-icons me-2 align-middle small">logout</i>
                    Logout
                </button>
            </div>
        </div>
    );
};

const PAGE_TITLES = {
    '/':                   'Watcher',
    '/legitimate_domains': 'Legitimate Domains - Watcher',
    '/cyber_watch':        'Cyber Watch - Watcher',
    '/data_leak':          'Data Leak - Watcher',
    '/website_monitoring': 'Website Monitoring - Watcher',
    '/dns_finder':         'Twisted DNS Finder - Watcher',
    '/login':              'Login - Watcher',
    '/password_change':    'Password Change - Watcher',
    '/profile':             'My Profile - Watcher',
};

export class Header extends Component {
    static propTypes = {
        auth: PropTypes.object.isRequired,
        logout: PropTypes.func.isRequired,
        location: PropTypes.object.isRequired,
        history: PropTypes.object.isRequired
    };

    updateTitle() {
        const path = this.props.location.pathname;
        document.title = PAGE_TITLES[path] || 'Watcher';
    }

    componentDidMount() {
        this.updateTitle();
    }

    componentDidUpdate(prevProps) {
        if (prevProps.location.pathname !== this.props.location.pathname) {
            this.updateTitle();
        }
    }

    handleLoginClick = (e) => {
        e.preventDefault();
        const currentPath = this.props.location.pathname;
        
        this.props.history.push({
            pathname: '/login',
            state: { from: currentPath }
        });
    };

    render() {
        const { isAuthenticated, user } = this.props.auth;

        const authLinks = (
            <Fragment>
                <li className="nav-item">
                    <HelpButton />
                </li>
                <li className="nav-item">
                    <UserDropdown user={user} logout={this.props.logout} />
                </li>
            </Fragment>
        );

        const guestLinks = (
            <Fragment>
                <li className="nav-item">
                    <HelpButton />
                </li>
                <li className="nav-item">
                    <a href="#" className="nav-link" onClick={this.handleLoginClick}>
                        Login
                    </a>
                </li>
            </Fragment>
        );

        return (
            <nav className="navbar navbar-expand-lg navbar-dark bg-primary">
                <div className="container-fluid">
                    <Link to="/" className="navbar-brand d-flex align-items-center me-3" replace>
                        <img src="/static/img/round-logo-fav.png" width="41" height="41" alt="Watcher" className="me-2"/>
                        <span className="align-middle ms-1">Watcher</span>
                    </Link>

                    <ul className="navbar-nav ms-auto d-flex flex-row order-lg-2">
                        {isAuthenticated ? authLinks : guestLinks}
                    </ul>
                    
                    <button 
                        className="navbar-toggler order-lg-1" 
                        type="button" 
                        data-toggle="collapse" 
                        data-target="#navbarColor01"
                        aria-controls="navbarColor01" 
                        aria-expanded="false" 
                        aria-label="Toggle navigation"
                    >
                        <span className="navbar-toggler-icon"></span>
                    </button>
                    
                    <div className="collapse navbar-collapse order-lg-1" id="navbarColor01">
                        <ul className="navbar-nav me-auto">
                            <li className="nav-item">
                                <NavLink
                                    to="/legitimate_domains"
                                    replace
                                    className={({ isActive }) => `nav-link ${isActive ? 'text-white fw-bold' : ''}`}
                                >
                                    Legitimate Domains
                                </NavLink>
                            </li>
                            <li className="nav-item">
                                <NavLink
                                    to="/cyber_watch"
                                    replace
                                    className={({ isActive }) => `nav-link ${isActive ? 'text-white fw-bold' : ''}`}
                                >
                                    Cyber Watch
                                </NavLink>
                            </li>
                            <li className="nav-item">
                                <NavLink
                                    to="/data_leak"
                                    replace
                                    className={({ isActive }) => `nav-link ${isActive ? 'text-white fw-bold' : ''}`}
                                >
                                    Data Leak
                                </NavLink>
                            </li>
                            <li className="nav-item">
                                <NavLink
                                    to="/website_monitoring"
                                    replace
                                    className={({ isActive }) => `nav-link ${isActive ? 'text-white fw-bold' : ''}`}
                                >
                                    Website Monitoring
                                </NavLink>
                            </li>
                            <li className="nav-item">
                                <NavLink
                                    to="/dns_finder"
                                    replace
                                    className={({ isActive }) => `nav-link ${isActive ? 'text-white fw-bold' : ''}`}
                                >
                                    Twisted DNS Finder
                                </NavLink>
                            </li>
                        </ul>
                    </div>
                </div>
            </nav>
        );
    }
}

const mapStateToProps = state => ({
    auth: state.auth
});

export default withRouter(connect(mapStateToProps, { logout })(Header));