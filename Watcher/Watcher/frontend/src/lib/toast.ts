import { enqueueSnackbar } from 'notistack';

/** Thin wrapper over notistack's imperative API (a `SnackbarProvider` is mounted in `App`). */
export const toast = {
    success: (message: string) => enqueueSnackbar(message, { variant: 'success' }),
    error: (message: string) => enqueueSnackbar(message, { variant: 'error' }),
    info: (message: string) => enqueueSnackbar(message, { variant: 'info' }),
    warning: (message: string) => enqueueSnackbar(message, { variant: 'warning' }),
};
