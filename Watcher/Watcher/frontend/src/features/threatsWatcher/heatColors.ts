import { useTheme } from '@mui/material';
import type { Heat } from './heat';

/** The colour of each heat in the current theme: orange for what is hot, fainter as it cools. */
export function useHeatColors(): Record<Heat, string> {
    const { palette } = useTheme();
    return {
        hot: palette.warning.main,
        rising: palette.warning.light,
        new: palette.info.main,
        steady: palette.text.secondary,
        fading: palette.text.disabled,
        quiet: palette.text.disabled,
    };
}
