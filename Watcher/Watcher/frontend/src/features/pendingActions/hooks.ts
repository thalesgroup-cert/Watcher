import { useMutation, useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import { queryClient } from '../../api/queryClient';
import { notifyError, notifySuccess } from '../../lib/notify';
import { invalidateLegitimateDomains } from '../legitimateDomains/hooks';
import { invalidateSiteMonitoring } from '../siteMonitoring/hooks';

/** An action Watcher prepared and waits for someone to approve (a UDRP transfer, a failing connector). */
export interface PendingAction {
    id: number;
    action_type: string;
    action_type_label: string;
    status: 'pending' | 'approved' | 'rejected';
    title: string;
    description: string;
    metadata: Record<string, unknown>;
    created_at: string;
    resolved_at: string | null;
    resolved_by_username: string | null;
}

const BASE = '/api/common/pending_actions/';
const KEY = ['pendingActions'] as const;
const POLL_MS = 60_000;

export function usePendingCount(enabled: boolean) {
    return useQuery({
        queryKey: [...KEY, 'count'],
        queryFn: () => api.get<{ count: number }>(`${BASE}count/`).then((r) => r.data.count),
        enabled,
        refetchInterval: POLL_MS,
    });
}

export function usePendingActions(enabled: boolean) {
    return useQuery({
        queryKey: [...KEY, 'list'],
        queryFn: () =>
            api.get<PendingAction[] | { results: PendingAction[] }>(BASE, { params: { status: 'pending' } }).then((r) => (Array.isArray(r.data) ? r.data : r.data.results)),
        enabled,
    });
}

export function useResolvePendingAction() {
    return useMutation({
        mutationFn: ({ action, decision }: { action: PendingAction; decision: 'approve' | 'reject' }) => api.post(`${BASE}${action.id}/${decision}/`),
        onSuccess: (_, { decision }) => {
            void queryClient.invalidateQueries({ queryKey: KEY });
            if (decision === 'approve') {
                // An approved UDRP transfer moves a website to the legitimate domains.
                void invalidateSiteMonitoring();
                void invalidateLegitimateDomains();
            }
            notifySuccess(decision === 'approve' ? 'Action approved and carried out' : 'Action rejected');
        },
        onError: notifyError,
    });
}
