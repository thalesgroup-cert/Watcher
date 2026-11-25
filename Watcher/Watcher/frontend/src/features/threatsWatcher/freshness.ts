/** A breaking news is shown for the 24 hours that follow its generation, then it is taken off: one rule for Threats Watcher and the Overview. */
export const BREAKING_LIFETIME_MS = 24 * 60 * 60 * 1000;

export const isBreakingFresh = (createdAt: string | null | undefined): boolean => {
    const written = createdAt ? new Date(createdAt).getTime() : NaN;
    return Number.isFinite(written) && Date.now() - written < BREAKING_LIFETIME_MS;
};
