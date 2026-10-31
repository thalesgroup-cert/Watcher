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
 * Restores the session on page load: an `sso_token` query parameter (OIDC callback redirect) wins over the
 * stored token; a token the server refuses is dropped.
 */
export async function initSession(): Promise<void> {
    const params = new URLSearchParams(window.location.search);
    const ssoToken = params.get('sso_token');
    if (ssoToken) {
        window.history.replaceState({}, document.title, window.location.pathname + window.location.hash);
        useAuthStore.getState().setSession(ssoToken);
    }

    const { token, setUser, clear } = useAuthStore.getState();
    if (!token) return;
    try {
        setUser(await api.fetchUser());
    } catch (err) {
        clear();
        if (ssoToken) notifyError(err);
    }
}

export function useLogin() {
    const client = useQueryClient();
    return useMutation({
        mutationFn: ({ username, password }: { username: string; password: string }) => api.login(username, password),
        onSuccess: ({ token, user }) => {
            client.clear();
            useAuthStore.getState().setSession(token, user);
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
    const token = useAuthStore((s) => s.token);
    return useQuery({ ...profileQuery, enabled: !!token });
}

export function useUpdateProfile() {
    const client = useQueryClient();
    return useMutation({
        mutationFn: (data: Partial<Profile>) => api.updateProfile(data),
        onSuccess: (profile) => client.setQueryData(profileQuery.queryKey, profile),
        onError: notifyError,
    });
}

