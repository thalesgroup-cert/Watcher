import { errorLines } from './errors';
import { toast } from './toast';

export function notifySuccess(message: string): void {
    toast.success(message);
}

export function notifyError(err: unknown): void {
    errorLines(err).forEach(toast.error);
}
