"""
The scheduled jobs, as the Scheduled jobs page shows them: when each job last ran, how long it
took, what it counted, whether it failed, and when it runs next. The history is the passages that `logged_job` keeps
(common.models.JobRun); the next passage comes from the schedulers of the apps.
"""
from datetime import timedelta

from rest_framework import permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import JobRun
from .utils import job_log

# The app of a job (the first part of its key) as the interface names it
MODULE_LABELS = {
    'threats_watcher': 'Threats Watcher',
    'cyber_watch': 'Cyber Watch',
    'data_leak': 'Data Leak',
    'dns_finder': 'DNS Threats',
    'site_monitoring': 'Website Monitoring',
    'common': 'Legitimate Domains',
    'connectors': 'Connectors',
}
RECENT = 10  # passages shown as the recent history of a job


class IsSuperuser(permissions.BasePermission):
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.is_superuser)


def _finished(run):
    return run.started_at + timedelta(seconds=run.duration)


class ScheduledJobsView(APIView):
    """`GET /api/common/scheduled_jobs/`: every scheduled job with its last passages. Superusers only."""
    permission_classes = [IsSuperuser]

    def get(self, request):
        running = job_log.running_jobs()
        jobs = []
        for job in job_log.scheduled_jobs():
            key = job_log.job_key(job.func)
            module = MODULE_LABELS.get(key.split('.')[0], key.split('.')[0])
            runs = list(JobRun.objects.filter(job=key).order_by('-started_at', '-id')[:RECENT])
            last = runs[0] if runs else None
            durations = [run.duration for run in runs]
            next_run = getattr(job, 'next_run_time', None)
            tracked_label = getattr(job.func, 'job_label', None)  # set by logged_job
            jobs.append({
                'key': key,
                'module': module,
                'label': last.label if last else tracked_label or job.func.__name__.replace('_', ' ').capitalize(),
                # Keeps a summary of its passes (logged_job); the small ones, such as the clean-ups, do not
                'tracked': tracked_label is not None,
                'schedule': job_log.describe_schedule(job.trigger),
                'next_run': next_run.isoformat() if next_run else None,
                'running': key in running,
                'running_since': running[key].isoformat() if key in running else None,
                'reported': last is not None,
                'last': {
                    'started_at': last.started_at.isoformat(),
                    'finished_at': _finished(last).isoformat(),
                    'duration': last.duration,
                    'failed': last.failed,
                    'error': last.error,
                    'counts': last.counts,
                } if last else None,
                'average_duration': round(sum(durations) / len(durations), 1) if durations else None,
                # Oldest first, to draw them left to right
                'recent': [{'started_at': r.started_at.isoformat(), 'duration': r.duration, 'failed': r.failed} for r in reversed(runs)],
            })
        jobs.sort(key=lambda j: (j['module'], j['label']))
        return Response({'jobs': jobs})

