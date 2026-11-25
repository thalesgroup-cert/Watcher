export type ConnectorStatus = 'configured' | 'partial' | 'disabled';
export type HealthStatus = 'healthy' | 'unhealthy' | 'unknown';

export interface ConnectorField {
    name: string;
    label: string;
    value: string | null;
    sensitive?: boolean;
    overridden?: boolean;
    /** The value is the default of the LiteLLM library for this provider, not one that was typed. */
    from_default?: boolean;
    /** The library knows a default for it (the base URL of OpenAI, Anthropic, Gemini). */
    has_default?: boolean;
    /** An example of what goes in the field, shown while it is empty. */
    placeholder?: string;
    required?: boolean;
    type?: string;
    /** The name of the setting (settings.py / .env) the field reads. */
    settings_key?: string;
    litellm_provider?: string | null;
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
    author?: string;
    logo?: string;
    status: ConnectorStatus;
    health?: ConnectorHealth | null;
    readonly?: boolean;
    /** The AI connector that writes the summaries (one at most); the others are tried when it fails. */
    is_default_llm?: boolean;
    fields: ConnectorField[];
}

export type DeliveryKind = 'test' | 'health' | 'notification' | 'ai';

/** One thing a connector did: a test, a notification sent through it, a call to an AI. */
export interface Delivery {
    id: number;
    kind: DeliveryKind;
    ok: boolean;
    message: string;
    /** What it was about: the notification, the model. */
    subject: string;
    duration: number | null;
    created_at: string;
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
