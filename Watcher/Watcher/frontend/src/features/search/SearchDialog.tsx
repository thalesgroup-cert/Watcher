import { useState } from 'react';
import type { KeyboardEvent } from 'react';
import { useNavigate } from 'react-router';
import { alpha, Box, ButtonBase, CircularProgress, Dialog, IconButton, InputBase, Typography, useTheme } from '@mui/material';
import Close from '@mui/icons-material/Close';
import SearchRounded from '@mui/icons-material/SearchRounded';
import { Highlight } from './highlight';
import { MIN_LENGTH, useDebounced, useSearch } from './hooks';
import { MODULE_ICONS } from './modules';
import type { SearchResult } from './types';

function Key({ children }: { children: string }) {
    return (
        <Box component="kbd" sx={{ px: 0.75, py: 0.125, borderRadius: 1, border: 1, borderColor: 'divider', bgcolor: 'action.hover', fontFamily: 'inherit', fontSize: 11.5, fontWeight: 700 }}>
            {children}
        </Box>
    );
}

/**
 * Global search: a window in the middle of the screen with one field and the results of every module the person may see,
 * grouped by module. A click (or Enter) opens the object on its own page: `to` is the page URL with the object in it.
 */
export function SearchDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
    const theme = useTheme();
    const navigate = useNavigate();
    const [text, setText] = useState('');
    const [active, setActive] = useState(0);
    const query = useDebounced(text);
    const search = useSearch(query);

    const typed = text.trim();
    const long = typed.length >= MIN_LENGTH;
    const settled = query.trim() === typed;
    const waiting = long && (!settled || search.isFetching);
    // Results of an older text are never shown under the new one.
    const groups = long && settled ? (search.data?.groups ?? []) : [];
    const flat = groups.flatMap((g) => g.results);
    // Position of the first result of each group in `flat`, for the highlighted row.
    const firstOf = groups.map((_, i) => groups.slice(0, i).reduce((n, g) => n + g.results.length, 0));

    const go = (result: SearchResult) => {
        onClose();
        void navigate(result.to);
    };

    const onKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'ArrowDown' && flat.length) {
            e.preventDefault();
            setActive((i) => (i + 1) % flat.length);
        } else if (e.key === 'ArrowUp' && flat.length) {
            e.preventDefault();
            setActive((i) => (i - 1 + flat.length) % flat.length);
        } else if (e.key === 'Enter' && flat[active]) {
            e.preventDefault();
            go(flat[active]);
        }
    };

    return (
        <Dialog
            open={open}
            onClose={onClose}
            fullWidth
            maxWidth="sm"
            aria-label="Search"
            slotProps={{
                // The text is cleared once the window is gone, not while it fades out.
                transition: { onExited: () => { setText(''); setActive(0); } },
                paper: { 'data-testid': 'search-dialog', sx: { borderRadius: 3, overflow: 'hidden' } } as object,
            }}
        >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, px: 2, py: 1.25, borderBottom: 1, borderColor: 'divider' }}>
                <SearchRounded sx={{ color: 'text.secondary' }} />
                <InputBase
                    autoFocus
                    fullWidth
                    value={text}
                    placeholder="Search every module…"
                    onChange={(e) => {
                        setText(e.target.value);
                        setActive(0);
                    }}
                    onKeyDown={onKeyDown}
                    sx={{ fontSize: 17, fontWeight: 500 }}
                    inputProps={{ 'aria-label': 'Search everywhere', role: 'combobox', 'aria-expanded': true, 'aria-controls': 'global-search-results', autoComplete: 'off' }}
                />
                {waiting && <CircularProgress size={18} aria-label="Searching" />}
                <IconButton size="small" aria-label="Close" onClick={onClose}>
                    <Close fontSize="small" />
                </IconButton>
            </Box>

            <Box id="global-search-results" role="listbox" sx={{ minHeight: 168, maxHeight: '52vh', overflowY: 'auto', py: 0.5 }}>
                {!long && (
                    <Typography variant="body2" color="text.secondary" sx={{ p: 2.5 }}>
                        Type at least {MIN_LENGTH} characters to search every module at once.
                    </Typography>
                )}
                {long && search.isError && settled && (
                    <Box sx={{ p: 2.5 }}>
                        <Typography variant="body2" color="error">
                            The search failed.
                        </Typography>
                        <ButtonBase onClick={() => void search.refetch()} sx={{ mt: 0.5, textDecoration: 'underline', fontSize: 14 }}>
                            Retry
                        </ButtonBase>
                    </Box>
                )}
                {long && !search.isError && !waiting && groups.length === 0 && (
                    <Typography variant="body2" color="text.secondary" sx={{ p: 2.5 }}>
                        No results for “{typed}”.
                    </Typography>
                )}
                {groups.map((group, g) => (
                    <Box key={group.module} role="group" aria-label={group.label} data-testid={`search-group-${group.module}`}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 2, pt: 1.5, pb: 0.5, color: 'text.secondary', '& svg': { fontSize: 17 } }}>
                            {MODULE_ICONS[group.module]}
                            <Typography variant="overline" sx={{ lineHeight: 1.6, fontWeight: 800 }}>
                                {group.label}
                            </Typography>
                        </Box>
                        {group.error && (
                            <Typography variant="body2" color="warning.main" sx={{ px: 2, pb: 0.5 }}>
                                This module did not answer.
                            </Typography>
                        )}
                        {group.results.map((r, i) => {
                            const mine = firstOf[g] + i;
                            return (
                                <ButtonBase
                                    key={`${r.type}-${r.id}`}
                                    role="option"
                                    aria-selected={mine === active}
                                    onMouseEnter={() => setActive(mine)}
                                    onClick={() => go(r)}
                                    sx={{
                                        display: 'block',
                                        width: 'calc(100% - 16px)',
                                        mx: 1,
                                        textAlign: 'left',
                                        px: 1.5,
                                        py: 0.875,
                                        borderRadius: 1.5,
                                        bgcolor: mine === active ? alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.18 : 0.1) : 'transparent',
                                    }}
                                >
                                    <Typography variant="body2" sx={{ fontWeight: 700 }} noWrap>
                                        <Highlight text={r.title} query={typed} />
                                    </Typography>
                                    {r.subtitle && (
                                        <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
                                            {r.subtitle}
                                        </Typography>
                                    )}
                                </ButtonBase>
                            );
                        })}
                        {group.more && (
                            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', px: 2.5, pb: 0.75 }}>
                                More results in {group.label}: refine the search.
                            </Typography>
                        )}
                    </Box>
                ))}
            </Box>

            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, px: 2, py: 1, borderTop: 1, borderColor: 'divider', color: 'text.secondary', fontSize: 12, bgcolor: 'action.hover' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                    <Key>↑</Key>
                    <Key>↓</Key> to move
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                    <Key>Enter</Key> to open
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                    <Key>Esc</Key> to close
                </Box>
            </Box>
        </Dialog>
    );
}
