import type { ReactNode } from 'react';
import { Box, IconButton, Stack, Tooltip, Typography } from '@mui/material';
import ChevronLeft from '@mui/icons-material/ChevronLeft';
import ChevronRight from '@mui/icons-material/ChevronRight';
import Close from '@mui/icons-material/Close';

export function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
    return (
        <Box component="section" sx={{ px: 2.5, py: 2 }}>
            <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                <Typography variant="overline" color="text.secondary" component="h3">
                    {title}
                </Typography>
                {action}
            </Stack>
            {children}
        </Box>
    );
}

/** Label / value pairs of a drawer. Empty values are left out. */
export function Facts({ rows }: { rows: [string, ReactNode][] }) {
    return (
        <Box component="dl" sx={{ display: 'grid', gridTemplateColumns: 'max-content 1fr', columnGap: 2, rowGap: 1, m: 0, alignItems: 'center' }}>
            {rows
                .filter(([, value]) => value !== null && value !== undefined && value !== '')
                .map(([label, value]) => (
                    <Box key={label} sx={{ display: 'contents' }}>
                        <Typography component="dt" variant="body2" color="text.secondary">
                            {label}
                        </Typography>
                        <Box component="dd" sx={{ m: 0, minWidth: 0 }}>
                            {typeof value === 'string' ? <Typography variant="body2">{value}</Typography> : value}
                        </Box>
                    </Box>
                ))}
        </Box>
    );
}

interface DrawerHeaderProps {
    overline: ReactNode;
    title: ReactNode;
    titleId: string;
    onClose: () => void;
    /** Previous / next row of the list, for triage without going back to it. */
    nav?: { previous?: () => void; next?: () => void; noun: string };
}

export function DrawerHeader({ overline, title, titleId, onClose, nav }: DrawerHeaderProps) {
    return (
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', px: 2.5, py: 2 }}>
            <Box sx={{ minWidth: 0, flexGrow: 1 }}>
                <Typography variant="overline" color="text.secondary" sx={{ lineHeight: 1.4, display: 'block' }}>
                    {overline}
                </Typography>
                <Typography id={titleId} variant="h3" component="h2" noWrap>
                    {title}
                </Typography>
            </Box>
            {nav && (
                <>
                    <Tooltip title={`Previous ${nav.noun}`}>
                        <span>
                            <IconButton aria-label={`Previous ${nav.noun}`} disabled={!nav.previous} onClick={nav.previous}>
                                <ChevronLeft />
                            </IconButton>
                        </span>
                    </Tooltip>
                    <Tooltip title={`Next ${nav.noun}`}>
                        <span>
                            <IconButton aria-label={`Next ${nav.noun}`} disabled={!nav.next} onClick={nav.next}>
                                <ChevronRight />
                            </IconButton>
                        </span>
                    </Tooltip>
                </>
            )}
            <IconButton aria-label="Close details" onClick={onClose} edge="end">
                <Close />
            </IconButton>
        </Stack>
    );
}

/** Text with every occurrence of the keywords marked (case-insensitive, like the rule matching). */
export function Marked({ text, keywords }: { text: string; keywords: string[] }) {
    const words = keywords.filter(Boolean).map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    if (!words.length) return <>{text}</>;
    const parts = text.split(new RegExp(`(${words.join('|')})`, 'gi'));
    return (
        <>
            {parts.map((part, i) =>
                i % 2 === 1 ? (
                    <Box key={i} component="mark" sx={{ bgcolor: 'warning.light', color: 'warning.contrastText', borderRadius: 0.5, px: 0.25 }}>
                        {part}
                    </Box>
                ) : (
                    part
                ),
            )}
        </>
    );
}
