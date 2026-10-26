import React, { useEffect, useState } from "react";
import PropTypes from "prop-types";
import { connect } from "react-redux";
import { getWordSummary, generateWordSummary, getSummaryConfig, regenerateWordSummary } from "../../actions/Common";
import { createMessage } from "../../actions/messages"

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

function convertTextToHTML(text) {
    if (!text) return "";
    let html = text.replace(
        /(CVE-\d{4}-\d{4,7})\s*\((https:\/\/[^)]+)\)/g,
        '<a href="$2" target="_blank" rel="noopener noreferrer" class="cve-link">$1</a>'
    );
    html = html.replace(/\n/g, "<br/>");
    html = html.replace(/  /g, " &nbsp;");
    return html;
}

const WordSummary = ({ word, getWordSummary, generateWordSummary, typewriterEnabled, createMessage, getSummaryConfig, regenerateWordSummary }) => {
    const [summary, setSummary] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [errorType, setErrorType] = useState(null);
    const [displayHTML, setDisplayHTML] = useState("");
    const [typing, setTyping] = useState(false);
    const [postsCount, setPostsCount] = useState(0);
    const [isRegenerating, setIsRegenerating] = useState(false);

    const [cooldownMinutes, setCooldownMinutes] = useState(15);
    const [currentTime, setCurrentTime] = useState(Date.now());

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

    const handleRegenerate = async () => {
        setIsRegenerating(true);
        try {
            const data = await regenerateWordSummary(word);
            if (data.success && data.data) {
                setSummary(data.data);
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
            setIsRegenerating(false);
        }
    };

    useEffect(() => {
        if (!summary?.summary_text) {
            setDisplayHTML("");
            return;
        }

        if (!typewriterEnabled) {
            setDisplayHTML(convertTextToHTML(summary.summary_text));
            setTyping(false);
            return;
        }
        
        const text = summary.summary_text;
        // Tuning: 3 = max characters per tick (lower = more like real typing, 1 = character by character), 4000 = target duration in ms (higher = calmer display)
        const step = Math.min(3, Math.max(1, Math.ceil(text.length / (4000 / 12))));
        let i = 0;
        let timeoutId;
        function write() {
            i = Math.min(text.length, i + step);
            setDisplayHTML(convertTextToHTML(text.slice(0, i)));
            if (i < text.length) {
                timeoutId = setTimeout(write, 12);
            } else {
                setTyping(false);
            }
        }
        setTyping(true);
        setDisplayHTML("");
        write();
        return () => clearTimeout(timeoutId);
    }, [summary?.summary_text, typewriterEnabled]);

    useEffect(() => {
        setLoading(true);
        setError(null);
        setErrorType(null);
        setDisplayHTML("");
        setTyping(false);
        setPostsCount(0);

        getWordSummary(word)
            .then(data => {
                if (Array.isArray(data) && data.length > 0 && data[0].summary_text?.trim()) {
                    setSummary(data[0]);
                    setLoading(false);
                } else {
                    return generateWordSummary(word);
                }
            })
            .then(data => {
                if (data && data.summary_text) {
                    setSummary(data);
                    setLoading(false);
                }
            })
            .catch(err => {
                let errorMessage = 'Failed to load summary';
                let errorType = 'unknown';
                let postsCount = 0;

                if (err.data) {
                    errorType = err.data.error || 'unknown';
                    errorMessage = err.data.message || errorMessage;
                    postsCount = err.data.posts_count || 0;
                }

                setLoading(false);
                setError(errorMessage);
                setErrorType(errorType);
                setTyping(false);
                setPostsCount(postsCount);
            });
    }, [word, getWordSummary, generateWordSummary]);

    function renderErrorState() {
        const errorConfig = {
            'not_found': {
                title: 'Keyword Not Found',
                message: `The keyword "${word}" was not found in Trendy Words or Monitored Keywords.`
            },
            'insufficient_data': {
                title: 'Insufficient Data',
                message: `Not enough data to generate an AI summary for "${word}".`,
                detail: `Currently ${postsCount} post${postsCount !== 1 ? 's' : ''} available (minimum 3 required).`
            },
            'generation_failed': {
                title: 'Generation Failed',
                message: 'The AI summary generation process encountered an error.'
            },
            'generation_error': {
                title: 'Technical Error',
                message: error
            },
            'unknown': {
                title: 'Error',
                message: error || 'An unknown error occurred'
            }
        };

        const config = errorConfig[errorType] || errorConfig['unknown'];

        return (
            <div style={{ padding: "2.4em 0", textAlign: "center", color: "#fff" }}>
                <div style={{ fontWeight: 600, fontSize: "1.08em", marginBottom: "0.8em" }}>{config.title}</div>
                <div className="text-muted mb-1">{config.message}</div>
                {config.detail && (
                    <div className="text-muted small">{config.detail}</div>
                )}
            </div>
        );
    }

    let isRegenerateDisabled = false;
    let regenerateTooltip = "Force AI to regenerate this summary";

    if (summary && (summary.updated_at || summary.created_at)) {
        const lastUpdate = new Date(summary.updated_at || summary.created_at).getTime();
        const elapsedMinutes = (currentTime - lastUpdate) / (1000 * 60);

        if (elapsedMinutes < cooldownMinutes) {
            isRegenerateDisabled = true;
            const remainingMinutes = Math.ceil(cooldownMinutes - elapsedMinutes);
            regenerateTooltip = `Please wait ${remainingMinutes} minute(s) before the next regeneration.`;
        }
    }
    const buttonShouldBeDisabled = isRegenerating || loading || !!error || isRegenerateDisabled;

    return (
        <div style={{ 
            height: '100%', 
            display: 'flex', 
            flexDirection: 'column',
            padding: '20px'
        }}>
            <div
                className="word-summary card border-0 shadow-lg bg-transparent"
                style={{
                    borderRadius: "1em",
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden'
                }}
            >
                {/* Header */}
                <div
                    className="d-flex align-items-center justify-content-between px-4 py-3 bg-primary"
                    style={{
                        borderRadius: "1em 1em 0 0",
                        borderBottom: "none",
                        fontWeight: "bold",
                        color: "#fff",
                        flexShrink: 0
                    }}
                >
                    <span style={{
                        fontWeight: "bold",
                        fontSize: "1.15em",
                        letterSpacing: ".01em"
                    }}>
                        Word Summary for {word}
                    </span>
                    <button 
                       className="btn btn-sm text-muted d-flex align-items-center gap-1"
                        onClick={() => { if (!buttonShouldBeDisabled) handleRegenerate(); }}
                        style={{ 
                            padding: "2px 8px", 
                            fontSize: "0.85em", 
                            border: "1px solid rgba(255,255,255,0.4)",
                            cursor: buttonShouldBeDisabled ? "not-allowed" : "pointer",
                            opacity: buttonShouldBeDisabled ? 0.5 : 1,
                            transition: "opacity 0.2s"
                        }}
                        title={regenerateTooltip}
                    >
                        <i className={`material-icons ${isRegenerating ? 'icon-spin' : ''}`} style={{ fontSize: 16 }}>
                            {isRegenerating ? 'sync' : 'refresh'}
                        </i>
                        {isRegenerating ? (
                            <span className="d-flex align-items-center">
                                Regenerating
                                <span className="loading-dots d-inline-flex ms-1">
                                    <span>.</span><span></span><span>.</span>
                                </span>
                            </span>
                        ) : 'Regenerate'}
                    </button>
                </div>

                {/* Body */}
                <div
                    className="px-4 py-4"
                    style={{
                        borderRadius: "0 0 1em 1em",
                        flex: 1,
                        display: 'flex',
                        flexDirection: 'column',
                        minHeight: 0,
                        overflow: 'auto'
                    }}
                >
                    {loading && (
                        <div className="text-center py-5">
                            <span className="loading-dots" style={{ fontSize: "2em", color: "#ffc107" }}>
                                <span>.</span>
                                <span>.</span>
                                <span>.</span>
                            </span>
                            <div className="text-muted mt-3" style={{ fontSize: "1.04em" }}>
                                Loading summary for <strong>{word}</strong>
                            </div>
                        </div>
                    )}

                    {error && renderErrorState()}

                    {!loading && !error && summary && (
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                            <div
                                className="mb-3 p-3 rounded shadow-sm"
                                style={{
                                    fontSize: "1.08em",
                                    position: "relative",
                                    lineHeight: 1.7,
                                    flex: 1,
                                    overflow: 'auto',
                                    whiteSpace: 'pre-line',
                                    background: "rgba(128, 128, 128, 0.15)",
                                    color: "inherit"
                                }}
                            >
                                <span dangerouslySetInnerHTML={{ __html: displayHTML }} />
                                {typing && (
                                    <span
                                        className="blinking-cursor"
                                        style={{
                                            fontWeight: "bold",
                                            fontSize: "1.14em",
                                            marginLeft: "2px",
                                            color: "#ffc107"
                                        }}
                                    >|</span>
                                )}
                            </div>
                            <div
                                style={{
                                    color: "inherit",
                                    fontSize: "0.93em",
                                    marginTop: "8px",
                                    display: "flex",
                                    justifyContent: "space-between",
                                    flexShrink: 0
                                }}
                            >
                                <span className="text-muted">
                                    Generated at {formatDate(summary.created_at)}
                                </span>
                                <span className="text-muted">
                                    {summary.ai_model}
                                </span>
                                <span className="text-muted">
                                    Updated at {formatDate(summary.updated_at)}
                                </span>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <style>
                {`
                @keyframes blink { 0% { opacity: 1; } 50% { opacity: 0; } 100% { opacity: 1; } }
                @keyframes dotsBlink { 0%, 80%, 100% { opacity: 1; } 40% { opacity: 0; } }
                @keyframes spin { 100% { transform: rotate(360deg); } }
                .icon-spin { animation: spin 1s linear infinite; }
                
                .blinking-cursor { animation: blink 1s infinite; }
                
                .loading-dots span {
                    animation: dotsBlink 1.2s infinite;
                    margin-right: 2px;
                }
                .loading-dots span:nth-child(2) { animation-delay: .3s; }
                .loading-dots span:nth-child(3) { animation-delay: .6s; }
                
                .word-summary .cve-link {
                    color: #ffc107;
                    text-decoration: underline;
                    font-weight: 500;
                    transition: color 0.2s;
                }
                .word-summary .cve-link:hover {
                    color: #ff9800;
                }
                `}
            </style>
        </div>
    );
};

WordSummary.propTypes = {
    word: PropTypes.string.isRequired,
    getWordSummary: PropTypes.func.isRequired,
    generateWordSummary: PropTypes.func.isRequired,
    createMessage: PropTypes.func.isRequired,
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

export default connect(mapStateToProps, { getWordSummary, generateWordSummary, createMessage, getSummaryConfig, regenerateWordSummary })(WordSummary);