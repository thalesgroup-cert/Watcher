import React, { useEffect, useState, useRef, useCallback } from "react";
import { connect } from "react-redux";
import { getWeeklySummary, getBreakingNews } from "../../actions/Common";

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

const LS_OPEN_KEY = "watcher_localstorage_weeklysummary_open";
const LS_X_KEY = "watcher_localstorage_weeklysummary_X";
const LS_Y_KEY = "watcher_localstorage_weeklysummary_Y";
const LS_TAB_KEY = "watcher_localstorage_weeklysummary_active_tab";
const LS_WEEKLY_READ_KEY = "watcher_localstorage_weekly_read_id";
const LS_BREAKING_READ_KEY = "watcher_localstorage_breaking_read_id";
const CARD_MIN_HEIGHT = 72;
const CARD_WIDTH = 680;
const CARD_MINIMIZED_WIDTH = 470;
const BUBBLE_SIZE = 68;
const MARGIN = 32;
const DRAG_THRESHOLD = 5;

const WeeklyBreaking = ({ getWeeklySummary, getBreakingNews }) => {
    const [weeklyText, setWeeklyText] = useState("");
    const [weeklyDisplayHTML, setWeeklyDisplayHTML] = useState("");
    const [weeklyCreatedAt, setWeeklyCreatedAt] = useState("");
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

    // Typing effect for weekly summary
    useEffect(() => {
        if (!weeklyText) {
            setWeeklyDisplayHTML("");
            return;
        }

        const lastReadId = localStorage.getItem(LS_WEEKLY_READ_KEY);
        if (lastReadId === String(weeklyId)) {
            setWeeklyDisplayHTML(convertCVELinksToHTML(weeklyText));
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
    }, [weeklyText, weeklyId]);

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
        getWeeklySummary()
            .then(data => {
                if (Array.isArray(data) && data.length > 0 && data[0].summary_text?.trim()) {
                    setWeeklyText(data[0].summary_text);
                    setWeeklyCreatedAt(data[0].created_at || "");
                    setWeeklyId(data[0].id);
                } else {
                    setWeeklyText("");
                    setWeeklyCreatedAt("");
                    setWeeklyId(null);
                }
            })
            .catch(() => {
                setWeeklyText("");
                setWeeklyCreatedAt("");
                setWeeklyId(null);
            });

        getBreakingNews()
            .then(data => {
                if (Array.isArray(data) && data.length > 0) {
                    const latest = data
                        .filter(n => n.created_at && isNew(n.created_at) && n.summary_text?.trim())
                        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
                    setBreakingNews(latest || null);
                } else {
                    setBreakingNews(null);
                }
            })
            .catch(() => {
                setBreakingNews(null);
            });
    }, [getWeeklySummary, getBreakingNews]);

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
                    <span className="material-icons" style={{ fontSize: 22, marginRight: 7, verticalAlign: "middle" }}>description</span>
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
                    <span className="material-icons" style={{ fontSize: 22, marginRight: 7, verticalAlign: "middle" }}>bolt</span>
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
            fontSize: isActive ? "1.14em" : "1.06em",
            transition: "background 0.22s, color 0.18s, border-bottom 0.22s, box-shadow 0.16s, transform 0.2s",
            borderBottom: isActive ? "4px solid currentColor" : "2px solid #23272b",
            boxShadow: isActive ? "0 2px 18px 0 rgba(0,0,0,0.3)" : "none",
            padding: isActive ? "1.2em 0 1.05em" : "0.70em 0 0.65em",
            width: tabs.length === 1 ? "100%" : (isActive ? "54%" : "46%"),
            borderRadius: tabs.length === 1
                ? "1em 1em 0 0"
                : (tab.key === "weekly" ? "1em 0 0 0" : "0 1em 0 0"),
            outline: "none",
            zIndex: isActive ? 1 : 0,
            transform: isActive ? "scale(1.02)" : "scale(1)"
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
                        minHeight: 54,
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
                        zIndex: 20
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
                                <div style={{ fontSize: "1.08em", color: "inherit", whiteSpace: "pre-line" }}>
                                    <span dangerouslySetInnerHTML={{ __html: weeklyDisplayHTML }} />
                                    {weeklyDisplayHTML !== convertCVELinksToHTML(weeklyText) && (
                                        <span className="blinking-cursor">|</span>
                                    )}
                                </div>
                                <div className="mt-2" style={{ fontSize: "0.85em", color: "inherit" }}>
                                    Generated at {formatDate(weeklyCreatedAt)}
                                </div>
                            </div>
                        )}

                        {activeTab === "breaking" && breakingNews && (
                            <div className="card-body">
                                <div
                                    className="card-text"
                                    style={{ fontSize: "1.08em", whiteSpace: "pre-line", color: "inherit" }}
                                    dangerouslySetInnerHTML={{ __html: breakingNews.summary_text }}
                                />
                                <div className="mt-2" style={{ fontSize: "0.85em", color: "inherit" }}>
                                    Generated at {formatDate(breakingNews.created_at)}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default connect(null, { getWeeklySummary, getBreakingNews })(WeeklyBreaking);