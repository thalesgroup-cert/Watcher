import { useEffect, useRef, useState } from 'react';
import { Box, Dialog, IconButton, Stack, ToggleButton, ToggleButtonGroup, Tooltip, Typography } from '@mui/material';
import Close from '@mui/icons-material/Close';
import FitScreenOutlined from '@mui/icons-material/FitScreenOutlined';
import ZoomInOutlined from '@mui/icons-material/ZoomInOutlined';
import ZoomOutOutlined from '@mui/icons-material/ZoomOutOutlined';

export interface ViewerImage {
    /** Short name shown in the switch ("Before", "After"). */
    label: string;
    /** Address of the image: it stays inside the app, nothing opens in another tab. */
    src: string | null;
}

interface ImageViewerProps {
    open: boolean;
    onClose: () => void;
    title: string;
    images: ViewerImage[];
    /** Index of the image shown when the viewer opens. */
    initial?: number;
}

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 4;
const STEP = 0.25;

const clamp = (zoom: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(zoom * 100) / 100));

/**
 * A large image in a dialog of the app: zoom, scroll, and a switch between a few images (before / after a change).
 * Keys: + and - zoom, 0 fits the width, Escape closes.
 */
export function ImageViewer({ open, onClose, title, images, initial = 0 }: ImageViewerProps) {
    return (
        <Dialog open={open} onClose={onClose} fullWidth maxWidth="xl" aria-labelledby="image-viewer-title" slotProps={{ paper: { sx: { height: '92vh' } } }}>
            {/* Remounted on every opening: the zoom and the image start from the defaults. */}
            {open && <Viewer onClose={onClose} title={title} images={images} initial={initial} />}
        </Dialog>
    );
}

function Viewer({ onClose, title, images, initial }: Omit<ImageViewerProps, 'open'> & { initial: number }) {
    const [index, setIndex] = useState(Math.min(initial, Math.max(0, images.length - 1)));
    const [zoom, setZoom] = useState(1);
    const scroller = useRef<HTMLDivElement>(null);
    const image = images[index];

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === '+' || e.key === '=') setZoom((z) => clamp(z + STEP));
            else if (e.key === '-') setZoom((z) => clamp(z - STEP));
            else if (e.key === '0') setZoom(1);
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);

    return (
        <>
            <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', px: 2, py: 1.25, borderBottom: 1, borderColor: 'divider', flexWrap: 'wrap', rowGap: 1 }}>
                <Typography id="image-viewer-title" variant="subtitle1" component="h2" noWrap sx={{ fontWeight: 600, minWidth: 0, flexShrink: 1 }}>
                    {title}
                </Typography>
                {images.length > 1 && (
                    <ToggleButtonGroup
                        size="small"
                        exclusive
                        value={index}
                        onChange={(_, v: number | null) => {
                            if (v === null) return;
                            setIndex(v);
                            scroller.current?.scrollTo({ top: 0 });
                        }}
                        aria-label="Image shown"
                    >
                        {images.map((img, i) => (
                            <ToggleButton key={img.label} value={i} disabled={!img.src} sx={{ px: 2 }}>
                                {img.label}
                            </ToggleButton>
                        ))}
                    </ToggleButtonGroup>
                )}
                <Box sx={{ flexGrow: 1 }} />
                <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
                    <Tooltip title="Zoom out (-)">
                        <span>
                            <IconButton size="small" aria-label="Zoom out" disabled={zoom <= MIN_ZOOM} onClick={() => setZoom((z) => clamp(z - STEP))}>
                                <ZoomOutOutlined />
                            </IconButton>
                        </span>
                    </Tooltip>
                    <Typography variant="body2" sx={{ minWidth: 44, textAlign: 'center' }} aria-live="polite">
                        {Math.round(zoom * 100)} %
                    </Typography>
                    <Tooltip title="Zoom in (+)">
                        <span>
                            <IconButton size="small" aria-label="Zoom in" disabled={zoom >= MAX_ZOOM} onClick={() => setZoom((z) => clamp(z + STEP))}>
                                <ZoomInOutlined />
                            </IconButton>
                        </span>
                    </Tooltip>
                    <Tooltip title="Fit the width (0)">
                        <IconButton size="small" aria-label="Fit the width" onClick={() => setZoom(1)}>
                            <FitScreenOutlined />
                        </IconButton>
                    </Tooltip>
                </Stack>
                <IconButton aria-label="Close the viewer" onClick={onClose} edge="end">
                    <Close />
                </IconButton>
            </Stack>
            <Box ref={scroller} sx={{ flexGrow: 1, overflow: 'auto', bgcolor: 'action.hover', p: 2 }} data-testid="image-viewer-scroll">
                {image?.src ? (
                    <Box
                        component="img"
                        src={image.src}
                        alt={`${title} - ${image.label}`}
                        draggable={false}
                        // The width is a share of the viewer: the image keeps its proportions and the container scrolls
                        sx={{ display: 'block', width: `${zoom * 100}%`, maxWidth: 'none', mx: 'auto', border: 1, borderColor: 'divider', bgcolor: 'common.white' }}
                    />
                ) : (
                    <Typography color="text.secondary">No image to show.</Typography>
                )}
            </Box>
        </>
    );
}
