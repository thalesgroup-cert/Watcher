import { useCallback, useState, type ReactNode } from 'react';
import { Box, Link, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material';
import type { NotificationPreview } from '../types';

type Format = 'slack' | 'markdown';

// One alternative per kind of markup. The text is never turned into HTML: it becomes React nodes.
const SLACK_INLINE = /<(https?:\/\/[^|>\s]+)(?:\|([^>]*))?>|\*([^*\n]+)\*|_([^_\n]+)_|~([^~\n]+)~|`([^`\n]+)`/g;
const MARKDOWN_INLINE = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)|\*\*([^*\n]+)\*\*|\*([^*\n]+)\*|_([^_\n]+)_|`([^`\n]+)`/g;

function renderInline(text: string, format: Format, prefix: string): ReactNode[] {
    const pattern = new RegExp((format === 'slack' ? SLACK_INLINE : MARKDOWN_INLINE).source, 'g');
    const nodes: ReactNode[] = [];
    let last = 0;
    let match: RegExpExecArray | null;
    let n = 0;
    while ((match = pattern.exec(text)) !== null) {
        if (match.index > last) nodes.push(text.slice(last, match.index));
        const key = `${prefix}-${n++}`;
        const link = (url: string, label: string) => (
            <Link key={key} href={url} target="_blank" rel="noopener noreferrer">
                {label}
            </Link>
        );
        if (format === 'slack') {
            const [, url, label, bold, italic, strike, code] = match;
            if (url) nodes.push(link(url, label || url));
            else if (bold) nodes.push(<strong key={key}>{renderInline(bold, format, key)}</strong>);
            else if (italic) nodes.push(<em key={key}>{renderInline(italic, format, key)}</em>);
            else if (strike) nodes.push(<s key={key}>{strike}</s>);
            else nodes.push(<code key={key}>{code}</code>);
        } else {
            const [, label, url, bold, italicStar, italicUnderscore, code] = match;
            const italic = italicStar || italicUnderscore;
            if (url) nodes.push(link(url, label));
            else if (bold) nodes.push(<strong key={key}>{renderInline(bold, format, key)}</strong>);
            else if (italic) nodes.push(<em key={key}>{renderInline(italic, format, key)}</em>);
            else nodes.push(<code key={key}>{code}</code>);
        }
        last = match.index + match[0].length;
    }
    if (last < text.length) nodes.push(text.slice(last));
    return nodes;
}

const TABLE_ROW = /^\s*\|.*\|\s*$/;
const TABLE_RULE = /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/;
const cells = (line: string) => line.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());

function renderMarkdown(text: string): ReactNode[] {
    const lines = text.split('\n');
    const blocks: ReactNode[] = [];
    let paragraph: string[] = [];
    const flush = () => {
        if (paragraph.length) {
            const key = `p${blocks.length}`;
            blocks.push(
                <Typography key={key} variant="body2" sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', mb: 1 }}>
                    {renderInline(paragraph.join('\n'), 'markdown', key)}
                </Typography>,
            );
            paragraph = [];
        }
    };
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const heading = /^(#{1,6})\s+(.*)$/.exec(line);
        if (heading) {
            flush();
            const key = `h${blocks.length}`;
            blocks.push(
                <Typography key={key} variant={heading[1].length === 1 ? 'h3' : 'subtitle1'} component="h4" sx={{ mt: 1, mb: 1, fontWeight: 600 }}>
                    {renderInline(heading[2], 'markdown', key)}
                </Typography>,
            );
        } else if (TABLE_ROW.test(line) && i + 1 < lines.length && TABLE_RULE.test(lines[i + 1])) {
            flush();
            const head = cells(line);
            const rows: string[][] = [];
            i += 2;
            while (i < lines.length && TABLE_ROW.test(lines[i])) rows.push(cells(lines[i++]));
            i--;
            const key = `t${blocks.length}`;
            blocks.push(
                <Table key={key} size="small" sx={{ mb: 1, '& td, & th': { py: 0.5 } }}>
                    <TableHead>
                        <TableRow>
                            {head.map((c, j) => (
                                <TableCell key={j}>{renderInline(c, 'markdown', `${key}h${j}`)}</TableCell>
                            ))}
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {rows.map((row, r) => (
                            <TableRow key={r}>
                                {row.map((c, j) => (
                                    <TableCell key={j}>{renderInline(c, 'markdown', `${key}r${r}c${j}`)}</TableCell>
                                ))}
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>,
            );
        } else if (line.trim() === '') {
            flush();
        } else {
            paragraph.push(line);
        }
    }
    flush();
    return blocks;
}

/** Page of the iframe: the fragment of a Citadel message gets a readable base, a full email page is left alone. */
function frameDocument(content: string): string {
    if (/<html[\s>]/i.test(content)) return content;
    return `<!doctype html><meta charset="utf-8"><style>body{font:14px/1.5 system-ui,sans-serif;margin:12px;color:#1c1b1f}</style>${content}`;
}

/** The message as the channel would show it: Slack and TheHive text interpreted, Citadel and email as the page they are. */
export function MessagePreview({ preview }: { preview: NotificationPreview }) {
    const [height, setHeight] = useState(480);
    // Scripts stay blocked (no allow-scripts); allow-same-origin is only there to read the height of the page.
    const fit = useCallback((frame: HTMLIFrameElement) => {
        const page = frame.contentDocument?.documentElement;
        if (page) setHeight(Math.min(Math.max(page.scrollHeight + 8, 240), 1400));
    }, []);

    if (preview.format === 'html') {
        return (
            <Box
                component="iframe"
                title="Message preview"
                sandbox="allow-same-origin"
                srcDoc={frameDocument(preview.content)}
                onLoad={(e) => fit(e.currentTarget)}
                sx={{ display: 'block', width: '100%', height, border: 1, borderColor: 'divider', borderRadius: 1, bgcolor: '#fff' }}
            />
        );
    }
    return (
        <Box aria-label="Message preview" sx={{ p: 1.5, border: 1, borderColor: 'divider', borderRadius: 1, bgcolor: 'background.paper' }}>
            {preview.format === 'markdown' ? (
                renderMarkdown(preview.content)
            ) : (
                <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                    {renderInline(preview.content, 'slack', 's')}
                </Typography>
            )}
        </Box>
    );
}
