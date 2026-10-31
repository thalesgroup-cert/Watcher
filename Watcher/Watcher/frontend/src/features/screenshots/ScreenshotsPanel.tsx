import { useState } from 'react';
import { Alert as MuiAlert, Box, Button, ButtonBase, List, ListItemButton, ListItemText, Skeleton, Stack, Typography } from '@mui/material';
import CameraAltOutlined from '@mui/icons-material/CameraAltOutlined';
import { getErrorMessage } from '../../api/client';
import { ConfirmDialog } from '../../ui/ConfirmDialog';
import { ImageViewer } from '../../ui/ImageViewer';
import { dateAgo, formatDateTime } from '../timeline/format';
import { useScreenshotImages, useScreenshots, useTakeScreenshot } from './hooks';

interface ScreenshotsPanelProps {
    /** Address of the object, with its trailing slash: `/api/data_leak/alert/12/`. */
    endpoint: string;
    /** Name of the object, for the viewer and the dialogs. */
    title: string;
    /** The user may take screenshots (the right to change the object). */
    canTake: boolean;
    /** When given, taking a screenshot asks first: the page is visited from the address of Watcher. */
    confirm?: string;
}

/**
 * The screenshots of an object of a module: the newest as a thumbnail, the list of the others, a button to take a new one,
 * and the viewer of the app (zoom, scroll, switch between captures). Nothing opens in another tab.
 */
export function ScreenshotsPanel({ endpoint, title, canTake, confirm }: ScreenshotsPanelProps) {
    const list = useScreenshots(endpoint);
    const take = useTakeScreenshot(endpoint);
    const [asking, setAsking] = useState(false);
    // null: viewer closed; otherwise the index of the capture shown first
    const [viewing, setViewing] = useState<number | null>(null);

    const shots = list.data?.results ?? [];
    // The thumbnail is always loaded; the others only when the viewer opens
    const urls = useScreenshotImages(endpoint, (viewing === null ? shots.slice(0, 1) : shots).map((s) => s.id));

    if (list.isPending) return <Skeleton height={60} />;
    if (list.error) return <MuiAlert severity="error">{getErrorMessage(list.error, 'Failed to load the screenshots.')}</MuiAlert>;

    const run = () => (confirm ? setAsking(true) : take.mutate());
    const configured = list.data.configured;

    return (
        <>
            {canTake && (
                <Box sx={{ mb: shots.length ? 1.5 : 0 }}>
                    <Button size="small" variant="outlined" startIcon={<CameraAltOutlined />} disabled={!configured || take.isPending} onClick={run}>
                        {take.isPending ? 'Taking it…' : 'Take a screenshot'}
                    </Button>
                    {!configured && (
                        <Typography variant="caption" color="text.secondary" sx={{ ml: 1.5 }}>
                            The screenshot service is not set up on this instance.
                        </Typography>
                    )}
                </Box>
            )}
            {shots.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                    No screenshot yet.
                </Typography>
            ) : (
                <Stack spacing={1.5} data-testid="screenshots-panel">
                    {urls[0] ? (
                        <ButtonBase onClick={() => setViewing(0)} aria-label="View the latest screenshot" sx={{ display: 'block', width: '100%', cursor: 'zoom-in' }}>
                            <Box
                                component="img"
                                src={urls[0]}
                                alt="Latest screenshot"
                                draggable={false}
                                sx={{ width: '100%', maxHeight: 260, objectFit: 'cover', objectPosition: 'top', border: 1, borderColor: 'divider', borderRadius: 1, display: 'block' }}
                            />
                        </ButtonBase>
                    ) : (
                        <Skeleton variant="rounded" height={160} />
                    )}
                    <List dense disablePadding>
                        {shots.map((shot, i) => (
                            <ListItemButton key={shot.id} onClick={() => setViewing(i)} sx={{ borderRadius: 1, px: 1 }}>
                                <ListItemText
                                    primary={`${formatDateTime(shot.created_at)} (${dateAgo(shot.created_at)})`}
                                    secondary={`${(shot.size / 1024).toFixed(0)} KB${shot.taken_by ? ` - taken by ${shot.taken_by}` : ''}`}
                                />
                            </ListItemButton>
                        ))}
                    </List>
                </Stack>
            )}
            <ImageViewer
                open={viewing !== null}
                onClose={() => setViewing(null)}
                title={title}
                initial={viewing ?? 0}
                images={shots.map((shot, i) => ({ label: i === 0 ? `Latest - ${formatDateTime(shot.created_at)}` : formatDateTime(shot.created_at), src: urls[i] ?? null }))}
            />
            <ConfirmDialog
                open={asking}
                title="Take a screenshot?"
                confirmLabel="Take it"
                pending={take.isPending}
                onClose={() => setAsking(false)}
                onConfirm={() =>
                    take.mutate(undefined, {
                        onSettled: () => setAsking(false),
                    })
                }
            >
                {confirm}
            </ConfirmDialog>
        </>
    );
}
