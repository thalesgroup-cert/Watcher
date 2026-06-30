import React from 'react';

export function displayName(firstName, lastName, username) {
    if (firstName && lastName) return `${firstName} ${lastName}`;
    if (firstName) return firstName;
    return username || '?';
}

function getInitials(firstName, lastName, username) {
    if (firstName && lastName) return `${firstName[0]}${lastName[0]}`.toUpperCase();
    if (firstName) return firstName[0].toUpperCase();
    if (username) return username[0].toUpperCase();
    return '?';
}

export default function UserAvatar({
    username,
    firstName = '',
    lastName = '',
    avatarColor = null,
    size = 32,
    tooltip = true,
}) {
    const initials = getInitials(firstName, lastName, username);
    const name     = tooltip ? displayName(firstName, lastName, username) : undefined;
    const bg       = avatarColor || '#546e7a';
    const fontSize = Math.round(size * 0.4);

    return (
        <div
            title={name}
            style={{
                width:          size,
                height:         size,
                borderRadius:   '50%',
                backgroundColor: bg,
                display:        'inline-flex',
                alignItems:     'center',
                justifyContent: 'center',
                fontSize:       fontSize,
                fontWeight:     600,
                color:          '#fff',
                userSelect:     'none',
                flexShrink:     0,
                verticalAlign:  'middle',
                cursor:         'default',
            }}
        >
            {initials}
        </div>
    );
}
