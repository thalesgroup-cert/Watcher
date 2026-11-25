import { useState, type ReactNode } from 'react';
import { Link as RouterLink, useLocation, useNavigate } from 'react-router';
import { Box, Button, Card, CardContent, Dialog, DialogActions, DialogContent, DialogTitle, Stack, Tab, Tabs, Typography } from '@mui/material';
import AddCircleOutlineOutlined from '@mui/icons-material/AddCircleOutlineOutlined';
import AdminPanelSettingsOutlined from '@mui/icons-material/AdminPanelSettingsOutlined';
import DeleteOutlined from '@mui/icons-material/DeleteOutlined';
import EditOutlined from '@mui/icons-material/EditOutlined';
import FaceOutlined from '@mui/icons-material/FaceOutlined';
import HistoryOutlined from '@mui/icons-material/HistoryOutlined';
import KeyOutlined from '@mui/icons-material/KeyOutlined';
import PersonOutlineOutlined from '@mui/icons-material/PersonOutlineOutlined';
import PowerOutlined from '@mui/icons-material/PowerOutlined';
import RestartAltOutlined from '@mui/icons-material/RestartAltOutlined';
import UserAvatar, { displayName } from '../../../components/common/UserAvatar';
import { notifySuccess } from '../../../lib/notify';
import { KpiCard } from '../../../ui/KpiCard';
import { Page, PageHeader } from '../../../ui/Page';
import { ActivityFeed, DEFAULT_FILTERS } from '../../timeline/components/ActivityFeed';
import { useMyActivitySummary } from '../../timeline/hooks';
import type { FeedFilters } from '../../timeline/types';
import { useProfile } from '../hooks';
import { selectUser, useAuthStore } from '../store';
import type { User } from '../types';
import { AccessPanel } from './AccessPanel';
import { AvatarEditor } from './AvatarEditor';
import { ChangePasswordDialog } from './ChangePasswordDialog';
import { useThemeMode } from '../../../styles/ThemeModeProvider';
import { AiPreferences } from './AiPreferences';
import { DisplayPicker } from './DisplayPicker';
import { EffectsPicker } from './EffectsPicker';
import { ThemePicker } from './ThemePicker';

const TABS = [
    { value: 'profile', label: 'Profile' },
    { value: 'appearance', label: 'Appearance' },
    { value: 'activity', label: 'My activity' },
] as const;
type TabValue = (typeof TABS)[number]['value'];

function SectionCard({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
    return (
        <Card>
            <CardContent sx={{ p: 2.5 }}>
                <Typography variant="h3" component="h2">
                    {title}
                </Typography>
                {subtitle && (
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                        {subtitle}
                    </Typography>
                )}
                {!subtitle && <Box sx={{ mb: 2 }} />}
                {children}
            </CardContent>
        </Card>
    );
}

/** Who you are, first: the avatar, the name, the identifier and the e-mail, and the two things you can change about them. */
function IdentityCard({ user, onAvatar, onPassword }: { user: User; onAvatar: () => void; onPassword: () => void }) {
    const { data: profile } = useProfile();
    return (
        <Card data-testid="identity-card">
            <CardContent sx={{ p: 2.5, display: 'flex', alignItems: 'center', gap: 3, flexWrap: 'wrap' }}>
                <UserAvatar
                    username={user.username}
                    firstName={user.first_name}
                    lastName={user.last_name}
                    avatarColor={profile?.avatar_color ?? null}
                    avatar={profile?.avatar}
                    size={104}
                    tooltip={false}
                />
                <Box sx={{ flexGrow: 1, minWidth: 220 }}>
                    <Typography variant="h2" component="h2" sx={{ wordBreak: 'break-word' }}>
                        {displayName(user.first_name, user.last_name, user.username)}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ wordBreak: 'break-word' }}>
                        @{user.username}
                        {user.email && ` - ${user.email}`}
                    </Typography>
                </Box>
                <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', rowGap: 1 }}>
                    <Button variant="outlined" color="inherit" startIcon={<FaceOutlined />} onClick={onAvatar} data-testid="change-avatar">
                        Change avatar
                    </Button>
                    <Button variant="outlined" color="inherit" startIcon={<KeyOutlined />} onClick={onPassword}>
                        Change password
                    </Button>
                </Stack>
            </CardContent>
        </Card>
    );
}

/** The avatar editor, in a window of its own: it is used once in a while, it should not fill the page. */
function AvatarDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
    return (
        <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth aria-labelledby="avatar-dialog-title">
            <DialogTitle id="avatar-dialog-title">Change avatar</DialogTitle>
            <DialogContent>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    Build the avatar people see next to your name across Watcher.
                </Typography>
                {/* Remounted at each opening: the gallery starts from the saved avatar */}
                {open && <AvatarEditor onSaved={onClose} />}
            </DialogContent>
            <DialogActions>
                <Button color="inherit" onClick={onClose}>
                    Close
                </Button>
            </DialogActions>
        </Dialog>
    );
}

function ProfileTab({ user, onAvatar, onPassword }: { user: User; onAvatar: () => void; onPassword: () => void }) {
    return (
        <Stack spacing={2.5}>
            <IdentityCard user={user} onAvatar={onAvatar} onPassword={onPassword} />
            <SectionCard title="Access" subtitle="What your account is allowed to do in each part of Watcher.">
                <AccessPanel user={user} />
            </SectionCard>
            {user.is_superuser && (
                <Card>
                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ p: 2.5, alignItems: { sm: 'center' } }}>
                        <AdminPanelSettingsOutlined color="action" />
                        <Box sx={{ flexGrow: 1 }}>
                            <Typography sx={{ fontWeight: 600 }}>Administration</Typography>
                            <Typography variant="body2" color="text.secondary">
                                Credentials and endpoints of the external services Watcher talks to.
                            </Typography>
                        </Box>
                        <Button component={RouterLink} to="/connectors" variant="outlined" startIcon={<PowerOutlined />}>
                            Connectors
                        </Button>
                    </Stack>
                </Card>
            )}
        </Stack>
    );
}

function AppearanceTab() {
    const { ambient, resetAppearance } = useThemeMode();
    return (
        <Stack spacing={2.5}>
            <SectionCard title="Theme" subtitle="Stored with your account, so it follows you on every browser.">
                <ThemePicker />
            </SectionCard>
            {/* Only the themes with a backdrop (Clay) have effects to set */}
            {ambient && (
                <SectionCard title="Background effects" subtitle="Calm or turn them off on a slow computer.">
                    <EffectsPicker />
                </SectionCard>
            )}
            <SectionCard title="Display" subtitle="How tables, text, motion and charts look, whatever the theme. Stored with your account.">
                <DisplayPicker />
            </SectionCard>
            <SectionCard title="AI summaries" subtitle="How the weekly report, the breaking news and the word summaries are shown.">
                <AiPreferences />
            </SectionCard>
            <Box>
                <Button
                    variant="outlined"
                    color="inherit"
                    startIcon={<RestartAltOutlined />}
                    data-testid="reset-appearance"
                    onClick={() => {
                        resetAppearance();
                        notifySuccess('Appearance reset to the defaults');
                    }}
                >
                    Reset appearance
                </Button>
            </Box>
        </Stack>
    );
}

/** What you did today, by kind, and over the week; then the list of it, the last 7 days at first. */
function MyActivityTab() {
    const [filters, setFilters] = useState<FeedFilters>({ ...DEFAULT_FILTERS, actor: 'me', period: '7d' });
    const { data: summary } = useMyActivitySummary();
    return (
        <>
            <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: 'repeat(2, 1fr)', md: 'repeat(4, 1fr)' }, mb: 3 }} data-testid="my-activity-figures">
                <KpiCard title="Created today" value={summary?.created_today} icon={<AddCircleOutlineOutlined />} color="success" />
                <KpiCard title="Modified today" value={summary?.updated_today} icon={<EditOutlined />} color="primary" />
                <KpiCard title="Deleted today" value={summary?.deleted_today} icon={<DeleteOutlined />} color="error" />
                <KpiCard title="Last 7 days" value={summary?.week} icon={<HistoryOutlined />} color="inherit" />
            </Box>
            <ActivityFeed filters={filters} onFiltersChange={setFilters} lockActor periods defaultPeriod="7d" />
        </>
    );
}

export default function ProfilePage() {
    const user = useAuthStore(selectUser);
    const location = useLocation();
    const navigate = useNavigate();

    const params = new URLSearchParams(location.search);
    const tabParam = params.get('tab');
    // The Access tab became a card of the Profile: its old address still leads there
    const tab: TabValue = TABS.some((t) => t.value === tabParam) ? (tabParam as TabValue) : 'profile';
    const passwordOpen = params.get('dialog') === 'password';
    const avatarOpen = params.get('dialog') === 'avatar';

    const setParam = (key: string, value: string | null) => {
        const next = new URLSearchParams(location.search);
        if (value) next.set(key, value);
        else next.delete(key);
        const s = next.toString();
        void navigate({ search: s ? `?${s}` : '' }, { replace: true });
    };

    if (!user) return null;

    return (
        <Page maxWidth={1200}>
            <PageHeader
                icon={<PersonOutlineOutlined />}
                title="My profile"
                subtitle="Your account, how Watcher looks for you, and what you did."
                tabs={
                    <Tabs value={tab} onChange={(_, v: TabValue) => setParam('tab', v === 'profile' ? null : v)} aria-label="Profile sections">
                        {TABS.map((t) => (
                            <Tab key={t.value} value={t.value} label={t.label} />
                        ))}
                    </Tabs>
                }
            />

            {tab === 'profile' && <ProfileTab user={user} onAvatar={() => setParam('dialog', 'avatar')} onPassword={() => setParam('dialog', 'password')} />}
            {tab === 'appearance' && <AppearanceTab />}
            {tab === 'activity' && <MyActivityTab />}

            <AvatarDialog open={avatarOpen} onClose={() => setParam('dialog', null)} />
            <ChangePasswordDialog open={passwordOpen} onClose={() => setParam('dialog', null)} />
        </Page>
    );
}
