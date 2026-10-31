import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { CssBaseline, ThemeProvider } from '@mui/material';
import { useProfile, useUpdateProfile } from '../features/auth/hooks';
import { useAuthStore } from '../features/auth/store';
import { createWatcherTheme } from './theme';
import { DEFAULT_DARK, DEFAULT_LIGHT, DEFAULT_THEME, isThemeName, THEMES, type ThemeName } from './themes';

const STORAGE_KEY = 'watcher.theme';
const LEGACY_MODE_KEY = 'watcher.theme.mode';

interface ThemeModeContextValue {
    themeName: ThemeName;
    setThemeName: (name: ThemeName) => void;
    dark: boolean;
}

const ThemeModeContext = createContext<ThemeModeContextValue | null>(null);

function readInitialTheme(): ThemeName {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (isThemeName(stored)) return stored;
        const legacy = localStorage.getItem(LEGACY_MODE_KEY);
        if (legacy === 'dark') return DEFAULT_DARK;
        if (legacy === 'light') return DEFAULT_LIGHT;
    } catch {
        /* storage unavailable: fall back to the default theme */
    }
    return DEFAULT_THEME;
}

export function ThemeModeProvider({ children }: { children: ReactNode }) {
    const [themeName, setThemeNameState] = useState<ThemeName>(readInitialTheme);
    const theme = useMemo(() => createWatcherTheme(themeName), [themeName]);
    const dark = THEMES[themeName].dark;
    const signedIn = useAuthStore((s) => !!s.token);
    const { data: profile } = useProfile();
    const { mutate: saveTheme } = useUpdateProfile();

    const apply = useCallback((name: ThemeName) => {
        setThemeNameState(name);
        try {
            localStorage.setItem(STORAGE_KEY, name);
        } catch {
            /* ignore */
        }
    }, []);

    // The account's theme wins once the profile is loaded. An empty or unknown value (not chosen yet, a former
    // Bootswatch id) keeps the browser's own choice.
    const profileTheme = profile?.theme;
    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- syncs local state with the server value once it arrives
        if (isThemeName(profileTheme)) apply(profileTheme);
    }, [profileTheme, apply]);

    const setThemeName = useCallback(
        (name: ThemeName) => {
            apply(name);
            if (signedIn) saveTheme({ theme: name });
        },
        [apply, signedIn, saveTheme],
    );

    // Native parts of the page (scrollbars, form controls) follow the theme; tests read it from the attributes.
    useEffect(() => {
        const root = document.documentElement;
        root.setAttribute('data-theme', themeName);
        root.setAttribute('data-color-mode', dark ? 'dark' : 'light');
        root.style.colorScheme = dark ? 'dark' : 'light';
    }, [themeName, dark]);

    const value = useMemo(() => ({ themeName, setThemeName, dark }), [themeName, setThemeName, dark]);

    return (
        <ThemeModeContext.Provider value={value}>
            <ThemeProvider theme={theme}>
                <CssBaseline enableColorScheme />
                {children}
            </ThemeProvider>
        </ThemeModeContext.Provider>
    );
}

export function useThemeMode(): ThemeModeContextValue {
    const ctx = useContext(ThemeModeContext);
    if (!ctx) throw new Error('useThemeMode must be used within ThemeModeProvider');
    return ctx;
}
