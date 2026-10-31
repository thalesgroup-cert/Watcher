import { useEffect, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Navigate, useLocation } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Alert, alpha, Box, Button, Divider, IconButton, InputAdornment, Link, Stack, TextField, Typography, useTheme } from '@mui/material';
import { keyframes } from '@mui/system';
import KeyboardCapslockOutlined from '@mui/icons-material/KeyboardCapslockOutlined';
import VisibilityOffOutlined from '@mui/icons-material/VisibilityOffOutlined';
import VisibilityOutlined from '@mui/icons-material/VisibilityOutlined';
import VpnKeyOutlined from '@mui/icons-material/VpnKeyOutlined';
import { api, getErrorMessage } from '../../../api/client';
import { toast } from '../../../lib/toast';
import { useInstanceConfig } from '../../config/useInstanceConfig';
import { useLogin } from '../hooks';
import { selectIsAuthenticated, useAuthStore } from '../store';

const drift = keyframes`
    0%, 100% { transform: translate(0, 0) scale(1); }
    50% { transform: translate(4%, -3%) scale(1.08); }
`;
const sweep = keyframes`
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
`;
const pulse = keyframes`
    0% { box-shadow: 0 0 0 0 currentColor; }
    70%, 100% { box-shadow: 0 0 0 7px transparent; }
`;

/** A radar slowly sweeping behind the page, over a faint grid: Watcher keeps an eye out. */
function Backdrop() {
    const theme = useTheme();
    const dark = theme.palette.mode === 'dark';
    const primary = theme.palette.primary.main;
    const still = '@media (prefers-reduced-motion: reduce)';
    return (
        <Box aria-hidden sx={{ position: 'fixed', inset: 0, overflow: 'hidden', pointerEvents: 'none', bgcolor: 'background.default' }}>
            <Box
                sx={{
                    position: 'absolute',
                    inset: '-20%',
                    background: `radial-gradient(40% 35% at 20% 30%, ${alpha(primary, dark ? 0.28 : 0.16)}, transparent 70%), radial-gradient(35% 30% at 80% 75%, ${alpha(theme.palette.info.main, dark ? 0.22 : 0.12)}, transparent 70%)`,
                    animation: `${drift} 26s ease-in-out infinite`,
                    [still]: { animation: 'none' },
                }}
            />
            <Box
                sx={{
                    position: 'absolute',
                    inset: 0,
                    backgroundImage: `linear-gradient(${alpha(theme.palette.text.primary, dark ? 0.05 : 0.04)} 1px, transparent 1px), linear-gradient(90deg, ${alpha(theme.palette.text.primary, dark ? 0.05 : 0.04)} 1px, transparent 1px)`,
                    backgroundSize: '48px 48px',
                    maskImage: 'radial-gradient(ellipse 70% 60% at 30% 50%, black, transparent)',
                }}
            />
            <Box
                sx={{
                    position: 'absolute',
                    width: 900,
                    height: 900,
                    left: '28%',
                    top: '50%',
                    ml: '-450px',
                    mt: '-450px',
                    borderRadius: '50%',
                    border: `1px solid ${alpha(primary, 0.12)}`,
                    boxShadow: `inset 0 0 0 150px transparent, inset 0 0 0 151px ${alpha(primary, 0.08)}, inset 0 0 0 300px transparent, inset 0 0 0 301px ${alpha(primary, 0.06)}`,
                    // The beam: a sharp leading line and a trail that fades behind it.
                    background: `conic-gradient(from 0deg, transparent 0%, ${alpha(primary, 0.01)} 4%, ${alpha(primary, dark ? 0.26 : 0.14)} 16%, transparent 16.3%)`,
                    maskImage: 'radial-gradient(circle, black 30%, transparent 70%)',
                    animation: `${sweep} 14s linear infinite`,
                    [still]: { animation: 'none' },
                }}
            />
        </Box>
    );
}

/** What the instance is watching right now, from its public statistics (or that it cannot be reached). */
function StatusPill() {
    const theme = useTheme();
    const stats = useQuery({
        queryKey: ['login', 'status'],
        queryFn: () => api.get<{ totalSources: number; totalWords: number }>('/api/threats_watcher/source/statistics/').then((r) => r.data),
        retry: 1,
        staleTime: 60_000,
    });
    const ok = !stats.isError;
    const color = ok ? theme.palette.success.main : theme.palette.error.main;
    const text = stats.isError
        ? 'Watcher cannot be reached'
        : stats.data
          ? `Watching ${stats.data.totalSources.toLocaleString('en-GB')} sources - ${stats.data.totalWords.toLocaleString('en-GB')} trending words`
          : 'Connecting…';
    return (
        <Stack
            direction="row"
            spacing={1}
            role="status"
            sx={{ alignItems: 'center', px: 1.5, py: 0.75, borderRadius: 99, border: 1, borderColor: 'divider', bgcolor: alpha(theme.palette.background.paper, 0.6), backdropFilter: 'blur(8px)' }}
        >
            <Box
                sx={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    bgcolor: color,
                    color: alpha(color, 0.5),
                    animation: ok ? `${pulse} 2s ease-out infinite` : 'none',
                    '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
                }}
            />
            <Typography variant="caption" sx={{ fontWeight: 600 }}>
                {text}
            </Typography>
        </Stack>
    );
}

function Brand() {
    return (
        <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center' }}>
            <img src="/static/img/round-logo-fav.png" width={40} height={40} alt="" />
            <Box>
                <Typography sx={{ fontWeight: 800, fontSize: 19, letterSpacing: '-0.02em', lineHeight: 1.1 }}>Watcher</Typography>
                <Typography variant="caption" color="text.secondary">
                    by Thales Group CERT
                </Typography>
            </Box>
        </Stack>
    );
}

/** Sign-in page: a full screen of its own, the platform on the left and the sign-in card on the right. */
export default function LoginPage() {
    const theme = useTheme();
    const location = useLocation();
    const isAuthenticated = useAuthStore(selectIsAuthenticated);
    const { loginMode, oidcCompanyName } = useInstanceConfig();
    const login = useLogin();

    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [capsLock, setCapsLock] = useState(false);

    useEffect(() => {
        document.title = 'Sign in - Watcher';
        const params = new URLSearchParams(window.location.search);
        if (params.get('sso_error')) {
            window.history.replaceState({}, document.title, window.location.pathname + window.location.hash);
            toast.error('SSO authentication failed. Please try again or sign in with your credentials.');
        }
    }, []);

    const redirectPath = (location.state as { from?: string } | null)?.from || '/';
    if (isAuthenticated) return <Navigate to={redirectPath} replace />;

    const hasSso = loginMode === 'both' || loginMode === 'sso_only';
    const hasForm = loginMode === 'both' || loginMode === 'form_only';
    const ssoLabel = oidcCompanyName ? `${oidcCompanyName} SSO` : 'SSO';
    const canSubmit = !!username.trim() && !!password && !login.isPending;
    const onSubmit = (e: FormEvent) => {
        e.preventDefault();
        if (canSubmit) login.mutate({ username, password });
    };
    const onKey = (e: KeyboardEvent) => setCapsLock(e.getModifierState?.('CapsLock') ?? false);
    const dark = theme.palette.mode === 'dark';

    return (
        <Box component="main" sx={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', position: 'relative', px: { xs: 2.5, sm: 5 }, py: { xs: 2.5, sm: 4 } }}>
            <Backdrop />
            <Stack direction="row" sx={{ position: 'relative', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
                <Brand />
                <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                    <Box sx={{ display: { xs: 'none', sm: 'block' } }}>
                        <StatusPill />
                    </Box>
                </Stack>
            </Stack>

            <Box
                sx={{
                    position: 'relative',
                    flexGrow: 1,
                    display: 'grid',
                    gridTemplateColumns: { xs: '1fr', md: '1.15fr 1fr' },
                    alignItems: 'center',
                    gap: { xs: 4, md: 8 },
                    width: '100%',
                    maxWidth: 1180,
                    mx: 'auto',
                    py: { xs: 3, md: 4 },
                }}
            >
                <Box sx={{ display: { xs: 'none', md: 'block' } }}>
                    <Typography variant="overline" color="primary" sx={{ fontWeight: 700, letterSpacing: '0.12em' }}>
                        Cyber threat intelligence
                    </Typography>
                    <Typography component="h2" sx={{ fontSize: 40, fontWeight: 800, lineHeight: 1.1, letterSpacing: '-0.03em', mt: 1, mb: 1.5 }}>
                        See the threats coming
                        <br />
                        before they reach you.
                    </Typography>
                    <Typography color="text.secondary" sx={{ maxWidth: 480 }}>
                        Watcher reads the news, the vulnerability feeds, the leak sites and the certificate logs every few minutes, and tells you
                        what concerns your organisation.
                    </Typography>
                </Box>

                <Box
                    sx={{
                        width: '100%',
                        maxWidth: 420,
                        justifySelf: 'center',
                        p: { xs: 3, sm: 4 },
                        borderRadius: 4,
                        border: 1,
                        borderColor: 'divider',
                        bgcolor: alpha(theme.palette.background.paper, dark ? 0.72 : 0.85),
                        backdropFilter: 'blur(16px)',
                        boxShadow: `0 24px 64px ${alpha(dark ? '#000' : theme.palette.primary.dark, dark ? 0.5 : 0.12)}`,
                    }}
                >
                    <Typography variant="h2" component="h1">
                        Sign in
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 3 }}>
                        Welcome back. Your watch continues where you left it.
                    </Typography>

                    {hasSso && (
                        <Button variant="contained" fullWidth size="large" href={`/api/auth/oidc/login/?next=/#${redirectPath}`} startIcon={<VpnKeyOutlined />}>
                            Continue with {ssoLabel}
                        </Button>
                    )}
                    {hasSso && hasForm && <Divider sx={{ my: 2.5, color: 'text.secondary', fontSize: 12, fontWeight: 600 }}>or with your Watcher account</Divider>}

                    {hasForm && (
                        <Stack component="form" onSubmit={onSubmit} noValidate spacing={2}>
                            {login.error && (
                                <Alert severity="error" role="alert" data-testid="login-error">
                                    {getErrorMessage(login.error, 'Sign-in failed. Check your username and password.')}
                                </Alert>
                            )}
                            <TextField
                                id="login-username"
                                name="username"
                                label="Username"
                                autoComplete="username"
                                autoFocus
                                fullWidth
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                            />
                            <TextField
                                id="login-password"
                                name="password"
                                label="Password"
                                type={showPassword ? 'text' : 'password'}
                                autoComplete="current-password"
                                fullWidth
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                onKeyUp={onKey}
                                onKeyDown={onKey}
                                helperText={
                                    capsLock ? (
                                        <Stack component="span" direction="row" spacing={0.5} sx={{ alignItems: 'center', color: 'warning.main' }}>
                                            <KeyboardCapslockOutlined sx={{ fontSize: 15 }} />
                                            <span>Caps Lock is on</span>
                                        </Stack>
                                    ) : undefined
                                }
                                slotProps={{
                                    htmlInput: { maxLength: 100 },
                                    input: {
                                        endAdornment: (
                                            <InputAdornment position="end">
                                                <IconButton edge="end" tabIndex={-1} aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword((v) => !v)}>
                                                    {showPassword ? <VisibilityOffOutlined fontSize="small" /> : <VisibilityOutlined fontSize="small" />}
                                                </IconButton>
                                            </InputAdornment>
                                        ),
                                    },
                                }}
                            />
                            <Button type="submit" variant={hasSso ? 'outlined' : 'contained'} size="large" fullWidth disabled={!canSubmit} loading={login.isPending}>
                                Sign in
                            </Button>
                        </Stack>
                    )}
                    <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 3, textAlign: 'center' }}>
                        Some pages are open without an account:{' '}
                        <Link href="#/">the dashboard</Link>, <Link href="#/threats_watcher">Threats Watcher</Link> and <Link href="#/legitimate_domains">Legitimate Domains</Link>.
                    </Typography>
                </Box>
            </Box>

            <Stack direction="row" spacing={2} sx={{ position: 'relative', justifyContent: 'center', color: 'text.secondary' }}>
                <Link href="https://thalesgroup-cert.github.io/Watcher/" target="_blank" rel="noopener noreferrer" variant="caption" color="inherit">
                    Documentation
                </Link>
                <Link href="https://github.com/thalesgroup-cert/Watcher" target="_blank" rel="noopener noreferrer" variant="caption" color="inherit">
                    Open source on GitHub
                </Link>
            </Stack>
        </Box>
    );
}
