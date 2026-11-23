import { useMemo, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { useNavigate } from 'react-router';
import { alpha, Box, ButtonBase, CircularProgress, Dialog, IconButton, InputBase, Typography, useTheme } from '@mui/material';
import Close from '@mui/icons-material/Close';
import SearchRounded from '@mui/icons-material/SearchRounded';
import { useInstanceConfig } from '../config/useInstanceConfig';
import { selectUser, useAuthStore } from '../auth/store';
import { useLogout } from '../auth/hooks';
import { useThemeMode } from '../../styles/ThemeModeProvider';
import { buildCommands, matchCommands, type Command } from './commands';
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

const DOCS_URL = 'https://thalesgroup-cert.github.io/Watcher/';

/**
 * Ctrl+K window: one field, the commands that answer it (open a page or a tab, sign out, change the theme) and the
 * results of every module the person may see, grouped by module. A click (or Enter) runs the command, or opens the
 * object on its own page: `to` is the page URL with the object in it.
 */
export function SearchDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
    const theme = useTheme();
    const navigate = useNavigate();
    const [text, setText] = useState('');
    const [active, setActive] = useState(0);
    const query = useDebounced(text);
    const search = useSearch(query);

    const user = useAuthStore(selectUser);
    const signedIn = useAuthStore((s) => !!s.token);
    const logout = useLogout();
    const { themeName, setThemeName, ambient, effects, setEffects } = useThemeMode();
    const config = useInstanceConfig();
    const commands = useMemo(
        () =>
            buildCommands({
                signedIn,
                superuser: !!user?.is_superuser,
                navigate: (to) => void navigate(to),
                logout: () => logout.mutate(),
                setTheme: setThemeName,
                themeName,
                ambient,
                effects,
                setEffects,
                docsUrl: DOCS_URL,
                apiDocsUrl: config.helpButtonUrl,
                apiDocsLabel: config.helpButtonLabel,
            }),
        // eslint-disable-next-line react-hooks/exhaustive-deps -- `logout` is a new object at each render, its mutate is stable
        [signedIn, user?.is_superuser, navigate, logout.mutate, setThemeName, themeName, ambient, effects, setEffects, config.helpButtonUrl, config.helpButtonLabel],
    );
    const shown = useMemo(() => matchCommands(commands, text), [commands, text]);

    const typed = text.trim();
    const long = typed.length >= MIN_LENGTH;
    const settled = query.trim() === typed;
    const waiting = long && (!settled || search.isFetching);
    // Results of an older text are never shown under the new one.
    const groups = long && settled ? (search.data?.groups ?? []) : [];
    const flat = groups.flatMap((g) => g.results);
    // One list for the keyboard: the commands first, then the results. `active` is a position in it.
    const total = shown.length + flat.length;
    // Position of the first result of each group in the list, for the highlighted row.
    const firstOf = groups.map((_, i) => shown.length + groups.slice(0, i).reduce((n, g) => n + g.results.length, 0));

    const go = (result: SearchResult) => {
        onClose();
        void navigate(result.to);
    };
    const run = (command: Command) => {
        onClose();
        command.run();
    };
    const choose = (position: number) => {
        if (position < shown.length) run(shown[position]);
        else if (flat[position - shown.length]) go(flat[position - shown.length]);
    };

    const onKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'ArrowDown' && total) {
            e.preventDefault();
            setActive((i) => (i + 1) % total);
        } else if (e.key === 'ArrowUp' && total) {
            e.preventDefault();
            setActive((i) => (i - 1 + total) % total);
        } else if (e.key === 'Enter' && active < total) {
            e.preventDefault();
            choose(active);
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
                    placeholder="Search, or type a command…"
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
                {(['Go to', 'Actions', 'Themes'] as const).map((group) => {
                    const rows = shown.filter((c) => c.group === group);
                    if (!rows.length) return null;
                    return (
                        <Box key={group} role="group" aria-label={group} data-testid={`command-group-${group}`}>
                            <Typography variant="overline" sx={{ display: 'block', px: 2, pt: 1.5, pb: 0.5, lineHeight: 1.6, fontWeight: 800, color: 'text.secondary' }}>
                                {group}
                            </Typography>
                            {rows.map((command) => {
                                const mine = shown.indexOf(command);
                                return (
                                    <ButtonBase
                                        key={command.id}
                                        role="option"
                                        aria-selected={mine === active}
                                        data-testid="command"
                                        onMouseEnter={() => setActive(mine)}
                                        onClick={() => run(command)}
                                        sx={{
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            gap: 2,
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
                                            <Highlight text={command.title} query={typed} />
                                        </Typography>
                                        {command.hint && (
                                            <Typography variant="caption" color="text.secondary" noWrap>
                                                {command.hint}
                                            </Typography>
                                        )}
                                    </ButtonBase>
                                );
                            })}
                        </Box>
                    );
                })}
                {!long && (
                    <Typography variant="body2" color="text.secondary" sx={{ px: 2.5, pt: 1.5, pb: 2 }}>
                        {typed && shown.length === 0 ? `No command for “${typed}”. ` : ''}Type at least {MIN_LENGTH} characters to search every module at once.
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
