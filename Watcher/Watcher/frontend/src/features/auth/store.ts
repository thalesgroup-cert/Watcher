import { create } from 'zustand';
import type { AuthStatus, User } from './types';

/**
 * The server keeps the Knox token in a cookie the page cannot read. It sets this one next to it, so that the page knows
 * there is a session (and asks who it is) without a request that a visitor would see refused.
 */
const SESSION_COOKIE = 'session_active';

function hasSession(): boolean {
    return document.cookie.split(';').some((c) => c.trim() === `${SESSION_COOKIE}=1`);
}

interface AuthState {
    /** A session exists, or is being checked: the requests that need an account can be sent. */
    signedIn: boolean;
    user: User | null;
    status: AuthStatus;
    setUser: (user: User) => void;
    clear: () => void;
}

/** Client session: whether there is one and the current user. Server data tied to the account lives in TanStack Query. */
export const useAuthStore = create<AuthState>((set) => {
    const signedIn = hasSession();
    return {
        signedIn,
        user: null,
        status: signedIn ? 'checking' : 'anonymous',
        setUser: (user) => set({ signedIn: true, user, status: 'authenticated' }),
        clear: () => {
            document.cookie = `${SESSION_COOKIE}=; Max-Age=0; path=/`;
            set({ signedIn: false, user: null, status: 'anonymous' });
        },
    };
});

export const selectUser = (s: AuthState) => s.user;
export const selectIsAuthenticated = (s: AuthState) => s.status === 'authenticated';

/** True if the user holds any of these `app_label.codename` permissions (staff and superusers hold them all). */
export function hasAnyPermission(user: User | null, ...perms: string[]): boolean {
    if (!user) return false;
    if (user.is_superuser || user.is_staff) return true;
    return perms.some((p) => user.permissions?.includes(p));
}
