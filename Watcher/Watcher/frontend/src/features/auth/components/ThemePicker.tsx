import { useState, type KeyboardEvent } from 'react';
import { Box, ButtonBase, Chip, Stack, Typography } from '@mui/material';
import Check from '@mui/icons-material/Check';
import { useThemeMode } from '../../../styles/ThemeModeProvider';
import { FAMILIES, THEME_FAMILY, THEME_NAMES, THEMES, type Palette, type ThemeFamily, type ThemeName } from '../../../styles/themes';

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

type Filter = 'all' | 'light' | 'dark' | ThemeFamily;

const FILTERS: { value: Filter; label: string; matches: (name: ThemeName) => boolean }[] = [
    { value: 'all', label: 'All', matches: () => true },
    { value: 'light', label: 'Light', matches: (n) => !THEMES[n].dark },
    { value: 'dark', label: 'Dark', matches: (n) => THEMES[n].dark },
    ...(Object.keys(FAMILIES) as ThemeFamily[]).map((family) => ({
        value: family as Filter,
        label: FAMILIES[family].label,
        matches: (n: ThemeName) => THEME_FAMILY[n] === family,
    })),
];

function ThemeCard({ name, active, onPick, onKeyDown }: { name: ThemeName; active: boolean; onPick: () => void; onKeyDown: (e: KeyboardEvent<HTMLElement>) => void }) {
    const theme = THEMES[name];
    const badges = [theme.badge, FAMILIES[THEME_FAMILY[name]].badge].filter((b): b is string => !!b);
    return (
        <ButtonBase
            role="radio"
            aria-checked={active}
            aria-label={theme.label}
            tabIndex={active ? 0 : -1}
            data-testid={`theme-${name}`}
            onClick={onPick}
            onKeyDown={onKeyDown}
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
                <Typography variant="body2" sx={{ fontWeight: 650 }} noWrap>
                    {theme.label}
                </Typography>
                {active && <Check fontSize="small" color="primary" />}
            </Stack>
            <Stack direction="row" spacing={0.5} sx={{ px: 0.25, flexWrap: 'wrap', rowGap: 0.5, minHeight: 22 }}>
                {badges.map((badge) => (
                    <Chip key={badge} size="small" variant="outlined" label={badge} sx={{ height: 20, fontSize: 11 }} />
                ))}
            </Stack>
        </ButtonBase>
    );
}

/**
 * The themes as a radio group, in a Light and a Dark section; the filters narrow them by mode or by kind. The arrow keys
 * move the focus over what is shown, Space or Enter picks the focused one.
 */
export function ThemePicker() {
    const { themeName, setThemeName } = useThemeMode();
    const [filter, setFilter] = useState<Filter>('all');

    const matches = FILTERS.find((f) => f.value === filter)?.matches ?? (() => true);
    const visible = THEME_NAMES.filter(matches);
    const sections = [
        { key: 'light', title: 'Light', names: visible.filter((n) => !THEMES[n].dark) },
        { key: 'dark', title: 'Dark', names: visible.filter((n) => THEMES[n].dark) },
    ].filter((section) => section.names.length > 0);

    const onKeyDown = (e: KeyboardEvent<HTMLElement>, name: ThemeName) => {
        const index = visible.indexOf(name);
        if (e.key === ' ' || e.key === 'Enter') {
            e.preventDefault();
            if (name !== themeName) setThemeName(name);
            return;
        }
        const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
        if (!step) return;
        e.preventDefault();
        const next = visible[(index + step + visible.length) % visible.length];
        e.currentTarget.closest('[role="radiogroup"]')?.querySelector<HTMLElement>(`[data-testid="theme-${next}"]`)?.focus();
    };

    return (
        <Stack spacing={2}>
            <Stack direction="row" role="group" aria-label="Filter the themes" spacing={0.75} sx={{ flexWrap: 'wrap', rowGap: 0.75 }}>
                {FILTERS.map((f) => {
                    const selected = f.value === filter;
                    return (
                        <Chip
                            key={f.value}
                            clickable
                            size="small"
                            aria-pressed={selected}
                            data-testid={`theme-filter-${f.value}`}
                            color={selected ? 'primary' : 'default'}
                            variant={selected ? 'filled' : 'outlined'}
                            label={`${f.label} ${THEME_NAMES.filter(f.matches).length}`}
                            onClick={() => setFilter(f.value)}
                        />
                    );
                })}
            </Stack>
            <Box role="radiogroup" aria-label="Theme" sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
                {sections.map((section) => (
                    <Box key={section.key} component="section" data-testid={`themes-${section.key}`}>
                        <Typography variant="overline" component="h3" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                            {section.title} - {section.names.length}
                        </Typography>
                        <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))' }}>
                            {section.names.map((name) => (
                                <ThemeCard key={name} name={name} active={name === themeName} onPick={() => setThemeName(name)} onKeyDown={(e) => onKeyDown(e, name)} />
                            ))}
                        </Box>
                    </Box>
                ))}
            </Box>
        </Stack>
    );
}
