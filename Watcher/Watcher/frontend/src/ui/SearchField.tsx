import { useEffect, useRef, useState } from 'react';
import { InputAdornment, TextField, Typography } from '@mui/material';
import Search from '@mui/icons-material/Search';

const SEARCH_DEBOUNCE_MS = 400;

/** The count of a list query, once it is the answer to the current search and not the previous one. */
export const countOf = (query: { data?: { count: number }; isPlaceholderData: boolean }) =>
    query.isPlaceholderData ? undefined : query.data?.count;

const QUOTED_MAX = 24;

interface SearchFieldProps {
    value: string;
    /** Called once typing pauses, so each keystroke does not hit the API or the URL. */
    onChange: (value: string) => void;
    placeholder?: string;
    ariaLabel: string;
    /** Number of results of the search `value`; with it, a small "3 results for ..." is shown next to the box. */
    resultCount?: number;
}

/** Search box of a filter toolbar, debounced. */
export function SearchField({ value, onChange, placeholder = 'Search…', ariaLabel, resultCount }: SearchFieldProps) {
    const [text, setText] = useState(value);
    const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
    useEffect(() => () => clearTimeout(timer.current), []);

    // Follows outside changes (filters cleared, back navigation).
    const [prev, setPrev] = useState(value);
    if (value !== prev) {
        setPrev(value);
        setText(value);
    }

    const term = value.trim();
    const quoted = term.length > QUOTED_MAX ? `${term.slice(0, QUOTED_MAX)}…` : term;

    return (
        <>
            <TextField
                size="small"
                placeholder={placeholder}
                value={text}
                onChange={(e) => {
                    const next = e.target.value;
                    setText(next);
                    clearTimeout(timer.current);
                    timer.current = setTimeout(() => onChange(next), SEARCH_DEBOUNCE_MS);
                }}
                sx={{ minWidth: 220, flexGrow: { xs: 1, md: 0 } }}
                slotProps={{
                    htmlInput: { 'aria-label': ariaLabel },
                    input: {
                        startAdornment: (
                            <InputAdornment position="start">
                                <Search fontSize="small" />
                            </InputAdornment>
                        ),
                    },
                }}
            />
            {term && resultCount !== undefined && (
                <Typography variant="caption" color="text.secondary" role="status" data-testid="search-count" sx={{ whiteSpace: 'nowrap' }}>
                    {resultCount.toLocaleString('en-GB')} {resultCount === 1 ? 'result' : 'results'} for "{quoted}"
                </Typography>
            )}
        </>
    );
}
