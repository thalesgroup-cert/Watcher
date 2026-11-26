import { useId } from 'react';

/** The eye of the Watcher logo (Watcher-logo-documentation.png) as a vector: an almond, an iris ring and a pupil. */
const EYE_PATH = 'M6 40 C 30 10, 90 10, 114 40 C 90 70, 30 70, 6 40 Z';

/**
 * The markup of the eye, for what is built outside React (the ripple of a click). `maskId` must be unique in the page:
 * the pupil has a small highlight cut out of it.
 */
export const eyeMarkup = (maskId: string) =>
    `<svg viewBox="0 0 120 80" aria-hidden="true"><defs><mask id="${maskId}"><rect x="-20" y="-20" width="160" height="120" fill="#fff"/><circle cx="54" cy="27" r="5.5" fill="#000"/></mask></defs>` +
    `<path d="${EYE_PATH}" fill="none" stroke="currentColor" stroke-width="7" stroke-linejoin="round"/>` +
    `<g class="iris"><circle cx="60" cy="37" r="23" fill="none" stroke="currentColor" stroke-width="6"/><circle cx="60" cy="34" r="14" fill="currentColor" mask="url(#${maskId})"/>` +
    `<path d="M48 49 Q 60 57 72 49" fill="none" stroke="currentColor" stroke-width="4.5" stroke-linecap="round"/></g></svg>`;

/** Rays around the eye of a ripple: twelve, the long ones every 60 degrees. */
export const raysMarkup = () =>
    `<svg viewBox="0 0 200 200" aria-hidden="true">${Array.from({ length: 12 }, (_, i) => i * 30)
        .map((angle) => `<line x1="100" y1="58" x2="100" y2="${angle % 60 === 0 ? 22 : 36}" stroke="currentColor" stroke-width="5" stroke-linecap="round" transform="rotate(${angle} 100 100)"/>`)
        .join('')}</svg>`;

/** The eye in one colour (the one of the text around it). Its iris is the element `.iris`, which a style can shift. */
export function WatcherMark({ className }: { className?: string }) {
    const maskId = `watcher-mark-${useId().replace(/:/g, '')}`;
    return (
        <svg viewBox="0 0 120 80" className={className} aria-hidden="true">
            <defs>
                <mask id={maskId}>
                    <rect x="-20" y="-20" width="160" height="120" fill="#fff" />
                    <circle cx="54" cy="27" r="5.5" fill="#000" />
                </mask>
            </defs>
            <path d={EYE_PATH} fill="none" stroke="currentColor" strokeWidth="7" strokeLinejoin="round" />
            <g className="iris">
                <circle cx="60" cy="37" r="23" fill="none" stroke="currentColor" strokeWidth="6" />
                <circle cx="60" cy="34" r="14" fill="currentColor" mask={`url(#${maskId})`} />
                <path d="M48 49 Q 60 57 72 49" fill="none" stroke="currentColor" strokeWidth="4.5" strokeLinecap="round" />
            </g>
        </svg>
    );
}
