import { Box, Tooltip } from '@mui/material';
import { actionMeta } from '../catalog';
import { actorName, formatDateTime } from '../format';
import type { TimelineEvent } from '../types';
import { ActorAvatar } from './ActorAvatar';

/** Shape of the `last_event` field the list serializers embed in each row. */
export type LastEvent = Pick<TimelineEvent, 'username' | 'first_name' | 'last_name' | 'avatar_color' | 'avatar' | 'action' | 'timestamp'>;

/** Who touched a row last, with the action and date on hover. */
export function LastActorAvatar({ event }: { event: LastEvent }) {
    const action = actionMeta(event.action)?.label ?? event.action;
    const title = `${actorName(event)} - ${action} - ${formatDateTime(event.timestamp)}`;
    return (
        <Tooltip title={title} placement="left">
            <Box component="span" sx={{ display: 'inline-flex', cursor: 'default' }} aria-label={title}>
                <ActorAvatar actor={event} size={26} />
            </Box>
        </Tooltip>
    );
}
