import { useState } from 'react';
import { FormControlLabel, Slider, Stack, Switch, Typography } from '@mui/material';
import { useSaveSummaryCooldown, useSummaryConfig } from '../../threatsWatcher/hooks';
import { useProfile, useUpdateProfile } from '../hooks';
import { selectUser, useAuthStore } from '../store';

const COOLDOWNS = [1, 5, 10, 15, 30, 60, 120, 240, 480, 720, 1440];
const cooldownText = (minutes: number) => (minutes >= 60 ? `${minutes / 60} h` : `${minutes} min`);

/** How the AI summaries appear (typewriter), and, for superusers, how often anyone may write one again. */
export function AiPreferences() {
    const profile = useProfile().data;
    const update = useUpdateProfile();
    const isSuperuser = !!useAuthStore(selectUser)?.is_superuser;
    const config = useSummaryConfig().data;
    const save = useSaveSummaryCooldown();
    const saved = config?.regenerate_cooldown_minutes ?? 60;
    const [draft, setDraft] = useState<number | null>(null);
    const index = Math.max(0, COOLDOWNS.indexOf(draft ?? saved));

    return (
        <Stack spacing={2.5}>
            <Stack spacing={0.5}>
                <FormControlLabel
                    control={<Switch checked={profile?.typewriter_enabled !== false} onChange={(e) => update.mutate({ typewriter_enabled: e.target.checked })} />}
                    label={<Typography variant="body2">Typewriter effect</Typography>}
                />
                <Typography variant="caption" color="text.secondary">
                    Writes each new AI summary out progressively, once. Turn it off to show it at once. Never used when your system asks for less motion.
                </Typography>
            </Stack>
            {isSuperuser && (
                <Stack spacing={0.5} sx={{ maxWidth: 560 }}>
                    <Typography variant="overline" color="text.secondary">
                        Waiting time between two regenerations (everyone)
                    </Typography>
                    <Slider
                        aria-label="Regeneration cooldown"
                        value={index}
                        min={0}
                        max={COOLDOWNS.length - 1}
                        step={1}
                        marks={COOLDOWNS.map((_, i) => ({ value: i }))}
                        valueLabelDisplay="on"
                        valueLabelFormat={(i) => cooldownText(COOLDOWNS[i])}
                        disabled={save.isPending}
                        onChange={(_, i) => setDraft(COOLDOWNS[i as number])}
                        onChangeCommitted={(_, i) => {
                            save.mutate(COOLDOWNS[i as number], { onSettled: () => setDraft(null) });
                        }}
                        sx={{ mt: 5.5 }}
                    />
                    <Typography variant="caption" color="text.secondary">
                        How long anyone must wait before using Regenerate again on a summary. It applies to all users.
                    </Typography>
                </Stack>
            )}
        </Stack>
    );
}
