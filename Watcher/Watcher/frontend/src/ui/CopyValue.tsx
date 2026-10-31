import type { ReactNode } from 'react';
import { Box, IconButton, Tooltip } from '@mui/material';
import ContentCopyOutlined from '@mui/icons-material/ContentCopyOutlined';
import { notifyError, notifySuccess } from '../lib/notify';

/** Copies text with the clipboard API, or with a hidden field where the page is not allowed to use it (plain http). */
export async function copyText(text: string): Promise<boolean> {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch {
        const field = document.createElement('textarea');
        field.value = text;
        field.setAttribute('readonly', '');
        field.style.position = 'fixed';
        field.style.opacity = '0';
        document.body.appendChild(field);
        field.select();
        try {
            return document.execCommand('copy');
        } catch {
            return false;
        } finally {
            document.body.removeChild(field);
        }
    }
}

interface CopyValueProps {
    /** The text copied. Nothing is shown when it is empty. */
    value: string | null | undefined;
    /** What it is, for the message: "IP addresses copied". */
    label: string;
    children: ReactNode;
}

/** A value with a small copy button that shows up when the pointer or the keyboard is on it. */
export function CopyValue({ value, label, children }: CopyValueProps) {
    if (!value) return <>{children}</>;
    const copy = async () => {
        if (await copyText(value)) notifySuccess(`${label} copied`);
        else notifyError(new Error(`Could not copy ${label.toLowerCase()}`));
    };
    return (
        <Box
            component="span"
            sx={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 0.5,
                maxWidth: '100%',
                minWidth: 0,
                verticalAlign: 'middle',
                '& .copy-button': { opacity: 0, transition: 'opacity 120ms' },
                '&:hover .copy-button, &:focus-within .copy-button, .copy-button:focus-visible': { opacity: 1 },
                // No hover on a touch screen: the button stays visible, lightly.
                '@media (hover: none)': { '& .copy-button': { opacity: 0.6 } },
            }}
        >
            <Box component="span" sx={{ minWidth: 0 }}>
                {children}
            </Box>
            <Tooltip title={`Copy ${label.toLowerCase()}`}>
                <IconButton className="copy-button" size="small" aria-label={`Copy ${label.toLowerCase()}`} onClick={() => void copy()} sx={{ p: 0.25, flexShrink: 0 }}>
                    <ContentCopyOutlined sx={{ fontSize: 14 }} />
                </IconButton>
            </Tooltip>
        </Box>
    );
}
