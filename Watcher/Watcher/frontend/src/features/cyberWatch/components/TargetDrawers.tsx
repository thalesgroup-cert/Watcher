import { Alert as MuiAlert, Box, Button, Chip, Divider, Link, List, ListItemButton, ListItemText, Skeleton, Stack, Typography } from '@mui/material';
import ArchiveOutlined from '@mui/icons-material/ArchiveOutlined';
import OpenInNew from '@mui/icons-material/OpenInNew';
import UnarchiveOutlined from '@mui/icons-material/UnarchiveOutlined';
import { getErrorMessage } from '../../../api/client';
import { since } from '../../../lib/dates';
import { fonts } from '../../../styles/theme';
import { SideDrawer } from '../../../ui/SideDrawer';
import { dateAgo } from '../../timeline/format';
import { countryLabel, isKnownSector, referenceUrls } from '../catalog';
import { useCve, useGroup, useMatchesOf, useVictim } from '../hooks';
import type { Cve, Match, Victim } from '../types';
import { DrawerHeader, Facts, Section } from './parts';
import { GroupChip, KeywordChip, nvd, SeverityChip } from './tables';

/** Rules that matched a CVE or a victim; a click opens the match. */
function RulesMatched({ objectId, type, onOpenMatch }: { objectId: string | null; type: Match['hit_type']; onOpenMatch: (m: Match) => void }) {
    const { data: matches } = useMatchesOf(objectId, type);
    if (!matches) return <Skeleton height={40} />;
    if (!matches.length) {
        return (
            <Typography variant="body2" color="text.secondary">
                No watch rule matched it.
            </Typography>
        );
    }
    return (
        <List dense disablePadding data-testid="rules-matched">
            {matches.map((m) => (
                <ListItemButton key={m.id} onClick={() => onOpenMatch(m)} sx={{ borderRadius: 1, px: 1 }}>
                    <ListItemText
                        primary={
                            <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                                <span>{m.rule_name}</span>
                                <KeywordChip keyword={m.matched_keyword} />
                            </Stack>
                        }
                        secondary={`${m.is_archived ? 'Archived' : 'To review'} - matched ${since(m.hit_at)}`}
                    />
                </ListItemButton>
            ))}
        </List>
    );
}

interface ArchiveButtonProps {
    archived: boolean;
    pending: boolean;
    onArchive?: (archived: boolean) => void;
}

function ArchiveButton({ archived, pending, onArchive }: ArchiveButtonProps) {
    if (!onArchive) return null;
    return archived ? (
        <Button size="small" variant="outlined" startIcon={<UnarchiveOutlined />} disabled={pending} onClick={() => onArchive(false)}>
            Restore
        </Button>
    ) : (
        <Button size="small" variant="outlined" startIcon={<ArchiveOutlined />} disabled={pending} onClick={() => onArchive(true)}>
            Archive
        </Button>
    );
}

interface CveDrawerProps {
    open: boolean;
    id: number | null;
    initial?: Cve;
    onClose: () => void;
    previous?: Cve;
    next?: Cve;
    onNavigate: (cve: Cve) => void;
    onArchive?: (cve: Cve, archived: boolean) => void;
    pending: boolean;
    onOpenMatch: (m: Match) => void;
}

export function CveDrawer({ open, id, initial, onClose, previous, next, onNavigate, onArchive, pending, onOpenMatch }: CveDrawerProps) {
    const { data: cve, error } = useCve(id, initial);
    return (
        <SideDrawer open={open} onClose={onClose} labelledBy="cve-drawer-title" width={600}>
            <DrawerHeader
                overline="Vulnerability"
                title={cve ? <Box component="span" sx={{ fontFamily: fonts.mono }}>{cve.cve_id}</Box> : <Skeleton width={180} />}
                titleId="cve-drawer-title"
                onClose={onClose}
                nav={{ previous: previous && (() => onNavigate(previous)), next: next && (() => onNavigate(next)), noun: 'CVE' }}
            />
            {cve && (
                <Stack direction="row" spacing={1} sx={{ px: 2.5, pb: 2, flexWrap: 'wrap', alignItems: 'center', rowGap: 1 }}>
                    <SeverityChip severity={cve.severity} score={cve.cvss_score} />
                    {cve.is_archived && <Chip size="small" label="Archived" />}
                    <Box sx={{ flexGrow: 1 }} />
                    <Button size="small" variant="outlined" startIcon={<OpenInNew />} href={nvd(cve.cve_id)} target="_blank" rel="noopener noreferrer">
                        NVD
                    </Button>
                    <ArchiveButton archived={cve.is_archived} pending={pending} onArchive={onArchive && ((a) => onArchive(cve, a))} />
                </Stack>
            )}
            <Divider />
            <Box sx={{ flexGrow: 1, overflowY: 'auto' }}>
                {error && !cve ? (
                    <MuiAlert severity="error" sx={{ m: 2.5 }}>
                        {getErrorMessage(error, 'Failed to load the CVE.')}
                    </MuiAlert>
                ) : !cve ? (
                    <Box sx={{ p: 2.5 }}>
                        <Skeleton height={80} />
                    </Box>
                ) : (
                    <>
                        <Section title="Description">
                            <Typography variant="body2" sx={{ lineHeight: 1.7 }}>
                                {cve.description || 'cve.circl.lu has no description for it yet.'}
                            </Typography>
                            <Box sx={{ mt: 1.5 }}>
                                <Facts
                                    rows={[
                                        ['Published', cve.published ? dateAgo(cve.published) : 'Not published yet'],
                                        ['Collected', dateAgo(cve.fetched_at)],
                                    ]}
                                />
                            </Box>
                        </Section>
                        <Divider />
                        <Section title="Watch rules">
                            <RulesMatched objectId={cve.cve_id} type="cve" onOpenMatch={onOpenMatch} />
                        </Section>
                        {referenceUrls(cve.references).length > 0 && (
                            <>
                                <Divider />
                                <Section title={`References (${referenceUrls(cve.references).length})`}>
                                    <Stack spacing={0.5}>
                                        {referenceUrls(cve.references).map((ref) => (
                                            <Link key={ref} href={ref} target="_blank" rel="noopener noreferrer" variant="body2" sx={{ overflowWrap: 'anywhere' }}>
                                                {ref}
                                            </Link>
                                        ))}
                                    </Stack>
                                </Section>
                            </>
                        )}
                    </>
                )}
            </Box>
        </SideDrawer>
    );
}

function GroupSection({ groupId, onGroup }: { groupId: number; onGroup: (id: number) => void }) {
    const { data: group } = useGroup(groupId);
    if (!group) return <Skeleton height={60} />;
    return (
        <>
            <Facts
                rows={[
                    ['Victims posted', group.victim_count.toLocaleString('en-GB')],
                    ['Latest post', group.last_attack_at ? dateAgo(group.last_attack_at) : ''],
                    ['First seen', group.first_seen ?? ''],
                    ['Source', group.source],
                ]}
            />
            {group.description && (
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5, lineHeight: 1.7, display: '-webkit-box', WebkitLineClamp: 6, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {group.description}
                </Typography>
            )}
            <Button size="small" sx={{ mt: 1, px: 0 }} onClick={() => onGroup(group.id)}>
                Show its victims
            </Button>
        </>
    );
}

interface VictimDrawerProps {
    open: boolean;
    id: number | null;
    initial?: Victim;
    onClose: () => void;
    previous?: Victim;
    next?: Victim;
    onNavigate: (victim: Victim) => void;
    onArchive?: (victim: Victim, archived: boolean) => void;
    pending: boolean;
    onOpenMatch: (m: Match) => void;
    onGroup: (groupId: number) => void;
}

export function VictimDrawer({ open, id, initial, onClose, previous, next, onNavigate, onArchive, pending, onOpenMatch, onGroup }: VictimDrawerProps) {
    const { data: victim, error } = useVictim(id, initial);
    return (
        <SideDrawer open={open} onClose={onClose} labelledBy="victim-drawer-title" width={600}>
            <DrawerHeader
                overline="Ransomware victim"
                title={victim ? victim.victim_name : <Skeleton width={200} />}
                titleId="victim-drawer-title"
                onClose={onClose}
                nav={{ previous: previous && (() => onNavigate(previous)), next: next && (() => onNavigate(next)), noun: 'victim' }}
            />
            {victim && (
                <Stack direction="row" spacing={1} sx={{ px: 2.5, pb: 2, flexWrap: 'wrap', alignItems: 'center', rowGap: 1 }}>
                    <GroupChip name={victim.group_name} onClick={() => onGroup(victim.group)} />
                    {victim.is_archived && <Chip size="small" label="Archived" />}
                    <Box sx={{ flexGrow: 1 }} />
                    {victim.url && (
                        <Button size="small" variant="outlined" startIcon={<OpenInNew />} href={victim.url} target="_blank" rel="noopener noreferrer">
                            Leak post
                        </Button>
                    )}
                    <ArchiveButton archived={victim.is_archived} pending={pending} onArchive={onArchive && ((a) => onArchive(victim, a))} />
                </Stack>
            )}
            <Divider />
            <Box sx={{ flexGrow: 1, overflowY: 'auto' }}>
                {error && !victim ? (
                    <MuiAlert severity="error" sx={{ m: 2.5 }}>
                        {getErrorMessage(error, 'Failed to load the victim.')}
                    </MuiAlert>
                ) : !victim ? (
                    <Box sx={{ p: 2.5 }}>
                        <Skeleton height={80} />
                    </Box>
                ) : (
                    <>
                        <Section title="Victim">
                            <Facts
                                rows={[
                                    ['Country', countryLabel(victim.country) || 'Unknown'],
                                    ['Sector', isKnownSector(victim.sector) ? victim.sector : 'Unknown'],
                                    ['Posted', victim.attacked_at ? dateAgo(victim.attacked_at) : 'Unknown'],
                                    ['Collected', dateAgo(victim.fetched_at)],
                                ]}
                            />
                        </Section>
                        <Divider />
                        <Section title="Watch rules">
                            <RulesMatched objectId={`${victim.group_name}::${victim.victim_name}`} type="ransomware_victim" onOpenMatch={onOpenMatch} />
                        </Section>
                        <Divider />
                        <Section title={`Group - ${victim.group_name}`}>
                            <GroupSection groupId={victim.group} onGroup={onGroup} />
                        </Section>
                    </>
                )}
            </Box>
        </SideDrawer>
    );
}
