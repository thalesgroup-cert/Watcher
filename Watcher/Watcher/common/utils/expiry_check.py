"""
Compare the expiry date Watcher keeps for a domain with what the registries say now.

The legitimate domains get their expiry from `update_legitimate_domains_rdap_data` (every 30 minutes) and the monitored sites
from `update_site_monitoring_rdap_data` (every 15 minutes): both ask the RDAP server of the extension. `check_expiry_dates`
(management command) uses this module to see, domain by domain, where the stored date and the registry disagree. It never
writes anything.
"""
from datetime import datetime, timedelta

OK = 'ok'
EXPIRED_BUT_REGISTERED = 'expired_but_registered'
STALE = 'stale'
MISSING = 'missing'
NO_DATA = 'no_data'

MESSAGES = {
    OK: 'the stored date is the one the source gives',
    EXPIRED_BUT_REGISTERED: 'shown as expired, but the source says it is still registered',
    STALE: 'the stored date differs from the source',
    MISSING: 'no date stored, the source has one: the job did not fill it',
    NO_DATA: 'no source gave a date',
}


def parse_day(value):
    """A `YYYY-MM-DD` string (or a date) as a date; None when there is nothing usable."""
    if not value:
        return None
    if hasattr(value, 'year') and not isinstance(value, str):
        return value.date() if isinstance(value, datetime) else value
    try:
        return datetime.strptime(str(value)[:10], '%Y-%m-%d').date()
    except ValueError:
        return None


def verdict(stored, rdap, today):
    """Where the stored date stands against the registry: (code, text, date the registry gives)."""
    stored, reference = parse_day(stored), parse_day(rdap)
    if reference is None:
        return NO_DATA, MESSAGES[NO_DATA], None
    if stored is None:
        return MISSING, MESSAGES[MISSING], reference
    if stored < today <= reference:
        return EXPIRED_BUT_REGISTERED, MESSAGES[EXPIRED_BUT_REGISTERED], reference
    if stored != reference:
        direction = 'earlier' if stored < reference else 'later'
        return STALE, f"{MESSAGES[STALE]} (stored {direction} than the source)", reference
    return OK, MESSAGES[OK], reference


def lookup(domain):
    """
    Ask the registry the way the jobs do. Returns a dict: rdap (date string or None), rdap_source (URL that answered),
    rdap_status (what the registry said, see RDAPDiscovery.status) and rdap_detail.
    """
    from common.utils.rdap import RDAPDiscovery

    result = {'rdap': None, 'rdap_source': None, 'rdap_status': None, 'rdap_detail': None}
    rdap = RDAPDiscovery(domain)
    answered = rdap.fetch_rdap_data()
    result['rdap_status'] = rdap.status
    result['rdap_detail'] = getattr(rdap, 'detail', None)
    if answered:
        result['rdap'] = rdap.get_expiration_date()
        result['rdap_source'] = getattr(rdap.response, 'url', None)
    return result


# What the job does with an answer
# A renewal only moves an expiry date forward. An answer that goes back (an earlier date than the one stored) is what makes a
# domain that is still ours show as Expired, and a registry can answer from a stale copy. So an earlier date is not written at
# once: it is written only when the registry gives the same earlier date on two passes of the job, less than a day apart; in
# between, the stored date stays and the answer waits as "pending".

PENDING_WINDOW = timedelta(hours=24)

FILL, RENEW, KEEP, HOLD, CONFIRM = 'fill', 'renew', 'keep', 'hold', 'confirm'


def decide(stored, new, pending, pending_source, pending_at, now):
    """
    What to do with `new` (the date the registry just gave) for a domain whose date is `stored`.
    Returns (action, pending, pending_source, pending_at): the action (fill, renew, keep, hold, confirm) and the pending
    answer to store afterwards (all None when nothing waits).
    """
    stored, new, pending = parse_day(stored), parse_day(new), parse_day(pending)
    if new is None:
        return KEEP, pending, pending_source, pending_at
    if stored is None:
        return FILL, None, None, None
    if new == stored:
        return KEEP, None, None, None
    if new > stored:
        return RENEW, None, None, None
    # The answer goes back
    if pending == new and pending_source == 'RDAP' and pending_at is not None and now - pending_at <= PENDING_WINDOW:
        return CONFIRM, None, None, None
    return HOLD, new, 'RDAP', now


# The same rule for any model that keeps an expiry date
# A legitimate domain keeps its date in `expiry`, a monitored site in `domain_expiry`; the bookkeeping fields are named after it
# (`<prefix>_pending`, `<prefix>_pending_source`, `<prefix>_pending_at`, `<prefix>_source`, `<prefix>_checked_at`,
# `<prefix>_check`), so one function serves both.

VERIFIED_DAYS = 7  # a date counts as confirmed when a registry gave it and answered less than this many days ago


def is_confirmed(check, source, checked_at, now=None):
    """The date is the one the registry (RDAP) gave, recently. A date typed by hand is not."""
    now = now or datetime.now()
    return check == 'ok' and source == 'RDAP' and checked_at is not None and checked_at >= now - timedelta(days=VERIFIED_DAYS)


def record_check(obj, check, source=None, answered=True, prefix='expiry', now=None, **more):
    """
    Remember what the last lookup said about the date of `obj` (stored with a queryset update: a save would write a timeline
    event on every pass of the job). `answered` is False when no registry answered (the time of the last answer stays).
    `more` are other bookkeeping values to store in the same update.
    """
    values = {f'{prefix}_check': check, **more}
    if answered:
        values[f'{prefix}_checked_at'] = now or datetime.now()
    if source:
        values[f'{prefix}_source'] = source
    type(obj).objects.filter(pk=obj.pk).update(**values)
    for name, value in values.items():  # the instance follows, so that its own save does not undo it
        setattr(obj, name, value)


def apply_answer(obj, new, now, prefix='expiry'):
    """
    Apply what the registry just answered (`new`, a date) to the date of `obj`, with the rules of
    `decide`. The pending answer and the result of the lookup are stored; when the date itself changes it is set on `obj` and
    the caller saves it. Returns (action, old date).
    """
    old = getattr(obj, prefix)
    pending_now = (getattr(obj, f'{prefix}_pending'), getattr(obj, f'{prefix}_pending_source'), getattr(obj, f'{prefix}_pending_at'))
    action, *pending = decide(old, new, *pending_now, now)
    more = {}
    if tuple(pending) != pending_now:
        more = dict(zip((f'{prefix}_pending', f'{prefix}_pending_source', f'{prefix}_pending_at'), pending))
    if action in (FILL, RENEW, CONFIRM):
        setattr(obj, prefix, parse_day(new))
        record_check(obj, 'ok', source='RDAP', prefix=prefix, now=now, **more)
    elif action == KEEP:
        record_check(obj, 'ok', source='RDAP', prefix=prefix, now=now, **more)  # the registry says what is stored
    elif action == HOLD:
        record_check(obj, 'contradicted', prefix=prefix, now=now, **more)
    return action, old
