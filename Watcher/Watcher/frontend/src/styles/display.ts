import { createContext, useContext } from 'react';

/**
 * The settings of how the interface is laid out, apart from the theme: row density, text size, motion and chart colours.
 * They are kept in the browser and on the account (profile.preferences.display).
 */
export type Density = 'comfortable' | 'compact';
export type TextSize = 'small' | 'normal' | 'large';
/** `system` follows the operating system; `reduced` stills the interface whatever the system says. */
export type Motion = 'system' | 'reduced';
export type ChartColours = 'default' | 'colourblind';

export interface Display {
    density: Density;
    textSize: TextSize;
    motion: Motion;
    charts: ChartColours;
}

export const DEFAULT_DISPLAY: Display = { density: 'comfortable', textSize: 'normal', motion: 'system', charts: 'default' };

export const DENSITIES: Record<Density, { label: string; hint: string }> = {
    comfortable: { label: 'Comfortable', hint: 'Roomy table rows' },
    compact: { label: 'Compact', hint: 'More rows on the screen' },
};

/** How much the text of the interface is scaled. */
export const TEXT_SCALE: Record<TextSize, number> = { small: 0.92, normal: 1, large: 1.12 };

export const TEXT_SIZES: Record<TextSize, { label: string; hint: string }> = {
    small: { label: 'Small', hint: '8 % smaller' },
    normal: { label: 'Normal', hint: 'The default size' },
    large: { label: 'Large', hint: '12 % larger' },
};

export const CHART_COLOURS: Record<ChartColours, { label: string; hint: string }> = {
    default: { label: 'Default', hint: 'Blue, orange and green' },
    colourblind: { label: 'Colour-blind safe', hint: 'Colours that stay apart in the common kinds of colour blindness' },
};

export const DISPLAY_STORAGE_KEY = 'watcher.display';

const has = <T extends string>(options: Record<T, unknown>, value: unknown): value is T => typeof value === 'string' && value in options;

/** What was saved, whatever its shape: anything unknown falls back to the default of that setting. */
export function parseDisplay(value: unknown): Display {
    const source = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
    return {
        density: has(DENSITIES, source.density) ? source.density : DEFAULT_DISPLAY.density,
        textSize: has(TEXT_SIZES, source.textSize) ? source.textSize : DEFAULT_DISPLAY.textSize,
        motion: source.motion === 'reduced' ? 'reduced' : DEFAULT_DISPLAY.motion,
        charts: has(CHART_COLOURS, source.charts) ? source.charts : DEFAULT_DISPLAY.charts,
    };
}

export function readStoredDisplay(): Display {
    try {
        const stored = localStorage.getItem(DISPLAY_STORAGE_KEY);
        if (stored) return parseDisplay(JSON.parse(stored));
    } catch {
        /* storage unavailable or damaged: the defaults */
    }
    return DEFAULT_DISPLAY;
}
/** Read by the charts, which pick their colours from it. */
export const DisplayContext = createContext<Display>(DEFAULT_DISPLAY);
export const useDisplay = () => useContext(DisplayContext);
