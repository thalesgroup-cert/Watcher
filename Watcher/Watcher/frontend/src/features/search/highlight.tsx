import { Box } from '@mui/material';

/** `text` with the first occurrence of `query` in bold. Plain text nodes only: nothing is parsed as HTML. */
export function Highlight({ text, query }: { text: string; query: string }) {
    const needle = query.trim().toLowerCase();
    const start = needle ? text.toLowerCase().indexOf(needle) : -1;
    if (start < 0) return <>{text}</>;
    return (
        <>
            {text.slice(0, start)}
            <Box component="mark" sx={{ bgcolor: 'transparent', color: 'primary.main', fontWeight: 800 }}>
                {text.slice(start, start + needle.length)}
            </Box>
            {text.slice(start + needle.length)}
        </>
    );
}
