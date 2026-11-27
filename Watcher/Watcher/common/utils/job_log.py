"""
Two lines of log that say what happened, instead of one line per item:

- `logged_job`: the end of a scheduled job, with what it counted and how long it took. What happens to each domain or
  keyword is logged at DEBUG; the job reports the totals. The pass is also kept (common.models.JobRun) for the Scheduled jobs
  page and for the freshness shown in the modules.
- `reported_notification`: the outcome of one notification on every channel (Slack ok, Citadel refused, e-mail without
  recipient…), in one line that carries the alert it is about.
"""
import functools
import re
import logging
import threading
import time
from collections import Counter

from django.utils import timezone

_local = threading.local()

# The jobs running now, by key, with the time they started: the web process runs the schedulers, so this is the whole truth
_running = {}
_running_lock = threading.Lock()
# The schedulers of the apps, to tell when each job runs next (they are registered by each app's start_scheduler)
_schedulers = []

_logger = logging.getLogger('watcher.common')

# The senders of the notifications all log on this logger
_SENDERS_LOGGER = 'watcher.common'
_CHANNEL_ORDER = ('slack', 'citadel', 'thehive', 'email')


# Slack and Citadel messages kept until the job ends, to be sent as one when there are many (connectors.notifications.digest)
_digest_sender = None


def set_digest_sender(func):
    """Register what sends the messages kept during a job: func(key, [(context, send), ...])."""
    global _digest_sender
    _digest_sender = func


def defer_digest(key, context, send):
    """Keep a message for the end of the job running in this thread. False (nothing kept) outside of a job."""
    pending = getattr(_local, 'pending', None)
    if pending is None:
        return False
    pending.setdefault(key, []).append((context, send))
    return True


def _flush_digests(pending):
    for key, items in pending.items():
        try:
            _digest_sender(key, items)
        except Exception as exc:
            _logger.error(f"Could not send the grouped notifications {key[0]} on {key[1]}: {exc}")


def job_count(key, n=1):
    """Count something in the scheduled job running in this thread. Does nothing outside of a job."""
    run = getattr(_local, 'run', None)
    if run is not None:
        run[key] += n


def job_key(func):
    """`app.function` of a job: the same for the decorated job and for the one the scheduler holds."""
    return f"{func.__module__.split('.')[0]}.{func.__name__}"


def register_scheduler(scheduler):
    """An app tells here which scheduler it started, so that the Scheduled jobs page can say when each job runs next."""
    if scheduler not in _schedulers:
        _schedulers.append(scheduler)


def scheduled_jobs():
    """Every job of the registered schedulers, as APScheduler jobs."""
    return [job for scheduler in _schedulers for job in scheduler.get_jobs()]


def running_jobs():
    """{key: when it started} of the jobs running now."""
    with _running_lock:
        return dict(_running)


def _record(key, name, started_at, duration, failed, counts, error):
    """Keep the pass in the database, and only the last ones of the job. A failure here never reaches the job."""
    try:
        from common.models import JobRun
        JobRun.objects.create(job=key, label=name, started_at=started_at, duration=round(duration, 1), failed=failed,
                              counts={k: v for k, v in counts.items() if v}, error=error[:300])
        stale = list(JobRun.objects.filter(job=key).order_by('-started_at', '-id').values_list('pk', flat=True)[JobRun.KEEP:])
        if stale:
            JobRun.objects.filter(pk__in=stale).delete()
    except Exception as exc:
        _logger.debug(f"The pass of {key} could not be kept: {exc}")


def logged_job(name, logger):
    """
    Decorator of a scheduled job: logs one line when it ends, with the counts it collected and its duration, and keeps the
    pass (JobRun). The job is known as running from its start to its end.
    """
    def decorate(func):
        key = job_key(func)

        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            run, previous, started = Counter(), getattr(_local, 'run', None), time.monotonic()
            started_at = timezone.now()
            _local.run = run
            pending, previous_pending = {}, getattr(_local, 'pending', None)
            _local.pending = pending
            with _running_lock:
                _running[key] = started_at
            failed, error = False, ''
            try:
                return func(*args, **kwargs)
            except Exception as exc:
                failed, error = True, f"{type(exc).__name__}: {exc}"
                raise
            finally:
                _local.pending = previous_pending
                if pending and _digest_sender:
                    _flush_digests(pending)
                _local.run = previous
                duration = time.monotonic() - started
                with _running_lock:
                    _running.pop(key, None)
                counts = ', '.join(f"{k}={value}" for k, value in run.items() if value) or 'nothing to report'
                level = logging.ERROR if failed else logging.INFO
                logger.log(level, f"CRON TASK done: {name} - {counts} ({duration:.0f}s)"
                                  + (" - stopped by an error" if failed else ""))
                _record(key, name, started_at, duration, failed, run, error)
        # The scheduler holds this wrapper: it is how a job that has not run yet is still known by its name
        wrapper.job_label = name
        return wrapper
    return decorate


def describe_schedule(trigger):
    """A trigger in words: `every 30 minutes`, `every 6 hours`, `every day at 08:00`, `every Monday at 06:00`."""
    from apscheduler.triggers.cron import CronTrigger
    from apscheduler.triggers.interval import IntervalTrigger

    def plural(n, unit):
        return f"every {unit}" if n == 1 else f"every {n} {unit}s"

    if isinstance(trigger, IntervalTrigger):
        seconds = int(trigger.interval.total_seconds())
        for size, unit in ((86400, 'day'), (3600, 'hour'), (60, 'minute')):
            if seconds % size == 0:
                return plural(seconds // size, unit)
        return plural(seconds, 'second')
    if isinstance(trigger, CronTrigger):
        fields = {field.name: str(field) for field in trigger.fields}
        minute, hour, days = fields.get('minute', '*'), fields.get('hour', '*'), fields.get('day_of_week', '*')
        # '*/15', or '3-59/15': every 15 minutes, starting at minute 3
        step = lambda value: int(value.rsplit('/', 1)[1]) if re.fullmatch(r'(\*|\d+-\d+)/\d+', value) else None
        if hour == '*' and step(minute):
            return plural(step(minute), 'minute')
        if step(hour):
            return plural(step(hour), 'hour')
        if hour.isdigit() and minute.isdigit():
            names = {'mon': 'Monday', 'tue': 'Tuesday', 'wed': 'Wednesday', 'thu': 'Thursday', 'fri': 'Friday', 'sat': 'Saturday', 'sun': 'Sunday'}
            when = f"{int(hour):02d}:{int(minute):02d}"
            return f"every {names[days]} at {when}" if days in names else f"every day at {when}" if days in ('*', 'mon-sun') else f"at {when} ({days})"
    return str(trigger)


class _Capture(logging.Handler):
    """The errors the senders log while one channel sends, for this thread only."""

    def __init__(self):
        super().__init__(level=logging.WARNING)
        self.thread = threading.get_ident()
        self.errors = []
        self.not_configured = False
        self.note = None

    def emit(self, record):
        if record.thread != self.thread:
            return
        message = record.getMessage()
        if record.levelno >= logging.ERROR:
            self.errors.append(message)
        elif message.startswith('No configuration for'):
            self.not_configured = True

    def status(self):
        if self.errors:
            return 'failed (' + self.errors[0][:110] + ')'
        if self.not_configured:
            return 'not configured'
        return self.note or 'ok'


def note_channel(text):
    """Say why the channel that is sending sent nothing (no recipient…). Does nothing outside of a channel."""
    capture = getattr(_local, 'capture', None)
    if capture is not None:
        capture.note = text


# Circuit breaker of the channels
# A channel that fails several times in a row (Slack unreachable, no mail server…) is skipped for a while instead of being
# tried, and waited for (5 s per attempt), by every notification of every job. After the cool-down one attempt is let
# through: if it works the channel is back, if not it is skipped again. The state lives in the memory of the process, which
# is the only one that sends (one gunicorn worker): a restart tries everything again.
BREAKER_THRESHOLD = 5     # failures in a row before the channel is skipped (settings.NOTIFICATION_BREAKER_THRESHOLD)
BREAKER_COOLDOWN = 300    # seconds a channel stays skipped (settings.NOTIFICATION_BREAKER_COOLDOWN)

_now = time.monotonic     # replaced in the tests
_breaker_lock = threading.Lock()
_breakers = {}            # channel -> {'failures': int, 'open_until': float | None, 'trial': bool}


def _breaker_settings():
    try:
        from django.conf import settings
        return (int(getattr(settings, 'NOTIFICATION_BREAKER_THRESHOLD', BREAKER_THRESHOLD)),
                int(getattr(settings, 'NOTIFICATION_BREAKER_COOLDOWN', BREAKER_COOLDOWN)))
    except Exception:
        return BREAKER_THRESHOLD, BREAKER_COOLDOWN


def reset_breakers():
    """Forget what the breakers know (the tests, and nothing else)."""
    with _breaker_lock:
        _breakers.clear()


def _breaker_wait(channel):
    """Seconds the channel is still skipped for, 0 when it may send (a single attempt is let through after the cool-down)."""
    with _breaker_lock:
        state = _breakers.get(channel)
        if not state or state['open_until'] is None:
            return 0
        left = state['open_until'] - _now()
        if left > 0:
            return left
        if state['trial']:
            return 1  # the attempt that tests the channel is under way: the others still wait for its answer
        state['trial'] = True
        return 0


def _breaker_result(channel, status):
    """Tell the breaker how an attempt went: 'failed…' counts against the channel, 'ok' clears it, the rest (off, no
    recipient, not configured) says nothing about the channel."""
    failed = status.startswith('failed')
    if not failed and status != 'ok':
        with _breaker_lock:
            state = _breakers.get(channel)
            if state:
                state['trial'] = False  # a trial that learned nothing: the next attempt tries again
        return
    threshold, cooldown = _breaker_settings()
    message = None
    with _breaker_lock:
        state = _breakers.setdefault(channel, {'failures': 0, 'open_until': None, 'trial': False})
        was_open = state['open_until'] is not None
        if failed:
            state['failures'] += 1
            if state['trial'] or state['failures'] >= threshold:
                state['open_until'] = _now() + cooldown
                message = (logging.WARNING, f"Notification channel {channel} keeps failing ({state['failures']} in a row, "
                                            f"last: {status[8:110].rstrip(')')}): skipped for {max(1, cooldown // 60)} min")
            state['trial'] = False
        else:
            state.update(failures=0, open_until=None, trial=False)
            if was_open:
                message = (logging.INFO, f"Notification channel {channel} answers again")
    if message:
        logging.getLogger(_SENDERS_LOGGER).log(*message)


def run_channel(channel, send):
    """Run one channel of a notification and return how it went; adds it to the report of the notification."""
    wait = _breaker_wait(channel)
    if wait > 0:
        status = f"skipped (channel failing, retry in {max(1, round(wait / 60))} min)"
        report_channel(channel, status)
        job_count('notifications_skipped')
        return status
    capture = _Capture()
    logger = logging.getLogger(_SENDERS_LOGGER)
    previous, _local.capture = getattr(_local, 'capture', None), capture
    logger.addHandler(capture)
    try:
        send()
    except Exception as exc:
        status = f"failed ({str(exc)[:110]})"
        report_channel(channel, status)
        raise
    else:
        status = capture.status()
        report_channel(channel, status)
        return status
    finally:
        logger.removeHandler(capture)
        _local.capture = previous
        _breaker_result(channel, status)


def report_channel(channel, status):
    """Add a channel to the report of the notification being sent. Does nothing outside of a notification."""
    report = getattr(_local, 'report', None)
    if report is not None:
        report[channel] = status


def reported_notification(label_of, logger):
    """
    Decorator of the functions that send a notification (app_name, context_data, subscribers): when they end, one line
    tells how the notification went on each channel. `label_of(app_name, context_data)` names the alert it is about.
    """
    def decorate(func):
        @functools.wraps(func)
        def wrapper(app_name, context_data, *args, **kwargs):
            report, previous = {}, getattr(_local, 'report', None)
            _local.report = report
            try:
                return func(app_name, context_data, *args, **kwargs)
            finally:
                _local.report = previous
                if report:
                    ordered = sorted(report.items(), key=lambda item: _CHANNEL_ORDER.index(item[0]) if item[0] in _CHANNEL_ORDER else 9)
                    problems = any(status.startswith('failed') for _, status in ordered)
                    try:
                        label = label_of(app_name, context_data)
                    except Exception:
                        label = app_name
                    logger.log(logging.WARNING if problems else logging.INFO,
                               f"Notification {label}: " + ', '.join(f"{channel}={status}" for channel, status in ordered))
        return wrapper
    return decorate
