import { useRef, useState, type DragEvent, type KeyboardEvent } from 'react';
import { alpha, Box, Typography } from '@mui/material';
import UploadFileOutlined from '@mui/icons-material/UploadFileOutlined';

interface FileDropZoneProps {
    /** Kinds of file the zone takes, e.g. `['.txt', '.csv']`: used by the file chooser and checked on a drop. */
    extensions: string[];
    /** What the person is told about the file, under the invitation (kind, size...). */
    hint: string;
    /** The file that was chosen or dropped. */
    onFile: (file: File) => void;
    /** A file dropped that is not of the accepted kinds. */
    onReject?: (file: File) => void;
    /** `data-testid` of the hidden file input (tests choose files through it). */
    inputTestId?: string;
    label?: string;
}

/** A slim zone to drop a file on or click to choose one: keyboard friendly, and it lights up while a file is above it. */
export function FileDropZone({ extensions, hint, onFile, onReject, inputTestId, label = 'Drop a file here or click to choose' }: FileDropZoneProps) {
    const input = useRef<HTMLInputElement>(null);
    // Entering and leaving the children of the zone fire events too: a counter keeps the highlight steady.
    const [over, setOver] = useState(0);
    const dragging = over > 0;

    const accepts = (file: File) => extensions.some((extension) => file.name.toLowerCase().endsWith(extension));
    const take = (file: File | undefined) => {
        if (!file) return;
        if (accepts(file)) onFile(file);
        else onReject?.(file);
    };

    const onDrop = (e: DragEvent<HTMLElement>) => {
        e.preventDefault();
        setOver(0);
        take(e.dataTransfer.files[0]);
    };
    const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            input.current?.click();
        }
    };

    return (
        <Box
            role="button"
            tabIndex={0}
            aria-label={`${label}. ${hint}`}
            data-testid="file-dropzone"
            data-dragging={dragging}
            onClick={() => input.current?.click()}
            onKeyDown={onKeyDown}
            onDragEnter={(e) => {
                e.preventDefault();
                setOver((n) => n + 1);
            }}
            onDragOver={(e) => e.preventDefault()}
            onDragLeave={() => setOver((n) => Math.max(0, n - 1))}
            onDrop={onDrop}
            sx={(theme) => ({
                display: 'flex',
                alignItems: 'center',
                gap: 1.5,
                px: 1.5,
                py: 1,
                cursor: 'pointer',
                borderRadius: 2.5,
                border: '1.5px dashed',
                borderColor: dragging ? theme.palette.primary.main : theme.palette.divider,
                bgcolor: dragging ? alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.16 : 0.08) : 'transparent',
                transition: 'border-color 120ms, background-color 120ms',
                '&:hover': { borderColor: theme.palette.primary.main },
                '&:focus-visible': { outline: `2px solid ${theme.palette.primary.main}`, outlineOffset: 2 },
            })}
        >
            <Box
                aria-hidden
                sx={(theme) => ({
                    width: 34,
                    height: 34,
                    flexShrink: 0,
                    display: 'grid',
                    placeItems: 'center',
                    borderRadius: '10px',
                    color: theme.palette.primary.main,
                    bgcolor: alpha(theme.palette.primary.main, 0.12),
                    // The arrow lifts a little while a file is above the zone
                    '& svg': { transition: 'transform 120ms', transform: dragging ? 'translateY(-2px)' : 'none' },
                })}
            >
                <UploadFileOutlined fontSize="small" />
            </Box>
            <Box sx={{ minWidth: 0 }}>
                <Typography variant="body2" sx={{ fontWeight: 650 }}>
                    {dragging ? 'Drop to import' : label}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                    {hint}
                </Typography>
            </Box>
            <input
                ref={input}
                type="file"
                hidden
                accept={extensions.join(',')}
                data-testid={inputTestId}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => {
                    take(e.target.files?.[0]);
                    e.target.value = '';
                }}
            />
        </Box>
    );
}
