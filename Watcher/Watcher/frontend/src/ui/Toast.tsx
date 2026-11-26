import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Alert, Box, keyframes } from '@mui/material';
import { closeSnackbar, type CustomContentProps } from 'notistack';

/** How long a floating message stays, in milliseconds, when nothing holds it. */
export const TOAST_DURATION = 3000;

const countdown = keyframes`
    from { transform: scaleX(1); }
    to { transform: scaleX(0); }
`;

const SEVERITY = { success: 'success', error: 'error', warning: 'warning', info: 'info', default: 'info' } as const;

type Hold = 'pointer' | 'window';

/**
 * The floating message: the text, a cross to close it, and a thin bar along its foot that empties while it stays, so
 * the person sees how long is left to read it.
 *
 * The message keeps its own time (the library's auto-hide is off, see `SnackbarProvider` in `App`): it stays while the
 * pointer is over it or the window has no focus, and when nothing holds it any more it goes on with the time that was
 * left, not with a new delay. The bar is one animation for the whole delay that is paused and resumed at the same moments,
 * so it stops and starts again exactly where it was, and ends with the message.
 */
export const Toast = forwardRef<HTMLDivElement, CustomContentProps>(function Toast({ id, message, variant, style }, ref) {
    const severity = SEVERITY[variant] ?? 'info';
    const root = useRef<HTMLDivElement>(null);
    useImperativeHandle(ref, () => root.current as HTMLDivElement);
    const [paused, setPaused] = useState(false);
    // What holds the countdown, and the time left on it
    const holds = useRef<Record<Hold, boolean>>({ pointer: false, window: false });
    const remaining = useRef(TOAST_DURATION);
    const startedAt = useRef(0);
    const timer = useRef<number | undefined>(undefined);

    const start = useCallback(() => {
        startedAt.current = performance.now();
        timer.current = window.setTimeout(() => closeSnackbar(id), remaining.current);
    }, [id]);

    const stop = useCallback(() => {
        if (timer.current === undefined) return;
        window.clearTimeout(timer.current);
        timer.current = undefined;
        remaining.current = Math.max(0, remaining.current - (performance.now() - startedAt.current));
    }, []);

    const hold = useCallback(
        (who: Hold, on: boolean) => {
            const was = holds.current.pointer || holds.current.window;
            holds.current[who] = on;
            const now = holds.current.pointer || holds.current.window;
            if (now && !was) {
                stop();
                setPaused(true);
            } else if (!now && was) {
                start();
                setPaused(false);
            }
        },
        [start, stop],
    );

    useEffect(() => {
        // The library listens on the box around the message, which can be larger than the message itself
        const target = root.current?.closest('.notistack-Snackbar') ?? root.current;
        const enter = () => hold('pointer', true);
        const leave = () => hold('pointer', false);
        const blur = () => hold('window', true);
        const focus = () => hold('window', false);
        if (!holds.current.pointer && !holds.current.window && timer.current === undefined) start();
        target?.addEventListener('mouseenter', enter);
        target?.addEventListener('mouseleave', leave);
        window.addEventListener('blur', blur);
        window.addEventListener('focus', focus);
        return () => {
            stop();
            target?.removeEventListener('mouseenter', enter);
            target?.removeEventListener('mouseleave', leave);
            window.removeEventListener('blur', blur);
            window.removeEventListener('focus', focus);
        };
    }, [hold, start, stop]);

    return (
        <Alert
            ref={root}
            variant="filled"
            severity={severity}
            role={severity === 'error' ? 'alert' : 'status'}
            data-testid={`toast-${severity}`}
            onClose={() => closeSnackbar(id)}
            style={style}
            sx={{ position: 'relative', overflow: 'hidden', minWidth: 280, maxWidth: 480, alignItems: 'center', boxShadow: 3, bgcolor: `${severity}.main`, color: `${severity}.contrastText` }}
        >
            {message}
            <Box
                aria-hidden
                data-testid="toast-timer"
                data-paused={paused}
                sx={{
                    position: 'absolute',
                    left: 0,
                    right: 0,
                    bottom: 0,
                    height: 3,
                    bgcolor: 'rgba(255, 255, 255, 0.55)',
                    transformOrigin: 'left',
                    animation: `${countdown} ${TOAST_DURATION}ms linear forwards`,
                    animationPlayState: paused ? 'paused' : 'running',
                    '@media (prefers-reduced-motion: reduce)': { animation: 'none', transform: 'scaleX(0.5)' },
                }}
            />
        </Alert>
    );
});
