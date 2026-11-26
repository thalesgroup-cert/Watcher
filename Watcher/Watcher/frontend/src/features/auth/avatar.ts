import { createAvatar } from '@dicebear/core';
import * as avataaars from '@dicebear/avataaars';
import * as bottts from '@dicebear/bottts';
import * as funEmoji from '@dicebear/fun-emoji';
import * as identicon from '@dicebear/identicon';
import * as initials from '@dicebear/initials';
import * as notionists from '@dicebear/notionists';
import * as shapes from '@dicebear/shapes';
import * as thumbs from '@dicebear/thumbs';

// The keys are the ones of accounts/avatar.py: change both together.
export type AvatarStyleKey = 'bottts' | 'identicon' | 'initials' | 'avataaars' | 'funEmoji' | 'thumbs' | 'shapes' | 'notionists';

/** What is stored on the profile: a DiceBear style, a seed and the options that were chosen by hand. */
export interface AvatarConfig {
    style: AvatarStyleKey;
    seed: string;
    options?: Record<string, string[]>;
}

interface StyleMeta {
    title?: string;
    creator?: string;
    source?: string;
    license?: { name: string; url: string };
}

interface StyleDefinition {
    key: AvatarStyleKey;
    label: string;
    style: unknown;
}

export const AVATAR_STYLES: StyleDefinition[] = [
    { key: 'bottts', label: 'Bottts', style: bottts },
    { key: 'identicon', label: 'Identicon', style: identicon },
    { key: 'initials', label: 'Initials', style: initials },
    { key: 'avataaars', label: 'Avataaars', style: avataaars },
    { key: 'funEmoji', label: 'Fun Emoji', style: funEmoji },
    { key: 'thumbs', label: 'Thumbs', style: thumbs },
    { key: 'shapes', label: 'Shapes', style: shapes },
    { key: 'notionists', label: 'Notionists', style: notionists },
];

const BY_KEY = new Map(AVATAR_STYLES.map((s) => [s.key, s.style]));

const cache = new Map<string, string>();

/** The avatar as a `data:` image, or '' for a style that is not known. Drawn in the browser, nothing is fetched. */
export function renderAvatar(config: AvatarConfig): string {
    const style = BY_KEY.get(config.style);
    if (!style) return '';
    const options = config.options ?? {};
    const key = `${config.style}|${config.seed}|${JSON.stringify(options)}`;
    const hit = cache.get(key);
    if (hit !== undefined) return hit;
    const uri = createAvatar(style as never, { seed: config.seed, ...options }).toDataUri();
    if (cache.size > 300) cache.clear();
    cache.set(key, uri);
    return uri;
}

/** Who drew the style and under which licence: a style under CC BY has to be credited. */
export function styleCredit(key: AvatarStyleKey): { creator: string; license: string; url: string; attribution: boolean } {
    const meta = ((BY_KEY.get(key) as { meta?: StyleMeta } | undefined)?.meta ?? {}) as StyleMeta;
    const license = meta.license?.name ?? '';
    return {
        creator: meta.creator ?? 'DiceBear',
        license,
        url: meta.license?.url ?? meta.source ?? '',
        attribution: /^CC BY/i.test(license),
    };
}

export interface StyleCategory {
    key: string;
    label: string;
    /** `enum`: a part to pick by name. `color`: a palette of hex colours (without the #). */
    kind: 'enum' | 'color';
    values: string[];
}

const categoryCache = new Map<AvatarStyleKey, StyleCategory[]>();

function prettify(key: string): string {
    const spaced = key.replace(/([A-Z])/g, ' $1').trim();
    return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** The settings a style offers, read from its own schema. */
export function styleCategories(key: AvatarStyleKey): StyleCategory[] {
    const hit = categoryCache.get(key);
    if (hit) return hit;
    const schema = (BY_KEY.get(key) as { schema?: { properties?: Record<string, unknown> } } | undefined)?.schema;
    const categories: StyleCategory[] = [];
    for (const [name, raw] of Object.entries(schema?.properties ?? {})) {
        const prop = raw as { type?: string; items?: { enum?: unknown[]; pattern?: string }; default?: unknown[] };
        if (prop.type !== 'array') continue;
        if (prop.items?.pattern) {
            const palette = (prop.default ?? []).filter((v): v is string => typeof v === 'string' && /^[0-9a-fA-F]{3,8}$/.test(v));
            if (palette.length) categories.push({ key: name, label: prettify(name), kind: 'color', values: palette });
        } else if (Array.isArray(prop.items?.enum) && prop.items.enum.every((v) => typeof v === 'string')) {
            categories.push({ key: name, label: prettify(name), kind: 'enum', values: prop.items.enum as string[] });
        }
    }
    categoryCache.set(key, categories);
    return categories;
}

export const randomSeed = () => Math.random().toString(36).slice(2, 12);

/** The seed of the Initials style is the person's initials, so the letters on the avatar are theirs. */
export function initialsOf(firstName?: string, lastName?: string, username?: string): string {
    if (firstName && lastName) return `${firstName[0]}${lastName[0]}`.toUpperCase();
    if (firstName) return firstName.slice(0, 2).toUpperCase();
    return (username ?? '?').slice(0, 2).toUpperCase();
}
