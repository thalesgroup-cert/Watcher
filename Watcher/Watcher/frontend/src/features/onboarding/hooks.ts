import { useProfile, useUpdateProfile } from '../auth/hooks';

interface StoredOnboarding {
    dismissed?: boolean;
    tours_seen?: string[];
}

/** Setup guide and page tours of the signed-in user, kept in the profile so they follow the account across browsers. */
export function useOnboarding() {
    const { data: profile } = useProfile();
    const update = useUpdateProfile();
    const stored = (profile?.preferences?.onboarding ?? {}) as StoredOnboarding;
    const dismissed = !!stored.dismissed;
    const toursSeen = stored.tours_seen ?? [];

    const save = (next: StoredOnboarding) => {
        if (!profile) return;
        update.mutate({ preferences: { ...profile.preferences, onboarding: { dismissed, tours_seen: toursSeen, ...next } } });
    };

    return {
        /** False until the profile has loaded, so the guide does not flash for people who already hid it. */
        ready: !!profile,
        dismissed,
        toursSeen,
        setDismissed: (value: boolean) => save({ dismissed: value }),
        markTourSeen: (id: string) => {
            if (!toursSeen.includes(id)) save({ tours_seen: [...toursSeen, id] });
        },
    };
}
