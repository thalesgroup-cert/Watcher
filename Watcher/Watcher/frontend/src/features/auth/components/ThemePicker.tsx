import type { KeyboardEvent } from 'react';
import { Box, ButtonBase, Stack, Typography } from '@mui/material';
import Check from '@mui/icons-material/Check';
import { useThemeMode } from '../../../styles/ThemeModeProvider';
import { THEME_NAMES, THEMES, type Palette } from '../../../styles/themes';

/** A small page in the theme's colours: background, a card with two lines of text, and the two accent colours. */
function Preview({ palette: p }: { palette: Palette }) {
    return (
        <Box aria-hidden sx={{ display: 'flex', gap: 0.75, height: 64, p: 0.75, borderRadius: 1, border: 1, borderColor: 'divider', bgcolor: p.bgDefault }}>
            <Stack spacing={0.5} sx={{ flex: 1, justifyContent: 'center', p: 0.75, borderRadius: 0.75, bgcolor: p.bgPaper }}>
                <Box sx={{ height: 5, width: '70%', borderRadius: 1, bgcolor: p.text, opacity: 0.8 }} />
                <Box sx={{ height: 5, width: '45%', borderRadius: 1, bgcolor: p.text, opacity: 0.35 }} />
            </Stack>
            <Stack spacing={0.5} sx={{ justifyContent: 'center' }}>
                <Box sx={{ width: 14, height: 14, borderRadius: '50%', bgcolor: p.primary }} />
                <Box sx={{ width: 14, height: 14, borderRadius: '50%', bgcolor: p.secondary }} />
            </Stack>
        </Box>
    );
}

/** The themes as a radio group: the arrow keys move the focus, Space or Enter picks the focused one. */
export function ThemePicker() {
    const { themeName, setThemeName } = useThemeMode();

    const onKeyDown = (e: KeyboardEvent<HTMLElement>, index: number) => {
        if (e.key === ' ' || e.key === 'Enter') {
            e.preventDefault();
            if (THEME_NAMES[index] !== themeName) setThemeName(THEME_NAMES[index]);
            return;
        }
        const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
        if (!step) return;
        e.preventDefault();
        const next = THEME_NAMES[(index + step + THEME_NAMES.length) % THEME_NAMES.length];
        e.currentTarget.parentElement?.querySelector<HTMLElement>(`[data-testid="theme-${next}"]`)?.focus();
    };

    return (
        <Box role="radiogroup" aria-label="Theme" sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' }}>
            {THEME_NAMES.map((name, index) => {
                const theme = THEMES[name];
                const active = name === themeName;
                return (
                    <ButtonBase
                        key={name}
                        role="radio"
                        aria-checked={active}
                        aria-label={theme.label}
                        tabIndex={active ? 0 : -1}
                        data-testid={`theme-${name}`}
                        onClick={() => setThemeName(name)}
                        onKeyDown={(e) => onKeyDown(e, index)}
                        sx={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'stretch',
                            gap: 1,
                            p: 1,
                            borderRadius: 2,
                            textAlign: 'left',
                            border: 2,
                            borderColor: active ? 'primary.main' : 'divider',
                            transition: 'border-color 120ms',
                        }}
                    >
                        <Preview palette={theme.palette} />
                        <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', px: 0.25 }}>
                            <Box sx={{ minWidth: 0 }}>
                                <Typography variant="body2" sx={{ fontWeight: 650 }} noWrap>
                                    {theme.label}
                                </Typography>
                                <Typography variant="caption" color="text.secondary">
                                    {theme.dark ? 'Dark' : 'Light'}
                                    {theme.badge && ` - ${theme.badge}`}
                                </Typography>
                            </Box>
                            {active && <Check fontSize="small" color="primary" />}
                        </Stack>
                    </ButtonBase>
                );
            })}
        </Box>
    );
}
