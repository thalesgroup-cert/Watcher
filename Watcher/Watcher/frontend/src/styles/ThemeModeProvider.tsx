import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { CssBaseline, ThemeProvider } from '@mui/material';
import { useProfile, useUpdateProfile } from '../features/auth/hooks';
import { useAuthStore } from '../features/auth/store';
import { AmbientBackdrop } from './AmbientBackdrop';
import { DEFAULT_DISPLAY, DISPLAY_STORAGE_KEY, DisplayContext, parseDisplay, readStoredDisplay, type Display } from './display';
import { defaultEffects, EFFECTS_STORAGE_KEY, isEffects, readStoredEffects, setReducedMotionAsked, type Effects } from './effects';
import { createWatcherTheme } from './theme';
import { DEFAULT_DARK, DEFAULT_LIGHT, DEFAULT_THEME, isThemeName, THEMES, type ThemeName } from './themes';

const STORAGE_KEY = 'watcher.theme';
const LEGACY_MODE_KEY = 'watcher.theme.mode';

interface ThemeModeContextValue {
    themeName: ThemeName;
    setThemeName: (name: ThemeName) => void;
    dark: boolean;
    /** How much the themes with a backdrop move (`full`, `calm`, `off`). */
    effects: Effects;
    setEffects: (level: Effects) => void;
    /** The theme in use has a backdrop (Clay): the effects setting means something. */
    ambient: boolean;
    /** Row density, text size, motion and chart colours. */
    display: Display;
    /** Changes some of the display settings; the others are kept. */
    setDisplay: (patch: Partial<Display>) => void;
    /** Back to the default theme, effects and display, in one save. */
    resetAppearance: () => void;
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

function remember(key: string, value: string) {
    try {
        localStorage.setItem(key, value);
    } catch {
        /* ignore */
    }
}

export function ThemeModeProvider({ children }: { children: ReactNode }) {
    const [themeName, setThemeNameState] = useState<ThemeName>(readInitialTheme);
    const [effects, setEffectsState] = useState<Effects>(readStoredEffects);
    const [display, setDisplayState] = useState<Display>(() => {
        const stored = readStoredDisplay();
        setReducedMotionAsked(stored.motion === 'reduced');
        return stored;
    });
    const theme = useMemo(() => createWatcherTheme(themeName, effects, display), [themeName, effects, display]);
    const dark = THEMES[themeName].dark;
    const ambient = !!THEMES[themeName].ambient;
    const signedIn = useAuthStore((s) => !!s.token);
    const { data: profile } = useProfile();
    const { mutate: saveProfile } = useUpdateProfile();

    // The preferences of the account as last known here: two quick changes keep each other (each save replaces the field
    // as a whole, so it has to carry what the previous one wrote).
    const preferences = useRef<Record<string, unknown>>({});
    const profilePreferences = profile?.preferences;
    useEffect(() => {
        preferences.current = { ...(profilePreferences ?? {}) };
    }, [profilePreferences]);
    const savePreferences = useCallback(
        (patch: Record<string, unknown>, extra: { theme?: ThemeName } = {}) => {
            preferences.current = { ...preferences.current, ...patch };
            if (signedIn) saveProfile({ ...extra, preferences: preferences.current });
        },
        [signedIn, saveProfile],
    );

    const apply = useCallback((name: ThemeName) => {
        setThemeNameState(name);
        remember(STORAGE_KEY, name);
    }, []);

    const applyDisplay = useCallback((next: Display) => {
        setReducedMotionAsked(next.motion === 'reduced');
        setDisplayState(next);
        remember(DISPLAY_STORAGE_KEY, JSON.stringify(next));
    }, []);

    // The account's theme wins once the profile is loaded. An empty or unknown value (not chosen yet, a former
    // Bootswatch id) keeps the browser's own choice.
    const profileTheme = profile?.theme;
    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- syncs local state with the server value once it arrives
        if (isThemeName(profileTheme)) apply(profileTheme);
    }, [profileTheme, apply]);

    // Same rule as the theme: the account's level wins once the profile is loaded.
    const profileEffects = profile?.preferences?.effects;
    useEffect(() => {
        if (!isEffects(profileEffects)) return;
        // eslint-disable-next-line react-hooks/set-state-in-effect -- syncs local state with the server value once it arrives
        setEffectsState(profileEffects);
        remember(EFFECTS_STORAGE_KEY, profileEffects);
    }, [profileEffects]);

    // And the display settings: compared by value, as the field is a new object at each load.
    const profileDisplay = JSON.stringify(profile?.preferences?.display ?? null);
    useEffect(() => {
        if (profileDisplay === 'null') return;
        // eslint-disable-next-line react-hooks/set-state-in-effect -- syncs local state with the server value once it arrives
        applyDisplay(parseDisplay(JSON.parse(profileDisplay)));
    }, [profileDisplay, applyDisplay]);

    // Signing out (or a session that ends) leaves the browser on the default appearance: the theme, the effects and the
    // display belong to the account, and the next person to sign in here must not inherit them. The account itself keeps
    // its choices (nothing is saved), and they come back with the profile at the next sign-in.
    const wasSignedIn = useRef(signedIn);
    useEffect(() => {
        if (wasSignedIn.current && !signedIn) {
            const level = defaultEffects();
            preferences.current = {};
            apply(DEFAULT_THEME);
            setEffectsState(level);
            remember(EFFECTS_STORAGE_KEY, level);
            applyDisplay(DEFAULT_DISPLAY);
        }
        wasSignedIn.current = signedIn;
    }, [signedIn, apply, applyDisplay]);

    const setEffects = useCallback(
        (level: Effects) => {
            setEffectsState(level);
            remember(EFFECTS_STORAGE_KEY, level);
            savePreferences({ effects: level });
        },
        [savePreferences],
    );

    const setThemeName = useCallback(
        (name: ThemeName) => {
            apply(name);
            if (signedIn) saveProfile({ theme: name });
        },
        [apply, signedIn, saveProfile],
    );

    const setDisplay = useCallback(
        (patch: Partial<Display>) => {
            const next = { ...display, ...patch };
            applyDisplay(next);
            savePreferences({ display: next });
        },
        [display, applyDisplay, savePreferences],
    );

    const resetAppearance = useCallback(() => {
        const level = defaultEffects();
        apply(DEFAULT_THEME);
        setEffectsState(level);
        remember(EFFECTS_STORAGE_KEY, level);
        applyDisplay(DEFAULT_DISPLAY);
        savePreferences({ effects: level, display: DEFAULT_DISPLAY }, { theme: DEFAULT_THEME });
    }, [apply, applyDisplay, savePreferences]);

    // Native parts of the page (scrollbars, form controls) follow the theme; tests read it from the attributes.
    useEffect(() => {
        const root = document.documentElement;
        root.setAttribute('data-theme', themeName);
        root.setAttribute('data-color-mode', dark ? 'dark' : 'light');
        root.style.colorScheme = dark ? 'dark' : 'light';
    }, [themeName, dark]);

    const value = useMemo(
        () => ({ themeName, setThemeName, dark, effects, setEffects, ambient, display, setDisplay, resetAppearance }),
        [themeName, setThemeName, dark, effects, setEffects, ambient, display, setDisplay, resetAppearance],
    );

    return (
        <ThemeModeContext.Provider value={value}>
            <DisplayContext.Provider value={display}>
                <ThemeProvider theme={theme}>
                    <CssBaseline enableColorScheme />
                    {ambient && effects !== 'off' && <AmbientBackdrop level={effects} />}
                    {children}
                </ThemeProvider>
            </DisplayContext.Provider>
        </ThemeModeContext.Provider>
    );
}

export function useThemeMode(): ThemeModeContextValue {
    const ctx = useContext(ThemeModeContext);
    if (!ctx) throw new Error('useThemeMode must be used within ThemeModeProvider');
    return ctx;
}
