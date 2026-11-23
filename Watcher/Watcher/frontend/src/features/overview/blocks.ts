import { useCallback, useState } from 'react';
import { useProfile, useUpdateProfile } from '../auth/hooks';
import { selectIsAuthenticated, useAuthStore } from '../auth/store';

/**
 * The blocks of the home page, in the order they are shown. The person chooses which ones to see; the choice is the list
 * of blocks hidden, kept on the account (profile.preferences.home.hidden) and in the browser, so that a block added by a
 * later release shows up for everyone.
 */
export type HomeBlockId = 'setup' | 'week' | 'brief' | 'attention' | 'modules' | 'feed' | 'vulnerabilities' | 'trending';

export interface HomeBlock {
    id: HomeBlockId;
    label: string;
    description: string;
    /** Needs an account: the data is not public (a visitor never sees the block, nor the choice). */
    signedIn?: boolean;
}

export const HOME_BLOCKS: HomeBlock[] = [
    { id: 'setup', label: 'Setup guide', description: 'The first steps of a new instance', signedIn: true },
    { id: 'week', label: 'This week', description: 'The greeting and the new detections of the last 7 days, module by module' },
    { id: 'brief', label: 'Intelligence brief', description: 'The latest AI summary: breaking news or the weekly report' },
    { id: 'attention', label: 'Needs your attention', description: 'What waits for a decision: matches, alerts and approvals to review, domains about to expire', signedIn: true },
    { id: 'modules', label: 'Modules', description: 'One card per module: figures, trend and what is new' },
    { id: 'feed', label: 'Latest detections', description: 'The newest findings of every module, in one list', signedIn: true },
    { id: 'vulnerabilities', label: 'Top vulnerabilities', description: 'The CVEs with the highest score of the last 30 days' },
    { id: 'trending', label: 'Trending now', description: 'The most mentioned words, ranked, with their reliability' },
];

/** Everything is shown until the person hides something. */
const HIDDEN_BY_DEFAULT: HomeBlockId[] = [];

const STORAGE_KEY = 'watcher.home.hidden';
const IDS = new Set<string>(HOME_BLOCKS.map((b) => b.id));
const known = (value: unknown): HomeBlockId[] => (Array.isArray(value) ? value.filter((id): id is HomeBlockId => typeof id === 'string' && IDS.has(id)) : []);

function readLocal(): HomeBlockId[] | null {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? known(JSON.parse(raw)) : null;
    } catch {
        return null;
    }
}

function writeLocal(hidden: HomeBlockId[]) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(hidden));
    } catch {
        /* storage unavailable: the choice is only kept on the account */
    }
}

export function useHomeBlocks() {
    const signedIn = useAuthStore(selectIsAuthenticated);
    const { data: profile } = useProfile();
    const update = useUpdateProfile();
    // The browser's own copy: all a visitor has, and what shows until the account's choice has loaded.
    const [local, setLocal] = useState<HomeBlockId[] | null>(readLocal);

    // Once the person has changed a block, their own list leads until the server refuses it: reading the account's copy back
    // would start every click from a list that does not have the previous one yet, and the last click would erase the others.
    const [changed, setChanged] = useState(false);

    const stored = (profile?.preferences?.home as { hidden?: unknown } | undefined)?.hidden;
    const fromAccount = signedIn && stored !== undefined && !changed;
    const hidden = new Set<HomeBlockId>(fromAccount ? known(stored) : (local ?? (signedIn && stored !== undefined ? known(stored) : HIDDEN_BY_DEFAULT)));

    const save = useCallback(
        (next: HomeBlockId[]) => {
            writeLocal(next);
            setLocal(next);
            setChanged(true);
            // The other preferences of the account are kept: the field is replaced as a whole.
            if (signedIn && profile) update.mutate({ preferences: { ...profile.preferences, home: { hidden: next } } }, { onError: () => setChanged(false) });
        },
        [signedIn, profile, update],
    );

    return {
        /** Blocks the person may choose among (a visitor has no account: only the public ones). */
        blocks: HOME_BLOCKS.filter((b) => signedIn || !b.signedIn),
        isShown: (id: HomeBlockId) => !hidden.has(id),
        hidden: [...hidden],
        setShown: (id: HomeBlockId, shown: boolean) => save(HOME_BLOCKS.map((b) => b.id).filter((blockId) => (blockId === id ? !shown : hidden.has(blockId)))),
        reset: () => save(HIDDEN_BY_DEFAULT),
    };
}
