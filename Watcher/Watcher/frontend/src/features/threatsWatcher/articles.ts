import { useCallback, useState } from 'react';

const SEGMENT_NOISE = /\.(html?|php|aspx?|jsp|xml|rss|amp)$/i;
// Parts of an address that say where the article is, not what it is about
const GENERIC = new Set(['post', 'posts', 'article', 'articles', 'news', 'blog', 'blogs', 'profile', 'item', 'entry', 'story', 'stories', 'view', 'read', 'feed', 'index', 'detail', 'details']);

/** A readable title from the address of an article: its last meaningful part, "grand-theft-auto-hack.html" -> "Grand theft auto hack". */
export function articleTitle(url: string): string {
    let parts: string[];
    try {
        parts = new URL(url).pathname.split('/').filter(Boolean);
    } catch {
        return url;
    }
    const clean = (segment: string) => {
        let text = segment;
        try {
            text = decodeURIComponent(segment);
        } catch {
            // Not valid percent-encoding: keep the segment as it is.
        }
        return text.replace(SEGMENT_NOISE, '').replace(/[-_+]+/g, ' ').trim();
    };
    // From the end: the first part that reads like words (not a number, an id or a year)
    for (let i = parts.length - 1; i >= 0; i--) {
        const text = clean(parts[i]);
        // A post or article number such as "3n2lsf3pfea27" is not a title
        const isId = /^[a-z0-9]{8,}$/i.test(text) && /\d/.test(text);
        if (text.length >= 4 && /[a-z]{3}/i.test(text) && !isId && !GENERIC.has(text.toLowerCase())) return text.charAt(0).toUpperCase() + text.slice(1);
    }
    return parts.length ? clean(parts[parts.length - 1]) || url : 'Home page';
}

const KEY = 'watcher.articles.read';
const MAX = 1500;

function load(): string[] {
    try {
        const raw = JSON.parse(localStorage.getItem(KEY) ?? '[]') as unknown;
        return Array.isArray(raw) ? raw.filter((u): u is string => typeof u === 'string') : [];
    } catch {
        return [];
    }
}

/** The articles this browser has opened from Watcher, so they can be told apart in a list. Kept on the browser only. */
export function useReadArticles() {
    const [read, setRead] = useState<Set<string>>(() => new Set(load()));
    const mark = useCallback((url: string) => {
        setRead((previous) => {
            if (previous.has(url)) return previous;
            const next = new Set(previous).add(url);
            try {
                localStorage.setItem(KEY, JSON.stringify([...next].slice(-MAX)));
            } catch {
                // Storage blocked: the mark lasts for this visit.
            }
            return next;
        });
    }, []);
    return { isRead: (url: string) => read.has(url), mark };
}
