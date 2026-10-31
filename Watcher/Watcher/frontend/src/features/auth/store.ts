import { create } from 'zustand';
import type { AuthStatus, User } from './types';

const TOKEN_KEY = 'token';

function readToken(): string | null {
    try {
        return localStorage.getItem(TOKEN_KEY);
    } catch {
        return null;
    }
}

function writeToken(token: string | null): void {
    try {
        if (token) localStorage.setItem(TOKEN_KEY, token);
        else localStorage.removeItem(TOKEN_KEY);
    } catch {
        /* storage unavailable: the session only lives in memory */
    }
}

interface AuthState {
    token: string | null;
    user: User | null;
    status: AuthStatus;
    /** Stores a new token; without a user the session stays `checking` until `setUser`. */
    setSession: (token: string, user?: User) => void;
    setUser: (user: User) => void;
    clear: () => void;
}

/**
 * Client session: the Knox token (mirrored in localStorage, read by `api/client.ts`) and the current user.
 * Server data tied to the account (profile, preferences) lives in TanStack Query.
 */
export const useAuthStore = create<AuthState>((set) => {
    const token = readToken();
    return {
        token,
        user: null,
        status: token ? 'checking' : 'anonymous',
        setSession: (newToken, user) => {
            writeToken(newToken);
            set({ token: newToken, user: user ?? null, status: user ? 'authenticated' : 'checking' });
        },
        setUser: (user) => set({ user, status: 'authenticated' }),
        clear: () => {
            writeToken(null);
            set({ token: null, user: null, status: 'anonymous' });
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
