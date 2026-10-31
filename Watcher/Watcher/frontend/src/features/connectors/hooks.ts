import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { notifyError, notifySuccess } from '../../lib/notify';
import * as api from './api';
import type { Connector, FieldValues, NotificationChannel, NotificationType } from './types';

const CONNECTORS_KEY = ['connectors'] as const;

export function useConnectors(enabled: boolean) {
    return useQuery({
        queryKey: CONNECTORS_KEY,
        queryFn: api.fetchConnectors,
        enabled,
    });
}

function useReplaceInCache() {
    const queryClient = useQueryClient();
    return (updated: Connector) =>
        queryClient.setQueryData<Connector[]>(CONNECTORS_KEY, (current) =>
            current?.map((c) => (c.id === updated.id ? updated : c)),
        );
}

export function useUpdateConnector() {
    const replace = useReplaceInCache();
    return useMutation({
        mutationFn: ({ id, fields }: { id: string; fields: FieldValues }) => api.updateConnector(id, fields),
        onSuccess: (connector) => {
            replace(connector);
            notifySuccess('Connector updated');
        },
        onError: notifyError,
    });
}

export function useResetConnectorField() {
    const replace = useReplaceInCache();
    return useMutation({
        mutationFn: ({ id, field }: { id: string; field: string }) => api.resetConnectorField(id, field),
        onSuccess: replace,
        onError: notifyError,
    });
}

export function useTestConnector() {
    const replace = useReplaceInCache();
    return useMutation({
        mutationFn: (id: string) => api.testConnector(id),
        onSuccess: ({ connector }) => {
            if (connector) replace(connector);
        },
        onError: notifyError,
    });
}

// Secrets never go through the query cache: a plain mutation keeps them in the caller only.
export function useRevealConnector() {
    return useMutation({
        mutationFn: (id: string) => api.revealConnector(id),
        onError: notifyError,
    });
}

const NOTIFICATIONS_KEY = ['notifications'] as const;

export function useNotifications(enabled: boolean) {
    return useQuery({
        queryKey: NOTIFICATIONS_KEY,
        queryFn: api.fetchNotifications,
        enabled,
    });
}

export function useUpdateNotification() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ typeId, channel, ...body }: { typeId: string; channel: NotificationChannel } & api.NotificationUpdate) =>
            api.updateNotification(typeId, channel, body),
        onSuccess: (updated) =>
            queryClient.setQueryData<NotificationType[]>(NOTIFICATIONS_KEY, (current) =>
                current?.map((t) => (t.id === updated.id ? updated : t)),
            ),
        onError: notifyError,
    });
}

/** Preview of one message; a key left out of `draft` shows what is saved. */
export function useNotificationPreview(typeId: string, channel: NotificationChannel, draft: api.NotificationDraft) {
    return useQuery({
        queryKey: ['notifications', 'preview', typeId, channel, draft],
        queryFn: () => api.previewNotification(typeId, channel, draft),
        placeholderData: keepPreviousData,
        staleTime: 60_000,
    });
}
