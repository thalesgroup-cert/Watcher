import { renderAvatar, type AvatarConfig } from '../../features/auth/avatar';

export function displayName(firstName?: string, lastName?: string, username?: string): string {
    if (firstName && lastName) return `${firstName} ${lastName}`;
    if (firstName) return firstName;
    return username || '?';
}

function getInitials(firstName?: string, lastName?: string, username?: string): string {
    if (firstName && lastName) return `${firstName[0]}${lastName[0]}`.toUpperCase();
    if (firstName) return firstName[0].toUpperCase();
    if (username) return username[0].toUpperCase();
    return '?';
}

interface UserAvatarProps {
    username?: string;
    firstName?: string;
    lastName?: string;
    /** Color picked in the profile; a neutral grey when unset. */
    avatarColor?: string | null;
    /** The avatar built in the profile. Without one, the initials on the colour. */
    avatar?: AvatarConfig | null;
    size?: number;
    tooltip?: boolean;
}

export default function UserAvatar({
    username,
    firstName = '',
    lastName = '',
    avatarColor = null,
    avatar = null,
    size = 32,
    tooltip = true,
}: UserAvatarProps) {
    const picture = avatar ? renderAvatar(avatar) : '';
    return (
        <div
            title={tooltip ? displayName(firstName, lastName, username) : undefined}
            style={{
                width: size,
                height: size,
                borderRadius: '50%',
                backgroundColor: picture ? 'transparent' : avatarColor || '#546e7a',
                overflow: 'hidden',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: Math.round(size * 0.4),
                fontWeight: 600,
                color: '#fff',
                userSelect: 'none',
                flexShrink: 0,
                verticalAlign: 'middle',
                cursor: 'default',
            }}
        >
            {picture ? <img src={picture} alt="" width={size} height={size} style={{ display: 'block' }} /> : getInitials(firstName, lastName, username)}
        </div>
    );
}
