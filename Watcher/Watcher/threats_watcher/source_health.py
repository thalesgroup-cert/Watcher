"""
A feed that answers with an error for weeks is almost always a dead one (moved, closed, blocked for good). Watcher keeps
since when a source fails (`Source.failing_since`: the first error of the current series, cleared by any good answer) and,
after `FAILING_DAYS` days in a row, asks a person what to do with it (Pending actions): approving deletes the source,
rejecting keeps it (and Watcher asks again only after another `FAILING_DAYS` days).
"""
import logging
from datetime import timedelta

from django.utils import timezone

logger = logging.getLogger('watcher.threats_watcher')

SOURCE_FAILING = 'source_failing'
# Days with an error, in a row, before a person is asked
FAILING_DAYS = 45


def failing_since_after(status_code, failing_since, now):
    """The new value of `failing_since` after an answer: kept while the errors go on, cleared by a good answer."""
    if status_code == 200:
        return None
    return failing_since or now


def _already_asked(source, now):
    """True when the question is pending, or was answered "keep" less than `FAILING_DAYS` days ago."""
    from common.models import PendingAction
    since = now - timedelta(days=FAILING_DAYS)
    for pa in PendingAction.objects.filter(action_type=SOURCE_FAILING).order_by('-created_at')[:500]:
        if pa.metadata.get('source_id') != source.pk:
            continue
        if pa.status == 'pending' or (pa.resolved_at and pa.resolved_at > since):
            return True
    return False


def queue_if_dead(source, now=None):
    """Queue the question for a source that has failed for `FAILING_DAYS` days in a row. None when it is not the time."""
    now = now or timezone.now()
    if not source.failing_since or now - source.failing_since < timedelta(days=FAILING_DAYS):
        return None
    if _already_asked(source, now):
        return None
    from common.models import PendingAction
    days = (now - source.failing_since).days
    action = PendingAction.objects.create(
        action_type=SOURCE_FAILING,
        title=f"RSS source failing for {days} days: {source.url}",
        description=(f"{source.url} has answered with an error ({source.last_status_code or 'no answer'}) at every check for "
                     f"{days} days. It is probably closed, moved or blocked for good, and gives Watcher nothing.\n\n"
                     "Approving deletes the source. Reject it to keep it (Watcher asks again after "
                     f"{FAILING_DAYS} more days of errors)."),
        metadata={'source_id': source.pk, 'url': source.url, 'status_code': source.last_status_code,
                  'failing_since': source.failing_since.isoformat(), 'days': days},
    )
    logger.warning("PendingAction (%s) queued for %s - failing for %d days.", SOURCE_FAILING, source.url, days)
    return action


def execute_source_failing(pa):
    """Approved: the source is deleted, unless it answers again (then it is kept and nothing is done)."""
    from .models import Source
    source = (Source.objects.filter(pk=pa.metadata.get('source_id')).first()
              or Source.objects.filter(url=pa.metadata.get('url')).first())
    if source is None:
        logger.warning("PendingAction %d: '%s' is no longer a source - nothing to do.", pa.id, pa.metadata.get('url'))
        return
    if source.failing_since is None:
        logger.warning("PendingAction %d: %s answers again - it is kept.", pa.id, source.url)
        return
    url = source.url
    source.delete()
    logger.info("PendingAction %d: source %s deleted after %s days of errors.", pa.id, url, pa.metadata.get('days'))
