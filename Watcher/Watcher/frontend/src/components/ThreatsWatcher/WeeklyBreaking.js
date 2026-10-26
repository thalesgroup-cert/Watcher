import React, { useEffect, useState, useRef, useCallback } from "react";
import { connect } from "react-redux";
import { getWeeklySummary, getBreakingNews, getSummaryConfig,regenerateWeeklySummary, regenerateBreakingNews } from "../../actions/Common";
import { createMessage } from "../../actions/messages";

function formatDate(dateStr) {
    if (!dateStr) return "";
    const date = new Date(dateStr);
    return date.toLocaleString("en-GB", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
}

function convertCVELinksToHTML(text) {
    if (!text) return "";
    return text.replace(
        /(CVE-\d{4}-\d{4,7})\s*\((https:\/\/[^)]+)\)/g,
        '<a href="$2" target="_blank" rel="noopener noreferrer" style="color: #ffc107; text-decoration: underline;">$1</a>'
    );
}

function isNew(dateStr) {
    if (!dateStr) return false;
    const now = Date.now();
    const date = new Date(dateStr).getTime();
    return now - date < 86400000;
}

const LS_OPEN_KEY = "watcher_weekly_open";
const LS_X_KEY = "watcher_weekly_x";
const LS_Y_KEY = "watcher_weekly_y";
const LS_TAB_KEY = "watcher_weekly_active_tab";
const LS_WEEKLY_READ_KEY = "watcher_weekly_read_id";
const LS_BREAKING_READ_KEY = "watcher_breaking_read_id";
const CARD_MIN_HEIGHT = 72;
const CARD_WIDTH = 680;
const CARD_MINIMIZED_WIDTH = 470;
const BUBBLE_SIZE = 68;
const MARGIN = 32;
const DRAG_THRESHOLD = 5;

const WeeklyBreaking = ({ getWeeklySummary, getBreakingNews, typewriterEnabled, createMessage, getSummaryConfig, regenerateWeeklySummary, regenerateBreakingNews }) => {
    const [weeklyText, setWeeklyText] = useState("");
    const [weeklyDisplayHTML, setWeeklyDisplayHTML] = useState("");
    const [weeklyCreatedAt, setWeeklyCreatedAt] = useState("");
    const [weeklyUpdatedAt, setWeeklyUpdatedAt] = useState("");
    const [weeklyAiModel, setWeeklyAiModel] = useState("");
    const [weeklyId, setWeeklyId] = useState(null);
    const [breakingNews, setBreakingNews] = useState(null);
    const [activeTab, setActiveTab] = useState("");
    const [minimized, setMinimized] = useState(localStorage.getItem(LS_OPEN_KEY) === "false");
    const [pos, setPos] = useState(() => {
        const x = parseInt(localStorage.getItem(LS_X_KEY), 10);
        const bottom = parseInt(localStorage.getItem(LS_Y_KEY), 10);
        return {
            x: isNaN(x) ? MARGIN : x,
            bottom: isNaN(bottom) ? MARGIN : bottom,
        };
    });
    const [dragging, setDragging] = useState(false);
    const [hasDragged, setHasDragged] = useState(false);
    const [hasUnreadWeekly, setHasUnreadWeekly] = useState(false);
    const [hasUnreadBreaking, setHasUnreadBreaking] = useState(false);
    const dragOffset = useRef({ x: 0, y: 0 });
    const dragStartPos = useRef({ x: 0, y: 0 });
    const windowRef = useRef(null);
    const contentRef = useRef(null);
    const [isRegeneratingWeekly, setIsRegeneratingWeekly] = useState(false);
    const [isRegeneratingBreaking, setIsRegeneratingBreaking] = useState(false);

    const [cooldownMinutes, setCooldownMinutes] = useState(15);
    const [currentTime, setCurrentTime] = useState(Date.now());

    const getCooldownStatus = (dateStr) => {
        if (!dateStr) return { disabled: false, tooltip: "Regenerate" };
        const lastUpdate = new Date(dateStr).getTime();
        const elapsedMinutes = (currentTime - lastUpdate) / (1000 * 60);

        if (elapsedMinutes < cooldownMinutes) {
            const remainingMinutes = Math.ceil(cooldownMinutes - elapsedMinutes);
            return { disabled: true, tooltip: `Please wait ${remainingMinutes} minute(s) before the next regeneration.` };
        }
        return { disabled: false, tooltip: "Regenerate" };
    };

    const weeklyCooldown = getCooldownStatus(weeklyUpdatedAt || weeklyCreatedAt);
    const breakingCooldown = getCooldownStatus(breakingNews?.updated_at || breakingNews?.created_at);

    useEffect(() => {
        getSummaryConfig()
            .then(data => {
                if (data.regenerate_cooldown_minutes !== undefined) {
                    setCooldownMinutes(data.regenerate_cooldown_minutes);
                }
            })
            .catch(err => console.error("Error fetching config:", err));

        const interval = setInterval(() => setCurrentTime(Date.now()), 10000);
        return () => clearInterval(interval);
    }, []);

    const handleRegenerateWeekly = async () => {
        setIsRegeneratingWeekly(true);
        try {
            const data = await regenerateWeeklySummary();
            if (data.success && data.data) {
                setWeeklyText(data.data.summary_text || "");
                setWeeklyCreatedAt(data.data.created_at || "");
                setWeeklyUpdatedAt(data.data.updated_at || data.data.created_at || "");
                setWeeklyId(data.data.id);
                setWeeklyAiModel(data.data.ai_model || "");
                setCurrentTime(Date.now());
            }
        } catch (err) {
            if (err.response) {
                createMessage({ error: "Regeneration failed: " + (err.response.data?.message || err.response.statusText) });
            } else {
                console.error("Network error :", err);
                createMessage({ error: "Network error during regeneration." });
            }
        } finally {
            setIsRegeneratingWeekly(false);
        }
    };

    const handleRegenerateBreaking = async () => {
        if (!breakingNews || !breakingNews.keywords) return;

        setIsRegeneratingBreaking(true);
        try {
            const data = await regenerateBreakingNews(breakingNews.keywords);
            if (data.success && data.data) {
                setBreakingNews(data.data);
            }
        } catch (err) {
            if (err.response) {
                alert("Failed to regenerate the alert: " + (err.response.data?.message || err.response.statusText));
            } else {
                console.error("Network error :", err);
            }
        } finally {
            setIsRegeneratingBreaking(false);
        }
    };

    useEffect(() => {
        if (weeklyId && weeklyCreatedAt) {
            const lastReadId = localStorage.getItem(LS_WEEKLY_READ_KEY);
            const weeklyDate = new Date(weeklyCreatedAt);
            const weeklyAge = Date.now() - weeklyDate.getTime();
            const sevenDays = 7 * 24 * 60 * 60 * 1000;

            setHasUnreadWeekly(weeklyAge < sevenDays && lastReadId !== String(weeklyId));
        } else {
            setHasUnreadWeekly(false);
        }

        if (breakingNews && breakingNews.created_at) {
            const lastReadId = localStorage.getItem(LS_BREAKING_READ_KEY);
            const breakingDate = new Date(breakingNews.created_at);
            const breakingAge = Date.now() - breakingDate.getTime();
            const twentyFourHours = 24 * 60 * 60 * 1000;

            setHasUnreadBreaking(breakingAge < twentyFourHours && lastReadId !== String(breakingNews.id));
        } else {
            setHasUnreadBreaking(false);
        }
    }, [weeklyId, weeklyCreatedAt, breakingNews]);

    useEffect(() => {
        if (!weeklyText) {
            setWeeklyDisplayHTML("");
            return;
        }

        const lastReadId = localStorage.getItem(LS_WEEKLY_READ_KEY);
        
        if (lastReadId === String(weeklyId) || !typewriterEnabled) {
            setWeeklyDisplayHTML(convertCVELinksToHTML(weeklyText));
            
            if (lastReadId !== String(weeklyId)) {
                localStorage.setItem(LS_WEEKLY_READ_KEY, String(weeklyId));
                setHasUnreadWeekly(false);
            }
            return;
        }

        let i = 0;
        let currentText = "";
        let timeoutId;
        function write() {
            if (i < weeklyText.length) {
                currentText += weeklyText.charAt(i);
                setWeeklyDisplayHTML(convertCVELinksToHTML(currentText));
                i++;
                timeoutId = setTimeout(write, 14);
            } else {
                setWeeklyDisplayHTML(convertCVELinksToHTML(currentText));
                localStorage.setItem(LS_WEEKLY_READ_KEY, String(weeklyId));
                setHasUnreadWeekly(false);
            }
        }
        setWeeklyDisplayHTML("");
        write();
        return () => clearTimeout(timeoutId);
    }, [weeklyText, weeklyId, typewriterEnabled]);

    useEffect(() => {
        if (!breakingNews || activeTab !== "breaking") return;

        const handleScroll = () => {
            if (!contentRef.current) return;
            const { scrollTop, scrollHeight, clientHeight } = contentRef.current;
            if (scrollHeight - scrollTop - clientHeight < 10) {
                localStorage.setItem(LS_BREAKING_READ_KEY, String(breakingNews.id));
                setHasUnreadBreaking(false);
            }
        };

        const contentEl = contentRef.current;
        if (contentEl) {
            contentEl.addEventListener('scroll', handleScroll);
            handleScroll();
        }

        return () => {
            if (contentEl) {
                contentEl.removeEventListener('scroll', handleScroll);
            }
        };
    }, [breakingNews, activeTab]);

    useEffect(() => {
        if (!weeklyText || activeTab !== "weekly") return;

        const handleScroll = () => {
            if (!contentRef.current) return;
            const { scrollTop, scrollHeight, clientHeight } = contentRef.current;
            if (scrollHeight - scrollTop - clientHeight < 10) {
                localStorage.setItem(LS_WEEKLY_READ_KEY, String(weeklyId));
                setHasUnreadWeekly(false);
            }
        };

        const contentEl = contentRef.current;
        if (contentEl) {
            contentEl.addEventListener('scroll', handleScroll);
            handleScroll();
        }

        return () => {
            if (contentEl) {
                contentEl.removeEventListener('scroll', handleScroll);
            }
        };
    }, [weeklyText, weeklyId, activeTab]);

    useEffect(() => {
        const contentEl = contentRef.current;
        if (!contentEl) return;

        const savedState = localStorage.getItem("watcherCollapsedState");
        const toggleBtn = contentEl.querySelector("#watcher-toggle-all");
        const details = Array.from(contentEl.querySelectorAll(".watcher-cluster"));

        const updateToggleBtnText = () => {
            if (!toggleBtn) return;
            const allOpen = details.every(d => d.hasAttribute("open"));
            const allClosed = details.every(d => !d.hasAttribute("open"));

            if (allOpen) {
                toggleBtn.innerText = "Collapse All";
            } else if (allClosed) {
                toggleBtn.innerText = "Expand All";
            }
        };

        if (savedState === "collapsed") {
            details.forEach(d => d.removeAttribute("open"));
            if (toggleBtn) toggleBtn.innerText = "Expand All";
        } else if (savedState === "expanded") {
            details.forEach(d => d.setAttribute("open", "true"));
            if (toggleBtn) toggleBtn.innerText = "Collapse All";
        }

        const handleGlobalToggleClick = (e) => {
            if (e.target && e.target.id === "watcher-toggle-all") {
                const isCollapsing = e.target.innerText === "Collapse All";
                
                details.forEach(d => {
                    if (isCollapsing) {
                        d.removeAttribute("open");
                    } else {
                        d.setAttribute("open", "true");
                    }
                });
                
                e.target.innerText = isCollapsing ? "Expand All" : "Collapse All";
                localStorage.setItem("watcherCollapsedState", isCollapsing ? "collapsed" : "expanded");
            }
        };
        const handleDetailsToggle = () => {
            setTimeout(() => {
                updateToggleBtnText();
                if (toggleBtn) {
                    localStorage.setItem("watcherCollapsedState", toggleBtn.innerText === "Collapse All" ? "expanded" : "collapsed");
                }
            }, 10);
        };

        contentEl.addEventListener("click", handleGlobalToggleClick);
        details.forEach(d => d.addEventListener("toggle", handleDetailsToggle));

        return () => {
            contentEl.removeEventListener("click", handleGlobalToggleClick);
            details.forEach(d => d.removeEventListener("toggle", handleDetailsToggle));
        };
    }, [minimized, activeTab, weeklyDisplayHTML]);

    const clampToViewport = useCallback((x, bottom, minimizedVal = minimized) => {
        const cardWidth = minimizedVal ? BUBBLE_SIZE : CARD_WIDTH;
        const cardHeight = minimizedVal ? BUBBLE_SIZE : (windowRef.current ? windowRef.current.offsetHeight : CARD_MIN_HEIGHT);
        const maxX = window.innerWidth - cardWidth - MARGIN;
        const minX = MARGIN;
        let newX = Math.max(minX, Math.min(x, maxX));
        const maxBottom = window.innerHeight - cardHeight - MARGIN;
        let newBottom = Math.max(MARGIN, Math.min(bottom, maxBottom));
        let top = window.innerHeight - newBottom - cardHeight;
        if (top < MARGIN) {
            newBottom = window.innerHeight - cardHeight - MARGIN;
            if (newBottom < MARGIN) newBottom = MARGIN;
        }
        return { x: newX, bottom: newBottom };
    }, [minimized]);

    useEffect(() => {
        let isMounted = true;

        const fetchData = () => {
            getWeeklySummary()
                .then(data => {
                    if (isMounted) {
                        if (Array.isArray(data) && data.length > 0 && data[0].summary_text?.trim()) {
                            setWeeklyText(data[0].summary_text);
                            setWeeklyCreatedAt(data[0].created_at || "");
                            setWeeklyUpdatedAt(data[0].updated_at || data[0].created_at || "");
                            setWeeklyId(data[0].id);
                            setWeeklyAiModel(data[0].ai_model || "");
                        } else {
                            setWeeklyText("");
                            setWeeklyCreatedAt("");
                            setWeeklyId(null);
                            setWeeklyAiModel("");
                            setWeeklyUpdatedAt("");
                        }
                    }
                })
                .catch(() => {
                    if (isMounted) {
                        setWeeklyText("");
                        setWeeklyCreatedAt("");
                        setWeeklyId(null);
                    }
                });

            getBreakingNews()
                .then(data => {
                    if (isMounted) {
                        if (Array.isArray(data) && data.length > 0) {
                            const latest = data
                                .filter(n => n.created_at && isNew(n.created_at) && n.summary_text?.trim())
                                .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
                            setBreakingNews(latest || null);
                        } else {
                            setBreakingNews(null);
                        }
                    }
                })
                .catch(() => {
                    if (isMounted) setBreakingNews(null);
                });
        };

        fetchData();

        const intervalId = setInterval(fetchData, 10000);

        return () => {
            isMounted = false;
            clearInterval(intervalId);
        };
    }, []);

    useEffect(() => localStorage.setItem(LS_TAB_KEY, activeTab), [activeTab]);
    useEffect(() => localStorage.setItem(LS_OPEN_KEY, minimized ? "false" : "true"), [minimized]);
    useEffect(() => {
        localStorage.setItem(LS_X_KEY, pos.x);
        localStorage.setItem(LS_Y_KEY, pos.bottom);
    }, [pos.x, pos.bottom]);

    useEffect(() => {
        function onMouseMove(e) {
            if (!dragging) return;
            
            const deltaX = Math.abs(e.clientX - dragStartPos.current.x);
            const deltaY = Math.abs(e.clientY - dragStartPos.current.y);
            
            if (deltaX > DRAG_THRESHOLD || deltaY > DRAG_THRESHOLD) {
                setHasDragged(true);
            }
            
            const cardWidth = minimized ? BUBBLE_SIZE : CARD_WIDTH;
            const cardHeight = minimized ? BUBBLE_SIZE : (windowRef.current ? windowRef.current.offsetHeight : CARD_MIN_HEIGHT);
            const maxX = window.innerWidth - cardWidth - MARGIN;
            let newX = Math.max(MARGIN, Math.min(e.clientX - dragOffset.current.x, maxX));
            let pointerY = e.clientY - dragOffset.current.y;
            let newBottom = window.innerHeight - (pointerY + cardHeight);
            const clamped = clampToViewport(newX, newBottom, minimized);
            setPos(clamped);
        }
        
        function onMouseUp() { 
            setDragging(false); 
        }
        
        if (dragging) {
            window.addEventListener("mousemove", onMouseMove);
            window.addEventListener("mouseup", onMouseUp);
        }
        return () => {
            window.removeEventListener("mousemove", onMouseMove);
            window.removeEventListener("mouseup", onMouseUp);
        };
    }, [dragging, minimized, clampToViewport]);

    useEffect(() => {
        setTimeout(() => setPos(p => clampToViewport(p.x, p.bottom, minimized)), 0);
        function onResize() { setPos(p => clampToViewport(p.x, p.bottom, minimized)); }
        window.addEventListener("resize", onResize);
        return () => window.removeEventListener("resize", onResize);
    }, [minimized, clampToViewport]);

    useEffect(() => {
        if (windowRef.current) setPos(p => clampToViewport(p.x, p.bottom, minimized));
    }, [weeklyDisplayHTML, minimized, clampToViewport]);

    const hasWeekly = weeklyText && weeklyText.trim().length > 0;
    const hasBreaking = !!breakingNews;

    useEffect(() => {
        const savedTab = localStorage.getItem(LS_TAB_KEY);
        
        if (hasWeekly && (!savedTab || savedTab === "weekly")) {
            setActiveTab("weekly");
        }
        else if (hasBreaking && savedTab === "breaking") {
            setActiveTab("breaking");
        }
        else if (hasWeekly) {
            setActiveTab("weekly");
        }
        else if (hasBreaking) {
            setActiveTab("breaking");
        }
    }, [hasWeekly, hasBreaking]);

    const tabs = [];
    if (hasWeekly) {
        tabs.push({
            key: "weekly",
            bootstrapClass: "btn-primary",
            icon: "description",
            label: (
                <span style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <span className="material-icons" style={{ fontSize: 18, marginRight: 7, verticalAlign: "middle" }}>description</span>
                    Weekly Report
                </span>
            )
        });
    }
    if (hasBreaking) {
        tabs.push({
            key: "breaking",
            bootstrapClass: "btn-danger",
            icon: "bolt",
            label: (
                <span style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <span className="material-icons" style={{ fontSize: 18, marginRight: 7, verticalAlign: "middle" }}>bolt</span>
                    Breaking News
                </span>
            )
        });
    }

    if (!hasWeekly && !hasBreaking) {
        return null;
    }

    const hasAnyUnread = hasUnreadWeekly || hasUnreadBreaking;

    function tabNavStyle(tab) {
        const isActive = tab.key === activeTab;
        return {
            color: "#fff",
            border: "none",
            fontWeight: "bold",
            cursor: "pointer",
            fontSize: isActive ? "0.95em" : "0.9em",
            transition: "background 0.22s, color 0.18s, border-bottom 0.22s, box-shadow 0.16s, transform 0.2s",
            borderBottom: isActive ? "4px solid currentColor" : "2px solid #23272b",
            boxShadow: isActive ? "0 2px 18px 0 rgba(0,0,0,0.3)" : "none",
            padding: isActive ? "0.7em 0 0.6em" : "0.4em 0 0.4em",
            width: tabs.length === 1 ? "100%" : (isActive ? "54%" : "46%"),
            borderRadius: tabs.length === 1
                ? "1em 1em 0 0"
                : (tab.key === "weekly" ? "1em 0 0 0" : "0 1em 0 0"),
            outline: "none",
            zIndex: isActive ? 1 : 0,
            transform: isActive ? "scale(1.02)" : "scale(1)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center"
        };
    }

    const cardMaxHeight = `calc(100vh - ${2 * MARGIN}px)`;

    const handleMouseDown = (e) => {
        setDragging(true);
        setHasDragged(false);
        const rect = windowRef.current.getBoundingClientRect();
        dragOffset.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
        dragStartPos.current = { x: e.clientX, y: e.clientY };
    };

    const handleBubbleClick = () => {
        if (!hasDragged) {
            setMinimized(false);
        }
    };

    // Bubble mini mode
    if (minimized) {
        const tabToShow = tabs.find(t => t.key === activeTab) || tabs[0];
        return (
            <div
                ref={windowRef}
                className="position-fixed"
                style={{
                    left: pos.x,
                    bottom: pos.bottom,
                    zIndex: 1050,
                }}
            >
                <div
                    className={`btn ${tabToShow.bootstrapClass} rounded-circle shadow-lg d-flex align-items-center justify-content-center`}
                    style={{
                        width: BUBBLE_SIZE,
                        height: BUBBLE_SIZE,
                        boxShadow: "0 4px 24px 0 rgba(0,0,0,0.4)",
                        cursor: "pointer",
                        border: hasAnyUnread ? "3px solid #ffc107" : "3px solid #fff",
                        transition: "box-shadow 0.16s, border 0.3s",
                        userSelect: "none",
                        position: "relative",
                        padding: 0
                    }}
                    title="Show Threat Intelligence Summary"
                    onClick={handleBubbleClick}
                    onMouseDown={handleMouseDown}
                >
                    <span className="material-icons" style={{ color: "#fff", fontSize: 34 }}>
                        {tabToShow ? tabToShow.icon : "info"}
                    </span>
                </div>
            </div>
        );
    }

    // Normal mode rendering
    return (
        <div
            ref={windowRef}
            className="position-fixed"
            style={{
                left: pos.x,
                bottom: pos.bottom,
                zIndex: 1050,
                width: "95vw",
                maxWidth: minimized ? `${BUBBLE_SIZE}px` : `${CARD_WIDTH}px`,
                minWidth: "220px",
                borderRadius: "1em",
                transition: dragging ? "none" : "bottom 0.1s,left 0.1s,width 0.18s"
            }}
        >
            <style>
                {`
                @keyframes blink { 0%{opacity:1;} 50%{opacity:0;} 100%{opacity:1;} }
                .blinking-cursor { animation: blink 1s infinite; }

                @keyframes spin { 100% { transform: rotate(360deg); } }
                .icon-spin { animation: spin 1s linear infinite; }
                @keyframes dotsBlink { 0%, 80%, 100% { opacity: 1; } 40% { opacity: 0; } }
                .loading-dots span {
                    animation: dotsBlink 1.2s infinite;
                    margin-right: 2px;
                }
                .loading-dots span:nth-child(2) { animation-delay: .3s; }
                .loading-dots span:nth-child(3) { animation-delay: .6s; }
                
                details.watcher-cluster > summary::-webkit-details-marker { display: none; }
                details.watcher-cluster > summary { list-style: none; }
                
                details.watcher-cluster[open] > summary .cluster-arrow { transform: rotate(0deg); }
                details.watcher-cluster:not([open]) > summary .cluster-arrow { transform: rotate(-90deg); }
                `}
            </style>
            <div className="card shadow-lg mb-0 border-0 bg-secondary"
                style={{
                    borderRadius: "1em",
                    overflow: "hidden",
                    maxHeight: cardMaxHeight,
                    background: "#23272b",
                    boxShadow: "0 6px 32px 4px rgba(0,0,0,0.5)",
                    border: hasAnyUnread ? "3px solid #ffc107" : "none"
                }}
            >
                <div
                    style={{
                        background: "#23272b",
                        borderRadius: "1em 1em 0 0",
                        minHeight: 40,
                        position: "relative",
                        userSelect: "none",
                        display: "flex",
                        alignItems: "stretch",
                        padding: 0,
                        borderBottom: "none"
                    }}
                    onMouseDown={handleMouseDown}
                >
                    {tabs.map(tab => (
                        <button
                            key={tab.key}
                            className={`btn ${tab.bootstrapClass}`}
                            style={tabNavStyle(tab)}
                            onClick={() => setActiveTab(tab.key)}
                        >
                            {tab.label}
                        </button>
                    ))}
                    
                    <span style={{
                        position: "absolute",
                        right: 14,
                        top: "50%",
                        transform: "translateY(-50%)",
                        zIndex: 20,
                        display: "flex",
                        alignItems: "center"
                    }}>
                        <span
                            className="material-icons"
                            style={{ cursor: "pointer", fontSize: "2em", color: "#fff" }}
                            title="Minimize"
                            onClick={() => setMinimized(true)}
                        >expand_more</span>
                    </span>
                </div>

                {!minimized && (
                    <div 
                        ref={contentRef}
                        className="tab-content bg-secondary" 
                        style={{ 
                            borderRadius: "0 0 1em 1em",
                            maxHeight: `calc(${cardMaxHeight} - 54px)`,
                            overflowY: "auto",
                            overflowX: "hidden"
                        }}
                    >
                        {activeTab === "weekly" && weeklyText && (
                            <div className="card-body">
                                <div style={{ fontSize: "1.08em", color: "inherit"}}>
                                    <span dangerouslySetInnerHTML={{ __html: weeklyDisplayHTML }} />
                                    {typewriterEnabled && weeklyDisplayHTML !== convertCVELinksToHTML(weeklyText) && (
                                        <span className="blinking-cursor">|</span>
                                    )}
                                </div>
                               <div className="mt-3 pt-2 d-flex justify-content-between align-items-center border-top border-secondary" style={{ fontSize: "0.85em", color: "inherit" }}>
                                    <span className="text-muted">Generated at {formatDate(weeklyCreatedAt)}</span>
                                    <span className="text-muted">{weeklyAiModel}</span>
                                    <button 
                                        className="btn btn-sm text-muted d-flex align-items-center gap-1"
                                        onClick={() => { if (!(isRegeneratingWeekly || weeklyCooldown.disabled)) handleRegenerateWeekly(); }}
                                        style={{ 
                                            padding: "2px 8px", 
                                            fontSize: "0.9em", 
                                            border: "none",
                                            cursor: (isRegeneratingWeekly || weeklyCooldown.disabled) ? "not-allowed" : "pointer",
                                            opacity: (isRegeneratingWeekly || weeklyCooldown.disabled) ? 0.5 : 0.8,
                                            transition: "opacity 0.2s"
                                        }}
                                        title={weeklyCooldown.tooltip}
                                    >
                                        <i className={`material-icons ${isRegeneratingWeekly ? 'icon-spin' : ''}`} style={{ fontSize: 14 }}>
                                            {isRegeneratingWeekly ? 'sync' : 'refresh'}
                                        </i>
                                        {isRegeneratingWeekly ? (
                                            <span className="loading-dots d-inline-flex ms-1">
                                                Regenerating
                                                <span>.</span><span>.</span><span>.</span>
                                            </span>
                                        ) : 'Regenerate'}
                                    </button>
                                </div>
                            </div>
                        )}

                        {activeTab === "breaking" && breakingNews && (
                            <div className="card-body">
                                <div
                                    className="card-text"
                                    style={{ fontSize: "1.08em", color: "inherit" }}
                                    dangerouslySetInnerHTML={{ __html: breakingNews.summary_text }}
                                />
                                <div className="mt-3 pt-2 d-flex justify-content-between align-items-center border-top border-secondary" style={{ fontSize: "0.85em", color: "inherit" }}>
                                    <span className="text-muted">Generated at {formatDate(breakingNews.created_at)}</span>
                                    <span className="text-muted">{breakingNews.ai_model}</span>
                                    <button 
                                        className="btn btn-sm text-muted d-flex align-items-center gap-1"
                                        onClick={() => { if (!(isRegeneratingBreaking || breakingCooldown.disabled)) handleRegenerateBreaking(); }}
                                        style={{ 
                                            padding: "2px 8px", 
                                            fontSize: "0.9em", 
                                            border: "none",
                                            cursor: (isRegeneratingBreaking || breakingCooldown.disabled) ? "not-allowed" : "pointer",
                                            opacity: (isRegeneratingBreaking || breakingCooldown.disabled) ? 0.5 : 0.8,
                                            transition: "opacity 0.2s"
                                        }}
                                        title={breakingCooldown.tooltip}
                                    >
                                        <i className={`material-icons ${isRegeneratingBreaking ? 'icon-spin' : ''}`} style={{ fontSize: 14 }}>
                                            {isRegeneratingBreaking ? 'sync' : 'refresh'}
                                        </i>
                                        {isRegeneratingBreaking ? (
                                            <span className="loading-dots d-inline-flex ms-1">
                                                Regenerating
                                                <span>.</span><span>.</span><span>.</span>
                                            </span>
                                        ) : 'Regenerate'}
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

const mapStateToProps = (state) => {
    let isEnabled = state.profile?.typewriter_enabled;
    if (isEnabled === undefined) {
        isEnabled = state.auth?.user?.userprofile?.typewriter_enabled;
    }
    return {
        typewriterEnabled: isEnabled !== false
    };
};

export default connect(mapStateToProps, { getWeeklySummary, getBreakingNews, createMessage, getSummaryConfig, regenerateWeeklySummary, regenerateBreakingNews })(WeeklyBreaking);