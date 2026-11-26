import { ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import { useThemeMode } from '../../../styles/ThemeModeProvider';
import { EFFECT_NAMES, EFFECTS, prefersReducedMotion } from '../../../styles/effects';

/** How much the background of the themes that have one (Clay) moves: full, calm or off. */
export function EffectsPicker() {
    const { effects, setEffects } = useThemeMode();
    const reduced = prefersReducedMotion();

    return (
        <>
            <ToggleButtonGroup
                exclusive
                size="small"
                value={effects}
                aria-label="Background effects"
                onChange={(_, level: typeof effects | null) => level && setEffects(level)}
            >
                {EFFECT_NAMES.map((level) => (
                    <ToggleButton key={level} value={level} data-testid={`effects-${level}`} sx={{ px: 2, textTransform: 'none', fontWeight: 650 }}>
                        {EFFECTS[level].label}
                    </ToggleButton>
                ))}
            </ToggleButtonGroup>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1.25 }}>
                {EFFECTS[effects].description}.
                {reduced && effects === 'full' ? ' Your system asks for less motion, so the glows stay still.' : ''}
            </Typography>
        </>
    );
}
