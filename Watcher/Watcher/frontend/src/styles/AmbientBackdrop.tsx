import { useEffect, useRef } from 'react';
import { alpha, Box, keyframes, useTheme } from '@mui/material';
import { prefersReducedMotion, type Effects } from './effects';
import { eyeMarkup, raysMarkup, WatcherMark } from './WatcherMark';

// What it shows: three soft glows, a spotlight under the pointer, a big eye of the Watcher logo at the bottom right whose
// iris looks at the pointer, and the same eye springing out of every click, with rings and rays.
//
// How it is kept light (the backdrop is under every page, so it must cost almost nothing):
// - glows and spotlight are plain radial gradients, moved with `transform` only (the graphics processor does it, nothing
//   is repainted); no blur filter, no blend mode, no noise texture;
// - the pointer is read by one passive listener that writes four CSS variables at most once per frame;
// - the iris and the spotlight follow through CSS transitions, not through a script loop;
// - a click ripple is one element created on the spot, removed when its animation ends, three at a time at most;
// - everything stops while the tab is hidden, and the still version replaces the motion when the system asks for less.
const MAX_RIPPLES = 3;

const drift1 = keyframes`
    from { transform: translate3d(0, 0, 0) scale(1); }
    to { transform: translate3d(14vmax, 18vmax, 0) scale(1.1); }
`;
const drift2 = keyframes`
    from { transform: translate3d(0, 0, 0) scale(1); }
    to { transform: translate3d(-20vmax, 6vmax, 0) scale(1.12); }
`;
const drift3 = keyframes`
    from { transform: translate3d(0, 0, 0) scale(1); }
    to { transform: translate3d(12vmax, -14vmax, 0) scale(0.94); }
`;
const breathe = keyframes`
    0%, 100% { opacity: 0.85; transform: scale(1); }
    50% { opacity: 1; transform: scale(1.02); }
`;
const ring = keyframes`
    from { transform: scale(0.08); opacity: 1; }
    to { transform: scale(1); opacity: 0; }
`;
const rays = keyframes`
    0% { transform: scale(0.3) rotate(-15deg); opacity: 0; }
    20% { opacity: 1; }
    100% { transform: scale(1.1) rotate(10deg); opacity: 0; }
`;
const mark = keyframes`
    0% { transform: scale(0.4); opacity: 0; }
    22% { transform: scale(1.1); opacity: 1; }
    100% { transform: scale(1) translateY(-10px); opacity: 0; }
`;

let rippleCount = 0;

export function AmbientBackdrop({ level }: { level: Exclude<Effects, 'off'> }) {
    const theme = useTheme();
    const layer = useRef<HTMLDivElement>(null);
    // The system asking for less motion gives the still version, whatever the choice.
    const moving = level === 'full' && !prefersReducedMotion();
    const { primary, warning, info } = theme.palette;
    const strength = theme.palette.mode === 'dark' ? 1 : 0.75;

    useEffect(() => {
        const node = layer.current;
        if (!node) return undefined;

        // A hidden tab runs no animation at all.
        const onVisibility = () => node.setAttribute('data-paused', String(document.hidden));
        document.addEventListener('visibilitychange', onVisibility);
        onVisibility();

        if (!moving) return () => document.removeEventListener('visibilitychange', onVisibility);

        let frame = 0;
        let x = window.innerWidth / 2;
        let y = window.innerHeight * 0.4;
        const flush = () => {
            frame = 0;
            const { innerWidth: w, innerHeight: h } = window;
            node.style.setProperty('--px', `${x}px`);
            node.style.setProperty('--py', `${y}px`);
            // -1 .. 1 across the window: where the iris looks
            node.style.setProperty('--gx', ((x / w) * 2 - 1).toFixed(3));
            node.style.setProperty('--gy', ((y / h) * 2 - 1).toFixed(3));
        };
        const onMove = (e: PointerEvent) => {
            x = e.clientX;
            y = e.clientY;
            if (!frame && !document.hidden) frame = requestAnimationFrame(flush);
        };
        const onDown = (e: PointerEvent) => {
            if (e.button !== 0 || document.hidden) return;
            const ripples = node.querySelectorAll('.ripple');
            if (ripples.length >= MAX_RIPPLES) ripples[0].remove();
            const drop = document.createElement('span');
            drop.className = 'ripple';
            drop.style.left = `${e.clientX}px`;
            drop.style.top = `${e.clientY}px`;
            // Fixed markup built here, nothing from the page or the user goes into it
            drop.innerHTML = `<span class="ring"></span><span class="ring late"></span><span class="rays">${raysMarkup()}</span><span class="eye">${eyeMarkup(`ripple-eye-${rippleCount++}`)}</span>`;
            // The eye is the last to fade: when it is done the whole ripple goes
            drop.querySelector('.eye')?.addEventListener('animationend', () => drop.remove(), { once: true });
            node.appendChild(drop);
        };
        document.addEventListener('pointermove', onMove, { passive: true });
        document.addEventListener('pointerdown', onDown, { passive: true });
        return () => {
            document.removeEventListener('visibilitychange', onVisibility);
            document.removeEventListener('pointermove', onMove);
            document.removeEventListener('pointerdown', onDown);
            if (frame) cancelAnimationFrame(frame);
            node.querySelectorAll('.ripple').forEach((drop) => drop.remove());
        };
    }, [moving]);

    const glow = (color: string, from: number) => `radial-gradient(circle, ${alpha(color, from * strength)} 0%, transparent 62%)`;

    return (
        <Box
            ref={layer}
            aria-hidden
            data-testid="ambient-backdrop"
            data-effects={moving ? 'full' : 'calm'}
            sx={{
                position: 'fixed',
                inset: 0,
                zIndex: 0,
                pointerEvents: 'none',
                overflow: 'hidden',
                contain: 'strict',
                '--px': '50vw',
                '--py': '40vh',
                '--gx': 0,
                '--gy': 0,
                '&[data-paused="true"] *': { animationPlayState: 'paused !important' },
                '& .glow': { position: 'absolute', width: '62vmax', height: '62vmax', borderRadius: '50%', willChange: moving ? 'transform' : 'auto' },
                '& .glow-1': { left: '-18vmax', top: '-24vmax', background: glow(primary.main, 0.28), ...(moving && { animation: `${drift1} 38s ease-in-out infinite alternate` }) },
                '& .glow-2': { right: '-22vmax', top: '10vmax', background: glow(warning.main, 0.16), ...(moving && { animation: `${drift2} 46s ease-in-out infinite alternate` }) },
                '& .glow-3': { left: '18vmax', bottom: '-34vmax', background: glow(info.main, 0.14), ...(moving && { animation: `${drift3} 52s ease-in-out infinite alternate` }) },
                '& .spot': {
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    width: 640,
                    height: 640,
                    marginLeft: '-320px',
                    marginTop: '-320px',
                    borderRadius: '50%',
                    background: `radial-gradient(circle, ${alpha(primary.main, 0.18 * strength)} 0%, transparent 65%)`,
                    transform: 'translate3d(var(--px), var(--py), 0)',
                    transition: 'transform 0.35s cubic-bezier(0.2, 0.7, 0.3, 1)',
                    willChange: 'transform',
                },
                // The eye of the logo, big and faint at the bottom right: its iris looks at the pointer
                '& .watermark': {
                    position: 'absolute',
                    right: '-6vmax',
                    bottom: '-4vmax',
                    width: '46vmax',
                    color: alpha(primary.main, 0.09 * strength),
                    ...(moving && { animation: `${breathe} 9s ease-in-out infinite` }),
                },
                '& .watermark svg': { display: 'block', width: '100%', height: 'auto', overflow: 'visible' },
                '& .watermark .iris': moving ? { transform: 'translate(calc(var(--gx) * 9px), calc(var(--gy) * 5px))', transition: 'transform 0.6s cubic-bezier(0.2, 0.7, 0.3, 1)' } : {},
                // A click: two rings, rays and the eye, where the pointer is
                '& .ripple': { position: 'absolute', width: 0, height: 0, color: primary.main },
                '& .ripple .ring': {
                    position: 'absolute',
                    left: -170,
                    top: -170,
                    width: 340,
                    height: 340,
                    borderRadius: '50%',
                    border: `3px solid ${alpha(primary.main, 0.7)}`,
                    background: `radial-gradient(circle, ${alpha(primary.main, 0.3)} 0%, transparent 70%)`,
                    animation: `${ring} 1.2s cubic-bezier(0.16, 0.8, 0.3, 1) forwards`,
                    willChange: 'transform, opacity',
                },
                '& .ripple .ring.late': { background: 'none', border: `3px solid ${alpha(primary.main, 0.5)}`, opacity: 0, animationDelay: '0.14s' },
                '& .ripple .rays': { position: 'absolute', left: -100, top: -100, width: 200, height: 200, animation: `${rays} 1s cubic-bezier(0.16, 0.8, 0.3, 1) forwards` },
                '& .ripple .eye': { position: 'absolute', left: -36, top: -24, width: 72, height: 48, animation: `${mark} 1.3s cubic-bezier(0.16, 0.8, 0.3, 1) forwards` },
                '& .ripple svg': { display: 'block', width: '100%', height: '100%' },
            }}
        >
            <span className="glow glow-1" />
            <span className="glow glow-2" />
            <span className="glow glow-3" />
            {moving && <span className="spot" />}
            <span className="watermark">
                <WatcherMark />
            </span>
        </Box>
    );
}
