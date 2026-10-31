import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';

/** Settings of this Watcher instance that the interface needs (`GET /api/config/`, public). */
export interface InstanceConfig {
    loginMode: 'form_only' | 'sso_only' | 'both';
    oidcCompanyName: string;
    helpButtonLabel: string;
    helpButtonUrl: string;
}

interface RawConfig {
    login_mode?: InstanceConfig['loginMode'];
    oidc_company_name?: string;
    watcher_help_button_label?: string;
    watcher_help_button_url?: string;
}

const DEFAULTS: InstanceConfig = { loginMode: 'form_only', oidcCompanyName: '', helpButtonLabel: 'API Docs', helpButtonUrl: '/api/docs/' };

/** The instance settings, with the defaults while they load or if the endpoint is not reachable. */
export function useInstanceConfig(): InstanceConfig {
    const { data } = useQuery({
        queryKey: ['instanceConfig'],
        queryFn: () => api.get<RawConfig>('/api/config/').then((r) => r.data),
        staleTime: Infinity,
        retry: 1,
    });
    return {
        loginMode: data?.login_mode ?? DEFAULTS.loginMode,
        oidcCompanyName: data?.oidc_company_name ?? DEFAULTS.oidcCompanyName,
        helpButtonLabel: data?.watcher_help_button_label ?? DEFAULTS.helpButtonLabel,
        helpButtonUrl: data?.watcher_help_button_url ?? DEFAULTS.helpButtonUrl,
    };
}
