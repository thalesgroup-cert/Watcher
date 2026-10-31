export type ConnectorStatus = 'configured' | 'partial' | 'disabled';
export type HealthStatus = 'healthy' | 'unhealthy' | 'unknown';

export interface ConnectorField {
    name: string;
    label: string;
    value: string | null;
    sensitive?: boolean;
    overridden?: boolean;
}

export interface ConnectorHealth {
    status: HealthStatus;
    checked_at?: string | null;
    message?: string | null;
}

export interface Connector {
    id: string;
    name: string;
    category: string;
    description?: string;
    version?: string;
    logo?: string;
    status: ConnectorStatus;
    health?: ConnectorHealth | null;
    readonly?: boolean;
    fields: ConnectorField[];
}

export interface TestResult {
    success: boolean;
    message: string;
}

export type FieldValues = Record<string, string | null>;

export type NotificationChannel = 'slack' | 'citadel' | 'thehive' | 'email';

export interface NotificationField {
    id: string;
    label: string;
    required: boolean;
}

export interface NotificationVariable {
    name: string;
    sample: string;
}

export interface NotificationChannelSetting {
    enabled: boolean;
    /** Ids of the fields the message shows. */
    fields: string[];
    /** Fields that can be chosen on this channel (none on email and for the messages that are fixed). */
    available: NotificationField[];
    /** Message written by hand, or null when the catalogue one is used (email: always null, its body is fixed). */
    template: string | null;
    /** The catalogue message as editable text (null on email). */
    default_template: string | null;
    /** Title of the TheHive alert or subject of the email written by hand, or null. */
    title: string | null;
    /** The catalogue title or subject (null on Slack and Citadel, which have none). */
    default_title: string | null;
    /** What the message can read, with an example value. */
    variables: NotificationVariable[];
    connector: { id: string; status: ConnectorStatus; health: HealthStatus };
}

export interface NotificationType {
    id: string;
    label: string;
    module: string;
    channels: Partial<Record<NotificationChannel, NotificationChannelSetting>>;
}

export interface NotificationPreview {
    kind: 'text' | 'html';
    /** How the content is written, so the preview can interpret it. */
    format: 'slack' | 'markdown' | 'html';
    /** TheHive title or email subject. */
    title?: string;
    content: string;
}
