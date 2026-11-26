import { useRef, type ReactNode } from 'react';
import { SearchHighlightStyle, useSearchHighlight } from './highlight';
import {
    Checkbox,
    Skeleton,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    TableSortLabel,
    type SxProps,
    type Theme,
} from '@mui/material';

export interface Column<T> {
    key: string;
    label: ReactNode;
    /** API ordering field, when the column can be sorted. */
    sort?: string;
    width?: number;
    align?: 'center' | 'right';
    cellSx?: SxProps<Theme>;
    render: (row: T) => ReactNode;
}

export interface RowSelection {
    ids: Set<number>;
    toggle: (id: number) => void;
    /** Select or unselect every row of the current page. */
    setMany: (ids: number[], selected: boolean) => void;
}

interface DataTableProps<T extends { id: number }> {
    /** Accessible name of the table, also used for the select-all label. */
    label: string;
    columns: Column<T>[];
    rows: T[];
    loading: boolean;
    /** DRF ordering, e.g. `-created_at`. */
    ordering: string;
    onOrderingChange: (ordering: string) => void;
    /** Omitted when the user cannot act on the rows. */
    selection?: RowSelection;
    /** Accessible name of a row's checkbox. */
    rowLabel: (row: T) => string;
    onOpen: (row: T) => void;
    /** Shown instead of the rows when there are none. */
    empty: ReactNode;
    /** Row whose drawer is open. */
    activeId?: number | null;
    rowTestId: string;
    /** The search typed in the toolbar: its occurrences are marked in the rows. */
    highlight?: string;
}

/** Server-sorted table of a migrated list: click a row to open its drawer, tick rows for bulk actions. */
export function DataTable<T extends { id: number }>({
    label,
    columns,
    rows,
    loading,
    ordering,
    onOrderingChange,
    selection,
    rowLabel,
    onOpen,
    empty,
    activeId,
    rowTestId,
    highlight,
}: DataTableProps<T>) {
    const containerRef = useRef<HTMLDivElement>(null);
    useSearchHighlight(containerRef, highlight, rows);
    const span = columns.length + (selection ? 1 : 0);
    const desc = ordering.startsWith('-');
    const sortField = ordering.replace(/^-/, '');
    const pageIds = rows.map((r) => r.id);
    const selectedOnPage = selection ? pageIds.filter((id) => selection.ids.has(id)).length : 0;

    return (
        <TableContainer ref={containerRef}>
            <SearchHighlightStyle />
            <Table size="small" aria-label={label}>
                <TableHead>
                    <TableRow>
                        {selection && (
                            <TableCell padding="checkbox">
                                <Checkbox
                                    size="small"
                                    checked={pageIds.length > 0 && selectedOnPage === pageIds.length}
                                    indeterminate={selectedOnPage > 0 && selectedOnPage < pageIds.length}
                                    onChange={(e) => selection.setMany(pageIds, e.target.checked)}
                                    slotProps={{ input: { 'aria-label': `Select the ${label.toLowerCase()} of this page` } }}
                                />
                            </TableCell>
                        )}
                        {columns.map((c) => {
                            const active = c.sort === sortField;
                            return (
                                <TableCell
                                    key={c.key}
                                    align={c.align}
                                    sx={{ width: c.width, whiteSpace: 'nowrap' }}
                                    sortDirection={active ? (desc ? 'desc' : 'asc') : false}
                                >
                                    {c.sort ? (
                                        <TableSortLabel
                                            active={active}
                                            direction={active && desc ? 'desc' : 'asc'}
                                            onClick={() => onOrderingChange(active && !desc ? `-${c.sort}` : (c.sort as string))}
                                        >
                                            {c.label}
                                        </TableSortLabel>
                                    ) : (
                                        c.label
                                    )}
                                </TableCell>
                            );
                        })}
                    </TableRow>
                </TableHead>
                <TableBody>
                    {loading ? (
                        [0, 1, 2, 3, 4].map((i) => (
                            <TableRow key={i}>
                                <TableCell colSpan={span}>
                                    <Skeleton width={`${70 - i * 8}%`} />
                                </TableCell>
                            </TableRow>
                        ))
                    ) : rows.length === 0 ? (
                        <TableRow>
                            <TableCell colSpan={span} sx={{ borderBottom: 0 }}>
                                {empty}
                            </TableCell>
                        </TableRow>
                    ) : (
                        rows.map((row) => {
                            const checked = selection?.ids.has(row.id) ?? false;
                            return (
                                <TableRow
                                    key={row.id}
                                    hover
                                    selected={checked || activeId === row.id}
                                    onClick={() => onOpen(row)}
                                    sx={{ cursor: 'pointer' }}
                                    data-testid={rowTestId}
                                >
                                    {selection && (
                                        <TableCell padding="checkbox" onClick={(e) => e.stopPropagation()}>
                                            <Checkbox
                                                size="small"
                                                checked={checked}
                                                onChange={() => selection.toggle(row.id)}
                                                slotProps={{ input: { 'aria-label': `Select ${rowLabel(row)}` } }}
                                            />
                                        </TableCell>
                                    )}
                                    {columns.map((c) => (
                                        <TableCell key={c.key} align={c.align} sx={c.cellSx}>
                                            {c.render(row)}
                                        </TableCell>
                                    ))}
                                </TableRow>
                            );
                        })
                    )}
                </TableBody>
            </Table>
        </TableContainer>
    );
}

/** Selection state of a `DataTable`, kept across pages. */
export function selectionHandlers(setSelected: (update: (s: Set<number>) => Set<number>) => void, ids: Set<number>): RowSelection {
    return {
        ids,
        toggle: (id) =>
            setSelected((s) => {
                const next = new Set(s);
                if (!next.delete(id)) next.add(id);
                return next;
            }),
        setMany: (many, on) =>
            setSelected((s) => {
                const next = new Set(s);
                many.forEach((id) => (on ? next.add(id) : next.delete(id)));
                return next;
            }),
    };
}
