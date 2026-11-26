import { Alert as MuiAlert, Box, Button, Divider, IconButton, Paper, Skeleton, Stack, Typography } from '@mui/material';
import Close from '@mui/icons-material/Close';
import DeleteOutlined from '@mui/icons-material/DeleteOutlined';
import EditOutlined from '@mui/icons-material/EditOutlined';
import LinkOffOutlined from '@mui/icons-material/LinkOffOutlined';
import ListAltOutlined from '@mui/icons-material/ListAltOutlined';
import { getErrorMessage } from '../../../api/client';
import { since } from '../../../lib/dates';
import { SideDrawer } from '../../../ui/SideDrawer';
import { ObjectHistory } from '../../timeline/components/ObjectHistory';
import { formatDateTime } from '../../timeline/format';
import { ASSET_KINDS } from '../catalog';
import { useAsset } from '../hooks';
import type { Asset, AssetKind } from '../types';

function Count({ label, value }: { label: string; value: string }) {
    return (
        <Paper variant="outlined" sx={{ p: 1.5, flex: 1, minWidth: 0 }}>
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                {label}
            </Typography>
            <Typography variant="h3" component="div" noWrap>
                {value}
            </Typography>
        </Paper>
    );
}

const WHAT: Record<AssetKind, string> = {
    domain: 'Watcher looks for look-alike variants of this domain (dnstwist) and for its subdomains that point to resources someone else could claim.',
    keyword: 'Watcher raises a threat for every new TLS certificate whose names contain this keyword (Certificate Transparency).',
};

interface AssetDrawerProps {
    kind: AssetKind;
    open: boolean;
    id: number | null;
    initial?: Asset;
    onClose: () => void;
    onShowThreats: (asset: Asset, takeoverOnly?: boolean) => void;
    actions?: { edit: (a: Asset) => void; remove: (a: Asset) => void };
}

/** One watched domain or keyword: what it found, shortcuts to those threats, and its history. */
export function AssetDrawer({ kind, open, id, initial, onClose, onShowThreats, actions }: AssetDrawerProps) {
    const { data: asset, error } = useAsset(kind, id, initial);
    const meta = ASSET_KINDS[kind];
    return (
        <SideDrawer open={open} onClose={onClose} labelledBy="asset-drawer-title">
            <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', px: 2.5, py: 2 }}>
                <Box sx={{ minWidth: 0, flexGrow: 1 }}>
                    <Typography variant="overline" color="text.secondary" sx={{ lineHeight: 1.4, display: 'block', textTransform: 'capitalize' }}>
                        {meta.one}
                    </Typography>
                    <Typography id="asset-drawer-title" variant="h3" component="h2" noWrap title={asset?.name}>
                        {asset?.name ?? <Skeleton width={200} />}
                    </Typography>
                </Box>
                <IconButton aria-label="Close details" onClick={onClose} edge="end">
                    <Close />
                </IconButton>
            </Stack>
            {asset && actions && (
                <Stack direction="row" spacing={1} sx={{ px: 2.5, pb: 2 }}>
                    <Button size="small" variant="outlined" startIcon={<EditOutlined />} onClick={() => actions.edit(asset)}>
                        Edit
                    </Button>
                    <Button size="small" variant="outlined" color="error" startIcon={<DeleteOutlined />} onClick={() => actions.remove(asset)}>
                        Delete
                    </Button>
                </Stack>
            )}
            <Divider />
            <Box sx={{ flexGrow: 1, overflowY: 'auto' }}>
                {error && !asset ? (
                    <MuiAlert severity="error" sx={{ m: 2.5 }}>
                        {getErrorMessage(error, `Failed to load the ${meta.one}.`)}
                    </MuiAlert>
                ) : !asset ? (
                    <Box sx={{ p: 2.5 }}>
                        <Skeleton height={80} />
                    </Box>
                ) : (
                    <>
                        <Box sx={{ px: 2.5, py: 2 }}>
                            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                                {WHAT[kind]}
                            </Typography>
                            <Stack direction="row" spacing={1.5}>
                                <Count label="Open threats" value={asset.open_threats_count.toLocaleString('en-GB')} />
                                {kind === 'domain' && <Count label="Takeover risks" value={(asset.takeover_count ?? 0).toLocaleString('en-GB')} />}
                                <Count label="Last threat" value={asset.last_threat_at ? since(asset.last_threat_at) : 'Never'} />
                            </Stack>
                            <Stack direction="row" spacing={1} sx={{ mt: 1.5, flexWrap: 'wrap' }}>
                                <Button startIcon={<ListAltOutlined />} onClick={() => onShowThreats(asset)} disabled={asset.threats_count === 0}>
                                    Show its {asset.threats_count.toLocaleString('en-GB')} threat{asset.threats_count === 1 ? '' : 's'}
                                </Button>
                                {kind === 'domain' && (asset.takeover_count ?? 0) > 0 && (
                                    <Button startIcon={<LinkOffOutlined />} color="error" onClick={() => onShowThreats(asset, true)}>
                                        Show the takeover risks
                                    </Button>
                                )}
                            </Stack>
                            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                                Added {formatDateTime(asset.created_at)}.
                            </Typography>
                        </Box>
                        <Divider />
                        <Box component="section" sx={{ px: 2.5, py: 2 }}>
                            <Typography variant="overline" color="text.secondary" component="h3" sx={{ display: 'block', mb: 1 }}>
                                History
                            </Typography>
                            <ObjectHistory targets={[{ contentType: meta.contentType, objectId: asset.id }]} enabled={open} />
                        </Box>
                    </>
                )}
            </Box>
        </SideDrawer>
    );
}
