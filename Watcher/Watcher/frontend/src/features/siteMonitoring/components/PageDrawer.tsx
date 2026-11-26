import { useState } from 'react';
import {
    alpha,
    Alert as MuiAlert,
    Box,
    Button,
    ButtonBase,
    Chip,
    Divider,
    IconButton,
    List,
    ListItemButton,
    ListItemText,
    Skeleton,
    Stack,
    ToggleButton,
    ToggleButtonGroup,
    Typography,
} from '@mui/material';
import CameraAltOutlined from '@mui/icons-material/CameraAltOutlined';
import Close from '@mui/icons-material/Close';
import DeleteOutlined from '@mui/icons-material/DeleteOutlined';
import EditOutlined from '@mui/icons-material/EditOutlined';
import OpenInNew from '@mui/icons-material/OpenInNew';
import PauseCircleOutline from '@mui/icons-material/PauseCircleOutlined';
import PlayCircleOutline from '@mui/icons-material/PlayCircleOutlined';
import RefreshOutlined from '@mui/icons-material/RefreshOutlined';
import { getErrorMessage } from '../../../api/client';
import { fonts } from '../../../styles/theme';
import { ImageViewer } from '../../../ui/ImageViewer';
import { SideDrawer } from '../../../ui/SideDrawer';
import { dateAgo } from '../../timeline/format';
import { useCaptureScreenshot, useCheckPage, usePage, usePageDiff, usePageScreenshot, usePageVersions } from '../hooks';
import type { DiffRow, MonitoredPage, PageVersion } from '../types';

const ROW_STYLE = {
    add: { colour: 'success', prefix: '+' },
    remove: { colour: 'error', prefix: '-' },
    same: { colour: null, prefix: ' ' },
} as const;

/** The rows of a difference: green added lines, red removed ones, a gap where unchanged lines were left out. */
export function DiffView({ rows }: { rows: DiffRow[] }) {
    return (
        <Box
            component="pre"
            data-testid="page-diff"
            sx={{ m: 0, p: 0, fontFamily: fonts.mono, fontSize: 12, lineHeight: 1.6, overflowX: 'auto', border: 1, borderColor: 'divider', borderRadius: 1 }}
        >
            {rows.map((row, i) => {
                if (row.kind === 'skip') {
                    return (
                        <Box key={i} sx={{ px: 1, py: 0.25, color: 'text.disabled', bgcolor: 'action.hover', fontStyle: 'italic' }}>
                            … {row.text} unchanged line{row.text === '1' ? '' : 's'}
                        </Box>
                    );
                }
                const { colour, prefix } = ROW_STYLE[row.kind];
                return (
                    <Box
                        key={i}
                        sx={{
                            px: 1,
                            display: 'flex',
                            gap: 1,
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-word',
                            // A tint rather than the plain colour, to keep the text readable in both themes
                            bgcolor: (theme) => (colour ? alpha(theme.palette[colour].main, 0.18) : 'transparent'),
                        }}
                    >
                        <Box component="span" aria-label={row.kind === 'add' ? 'added' : row.kind === 'remove' ? 'removed' : undefined} sx={{ color: 'text.secondary', userSelect: 'none' }}>
                            {prefix}
                        </Box>
                        <span>{row.text}</span>
                    </Box>
                );
            })}
        </Box>
    );
}

const versionLabel = (v: PageVersion) => `${dateAgo(v.created_at)} - ${v.change_ratio === null ? 'first version' : `${v.change_ratio} % changed`}`;

/** One screenshot of the drawer: a thumbnail that opens the viewer of the app (nothing opens in another tab). */
function Shot({ label, version, src, isPending, error, onOpen }: { label: string; version?: PageVersion; src: string | null; isPending: boolean; error: unknown; onOpen: () => void }) {
    return (
        <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, display: 'block', mb: 0.5 }}>
                {label}
                {version && ` - ${dateAgo(version.created_at)}`}
            </Typography>
            {src ? (
                <ButtonBase onClick={onOpen} aria-label={`View the screenshot ${label.toLowerCase()}`} sx={{ display: 'block', width: '100%', cursor: 'zoom-in' }}>
                    <Box
                        component="img"
                        src={src}
                        alt={`Screenshot ${label.toLowerCase()}`}
                        draggable={false}
                        sx={{ width: '100%', maxHeight: 420, objectFit: 'cover', objectPosition: 'top', border: 1, borderColor: 'divider', borderRadius: 1, display: 'block' }}
                    />
                </ButtonBase>
            ) : isPending && version?.has_screenshot ? (
                <Skeleton variant="rounded" height={200} />
            ) : (
                <Typography variant="body2" color="text.secondary" sx={{ border: 1, borderColor: 'divider', borderRadius: 1, borderStyle: 'dashed', p: 2 }}>
                    {error ? 'The screenshot could not be loaded.' : version ? 'No screenshot was kept for this version.' : 'There is no earlier version.'}
                </Typography>
            )}
        </Box>
    );
}

/** The screenshots of two versions, side by side: before and after a change. Each one opens in the viewer. */
function Screenshots({ pageId, pageName, from, to }: { pageId: number; pageName: string; from?: PageVersion; to: PageVersion }) {
    const before = usePageScreenshot(pageId, from?.has_screenshot ? from.id : null);
    const after = usePageScreenshot(pageId, to.has_screenshot ? to.id : null);
    const [viewing, setViewing] = useState<number | null>(null);
    return (
        <>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} data-testid="page-screenshots">
                <Shot label="Before" version={from} src={before.url} isPending={before.isPending} error={before.error} onOpen={() => setViewing(0)} />
                <Shot label="After" version={to} src={after.url} isPending={after.isPending} error={after.error} onOpen={() => setViewing(1)} />
            </Stack>
            <ImageViewer
                open={viewing !== null}
                onClose={() => setViewing(null)}
                title={pageName}
                initial={viewing ?? 0}
                images={[
                    { label: 'Before', src: before.url },
                    { label: 'After', src: after.url },
                ]}
            />
        </>
    );
}

function History({ page }: { page: MonitoredPage }) {
    const versions = usePageVersions(page.id);
    const [view, setView] = useState<'text' | 'screenshots'>('text');
    // The newest version is compared with the one before by default; a click on an older one compares it with its predecessor.
    const [selected, setSelected] = useState<number | null>(null);
    const list = versions.data ?? [];
    const index = selected === null ? 0 : list.findIndex((v) => v.id === selected);
    const to = list[index];
    const from = list[index + 1];
    const diff = usePageDiff(page.id, from?.id, to?.id, !!to && !!from);

    if (versions.isPending) return <Skeleton height={80} />;
    if (versions.error) return <MuiAlert severity="error">{getErrorMessage(versions.error, 'Failed to load the history.')}</MuiAlert>;
    if (!list.length) {
        return (
            <Typography variant="body2" color="text.secondary">
                No version yet: the first one is kept at the next check.
            </Typography>
        );
    }
    return (
        <>
            <List dense disablePadding data-testid="page-versions" sx={{ maxHeight: 220, overflowY: 'auto', mb: 2 }}>
                {list.map((v, i) => (
                    <ListItemButton key={v.id} selected={i === index} onClick={() => setSelected(v.id)} sx={{ borderRadius: 1, px: 1 }}>
                        <ListItemText primary={versionLabel(v)} secondary={`${(v.size / 1000).toFixed(1)} k characters${v.notified ? ' - notified' : ''}`} />
                    </ListItemButton>
                ))}
            </List>
            <ToggleButtonGroup size="small" exclusive value={view} onChange={(_, v: 'text' | 'screenshots' | null) => v && setView(v)} aria-label="What to compare" sx={{ mb: 1.5 }}>
                <ToggleButton value="text" sx={{ px: 2 }}>
                    Text
                </ToggleButton>
                <ToggleButton value="screenshots" sx={{ px: 2 }}>
                    Screenshots
                </ToggleButton>
            </ToggleButtonGroup>
            {view === 'screenshots' ? (
                <Screenshots pageId={page.id} pageName={page.name || page.url} from={from} to={to} />
            ) : !from ? (
                <Typography variant="body2" color="text.secondary">
                    This is the first version: there is nothing before it to compare with.
                </Typography>
            ) : diff.isPending ? (
                <Skeleton height={120} />
            ) : diff.error ? (
                <MuiAlert severity="error">{getErrorMessage(diff.error, 'Failed to load the difference.')}</MuiAlert>
            ) : diff.data.rows.some((r) => r.kind === 'add' || r.kind === 'remove') ? (
                <DiffView rows={diff.data.rows} />
            ) : (
                <Typography variant="body2" color="text.secondary">
                    The text is the same.
                </Typography>
            )}
        </>
    );
}

interface PageDrawerProps {
    open: boolean;
    id: number | null;
    initial?: MonitoredPage;
    onClose: () => void;
    /** Omitted when the user cannot change pages. */
    actions?: { edit: (p: MonitoredPage) => void; toggle: (p: MonitoredPage) => void; remove?: (p: MonitoredPage) => void };
    pending: boolean;
}

/** A monitored page: what is watched, the versions kept and what changed between them. */
export function PageDrawer({ open, id, initial, onClose, actions, pending }: PageDrawerProps) {
    const { data: page, error } = usePage(id, initial);
    const check = useCheckPage();
    const capture = useCaptureScreenshot();
    return (
        <SideDrawer open={open} onClose={onClose} labelledBy="page-drawer-title" width={640}>
            <Stack direction="row" sx={{ px: 2.5, pt: 2, pb: 1, alignItems: 'flex-start', gap: 1 }}>
                <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                    <Typography variant="overline" color="text.secondary">
                        Monitored page
                    </Typography>
                    <Typography id="page-drawer-title" variant="h6" component="h2" sx={{ wordBreak: 'break-word' }}>
                        {page ? page.name || page.url : <Skeleton width={200} />}
                    </Typography>
                    {page && page.name && (
                        <Typography variant="body2" color="text.secondary" sx={{ wordBreak: 'break-all' }}>
                            <a href={page.url} target="_blank" rel="noopener noreferrer">
                                {page.url} <OpenInNew sx={{ fontSize: 14, verticalAlign: 'middle' }} />
                            </a>
                        </Typography>
                    )}
                </Box>
                <IconButton aria-label="Close" onClick={onClose}>
                    <Close />
                </IconButton>
            </Stack>
            {page && (
                <Stack direction="row" spacing={1} sx={{ px: 2.5, pb: 2, flexWrap: 'wrap', alignItems: 'center', rowGap: 1 }}>
                    <Chip
                        size="small"
                        color={page.is_active ? 'success' : 'default'}
                        variant="outlined"
                        icon={page.is_active ? <PlayCircleOutline /> : <PauseCircleOutline />}
                        label={page.is_active ? 'Active' : 'Paused'}
                    />
                    <Box sx={{ flexGrow: 1 }} />
                    {actions && (
                        <>
                            <Button size="small" variant="outlined" startIcon={<RefreshOutlined />} disabled={check.isPending} onClick={() => check.mutate(page)}>
                                Check now
                            </Button>
                            <Button size="small" variant="outlined" startIcon={<CameraAltOutlined />} disabled={capture.isPending || !page.versions_count} onClick={() => capture.mutate(page)}>
                                Screenshot
                            </Button>
                            <Button size="small" variant="outlined" startIcon={<EditOutlined />} onClick={() => actions.edit(page)}>
                                Edit
                            </Button>
                            <Button size="small" variant="outlined" startIcon={page.is_active ? <PauseCircleOutline /> : <PlayCircleOutline />} disabled={pending} onClick={() => actions.toggle(page)}>
                                {page.is_active ? 'Pause' : 'Resume'}
                            </Button>
                            {actions.remove && (
                                <Button size="small" variant="outlined" color="error" startIcon={<DeleteOutlined />} onClick={() => actions.remove?.(page)}>
                                    Delete
                                </Button>
                            )}
                        </>
                    )}
                </Stack>
            )}
            <Divider />
            <Box sx={{ flexGrow: 1, overflowY: 'auto' }}>
                {error && !page ? (
                    <MuiAlert severity="error" sx={{ m: 2.5 }}>
                        {getErrorMessage(error, 'Failed to load the page.')}
                    </MuiAlert>
                ) : !page ? (
                    <Box sx={{ p: 2.5 }}>
                        <Skeleton height={80} />
                    </Box>
                ) : (
                    <>
                        <Box component="section" sx={{ px: 2.5, py: 2 }}>
                            <Typography variant="overline" color="text.secondary" component="h3">
                                Watched
                            </Typography>
                            <Box component="dl" sx={{ display: 'grid', gridTemplateColumns: 'max-content 1fr', columnGap: 2, rowGap: 0.75, m: 0, mt: 1 }}>
                                {(
                                    [
                                        ['Notified from', `${page.threshold} % of the text changed`],
                                        ['Checked every', page.check_interval % 60 === 0 ? `${page.check_interval / 60} h` : `${page.check_interval} min`],
                                        ['Last check', page.last_checked ? `${dateAgo(page.last_checked)} - ${page.last_status ?? 'no answer'}` : 'Not yet'],
                                        ['Part of the page', page.css_selector || 'The whole page'],
                                        ['Versions kept', `${page.versions_count} (up to ${page.retention})`],
                                    ] as [string, string][]
                                ).map(([label, value]) => (
                                    <Box key={label} sx={{ display: 'contents' }}>
                                        <Typography component="dt" variant="body2" color="text.secondary">
                                            {label}
                                        </Typography>
                                        <Typography component="dd" variant="body2" sx={{ m: 0, fontFamily: label === 'Part of the page' && page.css_selector ? fonts.mono : undefined }}>
                                            {value}
                                        </Typography>
                                    </Box>
                                ))}
                            </Box>
                        </Box>
                        <Divider />
                        <Box component="section" sx={{ px: 2.5, py: 2 }}>
                            <Typography variant="overline" color="text.secondary" component="h3" sx={{ display: 'block', mb: 1 }}>
                                Versions and changes
                            </Typography>
                            <History page={page} />
                        </Box>
                    </>
                )}
            </Box>
        </SideDrawer>
    );
}
