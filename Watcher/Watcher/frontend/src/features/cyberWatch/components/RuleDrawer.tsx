import { Alert as MuiAlert, Box, Button, Chip, Divider, List, ListItemButton, ListItemText, Skeleton, Stack, Typography } from '@mui/material';
import DeleteOutlined from '@mui/icons-material/DeleteOutlined';
import EditOutlined from '@mui/icons-material/EditOutlined';
import ManageSearchOutlined from '@mui/icons-material/ManageSearchOutlined';
import PauseCircleOutline from '@mui/icons-material/PauseCircleOutlined';
import PlayCircleOutline from '@mui/icons-material/PlayCircleOutlined';
import { getErrorMessage } from '../../../api/client';
import { since } from '../../../lib/dates';
import { SideDrawer } from '../../../ui/SideDrawer';
import { ObjectHistory } from '../../timeline/components/ObjectHistory';
import { dateAgo } from '../../timeline/format';
import { matchLabel, scopeMeta } from '../catalog';
import { RULE_TYPE, useMatches, useRule, useScanRule } from '../hooks';
import type { Match, Rule } from '../types';
import { DrawerHeader, Facts, Section } from './parts';
import { KeywordChip } from './tables';

function LatestMatches({ rule, onOpenMatch, onShowAll }: { rule: Rule; onOpenMatch: (m: Match) => void; onShowAll: () => void }) {
    const { data } = useMatches({ status: 'all', search: '', type: '', rule: String(rule.id), period: '' }, { page: 1, pageSize: 5, ordering: '-hit_at' });
    if (!data) return <Skeleton height={60} />;
    if (!data.results.length) {
        return (
            <Typography variant="body2" color="text.secondary">
                Nothing matched yet.
            </Typography>
        );
    }
    return (
        <>
            <List dense disablePadding>
                {data.results.map((m) => (
                    <ListItemButton key={m.id} onClick={() => onOpenMatch(m)} sx={{ borderRadius: 1, px: 1 }}>
                        <ListItemText
                            primary={matchLabel(m.object_id)}
                            secondary={`“${m.matched_keyword}” - ${m.is_archived ? 'archived' : 'to review'} - ${since(m.hit_at)}`}
                            slotProps={{ primary: { noWrap: true } }}
                        />
                    </ListItemButton>
                ))}
            </List>
            {data.count > data.results.length && (
                <Button size="small" sx={{ mt: 0.5, px: 0 }} onClick={onShowAll}>
                    Show all {data.count} matches
                </Button>
            )}
        </>
    );
}

interface RuleDrawerProps {
    open: boolean;
    id: number | null;
    initial?: Rule;
    onClose: () => void;
    onOpenMatch: (m: Match) => void;
    onShowMatches: (rule: Rule) => void;
    /** Omitted when the user cannot change rules. */
    actions?: { edit: (r: Rule) => void; toggle: (r: Rule) => void; remove?: (r: Rule) => void };
    pending: boolean;
}

/** A watch rule: what it looks for, what it matched, and who changed it. */
export function RuleDrawer({ open, id, initial, onClose, onOpenMatch, onShowMatches, actions, pending }: RuleDrawerProps) {
    const { data: rule, error } = useRule(id, initial);
    const scan = useScanRule();
    return (
        <SideDrawer open={open} onClose={onClose} labelledBy="rule-drawer-title" width={560}>
            <DrawerHeader overline="Watch rule" title={rule ? rule.name : <Skeleton width={200} />} titleId="rule-drawer-title" onClose={onClose} />
            {rule && (
                <Stack direction="row" spacing={1} sx={{ px: 2.5, pb: 2, flexWrap: 'wrap', alignItems: 'center', rowGap: 1 }}>
                    <Chip
                        size="small"
                        color={rule.is_active ? 'success' : 'default'}
                        variant="outlined"
                        icon={rule.is_active ? <PlayCircleOutline /> : <PauseCircleOutline />}
                        label={rule.is_active ? 'Active' : 'Paused'}
                    />
                    <Box sx={{ flexGrow: 1 }} />
                    {actions && (
                        <>
                            <Button size="small" variant="outlined" startIcon={<EditOutlined />} onClick={() => actions.edit(rule)}>
                                Edit
                            </Button>
                            <Button
                                size="small"
                                variant="outlined"
                                startIcon={rule.is_active ? <PauseCircleOutline /> : <PlayCircleOutline />}
                                disabled={pending}
                                onClick={() => actions.toggle(rule)}
                            >
                                {rule.is_active ? 'Pause' : 'Resume'}
                            </Button>
                            {actions.remove && (
                                <Button size="small" variant="outlined" color="error" startIcon={<DeleteOutlined />} onClick={() => actions.remove?.(rule)}>
                                    Delete
                                </Button>
                            )}
                        </>
                    )}
                </Stack>
            )}
            <Divider />
            <Box sx={{ flexGrow: 1, overflowY: 'auto' }}>
                {error && !rule ? (
                    <MuiAlert severity="error" sx={{ m: 2.5 }}>
                        {getErrorMessage(error, 'Failed to load the rule.')}
                    </MuiAlert>
                ) : !rule ? (
                    <Box sx={{ p: 2.5 }}>
                        <Skeleton height={80} />
                    </Box>
                ) : (
                    <>
                        <Section title="Looks for">
                            <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 0.75, mb: 1.5 }} data-testid="rule-keywords">
                                {rule.keywords.map((k) => (
                                    <KeywordChip key={k} keyword={k} />
                                ))}
                            </Stack>
                            <Facts
                                rows={[
                                    ['Watches', scopeMeta(rule.scope).label],
                                    [
                                        'Except',
                                        rule.exceptions.length ? (
                                            <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 0.75 }}>
                                                {rule.exceptions.map((k) => (
                                                    <KeywordChip key={k} keyword={k} />
                                                ))}
                                            </Stack>
                                        ) : (
                                            ''
                                        ),
                                    ],
                                    ['Created', dateAgo(rule.created_at)],
                                ]}
                            />
                        </Section>
                        <Divider />
                        <Section
                            title={`Matches (${rule.open_hits_count} to review - ${rule.hits_count} in all)`}
                            action={
                                actions &&
                                rule.is_active && (
                                    <Button size="small" startIcon={<ManageSearchOutlined />} disabled={scan.isPending} onClick={() => scan.mutate(rule)}>
                                        Look in the data collected
                                    </Button>
                                )
                            }
                        >
                            <LatestMatches rule={rule} onOpenMatch={onOpenMatch} onShowAll={() => onShowMatches(rule)} />
                        </Section>
                        <Divider />
                        <Section title="History">
                            <ObjectHistory targets={[{ contentType: RULE_TYPE, objectId: rule.id }]} enabled={open} />
                        </Section>
                    </>
                )}
            </Box>
        </SideDrawer>
    );
}
