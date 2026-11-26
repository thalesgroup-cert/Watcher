import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { fetchSearch } from './api';

export const MIN_LENGTH = 2;
const DELAY_MS = 250;

/** The text once the person has stopped typing for a moment. */
export function useDebounced(value: string, delay = DELAY_MS) {
    const [debounced, setDebounced] = useState(value);
    useEffect(() => {
        const timer = setTimeout(() => setDebounced(value), delay);
        return () => clearTimeout(timer);
    }, [value, delay]);
    return debounced;
}

export function useSearch(query: string) {
    const text = query.trim();
    return useQuery({
        queryKey: ['search', text],
        queryFn: ({ signal }) => fetchSearch(text, signal),
        enabled: text.length >= MIN_LENGTH,
        staleTime: 30_000,
    });
}
