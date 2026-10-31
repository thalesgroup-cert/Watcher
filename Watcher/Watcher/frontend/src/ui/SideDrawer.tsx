import { useEffect, useId, useRef, type ReactNode } from 'react';
import { alpha, Drawer, useMediaQuery, useTheme } from '@mui/material';
import { create } from 'zustand';

/** Gap between the docked inspector and the edges of the window. */
export const INSPECTOR_GAP = 12;

interface InspectorState {
    /** Width of every docked inspector that is open, by drawer id. */
    open: Record<string, number>;
    set: (id: string, width: number | null) => void;
}

/** Docked inspectors, so the shell makes room for them next to the list. */
export const useInspectorStore = create<InspectorState>((set) => ({
    open: {},
    set: (id, width) =>
        set((s) => {
            const open = { ...s.open };
            if (width === null) delete open[id];
            else open[id] = width;
            return { open };
        }),
}));

/** Room the open inspector takes on the right of the page (0 when none is docked). */
export const useInspectorWidth = () => useInspectorStore((s) => Math.max(0, ...Object.values(s.open)));

interface SideDrawerProps {
    open: boolean;
    onClose: () => void;
    /** id of the drawer title, for screen readers. */
    labelledBy: string;
    children: ReactNode;
    width?: number;
}

/**
 * Inspector of one object (its details, its history). On a wide screen it is docked next to the list, which makes room
 * for it: no backdrop, the rows stay clickable, so going from one object to the next is one click. On a narrow screen
 * it is a full-height panel over the page.
 */
export function SideDrawer({ open, onClose, labelledBy, children, width = 480 }: SideDrawerProps) {
    const theme = useTheme();
    const docked = useMediaQuery(theme.breakpoints.up('lg'));
    const id = useId();
    const setDocked = useInspectorStore((s) => s.set);
    const paperRef = useRef<HTMLDivElement>(null);
    const dark = theme.palette.mode === 'dark';

    useEffect(() => {
        if (!open || !docked) return;
        setDocked(id, width);
        return () => setDocked(id, null);
    }, [open, docked, width, id, setDocked]);

    // A docked inspector is not a modal: Escape closes it, unless a dialog or a menu is open over it (they close first).
    useEffect(() => {
        if (!open || !docked) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && !document.querySelector('.MuiModal-root:not(.MuiModal-hidden)')) onClose();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open, docked, onClose]);

    // Keyboard users land in the inspector when it opens (not when it only changes object).
    const wasOpen = useRef(open);
    useEffect(() => {
        if (open && !wasOpen.current && docked) paperRef.current?.focus({ preventScroll: true });
        wasOpen.current = open;
    }, [open, docked]);

    if (!docked) {
        return (
            <Drawer
                anchor="right"
                open={open}
                onClose={onClose}
                slotProps={{ paper: { sx: { width: { xs: '100%', sm: width } }, 'aria-labelledby': labelledBy } as object }}
            >
                {children}
            </Drawer>
        );
    }

    return (
        <Drawer
            anchor="right"
            variant="persistent"
            open={open}
            slotProps={{
                paper: {
                    ref: paperRef,
                    tabIndex: -1,
                    role: 'complementary',
                    'aria-labelledby': labelledBy,
                    'data-inspector': 'docked',
                    sx: {
                        width,
                        top: INSPECTOR_GAP,
                        right: INSPECTOR_GAP,
                        height: `calc(100% - ${INSPECTOR_GAP * 2}px)`,
                        borderRadius: 3,
                        border: 1,
                        borderColor: 'divider',
                        overflow: 'hidden',
                        outline: 'none',
                        boxShadow: dark
                            ? `0 18px 48px ${alpha('#000', 0.55)}, 0 0 0 1px ${alpha(theme.palette.primary.main, 0.08)}`
                            : `0 18px 48px ${alpha(theme.palette.primary.dark, 0.14)}`,
                        // A thin accent on the edge that faces the list: it reads as part of the page, not a layer.
                        '&::before': {
                            content: '""',
                            position: 'absolute',
                            insetBlock: 16,
                            left: 0,
                            width: 3,
                            borderRadius: '0 3px 3px 0',
                            bgcolor: 'primary.main',
                            opacity: 0.7,
                        },
                    },
                } as object,
            }}
        >
            {children}
        </Drawer>
    );
}
