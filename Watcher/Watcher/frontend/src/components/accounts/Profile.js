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
import { createMessage } from "../../actions/messages";
import preferencesService from "../../services/preferencesService";
import { LAYOUT_PRESETS, applyPreset, getActivePresetId } from "../../config/layoutPresets";

const MODULES = [
    {
        key: 'watcher_threats_grid',
        label: 'Threats Watcher',
        icon: 'cloud',
        panels: {
            stats:   { label: 'Statistics',           icon: 'bar_chart'    },
            cloud:   { label: 'Word Cloud',            icon: 'cloud'        },
            words:   { label: 'Word List',             icon: 'list'         },
            sources: { label: 'Sources & Summary',     icon: 'feed'         },
            chart:   { label: 'Trend',                 icon: 'trending_up'  },
            map:     { label: 'World Map',             icon: 'public'       },
            victims: { label: 'Ransomware Victims',    icon: 'lock'         },
            cve:     { label: 'CVE Vulnerabilities',   icon: 'bug_report'   },
        },
        defaultLayout: [
            { i: 'stats',   x: 0, y: 0,  w: 12, h: 10 },
            { i: 'cloud',   x: 0, y: 10, w: 6,  h: 10 },
            { i: 'words',   x: 6, y: 10, w: 6,  h: 10 },
            { i: 'sources', x: 0, y: 20, w: 12, h: 11 },
            { i: 'chart',   x: 0, y: 31, w: 12, h: 8  },
            { i: 'map',     x: 0, y: 39, w: 6,  h: 10 },
            { i: 'victims', x: 6, y: 39, w: 6,  h: 10 },
            { i: 'cve',     x: 0, y: 49, w: 12, h: 12 },
        ],
        presets: LAYOUT_PRESETS['watcher_threats_grid'],
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
        presets: LAYOUT_PRESETS['watcher_legitimate_domains_grid'],
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
        presets: LAYOUT_PRESETS['watcher_cyber_watch_grid'],
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
        presets: LAYOUT_PRESETS['watcher_dataleak_grid'],
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
        presets: LAYOUT_PRESETS['watcher_site_monitoring_grid'],
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
        presets: LAYOUT_PRESETS['watcher_dns_finder_grid'],
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

function PresetCard({ preset, panels, isActive, onApply }) {
    return (
        <div
            onClick={onApply}
            style={{
                cursor: 'pointer',
                border: isActive ? '2px solid #0d6efd' : '1.5px solid #dee2e6',
                borderRadius: 8,
                background: isActive ? 'rgba(13,110,253,0.04)' : undefined,
                boxShadow: isActive ? '0 0 0 3px rgba(13,110,253,0.15)' : '0 1px 3px rgba(0,0,0,0.07)',
                transition: 'all 0.15s',
                overflow: 'hidden',
            }}
            onMouseEnter={e => { if (!isActive) e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.12)'; }}
            onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = isActive ? '0 0 0 3px rgba(13,110,253,0.15)' : '0 1px 3px rgba(0,0,0,0.07)'; }}
        >
            <div className="px-3 pt-3 pb-1">
                <div className="d-flex align-items-start justify-content-between mb-1">
                    <div className="d-flex align-items-center gap-2">
                        <i className="material-icons" style={{ fontSize: 18, color: isActive ? '#0d6efd' : '#607d8b' }}>{preset.icon}</i>
                        <span className="fw-bold" style={{ fontSize: 14 }}>{preset.name}</span>
                    </div>
                    {isActive && (
                        <Badge bg="primary" style={{ fontSize: 9 }}>ACTIVE</Badge>
                    )}
                </div>
                <p className="text-muted mb-2" style={{ fontSize: 11, lineHeight: 1.4 }}>{preset.description}</p>
            </div>
            <div className="px-2 pb-2">
                <MiniGrid layout={preset.layout} panels={panels} height={90} />
            </div>
            <div className="px-3 pb-2 pt-1">
                <span className="text-muted" style={{ fontSize: 10 }}>
                    {preset.active.length} panels visible
                </span>
            </div>
        </div>
    );
}

function LayoutEditorModal({ module, show, onClose, onSaved, onMessage }) {
    const [tab, setTab] = useState('presets');
    const [layout, setLayout] = useState([]);
    const [activePresetId, setActivePresetId] = useState('default');
    // editor minimize state
    const [editorMinimized, setEditorMinimized] = useState(new Set());
    const [editorPreH, setEditorPreH] = useState({});
    // saved layouts
    const [savedLayouts, setSavedLayouts] = useState([]);
    const [activeSavedId, setActiveSavedId] = useState(null);
    const [showSaveInput, setShowSaveInput] = useState(false);
    const [savingName, setSavingName] = useState('');

    // Load state when modal opens
    useEffect(() => {
        if (!show) return;
        setTab('presets');
        const stored = preferencesService.get(`${module.key}_layout`, null);
        setLayout(
            stored && Array.isArray(stored) && stored.length > 0
                ? stored
                : module.defaultLayout.map(p => ({ ...p }))
        );
        setActivePresetId(getActivePresetId(module.key));
        setEditorMinimized(new Set());
        setEditorPreH({});
        const saved = preferencesService.get(`${module.key}_savedLayouts`, []);
        setSavedLayouts(Array.isArray(saved) ? saved : []);
        setActiveSavedId(preferencesService.get(`${module.key}_activeSavedId`, null));
        setShowSaveInput(false);
        setSavingName('');
    }, [show, module.key]);

    const handleApplyPreset = (preset) => {
        applyPreset(module.key, preset);
        setActivePresetId(preset.id);
        preferencesService.remove(`${module.key}_activeSavedId`);
        setActiveSavedId(null);
        onSaved({ layout: preset.layout, active: preset.active, presetId: preset.id });
        if (onMessage) onMessage(`"${preset.name}" layout applied to ${module.label}.`);
        onClose();
    };

    const toggleEditorMinimize = (key) => {
        if (editorMinimized.has(key)) {
            const h = editorPreH[key] || 3;
            setLayout(l => l.map(p => p.i === key ? { ...p, h, minH: 2 } : p));
            setEditorMinimized(prev => { const n = new Set(prev); n.delete(key); return n; });
        } else {
            const cur = layout.find(p => p.i === key);
            setEditorPreH(prev => ({ ...prev, [key]: cur?.h || 3 }));
            setLayout(l => l.map(p => p.i === key ? { ...p, h: 1, minH: 1 } : p));
            setEditorMinimized(prev => new Set([...prev, key]));
        }
    };

    const removeFromEditor = (key) => {
        setLayout(l => l.filter(p => p.i !== key));
        setEditorMinimized(prev => { const n = new Set(prev); n.delete(key); return n; });
    };

    const handleResetToPreset = () => {
        const preset = (module.presets || []).find(p => p.id === activePresetId)
            || (module.presets || [])[0];
        if (preset) {
            setLayout(preset.layout.map(p => ({ ...p })));
            setEditorMinimized(new Set());
            setEditorPreH({});
        }
    };

    const handleFullReset = () => {
        const defaultPreset = (module.presets || []).find(p => p.id === 'default');
        preferencesService.remove(`${module.key}_layout`);
        preferencesService.remove(`${module.key}_active`);
        preferencesService.remove(`${module.key}_resized`);
        preferencesService.remove(`${module.key}_preset`);
        preferencesService.remove(`${module.key}_activeSavedId`);
        setActivePresetId('default');
        setActiveSavedId(null);
        onSaved({ layout: null, active: null, presetId: 'default' });
        if (onMessage && defaultPreset) onMessage(`"${defaultPreset.name}" layout restored for ${module.label}.`);
        onClose();
    };

    const applyFromSaved = (saved) => {
        preferencesService.set(`${module.key}_layout`, saved.layout);
        preferencesService.set(`${module.key}_active`, saved.active);
        preferencesService.set(`${module.key}_preset`, 'custom');
        preferencesService.set(`${module.key}_activeSavedId`, saved.id);
        setActiveSavedId(saved.id);
        setActivePresetId('custom');
        setLayout(saved.layout.map(p => ({ ...p })));
        setEditorMinimized(new Set());
        setEditorPreH({});
        window.dispatchEvent(new CustomEvent('watcher:layout:updated', { detail: { storageKey: module.key } }));
        onSaved({ layout: saved.layout, active: saved.active, presetId: 'custom' });
        if (onMessage) onMessage(`"${saved.name}" layout applied to ${module.label}.`);
    };

    const handleSave = () => {
        if (!savingName.trim()) return;
        const id = Date.now();
        const newSave = {
            id,
            name: savingName.trim(),
            layout,
            active: layout.map(p => p.i),
            createdAt: new Date().toISOString(),
        };
        const updated = [...savedLayouts, newSave];
        setSavedLayouts(updated);
        preferencesService.set(`${module.key}_savedLayouts`, updated);
        setSavingName('');
        setShowSaveInput(false);
        applyFromSaved(newSave);
    };

    const handleDeleteSaved = (id) => {
        const updated = savedLayouts.filter(s => s.id !== id);
        setSavedLayouts(updated);
        preferencesService.set(`${module.key}_savedLayouts`, updated);
        if (activeSavedId === id) {
            setActiveSavedId(null);
            preferencesService.remove(`${module.key}_activeSavedId`);
        }
    };

    const presets = module.presets || [];

    return (
        <Modal show={show} onHide={onClose} size="xl" centered scrollable>
            <Modal.Header closeButton>
                <Modal.Title className="d-flex align-items-center gap-2">
                    <i className="material-icons" style={{ fontSize: 20, verticalAlign: 'middle' }}>{module.icon}</i>
                    {module.label} - Layout Presets &amp; Editor
                </Modal.Title>
            </Modal.Header>

            {/* Tab bar */}
            <div className="d-flex border-bottom px-3" style={{ gap: 0 }}>
                {[{ id: 'presets', icon: 'layers', label: 'Presets' }, { id: 'custom', icon: 'tune', label: 'Custom Editor' }].map(t => (
                    <button
                        key={t.id}
                        onClick={() => setTab(t.id)}
                        className="btn btn-link text-decoration-none d-flex align-items-center gap-1 px-3 py-2"
                        style={{
                            borderBottom: tab === t.id ? '2px solid #0d6efd' : '2px solid transparent',
                            borderRadius: 0,
                            color: tab === t.id ? '#0d6efd' : undefined,
                            fontWeight: tab === t.id ? 600 : 400,
                            fontSize: 14,
                        }}
                    >
                        <i className="material-icons" style={{ fontSize: 16 }}>{t.icon}</i>
                        {t.label}
                    </button>
                ))}
            </div>

            <Modal.Body style={{ minHeight: 460 }}>

                {tab === 'presets' && (
                    <>
                        <p className="text-muted mb-3" style={{ fontSize: 13 }}>
                            Choose a preset to instantly rearrange the panels in this module.
                            Your choice is saved to your account and takes effect immediately.
                        </p>
                        <Row className="g-3">
                            {presets.map(preset => (
                                <Col xs={12} sm={6} md={4} key={preset.id}>
                                    <PresetCard
                                        preset={preset}
                                        panels={module.panels}
                                        isActive={activePresetId === preset.id}
                                        onApply={() => handleApplyPreset(preset)}
                                    />
                                </Col>
                            ))}
                        </Row>
                    </>
                )}

                {tab === 'custom' && (
                    <>
                        <div className="d-flex align-items-center justify-content-between mb-3">
                            <span className="fw-semibold d-flex align-items-center gap-2" style={{ fontSize: 14 }}>
                                <i className="material-icons" style={{ fontSize: 18, color: '#607d8b' }}>bookmark</i>
                                Saved Layouts
                            </span>
                            {!showSaveInput ? (
                                <Button variant="outline-primary" size="sm" onClick={() => setShowSaveInput(true)}>
                                    <i className="material-icons me-1 align-middle" style={{ fontSize: 15 }}>save</i>
                                    Save current
                                </Button>
                            ) : (
                                <div className="d-flex align-items-center gap-2">
                                    <input
                                        type="text"
                                        className="form-control form-control-sm"
                                        placeholder="Layout name…"
                                        value={savingName}
                                        onChange={e => setSavingName(e.target.value)}
                                        onKeyDown={e => {
                                            if (e.key === 'Enter') handleSave();
                                            if (e.key === 'Escape') { setShowSaveInput(false); setSavingName(''); }
                                        }}
                                        autoFocus
                                        style={{ width: 180 }}
                                    />
                                    <Button variant="primary" size="sm" onClick={handleSave} disabled={!savingName.trim()}>
                                        Confirm
                                    </Button>
                                    <Button variant="outline-secondary" size="sm" onClick={() => { setShowSaveInput(false); setSavingName(''); }}>
                                        Cancel
                                    </Button>
                                </div>
                            )}
                        </div>

                        {savedLayouts.length === 0 ? (
                            <div className="text-center text-muted py-4 border border-secondary rounded mb-3" style={{ fontSize: 13, opacity: 0.7 }}>
                                <i className="material-icons d-block mb-1" style={{ fontSize: 32, opacity: 0.4 }}>bookmark_border</i>
                                No saved layouts yet. Arrange panels below and click "Save current".
                            </div>
                        ) : (
                            <Row className="g-3 mb-3">
                                {savedLayouts.map(saved => {
                                    const isActive = activeSavedId === saved.id;
                                    const date = new Date(saved.createdAt).toLocaleDateString();
                                    return (
                                        <Col xs={12} sm={6} md={4} key={saved.id}>
                                            <div className={`card h-100${isActive ? ' border-primary border-2' : ''}`}>
                                                <div className="card-body p-2">
                                                    <div className="d-flex align-items-start justify-content-between mb-2">
                                                        <span className="fw-bold" style={{ fontSize: 13 }}>{saved.name}</span>
                                                        {isActive && <Badge bg="primary" style={{ fontSize: 9 }}>ACTIVE</Badge>}
                                                    </div>
                                                    <MiniGrid layout={saved.layout} panels={module.panels} height={80} />
                                                    <div className="mt-2">
                                                        <span className="text-muted" style={{ fontSize: 10 }}>
                                                            {saved.active.length} panels · {date}
                                                        </span>
                                                    </div>
                                                </div>
                                                <div className="card-footer p-2 d-flex gap-2">
                                                    <Button
                                                        variant={isActive ? 'primary' : 'outline-primary'}
                                                        size="sm"
                                                        className="flex-grow-1"
                                                        onClick={() => applyFromSaved(saved)}
                                                    >
                                                        {isActive ? 'Applied' : 'Apply'}
                                                    </Button>
                                                    <Button
                                                        variant="outline-danger"
                                                        size="sm"
                                                        onClick={() => handleDeleteSaved(saved.id)}
                                                        title="Delete"
                                                    >
                                                        <i className="material-icons" style={{ fontSize: 14 }}>delete</i>
                                                    </Button>
                                                </div>
                                            </div>
                                        </Col>
                                    );
                                })}
                            </Row>
                        )}

                        <hr className="my-3" />

                        <div className="d-flex align-items-center justify-content-between mb-3">
                            <span className="fw-semibold d-flex align-items-center gap-2" style={{ fontSize: 14 }}>
                                <i className="material-icons" style={{ fontSize: 18, color: '#607d8b' }}>tune</i>
                                Drag &amp; resize to arrange
                            </span>
                            <Button variant="outline-secondary" size="sm" onClick={handleResetToPreset}>
                                <i className="material-icons me-1 align-middle" style={{ fontSize: 15 }}>undo</i>
                                Restore active preset
                            </Button>
                        </div>
                        <ReactGridLayout
                            layout={layout}
                            cols={12}
                            rowHeight={EDITOR_ROW_HEIGHT}
                            onLayoutChange={setLayout}
                            draggableHandle=".drag-handle"
                            compactType="vertical"
                            margin={[8, 8]}
                            containerPadding={[4, 4]}
                        >
                            {layout.map((panel, idx) => {
                                const meta = module.panels[panel.i];
                                const isMin = editorMinimized.has(panel.i);
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
                                            className="drag-handle d-flex align-items-center gap-1 px-2 py-1"
                                            style={{
                                                background: 'rgba(0,0,0,0.06)',
                                                cursor: 'grab',
                                                userSelect: 'none',
                                                borderBottom: isMin ? 'none' : '1px solid #b0bec5',
                                                flexShrink: 0,
                                            }}
                                        >
                                            <i className="material-icons" style={{ fontSize: 14, color: '#607d8b', flexShrink: 0 }}>drag_indicator</i>
                                            {meta && <i className="material-icons" style={{ fontSize: 14, color: '#455a64', flexShrink: 0 }}>{meta.icon}</i>}
                                            <span style={{ fontSize: 12, fontWeight: 600, color: '#37474f', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {meta ? meta.label : panel.i}
                                            </span>
                                            <button
                                                className="btn btn-sm p-0 d-flex align-items-center justify-content-center"
                                                style={{ width: 18, height: 18, minWidth: 18, flexShrink: 0 }}
                                                title={isMin ? 'Expand' : 'Minimize'}
                                                onMouseDown={e => e.stopPropagation()}
                                                onClick={e => { e.stopPropagation(); toggleEditorMinimize(panel.i); }}
                                            >
                                                <i className="material-icons" style={{ fontSize: 13, color: '#607d8b' }}>{isMin ? 'expand_more' : 'remove'}</i>
                                            </button>
                                            <button
                                                className="btn btn-sm p-0 d-flex align-items-center justify-content-center"
                                                style={{ width: 18, height: 18, minWidth: 18, flexShrink: 0 }}
                                                title="Remove panel"
                                                onMouseDown={e => e.stopPropagation()}
                                                onClick={e => { e.stopPropagation(); removeFromEditor(panel.i); }}
                                            >
                                                <i className="material-icons" style={{ fontSize: 13, color: '#90a4ae' }}>close</i>
                                            </button>
                                        </div>
                                        {!isMin && <div className="flex-grow-1" style={{ minHeight: 0 }} />}
                                    </div>
                                );
                            })}
                        </ReactGridLayout>

                        {/* Removed panels - show them so user can see what's hidden */}
                        {Object.keys(module.panels).filter(k => !layout.some(p => p.i === k)).length > 0 && (
                            <div className="mt-2 d-flex align-items-center gap-2 flex-wrap">
                                <small className="text-muted">Hidden:</small>
                                {Object.keys(module.panels)
                                    .filter(k => !layout.some(p => p.i === k))
                                    .map(k => {
                                        const meta = module.panels[k];
                                        return (
                                            <button
                                                key={k}
                                                className="btn btn-outline-secondary btn-sm d-inline-flex align-items-center gap-1 py-0"
                                                style={{ fontSize: 11 }}
                                                onClick={() => {
                                                    const base = module.defaultLayout.find(d => d.i === k) || { i: k, x: 0, y: 999, w: 6, h: 4 };
                                                    setLayout(l => [...l, { ...base }]);
                                                }}
                                                title={`Re-add ${meta.label}`}
                                            >
                                                <i className="material-icons" style={{ fontSize: 12 }}>add</i>
                                                {meta.label}
                                            </button>
                                        );
                                    })}
                            </div>
                        )}

                    </>
                )}

            </Modal.Body>

            <Modal.Footer>
                <Button variant="outline-danger" onClick={handleFullReset} className="me-auto">
                    <i className="material-icons me-1 align-middle" style={{ fontSize: 15 }}>restore</i>
                    Reset to Default
                </Button>
                <Button variant="outline-secondary" onClick={onClose}>Close</Button>
            </Modal.Footer>
        </Modal>
    );
}

function LayoutCard({ module, onMessage }) {
    const [layout, setLayout] = useState(null);
    const [activePresetId, setActivePresetId] = useState('default');
    const [showModal, setShowModal] = useState(false);

    const loadFromService = () => {
        const stored = preferencesService.get(`${module.key}_layout`, null);
        const presetId = getActivePresetId(module.key);
        setActivePresetId(presetId);
        if (stored && Array.isArray(stored) && stored.length > 0) {
            setLayout(stored);
        } else {
            setLayout(module.defaultLayout);
        }
    };

    useEffect(() => {
        loadFromService();
        const handler = () => loadFromService();
        window.addEventListener('watcher:prefs:ready', handler);
        return () => window.removeEventListener('watcher:prefs:ready', handler);
    }, [module.key]);

    const handleSaved = useCallback((result) => {
        if (!result || result.layout === null) {
            setLayout(module.defaultLayout);
            setActivePresetId('default');
        } else {
            setLayout(result.layout);
            setActivePresetId(result.presetId || 'custom');
        }
    }, [module]);

    const presets = module.presets || [];
    const activePreset = presets.find(p => p.id === activePresetId);
    const isCustom = activePresetId === 'custom';
    const badgeLabel = isCustom ? 'custom' : (activePreset?.name || 'default');
    const badgeBg = isCustom ? 'warning' : (activePresetId === 'default' ? 'secondary' : 'primary');

    return (
        <>
        <Card
            className="h-100 shadow-sm"
            style={{ cursor: 'pointer', transition: 'box-shadow 0.15s' }}
            onClick={() => setShowModal(true)}
            onMouseEnter={e => e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.13)'}
            onMouseLeave={e => e.currentTarget.style.boxShadow = ''}
        >
            <Card.Body className="p-3">
                <div className="d-flex align-items-center justify-content-between mb-2">
                    <div className="d-flex align-items-center gap-2">
                        <i className="material-icons" style={{ fontSize: 16 }}>{module.icon}</i>
                        <span className="fw-semibold">{module.label}</span>
                        <Badge bg={badgeBg} text={badgeBg === 'warning' ? 'dark' : undefined} style={{ fontSize: 9 }}>
                            {badgeLabel}
                        </Badge>
                    </div>
                    <i className="material-icons text-muted" style={{ fontSize: 18 }}>edit</i>
                </div>
                {layout && <MiniGrid layout={layout} panels={module.panels} />}
                <div className="mt-1 d-flex align-items-center justify-content-between">
                    <span className="text-muted small">
                        {(layout || module.defaultLayout).length} panels visible
                    </span>
                    {presets.length > 0 && (
                        <span className="text-muted" style={{ fontSize: 10 }}>
                            {presets.length} presets available
                        </span>
                    )}
                </div>
            </Card.Body>
        </Card>
        <LayoutEditorModal
            module={module}
            show={showModal}
            onClose={() => setShowModal(false)}
            onSaved={handleSaved}
            onMessage={onMessage}
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
            <div style={{ background: '#e9ecef', borderRadius: '4px 4px 0 0', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', padding: 0 }}>
                <img
                    src={imgError ? fallbackSrc : previewSrc}
                    alt={config.name}
                    onError={() => setImgError(true)}
                    draggable={false}
                    onDragStart={(e) => e.preventDefault()}
                    style={{ width: '100%', height: 'auto', display: 'block', pointerEvents: 'none', userSelect: 'none' }}
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

function Profile({ user, logout, createMessage }) {
    const { currentTheme, availableThemes, changeTheme } = useTheme();
    const [activeSection, setActiveSection] = useState('settings');
    const [helpOpen, setHelpOpen] = useState(false);

    const handleThemeChange = (themeKey) => {
        changeTheme(themeKey);
        createMessage({ themeChanged: `Theme ${availableThemes[themeKey]?.name} applied and saved.` });
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

                <Col lg={9}>

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
                                                background: 'linear-gradient(160deg, #052f84, #3584b4)',
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
                                                        <label className="text-muted fw-semibold" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8 }}>Groups Permissions</label>
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

                    {activeSection === 'themes' && (
                        <Card className="shadow-sm">
                            <Card.Header className="bg-transparent">
                                <h5 className="mb-0 fw-bold">
                                    <i className="material-icons me-2" style={{ fontSize: 20, verticalAlign: 'middle' }}>palette</i>
                                    Choose Your Theme
                                </h5>
                            </Card.Header>
                            <Card.Body>
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
                                <div className="mb-3">
                                    <button
                                        className="btn btn-link p-0 d-flex align-items-center gap-1 text-muted text-decoration-none"
                                        onClick={() => setHelpOpen(h => !h)}
                                    >
                                        <i className="material-icons" style={{ fontSize: 16 }}>help_outline</i>
                                        <span className="small fw-semibold">Need help with layouts?</span>
                                        <i className="material-icons" style={{ fontSize: 16 }}>{helpOpen ? 'expand_less' : 'expand_more'}</i>
                                    </button>
                                    {helpOpen && (
                                        <div className="mt-2 ps-3 border-start border-primary" style={{ fontSize: 13 }}>
                                            <ul className="mb-0 ps-3">
                                                <li className="mb-1"><strong>Presets</strong> - each module comes with ready-made layouts. Click a card below and select a preset from the <em>Presets</em> tab to apply it instantly.</li>
                                                <li className="mb-1"><strong>Custom Editor</strong> - switch to the <em>Custom Editor</em> tab, drag panels to reorder them, toggle visibility, then save your own layout.</li>
                                                <li className="mb-1"><strong>Reset Layout</strong> - the <em>Reset Layout</em> button in each module's toolbar restores the layout to your active preset (or the default if no preset is set).</li>
                                                <li><strong>Cross-device</strong> - layout preferences are saved to your account and apply on every device you log in with.</li>
                                            </ul>
                                        </div>
                                    )}
                                </div>
                                <Row className="g-3">
                                    {MODULES.map(module => (
                                        <Col xs={12} sm={6} key={module.key}>
                                            <LayoutCard
                                                module={module}
                                                onMessage={(msg) => createMessage({ themeChanged: msg })}
                                            />
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
    createMessage: PropTypes.func.isRequired,
};

const mapStateToProps = state => ({
    user: state.auth.user
});

export default connect(mapStateToProps, { logout, createMessage })(Profile);
