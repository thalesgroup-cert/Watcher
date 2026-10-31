"""
Two lines of log that say what happened, instead of one line per item:

- `logged_job`: the end of a scheduled job, with what it counted and how long it took. What happens to each domain or
  keyword is logged at DEBUG; the job reports the totals.
- `reported_notification`: the outcome of one notification on every channel (Slack ok, Citadel refused, e-mail without
  recipient…), in one line that carries the alert it is about.
"""
import functools
import logging
import threading
import time
from collections import Counter

_local = threading.local()

# The senders of the notifications all log on this logger
_SENDERS_LOGGER = 'watcher.common'
_CHANNEL_ORDER = ('slack', 'citadel', 'thehive', 'email')


def job_count(key, n=1):
    """Count something in the scheduled job running in this thread. Does nothing outside of a job."""
    run = getattr(_local, 'run', None)
    if run is not None:
        run[key] += n


def logged_job(name, logger):
    """Decorator of a scheduled job: logs one line when it ends, with the counts it collected and its duration."""
    def decorate(func):
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            run, previous, started = Counter(), getattr(_local, 'run', None), time.monotonic()
            _local.run = run
            failed = False
            try:
                return func(*args, **kwargs)
            except Exception:
                failed = True
                raise
            finally:
                _local.run = previous
                counts = ', '.join(f"{key}={value}" for key, value in run.items() if value) or 'nothing to report'
                level = logging.ERROR if failed else logging.INFO
                logger.log(level, f"CRON TASK done: {name} - {counts} ({time.monotonic() - started:.0f}s)"
                                  + (" - stopped by an error" if failed else ""))
        return wrapper
    return decorate


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


def run_channel(channel, send):
    """Run one channel of a notification and return how it went; adds it to the report of the notification."""
    capture = _Capture()
    logger = logging.getLogger(_SENDERS_LOGGER)
    previous, _local.capture = getattr(_local, 'capture', None), capture
    logger.addHandler(capture)
    try:
        send()
    except Exception as exc:
        report_channel(channel, f"failed ({str(exc)[:110]})")
        raise
    finally:
        logger.removeHandler(capture)
        _local.capture = previous
    status = capture.status()
    report_channel(channel, status)
    return status


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
