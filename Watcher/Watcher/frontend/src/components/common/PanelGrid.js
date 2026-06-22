/**
 * PanelGrid - reusable free-form draggable/resizable panel layout.
 *
 * Props
 * ─────
 * panels         {Object}   Panel definitions: { label, icon, tooltip, children }
 * defaultLayout  {Array}    react-grid-layout layout array
 * defaultActive  {Array}    Keys of panels shown by default
 * storageKey     {string}   Prefix for DB preference keys (via preferencesService)
 * cols           {number}   Grid columns (default 12)
 * rowHeight      {number}   Row height in px (default 55)
 * toolbarExtra   {node}     Extra content in toolbar right side
 * forceActivate  {Array}    Force these panel keys open (watched by ref)
 * layoutOverrides {Object}  { [panelKey]: { h } } - auto height per panel (skipped if user manually resized)
 * layoutPresets   {Array}    Named presets from layoutPresets.js; used to smart-reset to the active preset.
 */
import React, { Component } from 'react';
import PropTypes from 'prop-types';
import GridLayout, { WidthProvider } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import preferencesService from '../../services/preferencesService';

const AutoWidthGrid = WidthProvider(GridLayout);
const DRAG_HANDLE = 'pg-drag-handle';


class PanelGrid extends Component {
    static propTypes = {
        panels:          PropTypes.objectOf(PropTypes.shape({
            label:    PropTypes.string.isRequired,
            icon:     PropTypes.string,
            tooltip:  PropTypes.string,
            children: PropTypes.node.isRequired,
        })).isRequired,
        defaultLayout:   PropTypes.array.isRequired,
        defaultActive:   PropTypes.array,
        storageKey:      PropTypes.string,
        cols:            PropTypes.number,
        rowHeight:       PropTypes.number,
        toolbarExtra:    PropTypes.node,
        forceActivate:   PropTypes.array,
        layoutOverrides: PropTypes.object,
        layoutPresets:   PropTypes.array,
    };

    static defaultProps = {
        defaultActive:   [],
        storageKey:      'panel_grid',
        cols:            12,
        rowHeight:       55,
        toolbarExtra:    null,
        forceActivate:   null,
        layoutOverrides: null,
        layoutPresets:   null,
    };


    _lsKey   = (suffix) => `${this.props.storageKey}_${suffix}`;
    _lsRead  = (suffix, def) => preferencesService.get(this._lsKey(suffix), def);
    _lsWrite = (suffix, val) => preferencesService.set(this._lsKey(suffix), val);
    _lsRemove = (suffix) => preferencesService.remove(this._lsKey(suffix));

    // Re-hydrate from preferences once the service fires ready
    _onPrefsReady = () => {
        const layout         = preferencesService.get(this._lsKey('layout'), this.props.defaultLayout);
        const active         = preferencesService.get(this._lsKey('active'), this.props.defaultActive);
        const resized        = preferencesService.get(this._lsKey('resized'), []);
        const activePresetId = preferencesService.get(this._lsKey('preset'), 'default');
        const minimized      = preferencesService.get(this._lsKey('minimized'), []);
        const preMinH        = preferencesService.get(this._lsKey('preMinH'), {});
        const activeSavedId  = preferencesService.get(this._lsKey('activeSavedId'), null);
        this.setState({
            layout,
            activePanels:    new Set(active),
            manuallyResized: new Set(resized),
            activePresetId,
            minimizedPanels: new Set(minimized),
            preMinH,
            activeSavedId,
        });
    };


    constructor(props) {
        super(props);
        this.state = {
            activePanels:    new Set(this._lsRead('active', props.defaultActive)),
            layout:          this._lsRead('layout', props.defaultLayout),
            manuallyResized: new Set(this._lsRead('resized', [])),
            minimizedPanels: new Set(this._lsRead('minimized', [])),
            preMinH:         this._lsRead('preMinH', {}),
            showHelp:        false,
            activePresetId:  this._lsRead('preset', 'default'),
            activeSavedId:   this._lsRead('activeSavedId', null),
        };
    }


    _onLayoutUpdated = (e) => {
        if (e.detail?.storageKey === this.props.storageKey) {
            this._onPrefsReady();
        }
    };

    componentDidMount() {
        if (!preferencesService.isReady()) {
            window.addEventListener('watcher:prefs:ready', this._onPrefsReady);
        }
        window.addEventListener('watcher:layout:updated', this._onLayoutUpdated);
    }

    componentWillUnmount() {
        window.removeEventListener('watcher:prefs:ready', this._onPrefsReady);
        window.removeEventListener('watcher:layout:updated', this._onLayoutUpdated);
    }

    componentDidUpdate(prevProps) {
        const { forceActivate, layoutOverrides } = this.props;
        if (forceActivate) {
            const prevKeys = (prevProps.forceActivate || []).join(',');
            const nextKeys = forceActivate.join(',');
            if (prevKeys !== nextKeys) {
                const toAdd = forceActivate.filter(key => !this.state.activePanels.has(key));
                if (toAdd.length > 0) {
                    const next = new Set(this.state.activePanels);
                    toAdd.forEach(key => {
                        next.add(key);
                        if (!this.state.layout.find(l => l.i === key)) {
                            const base = this.props.defaultLayout.find(d => d.i === key)
                                || { i: key, x: 0, y: 999, w: 6, h: 8, minW: 3, minH: 4 };
                            this.setState(prev => ({ layout: [...prev.layout, { ...base }] }));
                        }
                    });
                    this.setState({ activePanels: next });
                    this._lsWrite('active', [...next]);
                }
            }
        }

        if (layoutOverrides && layoutOverrides !== prevProps.layoutOverrides) {
            const { manuallyResized, layout, minimizedPanels } = this.state;
            let changed = false;
            const newLayout = layout.map(item => {
                const override = layoutOverrides[item.i];
                if (override && !manuallyResized.has(item.i) && !minimizedPanels.has(item.i)) {
                    if (override.h && override.h !== item.h) {
                        changed = true;
                        return { ...item, h: override.h };
                    }
                }
                return item;
            });
            if (changed) {
                this.setState({ layout: newLayout });
                this._lsWrite('layout', newLayout);
            }
        }
    }


    togglePanel = (key) => {
        const next = new Set(this.state.activePanels);
        if (next.has(key)) {
            next.delete(key);
        } else {
            next.add(key);
            if (!this.state.layout.find(l => l.i === key)) {
                const base = this.props.defaultLayout.find(d => d.i === key)
                    || { i: key, x: 0, y: 999, w: 6, h: 8, minW: 3, minH: 4 };
                this.setState(prev => ({ layout: [...prev.layout, { ...base }] }));
            }
        }
        this.setState({ activePanels: next });
        this._lsWrite('active', [...next]);
    };

    toggleMinimize = (key) => {
        const { minimizedPanels, preMinH, layout } = this.state;
        const nextMin   = new Set(minimizedPanels);
        const nextPreMin = { ...preMinH };

        if (nextMin.has(key)) {
            // Restore
            nextMin.delete(key);
            const prev = nextPreMin[key] || {};
            delete nextPreMin[key];
            const newLayout = layout.map(l => {
                if (l.i !== key) return l;
                return { ...l, h: prev.h || l.h, minH: prev.minH !== undefined ? prev.minH : l.minH };
            });
            this.setState({ minimizedPanels: nextMin, preMinH: nextPreMin, layout: newLayout });
            this._lsWrite('layout', newLayout);
        } else {
            // Minimize
            nextMin.add(key);
            const item = layout.find(l => l.i === key);
            if (item) nextPreMin[key] = { h: item.h, minH: item.minH };
            const newLayout = layout.map(l =>
                l.i === key ? { ...l, h: 1, minH: 1 } : l
            );
            this.setState({ minimizedPanels: nextMin, preMinH: nextPreMin, layout: newLayout });
            this._lsWrite('layout', newLayout);
        }
        this._lsWrite('minimized', [...nextMin]);
        this._lsWrite('preMinH', nextPreMin);
    };

    resetLayout = () => {
        const { layoutPresets } = this.props;
        const { activePresetId = 'default', activeSavedId } = this.state;

        // If a saved layout is active, reset to it
        if (activeSavedId) {
            const savedLayouts = this._lsRead('savedLayouts', []);
            const saved = savedLayouts.find(s => s.id === activeSavedId);
            if (saved) {
                const next        = new Set(saved.active);
                const freshLayout = saved.layout.map(p => ({ ...p }));
                this.setState({
                    activePanels:    next,
                    layout:          freshLayout,
                    manuallyResized: new Set(),
                    minimizedPanels: new Set(),
                    preMinH:         {},
                });
                this._lsWrite('active',    [...next]);
                this._lsWrite('layout',    freshLayout);
                this._lsWrite('resized',   []);
                this._lsWrite('minimized', []);
                this._lsWrite('preMinH',   {});
                return;
            }
        }

        // Fall back to active preset
        const preset = layoutPresets
            ? (layoutPresets.find(p => p.id === activePresetId) || layoutPresets.find(p => p.id === 'default'))
            : null;
        const resetLayout = preset ? preset.layout : this.props.defaultLayout;
        const resetActive = preset ? preset.active : this.props.defaultActive;
        const next        = new Set(resetActive);
        const freshLayout = resetLayout.map(p => ({ ...p }));
        this.setState({
            activePanels:    next,
            layout:          freshLayout,
            manuallyResized: new Set(),
            minimizedPanels: new Set(),
            preMinH:         {},
        });
        this._lsWrite('active',    [...next]);
        this._lsWrite('layout',    freshLayout);
        this._lsWrite('resized',   []);
        this._lsWrite('minimized', []);
        this._lsWrite('preMinH',   {});
    };

    onLayoutChange = (changed) => {
        const merged = this.state.layout.map(existing => {
            const updated = changed.find(l => l.i === existing.i);
            return updated ? { ...existing, ...updated } : existing;
        });
        this.setState({ layout: merged });
        this._lsWrite('layout', merged);
    };

    onResizeStop = (layout, oldItem, newItem) => {
        const { minimizedPanels, preMinH } = this.state;

        // If user drags a minimized panel larger, auto-restore
        if (minimizedPanels.has(newItem.i) && newItem.h > 1) {
            const nextMin    = new Set(minimizedPanels);
            const nextPreMin = { ...preMinH };
            nextMin.delete(newItem.i);
            delete nextPreMin[newItem.i];
            this._lsWrite('minimized', [...nextMin]);
            this._lsWrite('preMinH',   nextPreMin);
            this.setState({ minimizedPanels: nextMin, preMinH: nextPreMin });
        }

        const next = new Set(this.state.manuallyResized);
        next.add(newItem.i);
        this.setState({ manuallyResized: next });
        this._lsWrite('resized', [...next]);
    };


    renderHelp() {
        if (!this.state.showHelp) return null;
        return (
            <div
                style={{
                    position: 'fixed', inset: 0, zIndex: 1050,
                    background: 'rgba(0,0,0,0.45)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
                onClick={() => this.setState({ showHelp: false })}
            >
                <div
                    className="card shadow-lg"
                    style={{ maxWidth: 540, width: '92%' }}
                    onClick={e => e.stopPropagation()}
                >
                    <div className="card-header d-flex align-items-center justify-content-between">
                        <span className="fw-semibold d-flex align-items-center gap-2">
                            <i className="material-icons" style={{ fontSize: '1.1rem' }}>dashboard_customize</i>
                            How to use panels
                        </span>
                        <button className="btn btn-sm btn-close" onClick={() => this.setState({ showHelp: false })} />
                    </div>
                    <div className="card-body" style={{ fontSize: '0.93rem', lineHeight: 1.7 }}>
                        <ul className="mb-0 ps-3">
                            <li><strong>Show / hide a panel</strong> — click its button in the toolbar (blue = visible, grey = hidden)</li>
                            <li><strong>Move a panel</strong> — drag the <i className="material-icons align-middle" style={{ fontSize: '0.9rem' }}>drag_indicator</i> grip in the panel header</li>
                            <li><strong>Resize a panel</strong> — drag the resize handle at the bottom-right corner</li>
                            <li><strong>Minimize a panel</strong> — click the <i className="material-icons align-middle" style={{ fontSize: '0.9rem' }}>remove</i> button to collapse it to its header</li>
                            <li><strong>Save Layout</strong> — saves your current arrangement under a name; Reset will then restore this saved layout</li>
                            <li><strong>Reset Layout</strong> — restores to your saved layout (or the default preset if no save exists)</li>
                            <li>Your layout is <strong>saved automatically</strong> to your account across all devices</li>
                        </ul>
                    </div>
                </div>
            </div>
        );
    }

    renderToolbar() {
        const { panels, toolbarExtra, layoutPresets } = this.props;
        const { activePanels, activePresetId, activeSavedId } = this.state;

        const activePreset = layoutPresets
            ? (layoutPresets.find(p => p.id === activePresetId) || layoutPresets[0])
            : null;

        let resetLabel;
        if (activeSavedId) {
            const savedLayouts = this._lsRead('savedLayouts', []);
            const saved = savedLayouts.find(s => s.id === activeSavedId);
            resetLabel = saved ? `Reset to "${saved.name}"` : 'Reset to saved layout';
        } else {
            resetLabel = activePreset
                ? `Reset to "${activePreset.name || activePresetId}" preset`
                : 'Reset layout to defaults';
        }

        return (
            <div className="d-flex justify-content-start mb-3 mt-3 flex-wrap" style={{ gap: '10px', padding: '0 8px' }}>
                {Object.entries(panels).map(([key, { label, icon }]) => {
                    const isActive = activePanels.has(key);
                    return (
                        <button
                            key={key}
                            type="button"
                            className={`btn d-inline-flex align-items-center ${isActive ? 'btn-primary' : 'btn-secondary'}`}
                            onClick={() => this.togglePanel(key)}
                            title={isActive ? `Hide ${label}` : `Show ${label}`}
                        >
                            {icon && <i className="material-icons me-1 align-middle" style={{ fontSize: 20 }}>{icon}</i>}
                            <span className="align-middle">{label}</span>
                        </button>
                    );
                })}

                <div className="ms-auto d-flex align-items-center" style={{ gap: '8px' }}>
                    {toolbarExtra}

                    <button
                        type="button"
                        className="btn btn-secondary d-inline-flex align-items-center"
                        onClick={this.resetLayout}
                        title={resetLabel}
                    >
                        <i className="material-icons me-1 align-middle" style={{ fontSize: 20 }}>refresh</i>
                        <span className="align-middle">Reset Layout</span>
                    </button>

                    <button
                        type="button"
                        className="btn btn-secondary d-inline-flex align-items-center"
                        onClick={() => this.setState({ showHelp: true })}
                        title="How to use panels"
                    >
                        <i className="material-icons me-1 align-middle" style={{ fontSize: 20 }}>help_outline</i>
                        <span className="align-middle">Help</span>
                    </button>
                </div>
            </div>
        );
    }

    renderPanel(key, panelDef) {
        const { label, icon, tooltip, children } = panelDef;
        const isMinimized = this.state.minimizedPanels.has(key);
        return (
            <div key={key} style={{ overflow: 'hidden', borderRadius: 6 }}>
                <div className="card h-100 shadow-sm" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                    <div
                        className={`${DRAG_HANDLE} card-header d-flex align-items-center justify-content-between py-2 px-3`}
                        style={{ cursor: 'grab', userSelect: 'none', flexShrink: 0 }}
                    >
                        <span className="d-flex align-items-center gap-2 fw-semibold" style={{ fontSize: '0.83rem' }}>
                            <i className="material-icons text-muted" style={{ fontSize: '1.05rem', lineHeight: 1 }}>drag_indicator</i>
                            {icon && <i className="material-icons" style={{ fontSize: '1rem', lineHeight: 1 }}>{icon}</i>}
                            {label}
                            {tooltip && (
                                <i
                                    className="material-icons text-muted"
                                    style={{ fontSize: '0.95rem', lineHeight: 1, cursor: 'help', opacity: 0.6 }}
                                    title={tooltip}
                                >
                                    info
                                </i>
                            )}
                        </span>
                        <div className="d-flex align-items-center gap-1">
                            <button
                                type="button"
                                className="btn btn-sm p-0 d-flex align-items-center justify-content-center"
                                style={{ width: 22, height: 22, opacity: 0.5 }}
                                aria-label={isMinimized ? `Expand ${label}` : `Minimize ${label}`}
                                title={isMinimized ? `Expand ${label}` : `Minimize ${label}`}
                                onMouseDown={e => e.stopPropagation()}
                                onClick={() => this.toggleMinimize(key)}
                            >
                                <i className="material-icons" style={{ fontSize: '1rem', lineHeight: 1 }}>
                                    {isMinimized ? 'expand_more' : 'remove'}
                                </i>
                            </button>
                            <button
                                type="button"
                                className="btn btn-sm btn-close"
                                aria-label="Close"
                                title={`Hide ${label}`}
                                style={{ opacity: 0.5 }}
                                onMouseDown={e => e.stopPropagation()}
                                onClick={() => this.togglePanel(key)}
                            />
                        </div>
                    </div>
                    {!isMinimized && (
                        <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                            {children}
                        </div>
                    )}
                </div>
            </div>
        );
    }

    renderEmpty() {
        return (
            <div className="d-flex align-items-center justify-content-center text-muted py-5 my-4">
                <div className="text-center">
                    <i className="material-icons d-block mb-3" style={{ fontSize: '3rem', opacity: 0.25 }}>dashboard</i>
                    <p className="mb-1 fw-medium">No panels visible</p>
                    <small className="text-muted">Use the toolbar above to add panels.</small>
                </div>
            </div>
        );
    }

    render() {
        const { cols, rowHeight } = this.props;
        const { activePanels, layout } = this.state;
        const panelDefs = this.props.panels;

        const activeKeys   = [...activePanels].filter(k => panelDefs[k]);
        const activeLayout = layout.filter(l => activePanels.has(l.i));

        return (
            <>
                {this.renderToolbar()}
                {this.renderHelp()}

                {activeKeys.length === 0 ? (
                    this.renderEmpty()
                ) : (
                    <div style={{ padding: '8px 8px 0' }}>
                        <AutoWidthGrid
                            layout={activeLayout}
                            cols={cols}
                            rowHeight={rowHeight}
                            margin={[8, 8]}
                            containerPadding={[0, 0]}
                            isDraggable
                            isResizable
                            draggableHandle={`.${DRAG_HANDLE}`}
                            onLayoutChange={this.onLayoutChange}
                            onResizeStop={this.onResizeStop}
                            useCSSTransforms
                        >
                            {activeKeys.map(key => this.renderPanel(key, panelDefs[key]))}
                        </AutoWidthGrid>
                    </div>
                )}
            </>
        );
    }
}

export default PanelGrid;
