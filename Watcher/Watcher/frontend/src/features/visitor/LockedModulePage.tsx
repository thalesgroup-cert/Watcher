import type { ReactNode } from 'react';
import { Link as RouterLink, useLocation } from 'react-router';
import { alpha, Box, Button, Card, Chip, CircularProgress, Stack, Typography } from '@mui/material';
import CheckCircleOutlined from '@mui/icons-material/CheckCircleOutlined';
import LockOutlined from '@mui/icons-material/LockOutlined';
import LoginOutlined from '@mui/icons-material/LoginOutlined';
import { Page } from '../../ui/Page';
import { useAuthStore } from '../auth/store';
import { lockedModule } from './lockedModules';

/** What a visitor sees in place of a module that needs an account: what it does, and the way in. */
export function LockedModulePage({ to }: { to: string }) {
    const location = useLocation();
    const module = lockedModule(to);
    if (!module) return null;
    return (
        <Page maxWidth={760}>
            <Card data-testid="locked-module" sx={{ p: { xs: 3, sm: 5 } }}>
                <Stack spacing={3}>
                    <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
                        <Box
                            sx={(theme) => ({
                                width: 56,
                                height: 56,
                                borderRadius: 3,
                                display: 'grid',
                                placeItems: 'center',
                                color: 'primary.main',
                                bgcolor: alpha(theme.palette.primary.main, 0.12),
                                '& svg': { fontSize: 30 },
                            })}
                        >
                            {module.icon}
                        </Box>
                        <Box sx={{ minWidth: 0 }}>
                            <Typography variant="h1" component="h1">
                                {module.label}
                            </Typography>
                            <Chip size="small" icon={<LockOutlined />} label="With an account" sx={{ mt: 0.5 }} />
                        </Box>
                    </Stack>

                    <Typography variant="h3" component="p" sx={{ fontWeight: 500 }}>
                        {module.tagline}
                    </Typography>

                    <Stack component="ul" spacing={1.5} sx={{ listStyle: 'none', m: 0, p: 0 }}>
                        {module.points.map((point) => (
                            <Stack key={point} component="li" direction="row" spacing={1.5} sx={{ alignItems: 'flex-start' }}>
                                <CheckCircleOutlined fontSize="small" color="primary" sx={{ mt: '2px' }} />
                                <Typography color="text.secondary">{point}</Typography>
                            </Stack>
                        ))}
                    </Stack>

                    <Box>
                        <Button
                            component={RouterLink}
                            to="/login"
                            state={{ from: location.pathname + location.search }}
                            variant="contained"
                            size="large"
                            startIcon={<LoginOutlined />}
                            data-testid="locked-sign-in"
                        >
                            Sign in to open it
                        </Button>
                    </Box>
                </Stack>
            </Card>
        </Page>
    );
}

/** A module page: its content for signed-in people, the presentation above for visitors. */
export function ModuleGate({ to, children }: { to: string; children: ReactNode }) {
    const status = useAuthStore((s) => s.status);
    if (status === 'checking') {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
                <CircularProgress aria-label="Loading" />
            </Box>
        );
    }
    return status === 'anonymous' ? <LockedModulePage to={to} /> : children;
}
