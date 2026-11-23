import { Alert, Box, Card, Chip, Skeleton, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Tooltip, Typography } from '@mui/material';
import { getErrorMessage } from '../../api/client';
import { formatDateTime } from '../../lib/dates';
import { lasted, until } from '../../lib/durations';
import { When } from '../../ui/When';
import type { ScheduledJob } from './api';
import { useScheduledJobs } from './hooks';

/** The counts of a pass in words: `keywords 422 - pastebin unavailable 1`. */
const countsText = (counts: Record<string, number>) =>
    Object.entries(counts)
        .map(([key, value]) => `${key.replace(/_/g, ' ')} ${value.toLocaleString('en-GB')}`)
        .join(' - ');

/** The duration of the last passages as small bars, the failed ones in red: a job that slows down shows at a glance. */
function Trend({ recent }: { recent: ScheduledJob['recent'] }) {
    if (recent.length < 2) return null;
    const max = Math.max(...recent.map((r) => r.duration), 1);
    return (
        <Tooltip title={`The last ${recent.length} passes: ${recent.map((r) => lasted(r.duration)).join(', ')}`}>
            <Stack aria-hidden direction="row" spacing="2px" sx={{ alignItems: 'flex-end', height: 18, mt: 0.5 }} data-testid="job-trend">
                {recent.map((run, i) => (
                    <Box
                        key={`${run.started_at}-${i}`}
                        sx={{ width: 4, height: `${Math.max(12, (run.duration / max) * 100)}%`, borderRadius: '1px', bgcolor: run.failed ? 'error.main' : 'primary.main', opacity: i === recent.length - 1 ? 1 : 0.55 }}
                    />
                ))}
            </Stack>
        </Tooltip>
    );
}

function JobRow({ job }: { job: ScheduledJob }) {
    const { last } = job;
    const overran = !!last?.counts.overran;
    return (
        <TableRow data-testid="job-row" data-key={job.key}>
            <TableCell>
                <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 0.5 }}>
                    <Typography variant="body2" sx={{ fontWeight: 650 }}>
                        {job.label}
                    </Typography>
                    {job.running && <Chip size="small" color="info" label="Running" data-testid="job-running" />}
                    {last?.failed && (
                        <Tooltip title={last.error || 'The last pass stopped by an error: see the log of Watcher.'}>
                            <Chip size="small" color="error" label="Failed" data-testid="job-failed" />
                        </Tooltip>
                    )}
                    {overran && (
                        <Tooltip title="The last pass took longer than the time between two passes: the passes that came meanwhile were skipped.">
                            <Chip size="small" color="warning" label="Overran its cycle" data-testid="job-overran" />
                        </Tooltip>
                    )}
                </Stack>
                <Typography variant="caption" color="text.secondary">
                    {job.module}
                </Typography>
            </TableCell>
            <TableCell>{job.schedule}</TableCell>
            <TableCell>{last ? <When iso={last.started_at} /> : <Typography variant="body2" color="text.disabled">{job.tracked ? 'No pass yet' : 'No summary kept'}</Typography>}</TableCell>
            <TableCell>
                {last ? (
                    <>
                        <Typography variant="body2">{lasted(last.duration)}</Typography>
                        {job.average_duration !== null && job.recent.length > 1 && (
                            <Typography variant="caption" color="text.secondary">
                                average {lasted(job.average_duration)}
                            </Typography>
                        )}
                        <Trend recent={job.recent} />
                    </>
                ) : (
                    '-'
                )}
            </TableCell>
            <TableCell sx={{ maxWidth: 280 }}>
                <Typography variant="body2" color={last && Object.keys(last.counts).length ? 'text.primary' : 'text.disabled'} sx={{ overflowWrap: 'anywhere' }}>
                    {last ? countsText(last.counts) || 'Nothing to report' : '-'}
                </Typography>
            </TableCell>
            <TableCell>
                {job.running && job.running_since ? (
                    <Typography variant="body2">
                        Since <When iso={job.running_since} inline />
                    </Typography>
                ) : job.next_run ? (
                    <Tooltip title={formatDateTime(job.next_run)}>
                        <Typography variant="body2">{until(job.next_run)}</Typography>
                    </Tooltip>
                ) : (
                    '-'
                )}
            </TableCell>
        </TableRow>
    );
}

/** The scheduled jobs of Watcher: when each one last ran, how long it took, what it did and when it runs next. */
export function JobsTab() {
    const { data: jobs, error } = useScheduledJobs();

    if (error && !jobs) {
        return (
            <Alert severity="error" sx={{ mt: 2 }}>
                {getErrorMessage(error, 'The scheduled jobs could not be loaded.')}
            </Alert>
        );
    }
    if (!jobs) return <Skeleton variant="rounded" height={320} sx={{ mt: 2 }} />;

    const running = jobs.filter((j) => j.running).length;
    const failed = jobs.filter((j) => j.last?.failed).length;
    const overran = jobs.filter((j) => j.last?.counts.overran).length;

    return (
        <Stack spacing={2} sx={{ mt: 2 }}>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 1 }} data-testid="jobs-summary">
                <Typography variant="body2" color="text.secondary" sx={{ mr: 1 }}>
                    {jobs.length} scheduled job{jobs.length === 1 ? '' : 's'}, renewed every 15 seconds.
                </Typography>
                <Chip size="small" color={running ? 'info' : 'default'} variant={running ? 'filled' : 'outlined'} label={`${running} running`} />
                <Chip size="small" color={failed ? 'error' : 'default'} variant={failed ? 'filled' : 'outlined'} label={`${failed} failed on the last pass`} />
                <Chip size="small" color={overran ? 'warning' : 'default'} variant={overran ? 'filled' : 'outlined'} label={`${overran} overran`} />
            </Stack>
            <Card>
                <TableContainer>
                    <Table size="small" aria-label="Scheduled jobs">
                        <TableHead>
                            <TableRow>
                                <TableCell>Job</TableCell>
                                <TableCell sx={{ width: 170 }}>Runs</TableCell>
                                <TableCell sx={{ width: 150 }}>Last pass</TableCell>
                                <TableCell sx={{ width: 130 }}>Took</TableCell>
                                <TableCell>What it did</TableCell>
                                <TableCell sx={{ width: 130 }}>Next pass</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {jobs.map((job) => (
                                <JobRow key={job.key + job.schedule} job={job} />
                            ))}
                        </TableBody>
                    </Table>
                </TableContainer>
            </Card>
        </Stack>
    );
}
