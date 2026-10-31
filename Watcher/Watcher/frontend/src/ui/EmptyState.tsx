import type { ReactNode } from 'react';
import { Box, Typography } from '@mui/material';

export function EmptyState({ icon, title, children }: { icon: ReactNode; title: string; children?: ReactNode }) {
    return (
        <Box sx={{ textAlign: 'center', py: 6, px: 2, color: 'text.secondary', '& > svg': { fontSize: 44, opacity: 0.35 } }}>
            {icon}
            <Typography sx={{ mt: 1, fontWeight: 600 }} color="text.primary">
                {title}
            </Typography>
            {children && (
                <Typography variant="body2" sx={{ mt: 0.5 }}>
                    {children}
                </Typography>
            )}
        </Box>
    );
}
