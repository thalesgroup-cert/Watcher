import { useEffect, useState } from 'react';
import { Box, Button, Stack, Tooltip } from '@mui/material';
import { keyframes } from '@mui/material/styles';
import RefreshOutlined from '@mui/icons-material/RefreshOutlined';
import { useAuthStore } from '../../auth/store';
import { useSummaryConfig } from '../hooks';
import type { Summary } from '../types';
import { GeneratedBadges } from './SummaryBadges';

const turn = keyframes`to { transform: rotate(360deg); }`;
const blink = keyframes`0%, 80%, 100% { opacity: 1; } 40% { opacity: 0; }`;

/** What turns while something is being written: the arrow of the button. */
export const TURNING = { animation: `${turn} 1s linear infinite` } as const;

/** Three dots that blink one after the other, after "Writing": the work is under way. */
export function Dots() {
    return (
        <Box
            component="span"
            aria-hidden
            data-testid="writing-dots"
            sx={{ display: 'inline-flex', ml: 0.25, '& span': { animation: `${blink} 1.2s infinite`, mr: '1px' }, '& span:nth-of-type(2)': { animationDelay: '0.3s' }, '& span:nth-of-type(3)': { animationDelay: '0.6s' } }}
        >
            <span>.</span>
            <span>.</span>
            <span>.</span>
        </Box>
    );
}

const minutesText = (minutes: number) => (minutes >= 60 && minutes % 60 === 0 ? `${minutes / 60} h` : `${minutes} min`);

/** Minutes left before a summary written at `writtenAt` can be written again (0 when it can). */
function minutesLeft(writtenAt: string | undefined, cooldown: number | undefined, now: number) {
    if (!writtenAt || !cooldown) return 0;
    return Math.max(0, Math.ceil(cooldown - (now - new Date(writtenAt).getTime()) / 60_000));
}

/**
 * Writes a summary again with the AI. It stays off while the waiting time since the last writing runs, and says how
 * many minutes are left; the server keeps the same rule (it answers 429).
 */
export function RegenerateButton({ onClick, pending, writtenAt, label = 'Regenerate' }: { onClick: () => void; pending: boolean; writtenAt?: string; label?: string }) {
    const signedIn = useAuthStore((s) => s.signedIn);
    const cooldown = useSummaryConfig().data?.regenerate_cooldown_minutes;
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        const timer = window.setInterval(() => setNow(Date.now()), 10_000);
        return () => window.clearInterval(timer);
    }, []);
    // Writing a summary costs an AI call: it is for the people who signed in, a visitor does not even see the button
    if (!signedIn) return null;
    const left = minutesLeft(writtenAt, cooldown, now);
    const disabled = pending || left > 0;
    const title = left > 0
        ? `Please wait ${left} minute(s) before the next regeneration.`
        : `Writes it again from the latest articles${cooldown ? `. Possible once every ${minutesText(cooldown)}.` : '.'}`;
    return (
        <Tooltip title={title}>
            {/* The disabled button ignores the pointer: the cursor that says "not now" is the one of what holds it */}
            <span style={{ cursor: disabled ? 'not-allowed' : undefined }}>
                <Button
                    size="small"
                    color="inherit"
                    startIcon={<RefreshOutlined fontSize="small" sx={pending ? TURNING : undefined} />}
                    disabled={disabled}
                    onClick={onClick}
                    data-testid="regenerate-summary"
                    sx={{ color: 'text.secondary', '&.Mui-disabled': { color: pending ? 'text.secondary' : 'text.disabled' } }}
                >
                    {pending ? (
                        <>
                            Writing
                            <Dots />
                        </>
                    ) : (
                        label
                    )}
                </Button>
            </span>
        </Tooltip>
    );
}

/** Under a summary: when it was written, by which model, and the button to write it again. */
export function SummaryFooter({ summary, onRegenerate, pending }: { summary: Summary; onRegenerate: () => void; pending: boolean }) {
    return (
        <Stack
            direction="row"
            data-testid="summary-footer"
            sx={{ alignItems: 'center', justifyContent: 'space-between', gap: 1, flexWrap: 'wrap', mt: 2, pt: 1.5, borderTop: 1, borderColor: 'divider' }}
        >
            <GeneratedBadges summary={summary} />
            <RegenerateButton onClick={onRegenerate} pending={pending} writtenAt={summary.updated_at || summary.created_at} />
        </Stack>
    );
}
