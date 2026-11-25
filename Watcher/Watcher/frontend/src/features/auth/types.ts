import type { AvatarConfig } from './avatar';
export interface User {
    id: number;
    username: string;
    first_name: string;
    last_name: string;
    email: string;
    is_staff: boolean;
    is_superuser: boolean;
    // Always sent by `/api/auth/user`; may be missing from a login response mocked in tests.
    groups?: string[];
    permissions?: string[];
}

export interface Profile {
    theme: string;
    preferences: Record<string, unknown>;
    avatar_color: string | null;
    /** A DiceBear avatar built on the profile; null keeps the coloured initials. */
    avatar: AvatarConfig | null;
    /** AI summaries are written out letter by letter, once. */
    typewriter_enabled: boolean;
    /** Kept by the server since 3.8; the size of the text is now one setting, in Display (profile.preferences.display). */
    ui_zoom_level?: number;
}

export interface LoginResponse {
    user: User;
    token: string;
}

/** `checking`: a session cookie is being validated against `/api/auth/user`. */
export type AuthStatus = 'checking' | 'authenticated' | 'anonymous';
