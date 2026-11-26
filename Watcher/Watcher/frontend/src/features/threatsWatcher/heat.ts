import type { Word } from './types';

/** How a word is doing now, in one word: the last 24 hours against the daily average of the 6 days before. */
export type Heat = 'hot' | 'rising' | 'new' | 'steady' | 'fading' | 'quiet';

type Figures = Pick<Word, 'mentions_24h' | 'mentions_week'>;

/** Whether the figures of the heat are there: a word that comes without them has no heat to tell, and the page never writes "undefined" or "NaN". */
export const hasFigures = (word: Partial<Figures>): boolean => Number.isFinite(word.mentions_24h) && Number.isFinite(word.mentions_week);

/** Articles a day over the 6 days before today. */
export function usualDay(word: Figures): number {
    return (word.mentions_week - word.mentions_24h) / 6;
}

/**
 * Hot: at least 5 articles today, and none the days before or three times the usual. Rising: at least 1.5 times the usual.
 * New: first articles. Steady: about the usual. Fading: fewer than usual, or none today. Quiet: nothing this week.
 */
export function heatOf(word: Figures): Heat {
    if (!hasFigures(word)) return 'quiet';
    const today = word.mentions_24h;
    const usual = usualDay(word);
    if (today === 0) return word.mentions_week > 0 ? 'fading' : 'quiet';
    if (usual === 0) return today >= 5 ? 'hot' : 'new';
    const factor = today / usual;
    if (factor >= 3 && today >= 5) return 'hot';
    if (factor >= 1.5) return 'rising';
    if (factor <= 0.67) return 'fading';
    return 'steady';
}

export const HEAT_LABEL: Record<Heat, string> = { hot: 'Hot', rising: 'Rising', new: 'New', steady: 'Steady', fading: 'Fading', quiet: 'Quiet' };

/** What a normal day looks like for the word, in words and whole numbers: "normally less than 1 a day", "normally about 3 a day". */
export function usualText(word: Figures): string {
    const usual = usualDay(word);
    if (usual === 0) return 'not seen the days before';
    if (usual < 1) return 'normally less than 1 a day';
    return `normally about ${Math.round(usual)} a day`;
}

/** The figures of the heat in a sentence: "8 articles in the last 24 h, normally less than 1 a day". */
export function heatSentence(word: Figures): string {
    if (!hasFigures(word)) return '';
    const today = word.mentions_24h;
    if (today === 0) return 'No article in the last 24 h';
    return `${today} article${today === 1 ? '' : 's'} in the last 24 h, ${usualText(word)}`;
}
