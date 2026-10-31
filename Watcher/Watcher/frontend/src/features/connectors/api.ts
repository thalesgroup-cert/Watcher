import { api } from '../../api/client';
import type { Connector, FieldValues, NotificationChannel, NotificationPreview, NotificationType, TestResult } from './types';

/** What can be sent for a message: a left-out key stays as it is, null goes back to the catalogue. */
export interface NotificationDraft {
    fields?: string[];
    template?: string | null;
    title?: string | null;
}

export interface NotificationUpdate extends NotificationDraft {
    enabled?: boolean;
}

export const fetchConnectors = () =>
    api.get<Connector[]>('/api/connectors/').then((res) => res.data);

// Returns decrypted secrets: callers must keep the result out of any shared cache.
export const revealConnector = (id: string) =>
    api.get<Connector>(`/api/connectors/${id}/`, { params: { reveal: true } }).then((res) => res.data);

export const updateConnector = (id: string, fields: FieldValues) =>
    api.patch<Connector>(`/api/connectors/${id}/`, { fields }).then((res) => res.data);

export const resetConnectorField = (id: string, field: string) =>
    api.post<Connector>(`/api/connectors/${id}/reset-field/`, { field }).then((res) => res.data);

export const testConnector = (id: string) =>
    api
        .post<TestResult & { connector?: Connector }>(`/api/connectors/${id}/test/`, {})
        .then((res) => res.data);

export const fetchNotifications = () =>
    api.get<NotificationType[]>('/api/connectors/notifications/').then((res) => res.data);

export const updateNotification = (typeId: string, channel: NotificationChannel, body: NotificationUpdate) =>
    api.patch<NotificationType>(`/api/connectors/notifications/${typeId}/${channel}/`, body).then((res) => res.data);

export const previewNotification = (typeId: string, channel: NotificationChannel, body: NotificationDraft) =>
    api
        .post<NotificationPreview>(`/api/connectors/notifications/${typeId}/${channel}/preview/`, body)
        .then((res) => res.data);
