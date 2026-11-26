import { useEffect, useState } from 'react';

/** Width of an element, followed as the window or the layout changes (a callback ref: the element may appear later). */
export function useWidth<T extends HTMLElement>() {
    const [el, setEl] = useState<T | null>(null);
    const [width, setWidth] = useState(0);
    useEffect(() => {
        if (!el) return;
        const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
        observer.observe(el);
        return () => observer.disconnect();
    }, [el]);
    return [setEl, width] as const;
}
