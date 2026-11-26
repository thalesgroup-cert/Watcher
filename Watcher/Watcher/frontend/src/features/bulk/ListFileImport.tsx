import { useState } from 'react';
import { Alert } from '@mui/material';
import { IMPORT_MAX_BYTES, parseListFile, type Reading } from '../../lib/listFile';
import { FileDropZone } from '../../ui/FileDropZone';

/** What each kind of list holds, and how its files are read. */
const KINDS = {
    domains: { one: 'domain', many: 'domains', reading: 'columns', header: /^(domains?|domain[ _-]?names?|hosts?|host[ _-]?names?|fqdns?|urls?|names?)$/i },
    keywords: { one: 'keyword', many: 'keywords', reading: 'columns', header: /^(keywords?|words?|terms?|names?)$/i },
    words: { one: 'banned word', many: 'banned words', reading: 'columns', header: /^(words?|banned[ _-]?words?|terms?|names?)$/i },
    // A regular expression or an URL can hold a comma: these are read one line at a time
    patterns: { one: 'pattern', many: 'patterns', reading: 'lines', header: /^(patterns?|regex(es)?|keywords?|names?)$/i },
    feeds: { one: 'feed URL', many: 'feed URLs', reading: 'lines', header: /^(urls?|feeds?|rss|links?)$/i },
} satisfies Record<string, { one: string; many: string; reading: Reading; header: RegExp }>;

export type ListKind = keyof typeof KINDS;

interface ListFileImportProps {
    kind: ListKind;
    /** The most values one import takes in this module. */
    max: number;
    /** When a list longer than `above` weighs on the periodic work of the module: said once the file is read. */
    weighs?: { above: number; text: string };
    /** The values read from the file: the form puts them in its list, where they can be read and changed. */
    onValues: (values: string[]) => void;
}

interface Imported {
    name: string;
    source: string;
    count: number;
    duplicates: number;
}

/**
 * The zone to drop a .txt or .csv on (or click to choose), the same in every form that adds several items at once, with what
 * was read from the file or why it could not be. The file is read in the browser; the values then go through the module's
 * "one per line" create, in batches.
 */
export function ListFileImport({ kind, max, weighs, onValues }: ListFileImportProps) {
    const { one, many, reading, header } = KINDS[kind];
    const [imported, setImported] = useState<Imported | null>(null);
    const [error, setError] = useState<string | null>(null);

    const fail = (message: string) => {
        setImported(null);
        setError(message);
    };

    const readFile = async (file: File) => {
        if (file.size > IMPORT_MAX_BYTES) {
            fail(`${file.name} is too big (${(file.size / 1024 / 1024).toFixed(1)} MB, at most ${IMPORT_MAX_BYTES / 1024 / 1024} MB).`);
            return;
        }
        const { values, source, duplicates } = parseListFile(await file.text(), { reading, header });
        if (values.length === 0) {
            fail(
                `No ${one} found in ${file.name}. Expected a text file with one ${one} per line${reading === 'columns' ? `, or a CSV with a "${one}" column` : ''}.`,
            );
            return;
        }
        if (values.length > max) {
            fail(`${file.name} has ${values.length.toLocaleString('en-GB')} ${many}: the most one import takes is ${max.toLocaleString('en-GB')}. Split the file.`);
            return;
        }
        setError(null);
        onValues(values);
        setImported({ name: file.name, source, count: values.length, duplicates });
    };

    return (
        <>
            <FileDropZone
                extensions={['.txt', '.csv']}
                hint={`TXT or CSV, one ${one} per line - up to ${max.toLocaleString('en-GB')} ${many}`}
                inputTestId="list-file"
                onFile={(file) => void readFile(file)}
                onReject={(file) => fail(`${file.name} is not a .txt or .csv file.`)}
            />
            {error && (
                <Alert severity="error" onClose={() => setError(null)} data-testid="import-error">
                    {error}
                </Alert>
            )}
            {imported && (
                <Alert severity="info" data-testid="import-summary">
                    Read {imported.count.toLocaleString('en-GB')} {imported.count === 1 ? one : many} from {imported.name} ({imported.source}
                    {imported.duplicates > 0 ? `, ${imported.duplicates} repeated value${imported.duplicates === 1 ? '' : 's'} ignored` : ''}). Check the list, then preview
                    or add.
                </Alert>
            )}
            {imported && weighs && imported.count > weighs.above && (
                <Alert severity="warning" data-testid="import-warning">
                    {weighs.text}
                </Alert>
            )}
        </>
    );
}
