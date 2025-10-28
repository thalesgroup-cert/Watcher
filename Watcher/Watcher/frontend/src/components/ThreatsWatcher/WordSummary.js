import React, { useEffect, useState } from "react";
import PropTypes from "prop-types";
import { connect } from "react-redux";
import { getWordSummary, generateWordSummary } from "../../actions/Common";

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

const WordSummary = ({ word, getWordSummary, generateWordSummary }) => {
    const [summary, setSummary] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [errorType, setErrorType] = useState(null);
    const [displayHTML, setDisplayHTML] = useState("");
    const [typing, setTyping] = useState(true);
    const [postsCount, setPostsCount] = useState(0);

    // Typing effect
    useEffect(() => {
        if (summary?.summary_text) {
            let i = 0;
            let currentText = "";
            let timeoutId;
            function write() {
                if (i < summary.summary_text.length) {
                    currentText += summary.summary_text.charAt(i);
                    setDisplayHTML(convertTextToHTML(currentText));
                    i++;
                    timeoutId = setTimeout(write, 12);
                } else {
                    setDisplayHTML(convertTextToHTML(currentText));
                    setTyping(false);
                }
            }
            setTyping(true);
            setDisplayHTML("");
            write();
            return () => clearTimeout(timeoutId);
        }
    }, [summary?.summary_text]);

    useEffect(() => {
        setLoading(true);
        setError(null);
        setErrorType(null);
        setDisplayHTML("");
        setTyping(true);
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
                message: `The keyword "${word}" is not currently trending in our database.`
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

    return (
        <div style={{ 
            height: '100%', 
            display: 'flex', 
            flexDirection: 'column',
            padding: '20px'
        }}>
            <div
                className="word-summary card bg-secondary border-0 shadow-lg"
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
                </div>

                {/* Body */}
                <div
                    className="px-4 py-4 bg-secondary"
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
                                className="mb-3"
                                style={{
                                    fontSize: "1.08em",
                                    color: "#fff",
                                    background: "#282c34",
                                    borderRadius: "0.7em",
                                    padding: "1.3em 1em 1.1em 1em",
                                    position: "relative",
                                    lineHeight: 1.7,
                                    boxShadow: "0 2px 10px #0002",
                                    flex: 1,
                                    overflow: 'auto',
                                    whiteSpace: 'pre-line'
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
                                    color: "#fff",
                                    fontSize: "0.93em",
                                    marginTop: "8px",
                                    display: "flex",
                                    justifyContent: "space-between",
                                    flexShrink: 0
                                }}
                            >
                                <span>
                                    Generated at {formatDate(summary.created_at)}
                                </span>
                                <span>
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
    generateWordSummary: PropTypes.func.isRequired
};

export default connect(null, { getWordSummary, generateWordSummary })(WordSummary);