import { useState } from 'react';
import { Box, Button, Link, Skeleton, Stack, Typography } from '@mui/material';
import CasinoOutlined from '@mui/icons-material/CasinoOutlined';
import UserAvatar, { displayName } from '../../../components/common/UserAvatar';
import { notifySuccess } from '../../../lib/notify';
import {
    AVATAR_STYLES,
    initialsOf,
    randomSeed,
    renderAvatar,
    styleCategories,
    styleCredit,
    type AvatarConfig,
    type AvatarStyleKey,
} from '../avatar';
import { useProfile, useUpdateProfile } from '../hooks';
import { selectUser, useAuthStore } from '../store';
import type { Profile } from '../types';

const CHOICES = 12;
// MySQL gives the keys of a JSON field back in its own order, so avatars are compared field by field.
const keyOf = (c: AvatarConfig | null) =>
    c ? `${c.style}|${c.seed}|${Object.entries(c.options ?? {}).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}:${v.join(',')}`).join(';')}` : '';
const same = (a: AvatarConfig | null, b: AvatarConfig | null) => keyOf(a) === keyOf(b);

/** A dozen ready-made avatars of a style. The Initials style has no seed: its choices are the colours behind the letters. */
function choicesOf(style: AvatarStyleKey, initials: string, first?: AvatarConfig | null): AvatarConfig[] {
    if (style === 'initials') {
        const palette = styleCategories('initials').find((c) => c.key === 'backgroundColor')?.values ?? [];
        return palette.slice(0, CHOICES).map((hex) => ({ style, seed: initials, options: { backgroundColor: [hex] } }));
    }
    const others = Array.from({ length: CHOICES }, () => ({ style, seed: randomSeed(), options: {} }));
    // The avatar already chosen stays first, so opening the editor shows it among the choices.
    return first?.style === style ? [first, ...others.slice(1)] : others;
}

/** Picks the avatar: a style, then one of a dozen ready-made avatars of that style. */
export function AvatarEditor() {
    const { data: profile } = useProfile();
    // The gallery starts from the saved avatar, so it waits for the profile.
    return profile ? <AvatarPicker profile={profile} /> : <Skeleton variant="rounded" height={320} />;
}

function AvatarPicker({ profile }: { profile: Profile }) {
    const user = useAuthStore(selectUser);
    const update = useUpdateProfile();
    const saved = profile.avatar ?? null;
    const initials = user ? initialsOf(user.first_name, user.last_name, user.username) : '?';
    const [style, setStyle] = useState<AvatarStyleKey>(saved?.style ?? 'bottts');
    const [choices, setChoices] = useState(() => choicesOf(saved?.style ?? 'bottts', initials, saved));
    const [picked, setPicked] = useState<AvatarConfig | null>(null);

    if (!user) return null;
    const shown = picked ?? saved;
    const dirty = picked !== null && !same(picked, saved);
    const credit = styleCredit(style);
    const styleLabel = AVATAR_STYLES.find((s) => s.key === style)?.label ?? style;

    const chooseStyle = (next: AvatarStyleKey) => {
        setStyle(next);
        setChoices(choicesOf(next, initials, saved));
        setPicked(null);
    };
    const save = () => picked && update.mutate({ avatar: picked }, { onSuccess: () => { setPicked(null); notifySuccess('Avatar saved'); } });
    const useInitials = () => update.mutate({ avatar: null }, { onSuccess: () => { setPicked(null); notifySuccess('Back to your initials'); } });

    return (
        <Box component="section" aria-label="Avatar">
            <Box sx={{ display: 'grid', gap: 3, gridTemplateColumns: { xs: '1fr', md: '200px 1fr' }, alignItems: 'start' }}>
                <Stack spacing={1.5} sx={{ alignItems: 'center' }}>
                    <UserAvatar
                        username={user.username}
                        firstName={user.first_name}
                        lastName={user.last_name}
                        avatarColor={profile.avatar_color ?? null}
                        avatar={shown}
                        size={136}
                        tooltip={false}
                    />
                    <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
                        {displayName(user.first_name, user.last_name, user.username)}
                    </Typography>
                    {saved && (
                        <Button size="small" color="inherit" onClick={useInitials} disabled={update.isPending} sx={{ color: 'text.secondary' }}>
                            Use my initials
                        </Button>
                    )}
                </Stack>

                <Box>
                    <Typography variant="overline" color="text.secondary" component="h3" sx={{ display: 'block', mb: 1 }}>
                        Style
                    </Typography>
                    <Box role="radiogroup" aria-label="Avatar style" sx={{ display: 'grid', gap: 1, gridTemplateColumns: 'repeat(auto-fill, minmax(88px, 1fr))' }}>
                        {AVATAR_STYLES.map((s) => (
                            <Box
                                key={s.key}
                                component="button"
                                type="button"
                                role="radio"
                                aria-checked={style === s.key}
                                aria-label={`Avatar style ${s.label}`}
                                onClick={() => chooseStyle(s.key)}
                                sx={{
                                    p: 1,
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    gap: 0.5,
                                    cursor: 'pointer',
                                    bgcolor: 'transparent',
                                    color: 'text.primary',
                                    font: 'inherit',
                                    borderRadius: 2,
                                    border: 2,
                                    borderStyle: 'solid',
                                    borderColor: style === s.key ? 'primary.main' : 'divider',
                                    '&:hover': { borderColor: 'primary.main' },
                                }}
                            >
                                <img src={renderAvatar({ style: s.key, seed: s.key === 'initials' ? initials : 'watcher', options: {} })} alt="" width={48} height={48} style={{ borderRadius: '50%' }} />
                                <Typography variant="caption" noWrap sx={{ maxWidth: '100%' }}>
                                    {s.label}
                                </Typography>
                            </Box>
                        ))}
                    </Box>

                    <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', mt: 3, mb: 1 }}>
                        <Typography variant="overline" color="text.secondary" component="h3">
                            Pick one
                        </Typography>
                        {style !== 'initials' && (
                            <Button size="small" color="inherit" startIcon={<CasinoOutlined />} onClick={() => setChoices(choicesOf(style, initials))} sx={{ color: 'text.secondary' }}>
                                Show others
                            </Button>
                        )}
                    </Stack>
                    <Box role="radiogroup" aria-label={`${styleLabel} avatars`} sx={{ display: 'grid', gap: 1, gridTemplateColumns: 'repeat(auto-fill, minmax(72px, 1fr))' }}>
                        {choices.map((choice, i) => {
                            const active = same(picked ?? saved, choice);
                            return (
                                <Box
                                    key={`${choice.seed}-${i}`}
                                    component="button"
                                    type="button"
                                    role="radio"
                                    aria-checked={active}
                                    aria-label={`${styleLabel} avatar ${i + 1}`}
                                    onClick={() => setPicked(choice)}
                                    sx={{
                                        p: 0.75,
                                        cursor: 'pointer',
                                        bgcolor: 'transparent',
                                        borderRadius: 2,
                                        border: 2,
                                        borderStyle: 'solid',
                                        borderColor: active ? 'primary.main' : 'transparent',
                                        '&:hover': { borderColor: 'primary.main' },
                                        lineHeight: 0,
                                    }}
                                >
                                    <img src={renderAvatar(choice)} alt="" width={56} height={56} style={{ borderRadius: '50%' }} />
                                </Box>
                            );
                        })}
                    </Box>
                </Box>
            </Box>

            <Stack direction="row" spacing={1} sx={{ mt: 3, alignItems: 'center', flexWrap: 'wrap', rowGap: 1 }}>
                <Button variant="contained" disabled={!dirty || update.isPending} onClick={save}>
                    Save avatar
                </Button>
                {picked && (
                    <Button variant="outlined" color="inherit" onClick={() => setPicked(null)}>
                        Cancel
                    </Button>
                )}
                {credit.attribution && (
                    <Typography variant="caption" color="text.secondary" sx={{ ml: { md: 1 } }}>
                        {styleLabel} by {credit.creator} -{' '}
                        <Link href={credit.url} target="_blank" rel="noopener noreferrer" color="inherit">
                            {credit.license}
                        </Link>
                    </Typography>
                )}
            </Stack>
        </Box>
    );
}
