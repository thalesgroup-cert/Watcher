import type { NotificationChannel, NotificationChannelSetting } from './types';

export const CHANNELS: NotificationChannel[] = ['slack', 'citadel', 'thehive', 'email'];

export const CHANNEL_LABELS: Record<NotificationChannel, string> = {
    slack: 'Slack',
    citadel: 'Citadel',
    thehive: 'TheHive',
    email: 'Email',
};

/** Modules in the order they appear in the list; the ids are the `module` of the API. */
export const MODULES: { id: string; label: string }[] = [
    { id: 'threats_watcher', label: 'Threats Watcher' },
    { id: 'cyber_watch', label: 'Cyber Watch' },
    { id: 'data_leak', label: 'Data Leak' },
    { id: 'dns_finder', label: 'DNS Finder' },
    { id: 'website_monitoring', label: 'Website Monitoring' },
];

/** Why a message sent on this channel would not arrive, or null when its connector looks fine. */
export function connectorProblem(channel: NotificationChannel, setting: NotificationChannelSetting): string | null {
    const name = CHANNEL_LABELS[channel];
    if (setting.connector.status !== 'configured') return `${name} is not configured. Set it up on the Connectors tab.`;
    if (setting.connector.health === 'unhealthy') return `${name} failed its last health check.`;
    return null;
}
