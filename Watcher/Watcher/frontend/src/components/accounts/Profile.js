import React, { useState, useEffect, useCallback } from "react";
import { connect } from "react-redux";
import PropTypes from "prop-types";
import { Link } from "react-router-dom";
import { Container, Row, Col, Card, Badge, Nav, Modal, Button } from "react-bootstrap";
import GridLayout, { WidthProvider } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import { useTheme } from "../../contexts/ThemeContext";
import { logout } from "../../actions/auth";
import preferencesService from "../../services/preferencesService";

const MODULES = [
    {
        key: 'watcher_threats_grid',
        label: 'Threats Watcher',
        icon: 'cloud',
        panels: {
            stats:   { label: 'Statistics',           icon: 'bar_chart'    },
            cloud:   { label: 'Word Cloud',            icon: 'cloud'        },
            words:   { label: 'Word List',             icon: 'list'         },
            map:     { label: 'World Map',             icon: 'public'       },
            victims: { label: 'Ransomware Victims',    icon: 'lock'         },
            cve:     { label: 'CVE Vulnerabilities',   icon: 'bug_report'   },
            trend:   { label: 'Trend & Sources',       icon: 'trending_up'  },
        },
        defaultLayout: [
            { i: 'stats',   x: 0, y: 0,  w: 12, h: 10 },
            { i: 'cloud',   x: 0, y: 10, w: 6,  h: 10 },
            { i: 'words',   x: 6, y: 10, w: 6,  h: 10 },
            { i: 'victims', x: 6, y: 20, w: 6,  h: 10 },
            { i: 'map',     x: 0, y: 20, w: 6,  h: 10 },
            { i: 'cve',     x: 0, y: 30, w: 12, h: 12 },
            { i: 'trend',   x: 0, y: 42, w: 12, h: 11 },
        ],
    },
    {
        key: 'watcher_legitimate_domains_grid',
        label: 'Legitimate Domains',
        icon: 'domain',
        panels: {
            stats:   { label: 'Statistics',         icon: 'bar_chart' },
            domains: { label: 'Legitimate Domains', icon: 'domain'    },
        },
        defaultLayout: [
            { i: 'stats',   x: 0, y: 0, w: 12, h: 9  },
            { i: 'domains', x: 0, y: 9, w: 12, h: 11 },
        ],
    },
    {
        key: 'watcher_cyber_watch_grid',
        label: 'Cyber Watch',
        icon: 'security',
        panels: {
            stats:      { label: 'Statistics',         icon: 'bar_chart'    },
            monitored:  { label: 'Monitored Keywords', icon: 'track_changes' },
            watchrules: { label: 'Watch Rules',        icon: 'visibility'   },
            sources:    { label: 'Sources',            icon: 'rss_feed'     },
            banned:     { label: 'Banned Words',       icon: 'block'        },
            archived:   { label: 'Archived Alerts',    icon: 'inventory'    },
        },
        defaultLayout: [
            { i: 'stats',      x: 0, y: 0,  w: 12, h: 4  },
            { i: 'monitored',  x: 0, y: 4,  w: 6,  h: 11 },
            { i: 'watchrules', x: 6, y: 4,  w: 6,  h: 11 },
            { i: 'sources',    x: 0, y: 15, w: 6,  h: 11 },
            { i: 'banned',     x: 6, y: 15, w: 6,  h: 11 },
            { i: 'archived',   x: 0, y: 26, w: 12, h: 12 },
        ],
    },
    {
        key: 'watcher_dataleak_grid',
        label: 'Data Leak',
        icon: 'notifications',
        panels: {
            stats:    { label: 'Statistics',     icon: 'bar_chart'   },
            alerts:   { label: 'Alerts',         icon: 'notifications' },
            patterns: { label: 'Search Patterns',icon: 'search'      },
            archived: { label: 'Archived Alerts',icon: 'archive'     },
        },
        defaultLayout: [
            { i: 'stats',    x: 0, y: 0,  w: 12, h: 8  },
            { i: 'alerts',   x: 0, y: 8,  w: 8,  h: 11 },
            { i: 'patterns', x: 8, y: 8,  w: 4,  h: 11 },
            { i: 'archived', x: 0, y: 19, w: 12, h: 9  },
        ],
    },
    {
        key: 'watcher_site_monitoring_grid',
        label: 'Website Monitoring',
        icon: 'link',
        panels: {
            stats: { label: 'Statistics',                   icon: 'bar_chart' },
            sites: { label: 'Suspicious Websites Monitored', icon: 'link'     },
        },
        defaultLayout: [
            { i: 'stats', x: 0, y: 0, w: 12, h: 9  },
            { i: 'sites', x: 0, y: 9, w: 12, h: 11 },
        ],
    },
    {
        key: 'watcher_dns_finder_grid',
        label: 'Twisted DNS Finder',
        icon: 'saved_search',
        panels: {
            stats:    { label: 'Statistics',       icon: 'bar_chart'   },
            alerts:   { label: 'DNS Alerts',       icon: 'notifications' },
            dns:      { label: 'DNS Monitored',    icon: 'dns'         },
            archived: { label: 'Archived Alerts',  icon: 'archive'     },
            keywords: { label: 'Keyword Monitored',icon: 'search'      },
        },
        defaultLayout: [
            { i: 'stats',    x: 0, y: 0,  w: 12, h: 8  },
            { i: 'alerts',   x: 0, y: 8,  w: 7,  h: 11 },
            { i: 'dns',      x: 7, y: 8,  w: 5,  h: 11 },
            { i: 'archived', x: 0, y: 19, w: 7,  h: 11 },
            { i: 'keywords', x: 7, y: 19, w: 5,  h: 11 },
        ],
    },
];

const PANEL_COLORS = [
    '#c7d9f5', '#c5e8d8', '#fde8c6', '#e8d0f5', '#fcd5d5',
    '#d5f0fc', '#f5f5c5', '#d5fce8', '#fce8d5', '#d5d5fc',
];

function MiniGrid({ layout, panels = {}, cols = 12, height = 110 }) {
    const maxY = layout.reduce((m, p) => Math.max(m, p.y + p.h), 0) || 1;
    const scaleY = height / maxY;

    return (
        <div style={{ position: 'relative', width: '100%', height, background: '#f1f3f5', borderRadius: 4, overflow: 'hidden' }}>
            {layout.map((panel, idx) => {
                const left = `${(panel.x / cols) * 100}%`;
                const top = panel.y * scaleY;
                const width = `calc(${(panel.w / cols) * 100}% - 2px)`;
                const ph = panel.h * scaleY - 2;
                const meta = panels[panel.i];
                return (
                    <div key={panel.i} style={{
                        position: 'absolute', left, top,
                        width, height: ph,
                        background: PANEL_COLORS[idx % PANEL_COLORS.length],
                        border: '1px solid #b0bec5',
                        borderRadius: 3,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        flexDirection: 'column', gap: 1,
                        overflow: 'hidden', padding: '0 2px',
                    }}>
                        {ph > 14 && meta && (
                            <i className="material-icons" style={{ fontSize: Math.min(ph * 0.35, 13), color: '#455a64', lineHeight: 1 }}>
                                {meta.icon}
                            </i>
                        )}
                        {ph > 10 && (
                            <span style={{ fontSize: Math.min(ph * 0.2, 8), fontWeight: 600, color: '#37474f', letterSpacing: 0.2, textAlign: 'center', lineHeight: 1.2, overflow: 'hidden', maxWidth: '100%', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                                {meta ? meta.label : panel.i}
                            </span>
                        )}
                    </div>
                );
            })}
        </div>
    );
}

const ReactGridLayout = WidthProvider(GridLayout);

const EDITOR_ROW_HEIGHT = 40;

function LayoutEditorModal({ module, show, onClose, onSaved }) {
    const [layout, setLayout] = useState([]);

    useEffect(() => {
        if (!show) return;
        const stored = preferencesService.get(`${module.key}_layout`, null);
        setLayout(
            stored && Array.isArray(stored) && stored.length > 0
                ? stored
                : module.defaultLayout.map(p => ({ ...p }))
        );
    }, [show, module.key]);

    const handleSave = () => {
        preferencesService.set(`${module.key}_layout`, layout);
        onSaved(layout);
        onClose();
    };

    const handleReset = () => {
        const def = module.defaultLayout.map(p => ({ ...p }));
        preferencesService.remove(`${module.key}_layout`);
        preferencesService.remove(`${module.key}_active`);
        preferencesService.remove(`${module.key}_resized`);
        setLayout(def);
        onSaved(null);
        onClose();
    };

    return (
        <Modal show={show} onHide={onClose} size="xl" centered scrollable>
            <Modal.Header closeButton>
                <Modal.Title className="d-flex align-items-center gap-2">
                    <i className="material-icons" style={{ fontSize: 20, verticalAlign: 'middle' }}>{module.icon}</i>
                    {module.label} Layout Editor
                </Modal.Title>
            </Modal.Header>
            <Modal.Body style={{ minHeight: 420 }}>
                <ReactGridLayout
                    layout={layout}
                    cols={12}
                    rowHeight={EDITOR_ROW_HEIGHT}
                    onLayoutChange={setLayout}
                    draggableHandle=".drag-handle"
                    margin={[8, 8]}
                    containerPadding={[4, 4]}
                >
                    {layout.map((panel, idx) => {
                        const meta = module.panels[panel.i];
                        return (
                            <div
                                key={panel.i}
                                data-grid={panel}
                                style={{
                                    background: PANEL_COLORS[idx % PANEL_COLORS.length],
                                    border: '1.5px solid #b0bec5',
                                    borderRadius: 6,
                                    overflow: 'hidden',
                                    display: 'flex',
                                    flexDirection: 'column',
                                }}
                            >
                                <div
                                    className="drag-handle d-flex align-items-center gap-2 px-2 py-1"
                                    style={{
                                        background: 'rgba(0,0,0,0.06)',
                                        cursor: 'grab',
                                        userSelect: 'none',
                                        borderBottom: '1px solid #b0bec5',
                                        flexShrink: 0,
                                    }}
                                >
                                    <i className="material-icons" style={{ fontSize: 14, color: '#607d8b' }}>drag_indicator</i>
                                    {meta && <i className="material-icons" style={{ fontSize: 14, color: '#455a64' }}>{meta.icon}</i>}
                                    <span style={{ fontSize: 12, fontWeight: 600, color: '#37474f' }}>
                                        {meta ? meta.label : panel.i}
                                    </span>
                                </div>
                                <div className="flex-grow-1" style={{ minHeight: 0 }} />
                            </div>
                        );
                    })}
                </ReactGridLayout>
            </Modal.Body>
            <Modal.Footer>
                <Button variant="outline-danger" onClick={handleReset}>Reset Layout</Button>
                <Button variant="outline-secondary" onClick={onClose}>Cancel</Button>
                <Button variant="primary" onClick={handleSave}>Save Layout</Button>
            </Modal.Footer>
        </Modal>
    );
}

function LayoutCard({ module }) {
    const [layout, setLayout] = useState(null);
    const [isCustom, setIsCustom] = useState(false);
    const [showModal, setShowModal] = useState(false);

    const loadFromService = () => {
        const stored = preferencesService.get(`${module.key}_layout`, null);
        if (stored && Array.isArray(stored) && stored.length > 0) {
            setLayout(stored);
            setIsCustom(true);
        } else {
            setLayout(module.defaultLayout);
            setIsCustom(false);
        }
    };

    useEffect(() => {
        loadFromService();
        // if service wasn't ready yet, re-read when it fires
        const handler = () => loadFromService();
        window.addEventListener('watcher:prefs:ready', handler);
        return () => window.removeEventListener('watcher:prefs:ready', handler);
    }, [module.key]);

    const handleSaved = useCallback((newLayout) => {
        if (newLayout) {
            setLayout(newLayout);
            setIsCustom(true);
        } else {
            setLayout(module.defaultLayout);
            setIsCustom(false);
        }
    }, [module]);

    return (
        <>
        <Card className="h-100 shadow-sm" style={{ cursor: 'pointer' }} onClick={() => setShowModal(true)}>
            <Card.Body className="p-3">
                <div className="d-flex align-items-center justify-content-between mb-2">
                    <div className="d-flex align-items-center gap-2">
                        <i className="material-icons" style={{ fontSize: 16 }}>{module.icon}</i>
                        <span className="fw-semibold">{module.label}</span>
                        {isCustom && <Badge bg="primary">custom</Badge>}
                    </div>
                    <i className="material-icons text-muted" style={{ fontSize: 18 }}>edit</i>
                </div>
                {layout && <MiniGrid layout={layout} panels={module.panels} />}
                <div className="mt-1 text-muted small">
                    {(layout || module.defaultLayout).length} panels · {isCustom ? 'customised' : 'default'}
                </div>
            </Card.Body>
        </Card>
        <LayoutEditorModal
            module={module}
            show={showModal}
            onClose={() => setShowModal(false)}
            onSaved={handleSaved}
        />
        </>
    );
}

function ThemeCard({ themeKey, config, isActive, onSelect }) {
    const [imgError, setImgError] = useState(false);
    const previewSrc = `/static/img/themes/${themeKey}-preview.png`;
    const fallbackSrc = `/static/img/themes/bootstrap-preview.png`;

    return (
        <div
            onClick={() => onSelect(themeKey)}
            className={`card h-100 ${isActive ? 'border-primary' : ''}`}
            style={{
                cursor: 'pointer',
                boxShadow: isActive ? '0 0 0 3px rgba(13,110,253,0.3)' : undefined,
                transition: 'all 0.15s',
                borderWidth: isActive ? 2 : 1,
            }}
        >
            {/* Full image, not cropped */}
            <div style={{ background: '#e9ecef', borderRadius: '4px 4px 0 0', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', padding: 0 }}>
                <img
                    src={imgError ? fallbackSrc : previewSrc}
                    alt={config.name}
                    onError={() => setImgError(true)}
                    style={{ width: '100%', height: 'auto', display: 'block' }}
                />
            </div>
            <div className="card-body p-2">
                <div className="d-flex align-items-center justify-content-between">
                    <span className="fw-semibold">{config.name}</span>
                    <div className="d-flex align-items-center gap-1">
                        {config.dark && <Badge bg="secondary">dark</Badge>}
                        {isActive && <i className="material-icons text-primary" style={{ fontSize: 16 }}>check_circle</i>}
                    </div>
                </div>
                <p className="text-muted small mb-0 mt-1">{config.description}</p>
            </div>
        </div>
    );
}

function Profile({ user, logout }) {
    const { currentTheme, availableThemes, changeTheme } = useTheme();
    const [activeSection, setActiveSection] = useState('settings');
    const [justChanged, setJustChanged] = useState(null);

    const handleThemeChange = (themeKey) => {
        changeTheme(themeKey);
        setJustChanged(themeKey);
        setTimeout(() => setJustChanged(null), 2000);
    };

    const lightThemes = Object.entries(availableThemes).filter(([, c]) => !c.dark && !c.hidden);
    const darkThemes = Object.entries(availableThemes).filter(([, c]) => c.dark && !c.hidden);

    const initials = user
        ? (user.first_name && user.last_name
            ? `${user.first_name[0]}${user.last_name[0]}`
            : (user.first_name || user.username || '?')[0]
          ).toUpperCase()
        : '?';

    return (
        <Container className="mt-4 mb-5" style={{ maxWidth: 1100 }}>
            <Row>
                {/* Sidebar */}
                <Col lg={3} className="mb-4">
                    <Card className="shadow-sm">
                        <Card.Body className="p-0">
                            <Nav className="flex-column" variant="pills">
                                {[
                                    { key: 'settings', icon: 'settings', label: 'Settings' },
                                    { key: 'themes',   icon: 'palette',          label: 'Themes'   },
                                    { key: 'layouts',  icon: 'dashboard_customize', label: 'Layouts' },
                                ].map(({ key, icon, label }) => (
                                    <Nav.Item key={key}>
                                        <Nav.Link
                                            onClick={() => setActiveSection(key)}
                                            active={activeSection === key}
                                            className="d-flex align-items-center gap-2 rounded-0 py-3 px-3"
                                            style={{ cursor: 'pointer' }}
                                        >
                                            <i className="material-icons" style={{ fontSize: 18 }}>{icon}</i>
                                            {label}
                                            {key === 'themes' && availableThemes[currentTheme] && (
                                                <Badge bg="primary" style={{ fontSize: 9, marginLeft: 'auto' }}>
                                                    {availableThemes[currentTheme]?.name}
                                                </Badge>
                                            )}
                                        </Nav.Link>
                                    </Nav.Item>
                                ))}
                                <hr className="my-0" />
                                <Nav.Item>
                                    <button
                                        className="btn btn-link text-danger d-flex align-items-center gap-2 w-100 px-3 py-3 text-decoration-none"
                                        onClick={logout}
                                    >
                                        <i className="material-icons" style={{ fontSize: 18 }}>logout</i>
                                        Logout
                                    </button>
                                </Nav.Item>
                            </Nav>
                        </Card.Body>
                    </Card>
                </Col>

                {/* Content */}
                <Col lg={9}>

                    {/* ── SETTINGS ── */}
                    {activeSection === 'settings' && (
                        <Card className="shadow-sm">
                            <Card.Header className="bg-transparent">
                                <h5 className="mb-0 fw-bold">
                                    <i className="material-icons me-2" style={{ fontSize: 20, verticalAlign: 'middle' }}>settings</i>
                                    Account Settings
                                </h5>
                            </Card.Header>
                            <Card.Body className="p-4">
                                {user && (
                                    <Row className="align-items-start">
                                        <Col xs="auto" className="me-3">
                                            <div style={{
                                                width: 72, height: 72, borderRadius: '50%',
                                                background: 'linear-gradient(135deg, #0d6efd, #6610f2)',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                fontSize: 26, color: '#fff', fontWeight: 700, flexShrink: 0,
                                            }}>
                                                {initials}
                                            </div>
                                        </Col>
                                        <Col>
                                            <Row className="g-3">
                                                {[
                                                    ['Username', `@${user.username}`],
                                                    ['Email', user.email],
                                                    ['First Name', user.first_name],
                                                    ['Last Name', user.last_name],
                                                ].map(([lbl, val]) => (
                                                    <Col sm={6} key={lbl}>
                                                        <label className="text-muted fw-semibold" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8 }}>{lbl}</label>
                                                        <div>{val || <span className="text-muted fst-italic">-</span>}</div>
                                                    </Col>
                                                ))}
                                                <Col sm={12}>
                                                    <label className="text-muted fw-semibold" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8 }}>Roles</label>
                                                    <div className="d-flex flex-wrap gap-1 mt-1">
                                                        {user.is_superuser && <Badge bg="danger">Superuser</Badge>}
                                                        {user.is_staff && <Badge bg="warning" text="dark">Staff</Badge>}
                                                        {(user.groups || []).map(g => <Badge key={g} bg="info" text="dark">{g}</Badge>)}
                                                        {!user.is_superuser && !user.is_staff && (user.groups || []).length === 0 && (
                                                            <span className="text-muted fst-italic" style={{ fontSize: 13 }}>No group assigned</span>
                                                        )}
                                                    </div>
                                                </Col>
                                                {(user.permissions || []).length > 0 && (
                                                    <Col sm={12}>
                                                        <label className="text-muted fw-semibold" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8 }}>Permissions</label>
                                                        <div className="d-flex flex-wrap gap-1 mt-1" style={{ maxHeight: 120, overflowY: 'auto' }}>
                                                            {user.permissions.map(p => (
                                                                <Badge key={p} bg="secondary" style={{ fontSize: 10, fontWeight: 400 }}>{p}</Badge>
                                                            ))}
                                                        </div>
                                                    </Col>
                                                )}
                                            </Row>
                                        </Col>
                                    </Row>
                                )}
                            </Card.Body>
                            <Card.Footer className="bg-transparent">
                                <Link to="/password_change" className="btn btn-outline-secondary btn-sm">
                                    <i className="material-icons me-1" style={{ fontSize: 15, verticalAlign: 'middle' }}>lock</i>
                                    Change Password
                                </Link>
                            </Card.Footer>
                        </Card>
                    )}

                    {/* ── THEMES ── */}
                    {activeSection === 'themes' && (
                        <Card className="shadow-sm">
                            <Card.Header className="bg-transparent">
                                <h5 className="mb-0 fw-bold">
                                    <i className="material-icons me-2" style={{ fontSize: 20, verticalAlign: 'middle' }}>palette</i>
                                    Choose Your Theme
                                </h5>
                            </Card.Header>
                            <Card.Body>
                                {justChanged && (
                                    <div className="alert alert-success py-2 mb-3 d-flex align-items-center gap-2">
                                        <i className="material-icons" style={{ fontSize: 18 }}>check_circle</i>
                                        Theme <strong>{availableThemes[justChanged]?.name}</strong> applied and saved.
                                    </div>
                                )}
                                <div className="d-flex align-items-center gap-2 mb-3">
                                    <span className="fw-semibold text-muted text-uppercase" style={{ fontSize: 11, letterSpacing: 1 }}>Light Themes</span>
                                </div>
                                <Row className="g-3 mb-4">
                                    {lightThemes.map(([key, config]) => (
                                        <Col xs={6} sm={4} key={key}>
                                            <ThemeCard themeKey={key} config={config} isActive={currentTheme === key} onSelect={handleThemeChange} />
                                        </Col>
                                    ))}
                                </Row>
                                <div className="d-flex align-items-center gap-2 mb-3">
                                    <span className="fw-semibold text-muted text-uppercase" style={{ fontSize: 11, letterSpacing: 1 }}>Dark Themes</span>
                                </div>
                                <Row className="g-3">
                                    {darkThemes.map(([key, config]) => (
                                        <Col xs={6} sm={4} key={key}>
                                            <ThemeCard themeKey={key} config={config} isActive={currentTheme === key} onSelect={handleThemeChange} />
                                        </Col>
                                    ))}
                                </Row>
                            </Card.Body>
                        </Card>
                    )}

                    {/* ── LAYOUTS ── */}
                    {activeSection === 'layouts' && (
                        <Card className="shadow-sm">
                            <Card.Header className="bg-transparent d-flex align-items-center justify-content-between">
                                <h5 className="mb-0 fw-bold">
                                    <i className="material-icons me-2" style={{ fontSize: 20, verticalAlign: 'middle' }}>dashboard_customize</i>
                                    Dashboard Layouts
                                </h5>
                                <span className="text-muted small">Panel arrangement per module, saved to your account.</span>
                            </Card.Header>
                            <Card.Body>
                                <Row className="g-3">
                                    {MODULES.map(module => (
                                        <Col xs={12} sm={6} key={module.key}>
                                            <LayoutCard module={module} />
                                        </Col>
                                    ))}
                                </Row>
                            </Card.Body>
                        </Card>
                    )}

                </Col>
            </Row>
        </Container>
    );
}

Profile.propTypes = {
    user: PropTypes.object,
    logout: PropTypes.func.isRequired,
};

const mapStateToProps = state => ({
    user: state.auth.user
});

export default connect(mapStateToProps, { logout })(Profile);
