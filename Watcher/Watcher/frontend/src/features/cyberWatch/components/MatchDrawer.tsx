import { Alert as MuiAlert, Box, Button, Chip, Divider, Link, Skeleton, Stack, Typography } from '@mui/material';
import ArchiveOutlined from '@mui/icons-material/ArchiveOutlined';
import OpenInNew from '@mui/icons-material/OpenInNew';
import UnarchiveOutlined from '@mui/icons-material/UnarchiveOutlined';
import { getErrorMessage } from '../../../api/client';
import { fonts } from '../../../styles/theme';
import { SideDrawer } from '../../../ui/SideDrawer';
import { ObjectHistory } from '../../timeline/components/ObjectHistory';
import { dateAgo } from '../../timeline/format';
import { countryLabel, hitTypeMeta, isKnownSector, matchLabel, scopeMeta, referenceUrls } from '../catalog';
import { MATCH_TYPE, useCve, useMatch } from '../hooks';
import type { CveTarget, Match } from '../types';
import { DrawerHeader, Facts, Marked, Section } from './parts';
import { GroupChip, KeywordChip, nvd, SeverityChip } from './tables';

function CveDetails({ target, keyword }: { target: CveTarget; keyword: string }) {
    const { data: cve } = useCve(target.id);
    return (
        <>
            <Facts
                rows={[
                    ['Severity', <SeverityChip key="s" severity={target.severity} score={target.cvss_score} />],
                    ['Published', target.published ? dateAgo(target.published) : 'Not published yet'],
                    ['State', target.is_archived ? 'Archived in the CVE feed' : ''],
                ]}
            />
            <Typography variant="body2" sx={{ mt: 1.5, lineHeight: 1.7 }}>
                {cve ? <Marked text={cve.description || 'No description yet.'} keywords={[keyword]} /> : <Skeleton height={60} />}
            </Typography>
            {cve && referenceUrls(cve.references).length > 0 && (
                <Stack spacing={0.5} sx={{ mt: 1.5 }}>
                    {referenceUrls(cve.references).slice(0, 6).map((ref) => (
                        <Link key={ref} href={ref} target="_blank" rel="noopener noreferrer" variant="body2" sx={{ overflowWrap: 'anywhere' }}>
                            {ref}
                        </Link>
                    ))}
                </Stack>
            )}
        </>
    );
}

interface MatchDrawerProps {
    open: boolean;
    id: number | null;
    initial?: Match;
    onClose: () => void;
    previous?: Match;
    next?: Match;
    onNavigate: (match: Match) => void;
    /** Omitted when the user cannot archive matches. */
    onArchive?: (match: Match, archived: boolean) => void;
    pending: boolean;
    onOpenTarget: (match: Match) => void;
    onOpenRule?: (ruleId: number) => void;
    onGroup: (groupId: number) => void;
}

/** One match of a watch rule: why it matched, the CVE or victim behind it, and who archived it. */
export function MatchDrawer({ open, id, initial, onClose, previous, next, onNavigate, onArchive, pending, onOpenTarget, onOpenRule, onGroup }: MatchDrawerProps) {
    const { data: match, error } = useMatch(id, initial);
    const target = match?.target ?? null;
    const external = target?.kind === 'cve' ? nvd(target.cve_id) : target?.kind === 'victim' ? target.url : '';

    return (
        <SideDrawer open={open} onClose={onClose} labelledBy="match-drawer-title" width={600}>
            <DrawerHeader
                overline={match ? `${hitTypeMeta(match.hit_type).label} match` : 'Match'}
                title={match ? (target?.kind === 'victim' ? target.victim_name : matchLabel(match.object_id)) : <Skeleton width={220} />}
                titleId="match-drawer-title"
                onClose={onClose}
                nav={{ previous: previous && (() => onNavigate(previous)), next: next && (() => onNavigate(next)), noun: 'match' }}
            />
            {match && (
                <Stack direction="row" spacing={1} sx={{ px: 2.5, pb: 2, flexWrap: 'wrap', alignItems: 'center', rowGap: 1 }}>
                    <Chip size="small" color={match.is_archived ? 'default' : 'warning'} label={match.is_archived ? 'Archived' : 'To review'} />
                    <Box sx={{ flexGrow: 1 }} />
                    {target && (
                        <Button size="small" variant="outlined" onClick={() => onOpenTarget(match)}>
                            {target.kind === 'cve' ? 'Open the CVE' : 'Open the victim'}
                        </Button>
                    )}
                    {external && (
                        <Button size="small" variant="outlined" startIcon={<OpenInNew />} href={external} target="_blank" rel="noopener noreferrer">
                            {target?.kind === 'cve' ? 'NVD' : 'Leak post'}
                        </Button>
                    )}
                    {onArchive &&
                        (match.is_archived ? (
                            <Button size="small" variant="outlined" startIcon={<UnarchiveOutlined />} disabled={pending} onClick={() => onArchive(match, false)}>
                                Back to review
                            </Button>
                        ) : (
                            <Button size="small" variant="contained" startIcon={<ArchiveOutlined />} disabled={pending} onClick={() => onArchive(match, true)}>
                                Archive
                            </Button>
                        ))}
                </Stack>
            )}
            <Divider />
            <Box sx={{ flexGrow: 1, overflowY: 'auto' }}>
                {error && !match ? (
                    <MuiAlert severity="error" sx={{ m: 2.5 }}>
                        {getErrorMessage(error, 'Failed to load the match.')}
                    </MuiAlert>
                ) : !match ? (
                    <Box sx={{ p: 2.5 }}>
                        <Skeleton height={80} />
                        <Skeleton width="60%" />
                    </Box>
                ) : (
                    <>
                        <Section title="Why it matched">
                            <Facts
                                rows={[
                                    [
                                        'Rule',
                                        onOpenRule ? (
                                            <Link component="button" variant="body2" onClick={() => onOpenRule(match.rule)} sx={{ textAlign: 'left' }}>
                                                {match.rule_name}
                                            </Link>
                                        ) : (
                                            match.rule_name
                                        ),
                                    ],
                                    ['Keyword', <KeywordChip key="k" keyword={match.matched_keyword} />],
                                    ['Rule watches', scopeMeta(match.rule_scope).label],
                                    ['Matched', dateAgo(match.hit_at)],
                                ]}
                            />
                        </Section>
                        <Divider />
                        <Section title={target?.kind === 'victim' ? 'Victim' : 'Vulnerability'}>
                            {!target ? (
                                <>
                                    <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                                        The {match.hit_type === 'cve' ? 'CVE' : 'victim'} is no longer in the feed. What was recorded when it matched:
                                    </Typography>
                                    <Typography variant="body2" sx={{ fontFamily: match.hit_type === 'cve' ? fonts.mono : undefined }}>
                                        <Marked text={match.hit_display} keywords={[match.matched_keyword]} />
                                    </Typography>
                                </>
                            ) : target.kind === 'cve' ? (
                                <CveDetails target={target} keyword={match.matched_keyword} />
                            ) : (
                                <Facts
                                    rows={[
                                        ['Group', <GroupChip key="g" name={target.group_name} onClick={() => onGroup(target.group_id)} />],
                                        ['Country', countryLabel(target.country) || 'Unknown'],
                                        ['Sector', isKnownSector(target.sector) ? target.sector : 'Unknown'],
                                        ['Posted', target.attacked_at ? dateAgo(target.attacked_at) : ''],
                                    ]}
                                />
                            )}
                        </Section>
                        <Divider />
                        <Section title="History">
                            <ObjectHistory targets={[{ contentType: MATCH_TYPE, objectId: match.id }]} enabled={open} />
                        </Section>
                    </>
                )}
            </Box>
        </SideDrawer>
    );
}
