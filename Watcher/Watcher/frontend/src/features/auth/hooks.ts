import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { notifyError, notifySuccess } from '../../lib/notify';
import * as api from './api';
import { useAuthStore } from './store';
import type { Profile } from './types';

export const profileQuery = queryOptions({
    queryKey: ['auth', 'profile'] as const,
    queryFn: api.fetchProfile,
});

/**
 * Restores the session on page load: when the server says there is one (its cookie, also set by the OIDC callback that
 * redirects with `sso=1`), it is asked who is signed in; a session the server refuses is dropped.
 */
export async function initSession(): Promise<void> {
    const sso = new URLSearchParams(window.location.search).has('sso');
    if (sso) window.history.replaceState({}, document.title, window.location.pathname + window.location.hash);

    const { signedIn, setUser, clear } = useAuthStore.getState();
    if (!signedIn) return;
    try {
        setUser(await api.fetchUser());
    } catch (err) {
        clear();
        if (sso) notifyError(err);
    }
}

export function useLogin() {
    const client = useQueryClient();
    return useMutation({
        mutationFn: ({ username, password }: { username: string; password: string }) => api.login(username, password),
        onSuccess: ({ user }) => {
            client.clear();
            useAuthStore.getState().setUser(user);
            notifySuccess('Successful Login');
        },
        // The sign-in page shows the error in its card.
    });
}

export function useLogout() {
    const client = useQueryClient();
    return useMutation({
        mutationFn: api.logout,
        onSuccess: () => notifySuccess('Successful Logout'),
        onError: notifyError,
        // The local session goes away even if the server call fails (expired token, network).
        onSettled: () => {
            useAuthStore.getState().clear();
            client.clear();
        },
    });
}

export function usePasswordChange() {
    return useMutation({
        mutationFn: ({ oldPassword, password }: { oldPassword: string; password: string }) =>
            api.changePassword(oldPassword, password),
        onSuccess: () => notifySuccess('Password Change Successful'),
        onError: notifyError,
    });
}

export function useProfile() {
    const signedIn = useAuthStore((s) => s.signedIn);
    return useQuery({ ...profileQuery, enabled: signedIn });
}

export function useUpdateProfile() {
    const client = useQueryClient();
    return useMutation({
        mutationFn: (data: Partial<Profile>) => api.updateProfile(data),
        onSuccess: (profile) => client.setQueryData(profileQuery.queryKey, profile),
        onError: notifyError,
    });
}

