import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '../auth/store';
import { fetchOverview } from './api';

export const OVERVIEW_KEY = ['overview'];

/**
 * The whole Overview in one request. It waits for the session to be known (otherwise a signed-in person would first ask as a
 * visitor), and signing in or out gives another answer, so that is part of the key.
 */
export function useOverview(signedIn: boolean) {
    const checking = useAuthStore((s) => s.status === 'checking');
    return useQuery({ queryKey: [...OVERVIEW_KEY, signedIn], queryFn: fetchOverview, staleTime: 30_000, enabled: !checking });
}
