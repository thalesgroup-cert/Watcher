import { useState, type ReactNode } from 'react';
import { Link as RouterLink, useLocation, useNavigate } from 'react-router';
import { Box, Button, Card, CardContent, Stack, Tab, Tabs, Typography } from '@mui/material';
import AdminPanelSettingsOutlined from '@mui/icons-material/AdminPanelSettingsOutlined';
import KeyOutlined from '@mui/icons-material/KeyOutlined';
import PowerOutlined from '@mui/icons-material/PowerOutlined';
import UserAvatar, { displayName } from '../../../components/common/UserAvatar';
import { Page, PageHeader } from '../../../ui/Page';
import { ActivityFeed, DEFAULT_FILTERS } from '../../timeline/components/ActivityFeed';
import type { FeedFilters } from '../../timeline/types';
import { useProfile } from '../hooks';
import { selectUser, useAuthStore } from '../store';
import type { User } from '../types';
import { AccessPanel } from './AccessPanel';
import { AvatarEditor } from './AvatarEditor';
import { ChangePasswordDialog } from './ChangePasswordDialog';
import { ThemePicker } from './ThemePicker';

const TABS = [
    { value: 'profile', label: 'Profile' },
    { value: 'appearance', label: 'Appearance' },
    { value: 'access', label: 'Access' },
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

function Detail({ label, value }: { label: string; value: string }) {
    return (
        <Box>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                {label}
            </Typography>
            <Typography variant="body2" sx={{ wordBreak: 'break-word' }}>
                {value || '-'}
            </Typography>
        </Box>
    );
}

function ProfileTab({ user, onPassword }: { user: User; onPassword: () => void }) {
    return (
        <Box sx={{ display: 'grid', gap: 2.5, gridTemplateColumns: { xs: '1fr', lg: '1fr 320px' }, alignItems: 'start' }}>
            <SectionCard title="Avatar" subtitle="Build the avatar people see next to your name across Watcher.">
                <AvatarEditor />
            </SectionCard>
            <SectionCard title="Account">
                <Stack spacing={1.75}>
                    <Detail label="Name" value={[user.first_name, user.last_name].filter(Boolean).join(' ')} />
                    <Detail label="Username" value={user.username} />
                    <Detail label="Email" value={user.email} />
                    <Button variant="outlined" color="inherit" startIcon={<KeyOutlined />} onClick={onPassword} sx={{ alignSelf: 'flex-start' }}>
                        Change password
                    </Button>
                </Stack>
            </SectionCard>
        </Box>
    );
}

function AppearanceTab() {
    return (
        <SectionCard title="Theme" subtitle="Stored with your account, so it follows you on every browser.">
            <ThemePicker />
        </SectionCard>
    );
}

function AccessTab({ user }: { user: User }) {
    return (
        <Stack spacing={2.5}>
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

function MyActivityTab() {
    const [filters, setFilters] = useState<FeedFilters>({ ...DEFAULT_FILTERS, actor: 'me' });
    return <ActivityFeed filters={filters} onFiltersChange={setFilters} lockActor />;
}

export default function ProfilePage() {
    const user = useAuthStore(selectUser);
    const { data: profile } = useProfile();
    const location = useLocation();
    const navigate = useNavigate();

    const params = new URLSearchParams(location.search);
    const tabParam = params.get('tab');
    const tab: TabValue = TABS.some((t) => t.value === tabParam) ? (tabParam as TabValue) : 'profile';
    const passwordOpen = params.get('dialog') === 'password';

    const setParam = (key: string, value: string | null) => {
        const next = new URLSearchParams(location.search);
        if (value) next.set(key, value);
        else next.delete(key);
        const s = next.toString();
        void navigate({ search: s ? `?${s}` : '' }, { replace: true });
    };

    if (!user) return null;
    const name = displayName(user.first_name, user.last_name, user.username);

    return (
        <Page maxWidth={1200}>
            <PageHeader
                icon={
                    <UserAvatar
                        username={user.username}
                        firstName={user.first_name}
                        lastName={user.last_name}
                        avatarColor={profile?.avatar_color ?? null}
                        avatar={profile?.avatar}
                        size={56}
                        tooltip={false}
                    />
                }
                title={name}
                subtitle={
                    <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
                        <span>@{user.username}</span>
                        {user.email && <span>- {user.email}</span>}
                    </Stack>
                }
                actions={
                    <Button variant="outlined" color="inherit" component={RouterLink} to="/whats_new">
                        What's new
                    </Button>
                }
                tabs={
                    <Tabs value={tab} onChange={(_, v: TabValue) => setParam('tab', v === 'profile' ? null : v)} aria-label="Profile sections">
                        {TABS.map((t) => (
                            <Tab key={t.value} value={t.value} label={t.label} />
                        ))}
                    </Tabs>
                }
            />

            {tab === 'profile' && <ProfileTab user={user} onPassword={() => setParam('dialog', 'password')} />}
            {tab === 'appearance' && <AppearanceTab />}
            {tab === 'access' && <AccessTab user={user} />}
            {tab === 'activity' && <MyActivityTab />}

            <ChangePasswordDialog open={passwordOpen} onClose={() => setParam('dialog', null)} />
        </Page>
    );
}
