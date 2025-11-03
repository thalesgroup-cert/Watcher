import React, { Component, Fragment, useRef, useEffect } from 'react';
import { Link, NavLink } from "react-router-dom";
import { connect } from "react-redux";
import PropTypes from "prop-types";
import { logout } from "../../actions/auth";
import { useTheme } from "../../contexts/ThemeContext";


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

const ThemeSelector = () => {
    const { currentTheme, availableThemes, changeTheme } = useTheme();
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
                <i className="material-icons me-1 align-middle small">brush</i>
                <span className="align-middle">{availableThemes[currentTheme].name}</span>
            </button>
            <div 
                ref={menuRef}
                className={`dropdown-menu shadow-lg border-0 ${isOpen ? 'show' : ''}`}
                style={{ minWidth: '280px' }}
            >
                <div className="dropdown-header d-flex align-items-center">
                    <i className="material-icons me-2 small text-secondary">color_lens</i>
                    <strong>Choose Theme</strong>
                </div>
                <div className="dropdown-divider"></div>
                {Object.entries(availableThemes).map(([key, theme]) => (
                    <div
                        key={key}
                        className={`dropdown-item ${currentTheme === key ? 'active' : ''} p-3 ${currentTheme === key ? '' : 'border-bottom'}`}
                        onClick={() => {
                            changeTheme(key);
                            setIsOpen(false);
                        }}
                        style={{ cursor: 'pointer' }}
                    >
                        <div className="d-flex align-items-center">
                            <div className="me-3" style={{ minWidth: '100px' }}>
                                <img 
                                    src={`/static/img/themes/${key}-preview.png`}
                                    alt={`${theme.name} preview`}
                                    className={`rounded ${currentTheme === key ? 'border border-primary border-2' : 'border'}`}
                                    style={{ 
                                        width: '100px', 
                                        height: '60px', 
                                        objectFit: 'cover'
                                    }}
                                    onError={(e) => {
                                        e.target.style.display = 'none';
                                    }}
                                />
                            </div>
                            
                            <div className="flex-grow-1">
                                <div className={`${currentTheme === key ? 'fw-bold' : ''} small mb-1`}>
                                    {theme.name}
                                    {currentTheme === key && (
                                        <i className="material-icons ms-2 text-primary align-middle" style={{ fontSize: 16 }}>
                                            check_circle
                                        </i>
                                    )}
                                </div>
                                <div className={`small ${currentTheme === key ? 'text-white-50' : 'text-muted'}`}>
                                    {theme.description}
                                </div>
                            </div>
                        </div>
                    </div>
                ))}
                <div className="dropdown-divider"></div>
                <div className="dropdown-item-text text-center text-muted small p-2">
                    <i className="material-icons me-1 align-middle" style={{ fontSize: 12 }}>info</i>
                    Theme preference is saved automatically
                </div>
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
                <button className="dropdown-item" onClick={() => { logout(); setIsOpen(false); }}>
                    <i className="material-icons me-2 align-middle small">logout</i>
                    Logout
                </button>
            </div>
        </div>
    );
};

export class Header extends Component {
    static propTypes = {
        auth: PropTypes.object.isRequired,
        logout: PropTypes.func.isRequired
    };

    render() {
        const { isAuthenticated, user } = this.props.auth;

        const authLinks = (
            <Fragment>
                <li className="nav-item">
                    <Link to="/password_change" className="nav-link" replace>
                        Password Change
                    </Link>
                </li>
                <li className="nav-item">
                    <ThemeSelector />
                </li>
                <li className="nav-item">
                    <UserDropdown user={user} logout={this.props.logout} />
                </li>
            </Fragment>
        );

        const guestLinks = (
            <Fragment>
                <li className="nav-item">
                    <Link to="/login" className="nav-link" replace>Login</Link>
                </li>
                <li className="nav-item">
                    <ThemeSelector />
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

export default connect(mapStateToProps, { logout })(Header);