import { useMemo, useState, type ReactNode } from 'react';
import { Box, Button, Chip, Collapse, Link, Stack, Tooltip, Typography } from '@mui/material';
import ExpandLess from '@mui/icons-material/ExpandLess';
import ExpandMore from '@mui/icons-material/ExpandMore';
import { actionMeta, fieldLabel, moduleOf, objectNoun } from '../catalog';
import { actorName, buildFeed, countByType, formatDateTime, relativeTime } from '../format';
import type { TimelineEvent } from '../types';
import { EventAvatar } from './ActorAvatar';
import { EventDiff } from './EventDiff';

/**
 * - `object`: history of one object (the drawer): no object name, changes always visible, no grouping.
 * - `feed`: cross-object activity: object name (opens its history), module, bursts folded.
 */
export type FeedMode = 'object' | 'feed';

const GROUP_PREVIEW = 60;

function Time({ iso }: { iso: string }) {
    return (
        <Tooltip title={formatDateTime(iso)}>
            <Typography component="time" dateTime={iso} variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
                {relativeTime(iso)}
            </Typography>
        </Tooltip>
    );
}

function ObjectName({ event, onOpen }: { event: TimelineEvent; onOpen?: (e: TimelineEvent) => void }) {
    const name = event.object_repr || `#${event.object_id}`;
    if (!onOpen) return <strong>{name}</strong>;
    return (
        <Link
            component="button"
            type="button"
            onClick={() => onOpen(event)}
            underline="hover"
            sx={{ fontWeight: 600, verticalAlign: 'baseline', textAlign: 'left', overflowWrap: 'anywhere' }}
        >
            {name}
        </Link>
    );
}

function Row({ avatar, children, aside }: { avatar: ReactNode; children: ReactNode; aside: ReactNode }) {
    return (
        <Stack direction="row" spacing={1.5} sx={{ py: 1.25, alignItems: 'flex-start' }}>
            <Box sx={{ pt: 0.25 }}>{avatar}</Box>
            <Box sx={{ flexGrow: 1, minWidth: 0 }}>{children}</Box>
            <Box sx={{ pt: 0.25 }}>{aside}</Box>
        </Stack>
    );
}

function EventItem({ event, mode, onOpen }: { event: TimelineEvent; mode: FeedMode; onOpen?: (e: TimelineEvent) => void }) {
    const fields = Object.keys(event.diff ?? {});
    const [showDiff, setShowDiff] = useState(mode === 'object');
    const verb = actionMeta(event.action)?.verb ?? event.action_label.toLowerCase();
    const module = moduleOf(event.content_type);

    return (
        <Row avatar={<EventAvatar event={event} />} aside={<Time iso={event.timestamp} />}>
            <Typography variant="body2" component="div">
                <strong>{actorName(event)}</strong> {verb}{' '}
                {mode === 'feed' ? (
                    <>
                        {objectNoun(event.content_type)} <ObjectName event={event} onOpen={onOpen} />
                    </>
                ) : (
                    `this ${objectNoun(event.content_type)}`
                )}
            </Typography>
            {(mode === 'feed' || fields.length > 0) && (
                <Stack direction="row" spacing={0.75} sx={{ mt: 0.5, alignItems: 'center', flexWrap: 'wrap', rowGap: 0.5 }}>
                    {mode === 'feed' && module && <Chip size="small" variant="outlined" label={module.label} sx={{ height: 20, fontSize: 11 }} />}
                    {fields.length > 0 && mode === 'feed' && (
                        <Button
                            size="small"
                            color="inherit"
                            onClick={() => setShowDiff((v) => !v)}
                            endIcon={showDiff ? <ExpandLess /> : <ExpandMore />}
                            sx={{ minHeight: 0, height: 22, px: 0.75, fontSize: 12, color: 'text.secondary' }}
                        >
                            {fields.length <= 3 ? fields.map((field) => fieldLabel(field, event.content_type)).join(', ') : `${fields.length} fields`}
                        </Button>
                    )}
                </Stack>
            )}
            {fields.length > 0 && (
                <Collapse in={showDiff} unmountOnExit>
                    <Box sx={{ mt: 1 }}>
                        <EventDiff diff={event.diff} contentType={event.content_type} />
                    </Box>
                </Collapse>
            )}
        </Row>
    );
}

function GroupItem({ events, onOpen }: { events: TimelineEvent[]; onOpen?: (e: TimelineEvent) => void }) {
    const [open, setOpen] = useState(false);
    const first = events[0];
    const verb = actionMeta(first.action)?.verb ?? first.action_label.toLowerCase();
    const module = moduleOf(first.content_type);
    const types = countByType(events);
    const itemsLabel = types.length === 1 ? objectNoun(types[0][0], events.length) : 'items';

    return (
        <Row avatar={<EventAvatar event={first} />} aside={<Time iso={first.timestamp} />}>
            <Typography variant="body2" component="div">
                <strong>{actorName(first)}</strong> {verb}{' '}
                {types.map(([type, count], i) => (
                    <span key={type}>
                        {i > 0 && (i === types.length - 1 ? ' and ' : ', ')}
                        <strong>{count}</strong> {objectNoun(type, count)}
                    </span>
                ))}
            </Typography>
            <Stack direction="row" spacing={0.75} sx={{ mt: 0.5, alignItems: 'center' }}>
                {module && <Chip size="small" variant="outlined" label={module.label} sx={{ height: 20, fontSize: 11 }} />}
                <Button
                    size="small"
                    color="inherit"
                    onClick={() => setOpen((v) => !v)}
                    endIcon={open ? <ExpandLess /> : <ExpandMore />}
                    sx={{ minHeight: 0, height: 22, px: 0.75, fontSize: 12, color: 'text.secondary' }}
                >
                    {open ? 'Hide' : 'Show'} {itemsLabel}
                </Button>
            </Stack>
            <Collapse in={open} unmountOnExit>
                <Stack direction="row" sx={{ mt: 1, flexWrap: 'wrap', gap: 0.5 }}>
                    {events.slice(0, GROUP_PREVIEW).map((e) => (
                        <Chip
                            key={e.id}
                            size="small"
                            label={e.object_repr || `#${e.object_id}`}
                            onClick={onOpen ? () => onOpen(e) : undefined}
                            sx={{ maxWidth: 260 }}
                        />
                    ))}
                    {events.length > GROUP_PREVIEW && (
                        <Typography variant="caption" color="text.secondary" sx={{ alignSelf: 'center', ml: 0.5 }}>
                            and {events.length - GROUP_PREVIEW} more
                        </Typography>
                    )}
                </Stack>
            </Collapse>
        </Row>
    );
}

interface EventFeedProps {
    events: TimelineEvent[];
    mode: FeedMode;
    /** Opens an object's history (feed mode). */
    onOpen?: (event: TimelineEvent) => void;
}

export function EventFeed({ events, mode, onOpen }: EventFeedProps) {
    const days = useMemo(() => buildFeed(events, { group: mode === 'feed' }), [events, mode]);
    return (
        <Box data-testid="event-feed">
            {days.map((day) => (
                <Box key={`${day.label}-${day.entries[0].key}`} component="section" sx={{ '& + &': { mt: 1 } }}>
                    <Typography
                        variant="caption"
                        component="h3"
                        color="text.secondary"
                        sx={{
                            position: 'sticky',
                            top: 0,
                            zIndex: 1,
                            py: 0.75,
                            bgcolor: 'background.paper',
                            fontWeight: 700,
                            textTransform: 'uppercase',
                            letterSpacing: '0.08em',
                            borderBottom: 1,
                            borderColor: 'divider',
                        }}
                    >
                        {day.label}
                    </Typography>
                    <Box sx={{ '& > * + *': { borderTop: 1, borderColor: 'divider' } }}>
                        {day.entries.map((entry) =>
                            entry.kind === 'group' ? (
                                <GroupItem key={entry.key} events={entry.events} onOpen={onOpen} />
                            ) : (
                                <EventItem key={entry.key} event={entry.event} mode={mode} onOpen={onOpen} />
                            ),
                        )}
                    </Box>
                </Box>
            ))}
        </Box>
    );
}
