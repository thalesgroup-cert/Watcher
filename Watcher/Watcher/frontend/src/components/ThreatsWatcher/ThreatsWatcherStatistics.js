import React, { Component } from 'react';
import ThreatsWatcherStats from './ThreatsWatcherStats';
import RansomwareStats from './RansomwareStats';
import CVEStats from './CVEStats';

// Auto-advance interval: 3 minutes
const AUTO_ADVANCE_MS = 3 * 60 * 1000;

const SLIDES = [
    { id: 'threats',    label: 'Threats Watcher', icon: 'trending_up', component: ThreatsWatcherStats },
    { id: 'ransomware', label: 'Ransomware',       icon: 'lock',        component: RansomwareStats    },
    { id: 'cve',        label: 'CVE',              icon: 'security',    component: CVEStats           },
];

class ProgressBar extends Component {
    constructor(props) {
        super(props);
        this.state = { width: 0 };
        this._start = null;
        this._raf   = null;
    }
    componentDidMount()      { this._tick(); }
    componentDidUpdate(prev) {
        if (prev.slideKey !== this.props.slideKey) {
            cancelAnimationFrame(this._raf);
            this._start = null;
            this.setState({ width: 0 }, () => this._tick());
        }
    }
    componentWillUnmount() { cancelAnimationFrame(this._raf); }
    _tick = () => {
        this._raf = requestAnimationFrame(ts => {
            if (!this._start) this._start = ts;
            const pct = Math.min(100, ((ts - this._start) / AUTO_ADVANCE_MS) * 100);
            this.setState({ width: pct });
            if (pct < 100) this._tick();
        });
    };
    render() {
        return (
            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 2, background: 'rgba(0,0,0,0.05)' }}>
                <div style={{
                    height: '100%', width: this.state.width + '%',
                    background: 'rgba(78,115,223,0.45)',
                    transition: 'width 0.3s linear',
                }} />
            </div>
        );
    }
}

const ArrowBtn = ({ direction, onClick, disabled }) => (
    <button
        onClick={onClick}
        disabled={disabled}
        style={{
            position: 'absolute',
            top: '50%',
            transform: 'translateY(-50%)',
            [direction === 'left' ? 'left' : 'right']: 6,
            zIndex: 10,
            background: 'rgba(255,255,255,0.72)',
            border: '1px solid rgba(0,0,0,0.08)',
            borderRadius: '50%',
            width: 28, height: 28,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: disabled ? 'default' : 'pointer',
            opacity: disabled ? 0.25 : 0.7,
            transition: 'opacity 0.15s, background 0.15s',
            boxShadow: '0 1px 4px rgba(0,0,0,0.10)',
            padding: 0,
        }}
    >
        <i className="material-icons" style={{ fontSize: 16, color: '#5a5c69', lineHeight: 1 }}>
            {direction === 'left' ? 'chevron_left' : 'chevron_right'}
        </i>
    </button>
);

const LS_KEY = 'watcher_threats_stats_hidden';
const _lsRead  = (def) => { try { const v = localStorage.getItem(LS_KEY); return v ? JSON.parse(v) : def; } catch (_) { return def; } };
const _lsWrite = (val) => { try { localStorage.setItem(LS_KEY, JSON.stringify(val)); } catch (_) {} };

class ThreatsWatcherStatistics extends Component {
    constructor(props) {
        super(props);
        this.state = {
            activeIdx: 0,
            hidden: _lsRead({}),
        };
        this._timer = null;
    }
    componentDidMount()    { this._scheduleNext(); }
    componentWillUnmount() { clearTimeout(this._timer); }

    _visibleIndices = () => SLIDES.map((_, i) => i).filter(i => !this.state.hidden[SLIDES[i].id]);

    _scheduleNext = () => {
        clearTimeout(this._timer);
        this._timer = setTimeout(() => {
            const vis = this._visibleIndices();
            if (vis.length < 2) { this._scheduleNext(); return; }
            const cur = vis.indexOf(this.state.activeIdx);
            this.setState({ activeIdx: vis[(cur + 1) % vis.length] }, this._scheduleNext);
        }, AUTO_ADVANCE_MS);
    };

    _goTo = (idx) => {
        if (this.state.hidden[SLIDES[idx].id]) return;
        this.setState({ activeIdx: idx }, () => { clearTimeout(this._timer); this._scheduleNext(); });
    };

    _prev = () => {
        const vis = this._visibleIndices();
        if (vis.length < 2) return;
        const cur = vis.indexOf(this.state.activeIdx);
        this._goTo(vis[(cur - 1 + vis.length) % vis.length]);
    };

    _next = () => {
        const vis = this._visibleIndices();
        if (vis.length < 2) return;
        const cur = vis.indexOf(this.state.activeIdx);
        this._goTo(vis[(cur + 1) % vis.length]);
    };

    _toggleSlide = (slideId) => {
        const { hidden, activeIdx } = this.state;
        const wasHidden = !!hidden[slideId];
        const newHidden = { ...hidden, [slideId]: !wasHidden };
        let nextIdx = activeIdx;
        if (!wasHidden && SLIDES[activeIdx] && SLIDES[activeIdx].id === slideId) {
            const vis = SLIDES.map((_, i) => i).filter(i => !newHidden[SLIDES[i].id]);
            nextIdx = vis.length > 0 ? vis[0] : activeIdx;
        }
        _lsWrite(newHidden);
        this.setState({ hidden: newHidden, activeIdx: nextIdx });
    };

    render() {
        const { activeIdx, hidden } = this.state;
        const visibleIndices  = this._visibleIndices();
        const activeSlide     = SLIDES[activeIdx];
        const ActiveComponent = activeSlide ? activeSlide.component : null;
        const canNav          = visibleIndices.length > 1;

        return (
            <div style={{ position: 'relative', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

                <div style={{ flex: 1, overflowY: 'auto', padding: '12px 44px 0 44px' }}>
                    {visibleIndices.length === 0 ? (
                        <div className="d-flex flex-column align-items-center justify-content-center h-100 text-muted py-5">
                            <i className="material-icons mb-2" style={{ fontSize: 40, opacity: 0.18 }}>visibility_off</i>
                            <small>All panels hidden — click an eye below to show one</small>
                        </div>
                    ) : ActiveComponent ? <ActiveComponent /> : null}

                    <div style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        gap: 10,
                        padding: '14px 0 10px',
                    }}>
                        {SLIDES.map((slide, i) => {
                            const isActive = i === activeIdx;
                            const isHidden = !!hidden[slide.id];
                            return (
                                <button
                                    key={slide.id + '-dot'}
                                    onClick={() => !isHidden && this._goTo(i)}
                                    title={slide.label + (isHidden ? ' (hidden)' : '')}
                                    style={{
                                        background: 'none', border: 'none', padding: '2px 3px',
                                        cursor: isHidden ? 'default' : 'pointer',
                                        display: 'flex', alignItems: 'center', gap: 4,
                                        opacity: isHidden ? 0.22 : isActive ? 0.85 : 0.38,
                                        transition: 'opacity 0.2s',
                                    }}
                                >
                                    <span style={{
                                        display: 'inline-block',
                                        width: isActive ? 18 : 6,
                                        height: 6,
                                        borderRadius: 3,
                                        background: isActive ? '#4e73df' : '#adb5bd',
                                        transition: 'width 0.25s ease, background 0.25s ease',
                                    }} />
                                    {isActive && (
                                        <span style={{ fontSize: '0.68rem', color: '#4e73df', fontWeight: 600, lineHeight: 1, whiteSpace: 'nowrap' }}>
                                            {slide.label}
                                        </span>
                                    )}
                                </button>
                            );
                        })}

                        <span style={{ width: 1, height: 12, background: 'rgba(0,0,0,0.1)', display: 'inline-block', flexShrink: 0 }} />

                        {SLIDES.map((slide) => {
                            const isHidden = !!hidden[slide.id];
                            const onlyOneLeft = visibleIndices.length === 1 && !isHidden;
                            return (
                                <button
                                    key={slide.id + '-eye'}
                                    onClick={() => !onlyOneLeft && this._toggleSlide(slide.id)}
                                    title={(isHidden ? 'Show ' : 'Hide ') + slide.label}
                                    style={{
                                        background: 'none', border: 'none', padding: '1px 2px',
                                        cursor: onlyOneLeft ? 'not-allowed' : 'pointer',
                                        color: isHidden ? '#ccc' : '#adb5bd',
                                        opacity: onlyOneLeft ? 0.2 : isHidden ? 0.5 : 0.45,
                                        transition: 'color 0.15s, opacity 0.15s',
                                        display: 'flex', alignItems: 'center', lineHeight: 1,
                                    }}
                                >
                                    <i className="material-icons" style={{ fontSize: 13 }}>
                                        {isHidden ? 'visibility_off' : slide.icon}
                                    </i>
                                </button>
                            );
                        })}
                    </div>
                </div>

                <ArrowBtn direction="left"  onClick={this._prev} disabled={!canNav} />
                <ArrowBtn direction="right" onClick={this._next} disabled={!canNav} />

                <ProgressBar slideKey={activeIdx + '-' + Object.keys(hidden).sort().join(',')} />
            </div>
        );
    }
}

export default ThreatsWatcherStatistics;
