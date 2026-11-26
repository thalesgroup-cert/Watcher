import { errorLines } from './errors';
import { toast } from './toast';

export function notifySuccess(message: string): void {
    toast.success(message);
}

export function notifyError(err: unknown): void {
    errorLines(err).forEach(toast.error);
}

/** What the server says, in words the person understands: "already exists" is a domain or a keyword that is already watched. */
const plain = (line: string) => (/already exists/i.test(line) ? 'already monitored' : /may not be blank|field is required/i.test(line) ? 'a value is required' : line);

/** An error about one named thing (a domain, a keyword): the name comes first, then the reason, e.g. "acme.com: already monitored". */
export function notifyItemError(name: string, err: unknown): void {
    errorLines(err).forEach((line) => toast.error(name ? `${name}: ${plain(line)}` : plain(line)));
}
