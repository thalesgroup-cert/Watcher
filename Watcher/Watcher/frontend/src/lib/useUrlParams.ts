import { useLocation, useNavigate } from 'react-router';

type Value = string | number | null | undefined;

/** Query of the hash route as it is right now (`#/page?a=1` gives `a=1`), not as it was at the last render. */
const currentSearch = () => window.location.hash.split('?')[1] ?? '';

/**
 * Page state kept in the URL query (filters, tab, open object…). `update` replaces the history entry, so filtering
 * does not stack back-button steps; empty values (`null`, `undefined`, `''`) remove the parameter. It starts from the URL
 * of the moment, not of the last render, so two updates in a row both apply.
 */
export function useUrlParams() {
    const location = useLocation();
    const navigate = useNavigate();
    const params = new URLSearchParams(location.search);
    const update = (changes: Record<string, Value>) => {
        const next = new URLSearchParams(currentSearch());
        Object.entries(changes).forEach(([key, value]) => {
            if (value === null || value === undefined || value === '') next.delete(key);
            else next.set(key, String(value));
        });
        const search = next.toString();
        void navigate({ pathname: location.pathname, search: search ? `?${search}` : '' }, { replace: true });
    };
    return { params, update };
}
