import { Avatar, Badge, Box, type Theme } from '@mui/material';
import Add from '@mui/icons-material/Add';
import Block from '@mui/icons-material/Block';
import Close from '@mui/icons-material/Close';
import Edit from '@mui/icons-material/Edit';
import SmartToyOutlined from '@mui/icons-material/SmartToyOutlined';
import SwapHoriz from '@mui/icons-material/SwapHoriz';
import UserAvatar from '../../../components/common/UserAvatar';
import { isAutomated } from '../format';
import type { TimelineAction, TimelineEvent } from '../types';

type Palette = 'success' | 'primary' | 'error' | 'secondary' | 'warning';

export const ACTION_STYLE: Record<TimelineAction, { color: Palette; Icon: typeof Add }> = {
    created: { color: 'success', Icon: Add },
    updated: { color: 'primary', Icon: Edit },
    deleted: { color: 'error', Icon: Close },
    transferred: { color: 'secondary', Icon: SwapHoriz },
    cancelled: { color: 'warning', Icon: Block },
};

type Actor = Pick<TimelineEvent, 'username' | 'first_name' | 'last_name' | 'avatar_color' | 'avatar'>;

/** The person behind an event, or Watcher itself for automated events. */
export function ActorAvatar({ actor, size = 32 }: { actor: Actor; size?: number }) {
    if (isAutomated(actor)) {
        return (
            <Avatar sx={{ width: size, height: size, bgcolor: 'action.selected', color: 'text.secondary' }} aria-label="Watcher">
                <SmartToyOutlined sx={{ fontSize: size * 0.6 }} />
            </Avatar>
        );
    }
    return (
        <UserAvatar
            username={actor.username}
            firstName={actor.first_name}
            lastName={actor.last_name}
            avatarColor={actor.avatar_color}
            avatar={actor.avatar}
            size={size}
            tooltip={false}
        />
    );
}

/** Actor avatar with the action as a small coloured badge. */
export function EventAvatar({ event, size = 32 }: { event: TimelineEvent; size?: number }) {
    const style = ACTION_STYLE[event.action] ?? ACTION_STYLE.updated;
    const { Icon } = style;
    return (
        <Badge
            overlap="circular"
            anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
            badgeContent={
                <Box
                    sx={(theme: Theme) => ({
                        width: 16,
                        height: 16,
                        borderRadius: '50%',
                        display: 'grid',
                        placeItems: 'center',
                        bgcolor: theme.palette[style.color].main,
                        color: theme.palette[style.color].contrastText,
                        border: 2,
                        borderColor: 'background.paper',
                        boxSizing: 'content-box',
                    })}
                >
                    <Icon sx={{ fontSize: 11 }} />
                </Box>
            }
        >
            <ActorAvatar actor={event} size={size} />
        </Badge>
    );
}
