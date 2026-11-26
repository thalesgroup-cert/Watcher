/**
 * The loading screen: the eye of the logo draws itself, then looks around, over a soft glow. The styles are the ones of the
 * page itself (templates/frontend/index.html), which shows the same screen before the application has loaded: nothing jumps
 * when React takes over.
 */
export function BootSplash() {
    return (
        <div className="boot" role="status" aria-label="Loading Watcher">
            <svg viewBox="0 0 120 80" aria-hidden="true">
                <defs>
                    <mask id="boot-eye">
                        <rect x="-20" y="-20" width="160" height="120" fill="#fff" />
                        <circle cx="54" cy="27" r="5.5" fill="#000" />
                    </mask>
                </defs>
                <path
                    className="lid"
                    pathLength={1}
                    d="M6 40 C 30 10, 90 10, 114 40 C 90 70, 30 70, 6 40 Z"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="5"
                    strokeLinejoin="round"
                />
                <g className="iris">
                    <circle cx="60" cy="37" r="23" fill="none" stroke="currentColor" strokeWidth="5" />
                    <circle cx="60" cy="34" r="14" fill="currentColor" mask="url(#boot-eye)" />
                    <path d="M48 49 Q 60 57 72 49" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
                </g>
            </svg>
            <b>Watcher</b>
            <i />
        </div>
    );
}
