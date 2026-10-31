import { Fragment, useState } from 'react';
import { Alert as MuiAlert, Box, Button, Chip, Divider, IconButton, Link, List, ListItem, ListItemText, Skeleton, Stack, TablePagination, Typography } from '@mui/material';
import Close from '@mui/icons-material/Close';
import DeleteOutlined from '@mui/icons-material/DeleteOutlined';
import EditOutlined from '@mui/icons-material/EditOutlined';
import OpenInNew from '@mui/icons-material/OpenInNew';
import PauseCircleOutline from '@mui/icons-material/PauseCircleOutlined';
import PlayCircleOutline from '@mui/icons-material/PlayCircleOutlined';
import { getErrorMessage } from '../../../api/client';
import { fonts } from '../../../styles/theme';
import { SideDrawer } from '../../../ui/SideDrawer';
import { ObjectHistory } from '../../timeline/components/ObjectHistory';
import { dateAgo, formatDateTime } from '../../timeline/format';
import { hostOf, levelMeta } from '../catalog';
import { KEYWORD_TYPE, useArchiveKeywordHit, useKeyword, useKeywordHits } from '../hooks';
import type { MonitoredKeyword } from '../types';
import { LevelChip } from './tables';
import { When } from '../../../ui/When';

const Word = ({ word }: { word: string }) => <Chip size="small" variant="outlined" label={word} sx={{ fontFamily: fonts.mono, fontSize: 12, maxWidth: 200 }} />;
const Joiner = ({ children }: { children: string }) => (
    <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>
        {children}
    </Typography>
);

/** What an article has to contain: "A AND B", then "AND ONE OF C OR D", then what cancels it. */
function RuleWords({ keyword }: { keyword: MonitoredKeyword }) {
    return (
        <Stack spacing={1.5}>
            <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 0.5, alignItems: 'center' }}>
                {keyword.all_of.map((word, i) => (
                    <Fragment key={word}>
                        {i > 0 && <Joiner>AND</Joiner>}
                        <Word word={word} />
                    </Fragment>
                ))}
                {keyword.any_of.length > 0 && keyword.all_of.length > 0 && <Joiner>AND ONE OF</Joiner>}
                {keyword.any_of.map((word, i) => (
                    <Fragment key={word}>
                        {i > 0 && <Joiner>OR</Joiner>}
                        <Word word={word} />
                    </Fragment>
                ))}
            </Stack>
            {keyword.exceptions.length > 0 && (
                <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 0.5, alignItems: 'center' }}>
                    <Joiner>NEVER WHEN IT CONTAINS</Joiner>
                    {keyword.exceptions.map((word) => (
                        <Word key={word} word={word} />
                    ))}
                </Stack>
            )}
            <Typography variant="body2" color="text.secondary">
                {keyword.whole_words ? 'Whole words' : 'Parts of words too'}, case and accents ignored.
            </Typography>
        </Stack>
    );
}

/** The articles a rule matched, to review: each one is read, then archived. */
function RuleHits({ keyword, canChange }: { keyword: MonitoredKeyword; canChange: boolean }) {
    const [page, setPage] = useState(1);
    const { data } = useKeywordHits(keyword.id, { page, pageSize: 10, ordering: '-hit_at' });
    const archive = useArchiveKeywordHit();
    if (!data) return <Skeleton height={80} />;
    if (!data.results.length) {
        return (
            <Typography variant="body2" color="text.secondary">
                Nothing matched yet: the rule reads the articles at each collection (every 30 minutes).
            </Typography>
        );
    }
    return (
        <>
            <List dense disablePadding data-testid="rule-hits">
                {data.results.map((hit) => (
                    <ListItem
                        key={hit.id}
                        disableGutters
                        secondaryAction={
                            canChange && (
                                <Button size="small" disabled={archive.isPending} onClick={() => archive.mutate({ hit, archived: !hit.is_archived })}>
                                    {hit.is_archived ? 'Review again' : 'Archive'}
                                </Button>
                            )
                        }
                        sx={{ opacity: hit.is_archived ? 0.6 : 1, pr: canChange ? 14 : 0 }}
                    >
                        <ListItemText
                            primary={
                                <a href={hit.url} target="_blank" rel="noopener noreferrer">
                                    {hit.title || hit.url} <OpenInNew sx={{ fontSize: 14, verticalAlign: 'middle' }} />
                                </a>
                            }
                            secondary={`${hit.matched.join(', ')} - ${dateAgo(hit.hit_at)}${hit.is_archived ? ' - archived' : ''}`}
                        />
                    </ListItem>
                ))}
            </List>
            {data.count > 10 && <TablePagination component="div" count={data.count} page={page - 1} onPageChange={(_, p) => setPage(p + 1)} rowsPerPage={10} rowsPerPageOptions={[10]} />}
        </>
    );
}

interface KeywordDrawerProps {
    open: boolean;
    id: number | null;
    initial?: MonitoredKeyword;
    onClose: () => void;
    actions?: { edit: (k: MonitoredKeyword) => void; remove: (k: MonitoredKeyword) => void; toggle: (k: MonitoredKeyword) => void };
    pending?: boolean;
}

/** One monitored keyword: how hot it is, the articles where it was found, and its history. */
export function KeywordDrawer({ open, id, initial, onClose, actions, pending = false }: KeywordDrawerProps) {
    const { data: keyword, error } = useKeyword(id, initial);
    return (
        <SideDrawer open={open} onClose={onClose} labelledBy="keyword-drawer-title">
            <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', px: 2.5, py: 2 }}>
                <Box sx={{ minWidth: 0, flexGrow: 1 }}>
                    <Typography variant="overline" color="text.secondary" sx={{ lineHeight: 1.4, display: 'block' }}>
                        Monitored keyword
                    </Typography>
                    <Typography id="keyword-drawer-title" variant="h3" component="h2" noWrap>
                        {keyword?.name ?? <Skeleton width={160} />}
                    </Typography>
                </Box>
                <IconButton aria-label="Close details" onClick={onClose} edge="end">
                    <Close />
                </IconButton>
            </Stack>
            {keyword && (
                <Stack direction="row" spacing={1} sx={{ px: 2.5, pb: 2, alignItems: 'center', flexWrap: 'wrap', rowGap: 1 }}>
                    <LevelChip level={keyword.level} />
                    <Chip size="small" label={`${keyword.occurrences} mentions`} />
                    {keyword.is_rule && <Chip size="small" variant="outlined" label="Rule" />}
                    {!keyword.is_active && <Chip size="small" icon={<PauseCircleOutline />} label="Paused" />}
                    <Box sx={{ flexGrow: 1 }} />
                    {actions && (
                        <>
                            <Button size="small" variant="outlined" startIcon={<EditOutlined />} onClick={() => actions.edit(keyword)}>
                                Edit
                            </Button>
                            <Button size="small" variant="outlined" startIcon={keyword.is_active ? <PauseCircleOutline /> : <PlayCircleOutline />} disabled={pending} onClick={() => actions.toggle(keyword)}>
                                {keyword.is_active ? 'Pause' : 'Resume'}
                            </Button>
                            <Button size="small" variant="outlined" color="error" startIcon={<DeleteOutlined />} onClick={() => actions.remove(keyword)}>
                                Delete
                            </Button>
                        </>
                    )}
                </Stack>
            )}
            <Divider />
            <Box sx={{ flexGrow: 1, overflowY: 'auto' }}>
                {error && !keyword ? (
                    <MuiAlert severity="error" sx={{ m: 2.5 }}>
                        {getErrorMessage(error, 'Failed to load the keyword.')}
                    </MuiAlert>
                ) : !keyword ? (
                    <Box sx={{ p: 2.5 }}>
                        <Skeleton height={80} />
                    </Box>
                ) : (
                    <>
                        <Box sx={{ px: 2.5, py: 2 }}>
                            <Typography variant="body2" color="text.secondary">
                                Watcher alerts the subscribers every time it reads this keyword in an RSS article. Level: {levelMeta(keyword.level).description.toLowerCase()}.{' '}
                                {keyword.last_seen ? <>Last seen <When iso={keyword.last_seen} inline />.</> : 'Not seen yet.'} Added {formatDateTime(keyword.created_at)}.
                            </Typography>
                        </Box>
                        {keyword.is_rule && (
                            <Box component="section" sx={{ px: 2.5, pb: 2 }}>
                                <Typography variant="overline" color="text.secondary" component="h3" sx={{ display: 'block', mb: 1 }}>
                                    An article must contain
                                </Typography>
                                <RuleWords keyword={keyword} />
                            </Box>
                        )}
                        <Box component="section" sx={{ px: 2.5, pb: 2 }}>
                            <Typography variant="overline" color="text.secondary" component="h3" sx={{ display: 'block', mb: 1 }}>
                                {keyword.is_rule ? `Matches (${keyword.open_hits_count} to review - ${keyword.hits_count} in all)` : `Articles (${keyword.posts_count})`}
                            </Typography>
                            {keyword.is_rule ? (
                                <RuleHits keyword={keyword} canChange={!!actions} />
                            ) : !keyword.posts ? (
                                <Skeleton height={80} />
                            ) : keyword.posts.length === 0 ? (
                                <Typography variant="body2" color="text.secondary">
                                    No article mentions it yet.
                                </Typography>
                            ) : (
                                <Stack component="ul" spacing={0.5} sx={{ listStyle: 'none', m: 0, p: 0 }} data-testid="keyword-articles">
                                    {keyword.posts.map((p) => (
                                        <Box component="li" key={p.url}>
                                            <Link href={p.url} target="_blank" rel="noopener noreferrer" underline="hover" sx={{ display: 'flex', gap: 1, alignItems: 'baseline', minWidth: 0 }}>
                                                <Typography component="span" variant="body2" sx={{ fontWeight: 600, flexShrink: 0 }}>
                                                    {hostOf(p.url)}
                                                </Typography>
                                                <Typography component="span" variant="caption" color="text.secondary" noWrap sx={{ minWidth: 0 }}>
                                                    {p.url.replace(/^https?:\/\/[^/]+/, '')}
                                                </Typography>
                                                <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 'auto', flexShrink: 0 }}>
                                                    <When iso={p.created_at} inline />
                                                </Typography>
                                            </Link>
                                        </Box>
                                    ))}
                                </Stack>
                            )}
                        </Box>
                        <Divider />
                        <Box component="section" sx={{ px: 2.5, py: 2 }}>
                            <Typography variant="overline" color="text.secondary" component="h3" sx={{ display: 'block', mb: 1 }}>
                                History
                            </Typography>
                            <ObjectHistory targets={[{ contentType: KEYWORD_TYPE, objectId: keyword.id }]} enabled={open} />
                        </Box>
                    </>
                )}
            </Box>
        </SideDrawer>
    );
}
