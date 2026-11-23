import { useQuery } from '@tanstack/react-query';
import * as api from './api';

/** The scheduled jobs and their last passages, renewed every 15 seconds while the page is open. */
export function useScheduledJobs() {
    return useQuery({ queryKey: ['scheduled-jobs'], queryFn: api.fetchScheduledJobs, refetchInterval: 15_000 });
}
