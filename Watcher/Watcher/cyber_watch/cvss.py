"""
The CVSS score and severity of an advisory, wherever its source put them.

The CVE sources do not agree on where the score is: a CVE record (5.x) keeps it in `containers.cna.metrics` and
`containers.adp[].metrics`, the unified format of the lookup API in `vulnerabilities[].scores[]` or in `severity` (a vector
only), older ones in `cvss`. The score is searched everywhere, and computed from a CVSS 3.x vector when only the vector
is given. A CVE is often published before it is scored: no score is not an error, it is None.
"""
import math
import re
from datetime import datetime

from django.utils.dateparse import parse_datetime

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
