import { useMemo, useState } from 'react';
import { Alert, Box, Skeleton, Stack, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import HistoryOutlined from '@mui/icons-material/HistoryOutlined';
import { getErrorMessage } from '../../../api/client';
import { EmptyState } from '../../../ui/EmptyState';
import { useHistory } from '../hooks';
import type { HistoryTarget } from '../types';
import { EventFeed } from './EventFeed';

interface ObjectHistoryProps {
    targets: HistoryTarget[];
    /** Load only while visible (e.g. the drawer is open). */
    enabled?: boolean;
}

/** Change history of one object (or of several merged), with a newest/oldest switch. */
export function ObjectHistory({ targets, enabled = true }: ObjectHistoryProps) {
    const [newestFirst, setNewestFirst] = useState(true);
    const { events, isPending, error } = useHistory(targets, enabled && targets.length > 0);

    const sorted = useMemo(
        () =>
            [...events].sort((a, b) => {
                const diff = new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime() || b.id - a.id;
                return newestFirst ? diff : -diff;
            }),
        [events, newestFirst],
    );

    if (isPending) {
        return (
            <Stack spacing={2} sx={{ pt: 2 }} aria-label="Loading history">
                {[0, 1, 2].map((i) => (
                    <Stack key={i} direction="row" spacing={1.5}>
                        <Skeleton variant="circular" width={32} height={32} />
                        <Box sx={{ flexGrow: 1 }}>
                            <Skeleton width="70%" />
                            <Skeleton width="40%" />
                        </Box>
                    </Stack>
                ))}
            </Stack>
        );
    }
    if (error) {
        return (
            <Alert severity="error" sx={{ mt: 2 }}>
                {getErrorMessage(error, 'Failed to load the history.')}
            </Alert>
        );
    }
    if (sorted.length === 0) {
        return (
            <EmptyState icon={<HistoryOutlined />} title="No history yet">
                Changes made to this item will appear here.
            </EmptyState>
        );
    }
    return (
        <>
            <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', py: 1 }}>
                <Typography variant="body2" color="text.secondary">
                    {sorted.length} event{sorted.length === 1 ? '' : 's'}
                </Typography>
                <ToggleButtonGroup
                    size="small"
                    exclusive
                    value={newestFirst ? 'newest' : 'oldest'}
                    onChange={(_, v) => v && setNewestFirst(v === 'newest')}
                    aria-label="Sort order"
                >
                    <ToggleButton value="newest" sx={{ px: 1.25, py: 0.25, fontSize: 12 }}>
                        Newest
                    </ToggleButton>
                    <ToggleButton value="oldest" sx={{ px: 1.25, py: 0.25, fontSize: 12 }}>
                        Oldest
                    </ToggleButton>
                </ToggleButtonGroup>
            </Stack>
            <EventFeed events={sorted} mode="object" />
        </>
    );
}
