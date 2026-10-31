import { useEffect, useMemo, useState, type MouseEvent, type ReactElement, type ReactNode } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router';
import {
    alpha,
    createTheme,
    ThemeProvider,
    AppBar,
    Badge,
    Box,
    ButtonBase,
    Divider,
    Drawer,
    Fab,
    IconButton,
    ListItemIcon,
    Menu,
    MenuItem,
    Stack,
    Toolbar,
    Tooltip,
    Typography,
    useMediaQuery,
    useTheme,
} from '@mui/material';
import DnsOutlined from '@mui/icons-material/DnsOutlined';
import HelpOutlineOutlined from '@mui/icons-material/HelpOutlineOutlined';
import HistoryOutlined from '@mui/icons-material/HistoryOutlined';
import InfoOutlined from '@mui/icons-material/InfoOutlined';
import KeyboardArrowUp from '@mui/icons-material/KeyboardArrowUp';
import LoginOutlined from '@mui/icons-material/LoginOutlined';
import LogoutOutlined from '@mui/icons-material/LogoutOutlined';
import MenuRounded from '@mui/icons-material/MenuRounded';
import MonitorHeartOutlined from '@mui/icons-material/MonitorHeartOutlined';
import NotesOutlined from '@mui/icons-material/NotesOutlined';
import NotificationsNoneOutlined from '@mui/icons-material/NotificationsNoneOutlined';
import PowerOutlined from '@mui/icons-material/PowerOutlined';
import PushPinOutlined from '@mui/icons-material/PushPinOutlined';
import SearchRounded from '@mui/icons-material/SearchRounded';
import SecurityOutlined from '@mui/icons-material/SecurityOutlined';
import SettingsOutlined from '@mui/icons-material/SettingsOutlined';
import SpaceDashboardOutlined from '@mui/icons-material/SpaceDashboardOutlined';
import TravelExploreOutlined from '@mui/icons-material/TravelExploreOutlined';
import VerifiedUserOutlined from '@mui/icons-material/VerifiedUserOutlined';
import WhatshotOutlined from '@mui/icons-material/WhatshotOutlined';
import UserAvatar, { displayName } from '../components/common/UserAvatar';
import { useLogout, useProfile } from '../features/auth/hooks';
import { useInstanceConfig } from '../features/config/useInstanceConfig';
import { selectIsAuthenticated, selectUser, useAuthStore } from '../features/auth/store';
import { PendingActionsDialog } from '../features/pendingActions/PendingActionsDialog';
import { usePendingCount } from '../features/pendingActions/hooks';
import { SearchDialog } from '../features/search/SearchDialog';
import { THEMES } from '../styles/themes';
import { useThemeMode } from '../styles/ThemeModeProvider';
import { INSPECTOR_GAP, useInspectorWidth } from '../ui/SideDrawer';

export const RAIL_WIDTH = 72;
export const SIDEBAR_WIDTH = 248;
const PIN_KEY = 'watcher.sidebar.pinned';
/** Narrowest list worth keeping beside a docked inspector; below, the inspector floats over the list instead. */
const MIN_LIST_WIDTH = 960;

function useWindowWidth() {
    const [width, setWidth] = useState(() => window.innerWidth);
    useEffect(() => {
        const onResize = () => setWidth(window.innerWidth);
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, []);
    return width;
}

interface NavEntry {
    to: string;
    label: string;
    icon: ReactElement;
    /** Shown to visitors who are not signed in (the other pages ask to sign in). */
    public?: boolean;
    superuser?: boolean;
}

const SECTIONS: { label: string; items: NavEntry[] }[] = [
    {
        label: 'Monitor',
        items: [
            { to: '/', label: 'Dashboard', icon: <SpaceDashboardOutlined />, public: true },
            { to: '/threats_watcher', label: 'Threats Watcher', icon: <WhatshotOutlined />, public: true },
            { to: '/cyber_watch', label: 'Cyber Watch', icon: <SecurityOutlined /> },
            { to: '/data_leak', label: 'Data Leak', icon: <TravelExploreOutlined /> },
            { to: '/dns_finder', label: 'DNS Threats', icon: <DnsOutlined /> },
            { to: '/website_monitoring', label: 'Website Monitoring', icon: <MonitorHeartOutlined /> },
        ],
    },
    { label: 'Assets', items: [{ to: '/legitimate_domains', label: 'Legitimate Domains', icon: <VerifiedUserOutlined />, public: true }] },
    {
        label: 'Workspace',
        items: [
            { to: '/activity', label: 'Activity', icon: <HistoryOutlined /> },
            { to: '/connectors', label: 'Connectors', icon: <PowerOutlined />, superuser: true },
        ],
    },
];

const PAGE_TITLES: Record<string, string> = {
    '/': 'Dashboard',
    '/threats_watcher': 'Threats Watcher',
    '/legitimate_domains': 'Legitimate Domains',
    '/cyber_watch': 'Cyber Watch',
    '/data_leak': 'Data Leak',
    '/website_monitoring': 'Website Monitoring',
    '/dns_finder': 'DNS Threats',
    '/connectors': 'Connectors',
    '/login': 'Sign in',
    '/profile': 'My profile',
    '/activity': 'Activity',
    '/whats_new': "What's new",
};

const DOCS_URL = 'https://thalesgroup-cert.github.io/Watcher/';
const REPO_URL = 'https://github.com/thalesgroup-cert/Watcher';

/**
 * A theme with its own navigation colour (Darkly: Bootstrap's navbar-dark on bg-primary) gives the sidebar white text on
 * that colour, white links at 60% and a white active link, like the navbar of the former interface.
 */
function NavbarTheme({ children }: { children: ReactNode }) {
    const outer = useTheme();
    const { themeName } = useThemeMode();
    const navbar = THEMES[themeName].navbar;
    const inner = useMemo(
        () =>
            navbar
                ? createTheme(outer, {
                      palette: {
                          mode: 'dark',
                          primary: { main: '#FFFFFF' },
                          text: { primary: '#FFFFFF', secondary: 'rgba(255, 255, 255, 0.6)' },
                          divider: 'rgba(255, 255, 255, 0.15)',
                          action: { hover: 'rgba(255, 255, 255, 0.08)' },
                      },
                  })
                : outer,
        [outer, navbar],
    );
    return navbar ? <ThemeProvider theme={inner}>{children}</ThemeProvider> : <>{children}</>;
}

function readPinned() {
    try {
        return localStorage.getItem(PIN_KEY) === '1';
    } catch {
        return false;
    }
}

/** One line of the sidebar: an icon, and its label when the sidebar is open. */
function RailButton({ label, icon, slim, badge, active, ...rest }: { label: string; icon: ReactElement; slim: boolean; badge?: number; active?: boolean } & Record<string, unknown>) {
    const theme = useTheme();
    const primary = theme.palette.primary.main;
    const dark = theme.palette.mode === 'dark';
    return (
        <Tooltip title={slim ? label : ''} placement="right">
            <ButtonBase
                aria-label={label}
                {...rest}
                className={active ? 'active' : undefined}
                sx={{
                    position: 'relative',
                    width: '100%',
                    height: 42,
                    borderRadius: 2,
                    px: 1.5,
                    gap: 1.5,
                    justifyContent: 'flex-start',
                    color: 'text.secondary',
                    transition: theme.transitions.create(['background-color', 'color'], { duration: 120 }),
                    '& .rail-icon': { display: 'grid', placeItems: 'center', width: 24, flexShrink: 0, '& svg': { fontSize: 21 } },
                    '& .rail-label': { fontSize: 13.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', opacity: slim ? 0 : 1, transition: 'opacity 150ms' },
                    '&:hover': { bgcolor: alpha(theme.palette.text.primary, dark ? 0.06 : 0.04), color: 'text.primary' },
                    '&.active': {
                        color: primary,
                        bgcolor: alpha(primary, dark ? 0.16 : 0.1),
                        '& .rail-label': { fontWeight: 700 },
                        // The bar on the outer edge marks the page you are on, open or folded.
                        '&::before': { content: '""', position: 'absolute', left: -10, top: 9, bottom: 9, width: 3, borderRadius: '0 3px 3px 0', bgcolor: primary },
                    },
                    '&.Mui-focusVisible': { outline: `2px solid ${alpha(primary, 0.7)}`, outlineOffset: 1 },
                }}
            >
                <Box className="rail-icon">
                    {badge ? (
                        <Badge color="error" badgeContent={badge} max={99} overlap="circular">
                            {icon}
                        </Badge>
                    ) : (
                        icon
                    )}
                </Box>
                <Box component="span" className="rail-label">
                    {label}
                </Box>
            </ButtonBase>
        </Tooltip>
    );
}

function HelpMenu({ slim }: { slim: boolean }) {
    const { helpButtonUrl, helpButtonLabel } = useInstanceConfig();
    const [anchor, setAnchor] = useState<HTMLElement | null>(null);
    const close = () => setAnchor(null);
    return (
        <>
            <RailButton label="Help" icon={<HelpOutlineOutlined />} slim={slim} onClick={(e: MouseEvent<HTMLElement>) => setAnchor(e.currentTarget)} aria-haspopup="menu" />
            <Menu anchorEl={anchor} open={!!anchor} onClose={close} anchorOrigin={{ vertical: 'center', horizontal: 'right' }} transformOrigin={{ vertical: 'center', horizontal: 'left' }}>
                {helpButtonUrl && (
                    <MenuItem component="a" href={helpButtonUrl} target="_blank" rel="noopener noreferrer" onClick={close}>
                        <ListItemIcon>
                            <SettingsOutlined fontSize="small" />
                        </ListItemIcon>
                        {helpButtonLabel || 'API'}
                    </MenuItem>
                )}
                <MenuItem component="a" href={DOCS_URL} target="_blank" rel="noopener noreferrer" onClick={close}>
                    <ListItemIcon>
                        <NotesOutlined fontSize="small" />
                    </ListItemIcon>
                    Documentation
                </MenuItem>
                <MenuItem component="a" href={REPO_URL} target="_blank" rel="noopener noreferrer" onClick={close}>
                    <ListItemIcon>
                        <InfoOutlined fontSize="small" />
                    </ListItemIcon>
                    About Watcher
                </MenuItem>
            </Menu>
        </>
    );
}

const IS_MAC = typeof navigator !== 'undefined' && /mac/i.test(navigator.platform);

/**
 * The way into the global search: an icon when the sidebar is folded, a preview of the search field when it is open.
 * It is one button that changes its look, never two elements swapped: the sidebar opens when the mouse reaches the icon,
 * and a click made at that moment must not fall on an element that has just been replaced.
 */
function SearchEntry({ slim, onSearch }: { slim: boolean; onSearch: () => void }) {
    const theme = useTheme();
    return (
        <Tooltip title={slim ? 'Search' : ''} placement="right">
            <ButtonBase
                aria-label="Search"
                onClick={onSearch}
                sx={{
                    width: '100%',
                    height: 42,
                    // The border takes 1 px: the icon stays on the same column as the icons of the menu.
                    px: '11px',
                    gap: 1.5,
                    justifyContent: 'flex-start',
                    borderRadius: 2,
                    border: 1,
                    borderColor: slim ? 'transparent' : 'divider',
                    color: 'text.secondary',
                    transition: theme.transitions.create(['background-color', 'color', 'border-color'], { duration: 120 }),
                    '& .search-icon': { display: 'grid', placeItems: 'center', width: 24, flexShrink: 0, '& svg': { fontSize: 21 } },
                    '&:hover': { bgcolor: 'action.hover', color: 'text.primary' },
                    '&.Mui-focusVisible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 1 },
                }}
            >
                <Box className="search-icon">
                    <SearchRounded />
                </Box>
                <Box component="span" sx={{ flexGrow: 1, textAlign: 'left', fontSize: 13.5, fontWeight: 600, whiteSpace: 'nowrap', opacity: slim ? 0 : 1, transition: 'opacity 150ms' }}>
                    Search…
                </Box>
                <Box
                    component="kbd"
                    sx={{ px: 0.75, py: 0.125, borderRadius: 1, border: 1, borderColor: 'divider', fontFamily: 'inherit', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap', opacity: slim ? 0 : 1, transition: 'opacity 150ms' }}
                >
                    {IS_MAC ? '⌘K' : 'Ctrl K'}
                </Box>
            </ButtonBase>
        </Tooltip>
    );
}

function SidebarContent({ slim, pinned, onPin, onNavigate, onSearch }: { slim: boolean; pinned: boolean; onPin?: () => void; onNavigate?: () => void; onSearch: () => void }) {
    const theme = useTheme();
    const location = useLocation();
    const navigate = useNavigate();
    const signedIn = useAuthStore(selectIsAuthenticated);
    const user = useAuthStore(selectUser);
    const { data: profile } = useProfile();
    const { data: pending = 0 } = usePendingCount(signedIn);
    const logout = useLogout();
    const [pendingOpen, setPendingOpen] = useState(false);
    const name = user ? displayName(user.first_name, user.last_name, user.username) : '';
    const isActive = (to: string) => (to === '/' ? location.pathname === '/' : location.pathname.startsWith(to));

    return (
        <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', overflowX: 'hidden' }}>
            <Stack direction="row" sx={{ alignItems: 'center', gap: 1.25, px: 2, height: 64, flexShrink: 0 }}>
                <ButtonBase component={NavLink} to="/" onClick={onNavigate} aria-label="Watcher home" sx={{ borderRadius: '50%', flexShrink: 0 }}>
                    <img src="/static/img/round-logo-fav.png" width={36} height={36} alt="" />
                </ButtonBase>
                <Box sx={{ minWidth: 0, flexGrow: 1, opacity: slim ? 0 : 1, transition: 'opacity 150ms' }}>
                    <Typography sx={{ fontWeight: 800, fontSize: 16, letterSpacing: '-0.02em', lineHeight: 1.1 }} noWrap>
                        Watcher
                    </Typography>
                    <Typography variant="caption" color="text.secondary" noWrap component="div" sx={{ lineHeight: 1.2 }}>
                        Threat intelligence
                    </Typography>
                </Box>
                {onPin && !slim && (
                    <Tooltip title={pinned ? 'Fold the menu' : 'Keep the menu open'} placement="right">
                        <IconButton size="small" onClick={onPin} aria-label={pinned ? 'Fold the menu' : 'Keep the menu open'} aria-pressed={pinned} sx={{ color: pinned ? 'primary.main' : 'text.secondary' }}>
                            <PushPinOutlined sx={{ fontSize: 17, transform: pinned ? 'none' : 'rotate(45deg)', transition: 'transform 200ms' }} />
                        </IconButton>
                    </Tooltip>
                )}
            </Stack>
            <Divider />
            <Box sx={{ px: 1.25, pt: 1.25 }}>
                <SearchEntry slim={slim} onSearch={onSearch} />
            </Box>

            <Box component="nav" aria-label="Main navigation" sx={{ flexGrow: 1, overflowY: 'auto', overflowX: 'hidden', px: 1.25, py: 1.5 }}>
                {SECTIONS.map((section, i) => {
                    const items = section.items.filter((item) => (signedIn || item.public) && (!item.superuser || user?.is_superuser));
                    if (!items.length) return null;
                    return (
                        <Box key={section.label} sx={{ mt: i ? 1.5 : 0 }}>
                            <Typography
                                variant="overline"
                                color="text.secondary"
                                component="div"
                                sx={{ px: 1.5, height: 24, lineHeight: '24px', fontSize: 10.5, letterSpacing: '0.08em', opacity: slim ? 0 : 0.8, transition: 'opacity 150ms' }}
                            >
                                {section.label}
                            </Typography>
                            <Stack spacing={0.25}>
                                {items.map((item) => (
                                    <RailButton
                                        key={item.to}
                                        label={item.label}
                                        icon={item.icon}
                                        slim={slim}
                                        active={isActive(item.to)}
                                        component={NavLink}
                                        to={item.to}
                                        end={item.to === '/'}
                                        onClick={onNavigate}
                                        aria-current={isActive(item.to) ? 'page' : undefined}
                                    />
                                ))}
                            </Stack>
                        </Box>
                    );
                })}
            </Box>

            <Divider />
            <Stack spacing={0.25} sx={{ px: 1.25, py: 1.25 }}>
                {signedIn && <RailButton label="Pending actions" icon={<NotificationsNoneOutlined />} slim={slim} badge={pending} onClick={() => setPendingOpen(true)} />}
                <HelpMenu slim={slim} />
            </Stack>
            <Divider />
            <Box sx={{ px: 1.25, py: 1.25 }}>
                {signedIn && user ? (
                    <Stack direction="row" sx={{ alignItems: 'center', gap: 0.5 }}>
                        <Tooltip title={slim ? `${name} - my profile` : ''} placement="right">
                            <ButtonBase
                                component={NavLink}
                                to="/profile"
                                onClick={onNavigate}
                                aria-label="My profile"
                                sx={{ flexGrow: 1, minWidth: 0, justifyContent: 'flex-start', gap: 1.25, borderRadius: 2, p: 0.75, '&:hover': { bgcolor: 'action.hover' }, '&.active': { bgcolor: alpha(theme.palette.primary.main, 0.1) } }}
                            >
                                <UserAvatar username={user.username} firstName={user.first_name} lastName={user.last_name} avatarColor={profile?.avatar_color ?? null} avatar={profile?.avatar} size={32} tooltip={false} />
                                <Box sx={{ minWidth: 0, textAlign: 'left', opacity: slim ? 0 : 1, transition: 'opacity 150ms' }}>
                                    <Typography variant="body2" sx={{ fontWeight: 700 }} noWrap>
                                        {name}
                                    </Typography>
                                    <Typography variant="caption" color="text.secondary" noWrap component="div">
                                        @{user.username}
                                    </Typography>
                                </Box>
                            </ButtonBase>
                        </Tooltip>
                        {!slim && (
                            <Tooltip title="Sign out">
                                <IconButton aria-label="Sign out" onClick={() => logout.mutate()} size="small">
                                    <LogoutOutlined fontSize="small" />
                                </IconButton>
                            </Tooltip>
                        )}
                    </Stack>
                ) : (
                    <RailButton
                        label="Sign in"
                        icon={<LoginOutlined />}
                        slim={slim}
                        onClick={() => {
                            onNavigate?.();
                            void navigate('/login', { state: { from: location.pathname + location.search } });
                        }}
                    />
                )}
            </Box>
            <PendingActionsDialog open={pendingOpen} onClose={() => setPendingOpen(false)} />
        </Box>
    );
}

function ScrollToTop({ right }: { right: number }) {
    const [visible, setVisible] = useState(false);
    useEffect(() => {
        const onScroll = () => setVisible(window.scrollY > 300);
        window.addEventListener('scroll', onScroll);
        return () => window.removeEventListener('scroll', onScroll);
    }, []);
    if (!visible) return null;
    return (
        <Fab color="primary" size="small" aria-label="Scroll to top" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} sx={{ position: 'fixed', bottom: 24, right: right + 24, zIndex: 1100 }}>
            <KeyboardArrowUp />
        </Fab>
    );
}

/**
 * Application frame: the sidebar (a rail of icons that opens on hover, or stays open when pinned; a drawer on small
 * screens) and the page, which makes room for a docked inspector.
 */
export default function AppShell({ children }: { children: ReactNode }) {
    const theme = useTheme();
    const desktop = useMediaQuery(theme.breakpoints.up('md'));
    const location = useLocation();
    const inspector = useInspectorWidth();
    const [pinned, setPinned] = useState(readPinned);
    const [hovered, setHovered] = useState(false);
    const [mobileOpen, setMobileOpen] = useState(false);
    const [searchOpen, setSearchOpen] = useState(false);
    const dark = theme.palette.mode === 'dark';

    // Ctrl+K (⌘K on a Mac) opens the global search from any page.
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
                e.preventDefault();
                setSearchOpen(true);
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);

    useEffect(() => {
        document.title = PAGE_TITLES[location.pathname] ? `${PAGE_TITLES[location.pathname]} - Watcher` : 'Watcher';
    }, [location.pathname]);

    const togglePin = () =>
        setPinned((p) => {
            try {
                localStorage.setItem(PIN_KEY, p ? '0' : '1');
            } catch {
                // Storage blocked: the choice lasts for this visit.
            }
            if (p) setHovered(false);
            return !p;
        });

    const reserved = pinned ? SIDEBAR_WIDTH : RAIL_WIDTH;
    const slim = !pinned && !hovered;
    const paperWidth = slim ? RAIL_WIDTH : SIDEBAR_WIDTH;
    const windowWidth = useWindowWidth();
    const room = inspector + INSPECTOR_GAP * 2;
    // The list makes room for the inspector when it stays wide enough; otherwise the inspector floats over it.
    const pageRight = desktop && inspector && windowWidth - reserved - room >= MIN_LIST_WIDTH ? room : 0;
    const { themeName } = useThemeMode();
    const sidebarBg = THEMES[themeName].navbar ?? (dark ? '#0f1726' : theme.palette.background.paper);

    return (
        <Box sx={{ display: 'flex', minHeight: '100vh' }}>
            {desktop ? (
                <Box component="aside" aria-label="Sidebar" sx={{ width: reserved, flexShrink: 0, transition: theme.transitions.create('width') }}>
                    <Box
                        onMouseEnter={pinned ? undefined : () => setHovered(true)}
                        onMouseLeave={pinned ? undefined : () => setHovered(false)}
                        sx={{
                            position: 'fixed',
                            top: 0,
                            left: 0,
                            height: '100vh',
                            width: paperWidth,
                            overflowX: 'hidden',
                            bgcolor: sidebarBg,
                            borderRight: 1,
                            borderColor: 'divider',
                            // Opened by the mouse, it floats over the page instead of pushing it.
                            boxShadow: !pinned && hovered ? `8px 0 32px ${alpha('#000', dark ? 0.45 : 0.12)}` : 'none',
                            transition: theme.transitions.create(['width', 'box-shadow'], { duration: 180 }),
                            zIndex: theme.zIndex.drawer + 2,
                        }}
                    >
                        <NavbarTheme>
                            <SidebarContent slim={slim} pinned={pinned} onPin={togglePin} onSearch={() => setSearchOpen(true)} />
                        </NavbarTheme>
                    </Box>
                </Box>
            ) : (
                <>
                    <NavbarTheme>
                <AppBar position="fixed" color="inherit" elevation={0} sx={{ borderBottom: 1, borderColor: 'divider', bgcolor: sidebarBg }}>
                            <Toolbar sx={{ minHeight: 56, gap: 1 }}>
                                <IconButton edge="start" aria-label="Open the menu" onClick={() => setMobileOpen(true)}>
                                    <MenuRounded />
                                </IconButton>
                                <img src="/static/img/round-logo-fav.png" width={28} height={28} alt="" />
                                <Typography sx={{ fontWeight: 800, fontSize: 15 }} noWrap>
                                    {PAGE_TITLES[location.pathname] ?? 'Watcher'}
                                </Typography>
                                <Box sx={{ flexGrow: 1 }} />
                                <IconButton aria-label="Search" onClick={() => setSearchOpen(true)}>
                                    <SearchRounded />
                                </IconButton>
                            </Toolbar>
                        </AppBar>
                    </NavbarTheme>
                    <Drawer open={mobileOpen} onClose={() => setMobileOpen(false)} slotProps={{ paper: { sx: { width: SIDEBAR_WIDTH, bgcolor: sidebarBg } } }}>
                        <NavbarTheme>
                            <SidebarContent
                                slim={false}
                                pinned
                                onNavigate={() => setMobileOpen(false)}
                                onSearch={() => {
                                    setMobileOpen(false);
                                    setSearchOpen(true);
                                }}
                            />
                        </NavbarTheme>
                    </Drawer>
                </>
            )}
            <Box component="main" sx={{ flexGrow: 1, minWidth: 0, pt: { xs: 7, md: 0 }, pr: `${pageRight}px`, transition: theme.transitions.create('padding-right', { duration: 220 }) }}>
                {children}
            </Box>
            <ScrollToTop right={pageRight} />
            <SearchDialog open={searchOpen} onClose={() => setSearchOpen(false)} />
        </Box>
    );
}

