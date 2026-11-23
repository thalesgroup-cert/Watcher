import { api } from '../../api/client';

/** A scheduled job, as `GET /api/common/scheduled_jobs/` tells it (common/jobs_api.py). */
export interface ScheduledJob {
    /** `app.function`, e.g. `threats_watcher.main_watch`. */
    key: string;
    module: string;
    label: string;
    /** In words: "every 30 minutes". */
    schedule: string;
    next_run: string | null;
    running: boolean;
    running_since: string | null;
    /** At least one pass has been kept. */
    reported: boolean;
    /** The job keeps a summary of its passes (some small jobs, such as the clean-ups, do not). */
    tracked: boolean;
    last: {
        started_at: string;
        finished_at: string;
        duration: number;
        failed: boolean;
        error: string;
        counts: Record<string, number>;
    } | null;
    average_duration: number | null;
    /** The last passages, oldest first. */
    recent: { started_at: string; duration: number; failed: boolean }[];
}

export const fetchScheduledJobs = () => api.get<{ jobs: ScheduledJob[] }>('/api/common/scheduled_jobs/').then((res) => res.data.jobs);

