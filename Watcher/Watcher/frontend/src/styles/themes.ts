// The themes a user can pick, from thalesgroup-cert/suspicious (suspicious-ui/src/styles/themes.ts). The ids and
// labels are the ones of accounts/themes.py: change both together.

export type ThemeName = 'light' | 'paper' | 'sunrise' | 'darkly' | 'graphite' | 'midnight' | 'slate' | 'high_contrast' | 'cyber' | 'the_one' | 'metal';

export interface Palette {
    bgDefault: string;
    bgPaper: string;
    primary: string;
    secondary: string;
    info: string;
    success: string;
    warning: string;
    error: string;
    text: string;
}

export interface ThemeDef {
    label: string;
    dark: boolean;
    /** Background of the navigation when it has its own colour (the Bootstrap navbar-dark on bg-primary of Darkly). */
    navbar?: string;
    /** A word shown under the name in the picker, such as 'Classic' for the look of the former interface. */
    badge?: string;
    palette: Palette;
}

// Light themes first, then the dark ones: this is the order of the picker.
export const THEMES: Record<ThemeName, ThemeDef> = {
    light: {
        label: 'Light',
        dark: false,
        palette: { bgDefault: '#F3F4F6', bgPaper: '#FFFFFF', primary: '#1B5FFF', secondary: '#0D766B', info: '#2563EB', success: '#067647', warning: '#B54708', error: '#C4281C', text: '#0B1220' },
    },
    paper: {
        label: 'Paper',
        dark: false,
        palette: { bgDefault: '#EDE8DF', bgPaper: '#FAF7F2', primary: '#0F4CFF', secondary: '#34495E', info: '#1D4ED8', success: '#056139', warning: '#7A4100', error: '#B42318', text: '#1A1209' },
    },
    sunrise: {
        label: 'Sunrise',
        dark: false,
        palette: { bgDefault: '#FFF0E8', bgPaper: '#FFFFFF', primary: '#F03D2F', secondary: '#FF8C00', info: '#0284C7', success: '#15803D', warning: '#D97706', error: '#DC2626', text: '#1A0A00' },
    },
    // The look of Watcher before the redesign (Bootswatch Darkly): #375a7f on #222222. The default of the application.
    darkly: {
        label: 'Darkly',
        dark: true,
        navbar: '#375A7F',
        badge: 'Classic',
        palette: { bgDefault: '#222222', bgPaper: '#303030', primary: '#375A7F', secondary: '#444444', info: '#3498DB', success: '#00BC8C', warning: '#F39C12', error: '#E74C3C', text: '#FFFFFF' },
    },
    graphite: {
        label: 'Graphite',
        dark: true,
        palette: { bgDefault: '#0A0C10', bgPaper: '#0F1318', primary: '#4FB3FF', secondary: '#7A9EB8', info: '#60A5FA', success: '#3DDC97', warning: '#F6C177', error: '#FF6B6B', text: '#E8EDF4' },
    },
    midnight: {
        label: 'Midnight',
        dark: true,
        palette: { bgDefault: '#03050D', bgPaper: '#070C1A', primary: '#4D8FFF', secondary: '#7BB3FF', info: '#60A5FA', success: '#22D67A', warning: '#F5A623', error: '#F56565', text: '#E6ECF8' },
    },
    slate: {
        label: 'Slate',
        dark: true,
        palette: { bgDefault: '#07101D', bgPaper: '#0C1828', primary: '#5D9EFF', secondary: '#6EC2F5', info: '#38BDF8', success: '#34D399', warning: '#FBBF24', error: '#F87171', text: '#D8E8F8' },
    },
    high_contrast: {
        label: 'High contrast',
        dark: true,
        palette: { bgDefault: '#000000', bgPaper: '#0A0A0A', primary: '#FFD600', secondary: '#FFFFFF', info: '#00E5FF', success: '#00FF88', warning: '#FFD600', error: '#FF3B30', text: '#FFFFFF' },
    },
    cyber: {
        label: 'Cyber',
        dark: true,
        palette: { bgDefault: '#020408', bgPaper: '#040810', primary: '#00E5FF', secondary: '#FF00CC', info: '#00FF88', success: '#00FF88', warning: '#FFD600', error: '#FF1744', text: '#D0EEFF' },
    },
    the_one: {
        label: 'The One',
        dark: true,
        palette: { bgDefault: '#060606', bgPaper: '#0C0C0C', primary: '#C9A84C', secondary: '#E8D5A3', info: '#6B9FD4', success: '#4CAF82', warning: '#E8A020', error: '#E05252', text: '#F2EDD8' },
    },
    metal: {
        label: 'Metal',
        dark: true,
        palette: { bgDefault: '#06080C', bgPaper: '#0A0F15', primary: '#E1061B', secondary: '#EDEDED', info: '#37D6C7', success: '#2DE39A', warning: '#F2C94C', error: '#E1061B', text: '#EDEDED' },
    },
};

export const THEME_NAMES = Object.keys(THEMES) as ThemeName[];

/** Used when nothing is stored: the look people knew before the redesign, whatever the OS prefers. */
export const DEFAULT_THEME: ThemeName = 'darkly';
/** A browser that stored only light or dark in the former interface keeps that choice. */
export const DEFAULT_LIGHT: ThemeName = 'light';
export const DEFAULT_DARK: ThemeName = 'darkly';

export const isThemeName = (value: unknown): value is ThemeName =>
    typeof value === 'string' && Object.prototype.hasOwnProperty.call(THEMES, value);
