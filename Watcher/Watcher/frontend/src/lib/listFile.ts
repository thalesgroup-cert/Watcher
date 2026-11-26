// Reads the values of a file chosen in the browser: domains, keywords, search patterns, feed URLs... (a .txt with one value
// per line, or a .csv). Nothing is sent to the server as a file: the values go to the module's "one per line" create like
// pasted ones, in batches (features/bulk/useBulk.ts).

/** The biggest file read, in bytes. */
export const IMPORT_MAX_BYTES = 2 * 1024 * 1024;

/**
 * How a file is read:
 * - `columns`: a CSV is cut at the comma, the semicolon or the tab; the column named like `header` is read, otherwise the
 *   first one (domains, keywords, words);
 * - `lines`: one line is one value, whatever it holds, so that the commas of a regular expression or of an URL stay in it
 *   (search patterns, feed URLs).
 */
export type Reading = 'columns' | 'lines';

export interface ListFileOptions {
    reading: Reading;
    /** The name a column or a first line has when it is a header ("domain", "keyword"...). */
    header: RegExp;
}

export interface ParsedListFile {
    /** The values as written in the file, one per case-insensitive value, in order. */
    values: string[];
    /** Where they were read from, for the person to check: `column "domain"`, "first column", "one per line"... */
    source: string;
    /** Values that were in the file more than once. */
    duplicates: number;
}

/** The delimiter that is the most present in the first line: comma, semicolon or tab; empty for a single column. */
function detectDelimiter(line: string): string {
    const counts = [',', ';', '\t'].map((d) => ({ d, n: line.split(d).length - 1 }));
    const best = counts.reduce((a, b) => (b.n > a.n ? b : a));
    return best.n > 0 ? best.d : '';
}

/** One line cut at the delimiter, with the quotes of a CSV ("a,b" stays one cell, "" is a quote). */
function splitRow(line: string, delimiter: string): string[] {
    if (!delimiter) return [line];
    const cells: string[] = [];
    let cell = '';
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (quoted) {
            if (c !== '"') cell += c;
            else if (line[i + 1] === '"') {
                cell += '"';
                i++;
            } else quoted = false;
        } else if (c === '"') quoted = true;
        else if (c === delimiter) {
            cells.push(cell);
            cell = '';
        } else cell += c;
    }
    cells.push(cell);
    return cells.map((value) => value.trim());
}

/**
 * The values of a text file. Blank lines and lines starting with # are ignored, and so is a first line that is only a header
 * word. With `columns` and several columns, the one named like the header is read, otherwise the first one; a file made of
 * one line of values is read as a list.
 */
export function parseListFile(text: string, { reading, header }: ListFileOptions): ParsedListFile {
    // Files saved by Excel start with a byte-order mark: it is not part of the first value
    const body = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
    const lines = body
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith('#'));
    if (lines.length === 0) return { values: [], source: '', duplicates: 0 };

    const delimiter = reading === 'columns' ? detectDelimiter(lines[0]) : '';
    const rows = lines.map((line) => splitRow(line, delimiter));
    let values: string[];
    let source: string;
    if (!delimiter) {
        const hasHeader = header.test(rows[0][0]);
        values = rows.slice(hasHeader ? 1 : 0).map((row) => row[0]);
        source = hasHeader ? `one per line, "${rows[0][0]}" header ignored` : 'one per line';
    } else {
        const column = rows[0].findIndex((cell) => header.test(cell));
        if (column >= 0) {
            values = rows.slice(1).map((row) => row[column] ?? '');
            source = `column "${rows[0][column]}"`;
        } else if (rows.length === 1) {
            values = rows[0];
            source = 'one line of values';
        } else {
            values = rows.map((row) => row[0]);
            source = 'first column';
        }
    }

    const seen = new Set<string>();
    const unique: string[] = [];
    let duplicates = 0;
    for (const raw of values) {
        const value = raw.trim();
        if (!value) continue;
        if (seen.has(value.toLowerCase())) {
            duplicates++;
            continue;
        }
        seen.add(value.toLowerCase());
        unique.push(value);
    }
    return { values: unique, source, duplicates };
}
