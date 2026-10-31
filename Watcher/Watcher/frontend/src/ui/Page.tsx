import type { ReactNode } from 'react';
import { Box, Stack, Typography } from '@mui/material';

/**
 * Page conventions for migrated screens:
 * - `Page` sets the width and gutters; `PageHeader` carries the title, a one-line purpose and the page actions.
 * - Sections of one page are tabs under the header (`tabs` slot), never a side menu.
 * - Context about an object (history, details) opens in a right-hand drawer; dialogs are for focused tasks
 *   (edit, confirm, change a password).
 */
export function Page({ children, maxWidth = 1400 }: { children: ReactNode; maxWidth?: number }) {
    return <Box sx={{ maxWidth, mx: 'auto', py: 3, px: { xs: 1.5, md: 3 } }}>{children}</Box>;
}

interface PageHeaderProps {
    icon?: ReactNode;
    title: ReactNode;
    subtitle?: ReactNode;
    actions?: ReactNode;
    /** Small control next to the title, such as the "?" that starts the tour of the page. */
    help?: ReactNode;
    /** Rendered below the title row, typically page-level `Tabs`. */
    tabs?: ReactNode;
}

export function PageHeader({ icon, title, subtitle, actions, help, tabs }: PageHeaderProps) {
    return (
        <Box sx={{ mb: 3, borderBottom: tabs ? 1 : 0, borderColor: 'divider' }}>
            <Stack
                direction={{ xs: 'column', sm: 'row' }}
                spacing={2}
                sx={{ alignItems: { sm: 'center' }, justifyContent: 'space-between', mb: tabs ? 1.5 : 0 }}
            >
                <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', minWidth: 0 }}>
                    {icon && (
                        <Box sx={{ display: 'grid', placeItems: 'center', color: 'primary.main', '& svg': { fontSize: 28 } }}>{icon}</Box>
                    )}
                    <Box sx={{ minWidth: 0 }} data-tour="page-title">
                        <Stack direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
                            <Typography variant="h2" component="h1" noWrap>
                                {title}
                            </Typography>
                            {help}
                        </Stack>
                        {subtitle && (
                            <Typography variant="body2" color="text.secondary" component="div">
                                {subtitle}
                            </Typography>
                        )}
                    </Box>
                </Stack>
                {actions && (
                    <Stack direction="row" spacing={1} data-tour="page-actions" sx={{ alignItems: 'center', flexShrink: 0 }}>
                        {actions}
                    </Stack>
                )}
            </Stack>
            {tabs && <Box data-tour="page-tabs">{tabs}</Box>}
        </Box>
    );
}
