import type { PatternRef } from './types';

/** Readable name of a finding: the last segment of its URL path (decoded), else the host. */
export function findingTitle(url: string): string {
    try {
        const { hostname, pathname } = new URL(url);
        const last = pathname.split('/').filter(Boolean).pop();
        return last ? decodeURIComponent(last) : hostname;
    } catch {
        return url;
    }
}

/**
 * The JavaScript RegExp for a pattern, or the error message. The server checks patterns with Python `re`; the two
 * agree on everything the templates use, so this is a preview, the server stays the judge.
 */
export function compilePattern(source: string, flags = 'gi'): RegExp | string {
    try {
        return new RegExp(source, flags);
    } catch (e) {
        return e instanceof Error ? e.message : 'Invalid regular expression';
    }
}

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export interface Segment {
    text: string;
    match: boolean;
}

/** `text` cut into matching / non-matching parts for a pattern (plain keywords match case-insensitively). */
export function splitMatches(text: string, pattern: Pick<PatternRef, 'name' | 'is_regex'>, max = 500): { segments: Segment[]; count: number } {
    const regex = compilePattern(pattern.is_regex ? pattern.name : escapeRegExp(pattern.name));
    if (typeof regex === 'string' || !pattern.name) return { segments: [{ text, match: false }], count: 0 };
    const segments: Segment[] = [];
    let last = 0;
    let count = 0;
    for (const m of text.matchAll(regex)) {
        if (m[0] === '' || count >= max) break;
        const start = m.index ?? 0;
        if (start > last) segments.push({ text: text.slice(last, start), match: false });
        segments.push({ text: m[0], match: true });
        last = start + m[0].length;
        count += 1;
    }
    if (last < text.length) segments.push({ text: text.slice(last), match: false });
    return { segments, count };
}

/** Save `text` as a file. */
export function downloadText(filename: string, text: string): void {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
}
