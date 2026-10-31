import type { ReactNode } from 'react';
import { Alert, Box, Button, Divider, IconButton, Paper, Skeleton, Stack, Typography } from '@mui/material';
import Close from '@mui/icons-material/Close';
import CloudUploadOutlined from '@mui/icons-material/CloudUploadOutlined';
import DeleteOutlined from '@mui/icons-material/DeleteOutlined';
import EditOutlined from '@mui/icons-material/EditOutlined';
import LockOutlined from '@mui/icons-material/LockOutlined';
import PublicOutlined from '@mui/icons-material/PublicOutlined';
import { getErrorMessage } from '../../../api/client';
import { fonts } from '../../../styles/theme';
import { CopyValue } from '../../../ui/CopyValue';
import { SideDrawer } from '../../../ui/SideDrawer';
import { hasAnyPermission, selectUser, useAuthStore } from '../../auth/store';
import { parseEventUuids } from '../../misp/MispExportDialog';
import { ScreenshotsPanel } from '../../screenshots/ScreenshotsPanel';
import { ObjectHistory } from '../../timeline/components/ObjectHistory';
import { formatDay } from '../expiry';
import { ENDPOINT } from '../api';
import { CONTENT_TYPE, useDomain } from '../hooks';
import type { LegitimateDomain } from '../types';
import { Expiry } from './Expiry';

function Section({ title, children }: { title: string; children: ReactNode }) {
    return (
        <Box component="section" sx={{ px: 2.5, py: 2 }}>
            <Typography variant="overline" color="text.secondary" component="h3" sx={{ display: 'block', mb: 1 }}>
                {title}
            </Typography>
            {children}
        </Box>
    );
}

function Fact({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
    return (
        <Paper variant="outlined" sx={{ p: 1.5, flex: 1, minWidth: 0 }}>
            <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', color: 'text.secondary', mb: 0.5, '& svg': { fontSize: 16 } }}>
                {icon}
                <Typography variant="caption" sx={{ fontWeight: 600 }}>
                    {label}
                </Typography>
            </Stack>
            {children}
        </Paper>
    );
}

/** Label / value pairs; empty values read "-". */
function Details({ rows }: { rows: [string, ReactNode][] }) {
    return (
        <Box component="dl" sx={{ display: 'grid', gridTemplateColumns: 'max-content 1fr', columnGap: 2, rowGap: 1, m: 0 }}>
            {rows.map(([label, value]) => (
                <Box key={label} sx={{ display: 'contents' }}>
                    <Typography component="dt" variant="body2" color="text.secondary">
                        {label}
                    </Typography>
                    <Typography component="dd" variant="body2" sx={{ m: 0, minWidth: 0, overflowWrap: 'anywhere' }}>
                        {value || <Box component="span" sx={{ color: 'text.disabled' }}>-</Box>}
                    </Typography>
                </Box>
            ))}
        </Box>
    );
}

interface DomainDrawerProps {
    open: boolean;
    /** Domain shown; kept while the drawer slides out. */
    id: number | null;
    /** Row of the list, painted while the detail loads. */
    initial?: LegitimateDomain;
    onClose: () => void;
    /** Signed-in users see the internal fields and the history. */
    showInternal: boolean;
    /** Omitted when the user cannot manage domains. */
    actions?: {
        edit: (d: LegitimateDomain) => void;
        exportToMisp: (d: LegitimateDomain) => void;
        remove: (d: LegitimateDomain) => void;
    };
}

/** Everything about one legitimate domain: renewal status, details, comments, MISP events and history. */
export function DomainDrawer({ open, id, initial, onClose, showInternal, actions }: DomainDrawerProps) {
    const { data: domain, error } = useDomain(id, initial);
    const uuids = parseEventUuids(domain?.misp_event_uuid);
    const user = useAuthStore(selectUser);
    const canTakeScreenshots = hasAnyPermission(user, 'common.change_legitimatedomain');

    return (
        <SideDrawer open={open} onClose={onClose} labelledBy="domain-drawer-title" width={520}>
            <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', px: 2.5, py: 2 }}>
                <Box sx={{ minWidth: 0, flexGrow: 1 }}>
                    <Typography variant="overline" color="text.secondary" sx={{ lineHeight: 1.4, display: 'block' }}>
                        Legitimate domain
                    </Typography>
                    <CopyValue value={domain?.domain_name} label="Domain">
                        <Typography id="domain-drawer-title" variant="h3" component="h2" noWrap title={domain?.domain_name}>
                            {domain?.domain_name ?? <Skeleton width={200} />}
                        </Typography>
                    </CopyValue>
                </Box>
                <IconButton aria-label="Close details" onClick={onClose} edge="end">
                    <Close />
                </IconButton>
            </Stack>
            {actions && domain && (
                <Stack direction="row" spacing={1} sx={{ px: 2.5, pb: 2, flexWrap: 'wrap' }}>
                    <Button size="small" variant="outlined" startIcon={<EditOutlined />} onClick={() => actions.edit(domain)}>
                        Edit
                    </Button>
                    <Button size="small" variant="outlined" startIcon={<CloudUploadOutlined />} onClick={() => actions.exportToMisp(domain)}>
                        Export to MISP
                    </Button>
                    <Button size="small" variant="outlined" color="error" startIcon={<DeleteOutlined />} onClick={() => actions.remove(domain)}>
                        Delete
                    </Button>
                </Stack>
            )}
            <Divider />

            <Box sx={{ flexGrow: 1, overflowY: 'auto' }}>
                {error && !domain ? (
                    <Alert severity="error" sx={{ m: 2.5 }}>
                        {getErrorMessage(error, 'Failed to load the domain.')}
                    </Alert>
                ) : !domain ? (
                    <Box sx={{ p: 2.5 }}>
                        <Skeleton height={80} />
                        <Skeleton width="60%" />
                        <Skeleton width="40%" />
                    </Box>
                ) : (
                    <>
                        <Section title="Renewal">
                            <Stack direction="row" spacing={1.5}>
                                <Fact icon={<PublicOutlined />} label="Domain">
                                    <Expiry value={domain.expiry} />
                                </Fact>
                                <Fact icon={<LockOutlined />} label="Certificate">
                                    <Expiry value={domain.ssl_expiry} />
                                </Fact>
                            </Stack>
                            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                                Dates are refreshed automatically from RDAP/WHOIS and the site's certificate.
                            </Typography>
                        </Section>

                        <Section title="Details">
                            <Details
                                rows={[
                                    ['Registered', domain.domain_created_at && formatDay(domain.domain_created_at)],
                                    ['Added to Watcher', formatDay(domain.created_at)],
                                    ['Contact', domain.contact],
                                    ...(showInternal
                                        ? ([
                                              ['Ticket', domain.ticket_id],
                                              ['Repurchased', domain.repurchased ? 'Yes' : 'No'],
                                              [
                                                  'MISP events',
                                                  uuids.length > 0 && (
                                                      <Stack component="span" spacing={0.25}>
                                                          {[...uuids].reverse().map((u) => (
                                                              <Box key={u} component="span" sx={{ fontFamily: fonts.mono, fontSize: 12 }}>
                                                                  {u}
                                                              </Box>
                                                          ))}
                                                      </Stack>
                                                  ),
                                              ],
                                          ] as [string, ReactNode][])
                                        : []),
                                ]}
                            />
                        </Section>

                        {showInternal && domain.comments && (
                            <Section title="Comments">
                                <Typography
                                    variant="body2"
                                    sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', borderLeft: 3, borderColor: 'divider', pl: 1.5 }}
                                >
                                    {domain.comments}
                                </Typography>
                            </Section>
                        )}

                        {showInternal && (
                            <>
                                <Divider />
                                <Section title="Screenshots">
                                    <ScreenshotsPanel endpoint={`${ENDPOINT}${domain.id}/`} title={domain.domain_name} canTake={canTakeScreenshots} />
                                </Section>
                                <Divider />
                                <Section title="History">
                                    <ObjectHistory targets={[{ contentType: CONTENT_TYPE, objectId: domain.id }]} enabled={open} />
                                </Section>
                            </>
                        )}
                    </>
                )}
            </Box>
        </SideDrawer>
    );
}
