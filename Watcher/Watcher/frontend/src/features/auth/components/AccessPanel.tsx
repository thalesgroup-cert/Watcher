import { useMemo, useState } from 'react';
import {
    Accordion,
    AccordionDetails,
    AccordionSummary,
    Alert,
    Box,
    Button,
    Chip,
    Stack,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableRow,
    Typography,
} from '@mui/material';
import CheckRounded from '@mui/icons-material/CheckRounded';
import ExpandMore from '@mui/icons-material/ExpandMore';
import RemoveRounded from '@mui/icons-material/RemoveRounded';
import { fonts } from '../../../styles/theme';
import type { User } from '../types';

const ACTIONS = ['view', 'add', 'change', 'delete'] as const;
type Action = (typeof ACTIONS)[number];

/** The apps of the interface first, in the order of the menu; the rest of the Django apps after, by name. */
const APPS: Record<string, string> = {
    threats_watcher: 'Threats Watcher',
    cyber_watch: 'Cyber Watch',
    data_leak: 'Data Leak',
    dns_finder: 'DNS Threats',
    site_monitoring: 'Website Monitoring',
    common: 'Legitimate Domains',
    timeline: 'Activity',
    connectors: 'Connectors',
    accounts: 'Accounts',
    auth: 'Users and groups',
    admin: 'Administration log',
    contenttypes: 'Content types',
    sessions: 'Sessions',
    authtoken: 'API tokens',
    knox: 'API tokens',
};
const ORDER = Object.keys(APPS);

interface ModelRights {
    model: string;
    rights: Record<Action, boolean>;
}

interface AppRights {
    app: string;
    label: string;
    models: ModelRights[];
    /** Permissions that are not view / add / change / delete (an export, a validation...). */
    extras: string[];
    total: number;
}

function parse(permissions: string[]): AppRights[] {
    type Entry = { models: Map<string, Record<Action, boolean>>; extras: string[]; total: number };
    const apps = new Map<string, Entry>();
    for (const permission of permissions) {
        const [app, ...rest] = permission.split('.');
        const codename = rest.join('.');
        const entry: Entry = apps.get(app) ?? { models: new Map(), extras: [], total: 0 };
        entry.total += 1;
        const action = ACTIONS.find((a) => codename.startsWith(`${a}_`));
        if (action) {
            const model = codename.slice(action.length + 1);
            const rights = entry.models.get(model) ?? { view: false, add: false, change: false, delete: false };
            rights[action] = true;
            entry.models.set(model, rights);
        } else {
            entry.extras.push(codename);
        }
        apps.set(app, entry);
    }
    const rank = (app: string) => (ORDER.includes(app) ? ORDER.indexOf(app) : ORDER.length);
    return [...apps.entries()]
        .map(([app, e]) => ({
            app,
            label: APPS[app] ?? app.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase()),
            models: [...e.models.entries()].map(([model, rights]) => ({ model, rights })).sort((a, b) => a.model.localeCompare(b.model)),
            extras: e.extras.sort(),
            total: e.total,
        }))
        .sort((a, b) => rank(a.app) - rank(b.app) || a.label.localeCompare(b.label));
}

const Mark = ({ on }: { on: boolean }) =>
    on ? <CheckRounded fontSize="small" color="success" aria-label="Allowed" /> : <RemoveRounded fontSize="small" sx={{ color: 'text.disabled' }} aria-label="Not allowed" />;

function Coverage({ app }: { app: AppRights }) {
    return (
        <Stack direction="row" spacing={1.5} sx={{ color: 'text.secondary', flexWrap: 'wrap' }}>
            {ACTIONS.map((a) => {
                const count = app.models.filter((m) => m.rights[a]).length;
                return (
                    <Typography key={a} variant="caption" sx={{ color: count ? 'text.primary' : 'text.disabled' }}>
                        {a} {count}/{app.models.length}
                    </Typography>
                );
            })}
            {app.extras.length > 0 && <Typography variant="caption">+{app.extras.length} other</Typography>}
        </Stack>
    );
}

function Matrix({ app }: { app: AppRights }) {
    return (
        <>
            <Table size="small" aria-label={`${app.label} permissions`}>
                <TableHead>
                    <TableRow>
                        <TableCell>Data</TableCell>
                        {ACTIONS.map((a) => (
                            <TableCell key={a} align="center" sx={{ textTransform: 'capitalize', width: 84 }}>
                                {a}
                            </TableCell>
                        ))}
                    </TableRow>
                </TableHead>
                <TableBody>
                    {app.models.map((m) => (
                        <TableRow key={m.model}>
                            <TableCell sx={{ fontFamily: fonts.mono, fontSize: 12 }}>{m.model}</TableCell>
                            {ACTIONS.map((a) => (
                                <TableCell key={a} align="center">
                                    <Mark on={m.rights[a]} />
                                </TableCell>
                            ))}
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
            {app.extras.length > 0 && (
                <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 0.5, mt: 1.5 }}>
                    {app.extras.map((e) => (
                        <Chip key={e} size="small" variant="outlined" label={e} sx={{ fontFamily: fonts.mono, fontSize: 11, height: 20 }} />
                    ))}
                </Stack>
            )}
        </>
    );
}

/** Who the user is for Watcher (roles, groups) and what they can do in each part of it. */
export function AccessPanel({ user }: { user: User }) {
    const [showAll, setShowAll] = useState(false);
    const groups = user.groups ?? [];
    const apps = useMemo(() => parse(user.permissions ?? []), [user.permissions]);
    const total = user.permissions?.length ?? 0;
    const everything = !!user.is_superuser;

    return (
        <Stack spacing={2.5}>
            <Box component="section" aria-label="Roles and groups">
                <Typography variant="overline" color="text.secondary" component="h3" sx={{ display: 'block', mb: 1 }}>
                    Roles and groups
                </Typography>
                <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 0.75 }}>
                    {user.is_superuser && <Chip size="small" color="error" label="Superuser" />}
                    {user.is_staff && <Chip size="small" color="warning" label="Staff" />}
                    {groups.map((g) => (
                        <Chip key={g} size="small" color="info" label={g} />
                    ))}
                    {!user.is_superuser && !user.is_staff && groups.length === 0 && (
                        <Typography variant="body2" color="text.secondary">
                            No group assigned. Ask an administrator for access.
                        </Typography>
                    )}
                </Stack>
            </Box>

            {everything && (
                <Alert severity="warning" icon={false}>
                    <strong>Superuser.</strong> You can do everything in every module, and manage connectors, users and the administration.
                </Alert>
            )}

            {total > 0 && (!everything || showAll) && (
                <Box component="section" aria-label="What you can do">
                    <Typography variant="overline" color="text.secondary" component="h3" sx={{ display: 'block', mb: 1 }}>
                        What you can do - {total} permissions
                    </Typography>
                    <Box data-testid="permissions">
                        {apps.map((app) => (
                            <Accordion key={app.app} disableGutters variant="outlined" slotProps={{ transition: { unmountOnExit: true } }}>
                                <AccordionSummary expandIcon={<ExpandMore />}>
                                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={{ xs: 0.25, sm: 2 }} sx={{ alignItems: { sm: 'center' }, width: '100%' }}>
                                        <Typography variant="body2" sx={{ fontWeight: 600, minWidth: 160 }}>
                                            {app.label}
                                        </Typography>
                                        <Coverage app={app} />
                                    </Stack>
                                </AccordionSummary>
                                <AccordionDetails>
                                    <Matrix app={app} />
                                </AccordionDetails>
                            </Accordion>
                        ))}
                    </Box>
                </Box>
            )}

            {everything && !showAll && total > 0 && (
                <Box>
                    <Button size="small" color="inherit" onClick={() => setShowAll(true)} sx={{ color: 'text.secondary' }}>
                        Show the {total} permissions
                    </Button>
                </Box>
            )}
        </Stack>
    );
}
