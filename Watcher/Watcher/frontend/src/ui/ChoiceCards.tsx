import type { ReactNode } from 'react';
import { alpha, Box, ButtonBase, Typography } from '@mui/material';

export interface ChoiceOption<T extends string | number> {
    value: T;
    title: string;
    /** The figure that sets the choice apart (a range, a percentage), shown big. */
    figure?: ReactNode;
    /** One short line saying what the choice means. */
    hint?: string;
    icon?: ReactNode;
}

interface ChoiceCardsProps<T extends string | number> {
    value: T | null;
    onChange: (value: T) => void;
    options: ChoiceOption<T>[];
    /** Accessible name of the group. */
    label: string;
}

/**
 * A few choices shown as cards, each with its figure and its meaning, so that nobody has to guess what a level or a
 * threshold stands for. One is selected at a time (a radio group).
 */
export function ChoiceCards<T extends string | number>({ value, onChange, options, label }: ChoiceCardsProps<T>) {
    return (
        <Box
            role="radiogroup"
            aria-label={label}
            sx={{ display: 'grid', gap: 1, gridTemplateColumns: { xs: '1fr', sm: `repeat(${options.length}, minmax(0, 1fr))` } }}
        >
            {options.map((option) => {
                const selected = option.value === value;
                return (
                    <ButtonBase
                        key={String(option.value)}
                        role="radio"
                        aria-checked={selected}
                        onClick={() => onChange(option.value)}
                        sx={(theme) => ({
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'flex-start',
                            textAlign: 'left',
                            gap: 0.25,
                            p: 1.5,
                            borderRadius: 2.5,
                            border: '1px solid',
                            borderColor: selected ? theme.palette.primary.main : theme.palette.divider,
                            bgcolor: selected ? alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.16 : 0.08) : 'transparent',
                            boxShadow: selected ? `inset 0 0 0 1px ${theme.palette.primary.main}` : 'none',
                            transition: 'border-color 120ms, background-color 120ms',
                            '&:hover': { borderColor: theme.palette.primary.main },
                            '&.Mui-focusVisible': { outline: `2px solid ${theme.palette.primary.main}`, outlineOffset: 2 },
                        })}
                    >
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, color: selected ? 'primary.main' : 'text.secondary' }}>
                            {option.icon}
                            <Typography variant="overline" sx={{ lineHeight: 1.6, fontWeight: 700, color: 'inherit' }}>
                                {option.title}
                            </Typography>
                        </Box>
                        {option.figure !== undefined && (
                            <Typography variant="h3" component="div" sx={{ lineHeight: 1.2 }}>
                                {option.figure}
                            </Typography>
                        )}
                        {option.hint && (
                            <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.35 }}>
                                {option.hint}
                            </Typography>
                        )}
                    </ButtonBase>
                );
            })}
        </Box>
    );
}
