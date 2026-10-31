import { useEffect, useRef, useState } from 'react';
import { Chip, Stack, TextField } from '@mui/material';

/** `YYYY-MM-DD` in local time (what the date input and the API exchange). */
export function toIsoDate(date: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** `YYYY-MM-DD` shown as `DD/MM/YYYY`: the native date input follows the browser language, this one does not. */
function toDisplay(iso: string): string {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
    return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}

/** `YYYY-MM-DD` of a typed `DD/MM/YYYY` (or with . or -), null when it is not a real day. */
function parseDisplay(text: string): string | null {
    const m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(text.trim());
    if (!m) return null;
    const [day, month, year] = [Number(m[1]), Number(m[2]), Number(m[3])];
    const date = new Date(year, month - 1, day);
    const real = date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
    return real ? toIsoDate(date) : null;
}

function inMonths(months: number): string {
    const date = new Date();
    date.setMonth(date.getMonth() + months);
    return toIsoDate(date);
}

const SHORTCUTS = [
    { label: '+1 month', months: 1 },
    { label: '+3 months', months: 3 },
    { label: '+6 months', months: 6 },
    { label: '+1 year', months: 12 },
];

interface DateFieldProps {
    label: string;
    /** `YYYY-MM-DD`, or '' when empty or not a valid date yet. */
    value: string;
    onChange: (value: string) => void;
    helperText?: string;
    /** Quick picks relative to today, for future dates (expiries). */
    shortcuts?: boolean;
    /** Refuse dates after today (e.g. a registration date). */
    pastOnly?: boolean;
    name?: string;
}

export function DateField({ label, value, onChange, helperText, shortcuts = false, pastOnly = false, name }: DateFieldProps) {
    const [text, setText] = useState(toDisplay(value));
    const emitted = useRef(value);
    // A value set from outside (a shortcut, a reset) replaces what was typed; what this field sent itself does not.
    useEffect(() => {
        if (value !== emitted.current) {
            emitted.current = value;
            setText(toDisplay(value));
        }
    }, [value]);

    const typed = parseDisplay(text);
    const error = text.trim() !== '' && (typed === null ? 'Use DD/MM/YYYY' : pastOnly && typed > toIsoDate(new Date()) ? 'This date cannot be in the future' : null);

    return (
        <Stack spacing={0.75}>
            <TextField
                label={label}
                name={name}
                value={text}
                onChange={(e) => {
                    const next = parseDisplay(e.target.value) ?? '';
                    setText(e.target.value);
                    emitted.current = next;
                    onChange(next);
                }}
                placeholder="DD/MM/YYYY"
                error={!!error}
                helperText={error || helperText}
                fullWidth
                slotProps={{ inputLabel: { shrink: true }, htmlInput: { inputMode: 'numeric', autoComplete: 'off' } }}
            />
            {shortcuts && (
                <Stack direction="row" spacing={0.75} sx={{ flexWrap: 'wrap' }} role="group" aria-label={`${label} shortcuts`}>
                    {SHORTCUTS.map(({ label: text, months }) => (
                        <Chip key={text} label={text} size="small" variant="outlined" onClick={() => onChange(inMonths(months))} />
                    ))}
                </Stack>
            )}
        </Stack>
    );
}
