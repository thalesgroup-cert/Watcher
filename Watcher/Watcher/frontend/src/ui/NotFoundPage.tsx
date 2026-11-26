import { Link as RouterLink, useLocation, useNavigate } from 'react-router';
import { alpha, keyframes } from '@mui/material/styles';
import { Box, Button, Chip, Stack, Typography } from '@mui/material';
import ArrowBack from '@mui/icons-material/ArrowBack';
import HomeOutlined from '@mui/icons-material/HomeOutlined';
import { WatcherMark } from '../styles/WatcherMark';
import { Page } from './Page';

/** The iris looks left, then right: the Watcher is searching. */
const look = keyframes`
    0%, 100% { transform: translateX(-9px); }
    50% { transform: translateX(9px); }
`;

/** Any address the app does not know. */
export default function NotFoundPage() {
    const { pathname } = useLocation();
    const navigate = useNavigate();
    return (
        <Page maxWidth={760}>
            <Stack data-testid="not-found" sx={{ alignItems: 'center', textAlign: 'center', pt: { xs: 4, md: 8 }, pb: 4 }}>
                <Box sx={{ position: 'relative', width: '100%', display: 'grid', placeItems: 'center', mb: 1 }}>
                    <Typography
                        aria-hidden
                        sx={{
                            position: 'absolute',
                            fontSize: { xs: 150, sm: 220 },
                            fontWeight: 800,
                            lineHeight: 1,
                            letterSpacing: '-0.05em',
                            color: (t) => alpha(t.palette.primary.main, t.palette.mode === 'dark' ? 0.16 : 0.1),
                            userSelect: 'none',
                            pointerEvents: 'none',
                        }}
                    >
                        404
                    </Typography>
                    <Box
                        component={WatcherMark}
                        sx={{
                            position: 'relative',
                            width: { xs: 120, sm: 150 },
                            my: { xs: 4, sm: 7 },
                            color: 'primary.main',
                            '& .iris': {
                                animation: `${look} 5s ease-in-out infinite`,
                                '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
                            },
                        }}
                    />
                </Box>

                <Typography variant="h1" sx={{ fontSize: { xs: 28, sm: 34 }, fontWeight: 700, textWrap: 'balance' }}>
                    Nothing to watch here
                </Typography>
                <Typography color="text.secondary" sx={{ mt: 1, maxWidth: 460 }}>
                    This address does not lead anywhere. The link may be outdated, or the page has moved.
                </Typography>
                <Chip
                    label={pathname}
                    size="small"
                    variant="outlined"
                    sx={{ mt: 2, maxWidth: '100%', fontFamily: 'ui-monospace, Menlo, Consolas, monospace', '& .MuiChip-label': { overflowWrap: 'anywhere', whiteSpace: 'normal', py: 0.5 } }}
                />

                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mt: 4 }}>
                    <Button component={RouterLink} to="/" variant="contained" startIcon={<HomeOutlined />}>
                        Go to the overview
                    </Button>
                    <Button variant="outlined" startIcon={<ArrowBack />} onClick={() => navigate(-1)}>
                        Go back
                    </Button>
                </Stack>
            </Stack>
        </Page>
    );
}
