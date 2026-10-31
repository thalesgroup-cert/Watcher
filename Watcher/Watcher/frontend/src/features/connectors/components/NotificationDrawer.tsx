import { useEffect, useMemo, useRef, useState } from 'react';
import {
    Alert,
    Box,
    Button,
    Checkbox,
    Chip,
    Divider,
    FormControlLabel,
    IconButton,
    Skeleton,
    Stack,
    Switch,
    Tab,
    Tabs,
    TextField,
    ToggleButton,
    ToggleButtonGroup,
    Tooltip,
    Typography,
} from '@mui/material';
import Close from '@mui/icons-material/Close';
import { getErrorMessage } from '../../../api/client';
import { notifySuccess } from '../../../lib/notify';
import { SideDrawer } from '../../../ui/SideDrawer';
import type { NotificationDraft } from '../api';
import { useNotificationPreview, useUpdateNotification } from '../hooks';
import { CHANNELS, CHANNEL_LABELS, connectorProblem } from '../notifications';
import type { NotificationChannel, NotificationChannelSetting, NotificationType } from '../types';
import { MessagePreview } from './MessagePreview';

function useDebounced<T>(value: T, delay: number): T {
    const [debounced, setDebounced] = useState(value);
    useEffect(() => {
        const timer = window.setTimeout(() => setDebounced(value), delay);
        return () => window.clearTimeout(timer);
    }, [value, delay]);
    return debounced;
}

function Preview({ typeId, channel, draft }: { typeId: string; channel: NotificationChannel; draft: NotificationDraft }) {
    const { data, error } = useNotificationPreview(typeId, channel, draft);
    if (error) return <Alert severity="error">{getErrorMessage(error, 'Failed to build the preview.')}</Alert>;
    if (!data) return <Skeleton variant="rounded" height={240} />;
    return (
        <Box>
            {data.title && (
                <Typography variant="subtitle2" sx={{ mb: 1 }}>
                    {data.title}
                </Typography>
            )}
            <MessagePreview preview={data} />
        </Box>
    );
}

/** Readable label for the line a click inserts: new_mx_records -> New mx records. */
function humanize(name: string): string {
    const spaced = (name.split('.').pop() ?? name).replace(/_/g, ' ');
    return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** What a click on a variable inserts: its value, or a line that only shows when the variable holds a value. */
function snippet(channel: NotificationChannel, name: string, onlyIfPresent: boolean): string {
    if (!onlyIfPresent) return `{${name}}`;
    const label = humanize(name);
    if (channel === 'citadel') return `{{#if ${name}}}<li><strong>${label}:</strong> {${name}}</li>{{/if}}`;
    return `{{#if ${name}}}\n*${label}:* {${name}}\n{{/if}}\n`;
}

interface MessageEditorProps {
    channel: NotificationChannel;
    setting: NotificationChannelSetting;
    template: string;
    onTemplate: (value: string) => void;
}

const FORMAT_HINT: Partial<Record<NotificationChannel, string>> = {
    slack: 'Slack formatting: *bold*, _italic_, <url|label>.',
    citadel: 'HTML.',
    thehive: 'Markdown.',
};

/** The text of the message, with the variables it can read one click away. */
function MessageEditor({ channel, setting, template, onTemplate }: MessageEditorProps) {
    const field = useRef<HTMLTextAreaElement | null>(null);
    const [onlyIfPresent, setOnlyIfPresent] = useState(false);

    const insert = (text: string) => {
        const el = field.current;
        const from = el ? el.selectionStart : template.length;
        const to = el ? el.selectionEnd : template.length;
        onTemplate(template.slice(0, from) + text + template.slice(to));
        window.setTimeout(() => {
            el?.focus();
            el?.setSelectionRange(from + text.length, from + text.length);
        }, 0);
    };

    return (
        <Box>
            <TextField
                multiline
                fullWidth
                minRows={8}
                maxRows={24}
                value={template}
                onChange={(e) => onTemplate(e.target.value)}
                inputRef={field}
                slotProps={{ htmlInput: { 'aria-label': 'Message text', spellCheck: false, style: { fontFamily: 'monospace', fontSize: 13 } } }}
            />
            <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 0.5 }}>
                {FORMAT_HINT[channel]} {'{variable}'} inserts a value. {'{{#if variable}} … {{/if}}'} shows its content only when the variable has a value,{' '}
                {'{{else}}'} gives the alternative.
            </Typography>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mt: 1.5, mb: 0.5, flexWrap: 'wrap', rowGap: 0.5 }}>
                <Typography variant="overline" color="text.secondary">
                    Click a variable to insert
                </Typography>
                <ToggleButtonGroup
                    size="small"
                    exclusive
                    value={onlyIfPresent ? 'if' : 'value'}
                    onChange={(_, v: string | null) => v && setOnlyIfPresent(v === 'if')}
                    aria-label="What a click on a variable inserts"
                >
                    <ToggleButton value="value">Its value</ToggleButton>
                    <ToggleButton value="if">A line, only if present</ToggleButton>
                </ToggleButtonGroup>
            </Stack>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
                {setting.variables.map((v) => (
                    <Tooltip key={v.name} title={v.sample ? `Example: ${v.sample}` : ''} placement="top" describeChild>
                        <Chip size="small" variant="outlined" label={v.name} onClick={() => insert(snippet(channel, v.name, onlyIfPresent))} />
                    </Tooltip>
                ))}
            </Box>
        </Box>
    );
}

const orNull = (value: string) => (value.trim() ? value.trim() : null);

/** One channel of a notification. Keyed by its saved values, so a save starts it again from what is stored. */
function ChannelPanel({ type, channel, setting }: { type: NotificationType; channel: NotificationChannel; setting: NotificationChannelSetting }) {
    const update = useUpdateNotification();
    const [draft, setDraft] = useState<string[]>(setting.fields);
    // null: the catalogue message built from the boxes. A string: a message written by hand.
    const [template, setTemplate] = useState<string | null>(setting.template);
    const [title, setTitle] = useState<string>(setting.title ?? '');
    const hasBody = setting.default_template !== null;
    const hasTitle = setting.default_title !== null;
    const choosable = setting.available.length > 0;
    const fieldsDirty = [...draft].sort().join() !== [...setting.fields].sort().join();
    const dirty = fieldsDirty || template !== setting.template || orNull(title) !== setting.title;
    const pending = useMemo(() => ({ draft, template, title }), [draft, template, title]);
    const debounced = useDebounced(pending, 300);
    const problem = connectorProblem(channel, setting);
    const name = CHANNEL_LABELS[channel];

    const toggleField = (id: string, checked: boolean) => setDraft((cur) => (checked ? [...cur, id] : cur.filter((x) => x !== id)));
    const save = () =>
        update.mutate(
            {
                typeId: type.id,
                channel,
                ...(fieldsDirty && template === null ? { fields: draft } : {}),
                ...(hasBody ? { template } : {}),
                ...(hasTitle ? { title: orNull(title) } : {}),
            },
            { onSuccess: () => notifySuccess('Message saved') },
        );
    const reset = () => {
        setDraft(setting.available.map((f) => f.id));
        setTemplate(null);
        setTitle('');
    };
    // A catalogue message previews with the boxes; a message written by hand ignores them.
    const previewDraft: NotificationDraft = {
        ...(choosable && debounced.template === null ? { fields: debounced.draft } : {}),
        ...(hasBody ? { template: debounced.template } : {}),
        ...(hasTitle ? { title: orNull(debounced.title) } : {}),
    };

    return (
        <>
            <Box sx={{ px: 2.5, py: 2 }}>
                <FormControlLabel
                    control={
                        <Switch
                            checked={setting.enabled}
                            disabled={update.isPending}
                            onChange={(e) => update.mutate({ typeId: type.id, channel, enabled: e.target.checked })}
                            slotProps={{ input: { 'aria-label': `Send on ${name}` } }}
                        />
                    }
                    label={<Typography variant="body2">Send this notification on {name}</Typography>}
                />
                {channel === 'email' && (
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                        Goes to the users subscribed to email for this module. The layout of the email is fixed; its subject can be changed below.
                    </Typography>
                )}
                {problem && (
                    <Alert severity="warning" sx={{ mt: 1.5 }}>
                        {problem}
                    </Alert>
                )}
            </Box>
            <Divider />
            <Box component="section" sx={{ px: 2.5, py: 2 }}>
                <Typography variant="overline" color="text.secondary" component="h3">
                    What the message says
                </Typography>
                {hasTitle && (
                    <TextField
                        fullWidth
                        size="small"
                        label={channel === 'email' ? 'Subject' : 'Alert title'}
                        placeholder={setting.default_title ?? ''}
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        helperText="Empty: the default. Variables work here too, for example {ticket_id}."
                        sx={{ my: 1 }}
                        slotProps={{ htmlInput: { style: { fontFamily: 'monospace', fontSize: 13 } } }}
                    />
                )}
                {hasBody && (
                    <FormControlLabel
                        control={
                            <Switch
                                size="small"
                                checked={template !== null}
                                onChange={(e) => setTemplate(e.target.checked ? setting.default_template : null)}
                                slotProps={{ input: { 'aria-label': 'Write the message by hand' } }}
                            />
                        }
                        label={<Typography variant="body2">Write the message by hand</Typography>}
                        sx={{ display: 'flex', mb: 1 }}
                    />
                )}
                {template !== null ? (
                    <MessageEditor channel={channel} setting={setting} template={template} onTemplate={setTemplate} />
                ) : choosable ? (
                    <Stack>
                        {setting.available.map((f) => (
                            <FormControlLabel
                                key={f.id}
                                control={
                                    <Checkbox
                                        size="small"
                                        checked={draft.includes(f.id)}
                                        disabled={f.required}
                                        onChange={(e) => toggleField(f.id, e.target.checked)}
                                    />
                                }
                                label={<Typography variant="body2">{f.required ? `${f.label} (always shown)` : f.label}</Typography>}
                            />
                        ))}
                    </Stack>
                ) : (
                    hasBody && (
                        <Typography variant="body2" color="text.secondary">
                            This message has no optional fields. Write it by hand to change it.
                        </Typography>
                    )
                )}
                <Stack direction="row" spacing={1} sx={{ mt: 1.5 }}>
                    <Button size="small" variant="contained" disabled={!dirty || update.isPending} onClick={save}>
                        Save
                    </Button>
                    <Button size="small" variant="outlined" onClick={reset}>
                        Reset to default
                    </Button>
                </Stack>
            </Box>
            <Divider />
            <Box component="section" sx={{ px: 2.5, py: 2 }}>
                <Typography variant="overline" color="text.secondary" component="h3" sx={{ display: 'block', mb: 1 }}>
                    Preview (fictional data)
                </Typography>
                <Preview typeId={type.id} channel={channel} draft={previewDraft} />
            </Box>
        </>
    );
}

interface NotificationDrawerProps {
    type: NotificationType | undefined;
    channel: NotificationChannel | null;
    onChannel: (channel: NotificationChannel) => void;
    onClose: () => void;
}

/** One notification: its channels, what is sent on each, the fields of the message and a preview. */
export function NotificationDrawer({ type, channel, onChannel, onClose }: NotificationDrawerProps) {
    const setting = type && channel ? type.channels[channel] : undefined;
    return (
        <SideDrawer open={!!type} onClose={onClose} labelledBy="notification-drawer-title" width={640}>
            {type && channel && setting && (
                <>
                    <Stack direction="row" spacing={1} sx={{ alignItems: 'center', px: 2.5, py: 2 }}>
                        <Box sx={{ minWidth: 0, flexGrow: 1 }}>
                            <Typography variant="overline" color="text.secondary" sx={{ lineHeight: 1.4, display: 'block' }}>
                                Notification
                            </Typography>
                            <Typography id="notification-drawer-title" variant="h3" component="h2" noWrap>
                                {type.label}
                            </Typography>
                        </Box>
                        <IconButton aria-label="Close details" onClick={onClose} edge="end">
                            <Close />
                        </IconButton>
                    </Stack>
                    <Tabs value={channel} onChange={(_, c: NotificationChannel) => onChannel(c)} aria-label="Channels" variant="scrollable" allowScrollButtonsMobile sx={{ px: 1 }}>
                        {CHANNELS.filter((c) => type.channels[c]).map((c) => (
                            <Tab key={c} value={c} label={CHANNEL_LABELS[c]} />
                        ))}
                    </Tabs>
                    <Divider />
                    <Box sx={{ flexGrow: 1, overflowY: 'auto' }}>
                        <ChannelPanel key={`${type.id}/${channel}/${setting.fields.join(",")}/${setting.template ?? ""}/${setting.title ?? ""}`} type={type} channel={channel} setting={setting} />
                    </Box>
                </>
            )}
        </SideDrawer>
    );
}
