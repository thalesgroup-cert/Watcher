/**
 * How much the themes with a backdrop (Clay) move: `full` drifting glows, a spotlight that follows the pointer and a ripple
 * at each click; `calm` the glows only, still; `off` a plain background and solid panels, the lightest on an old machine.
 * The choice is kept in the browser and on the account (profile.preferences.effects).
 */
export type Effects = 'full' | 'calm' | 'off';

export const EFFECTS: Record<Effects, { label: string; description: string }> = {
    full: { label: 'Full', description: 'Drifting glows, a spotlight that follows the pointer and a ripple at each click' },
    calm: { label: 'Calm', description: 'Still glows, no motion and nothing that follows the pointer' },
    off: { label: 'Off', description: 'Plain background and solid panels, the lightest on an old computer' },
};

export const EFFECT_NAMES = Object.keys(EFFECTS) as Effects[];

export const EFFECTS_STORAGE_KEY = 'watcher.effects';

export const isEffects = (value: unknown): value is Effects => typeof value === 'string' && value in EFFECTS;

/** A small machine (two cores or fewer, 2 GB or less) starts calm: the person can still turn the effects up. */
export function defaultEffects(): Effects {
    const nav = navigator as Navigator & { deviceMemory?: number };
    return (nav.hardwareConcurrency ?? 8) <= 2 || (nav.deviceMemory ?? 8) <= 2 ? 'calm' : 'full';
}

export function readStoredEffects(): Effects {
    try {
        const stored = localStorage.getItem(EFFECTS_STORAGE_KEY);
        if (isEffects(stored)) return stored;
    } catch {
        /* storage unavailable: the default level */
    }
    return defaultEffects();
}

// Set by the theme provider when the person asked to reduce animations (Appearance > Display)
let reducedMotionAsked = false;
export const setReducedMotionAsked = (asked: boolean) => {
    reducedMotionAsked = asked;
};

/** A system that asks for less motion, or a person who did, gets the still glows, whatever the choice. */
export const prefersReducedMotion = () =>
    reducedMotionAsked || (typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
