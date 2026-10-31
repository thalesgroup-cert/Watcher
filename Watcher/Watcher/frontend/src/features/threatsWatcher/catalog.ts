import { isoToFlag } from '../../lib/countries';
import type { Level } from './types';

/** Source reliability (`Source.confident`): 1 is the most reliable, like core.get_confidence_score. */
export const CONFIDENCE: { value: number; label: string; percent: number; color: 'success' | 'warning' | 'default' }[] = [
    { value: 1, label: 'High', percent: 100, color: 'success' },
    { value: 2, label: 'Medium', percent: 50, color: 'warning' },
    { value: 3, label: 'Low', percent: 20, color: 'default' },
];
export const confidenceMeta = (value: number) => CONFIDENCE.find((c) => c.value === value) ?? CONFIDENCE[0];

/** Reliability of a word: the average of its sources (TrendyWord.score), in the same three bands as the API filter. */
export function scoreBand(score: number): { label: string; color: 'success' | 'warning' | 'error' } {
    if (score >= 70) return { label: 'High', color: 'success' };
    if (score > 30) return { label: 'Medium', color: 'warning' };
    return { label: 'Low', color: 'error' };
}

export const LEVELS: { value: Level; label: string; flames: number; description: string }[] = [
    { value: 'warm', label: 'Warm', flames: 1, description: 'Seen rarely' },
    { value: 'hot', label: 'Hot', flames: 2, description: 'Seen 3 times or more' },
    { value: 'super_hot', label: 'Super hot', flames: 3, description: 'Seen 10 times or more' },
];
export const levelMeta = (value: Level) => LEVELS.find((l) => l.value === value) ?? LEVELS[0];

export const countryLabel = (code: string, name: string) => [isoToFlag(code), name || code].filter(Boolean).join(' ');

/** Host of a URL without "www.", or the URL itself. */
export function hostOf(url: string): string {
    try {
        return new URL(url).hostname.replace(/^www\./, '');
    } catch {
        return url;
    }
}

/** HTTP state of a source at its last fetch. */
export function sourceState(code: number | null): { label: string; color: 'success' | 'error' | 'default' } {
    if (code === null) return { label: 'Not fetched yet', color: 'default' };
    if (code === 200) return { label: 'OK', color: 'success' };
    return { label: code === 0 ? 'Unreachable' : `HTTP ${code}`, color: 'error' };
}
