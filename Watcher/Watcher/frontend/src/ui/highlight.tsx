import { useEffect, type RefObject } from 'react';
import { GlobalStyles, useTheme } from '@mui/material';
import { alpha } from '@mui/material/styles';

/** Name of the highlight in the browser's registry, and in the `::highlight()` rule below. */
const NAME = 'search-hit';

interface HighlightRegistry {
    set(name: string, highlight: unknown): void;
    delete(name: string): void;
}

const registry = () => (CSS as unknown as { highlights?: HighlightRegistry }).highlights;
const highlightClass = () => (globalThis as unknown as { Highlight?: new (...ranges: Range[]) => unknown }).Highlight;

/**
 * Marks every occurrence of `term` (case-insensitive) in the rows of a table, with the browser's CSS Custom Highlight
 * API. The page is not rewritten, so it works in the text of any cell, whatever component draws it. A browser that
 * does not have the API shows the rows without marks.
 *
 * `version` is anything that changes when the rows change (the rows themselves), so the marks follow the new rows.
 */
export function useSearchHighlight(container: RefObject<HTMLElement | null>, term: string | undefined, version: unknown) {
    useEffect(() => {
        const highlights = registry();
        const Highlight = highlightClass();
        const needle = term?.trim().toLowerCase();
        const body = container.current?.querySelector('tbody');
        if (!highlights || !Highlight || !needle || !body) return;

        const ranges: Range[] = [];
        const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
            const text = (node.nodeValue ?? '').toLowerCase();
            for (let at = text.indexOf(needle); at !== -1; at = text.indexOf(needle, at + needle.length)) {
                const range = new Range();
                range.setStart(node, at);
                range.setEnd(node, at + needle.length);
                ranges.push(range);
            }
        }
        highlights.set(NAME, new Highlight(...ranges));
        return () => highlights.delete(NAME);
    }, [container, term, version]);
}

/** The colour of the marks: the warning colour of the theme, soft enough to read the text through it. */
export function SearchHighlightStyle() {
    const theme = useTheme();
    return <GlobalStyles styles={{ [`::highlight(${NAME})`]: { backgroundColor: alpha(theme.palette.warning.main, 0.45), color: 'inherit' } }} />;
}
