# coding=utf-8
import logging
import math
import re
from datetime import timedelta

import requests
from datetime import datetime
from django.conf import settings
from django.utils import timezone
from django.db import close_old_connections
from django.utils.dateparse import parse_datetime
from connectors.core import get_cyberwatch_cve_config, get_ransomware_live_config, get_ransomlook_config
from apscheduler.schedulers.background import BackgroundScheduler
import tzlocal

from .models import CVEAlert, RansomwareGroup, RansomwareVictim, WatchRule, WatchRuleHit, Subscriber
from common.core import retention_days, send_app_specific_notifications
from django.db.models import Q
from common.utils import job_log

# Configure logger
logger = logging.getLogger('watcher.cyber_watch')

SEVERITIES = ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')
# CVSS 3.x, then 4.0, then 2.0: the version people read in advisories first
_RANK = {3: 0, 4: 1, 2: 2}


def severity_of(score, version=3):
    """The label of a score: LOW, MEDIUM, HIGH or CRITICAL (a CVSS 2.0 score is never critical); '' for 0."""
    if score is None or score <= 0:
        return ''
    if score < 4:
        return 'LOW'
    if score < 7:
        return 'MEDIUM'
    if version == 2 or score < 9:
        return 'HIGH'
    return 'CRITICAL'


_AV = {'N': 0.85, 'A': 0.62, 'L': 0.55, 'P': 0.2}
_AC = {'L': 0.77, 'H': 0.44}
_UI = {'N': 0.85, 'R': 0.62}
_CIA = {'H': 0.56, 'L': 0.22, 'N': 0.0}
_PR_UNCHANGED = {'N': 0.85, 'L': 0.62, 'H': 0.27}
_PR_CHANGED = {'N': 0.85, 'L': 0.68, 'H': 0.5}


def _roundup(value):
    """The CVSS 3.1 rounding: up to one decimal, without the float errors."""
    whole = int(round(value * 100000))
    if whole % 10000 == 0:
        return whole / 100000.0
    return (math.floor(whole / 10000) + 1) / 10.0


def v3_score(vector):
    """The base score of a CVSS 3.0 / 3.1 vector ("CVSS:3.1/AV:N/AC:L/..."), None when it is not a valid one."""
    if not isinstance(vector, str) or not vector.startswith(('CVSS:3.0/', 'CVSS:3.1/')):
        return None
    try:
        parts = dict(piece.split(':', 1) for piece in vector.split('/')[1:])
        changed = parts['S'] == 'C'
        impact_base = 1 - (1 - _CIA[parts['C']]) * (1 - _CIA[parts['I']]) * (1 - _CIA[parts['A']])
        impact = 7.52 * (impact_base - 0.029) - 3.25 * (impact_base - 0.02) ** 15 if changed else 6.42 * impact_base
        exploitability = 8.22 * _AV[parts['AV']] * _AC[parts['AC']] * (_PR_CHANGED if changed else _PR_UNCHANGED)[parts['PR']] * _UI[parts['UI']]
    except (KeyError, ValueError):
        return None
    if impact <= 0:
        return 0.0
    total = impact + exploitability
    return _roundup(min(1.08 * total if changed else total, 10))


def _version(node, key):
    """2, 3 or 4: the CVSS version of a block that holds a score, from its `version` or from the name it is kept under."""
    declared = str(node.get('version', ''))
    named = re.search(r'(\d)(?:[._]\d)?', key) if key else None
    for text in (declared, named.group(1) if named else ''):
        if text[:1] in ('2', '3', '4'):
            return int(text[:1])
    return 3


def _scores(node, key=''):
    """Every block with a `baseScore` in the advisory, as (version, score, label)."""
    if isinstance(node, dict):
        score = node.get('baseScore')
        if isinstance(score, (int, float)) and not isinstance(score, bool) and 0 <= score <= 10:
            label = str(node.get('baseSeverity', '')).upper()
            yield _version(node, key), float(score), label if label in SEVERITIES else ''
        for child_key, child in node.items():
            if isinstance(child, (dict, list)):
                yield from _scores(child, child_key)
    elif isinstance(node, list):
        for child in node:
            yield from _scores(child, key)


def best_cvss(item):
    """
    (score, severity) of an advisory: the CVSS 3.x score if there is one, else 4.0, else 2.0; the highest of those of
    the same version. When only a vector is given, the score is computed from it. (None, '') when it is not scored yet.
    """
    found = sorted(_scores(item), key=lambda c: (_RANK.get(c[0], 9), -c[1]))
    if found:
        version, score, label = found[0]
        return score, label or severity_of(score, version)
    raw = item.get('cvss')
    if isinstance(raw, (int, float)) and not isinstance(raw, bool) and 0 <= raw <= 10:
        return float(raw), severity_of(float(raw))
    for entry in item.get('severity') or []:
        score = v3_score(entry.get('score') if isinstance(entry, dict) else entry)
        if score:
            return score, severity_of(score)
    return None, ''


def record_values(item):
    """What a full CVE record gives besides the score: its publication date (naive) and its description, when it has them."""
    metadata = item.get('cveMetadata') or {}
    published = None
    raw = item.get('published') or metadata.get('datePublished')
    if raw:
        try:
            parsed = parse_datetime(str(raw))
        except ValueError:
            parsed = None
        if isinstance(parsed, datetime):
            published = parsed.replace(tzinfo=None)
    descriptions = ((item.get('containers') or {}).get('cna') or {}).get('descriptions') or []
    description = item.get('title') or item.get('summary') or item.get('details') or (descriptions[0].get('value', '') if descriptions else '')
    return {'published': published, 'description': description or ''}



def start_scheduler():
    """
    Launch multiple planning tasks in background:

        - Fetch latest CVEs every 30 minutes.
        - Fetch ransomware data every 30 minutes.
        - Fetch RansomLook data every 30 minutes.
    """
    scheduler = BackgroundScheduler(timezone=str(tzlocal.get_localzone()))
    # Tells the Scheduled jobs page when each job runs next
    from common.utils.job_log import register_scheduler
    register_scheduler(scheduler)
    scheduler.add_job(fetch_latest_cves, 'interval', minutes=30, id='fetch_latest_cves',
        max_instances=1,
        replace_existing=True)
    # Once a day, and a first time a few minutes after the start: a fresh install has nothing yet, and both are light
    soon = timezone.now() + timedelta(minutes=3)
    scheduler.add_job(fetch_kev, 'cron', hour=6, minute=10, id='fetch_kev', next_run_time=soon,
        max_instances=1, coalesce=True, misfire_grace_time=3600,
        replace_existing=True)
    scheduler.add_job(fetch_epss, 'cron', hour=6, minute=40, id='fetch_epss', next_run_time=soon + timedelta(minutes=2),
        max_instances=1, coalesce=True, misfire_grace_time=3600,
        replace_existing=True)
    scheduler.add_job(fetch_ransomware_data, 'interval', minutes=30, id='fetch_ransomware_data',
        max_instances=1,
        replace_existing=True)
    scheduler.add_job(fetch_ransomlook_data, 'interval', minutes=30, id='fetch_ransomlook_data',
        max_instances=1,
        replace_existing=True)
    # Every night: what is older than the retention goes (CYBER_WATCH_CVE_RETENTION_DAYS, CYBER_WATCH_VICTIM_RETENTION_DAYS)
    scheduler.add_job(cleanup_old_data, 'cron', hour=3, minute=30, id='cyber_watch_cleanup',
        max_instances=1, coalesce=True, misfire_grace_time=3600,
        replace_existing=True)
    scheduler.start()


def _match_keyword_against_fields(keyword, exceptions, fields):
    """
    Check if a keyword matches any field value, considering exceptions.

    :param keyword: Keyword to search for (case-insensitive).
    :param exceptions: List of exception keywords that cancel a match.
    :param fields: Dictionary of {field_name: field_value} to search in.
    :return: True if keyword matches and no exception matches.
    :rtype: bool
    """
    for exc in exceptions:
        for val in fields.values():
            if val and exc.lower() in val.lower():
                return False

    for val in fields.values():
        if val and keyword.lower() in val.lower():
            return True

    return False


def _record_hit(rule, kind, object_id, keywords, display):
    """
    The hit of a rule on an object: one for all the keywords of the rule that matched it (a keyword that matches later is
    added to it). Returns (hit, created): only a new hit is news.
    """
    hit, created = WatchRuleHit.objects.get_or_create(
        rule=rule, hit_type=kind, object_id=object_id,
        defaults={'hit_display': display, 'hit_at': timezone.now(), 'matched_keywords': list(keywords)},
    )
    if not created:
        added = [k for k in keywords if k not in hit.matched_keywords]
        if added:
            hit.matched_keywords = hit.matched_keywords + added
            hit.save(update_fields=['matched_keywords'])
    return hit, created


def _check_watch_rules_for_cve(cve):
    """
    Check a CVE alert against active WatchRules and record matching hits.

    :param cve: CVEAlert object to check.
    :return: None
    """
    try:
        rules = WatchRule.objects.filter(is_active=True, scope__in=['cve', 'both'])
        
        fields = {
            'cve_id': cve.cve_id,
            'description': cve.description,
            'severity': cve.severity,
        }

        for rule in rules:
            matched = [k for k in rule.keywords if k and _match_keyword_against_fields(k, rule.exceptions, fields)]
            if not matched:
                continue
            hit, created = _record_hit(rule, 'cve', cve.cve_id, matched, f"{cve.cve_id} - {cve.description[:300]}")
            if created:
                try:
                    send_cyber_watch_notifications({
                        'notification_type': 'cve_hit',
                        'rule_name': rule.name,
                        'cve_id': cve.cve_id,
                        'keyword': ', '.join(matched),
                        'severity': cve.severity or 'N/A',
                    })
                except Exception as e:
                    logger.error(f"CVE hit notification error: {e}")
    except Exception as e:
        logger.error(f"Error checking watch rules for CVE: {e}")


def _check_watch_rules_for_victim(victim):
    """
    Check a ransomware victim against active WatchRules and record matching hits.

    :param victim: RansomwareVictim object to check.
    :return: None
    """
    try:
        rules = WatchRule.objects.filter(is_active=True, scope__in=['ransomware', 'both'])

        fields = {
            'victim_name': victim.victim_name,
            'country': victim.country,
            'sector': victim.sector,
            'group_name': victim.group.name if victim.group_id else '',
        }

        obj_id = (f"{victim.group.name}::{victim.victim_name}" 
                  if victim.group_id else victim.victim_name)

        for rule in rules:
            matched = [k for k in rule.keywords if k and _match_keyword_against_fields(k, rule.exceptions, fields)]
            if not matched:
                continue
            hit, created = _record_hit(rule, 'ransomware_victim', obj_id[:500], matched,
                                       f"{victim.victim_name} ({fields['group_name']}) - {victim.country}")
            if created:
                try:
                    send_cyber_watch_notifications({
                        'notification_type': 'victim_hit',
                        'rule_name': rule.name,
                        'victim_name': victim.victim_name,
                        'group_name': fields['group_name'],
                        'keyword': ', '.join(matched),
                        'sector': victim.sector or 'N/A',
                        'country': victim.country or 'N/A',
                    })
                except Exception as e:
                    logger.error(f"Victim hit notification error: {e}")
    except Exception as e:
        logger.error(f"Error checking watch rules for ransomware victim: {e}")


@job_log.logged_job("Fetch latest CVEs", logger)
def fetch_latest_cves():
    """
    Fetch latest CVEs from cve.circl.lu API and store new ones in database.
    Automatically matches against active WatchRules and records hits.

    :return: None
    """
    try:
        close_old_connections()
        logger.info("CRON TASK : Fetch latest CVEs from cve.circl.lu")

        resp = requests.get(get_cyberwatch_cve_config()['cve_api_url'], timeout=15)
        resp.raise_for_status()
        data = resp.json()

        def normalize_severity(raw, fallback=''):
            if isinstance(raw, str):
                return raw.upper()
            if isinstance(raw, list):
                for value in raw:
                    if isinstance(value, str) and value.strip():
                        return value.upper()
                    if isinstance(value, dict):
                        candidate = (
                            value.get('severity')
                            or value.get('baseSeverity')
                            or value.get('score')
                            or value.get('value')
                            or ''
                        )
                        if isinstance(candidate, str) and candidate.strip():
                            return candidate.upper()
                return fallback.upper() if isinstance(fallback, str) else ''
            if isinstance(raw, dict):
                candidate = (
                    raw.get('severity')
                    or raw.get('baseSeverity')
                    or raw.get('score')
                    or raw.get('value')
                    or ''
                )
                if isinstance(candidate, str) and candidate.strip():
                    return candidate.upper()
                return fallback.upper() if isinstance(fallback, str) else ''
            return fallback.upper() if isinstance(fallback, str) else ''

        def normalize_severity_label(raw):
            value = normalize_severity(raw)
            if value.startswith('CVSS:'):
                return ''
            if value in {'MODERATE'}:
                return 'MEDIUM'
            return value

        new_count = 0
        for item in data:
            cve_id = cve_id_of(item)
            if not cve_id:
                continue

            cna_descriptions = (((item.get('containers') or {}).get('cna') or {}).get('descriptions') or [])
            description = (
                item.get('title', '')
                or item.get('summary', '')
                or item.get('details', '')
                or ((item.get('descriptions') or [{}])[0].get('value', '') if item.get('descriptions') else '')
                or (cna_descriptions[0].get('value', '') if cna_descriptions else '')
            )

            published_raw = (
                item.get('Published')
                or item.get('published')
                or item.get('cveMetadata', {}).get('datePublished')
                or ((item.get('database_specific') or {}).get('nvd_published_at'))
            )
            published = None
            if published_raw:
                try:
                    dt = parse_datetime(str(published_raw))
                    if dt is not None:
                        # Strip timezone info to make it naive
                        published = dt.replace(tzinfo=None)
                except Exception:
                    published = None

            # The score is searched wherever the source keeps it (see cvss.py); a label the source gives alone still counts
            score, label = best_cvss(item)
            severity = label or normalize_severity_label(
                item.get('severity', ''),
            ) or normalize_severity_label((item.get('database_specific') or {}).get('severity', ''))

            # What the source does not give this time is not erased: a CVE is often scored days after it is published
            defaults = {'references': item.get('references', []), 'fetched_at': timezone.now()}
            for field, value in (('description', description), ('cvss_score', score), ('severity', severity), ('published', published)):
                if value not in (None, ''):
                    defaults[field] = value

            obj, created = CVEAlert.objects.update_or_create(cve_id=cve_id, defaults=defaults)
            if created:
                new_count += 1
                try:
                    send_cyber_watch_notifications({
                        'notification_type': 'new_cve',
                        'cve_id': obj.cve_id,
                        'severity': obj.severity or 'N/A',
                        'cvss_score': obj.cvss_score or 'N/A',
                        'description': (obj.description or '')[:300],
                    })
                except Exception as e:
                    logger.error(f"New CVE notification error: {e}")

            # Check if this CVE matches any active watch rules
            _check_watch_rules_for_cve(obj)

        logger.info(f"CVE fetch complete - {new_count} new CVEs added")
        job_log.job_count("new_cves", new_count)
        job_log.job_count("scored_cves", enrich_unscored())

    except requests.exceptions.RequestException as e:
        logger.error(f"CVE API request error: {e}")
    except Exception as e:
        logger.error(f"CVE fetch error: {e}")


_EMBEDDED_CVE = re.compile(r'CVE-\d{4}-\d{4,}', re.I)


def cve_id_of(item):
    """
    The identifier an advisory is kept under. The CVE it is about when there is one: its own id, an alias, or one written in
    its id (Debian's "DEBIAN-CVE-2026-1234" is the CVE 2026-1234, seen by Debian, which must not be counted twice). Otherwise
    its own id (OSV-, PYSEC-, GHSA-…): an advisory that is not a CVE.
    """
    raw_id = item.get('id', '') or (item.get('cveMetadata') or {}).get('cveId', '')
    if isinstance(raw_id, str) and raw_id.upper().startswith('CVE-'):
        return raw_id.upper()
    for alias in item.get('aliases') or []:
        if isinstance(alias, str) and alias.upper().startswith('CVE-'):
            return alias.upper()
    embedded = _EMBEDDED_CVE.search(raw_id) if isinstance(raw_id, str) else None
    return embedded.group(0).upper() if embedded else raw_id


ENRICH_PER_CYCLE = 10


def cve_lookup_url(cve_id):
    """The address of one CVE on the source of the latest ones (`.../api/last` -> `.../api/vulnerability/<id>`), else None."""
    base = get_cyberwatch_cve_config()['cve_api_url'].rstrip('/')
    if not base.endswith('/last'):
        return None
    return f"{base[:-len('/last')]}/vulnerability/{cve_id}"


RETRY_AFTER_DEFAULT = 30
RETRY_AFTER_MAX = 120


def enrich_batch(limit=ENRICH_PER_CYCLE):
    """
    A CVE is often published before it is scored, and the list of the latest ones does not come back to it. Ask the source
    again for a few of the ones still without a score, the longest unasked first, and keep what it now says (the score, the
    severity, the date, the description). The source is a public service that limits its requests: when it answers "too many"
    (429) the pass stops, the CVE is left for the next pass, and the time it asks to wait is given back.

    :return: (CVEs scored, seconds the source asked to wait before the next request, 0 when it did not)
    """
    scored = 0
    for cve in CVEAlert.objects.filter(cvss_score__isnull=True).order_by('fetched_at')[:limit]:
        url = cve_lookup_url(cve.cve_id)
        # Asked now, whatever the answer: the next ones get their turn
        changes = {'fetched_at': timezone.now()}
        try:
            response = requests.get(url, timeout=10) if url else None
            if response is not None and response.status_code == 429:
                try:
                    wait = int(response.headers.get('Retry-After', RETRY_AFTER_DEFAULT))
                except (TypeError, ValueError):
                    wait = RETRY_AFTER_DEFAULT
                return scored, max(1, min(wait, RETRY_AFTER_MAX))
            item = response.json() if response is not None and response.status_code == 200 else None
            if isinstance(item, dict):
                found = best_cvss(item)
                extra = record_values(item)
                if found[0] is not None:
                    changes['cvss_score'] = found[0]
                if found[1]:
                    changes['severity'] = found[1]
                if extra['published'] and not cve.published:
                    changes['published'] = extra['published']
                if extra['description'] and not cve.description:
                    changes['description'] = extra['description']
        except (requests.exceptions.RequestException, ValueError):
            pass
        CVEAlert.objects.filter(pk=cve.pk).update(**changes)
        if 'cvss_score' in changes:
            scored += 1
            _check_watch_rules_for_cve(CVEAlert.objects.get(pk=cve.pk))  # the severity may now match a rule
    return scored, 0


def enrich_unscored(limit=ENRICH_PER_CYCLE):
    """One pass of enrich_batch: the number of CVEs that got a score (a limit of the source only ends the pass early)."""
    return enrich_batch(limit)[0]


KEV_NEWS_DAYS = 14  # a CVE added to the catalogue longer ago is history, not news
KEV_NEWS_MAX = 20  # notifications of one pass


def exploited_content(cve):
    """What the notification "CVE exploited in the wild" says: the figures the CVE has, 'N/A' for the ones it has not."""
    if cve.epss is None:
        epss = 'N/A'
    else:
        epss = f"{cve.epss * 100:.1f} %" if cve.epss < 0.1 else f"{round(cve.epss * 100)} %"
    return {
        'notification_type': 'cve_exploited',
        'cve_id': cve.cve_id,
        'severity': cve.severity or 'N/A',
        'cvss_score': cve.cvss_score if cve.cvss_score is not None else 'N/A',
        'epss': epss,
        'fix_by': str(cve.kev_due) if cve.kev_due else 'N/A',
        'ransomware': 'Known to be used by ransomware groups' if cve.kev_ransomware else 'N/A',
        'description': (cve.description or '')[:300],
    }


def _date(value):
    """A "YYYY-MM-DD" date, or None."""
    try:
        return datetime.strptime(str(value)[:10], '%Y-%m-%d').date()
    except ValueError:
        return None


@job_log.logged_job("Fetch CISA known exploited vulnerabilities", logger)
def fetch_kev():
    """
    CISA's catalogue of the vulnerabilities exploited in the wild: flag the CVEs of Watcher that are in it, with the date they
    were added, the date they must be fixed by and whether ransomware groups use them. A CVE that left the catalogue is
    unflagged. A CVE seen in the feeds later is flagged at the next pass (once a day).
    """
    close_old_connections()
    url = get_cyberwatch_cve_config().get('kev_url')
    if not url:
        return  # switched off
    try:
        response = requests.get(url, timeout=30)
        response.raise_for_status()
        catalogue = response.json().get('vulnerabilities') or []
    except (requests.exceptions.RequestException, ValueError, AttributeError) as exc:
        logger.error(f"CISA KEV catalogue error: {exc}")
        return
    entries = {
        str(row['cveID']).upper(): row for row in catalogue if isinstance(row, dict) and row.get('cveID')
    }
    flagged = 0
    news = []
    for cve in CVEAlert.objects.filter(cve_id__in=entries):
        row = entries[cve.cve_id.upper()]
        values = {
            'exploited': True,
            'kev_added': _date(row.get('dateAdded')),
            'kev_due': _date(row.get('dueDate')),
            'kev_ransomware': str(row.get('knownRansomwareCampaignUse', '')).lower() == 'known',
        }
        if not cve.exploited:
            flagged += 1
            # Only what CISA added lately is news: a first pass on a fresh install flags years of history without a word
            if values['kev_added'] and values['kev_added'] >= timezone.now().date() - timedelta(days=KEV_NEWS_DAYS):
                news.append(cve.pk)
        if any(getattr(cve, field) != value for field, value in values.items()):
            CVEAlert.objects.filter(pk=cve.pk).update(**values)
    CVEAlert.objects.filter(exploited=True).exclude(cve_id__in=entries).update(
        exploited=False, kev_added=None, kev_due=None, kev_ransomware=False)
    logger.info(f"CISA KEV: {len(entries)} exploited vulnerabilities in the catalogue, {flagged} newly flagged")
    job_log.job_count("catalogue", len(entries))
    job_log.job_count("newly_exploited", flagged)
    for cve in CVEAlert.objects.filter(pk__in=news[:KEV_NEWS_MAX]):
        try:
            send_cyber_watch_notifications(exploited_content(cve))
        except Exception as exc:
            logger.error(f"Exploited CVE notification error: {exc}")
    if len(news) > KEV_NEWS_MAX:
        logger.warning(f"CISA KEV: {len(news)} CVEs newly exploited, {KEV_NEWS_MAX} notified")


EPSS_BATCH = 100


@job_log.logged_job("Fetch EPSS scores", logger)
def fetch_epss():
    """
    The EPSS score of FIRST.org of every CVE (not the other advisories): the probability that it is exploited in the next 30
    days, and its percentile. One request per EPSS_BATCH CVEs. The service limits its requests: on an answer of "too many" the
    pass stops, the next day's pass goes on.
    """
    close_old_connections()
    url = get_cyberwatch_cve_config().get('epss_url')
    if not url:
        return  # switched off
    ids = list(CVEAlert.objects.filter(cve_id__startswith='CVE-', is_archived=False).values_list('cve_id', flat=True))
    updated = 0
    for start in range(0, len(ids), EPSS_BATCH):
        batch = ids[start:start + EPSS_BATCH]
        try:
            response = requests.get(url, params={'cve': ','.join(batch)}, timeout=30)
            if response.status_code == 429:
                logger.warning("EPSS: the service asks to slow down, the pass stops here")
                break
            response.raise_for_status()
            rows = response.json().get('data') or []
        except (requests.exceptions.RequestException, ValueError, AttributeError) as exc:
            logger.error(f"EPSS error: {exc}")
            break
        for row in rows:
            try:
                epss, percentile = float(row['epss']), float(row['percentile'])
            except (KeyError, TypeError, ValueError):
                continue
            if 0 <= epss <= 1 and 0 <= percentile <= 1:
                updated += CVEAlert.objects.filter(cve_id=str(row.get('cve', '')).upper()).update(epss=epss, epss_percentile=percentile)
    logger.info(f"EPSS: {updated} CVEs scored out of {len(ids)}")
    job_log.job_count("epss_scores", updated)


@job_log.logged_job("Fetch ransomware.live groups and victims", logger)
def fetch_ransomware_data():
    """
    Fetch ransomware groups and recent victims from ransomware.live API.
    Automatically matches against active WatchRules and records hits.

    :return: None
    """
    close_old_connections()
    logger.info("CRON TASK : Fetch ransomware groups and victims from ransomware.live")
    
    try:
        resp = requests.get(get_ransomware_live_config()['groups_url'], timeout=20)
        resp.raise_for_status()
        
        group_count = 0
        for g in resp.json():
            name = g.get('name', '').strip()
            if not name:
                continue

            # Store or update ransomware group
            _, created = RansomwareGroup.objects.update_or_create(
                name=name,
                defaults={
                    'description': g.get('description') or '',
                    'source': 'ransomware.live',
                    'fetched_at': timezone.now(),
                }
            )
            if created:
                group_count += 1

        logger.info(f"Ransomware groups fetch complete - {group_count} new groups")
        job_log.job_count("new_groups", group_count)

    except requests.exceptions.RequestException as e:
        logger.error(f"Ransomware groups API request error: {e}")
    except Exception as e:
        logger.error(f"Ransomware groups fetch error: {e}")

    try:
        resp = requests.get(get_ransomware_live_config()['victims_url'], timeout=20)
        resp.raise_for_status()

        new_count = 0
        for v in resp.json():
            group_name = (v.get('group_name', '') or v.get('group', '')).strip()
            if not group_name:
                continue

            group, _ = RansomwareGroup.objects.get_or_create(
                name=group_name,
                defaults={'source': 'ransomware.live', 'fetched_at': timezone.now()}
            )

            victim_name = (v.get('victim', '') or v.get('post_title', '')).strip()
            if not victim_name:
                continue

            attacked_raw = v.get('published') or v.get('discovered')
            attacked_at = None
            if attacked_raw:
                try:
                    dt = parse_datetime(str(attacked_raw))
                    if dt is not None:
                        attacked_at = dt.replace(tzinfo=None)
                except Exception:
                    attacked_at = None

            victim, created = RansomwareVictim.objects.update_or_create(
                group=group,
                victim_name=victim_name,
                attacked_at=attacked_at,
                defaults={
                    'country': v.get('country') or '',
                    'sector': v.get('activity') or v.get('sector') or '',
                    'url': v.get('url', ''),
                    'fetched_at': timezone.now(),
                }
            )

            if created:
                new_count += 1
                
                _check_watch_rules_for_victim(victim)

                try:
                    send_cyber_watch_notifications({
                        'notification_type': 'new_victim',
                        'victim_name': victim.victim_name,
                        'group_name': group_name,
                        'country': victim.country or 'N/A',
                        'sector': victim.sector or 'N/A',
                    })
                except Exception as e:
                    logger.error(f"New victim notification error: {e}")

        logger.info(f"Ransomware victims fetch complete - {new_count} new victims")
        job_log.job_count("new_victims", new_count)

    except requests.exceptions.RequestException as e:
        logger.error(f"Ransomware victims API request error: {e}")
    except Exception as e:
        logger.error(f"Ransomware victims fetch error: {e}")


@job_log.logged_job("Fetch ransomlook.io groups, victims and actors", logger)
def fetch_ransomlook_data():
    """
    Fetch ransomware data from RansomLook API.
    Includes groups, recent victims, and threat actors.
    Automatically matches against active WatchRules and records hits.

    :return: None
    """
    close_old_connections()
    logger.info("CRON TASK : Fetch ransomware data from ransomlook.io")

    try:
        resp = requests.get(get_ransomlook_config()['groups_url'], timeout=20)
        resp.raise_for_status()

        group_count = 0
        data = resp.json()

        if isinstance(data, dict):
            items = [{'name': k, **(v if isinstance(v, dict) else {})} for k, v in data.items()]
        else:
            items = data

        for g in items:
            # Handle both string items and dict items
            if isinstance(g, str):
                name = g.strip()
            else:
                name = (g.get('name') or '').strip()
            if not name:
                continue

            # Store or update ransomware group with RansomLook as source
            _, created = RansomwareGroup.objects.update_or_create(
                name=name,
                defaults={
                    'description': (g.get('description') or g.get('profile') or '') if isinstance(g, dict) else '',
                    'source': 'ransomlook.io',
                    'first_seen': (g.get('first_seen') or None) if isinstance(g, dict) else None,
                    'fetched_at': timezone.now(),
                }
            )
            if created:
                group_count += 1

        logger.info(f"RansomLook groups fetch complete - {group_count} new groups")
        job_log.job_count("new_groups", group_count)

    except requests.exceptions.RequestException as e:
        logger.error(f"RansomLook groups API request error: {e}")
    except Exception as e:
        logger.error(f"RansomLook groups fetch error: {e}")

    try:
        resp = requests.get(get_ransomlook_config()['recent_url'], timeout=20)
        resp.raise_for_status()

        victim_count = 0
        for v in resp.json():
            group_name = (v.get('group', '') or v.get('actor', '')).strip()
            if not group_name:
                continue

            group, _ = RansomwareGroup.objects.get_or_create(
                name=group_name,
                defaults={'source': 'ransomlook.io', 'fetched_at': timezone.now()}
            )

            victim_name = (v.get('name', '') or v.get('organization', '')).strip()
            if not victim_name:
                continue

            attacked_raw = v.get('post_date') or v.get('discovered') or v.get('date_added')
            attacked_at = None
            if attacked_raw:
                try:
                    dt = parse_datetime(str(attacked_raw))
                    if dt is not None:
                        attacked_at = dt.replace(tzinfo=None)
                except Exception:
                    attacked_at = None

            victim, created = RansomwareVictim.objects.update_or_create(
                group=group,
                victim_name=victim_name,
                attacked_at=attacked_at,
                defaults={
                    'country': v.get('country') or '',
                    'sector': v.get('industry') or v.get('sector') or '',
                    'url': v.get('url', ''),
                    'fetched_at': timezone.now(),
                }
            )

            if created:
                victim_count += 1

                _check_watch_rules_for_victim(victim)

                try:
                    send_cyber_watch_notifications({
                        'notification_type': 'new_victim',
                        'victim_name': victim.victim_name,
                        'group_name': group_name,
                        'country': victim.country or 'N/A',
                        'sector': victim.sector or 'N/A',
                    })
                except Exception as e:
                    logger.error(f"New victim notification error: {e}")

        logger.info(f"RansomLook victims fetch complete - {victim_count} new victims")
        job_log.job_count("new_victims", victim_count)

    except requests.exceptions.RequestException as e:
        logger.error(f"RansomLook victims API request error: {e}")
    except Exception as e:
        logger.error(f"RansomLook victims fetch error: {e}")

    try:
        resp = requests.get(get_ransomlook_config()['actors_url'], timeout=20)
        resp.raise_for_status()

        actor_count = 0
        for actor in resp.json():
            # RansomLook actors often map to groups
            actor_name = actor.get('name', '').strip()
            if not actor_name:
                continue

            # Store as a ransomware group if not already present
            _, created = RansomwareGroup.objects.get_or_create(
                name=actor_name,
                defaults={
                    'description': actor.get('description', f'Threat actor: {actor_name}'),
                    'source': 'ransomlook.io (actors)',
                    'fetched_at': timezone.now(),
                }
            )
            if created:
                actor_count += 1

        logger.info(f"RansomLook actors fetch complete - {actor_count} new actors")
        job_log.job_count("new_actors", actor_count)

    except requests.exceptions.RequestException as e:
        logger.error(f"RansomLook actors API request error: {e}")
    except Exception as e:
        logger.error(f"RansomLook actors fetch error: {e}")


def send_cyber_watch_notifications(content):
    """
    Send CyberWatch notifications via Slack, Citadel, TheHive and/or Email.
    Slack, Citadel and TheHive follow the instance settings (Connectors > Notifications); the email goes to the
    subscribers who ticked E-mail and asked for this kind of notification.
    """
    notification_type = content.get('notification_type', '')

    subscribers = Subscriber.objects.all()

    # Filter by subscription preference
    if notification_type == 'new_cve':
        subscribers = subscribers.filter(notify_all_cves=True)
    elif notification_type == 'cve_hit':
        subscribers = subscribers.filter(notify_cve_hits=True)
    elif notification_type == 'cve_exploited':
        subscribers = subscribers.filter(notify_exploited_cves=True)
    elif notification_type == 'new_victim':
        subscribers = subscribers.filter(notify_all_victims=True)
    elif notification_type == 'victim_hit':
        subscribers = subscribers.filter(notify_victim_hits=True)

    send_app_specific_notifications('cyber_watch', content, subscribers)


# Watch rules against the data already collected: preview of a rule, recording its hits on demand, and the CVE / victim
# each hit points at. Matching is the one of the fetch jobs (`_match_keyword_against_fields`).
SAMPLE_SIZE = 5


def victim_key(victim):
    """`WatchRuleHit.object_id` of a victim, as written by `_check_watch_rules_for_victim`."""
    return (f"{victim.group.name}::{victim.victim_name}" if victim.group_id else victim.victim_name)[:500]


def _cve_fields(cve):
    return {'cve_id': cve.cve_id, 'description': cve.description, 'severity': cve.severity}


def _victim_fields(victim):
    return {
        'victim_name': victim.victim_name, 'country': victim.country, 'sector': victim.sector,
        'group_name': victim.group.name if victim.group_id else '',
    }


def _first_match(keywords, exceptions, fields):
    for keyword in keywords:
        if keyword and _match_keyword_against_fields(keyword, exceptions, fields):
            return keyword
    return None


def _candidates(scope):
    """Active (not archived) CVEs and victims the scope covers."""
    cves = CVEAlert.objects.filter(is_archived=False).order_by('-published') if scope in ('cve', 'both') else CVEAlert.objects.none()
    victims = (RansomwareVictim.objects.filter(is_archived=False).select_related('group').order_by('-attacked_at')
               if scope in ('ransomware', 'both') else RansomwareVictim.objects.none())
    return cves, victims


def match_rule(keywords, exceptions, scope):
    """What a rule would match in the active CVEs and victims: counts and the latest few of each."""
    cves, victims = _candidates(scope)
    cve_matches, victim_matches = [], []
    for cve in cves:
        keyword = _first_match(keywords, exceptions, _cve_fields(cve))
        if keyword:
            cve_matches.append({'id': cve.id, 'label': cve.cve_id, 'detail': cve.description[:160], 'keyword': keyword,
                                'severity': cve.severity, 'date': cve.published})
    for victim in victims:
        keyword = _first_match(keywords, exceptions, _victim_fields(victim))
        if keyword:
            victim_matches.append({'id': victim.id, 'label': victim.victim_name, 'detail': victim.group.name,
                                   'keyword': keyword, 'country': victim.country, 'date': victim.attacked_at})
    return {
        'cves': len(cve_matches), 'victims': len(victim_matches),
        'cveSamples': cve_matches[:SAMPLE_SIZE], 'victimSamples': victim_matches[:SAMPLE_SIZE],
    }


def record_rule_hits(rule):
    """
    Record the hits of `rule` on the active CVEs and victims already collected (the fetch jobs only check new
    ones). No notification is sent: these are not new events. Returns the number of new hits.
    """
    cves, victims = _candidates(rule.scope)
    created = 0
    for kind, rows, fields, key, display in (
        ('cve', cves, _cve_fields, lambda c: c.cve_id, lambda c: f"{c.cve_id} - {c.description[:300]}"),
        ('ransomware_victim', victims, _victim_fields, victim_key,
         lambda v: f"{v.victim_name} ({v.group.name if v.group_id else ''}) - {v.country}"),
    ):
        for row in rows:
            matched = [k for k in rule.keywords if k and _first_match([k], rule.exceptions, fields(row))]
            if matched:
                _, new = _record_hit(rule, kind, key(row), matched, display(row))
                created += new
    return created


def hit_targets(hits):
    """{hit id: the CVE or victim it points at}, in two queries for a page of hits."""
    hits = [h for h in hits if h is not None]
    cve_ids = {h.object_id for h in hits if h.hit_type == 'cve'}
    victim_keys = {h.object_id for h in hits if h.hit_type == 'ransomware_victim'}
    cves = {
        c.cve_id: {'kind': 'cve', 'id': c.id, 'cve_id': c.cve_id, 'severity': c.severity, 'cvss_score': c.cvss_score,
                   'published': c.published, 'is_archived': c.is_archived}
        for c in CVEAlert.objects.filter(cve_id__in=cve_ids)
    }
    victims = {}
    if victim_keys:
        pairs = [k.split('::', 1) for k in victim_keys if '::' in k]
        condition = Q(pk__in=[])
        for group, name in pairs:
            condition |= Q(group__name=group, victim_name=name)
        for v in RansomwareVictim.objects.filter(condition).select_related('group').order_by('attacked_at'):
            # The latest attack wins when a victim was posted twice.
            victims[victim_key(v)] = {
                'kind': 'victim', 'id': v.id, 'victim_name': v.victim_name, 'group_id': v.group_id,
                'group_name': v.group.name, 'country': v.country, 'sector': v.sector, 'attacked_at': v.attacked_at,
                'url': v.url, 'is_archived': v.is_archived,
            }
    return {h.id: (cves if h.hit_type == 'cve' else victims).get(h.object_id) for h in hits}


# Retention
# The feeds bring a few hundred CVEs and some victims a day and nothing ever took them out: after a year or two a list
# holds tens of thousands of rows nobody opens. What is older than the retention goes; what still matters stays.
PURGE_BATCH = 1000


def old_cves():
    """
    The CVEs older than CYBER_WATCH_CVE_RETENTION_DAYS (their publication date, or the day they were fetched when they have
    none). Never the ones flagged as exploited in the wild (the CISA catalogue is short and stays useful), nor the ones a
    watch rule matched (the hit points to them).
    """
    days = retention_days('CYBER_WATCH_CVE_RETENTION_DAYS')
    if not days:
        return CVEAlert.objects.none()
    cutoff = timezone.now() - timedelta(days=days)
    matched = list(WatchRuleHit.objects.filter(hit_type='cve').values_list('object_id', flat=True))
    return (CVEAlert.objects.filter(exploited=False)
            .filter(Q(published__lt=cutoff) | Q(published__isnull=True, fetched_at__lt=cutoff))
            .exclude(cve_id__in=matched))


def old_victims():
    """
    The ransomware victims older than CYBER_WATCH_VICTIM_RETENTION_DAYS (the day of the attack, or the day they were fetched),
    but the ones a watch rule matched (a hit points to "group::name").
    """
    days = retention_days('CYBER_WATCH_VICTIM_RETENTION_DAYS')
    if not days:
        return RansomwareVictim.objects.none()
    cutoff = timezone.now() - timedelta(days=days)
    names = {key.split('::', 1)[-1] for key in WatchRuleHit.objects.filter(hit_type='ransomware_victim').values_list('object_id', flat=True)}
    return (RansomwareVictim.objects
            .filter(Q(attacked_at__lt=cutoff) | Q(attacked_at__isnull=True, fetched_at__lt=cutoff))
            .exclude(victim_name__in=names))


def purge_old_data(dry_run=False):
    """
    Take out the old CVEs and victims, PURGE_BATCH at a time (a long delete would hold the table). With `dry_run` nothing is
    deleted: it only counts. Returns {'cves': n, 'victims': n}.
    """
    counts = {}
    for label, queryset in (('cves', old_cves()), ('victims', old_victims())):
        if dry_run:
            counts[label] = queryset.count()
            continue
        deleted = 0
        while True:
            ids = list(queryset.order_by().values_list('pk', flat=True)[:PURGE_BATCH])
            if not ids:
                break
            deleted += queryset.model.objects.filter(pk__in=ids).delete()[0]
        counts[label] = deleted
    return counts


@job_log.logged_job("Cyber Watch cleanup (old CVEs and victims)", logger)
def cleanup_old_data():
    """Scheduled job (every night): the retention of the CVEs and of the ransomware victims."""
    close_old_connections()
    counts = purge_old_data()
    job_log.job_count("cves_removed", counts['cves'])
    job_log.job_count("victims_removed", counts['victims'])
