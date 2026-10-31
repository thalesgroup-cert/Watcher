import { api } from '../../api/client';
import type { LoginResponse, Profile, User } from './types';

function csrfToken(): string {
    const cookie = document.cookie
        .split(';')
        .map((c) => c.trim())
        .find((c) => c.startsWith('csrftoken='));
    return cookie ? cookie.slice('csrftoken='.length) : '';
}

export const login = (username: string, password: string) =>
    api
        .post<LoginResponse>('/api/auth/login', { username, password }, { headers: { 'X-CSRFToken': csrfToken() } })
        .then((res) => res.data);

export const logout = () => api.post('/api/auth/logout/', null);

export const fetchUser = () => api.get<User>('/api/auth/user').then((res) => res.data);

export const changePassword = (old_password: string, password: string) =>
    api.post('/api/auth/passwordchange/', { old_password, password }).then((res) => res.data);

export const fetchProfile = () => api.get<Profile>('/api/auth/profile').then((res) => res.data);

export const updateProfile = (data: Partial<Profile>) =>
    api.patch<Profile>('/api/auth/profile', data).then((res) => res.data);
