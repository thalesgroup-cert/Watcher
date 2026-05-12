import { CONFIG_LOADED } from "../actions/types";

const initialState = {
    loginMode:       'form_only',
    oidcCompanyName: '',
    helpButtonLabel: 'API Docs',
    helpButtonUrl:   '/api/docs/',
};

export default function config(state = initialState, action) {
    switch (action.type) {
        case CONFIG_LOADED:
            return {
                loginMode:       action.payload.login_mode                ?? state.loginMode,
                oidcCompanyName: action.payload.oidc_company_name         ?? state.oidcCompanyName,
                helpButtonLabel: action.payload.watcher_help_button_label ?? state.helpButtonLabel,
                helpButtonUrl:   action.payload.watcher_help_button_url   ?? state.helpButtonUrl,
            };
        default:
            return state;
    }
}
