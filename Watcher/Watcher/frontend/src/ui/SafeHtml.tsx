import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { Box, Chip, Link } from '@mui/material';
import type { SxProps, Theme } from '@mui/material/styles';
import ArrowDropDown from '@mui/icons-material/ArrowDropDown';
import { Favicon } from '../features/threatsWatcher/components/Favicon';

/**
 * Shows the HTML of an AI summary (weekly report, breaking news, keyword summary) without ever injecting it.
 *
 * The backend writes Bootstrap-styled HTML (see threats_watcher/summary_manager.py) and the Slack, Citadel and e-mail
 * layouts parse that exact markup, so it stays as it is. Here it is parsed into an inert document and rebuilt as React
 * elements from a whitelist: a few tags, `href` on links only, a few style properties, and the Bootstrap classes the
 * summaries use mapped to MUI. Anything else (scripts, event handlers, iframes, images, unknown attributes) is dropped.
 */

const TAGS = new Set(['div', 'p', 'span', 'strong', 'b', 'em', 'i', 'small', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6']);
/** Removed with their content. */
const DROPPED = new Set(['script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'textarea', 'select', 'svg', 'math', 'template', 'noscript', 'link', 'meta', 'head', 'title']);

const STYLE_PROPS = new Set([
    'border-left', 'border', 'padding', 'padding-left', 'margin-bottom', 'margin-top', 'margin-left', 'margin-right', 'font-size',
    'letter-spacing', 'color', 'background', 'background-color', 'cursor', 'user-select', 'text-align', 'font-weight',
    'font-style', 'gap',
]);
/** Colours, lengths and the keywords of these properties; no url(), expression() or escapes. */
const STYLE_VALUE = /^[\w\s#%.,()\-+/*!]+$/;
const STYLE_FORBIDDEN = /url\s*\(|expression|javascript|@import|var\s*\(/i;

/** The three sizes of a summary: caption (dates, badges), small (details) and body. */
function typeStep(raw: string): string | null {
    const m = /^([\d.]+)(em|rem|%)?$/.exec(raw.trim());
    if (!m) return null;
    const n = m[2] === '%' ? parseFloat(m[1]) / 100 : parseFloat(m[1]);
    return n <= 0.8 ? '0.75rem' : n < 0.9 ? '0.8125rem' : '0.875rem';
}

const camel = (prop: string) => prop.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());

function styleSx(raw: string | null): Record<string, string> {
    const out: Record<string, string> = {};
    for (const declaration of (raw ?? '').split(';')) {
        const i = declaration.indexOf(':');
        if (i < 0) continue;
        const prop = declaration.slice(0, i).trim().toLowerCase();
        const value = declaration.slice(i + 1).trim();
        if (prop === 'font-size') {
            const step = typeStep(value);
            if (step) out.fontSize = step;
        } else if (STYLE_PROPS.has(prop) && STYLE_VALUE.test(value) && !STYLE_FORBIDDEN.test(value)) out[camel(prop)] = value;
    }
    return out;
}

/** Bootstrap spacing steps (1 to 5) in MUI units. */
const STEP: Record<string, number> = { '0': 0, '1': 0.5, '2': 1, '3': 2, '4': 3, '5': 6 };

/** The Bootstrap classes the summaries use, as MUI `sx`. An unknown class does nothing. */
function classSx(classes: string[]): Record<string, unknown> {
    const sx: Record<string, unknown> = {};
    for (const c of classes) {
        const spacing = /^(m|p)([tbxy]?)-([0-5])$/.exec(c);
        if (spacing) {
            sx[`${spacing[1]}${spacing[2]}`] = STEP[spacing[3]];
            continue;
        }
        const gap = /^gap-([0-5])$/.exec(c);
        if (gap) {
            sx.gap = STEP[gap[1]];
            continue;
        }
        switch (c) {
            case 'd-flex': sx.display = 'flex'; break;
            case 'flex-column': sx.flexDirection = 'column'; break;
            case 'justify-content-between': sx.justifyContent = 'space-between'; break;
            case 'align-items-center': sx.alignItems = 'center'; break;
            case 'rounded': sx.borderRadius = 1; break;
            case 'border': sx.border = '1px solid'; sx.borderColor = 'divider'; break;
            case 'text-muted': sx.color = 'text.secondary'; break;
            case 'text-info': sx.color = 'info.main'; break;
            case 'text-body': sx.color = 'text.primary'; break;
            case 'text-white': sx.color = '#fff'; break;
            case 'text-uppercase': sx.textTransform = 'uppercase'; break;
            case 'text-decoration-underline': sx.textDecoration = 'underline'; break;
            case 'fst-italic': sx.fontStyle = 'italic'; break;
            case 'fw-bold': sx.fontWeight = 700; break;
            case 'badge':
                Object.assign(sx, { display: 'inline-block', px: 0.75, py: 0.25, fontSize: '0.75rem', fontWeight: 700, lineHeight: 1.2, borderRadius: 1, whiteSpace: 'nowrap' });
                break;
            case 'bg-danger': sx.bgcolor = 'error.main'; sx.color = '#fff'; break;
            default: break;
        }
    }
    return sx;
}

const SAFE_HREF = /^(https?:|mailto:)/i;
const MAX_NODES = 4000;
const MAX_DEPTH = 24;

interface Ctx {
    isOpen: (index: number) => boolean;
    toggle: (index: number) => void;
    toggleAll: () => void;
    allOpen: boolean;
    counter: { details: number; nodes: number; chars: number };
    /** Characters of text shown so far (the typewriter); Infinity shows everything. */
    limit: number;
    /** Whether the cluster being drawn is open (turns its arrow). */
    inOpen: boolean;
}

function build(node: Node, ctx: Ctx, depth: number, key: string): ReactNode {
    if (++ctx.counter.nodes > MAX_NODES || depth > MAX_DEPTH) return null;
    if (ctx.counter.chars >= ctx.limit) return null;
    if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent ?? '';
        const room = ctx.limit - ctx.counter.chars;
        ctx.counter.chars += Math.min(text.length, room);
        return text.length <= room ? text : text.slice(0, room);
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return null;
    const el = node as Element;
    const tag = el.tagName.toLowerCase();
    if (DROPPED.has(tag)) return null;

    const children = (inner: Ctx = ctx) => Array.from(el.childNodes).map((child, i) => build(child, inner, depth + 1, `${key}.${i}`));
    const classes = (el.getAttribute('class') ?? '').split(/\s+/).filter(Boolean);
    // One flat list: MUI does not read a list inside a list
    const parts = [classSx(classes), styleSx(el.getAttribute('style'))];
    const sx = parts as SxProps<Theme>;

    if (tag === 'br') return <br key={key} />;

    // The material icon font is not loaded here: the arrow of a cluster is the MUI one, turned when it is closed.
    if (classes.includes('material-icons')) {
        const color = styleSx(el.getAttribute('style')).color;
        return (
            <ArrowDropDown
                key={key}
                sx={{ fontSize: '1.4em', color, ml: -0.5, transition: 'transform 0.2s', transform: ctx.inOpen ? 'none' : 'rotate(-90deg)' }}
            />
        );
    }

    // "Collapse All" of the executive summary: the page used a script, here it is state.
    if (el.id === 'watcher-toggle-all') {
        return (
            <Box
                key={key}
                component="span"
                role="button"
                tabIndex={0}
                onClick={ctx.toggleAll}
                onKeyDown={(e: React.KeyboardEvent) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), ctx.toggleAll())}
                sx={[classSx(classes), styleSx(el.getAttribute('style')), { '&:hover': { bgcolor: 'action.hover' } }] as SxProps<Theme>}
            >
                {ctx.allOpen ? 'Collapse All' : 'Expand All'}
            </Box>
        );
    }

    if (tag === 'details') {
        const index = ctx.counter.details++;
        const open = ctx.isOpen(index);
        const inner = { ...ctx, inOpen: open };
        const kids = Array.from(el.childNodes);
        const summary = kids.find((k) => k.nodeType === Node.ELEMENT_NODE && (k as Element).tagName.toLowerCase() === 'summary') as Element | undefined;
        const rest = kids.filter((k) => k !== summary);
        const summaryClasses = (summary?.getAttribute('class') ?? '').split(/\s+/).filter(Boolean);
        return (
            <Box key={key} component="div" sx={sx}>
                {summary && (
                    <Box
                        component="div"
                        role="button"
                        tabIndex={0}
                        aria-expanded={open}
                        onClick={() => ctx.toggle(index)}
                        onKeyDown={(e: React.KeyboardEvent) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), ctx.toggle(index))}
                        sx={[classSx(summaryClasses), styleSx(summary.getAttribute('style')), { cursor: 'pointer', userSelect: 'none' }] as SxProps<Theme>}
                    >
                        {Array.from(summary.childNodes).map((child, i) => build(child, inner, depth + 2, `${key}.s${i}`))}
                    </Box>
                )}
                {open && rest.map((child, i) => build(child, inner, depth + 1, `${key}.${i}`))}
            </Box>
        );
    }

    if (tag === 'a') {
        const href = el.getAttribute('href') ?? '';
        if (!SAFE_HREF.test(href.trim())) return <span key={key}>{children()}</span>;
        // The source of a report: a chip with the icon of the site that opens the article
        if (el.classList.contains('watcher-source')) {
            const host = hostOf(href);
            if (host) {
                return (
                    <Chip
                        key={key}
                        component="a"
                        href={href.trim()}
                        target="_blank"
                        rel="noopener noreferrer"
                        clickable
                        size="small"
                        variant="outlined"
                        icon={<Favicon host={host} size={14} />}
                        label={host}
                        data-testid="source-chip"
                        sx={{ mr: 0.5, mb: 0.25 }}
                    />
                );
            }
        }
        return (
            <Link key={key} href={href.trim()} target="_blank" rel="noopener noreferrer" sx={sx}>
                {children()}
            </Link>
        );
    }

    if (TAGS.has(tag) || tag === 'summary') {
        const component = (tag === 'summary' ? 'div' : tag) as React.ElementType;
        const reset = tag === 'p' || /^h[1-6]$/.test(tag) ? { m: 0 } : null;
        return (
            <Box key={key} component={component} sx={[reset ?? {}, ...parts] as SxProps<Theme>}>
                {children()}
            </Box>
        );
    }

    // An unknown tag is not drawn, its text is.
    return <span key={key}>{children()}</span>;
}

/** Whether a stored summary is HTML (3.8 and later) or plain text (older ones). */
export const isHtmlSummary = (text: string) => /<(p|div|details|span|strong|h[1-6])\b/i.test(text);

const TYPED_KEY = 'watcher.typedSummaries';
/** The summaries already written out on this browser: each one is typed once, then shown at once. */
function typedBefore(id: string): boolean {
    try {
        return (JSON.parse(localStorage.getItem(TYPED_KEY) ?? '[]') as string[]).includes(id);
    } catch {
        return false;
    }
}
function markTyped(id: string) {
    try {
        const seen = (JSON.parse(localStorage.getItem(TYPED_KEY) ?? '[]') as string[]).filter((x) => x !== id);
        localStorage.setItem(TYPED_KEY, JSON.stringify([...seen, id].slice(-60)));
    } catch {
        /* private window: it is typed again next time */
    }
}

const COLLAPSED_KEY = 'watcherCollapsedState';
/** The clusters of a summary start folded, until the person unfolds them (then they start unfolded, on every summary). */
function readExpanded(): boolean {
    try {
        return localStorage.getItem(COLLAPSED_KEY) === 'expanded';
    } catch {
        return false;
    }
}
function saveExpanded(expanded: boolean) {
    try {
        localStorage.setItem(COLLAPSED_KEY, expanded ? 'expanded' : 'collapsed');
    } catch {
        /* private window: it starts folded again */
    }
}

export function SafeHtml({ html, typewriter = false }: { html: string; typewriter?: boolean }) {
    const doc = useMemo(() => new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html'), [html]);
    const defaults = useMemo(() => {
        const expanded = readExpanded();
        return Array.from(doc.querySelectorAll('details')).map(() => expanded);
    }, [doc]);
    const [overrides, setOverrides] = useState<Record<number, boolean>>({});

    // Typewriter: shows the text a few characters at a time, once per summary and never with reduced motion
    const total = doc.body.textContent?.length ?? 0;
    const id = `${total}:${html.slice(0, 80)}`;
    const animate = typewriter && total > 0 && !window.matchMedia('(prefers-reduced-motion: reduce)').matches && !typedBefore(id);
    const [typed, setTyped] = useState<{ id: string; chars: number } | null>(null);
    useEffect(() => {
        if (!animate) return undefined;
        // About six seconds whatever the length: a long report is not written out for half a minute
        const step = Math.max(1, Math.ceil(total / (6000 / 14)));
        let chars = 0;
        const timer = window.setInterval(() => {
            chars += step;
            if (chars >= total) {
                window.clearInterval(timer);
                markTyped(id);
                setTyped(null);
            } else setTyped({ id, chars });
        }, 14);
        return () => window.clearInterval(timer);
    }, [animate, id, total]);
    const limit = animate ? (typed?.id === id ? typed.chars : 0) : Infinity;

    const isOpen = (i: number) => overrides[i] ?? defaults[i] ?? true;
    const allOpen = defaults.every((_, i) => isOpen(i));
    const touched = Object.keys(overrides).length > 0;
    useEffect(() => {
        if (touched) saveExpanded(allOpen);
    }, [touched, allOpen]);
    const ctx: Ctx = {
        isOpen,
        toggle: (i) => setOverrides((o) => ({ ...o, [i]: !(o[i] ?? defaults[i] ?? true) })),
        toggleAll: () => setOverrides(Object.fromEntries(defaults.map((_, i) => [i, !allOpen]))),
        allOpen,
        counter: { details: 0, nodes: 0, chars: 0 },
        limit,
        inOpen: true,
    };

    return (
        <Box data-testid="summary-html" sx={{ fontSize: '0.875rem', lineHeight: 1.6, overflowWrap: 'anywhere', '& p': { lineHeight: 1.6 } }}>
            {Array.from(doc.body.childNodes).map((node, i) => build(node, ctx, 0, String(i)))}
        </Box>
    );
}

/** A summary as a few plain lines, for a card that only hints at it: the first paragraph (the executive summary). */
export function summaryPreview(text: string): string {
    if (!isHtmlSummary(text)) return text.trim();
    const doc = new DOMParser().parseFromString(`<body>${text}</body>`, 'text/html');
    const first = doc.querySelector('p');
    return (first?.textContent ?? doc.body.textContent ?? '').replace(/\s+/g, ' ').trim();
}

export interface SummarySource {
    url: string;
    host: string;
}

export interface SummaryOutline {
    /** The articles a report cites (one per site), to be linked from the card */
    sources: SummarySource[];
    /** The topics of a report (its clusters), each with its severity ("Critical", "High"...) */
    topics: { title: string; severity: string }[];
    /** The impact level of a breaking news, when it states one */
    impact: string;
    /** Whether there is more to read than the first paragraph: topics, a threat context, other paragraphs */
    more: boolean;
}

/** What follows the first paragraph of a summary, to tell on the card that there is more: the topics and their severity, the impact level. */
export function summaryOutline(text: string): SummaryOutline {
    if (!isHtmlSummary(text)) return { topics: [], impact: '', more: false, sources: [] };
    const doc = new DOMParser().parseFromString(`<body>${text}</body>`, 'text/html');
    const topics = Array.from(doc.querySelectorAll('details')).map((d) => {
        const head = d.querySelector('summary');
        const badges = head ? Array.from(head.querySelectorAll('.badge, [class*="badge"]')) : [];
        return {
            title: (head?.querySelector('strong')?.textContent ?? '').replace(/\s+/g, ' ').trim(),
            severity: (badges[badges.length - 1]?.textContent ?? '').replace(/\s+/g, ' ').trim(),
        };
    });
    let impact = '';
    if (!topics.length) {
        const label = Array.from(doc.querySelectorAll('strong')).find((s) => /impact/i.test(s.textContent ?? ''));
        const badge = label?.parentElement?.querySelector('.badge, [class*="badge"]');
        impact = (badge?.textContent ?? '').replace(/\s+/g, ' ').trim();
    }
    const seen = new Set<string>();
    const sources: SummarySource[] = [];
    doc.querySelectorAll('a.watcher-source').forEach((a) => {
        const url = a.getAttribute('href') ?? '';
        const host = SAFE_HREF.test(url.trim()) ? hostOf(url) : '';
        if (host && !seen.has(host)) {
            seen.add(host);
            sources.push({ url: url.trim(), host });
        }
    });
    const more = topics.length > 0 || Boolean(impact) || doc.querySelectorAll('p').length > 1 || doc.querySelectorAll('h6, li').length > 0;
    return { topics, impact, more, sources };
}

/** The site of an address (without "www."), or '' when it is not an address. */
export function hostOf(url: string): string {
    try {
        return new URL(url.trim()).hostname.replace(/^www\./i, '');
    } catch {
        return '';
    }
}
