import { useEffect, useMemo, useRef, useState } from 'react';
import {
    Alert,
    Box,
    Button,
    Card,
    Chip,
    CircularProgress,
    MenuItem,
    Skeleton,
    Stack,
    TextField,
    ToggleButton,
    ToggleButtonGroup,
    Typography,
} from '@mui/material';
import FilterAltOffOutlined from '@mui/icons-material/FilterAltOffOutlined';
import HistoryOutlined from '@mui/icons-material/HistoryOutlined';
import { getErrorMessage } from '../../../api/client';
import { EmptyState } from '../../../ui/EmptyState';
import { SearchField } from '../../../ui/SearchField';
import { ACTIONS, MODULES } from '../catalog';
import { useActivityFeed } from '../hooks';
import type { Actor, FeedFilters, TimelineAction, TimelineEvent } from '../types';
import { EventFeed } from './EventFeed';
import { HistoryDrawer } from './HistoryDrawer';

export const DEFAULT_FILTERS: FeedFilters = { actor: 'people', module: '', actions: [], search: '' };

const ACTORS: { value: Actor; label: string }[] = [
    { value: 'people', label: 'People' },
    { value: 'me', label: 'Mine' },
    { value: 'automated', label: 'Automated' },
    { value: 'all', label: 'All' },
];

interface ActivityFeedProps {
    filters: FeedFilters;
    onFiltersChange: (filters: FeedFilters) => void;
    /** Hide the actor switch when the actor is fixed by the page (e.g. "My activity"). */
    lockActor?: boolean;
}

export function ActivityFeed({ filters, onFiltersChange, lockActor = false }: ActivityFeedProps) {
    const { data, error, isPending, isFetchingNextPage, hasNextPage, fetchNextPage } = useActivityFeed(filters);
    const events = useMemo(() => data?.pages.flatMap((p) => p.results) ?? [], [data]);
    // `selected` outlives `historyOpen` so the drawer keeps its content while sliding out.
    const [selected, setSelected] = useState<TimelineEvent | null>(null);
    const [historyOpen, setHistoryOpen] = useState(false);
    const openHistory = (event: TimelineEvent) => {
        setSelected(event);
        setHistoryOpen(true);
    };
    const sentinel = useRef<HTMLDivElement>(null);

    const set = (patch: Partial<FeedFilters>) => onFiltersChange({ ...filters, ...patch });
    const toggleAction = (action: TimelineAction) =>
        set({ actions: filters.actions.includes(action) ? filters.actions.filter((a) => a !== action) : [...filters.actions, action] });
    const isFiltered = !!filters.module || filters.actions.length > 0 || !!filters.search || (!lockActor && filters.actor !== 'people');

    // Infinite scroll: load the next page when the end of the list comes into view.
    useEffect(() => {
        const node = sentinel.current;
        if (!node || !hasNextPage) return;
        const observer = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting && !isFetchingNextPage) void fetchNextPage();
        });
        observer.observe(node);
        return () => observer.disconnect();
    }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

    return (
        <>
            <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 1.5, alignItems: 'center', mb: 1.5 }}>
                {!lockActor && (
                    <ToggleButtonGroup
                        size="small"
                        exclusive
                        value={filters.actor}
                        onChange={(_, v: Actor | null) => v && set({ actor: v })}
                        aria-label="Who"
                    >
                        {ACTORS.map((a) => (
                            <ToggleButton key={a.value} value={a.value} sx={{ px: 1.5 }}>
                                {a.label}
                            </ToggleButton>
                        ))}
                    </ToggleButtonGroup>
                )}
                <TextField
                    select
                    size="small"
                    value={filters.module}
                    onChange={(e) => set({ module: e.target.value })}
                    sx={{ minWidth: 190 }}
                    slotProps={{ select: { displayEmpty: true }, htmlInput: { 'aria-label': 'Module' } }}
                >
                    <MenuItem value="">All modules</MenuItem>
                    {Object.entries(MODULES).map(([key, m]) => (
                        <MenuItem key={key} value={key}>
                            {m.label}
                        </MenuItem>
                    ))}
                </TextField>
                <SearchField
                    value={filters.search}
                    onChange={(search) => set({ search })}
                    placeholder="Search by name…"
                    ariaLabel="Search activity"
                />
                {isFiltered && (
                    <Button
                        size="small"
                        color="inherit"
                        startIcon={<FilterAltOffOutlined />}
                        onClick={() => onFiltersChange({ ...DEFAULT_FILTERS, actor: lockActor ? filters.actor : 'people' })}
                        sx={{ color: 'text.secondary' }}
                    >
                        Clear
                    </Button>
                )}
            </Stack>
            <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 0.75, mb: 2 }} role="group" aria-label="Actions">
                {ACTIONS.map((a) => {
                    const on = filters.actions.includes(a.value);
                    return (
                        <Chip
                            key={a.value}
                            label={a.label}
                            size="small"
                            color={on ? 'primary' : 'default'}
                            variant={on ? 'filled' : 'outlined'}
                            onClick={() => toggleAction(a.value)}
                            aria-pressed={on}
                        />
                    );
                })}
            </Stack>

            <Card sx={{ px: { xs: 1.5, sm: 2.5 }, pb: 1 }}>
                {isPending ? (
                    <Stack spacing={2} sx={{ py: 2 }} aria-label="Loading activity">
                        {[0, 1, 2, 3, 4].map((i) => (
                            <Stack key={i} direction="row" spacing={1.5}>
                                <Skeleton variant="circular" width={32} height={32} />
                                <Box sx={{ flexGrow: 1 }}>
                                    <Skeleton width="60%" />
                                    <Skeleton width="25%" />
                                </Box>
                            </Stack>
                        ))}
                    </Stack>
                ) : error ? (
                    <Alert severity="error" sx={{ my: 2 }}>
                        {getErrorMessage(error, 'Failed to load the activity.')}
                    </Alert>
                ) : events.length === 0 ? (
                    <EmptyState icon={<HistoryOutlined />} title="No activity">
                        {isFiltered
                            ? 'Nothing matches these filters.'
                            : filters.actor === 'me'
                              ? 'Changes you make will show up here.'
                              : 'Changes made in Watcher will show up here.'}
                    </EmptyState>
                ) : (
                    <>
                        <EventFeed events={events} mode="feed" onOpen={openHistory} />
                        <Box ref={sentinel} sx={{ display: 'flex', justifyContent: 'center', py: 1.5 }}>
                            {hasNextPage ? (
                                <Button
                                    size="small"
                                    color="inherit"
                                    onClick={() => fetchNextPage()}
                                    disabled={isFetchingNextPage}
                                    startIcon={isFetchingNextPage ? <CircularProgress size={14} /> : undefined}
                                >
                                    {isFetchingNextPage ? 'Loading…' : 'Load more'}
                                </Button>
                            ) : (
                                <Typography variant="caption" color="text.secondary">
                                    End of activity
                                </Typography>
                            )}
                        </Box>
                    </>
                )}
            </Card>

            <HistoryDrawer
                open={historyOpen}
                onClose={() => setHistoryOpen(false)}
                targets={selected ? [{ contentType: selected.content_type, objectId: selected.object_id }] : []}
                label={selected?.object_repr}
            />
        </>
    );
}
