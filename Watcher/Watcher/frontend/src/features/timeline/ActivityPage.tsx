import { useLocation, useNavigate } from 'react-router';
import { Box } from '@mui/material';
import GroupsOutlined from '@mui/icons-material/GroupsOutlined';
import HistoryOutlined from '@mui/icons-material/HistoryOutlined';
import SmartToyOutlined from '@mui/icons-material/SmartToyOutlined';
import TodayOutlined from '@mui/icons-material/TodayOutlined';
import { KpiCard } from '../../ui/KpiCard';
import { Page, PageHeader } from '../../ui/Page';
import { TourButton } from '../onboarding/TourButton';
import { ACTIONS } from './catalog';
import { ActivityFeed, DEFAULT_FILTERS } from './components/ActivityFeed';
import { useActivitySummary } from './hooks';
import type { Actor, FeedFilters, TimelineAction } from './types';

const ACTOR_VALUES: Actor[] = ['people', 'automated', 'me', 'all'];
const ACTION_VALUES = ACTIONS.map((a) => a.value);

function parseFilters(search: string): FeedFilters {
    const params = new URLSearchParams(search);
    const actor = params.get('actor') as Actor | null;
    return {
        actor: actor && ACTOR_VALUES.includes(actor) ? actor : DEFAULT_FILTERS.actor,
        module: params.get('module') ?? '',
        actions: (params.get('action') ?? '').split(',').filter((a): a is TimelineAction => ACTION_VALUES.includes(a as TimelineAction)),
        search: params.get('q') ?? '',
    };
}

function serializeFilters(f: FeedFilters): string {
    const params = new URLSearchParams();
    if (f.actor !== DEFAULT_FILTERS.actor) params.set('actor', f.actor);
    if (f.module) params.set('module', f.module);
    if (f.actions.length) params.set('action', f.actions.join(','));
    if (f.search) params.set('q', f.search);
    const s = params.toString();
    return s ? `?${s}` : '';
}

export default function ActivityPage() {
    const location = useLocation();
    const navigate = useNavigate();
    const filters = parseFilters(location.search);
    const { data: summary } = useActivitySummary();

    return (
        <Page maxWidth={1100}>
            <PageHeader help={<TourButton tour="activity" />} icon={<HistoryOutlined />} title="Activity" subtitle="Who changed what, across every module." />

            <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: 'repeat(2, 1fr)', md: 'repeat(4, 1fr)' }, mb: 3 }}>
                <KpiCard title="Changes today" value={summary?.people_today} icon={<TodayOutlined />} color="primary" />
                <KpiCard title="Last 7 days" value={summary?.people_week} icon={<HistoryOutlined />} color="success" />
                <KpiCard title="Contributors - 7 days" value={summary?.contributors_week} icon={<GroupsOutlined />} color="warning" />
                <KpiCard title="Automated today" value={summary?.automated_today} icon={<SmartToyOutlined />} color="inherit" />
            </Box>

            <ActivityFeed filters={filters} onFiltersChange={(f) => void navigate({ search: serializeFilters(f) }, { replace: true })} />
        </Page>
    );
}
