# DNS Finder Refonte — Unified Threats Monitored Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace DNS Finder's 6-panel dashboard (Statistics, DNS Alerts, DNS Monitored, Archived Alerts, Keyword Monitored, Dangling Subdomains) with 3 modules — **DNS Threats Monitored** (merging Alerts + Archived Alerts + Dangling Subdomains into one chronological, per-source-filterable table), **Corporate DNS Assets Monitored**, **Corporate Keywords Monitored** — mirroring the `site_monitoring` ("Suspicious Websites Monitored") UX pattern.

**Architecture:** Three independent detection engines (`check_dnstwist`, `print_callback`'s keyword branch, `evaluate_dangling_subdomain`) keep writing to their existing models (`Alert`+`DnsTwisted`, `DanglingAlert`+`DanglingSubdomain`). A new read-only backend endpoint (`GET /api/dns_finder/threats_monitored/`) merges `Alert` and `DanglingAlert` querysets in Python into a normalized shape, sorts by `created_at` across all three sources, and paginates the merged list — `QuerySet.union()` was considered and rejected because `Alert` and `DanglingAlert` are unrelated tables with incompatible columns, and per-source dynamic filtering (fuzzer / corporate_keyword / provider / cname_target / status) is far simpler expressed as two independently-filtered ORM queries merged and sorted in Python than as a single unioned queryset. A single new frontend component `ThreatsMonitored.js` (styled after `SiteMonitoring/SuspiciousSites.js`) replaces `Alerts.js` + `ArchivedAlerts.js` + `DanglingSubdomains.js`.

**Tech Stack:** Django 6 / DRF (`rest_framework.views.APIView`, `PageNumberPagination` over a plain Python list), React 18 class components + Redux + `react-bootstrap`, existing `TableManager` / `PanelGrid` / `ExportModal` / `DateWithTooltip` / `TimelineModal` common components (no changes to `TableManager`/`PanelGrid` — all per-source filter logic lives in `Dashboard.js`/`ThreatsMonitored.js`).

**Spec:** `prompt_refonte_dns_finder.md` (repo root) — this plan implements it in full; read both together.

## Global Constraints

- Migrations: use `apps.get_model()` inside every `RunPython`, never a direct model import (spec §Contraintes, repo convention).
- The `Alert.source` backfill must be bulk `.filter().update()` calls, never a Python row-by-row loop (spec §1.1).
- Do not modify `common/misp.py::create_objects()`'s existing `Site`/`LegitimateDomain` branches or their output — the subdomain-takeover MISP path is additive only (spec §Contraintes).
- Reuse `TableManager`, `PanelGrid`, `DateWithTooltip`, `ExportModal`, `LAYOUT_PRESETS` as-is or via small additive changes; never fork/duplicate them.
- **Never `git push` or open a PR without explicit prior authorization.** Local commits are fine; nothing goes to the remote without a separate go-ahead (spec §Contraintes, repeated twice deliberately).
- Backend app under test: `Watcher/Watcher/dns_finder/` and `Watcher/Watcher/common/`; run tests with `python manage.py test dns_finder` / `python manage.py test common` from `Watcher/Watcher/`.
- Frontend lives under `Watcher/Watcher/frontend/src/`; there is no separate dev server — webpack bundles into Django static files (see repo CLAUDE.md).

---

## Task 1: `Alert.source` field — persist detection source, fix the existing no-op bug

**Files:**
- Modify: `Watcher/Watcher/dns_finder/models.py` (`Alert` class, currently lines 61-70)
- Create: `Watcher/Watcher/dns_finder/migrations/0011_alert_source.py`
- Modify: `Watcher/Watcher/dns_finder/core.py` (`print_callback` line ~360, `check_dnstwist` line ~446)
- Test: `Watcher/Watcher/dns_finder/tests.py`

**Context:** `core.py` currently does `alert = Alert.objects.create(dns_twisted=dns_twisted); alert.source = 'check_dnstwist'; alert.save()` — `source` isn't a field on `Alert` today, so this assignment sets a throwaway Python attribute and `.save()` persists nothing. `send_dns_finder_notifications` already does `source = alert.source if hasattr(alert, 'source') else None`, so once the field is real this starts working for free.

**Interfaces:**
- Produces: `Alert.SOURCE_DNSTWIST = 'dnstwist'`, `Alert.SOURCE_CERTSTREAM_KEYWORD = 'certstream_keyword'`, `Alert.source` field (`CharField`, one of the two values, default `SOURCE_CERTSTREAM_KEYWORD`). Task 5 reads `alert.source` directly.

- [ ] **Step 1: Write the failing test**

Add to `Watcher/Watcher/dns_finder/tests.py`, inside `class CoreTest(TestCase):`:

```python
    def test_check_dnstwist_persists_source(self):
        """check_dnstwist must persist Alert.source, not just set-then-discard it."""
        from dns_finder.core import check_dnstwist
        from dns_finder.models import Alert

        dns = DnsMonitored.objects.create(domain_name="source-dnstwist-test.com")

        fake_dnstwist_output = (
            '[{"domain": "tw1sted-source-test.com", "fuzzer": "homoglyph", '
            '"dns_a": ["1.2.3.4"]}]'
        )
        with patch('dns_finder.core.subprocess.check_output') as mock_subprocess, \
             patch('dns_finder.core.open', create=True) as mock_open:
            mock_subprocess.return_value = b''
            mock_open.return_value.__enter__.return_value.read.return_value = fake_dnstwist_output
            check_dnstwist(dns)

        alert = Alert.objects.get(dns_twisted__domain_name="tw1sted-source-test.com")
        self.assertEqual(alert.source, Alert.SOURCE_DNSTWIST)

    def test_print_callback_persists_source(self):
        """print_callback's keyword branch must persist Alert.source."""
        from dns_finder.core import print_callback
        from dns_finder.models import Alert

        KeywordMonitored.objects.create(name="source-keyword-test")
        message = {'data': {'leaf_cert': {'subject': {'CN': 'source-keyword-test-evil.com'}}}}

        print_callback(message, None)

        alert = Alert.objects.get(dns_twisted__domain_name="source-keyword-test-evil.com")
        self.assertEqual(alert.source, Alert.SOURCE_CERTSTREAM_KEYWORD)
```

- [ ] **Step 2: Run tests to verify they fail**

Run (from `Watcher/Watcher/`): `python manage.py test dns_finder.tests.CoreTest.test_check_dnstwist_persists_source dns_finder.tests.CoreTest.test_print_callback_persists_source -v 2`
Expected: FAIL — `AttributeError: 'Alert' object has no attribute 'source'` (field doesn't exist yet).

- [ ] **Step 3: Add the field to the model**

In `Watcher/Watcher/dns_finder/models.py`, replace the `Alert` class:

```python
class Alert(models.Model):
    """
    Triggered when there is a new twisted dns.
    """
    SOURCE_DNSTWIST = 'dnstwist'
    SOURCE_CERTSTREAM_KEYWORD = 'certstream_keyword'
    SOURCE_CHOICES = [
        (SOURCE_DNSTWIST, 'Dnstwist Algorithm'),
        (SOURCE_CERTSTREAM_KEYWORD, 'Certificate Transparency Stream'),
    ]

    dns_twisted = models.ForeignKey(DnsTwisted, on_delete=models.CASCADE)
    status = models.BooleanField(default=True)
    created_at = models.DateTimeField(default=timezone.now)
    source = models.CharField(max_length=30, choices=SOURCE_CHOICES, default=SOURCE_CERTSTREAM_KEYWORD)

    class Meta:
        ordering = ["-created_at"]
```

- [ ] **Step 4: Write the migration with bulk backfill**

Create `Watcher/Watcher/dns_finder/migrations/0011_alert_source.py`:

```python
from django.db import migrations, models


def backfill_alert_source(apps, schema_editor):
    """
    Heuristic backfill for pre-existing rows: a populated DnsTwisted.fuzzer
    can only come from the dnstwist engine (print_callback never sets it),
    so anything with a fuzzer is 'dnstwist' and everything else is
    'certstream_keyword'. Two bulk UPDATEs, no per-row Python loop.
    """
    Alert = apps.get_model('dns_finder', 'Alert')
    Alert.objects.filter(dns_twisted__fuzzer__isnull=False).exclude(
        dns_twisted__fuzzer=''
    ).update(source='dnstwist')
    Alert.objects.filter(
        models.Q(dns_twisted__fuzzer__isnull=True) | models.Q(dns_twisted__fuzzer='')
    ).update(source='certstream_keyword')


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('dns_finder', '0010_danglingsubdomain_danglingalert'),
    ]

    operations = [
        migrations.AddField(
            model_name='alert',
            name='source',
            field=models.CharField(
                choices=[('dnstwist', 'Dnstwist Algorithm'), ('certstream_keyword', 'Certificate Transparency Stream')],
                default='certstream_keyword',
                max_length=30,
            ),
        ),
        migrations.RunPython(backfill_alert_source, noop_reverse),
    ]
```

- [ ] **Step 5: Fix the two creation call sites in `core.py`**

In `check_dnstwist` (around line 443-449), replace:

```python
                        if not DnsTwisted.objects.filter(domain_name=twisted_website_dict['domain']):
                            dns_twisted = DnsTwisted.objects.create(domain_name=twisted_website_dict['domain'],
                                                                    dns_monitored=dns_monitored,
                                                                    fuzzer=twisted_website_dict['fuzzer'])
                            alert = Alert.objects.create(dns_twisted=dns_twisted)
                            alert.source = 'check_dnstwist'
                            alert.save()
                            alerts_list.append(alert)
```

with:

```python
                        if not DnsTwisted.objects.filter(domain_name=twisted_website_dict['domain']):
                            dns_twisted = DnsTwisted.objects.create(domain_name=twisted_website_dict['domain'],
                                                                    dns_monitored=dns_monitored,
                                                                    fuzzer=twisted_website_dict['fuzzer'])
                            alert = Alert.objects.create(dns_twisted=dns_twisted, source=Alert.SOURCE_DNSTWIST)
                            alerts_list.append(alert)
```

In `print_callback` (around line 358-363), replace:

```python
            logger.info(f"Keyword {keyword_monitored.name} detected in: {domain}")
            dns_twisted = DnsTwisted.objects.create(domain_name=domain, keyword_monitored=keyword_monitored)
            alert = Alert.objects.create(dns_twisted=dns_twisted)
            alert.source = 'print_callback'
            alert.save()
            send_dns_finder_notifications(alert)
```

with:

```python
            logger.info(f"Keyword {keyword_monitored.name} detected in: {domain}")
            dns_twisted = DnsTwisted.objects.create(domain_name=domain, keyword_monitored=keyword_monitored)
            alert = Alert.objects.create(dns_twisted=dns_twisted, source=Alert.SOURCE_CERTSTREAM_KEYWORD)
            send_dns_finder_notifications(alert)
```

- [ ] **Step 6: Run migration and tests**

Run: `python manage.py migrate dns_finder` then `python manage.py test dns_finder.tests.CoreTest -v 2`
Expected: PASS, including the two new tests and the pre-existing `test_check_dnstwist`/`test_notification_system`.

- [ ] **Step 7: Commit**

```bash
git add Watcher/Watcher/dns_finder/models.py Watcher/Watcher/dns_finder/migrations/0011_alert_source.py Watcher/Watcher/dns_finder/core.py Watcher/Watcher/dns_finder/tests.py
git commit -m "fix(dns_finder): add persisted source field on Alert + backfill migration"
```

---

## Task 2: `DnsTwisted` certificate metadata columns

**Files:**
- Modify: `Watcher/Watcher/dns_finder/models.py` (`DnsTwisted` class, currently lines 42-58)
- Create: `Watcher/Watcher/dns_finder/migrations/0012_dnstwisted_certificate_metadata.py`
- Test: `Watcher/Watcher/dns_finder/tests.py`

**Interfaces:**
- Produces: `DnsTwisted.issuer`, `.san_list`, `.not_before`, `.not_after`, `.serial_number`, `.fingerprint_sha256` — all nullable/blank. Task 4 populates them for `certstream_keyword` rows; `dnstwist` rows leave them `None`.

- [ ] **Step 1: Write the failing test**

Add to `Watcher/Watcher/dns_finder/tests.py`, inside `class ModelTest(TransactionTestCase):`:

```python
    def test_dns_twisted_certificate_metadata_fields(self):
        """DnsTwisted must accept the new CT certificate metadata columns."""
        unique_id = str(uuid.uuid4())[:8]
        dns = DnsMonitored.objects.create(domain_name=f"cert-meta-test-{unique_id}.com")

        twisted = DnsTwisted.objects.create(
            domain_name=f"cert-meta-evil-{unique_id}.com",
            dns_monitored=dns,
            issuer="Let's Encrypt",
            san_list=[f"cert-meta-evil-{unique_id}.com", f"www.cert-meta-evil-{unique_id}.com"],
            not_before=timezone.now(),
            not_after=timezone.now(),
            serial_number="03:AB:CD",
            fingerprint_sha256="AA:BB:CC",
        )

        twisted.refresh_from_db()
        self.assertEqual(twisted.issuer, "Let's Encrypt")
        self.assertEqual(len(twisted.san_list), 2)
        self.assertIsNotNone(twisted.not_before)
        self.assertEqual(twisted.serial_number, "03:AB:CD")
        self.assertEqual(twisted.fingerprint_sha256, "AA:BB:CC")

        # dnstwist-sourced rows never populate these - all must stay nullable
        twisted_dnstwist = DnsTwisted.objects.create(
            domain_name=f"cert-meta-dnstwist-{unique_id}.com", dns_monitored=dns
        )
        self.assertIsNone(twisted_dnstwist.issuer)
        self.assertIsNone(twisted_dnstwist.san_list)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python manage.py test dns_finder.tests.ModelTest.test_dns_twisted_certificate_metadata_fields -v 2`
Expected: FAIL with `TypeError: 'issuer' is an invalid keyword argument for this function`.

- [ ] **Step 3: Add the fields to the model**

In `Watcher/Watcher/dns_finder/models.py`, in `DnsTwisted`, after the `fuzzer` field:

```python
class DnsTwisted(models.Model):
    """
    Twisted dns: typosquatting, phishing attacks, fraud, and brand impersonation.
    """
    domain_name = models.CharField(max_length=100, unique=True)
    dns_monitored = models.ForeignKey(DnsMonitored, on_delete=models.CASCADE, blank=True, null=True)
    keyword_monitored = models.ForeignKey(KeywordMonitored, on_delete=models.CASCADE, blank=True, null=True)
    fuzzer = models.CharField(max_length=100, blank=True, null=True)
    created_at = models.DateTimeField(default=timezone.now)
    # Populated for certstream_keyword-sourced rows from the CertStream leaf
    # certificate/chain (see core.extract_certificate_metadata); always empty
    # for dnstwist-sourced rows, which have no certificate to read from.
    issuer = models.CharField(max_length=255, blank=True, null=True)
    san_list = models.JSONField(blank=True, null=True)
    not_before = models.DateTimeField(blank=True, null=True)
    not_after = models.DateTimeField(blank=True, null=True)
    serial_number = models.CharField(max_length=100, blank=True, null=True)
    fingerprint_sha256 = models.CharField(max_length=100, blank=True, null=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name = 'Twisted DNS'
        verbose_name_plural = "Twisted DNS"

    def __str__(self):
        return self.domain_name
```

- [ ] **Step 4: Write the migration**

Create `Watcher/Watcher/dns_finder/migrations/0012_dnstwisted_certificate_metadata.py`:

```python
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('dns_finder', '0011_alert_source'),
    ]

    operations = [
        migrations.AddField(
            model_name='dnstwisted', name='issuer',
            field=models.CharField(blank=True, max_length=255, null=True),
        ),
        migrations.AddField(
            model_name='dnstwisted', name='san_list',
            field=models.JSONField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='dnstwisted', name='not_before',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='dnstwisted', name='not_after',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='dnstwisted', name='serial_number',
            field=models.CharField(blank=True, max_length=100, null=True),
        ),
        migrations.AddField(
            model_name='dnstwisted', name='fingerprint_sha256',
            field=models.CharField(blank=True, max_length=100, null=True),
        ),
    ]
```

- [ ] **Step 5: Run migration and test**

Run: `python manage.py migrate dns_finder` then `python manage.py test dns_finder.tests.ModelTest -v 2`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add Watcher/Watcher/dns_finder/models.py Watcher/Watcher/dns_finder/migrations/0012_dnstwisted_certificate_metadata.py Watcher/Watcher/dns_finder/tests.py
git commit -m "feat(dns_finder): add CT certificate metadata columns on DnsTwisted"
```

---

## Task 3: Rename `DanglingAlert.source` → `trigger`

**Files:**
- Modify: `Watcher/Watcher/dns_finder/models.py` (`DanglingAlert` class, currently lines 126-136)
- Create: `Watcher/Watcher/dns_finder/migrations/0013_danglingalert_rename_source_trigger.py`
- Modify: `Watcher/Watcher/dns_finder/core.py` (`evaluate_dangling_subdomain`, line 250)
- Modify: `Watcher/Watcher/dns_finder/admin.py` (`DanglingAlert` admin, lines 146-147)
- Modify: `Watcher/Watcher/dns_finder/tests.py` (every `source=`/`.source` reference to `DanglingAlert`)

**Context:** `source` on `DanglingAlert` currently holds `'certstream'` or `'periodic_recheck'` — a *trigger*, not a detection *source* in the new unified sense (Task 5 fixes the unified feed's `source` to always be the literal `'subdomain_takeover'` for these rows, computed in the API layer, not read from the DB). Renaming frees the name and avoids confusion between the two concepts.

**Interfaces:**
- Produces: `DanglingAlert.trigger` (same values/semantics `source` had: `'certstream'` / `'periodic_recheck'`).
- Consumes: `evaluate_dangling_subdomain(dangling_subdomain, source)`'s `source` parameter name is unchanged (it's the *caller's* vocabulary — `main_certificate_transparency`'s realtime path passes `'certstream'`, `recheck_dangling_subdomains` passes `'periodic_recheck'`); only the model field it's written into changes.

- [ ] **Step 1: Update the model**

In `Watcher/Watcher/dns_finder/models.py`, replace the `DanglingAlert` class:

```python
class DanglingAlert(models.Model):
    """
    Triggered when a DanglingSubdomain transitions into a dangling status.
    """
    dangling_subdomain = models.ForeignKey(DanglingSubdomain, on_delete=models.CASCADE)
    status = models.BooleanField(default=True)
    created_at = models.DateTimeField(default=timezone.now)
    trigger = models.CharField(max_length=50, default='certstream')

    class Meta:
        ordering = ["-created_at"]
```

- [ ] **Step 2: Write the migration**

Create `Watcher/Watcher/dns_finder/migrations/0013_danglingalert_rename_source_trigger.py`:

```python
from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('dns_finder', '0012_dnstwisted_certificate_metadata'),
    ]

    operations = [
        migrations.RenameField(
            model_name='danglingalert',
            old_name='source',
            new_name='trigger',
        ),
    ]
```

- [ ] **Step 3: Fix the write site in `core.py`**

In `evaluate_dangling_subdomain` (line ~250), replace:

```python
    if newly_confirmed:
        alert = DanglingAlert.objects.create(dangling_subdomain=dangling_subdomain, source=source)
        send_dangling_dns_notifications(alert)
```

with:

```python
    if newly_confirmed:
        alert = DanglingAlert.objects.create(dangling_subdomain=dangling_subdomain, trigger=source)
        send_dangling_dns_notifications(alert)
```

- [ ] **Step 4: Fix `admin.py`**

In `Watcher/Watcher/dns_finder/admin.py`, in the `DanglingAlert` admin class (lines 145-147), replace:

```python
    list_display = ['id', 'dangling_subdomain', 'source', 'status', 'created_at']
    list_filter = ('created_at', 'source', ('status', custom_titled_filter('Active Status')))
```

with:

```python
    list_display = ['id', 'dangling_subdomain', 'trigger', 'status', 'created_at']
    list_filter = ('created_at', 'trigger', ('status', custom_titled_filter('Active Status')))
```

- [ ] **Step 5: Fix every `DanglingAlert(...source=...)` / `.filter(source=...)` in `tests.py`**

In `Watcher/Watcher/dns_finder/tests.py`, apply these exact replacements (all pre-existing, all currently passing — this step must not change test *behavior*, only the field name):

In `ModelTest.test_dangling_subdomain_and_alert_functionality`:
```python
        alert = DanglingAlert.objects.create(dangling_subdomain=dangling, source='certstream')
        self.assertEqual(alert.dangling_subdomain, dangling)
        self.assertTrue(alert.status)
        self.assertEqual(alert.source, 'certstream')
```
becomes:
```python
        alert = DanglingAlert.objects.create(dangling_subdomain=dangling, trigger='certstream')
        self.assertEqual(alert.dangling_subdomain, dangling)
        self.assertTrue(alert.status)
        self.assertEqual(alert.trigger, 'certstream')
```

In `DanglingDnsRealtimeTest.test_evaluate_creates_alert_on_new_dangling_status`:
```python
        self.assertTrue(DanglingAlert.objects.filter(dangling_subdomain=dangling, source='certstream').exists())
```
becomes:
```python
        self.assertTrue(DanglingAlert.objects.filter(dangling_subdomain=dangling, trigger='certstream').exists())
```

In `DanglingDnsRealtimeTest.test_evaluate_alerts_on_suspected_to_confirmed_escalation`:
```python
        self.assertTrue(
            DanglingAlert.objects.filter(dangling_subdomain=dangling, source='periodic_recheck').exists()
        )
```
becomes:
```python
        self.assertTrue(
            DanglingAlert.objects.filter(dangling_subdomain=dangling, trigger='periodic_recheck').exists()
        )
```

(All other `DanglingAlert.objects.filter(dangling_subdomain=...)` calls in that file with no `source=`/`trigger=` kwarg — e.g. in `test_evaluate_no_alert_when_already_dangling`, `test_evaluate_no_alert_on_entering_suspected`, `test_evaluate_no_alert_on_repeated_suspected` — are unaffected and need no change.)

- [ ] **Step 6: Run migration and full dns_finder test suite**

Run: `python manage.py migrate dns_finder` then `python manage.py test dns_finder -v 2`
Expected: PASS, no remaining references to `DanglingAlert.source` anywhere (`grep -rn "danglingalert.*source\|DanglingAlert.*source" Watcher/Watcher/dns_finder Watcher/Watcher/common` should only match unrelated things like `dns_finder.core.send_dangling_dns_notifications`'s docstrings).

- [ ] **Step 7: Commit**

```bash
git add Watcher/Watcher/dns_finder/models.py Watcher/Watcher/dns_finder/migrations/0013_danglingalert_rename_source_trigger.py Watcher/Watcher/dns_finder/core.py Watcher/Watcher/dns_finder/admin.py Watcher/Watcher/dns_finder/tests.py
git commit -m "refactor(dns_finder): rename DanglingAlert.source to trigger"
```

---

## Task 4: Capture certificate issuer/SAN/validity in `print_callback`

**Files:**
- Modify: `Watcher/Watcher/dns_finder/core.py` (imports, new `extract_certificate_metadata` function, `print_callback`)
- Test: `Watcher/Watcher/dns_finder/tests.py`

**Context:** `certstream-server-go` (the internal service this project runs, see `certstream_client.py`) emits the same JSON shape as the original calidog `certstream`: `message['data']['leaf_cert']` has `subject.CN`, `not_before`/`not_after` (Unix epoch seconds), `serial_number`, `fingerprint`, `all_domains` (the SAN list); `message['data']['chain'][0]['subject']` is the issuing CA's subject. This is read defensively (`.get()` throughout, no exceptions on missing keys) since the exact field set can vary slightly across certstream-server-go versions — verify against a live message if behavior looks off after deploying.

**Interfaces:**
- Produces: `extract_certificate_metadata(message) -> dict` with keys `issuer`, `san_list`, `not_before`, `not_after`, `serial_number`, `fingerprint_sha256` — matching `DnsTwisted`'s new fields from Task 2 one-to-one, so it can be splatted straight into `DnsTwisted.objects.create(**cert_metadata)`.

- [ ] **Step 1: Write the failing test**

Add to `Watcher/Watcher/dns_finder/tests.py`, inside `class CoreTest(TestCase):`:

```python
    def test_extract_certificate_metadata_full_message(self):
        from dns_finder.core import extract_certificate_metadata

        message = {
            'data': {
                'leaf_cert': {
                    'subject': {'CN': 'evil.example.com'},
                    'not_before': 1700000000,
                    'not_after': 1731536000,
                    'serial_number': '03AB',
                    'fingerprint': 'AA:BB:CC:DD',
                    'all_domains': ['evil.example.com', 'www.evil.example.com'],
                },
                'chain': [{'subject': {'O': "Let's Encrypt", 'CN': 'R3'}}],
            }
        }

        metadata = extract_certificate_metadata(message)

        self.assertEqual(metadata['issuer'], "Let's Encrypt")
        self.assertEqual(metadata['san_list'], ['evil.example.com', 'www.evil.example.com'])
        self.assertEqual(metadata['serial_number'], '03AB')
        self.assertEqual(metadata['fingerprint_sha256'], 'AA:BB:CC:DD')
        self.assertIsNotNone(metadata['not_before'])
        self.assertIsNotNone(metadata['not_after'])

    def test_extract_certificate_metadata_missing_fields_is_safe(self):
        """A leaner/older certstream-server-go payload must never raise."""
        from dns_finder.core import extract_certificate_metadata

        metadata = extract_certificate_metadata({'data': {'leaf_cert': {'subject': {'CN': 'x.com'}}}})

        self.assertIsNone(metadata['issuer'])
        self.assertIsNone(metadata['san_list'])
        self.assertIsNone(metadata['not_before'])
        self.assertIsNone(metadata['not_after'])
        self.assertIsNone(metadata['serial_number'])
        self.assertIsNone(metadata['fingerprint_sha256'])

    def test_print_callback_stores_certificate_metadata_on_dns_twisted(self):
        from dns_finder.core import print_callback
        from dns_finder.models import DnsTwisted

        KeywordMonitored.objects.create(name="cert-capture-test")
        message = {
            'data': {
                'leaf_cert': {
                    'subject': {'CN': 'cert-capture-test-evil.com'},
                    'not_before': 1700000000,
                    'not_after': 1731536000,
                    'serial_number': '03AB',
                    'fingerprint': 'AA:BB:CC:DD',
                    'all_domains': ['cert-capture-test-evil.com'],
                },
                'chain': [{'subject': {'O': "Let's Encrypt"}}],
            }
        }

        print_callback(message, None)

        twisted = DnsTwisted.objects.get(domain_name="cert-capture-test-evil.com")
        self.assertEqual(twisted.issuer, "Let's Encrypt")
        self.assertEqual(twisted.serial_number, '03AB')
        self.assertEqual(twisted.san_list, ['cert-capture-test-evil.com'])
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python manage.py test dns_finder.tests.CoreTest.test_extract_certificate_metadata_full_message dns_finder.tests.CoreTest.test_extract_certificate_metadata_missing_fields_is_safe dns_finder.tests.CoreTest.test_print_callback_stores_certificate_metadata_on_dns_twisted -v 2`
Expected: FAIL — `ImportError: cannot import name 'extract_certificate_metadata'`.

- [ ] **Step 3: Add the import and the function**

In `Watcher/Watcher/dns_finder/core.py`, add near the top imports (after `import time`):

```python
import datetime as dt
```

Add the function after `clean_wildcard_domain` (before `_FINGERPRINTS_PATH`):

```python
def extract_certificate_metadata(message):
    """
    Extract issuer/SAN/validity/serial/fingerprint from a CertStream
    certificate_update message's leaf certificate and issuing chain.
    Every field is read defensively - a leaner or differently-shaped
    certstream-server-go payload must never raise here, only omit data.

    :param message: CertStream event (Dict).
    :rtype: dict
    """
    leaf_cert = (message.get('data') or {}).get('leaf_cert') or {}
    chain = (message.get('data') or {}).get('chain') or []

    issuer = None
    if chain:
        issuer_subject = chain[0].get('subject') or {}
        issuer = issuer_subject.get('O') or issuer_subject.get('CN')

    def _to_datetime(epoch_seconds):
        if epoch_seconds is None:
            return None
        try:
            return dt.datetime.fromtimestamp(float(epoch_seconds), tz=dt.timezone.utc)
        except (TypeError, ValueError, OSError):
            return None

    return {
        'issuer': issuer,
        'san_list': leaf_cert.get('all_domains') or None,
        'not_before': _to_datetime(leaf_cert.get('not_before')),
        'not_after': _to_datetime(leaf_cert.get('not_after')),
        'serial_number': leaf_cert.get('serial_number'),
        'fingerprint_sha256': leaf_cert.get('fingerprint'),
    }
```

- [ ] **Step 4: Wire it into `print_callback`**

Replace the line `dns_twisted = DnsTwisted.objects.create(domain_name=domain, keyword_monitored=keyword_monitored)` with:

```python
            cert_metadata = extract_certificate_metadata(message)
            dns_twisted = DnsTwisted.objects.create(
                domain_name=domain, keyword_monitored=keyword_monitored, **cert_metadata
            )
```

- [ ] **Step 5: Run tests**

Run: `python manage.py test dns_finder.tests.CoreTest -v 2`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add Watcher/Watcher/dns_finder/core.py Watcher/Watcher/dns_finder/tests.py
git commit -m "feat(dns_finder): capture certificate issuer/SAN/validity in print_callback"
```

---

## Task 5: Unified `GET /api/dns_finder/threats_monitored/` endpoint

**Files:**
- Create: `Watcher/Watcher/dns_finder/threats.py`
- Modify: `Watcher/Watcher/dns_finder/api.py` (new `ThreatsMonitoredView`)
- Modify: `Watcher/Watcher/dns_finder/urls.py` (register the new path)
- Test: `Watcher/Watcher/dns_finder/tests.py`

**Interfaces:**
- Produces: `get_unified_threats(params) -> list[dict]` (each dict matches the §2.1 output contract exactly, no extra fields — `Alert.id` and `DanglingAlert.id` are independent auto-increment sequences that CAN collide across sources, but `source` already disambiguates them since `dnstwist`/`certstream_keyword` both come from the same `Alert` table and only `subdomain_takeover` comes from `DanglingAlert`; the frontend uses the composite `(source, id)` — computed client-side, never persisted — everywhere a unique key is needed, see Tasks 8-9); `ThreatsMonitoredView` (DRF `APIView`, `GET` only) at `/api/dns_finder/threats_monitored/`, paginated with the existing `StandardResultsSetPagination`.
- Consumes: `Alert` (Task 1's `source` field), `DanglingAlert`/`DanglingSubdomain`, `common.misp.get_misp_uuid`.

- [ ] **Step 1: Write the failing test**

Add to `Watcher/Watcher/dns_finder/tests.py`, as a new class after `APITest`:

```python
class ThreatsMonitoredAPITest(APITestCase):
    """Test the unified DNS Threats Monitored endpoint (Alert + DanglingAlert merge)."""

    def setUp(self):
        self.user = User.objects.create_superuser("threatsuser", password="threatspass123")
        self.token = AuthToken.objects.create(self.user)[1]
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {self.token}')

        self.dns = DnsMonitored.objects.create(domain_name="threats-api-test.com")
        self.keyword = KeywordMonitored.objects.create(name="threats-keyword")

        self.twisted_dnstwist = DnsTwisted.objects.create(
            domain_name="threats-dnstwist.com", dns_monitored=self.dns, fuzzer="homoglyph"
        )
        self.alert_dnstwist = Alert.objects.create(dns_twisted=self.twisted_dnstwist, source=Alert.SOURCE_DNSTWIST)

        self.twisted_certstream = DnsTwisted.objects.create(
            domain_name="threats-certstream.com", keyword_monitored=self.keyword
        )
        self.alert_certstream = Alert.objects.create(
            dns_twisted=self.twisted_certstream, source=Alert.SOURCE_CERTSTREAM_KEYWORD
        )

        self.dangling = DanglingSubdomain.objects.create(
            subdomain="old.threats-api-test.com", dns_monitored=self.dns,
            status='dangling_confirmed', provider='Amazon S3', cname_target='bucket.s3.amazonaws.com'
        )
        self.dangling_alert = DanglingAlert.objects.create(dangling_subdomain=self.dangling, trigger='certstream')

    def test_unified_feed_returns_all_three_sources(self):
        response = self.client.get('/api/dns_finder/threats_monitored/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        sources = {item['source'] for item in response.data['results']}
        self.assertEqual(sources, {'dnstwist', 'certstream_keyword', 'subdomain_takeover'})

    def test_unified_feed_items_have_unique_source_id_pairs(self):
        """id alone is not unique across sources (Alert and DanglingAlert are
        separate auto-increment sequences) - (source, id) together must be."""
        response = self.client.get('/api/dns_finder/threats_monitored/')
        composite_keys = [(item['source'], item['id']) for item in response.data['results']]
        self.assertEqual(len(composite_keys), len(set(composite_keys)))

    def test_unified_feed_sorted_chronologically(self):
        response = self.client.get('/api/dns_finder/threats_monitored/')
        created_ats = [item['created_at'] for item in response.data['results']]
        self.assertEqual(created_ats, sorted(created_ats, reverse=True))

    def test_unified_feed_filter_by_source(self):
        response = self.client.get('/api/dns_finder/threats_monitored/?source=subdomain_takeover')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data['results']), 1)
        self.assertEqual(response.data['results'][0]['source'], 'subdomain_takeover')
        self.assertEqual(response.data['results'][0]['status_tag'], 'dangling_confirmed')

    def test_unified_feed_filter_by_corporate_dns(self):
        response = self.client.get(f'/api/dns_finder/threats_monitored/?corporate_dns={self.dns.domain_name}')
        domains_in_result = {item['domain_name'] for item in response.data['results']}
        self.assertIn('threats-dnstwist.com', domains_in_result)
        self.assertIn('old.threats-api-test.com', domains_in_result)
        self.assertNotIn('threats-certstream.com', domains_in_result)

    def test_unified_feed_dnstwist_technical_details(self):
        response = self.client.get('/api/dns_finder/threats_monitored/?source=dnstwist')
        item = response.data['results'][0]
        self.assertEqual(item['technical_details']['fuzzer'], 'homoglyph')

    def test_unified_feed_subdomain_takeover_technical_details(self):
        response = self.client.get('/api/dns_finder/threats_monitored/?source=subdomain_takeover')
        item = response.data['results'][0]
        self.assertEqual(item['technical_details']['provider'], 'Amazon S3')
        self.assertEqual(item['technical_details']['cname_target'], 'bucket.s3.amazonaws.com')
        self.assertEqual(item['technical_details']['dangling_subdomain_id'], self.dangling.id)

    def test_unified_feed_requires_auth(self):
        self.client.credentials()
        response = self.client.get('/api/dns_finder/threats_monitored/')
        self.assertIn(response.status_code, [401, 403])
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python manage.py test dns_finder.tests.ThreatsMonitoredAPITest -v 2`
Expected: FAIL — `404 Not Found` (URL doesn't exist yet).

- [ ] **Step 3: Create `dns_finder/threats.py`**

```python
# coding=utf-8
"""
Normalization and merge logic for the unified DNS Threats Monitored feed:
combines Alert (dnstwist / certstream_keyword sources) and DanglingAlert
(subdomain_takeover source) into one chronologically-sorted list, since
they live in unrelated tables and the frontend renders them as one table.
"""
from .models import Alert, DanglingAlert
from common.misp import get_misp_uuid


def serialize_alert(alert):
    """
    Normalize an Alert (dnstwist or certstream_keyword source) into the
    unified threats-feed item shape.

    :param alert: Alert instance, with dns_twisted/dns_monitored/keyword_monitored
        already select_related.
    :rtype: dict
    """
    dns_twisted = alert.dns_twisted
    corporate_dns = dns_twisted.dns_monitored.domain_name if dns_twisted.dns_monitored else None
    corporate_keyword = dns_twisted.keyword_monitored.name if dns_twisted.keyword_monitored else None

    return {
        'id': alert.id,
        'source': alert.source,
        'domain_name': dns_twisted.domain_name,
        'corporate_dns': corporate_dns,
        'corporate_keyword': corporate_keyword,
        'status_tag': 'active' if alert.status else 'archived',
        'created_at': alert.created_at,
        'misp_event_uuid': get_misp_uuid(dns_twisted.domain_name),
        'technical_details': {
            'fuzzer': dns_twisted.fuzzer,
            'corporate_dns': corporate_dns,
            'corporate_keyword': corporate_keyword,
            'issuer': dns_twisted.issuer,
            'san_list': dns_twisted.san_list,
            'not_before': dns_twisted.not_before,
            'not_after': dns_twisted.not_after,
            'serial_number': dns_twisted.serial_number,
            'fingerprint_sha256': dns_twisted.fingerprint_sha256,
            'detected_at': alert.created_at,
        },
    }


def serialize_dangling_alert(alert):
    """
    Normalize a DanglingAlert (subdomain_takeover source) into the unified
    threats-feed item shape.

    :param alert: DanglingAlert instance, with dangling_subdomain/dns_monitored
        already select_related.
    :rtype: dict
    """
    sub = alert.dangling_subdomain
    corporate_dns = sub.dns_monitored.domain_name if sub.dns_monitored else None

    return {
        'id': alert.id,
        'source': 'subdomain_takeover',
        'domain_name': sub.subdomain,
        'corporate_dns': corporate_dns,
        'corporate_keyword': None,
        'status_tag': sub.status,
        'created_at': alert.created_at,
        'misp_event_uuid': get_misp_uuid(sub.subdomain),
        'technical_details': {
            'provider': sub.provider,
            'cname_target': sub.cname_target,
            'http_status_code': sub.http_status_code,
            'last_checked_at': sub.last_checked_at,
            'corporate_dns': corporate_dns,
            'dangling_subdomain_id': sub.id,
        },
    }


def get_unified_threats(params):
    """
    Build the merged, chronologically-sorted list of DNS Finder threats
    across all three detection sources, applying the requested filters.

    :param params: Query-param-like mapping (request.query_params), all
        values optional: source, corporate_dns, fuzzer, corporate_keyword,
        provider, cname_target, status.
    :rtype: list[dict]
    """
    source = params.get('source') or None
    corporate_dns = params.get('corporate_dns') or None

    items = []

    if source in (None, Alert.SOURCE_DNSTWIST, Alert.SOURCE_CERTSTREAM_KEYWORD):
        alerts = Alert.objects.select_related(
            'dns_twisted', 'dns_twisted__dns_monitored', 'dns_twisted__keyword_monitored'
        )
        if source:
            alerts = alerts.filter(source=source)
        if corporate_dns:
            alerts = alerts.filter(dns_twisted__dns_monitored__domain_name=corporate_dns)
        fuzzer = params.get('fuzzer') or None
        if fuzzer:
            alerts = alerts.filter(dns_twisted__fuzzer=fuzzer)
        corporate_keyword = params.get('corporate_keyword') or None
        if corporate_keyword:
            alerts = alerts.filter(dns_twisted__keyword_monitored__name=corporate_keyword)
        items.extend(serialize_alert(alert) for alert in alerts)

    if source in (None, 'subdomain_takeover'):
        dangling_alerts = DanglingAlert.objects.select_related(
            'dangling_subdomain', 'dangling_subdomain__dns_monitored'
        )
        if corporate_dns:
            dangling_alerts = dangling_alerts.filter(dangling_subdomain__dns_monitored__domain_name=corporate_dns)
        provider = params.get('provider') or None
        if provider:
            dangling_alerts = dangling_alerts.filter(dangling_subdomain__provider=provider)
        cname_target = params.get('cname_target') or None
        if cname_target:
            dangling_alerts = dangling_alerts.filter(dangling_subdomain__cname_target=cname_target)
        dangling_status = params.get('status') or None
        if dangling_status:
            dangling_alerts = dangling_alerts.filter(dangling_subdomain__status=dangling_status)
        items.extend(serialize_dangling_alert(alert) for alert in dangling_alerts)

    items.sort(key=lambda item: item['created_at'], reverse=True)
    return items
```

- [ ] **Step 4: Add `ThreatsMonitoredView` to `api.py`**

In `Watcher/Watcher/dns_finder/api.py`, add the import and the view. Change the top imports:

```python
import logging
from .models import DnsMonitored, DnsTwisted, Alert, KeywordMonitored, DanglingSubdomain, DanglingAlert

logger = logging.getLogger('watcher.dns_finder')
from rest_framework import viewsets, permissions, status
from rest_framework.views import APIView
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.pagination import PageNumberPagination
from django.db.models import Prefetch
from django.utils import timezone
from datetime import timedelta
from .serializers import AlertSerializer, DnsMonitoredSerializer, DnsTwistedSerializer, \
    MISPSerializer, KeywordMonitoredSerializer, DanglingSubdomainSerializer, DanglingAlertSerializer
from .threats import get_unified_threats
```

Append at the end of `api.py`, after `MISPViewSet`:

```python
# Unified DNS Threats Monitored view (merges Alert + DanglingAlert)
class ThreatsMonitoredView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        items = get_unified_threats(request.query_params)
        paginator = StandardResultsSetPagination()
        page = paginator.paginate_queryset(items, request, view=self)
        return paginator.get_paginated_response(page)
```

- [ ] **Step 5: Register the URL**

In `Watcher/Watcher/dns_finder/urls.py`, replace the whole file:

```python
from django.urls import path
from rest_framework import routers
from .api import DnsMonitoredViewSet, DnsTwistedViewSet, AlertViewSet, MISPViewSet, KeywordMonitoredViewSet, \
    DanglingSubdomainViewSet, DanglingAlertViewSet, ThreatsMonitoredView

from .core import start_scheduler

router = routers.DefaultRouter()
router.register('api/dns_finder/dns_monitored', DnsMonitoredViewSet, 'dns_monitored')
router.register('api/dns_finder/keyword_monitored', KeywordMonitoredViewSet, 'keyword_monitored')
router.register('api/dns_finder/dns_twisted', DnsTwistedViewSet, 'dns_twisted')
router.register('api/dns_finder/alert', AlertViewSet, 'alert')
router.register('api/dns_finder/misp', MISPViewSet, 'misp')
router.register('api/dns_finder/dangling_subdomain', DanglingSubdomainViewSet, 'dangling_subdomain')
router.register('api/dns_finder/dangling_alert', DanglingAlertViewSet, 'dangling_alert')

urlpatterns = router.urls + [
    path('api/dns_finder/threats_monitored/', ThreatsMonitoredView.as_view(), name='threats_monitored'),
]

start_scheduler()
```

- [ ] **Step 6: Run tests**

Run: `python manage.py test dns_finder.tests.ThreatsMonitoredAPITest -v 2`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add Watcher/Watcher/dns_finder/threats.py Watcher/Watcher/dns_finder/api.py Watcher/Watcher/dns_finder/urls.py Watcher/Watcher/dns_finder/tests.py
git commit -m "feat(dns_finder): unified threats endpoint (Alert + DanglingAlert)"
```

---

## Task 6: On-demand dangling subdomains endpoint per `DnsMonitored` asset

**Files:**
- Modify: `Watcher/Watcher/dns_finder/api.py` (`DnsMonitoredViewSet`)
- Test: `Watcher/Watcher/dns_finder/tests.py`

**Interfaces:**
- Produces: `GET /api/dns_finder/dns_monitored/{id}/dangling_subdomains/` → list of `DanglingSubdomainSerializer` output for that asset (all statuses, including `pending`/`ok` rows that never generated an alert). Consumed by Task 10's "Corporate DNS Asset" detail modal.

- [ ] **Step 1: Write the failing test**

Add to `Watcher/Watcher/dns_finder/tests.py`, inside `class APITest(APITestCase):`:

```python
    def test_dns_monitored_dangling_subdomains_action(self):
        """The per-asset dangling-subdomains action must return all statuses,
        including pending/ok rows that never produced a DanglingAlert."""
        never_alerted = DanglingSubdomain.objects.create(
            subdomain="pending-only.api-dns-test.com", dns_monitored=self.dns, status='pending'
        )
        other_dns = DnsMonitored.objects.create(domain_name="other-asset-test.com")
        DanglingSubdomain.objects.create(subdomain="unrelated.other-asset-test.com", dns_monitored=other_dns)

        response = self.client.get(f'/api/dns_finder/dns_monitored/{self.dns.pk}/dangling_subdomains/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        subdomains = {item['subdomain'] for item in response.data}
        self.assertIn(self.dangling_subdomain.subdomain, subdomains)
        self.assertIn(never_alerted.subdomain, subdomains)
        self.assertNotIn('unrelated.other-asset-test.com', subdomains)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python manage.py test dns_finder.tests.APITest.test_dns_monitored_dangling_subdomains_action -v 2`
Expected: FAIL — `404 Not Found`.

- [ ] **Step 3: Add the action**

In `Watcher/Watcher/dns_finder/api.py`, in `DnsMonitoredViewSet`, after `get_statistics`:

```python
    @action(detail=True, methods=['get'], permission_classes=[permissions.IsAuthenticated], url_path='dangling_subdomains')
    def get_dangling_subdomains(self, request, pk=None):
        """Return every DanglingSubdomain tracked for this Corporate DNS asset."""
        dns_monitored = self.get_object()
        subdomains = DanglingSubdomain.objects.filter(
            dns_monitored=dns_monitored
        ).order_by('-discovered_at')
        serializer = DanglingSubdomainSerializer(subdomains, many=True)
        return Response(serializer.data)
```

- [ ] **Step 4: Run test**

Run: `python manage.py test dns_finder.tests.APITest -v 2`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add Watcher/Watcher/dns_finder/api.py Watcher/Watcher/dns_finder/tests.py
git commit -m "feat(dns_finder): on-demand dangling subdomains endpoint per DnsMonitored"
```

---

## Task 7: Dedicated MISP object for subdomain-takeover findings

**Files:**
- Modify: `Watcher/Watcher/common/misp.py` (new `create_takeover_objects`, generalize `find_domain_object`/`create_or_update_objects`)
- Modify: `Watcher/Watcher/dns_finder/serializers.py` (`MISPSerializer`)
- Test: `Watcher/Watcher/common/tests.py`, `Watcher/Watcher/dns_finder/tests.py`

**Context:** `create_or_update_objects`/`find_domain_object` currently assume every target object has `.domain_name`; `DanglingSubdomain` has `.subdomain` instead. A tiny `_get_domain_identifier()` helper generalizes this without touching `create_objects()`'s existing `Site`/`LegitimateDomain` branches.

**Interfaces:**
- Produces: `common.misp.create_takeover_objects(dangling_subdomain, existing_values=None) -> list[MISPObject]`; `MISPSerializer` accepts an optional `source` field, and routes to `DanglingSubdomain` when `source == 'subdomain_takeover'`.

- [ ] **Step 1: Write the failing test**

Add to `Watcher/Watcher/common/tests.py` (create the class if the file has no MISP test class yet — check existing content first and append near other MISP-related tests):

```python
class TakeoverMispObjectTest(TestCase):
    """Test the dedicated MISP object builder for subdomain-takeover findings."""

    def test_create_takeover_objects_includes_expected_attributes(self):
        from common.misp import create_takeover_objects
        from dns_finder.models import DnsMonitored, DanglingSubdomain

        dns_monitored = DnsMonitored.objects.create(domain_name="misp-takeover-test.com")
        dangling = DanglingSubdomain.objects.create(
            subdomain="old.misp-takeover-test.com",
            dns_monitored=dns_monitored,
            cname_target="bucket.s3.amazonaws.com",
            provider="Amazon S3",
            http_status_code=404,
        )

        objects = create_takeover_objects(dangling)

        self.assertEqual(len(objects), 1)
        values = {(attr.type, attr.value) for attr in objects[0].attributes}
        self.assertIn(('domain', 'old.misp-takeover-test.com'), values)
        self.assertIn(('domain', 'bucket.s3.amazonaws.com'), values)
        self.assertIn(('text', 'Amazon S3'), values)

    def test_create_takeover_objects_skips_existing_values(self):
        from common.misp import create_takeover_objects
        from dns_finder.models import DnsMonitored, DanglingSubdomain

        dns_monitored = DnsMonitored.objects.create(domain_name="misp-takeover-dedup.com")
        dangling = DanglingSubdomain.objects.create(
            subdomain="old.misp-takeover-dedup.com", dns_monitored=dns_monitored, provider="Amazon S3"
        )

        objects = create_takeover_objects(
            dangling, existing_values={('domain', 'old.misp-takeover-dedup.com')}
        )

        values = {(attr.type, attr.value) for attr in objects[0].attributes}
        self.assertNotIn(('domain', 'old.misp-takeover-dedup.com'), values)
        self.assertIn(('text', 'Amazon S3'), values)
```

Add to `Watcher/Watcher/dns_finder/tests.py`, inside `class MISPTest(TestCase):`:

```python
    def test_misp_serializer_routes_subdomain_takeover_to_dangling_subdomain(self):
        """source='subdomain_takeover' must resolve against DanglingSubdomain,
        not DnsTwisted (which has no matching domain_name for a subdomain)."""
        from dns_finder.serializers import MISPSerializer
        from dns_finder.models import DanglingSubdomain

        dns_monitored = DnsMonitored.objects.create(domain_name="misp-serializer-takeover.com")
        dangling = DanglingSubdomain.objects.create(
            subdomain="old.misp-serializer-takeover.com", dns_monitored=dns_monitored
        )

        serializer = MISPSerializer(data={
            'domain_name': dangling.subdomain, 'source': 'subdomain_takeover', 'event_uuid': ''
        })
        self.assertTrue(serializer.is_valid())
        self.assertEqual(serializer.validated_data['id'], dangling.id)
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python manage.py test common.tests.TakeoverMispObjectTest dns_finder.tests.MISPTest.test_misp_serializer_routes_subdomain_takeover_to_dangling_subdomain -v 2`
Expected: FAIL — `ImportError: cannot import name 'create_takeover_objects'`.

- [ ] **Step 3: Add `create_takeover_objects` and generalize the domain identifier in `common/misp.py`**

Add near the top of `Watcher/Watcher/common/misp.py`, after the imports:

```python
def _get_domain_identifier(obj):
    """
    The string identity MISP tracking (find_domain_object/get_misp_uuid) keys
    on: Site/LegitimateDomain/DnsTwisted expose `.domain_name`, DanglingSubdomain
    exposes `.subdomain` - this lets create_or_update_objects/find_domain_object
    stay object-type-agnostic instead of special-casing DanglingSubdomain.
    """
    return getattr(obj, 'domain_name', None) or getattr(obj, 'subdomain', None)
```

Add `create_takeover_objects` after `create_objects`:

```python
def create_takeover_objects(dangling_subdomain, existing_values=None):
    """
    Create a MISP object for a subdomain-takeover (dangling DNS) finding.
    Kept separate from create_objects() (Site/LegitimateDomain) since a
    DanglingSubdomain carries a different attribute set (CNAME target,
    provider, HTTP status) and no domain_name field.

    Args:
        dangling_subdomain: DanglingSubdomain instance
        existing_values: Optional set of (type, value) tuples to check for duplicates

    Returns:
        list: MISP objects ready to be added/updated
    """
    network_obj = MISPObject('domain-ip')
    network_obj.distribution = 5

    attributes_map = {
        'subdomain': {
            'value': dangling_subdomain.subdomain,
            'type': 'domain',
            'category': 'Network activity',
            'to_ids': True,
            'comment': "Subdomain vulnerable to takeover",
            'object_relation': 'domain',
        }
    }

    if dangling_subdomain.cname_target:
        attributes_map['cname_target'] = {
            'value': dangling_subdomain.cname_target,
            'type': 'domain',
            'category': 'Network activity',
            'to_ids': True,
            'comment': "CNAME target (decommissioned resource)",
            'object_relation': 'cname-target',
        }

    if dangling_subdomain.provider:
        attributes_map['provider'] = {
            'value': dangling_subdomain.provider,
            'type': 'text',
            'category': 'Other',
            'to_ids': False,
            'comment': "Detected cloud provider",
            'object_relation': 'text',
        }

    if dangling_subdomain.http_status_code:
        attributes_map['http_status_code'] = {
            'value': str(dangling_subdomain.http_status_code),
            'type': 'text',
            'category': 'Other',
            'to_ids': False,
            'comment': "HTTP status observed during probe",
            'object_relation': 'comment',
        }

    for attr_data in attributes_map.values():
        if not attr_data['value']:
            continue
        if existing_values and (attr_data['type'], attr_data['value']) in existing_values:
            continue
        network_obj.add_attribute(**attr_data)

    return [network_obj] if network_obj.attributes else []
```

Update `find_domain_object` to use the helper — replace:

```python
def find_domain_object(misp_api, event, domain_name):
```

with the same signature (unchanged - callers already pass the resolved string), but update `create_or_update_objects` to resolve that string and pick the right builder function. Replace the whole `create_or_update_objects` function body:

```python
def create_or_update_objects(misp_api, event, site, dry_run=False):
    """
    Create or update MISP objects for a given domain-bearing object (Site,
    LegitimateDomain, DnsTwisted, or DanglingSubdomain).

    Args:
        misp_api: PyMISP API instance
        event: MISP Event object
        site: Domain-bearing object (identified via _get_domain_identifier)
        dry_run: If True, simulate the operation without making changes

    Returns:
        tuple: (success, message)
    """
    from dns_finder.models import DanglingSubdomain

    try:
        if 'Event' not in event:
            logger.error("Invalid MISP event format - please check the event UUID")
            return False, "Invalid MISP event format - please check the event UUID"

        domain_identifier = _get_domain_identifier(site)
        objects_builder = create_takeover_objects if isinstance(site, DanglingSubdomain) else create_objects

        logger.info(f"Processing domain name {domain_identifier} for event {event['Event']['uuid']}")

        domain_exists, existing_obj = find_domain_object(misp_api, event, domain_identifier)

        if domain_exists:
            existing_values = {(attr.type, attr.value) for attr in existing_obj.attributes}
            objects = objects_builder(site, existing_values)

            if not objects:
                logger.info(f"Already on MISP - No changes applied for {domain_identifier}")
                return True, f"Already on MISP - No changes applied for {domain_identifier}"

            if not dry_run:
                for obj in objects:
                    for attr in obj.attributes:
                        try:
                            existing_obj.add_attribute(
                                object_relation=attr.object_relation,
                                **{
                                    'value': attr.value,
                                    'type': attr.type,
                                    'category': attr.category,
                                    'to_ids': attr.to_ids,
                                    'comment': attr.comment,
                                    'distribution': attr.distribution if hasattr(attr, 'distribution') else 5
                                }
                            )
                            misp_api.update_object(existing_obj)
                            logger.info(f"Updating MISP object for {domain_identifier} - Added attribute {attr.type}: {attr.value}")
                        except Exception as e:
                            logger.error(f"Error adding attribute to object: {str(e)}")
                            raise

            return True, f"Successfully updated {domain_identifier} in MISP"

        else:
            objects = objects_builder(site)

            if not dry_run and objects:
                for obj in objects:
                    try:
                        misp_api.add_object(event['Event']['id'], obj)
                        logger.info(f"Added new object with {len(obj.attributes)} attributes")
                    except Exception as e:
                        logger.error(f"Error adding object: {str(e)}")
                        raise

            return True, f"Successfully added {domain_identifier} to MISP"

    except Exception as e:
        logger.error(f"Error in create_or_update_objects: {str(e)}")
        return False, f"Error: {str(e)}"
```

- [ ] **Step 4: Update `MISPSerializer` to accept and route on `source`**

In `Watcher/Watcher/dns_finder/serializers.py`, update the `common.misp` import line (add `_get_domain_identifier` — reuse Step 3's helper instead of re-deriving `domain_name` vs `subdomain` inline, which would otherwise duplicate that exact ternary three times across this file and `common/misp.py`):

```python
from common.misp import create_misp_tags, create_or_update_objects, get_misp_uuid, update_misp_uuid, _get_domain_identifier
```

(`DanglingSubdomain` is already imported on line 7, no change needed there.) Then update the `MISPSerializer` class:

```python
class MISPSerializer(serializers.Serializer):
    id = serializers.IntegerField(required=False)
    event_uuid = serializers.CharField(required=False, allow_blank=True)
    domain_name = serializers.CharField(required=False, allow_blank=True)
    fuzzer = serializers.CharField(required=False, allow_blank=True)
    source = serializers.CharField(required=False, allow_blank=True)

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        misp = get_misp_config()
        self.misp_api = PyMISP(
            misp['url'],
            misp['key'],
            misp['verify_ssl'],
        )
        self._message = ""

    def _get_target_obj(self, obj_id, domain_name, fuzzer, source=None):
        """
        Retrieve the target domain object from the appropriate database model.

        Routes to DanglingSubdomain when source='subdomain_takeover' (a
        subdomain has no domain_name to match against DnsTwisted), to
        LegitimateDomain/Site when fuzzer='legitimate_domain', otherwise to
        DnsTwisted. Prioritizes resolution by domain_name with a fallback
        to the primary key (obj_id).

        Args:
            obj_id (int): The primary key of the object (fallback lookup).
            domain_name (str): The domain name to search for (primary lookup).
            fuzzer (str): The origin context string (e.g., 'legitimate_domain').
            source (str): The unified-feed source (e.g., 'subdomain_takeover').

        Returns:
            Object: An instance of LegitimateDomain, Site, DnsTwisted, or DanglingSubdomain.
        """
        if source == 'subdomain_takeover':
            from dns_finder.models import DanglingSubdomain
            if domain_name: return DanglingSubdomain.objects.get(subdomain=domain_name)
            return DanglingSubdomain.objects.get(pk=obj_id)

        if fuzzer == 'legitimate_domain':
            from site_monitoring.models import Site
            try:
                from common.models import LegitimateDomain
                if domain_name: return LegitimateDomain.objects.get(domain_name=domain_name)
                return LegitimateDomain.objects.get(pk=obj_id)
            except (ImportError, ObjectDoesNotExist):
                if domain_name: return Site.objects.get(domain_name=domain_name)
                return Site.objects.get(pk=obj_id)
        else:
            if domain_name: return DnsTwisted.objects.get(domain_name=domain_name)
            return DnsTwisted.objects.get(pk=obj_id)

    def validate(self, data):
        dns_id = data.get('id')
        event_uuid = data.get('event_uuid', '')
        domain_name = data.get('domain_name')
        fuzzer = data.get('fuzzer')
        source = data.get('source')

        try:
            target_obj = self._get_target_obj(dns_id, domain_name, fuzzer, source)

            data['id'] = target_obj.id

        except ObjectDoesNotExist:
            raise serializers.ValidationError({"id": f"Domain not found in the database: {domain_name or dns_id}"})

        if event_uuid:
            try:
                event = self.misp_api.get_event(event_uuid)
                if not event:
                    raise serializers.ValidationError({"event_uuid": "MISP event not found"})
            except Exception:
                logger.exception("Error fetching MISP event for UUID %s", event_uuid)
                raise serializers.ValidationError({"event_uuid": "Invalid or unreachable MISP event UUID."})

        return data

    def save(self):
        try:
            dns_id = self.validated_data['id']
            domain_name = self.validated_data.get('domain_name')
            fuzzer = self.validated_data.get('fuzzer')
            source = self.validated_data.get('source')
            event_uuid = self.validated_data.get('event_uuid')
            target_obj = self._get_target_obj(dns_id, domain_name, fuzzer, source)
            domain_identifier = _get_domain_identifier(target_obj)

            if not event_uuid:
                known_uuids = get_misp_uuid(domain_identifier)
                if known_uuids and len(known_uuids) > 0:
                    event_uuid = known_uuids[-1]

            if event_uuid:
                event = self.misp_api.get_event(event_uuid)
                success, message = create_or_update_objects(
                    self.misp_api,
                    event,
                    target_obj
                )

                if success:
                    update_misp_uuid(domain_identifier, event_uuid)

            else:
                event = MISPEvent()
                event.distribution = 0
                event.threat_level_id = 2
                event.analysis = 0
                event.info = f"Suspicious domain name {domain_identifier}"
                event.tags = create_misp_tags(self.misp_api)

                event = self.misp_api.add_event(event, pythonify=True)
                success, message = create_or_update_objects(
                    self.misp_api,
                    {'Event': {'id': event.id, 'uuid': event.uuid}},
                    target_obj
                )

                if success:
                    update_misp_uuid(domain_identifier, event.uuid)

            if not success:
                raise serializers.ValidationError(message)

            self._message = message
            return {
                "message": message,
                "misp_event_uuid": get_misp_uuid(domain_identifier),
                "status": "success"
            }

        except serializers.ValidationError:
            raise
        except Exception:
            logger.exception("Unexpected error in DNS Finder MISP save")
            raise serializers.ValidationError("An internal error occurred while processing the MISP event.")

    @property
    def data(self):
        dns_id = self.validated_data['id']
        domain_name = self.validated_data.get('domain_name')
        fuzzer = self.validated_data.get('fuzzer')
        source = self.validated_data.get('source')

        target_obj = self._get_target_obj(dns_id, domain_name, fuzzer, source)
        domain_identifier = _get_domain_identifier(target_obj)

        return {
            'id': dns_id,
            'misp_event_uuid': get_misp_uuid(domain_identifier),
            'message': self._message
        }
```

- [ ] **Step 5: Run tests**

Run: `python manage.py test common.tests.TakeoverMispObjectTest dns_finder.tests.MISPTest dns_finder.tests.APITest.test_misp_export -v 2`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add Watcher/Watcher/common/misp.py Watcher/Watcher/dns_finder/serializers.py Watcher/Watcher/common/tests.py Watcher/Watcher/dns_finder/tests.py
git commit -m "feat(common): dedicated MISP object for subdomain takeover findings"
```

---

## Task 8: Frontend plumbing — actions, types, reducer for the unified feed

**Files:**
- Modify: `Watcher/Watcher/frontend/src/actions/types.js`
- Modify: `Watcher/Watcher/frontend/src/actions/DnsFinder.js`
- Modify: `Watcher/Watcher/frontend/src/reducers/DnsFinder.js`

**Context:** No backend work left in this task — pure Redux plumbing so Task 9's component has something to call. Follows the exact append-dedupe-by-key pattern `DNS_GET_ALERTS`/`GET_DANGLING_SUBDOMAINS` already use for progressive background loading (see `Dashboard.js`'s `loadRemainingDataInBackground`), keyed on the composite string `` `${item.source}:${item.id}` `` instead of bare `id`, since `Alert.id` and `DanglingAlert.id` are independent auto-increment sequences that can collide across sources - `source` (already in the API response, see Task 5) is what disambiguates them. No new API field needed; the composite key is computed client-side only.

**Interfaces:**
- Produces: `getThreatsMonitored(page, pageSize, filters)` thunk; `state.DnsFinder.threatsMonitored` / `.threatsMonitoredCount` / `.threatsMonitoredNext`; `exportToMISP(id, event_uuid, domain_name, source)` (new optional 4th arg).
- Consumes: `GET /api/dns_finder/threats_monitored/` (Task 5), `POST /api/dns_finder/misp/` (Task 7's `source` field).

- [ ] **Step 1: Add new action types**

In `Watcher/Watcher/frontend/src/actions/types.js`, add near the other `DNS_*`/`GET_DANGLING_*` exports (exact location doesn't matter, `export const` is not order-dependent):

```javascript
export const GET_THREATS_MONITORED = 'GET_THREATS_MONITORED';
```

- [ ] **Step 2: Add `getThreatsMonitored` and update `exportToMISP` in `actions/DnsFinder.js`**

Add the import at the top (alongside the existing `types` import list) — add `GET_THREATS_MONITORED` to the destructured import from `./types`.

Replace `exportToMISP`:

```javascript
export const exportToMISP = (id, event_uuid, domain_name, source) => (dispatch, getState) => {
    const payload = { id, event_uuid };
    if (source) payload.source = source;

    return axios
        .post('/api/dns_finder/misp/', payload, tokenConfig(getState))
        .then(res => {
            const message = res.data.message || `${domain_name} exported to MISP`;

            dispatch(createMessage({ add: message }));

            if (res.data.misp_event_uuid) {
                dispatch({
                    type: EXPORT_TO_MISP,
                    payload: {
                        id: id,
                        misp_event_uuid: res.data.misp_event_uuid,
                        message: message
                    }
                });
            }

            dispatch(getAlerts());

            return res.data;
        })
        .catch(err => {
            const errorMsg = err.response?.data?.message || 'Failed to export to MISP';
            dispatch(returnErrors(err.response?.data, err.response?.status));
            dispatch(createMessage({ error: errorMsg }));
            throw err;
        });
};
```

Add near `getDanglingAlerts` at the end of the file:

```javascript
// GET UNIFIED DNS THREATS MONITORED (dnstwist + certstream_keyword + subdomain_takeover)
export const getThreatsMonitored = (page = 1, pageSize = 100, filters = {}) => (dispatch, getState) => {
    const params = new URLSearchParams({ page, page_size: pageSize });
    Object.entries(filters).forEach(([key, value]) => {
        if (value) params.set(key, value);
    });

    return axios
        .get(`/api/dns_finder/threats_monitored/?${params.toString()}`, tokenConfig(getState))
        .then(res => {
            dispatch({
                type: GET_THREATS_MONITORED,
                payload: {
                    results: res.data.results || res.data,
                    count: res.data.count || 0,
                    next: res.data.next || null,
                    previous: res.data.previous || null
                }
            });
            return res.data;
        })
        .catch(err => {
            dispatch(returnErrors(err.response?.data, err.response?.status));
            throw err;
        });
};
```

- [ ] **Step 3: Extend the reducer**

In `Watcher/Watcher/frontend/src/reducers/DnsFinder.js`, add `GET_THREATS_MONITORED` to the import list from `../actions/types`.

Add to `initialState`:

```javascript
    threatsMonitored: [],
    threatsMonitoredCount: 0,
    threatsMonitoredNext: null,
    threatsMonitoredPrevious: null,
```

Add the new case, and extend `UPDATE_ALERT_STATUS`/`PATCH_DANGLING_SUBDOMAIN` to keep the merged list in sync without a full refetch (an Alert's `id` and a DanglingSubdomain's `id` are unrelated to a `threatsMonitored` item's `id` for the subdomain_takeover source — that item's `id` is the `DanglingAlert.id`, while the PATCH response is the `DanglingSubdomain`, so match on `technical_details.dangling_subdomain_id` for that source):

```javascript
        case UPDATE_ALERT_STATUS:
            return {
                ...state,
                alerts: state.alerts.map(alert =>
                    alert.id === action.payload.id ? action.payload : alert
                ),
                threatsMonitored: state.threatsMonitored.map(item =>
                    item.source !== 'subdomain_takeover' && item.id === action.payload.id
                        ? { ...item, status_tag: action.payload.status ? 'active' : 'archived' }
                        : item
                )
            };
```

(Replace the existing `UPDATE_ALERT_STATUS` case with the one above.)

```javascript
        case PATCH_DANGLING_SUBDOMAIN:
            return {
                ...state,
                danglingSubdomains: state.danglingSubdomains.map(sub =>
                    sub.id === action.payload.id ? action.payload : sub
                ),
                threatsMonitored: state.threatsMonitored.map(item =>
                    item.source === 'subdomain_takeover' &&
                    item.technical_details?.dangling_subdomain_id === action.payload.id
                        ? {
                            ...item,
                            status_tag: action.payload.status,
                            technical_details: {
                                ...item.technical_details,
                                provider: action.payload.provider,
                                cname_target: action.payload.cname_target,
                                http_status_code: action.payload.http_status_code,
                                last_checked_at: action.payload.last_checked_at
                            }
                        }
                        : item
                )
            };
```

(Replace the existing `PATCH_DANGLING_SUBDOMAIN` case with the one above.)

Add the new case near `GET_DANGLING_ALERTS`:

```javascript
        case GET_THREATS_MONITORED: {
            const newResults = action.payload.results || action.payload;

            if (!action.payload.results) {
                return {
                    ...state,
                    threatsMonitored: newResults,
                    threatsMonitoredCount: newResults.length,
                    threatsMonitoredNext: null,
                    threatsMonitoredPrevious: null
                };
            }

            const threatKey = (item) => `${item.source}:${item.id}`;
            const existingKeys = new Set(state.threatsMonitored.map(threatKey));
            const uniqueNewItems = newResults.filter(item => !existingKeys.has(threatKey(item)));

            return {
                ...state,
                threatsMonitored: [...state.threatsMonitored, ...uniqueNewItems],
                threatsMonitoredCount: action.payload.count || state.threatsMonitoredCount,
                threatsMonitoredNext: action.payload.next || null,
                threatsMonitoredPrevious: action.payload.previous || null
            };
        }
```

- [ ] **Step 4: Manual smoke check (no dedicated frontend unit test harness for actions/reducers in this repo)**

Run `npm run build` from the repo root and confirm no webpack/Babel errors. This task has no independently-runnable test; Task 9's component wiring and Task 12's Cypress test are what exercise this code end-to-end.

- [ ] **Step 5: Commit**

```bash
git add Watcher/Watcher/frontend/src/actions/types.js Watcher/Watcher/frontend/src/actions/DnsFinder.js Watcher/Watcher/frontend/src/reducers/DnsFinder.js
git commit -m "feat(frontend): unified threats actions, types and reducer wiring"
```

---

## Task 9: `ThreatsMonitored.js` component

**Files:**
- Create: `Watcher/Watcher/frontend/src/components/DnsFinder/ThreatsMonitored.js`
- Modify: `Watcher/Watcher/frontend/src/components/common/ExportModal.js` (new `subdomainTakeover` mode)

**Context:** Modeled directly on `SiteMonitoring/SuspiciousSites.js`'s table/actions/modal structure. Replaces `Alerts.js` + `ArchivedAlerts.js` + `DanglingSubdomains.js` — those three files are deleted in Task 11 once `Dashboard.js` no longer imports them.

**Interfaces:**
- Consumes: `state.DnsFinder.threatsMonitored`, `getThreatsMonitored`, `updateAlertStatus`, `patchDanglingSubdomain`, `exportToMISP`, `exportToLegitimateDomains`, `addSite`, `getSites` (all pre-existing except `getThreatsMonitored` from Task 8).
- Produces: default export `ThreatsMonitored`, imported by `Dashboard.js` in Task 11.

- [ ] **Step 1: Add the `subdomainTakeover` mode to `ExportModal.js`**

In `Watcher/Watcher/frontend/src/components/common/ExportModal.js`, in `render()`, replace:

```javascript
        if (mode === 'legitimate') {
            return this.renderMispModal();
        }
```

with:

```javascript
        if (mode === 'legitimate' || mode === 'subdomainTakeover') {
            return this.renderMispModal();
        }
```

(A dangling subdomain isn't a "legitimate domain" candidate — it's owned infrastructure with a stale DNS record — so `subdomainTakeover` mode skips straight to the MISP-only modal, same as `legitimate` mode does today.)

- [ ] **Step 2: Create `ThreatsMonitored.js`**

```javascript
import React, { Component, Fragment } from 'react';
import { connect } from 'react-redux';
import PropTypes from 'prop-types';
import {
    getThreatsMonitored, updateAlertStatus, patchDanglingSubdomain, exportToMISP
} from "../../actions/DnsFinder";
import { addSite, getSites } from "../../actions/SiteMonitoring";
import { exportToLegitimateDomains } from '../../actions/Common';
import { Button, Modal, Container, Row, Col, Form } from 'react-bootstrap';
import TableManager from '../common/TableManager';
import DateWithTooltip from '../common/DateWithTooltip';
import ExportModal from '../common/ExportModal';
import { TimelineModal, LastEventCell, LastEventHeader } from '../Timeline/TimelineModal';

const SOURCE_BADGES = {
    dnstwist: { label: 'Dnstwist Algorithm', className: 'bg-primary' },
    certstream_keyword: { label: 'Certificate Transparency Stream', className: 'bg-info text-dark' },
    subdomain_takeover: { label: 'Subdomain Takeover Detection', className: 'bg-danger' },
};

const DANGLING_STATUS_BADGES = {
    pending: { label: 'Pending', className: 'bg-secondary' },
    ok: { label: 'OK', className: 'bg-success' },
    dangling_suspected: { label: 'Suspected', className: 'bg-warning text-dark' },
    dangling_confirmed: { label: 'Confirmed', className: 'bg-danger' },
    resolved: { label: 'Resolved', className: 'bg-info text-dark' },
    false_positive: { label: 'False Positive', className: 'bg-dark' },
};

export class ThreatsMonitored extends Component {
    constructor(props) {
        super(props);
        this.state = {
            showDisableModal: false,
            showConfirmModal: false,
            confirmAction: null,
            confirmLabel: '',
            showAddModal: false,
            showExportModal: false,
            showDetailsModal: false,
            showTimelineModal: false,
            timelineId: null,
            timelineLabel: '',
            selectedItem: null,
            exportDomain: null,
            exportSourceData: null,
            exportMode: 'dnsFinder',
            domainName: '',
            isLoading: true,
        };
        this.inputTicketRef = React.createRef();
        this.ipMonitoringRef = React.createRef();
        this.webContentMonitoringRef = React.createRef();
        this.emailMonitoringRef = React.createRef();
    }

    static propTypes = {
        threatsMonitored: PropTypes.array.isRequired,
        sites: PropTypes.array.isRequired,
        getThreatsMonitored: PropTypes.func.isRequired,
        updateAlertStatus: PropTypes.func.isRequired,
        patchDanglingSubdomain: PropTypes.func.isRequired,
        exportToMISP: PropTypes.func.isRequired,
        exportToLegitimateDomains: PropTypes.func.isRequired,
        addSite: PropTypes.func.isRequired,
        getSites: PropTypes.func.isRequired,
        auth: PropTypes.object.isRequired,
        globalFilters: PropTypes.object,
        filteredData: PropTypes.array
    };

    componentDidMount() {
        this.props.getThreatsMonitored();
        this.props.getSites();
    }

    componentDidUpdate(prevProps) {
        if (this.props.threatsMonitored !== prevProps.threatsMonitored && this.state.isLoading) {
            this.setState({ isLoading: false });
        }
    }

    extractUUID = (raw) => {
        if (!raw) return [];
        if (Array.isArray(raw)) return raw.filter(uuid => uuid && uuid.trim() !== '');
        return raw.replace(/[\[\]'"\s]/g, '').split(',').filter(Boolean);
    };

    customFilters = (filtered, filters) => {
        const itemsToFilter = this.props.filteredData || this.props.threatsMonitored;
        const { globalFilters = {} } = this.props;

        filtered = itemsToFilter || [];

        if (globalFilters.search) {
            const term = globalFilters.search.toLowerCase();
            filtered = filtered.filter(item =>
                (item.domain_name || '').toLowerCase().includes(term) ||
                (item.corporate_dns || '').toLowerCase().includes(term) ||
                (item.corporate_keyword || '').toLowerCase().includes(term) ||
                (item.technical_details?.fuzzer || '').toLowerCase().includes(term) ||
                (item.technical_details?.provider || '').toLowerCase().includes(term)
            );
        }

        if (globalFilters.source) {
            filtered = filtered.filter(item => item.source === globalFilters.source);
        }
        if (globalFilters.corporate_dns) {
            filtered = filtered.filter(item => item.corporate_dns === globalFilters.corporate_dns);
        }
        if (globalFilters.fuzzer) {
            filtered = filtered.filter(item => item.technical_details?.fuzzer === globalFilters.fuzzer);
        }
        if (globalFilters.corporate_keyword) {
            filtered = filtered.filter(item => item.corporate_keyword === globalFilters.corporate_keyword);
        }
        if (globalFilters.provider) {
            filtered = filtered.filter(item => item.technical_details?.provider === globalFilters.provider);
        }
        if (globalFilters.cname_target) {
            filtered = filtered.filter(item => item.technical_details?.cname_target === globalFilters.cname_target);
        }
        if (globalFilters.dangling_status) {
            filtered = filtered.filter(item => item.source === 'subdomain_takeover' && item.status_tag === globalFilters.dangling_status);
        }

        return filtered;
    };

    isTakeover = (item) => item.source === 'subdomain_takeover';

    getMispStatusBadge = (item) => {
        const uuid = this.extractUUID(item.misp_event_uuid);
        return uuid.length ? (
            <span className="badge bg-info me-2" title="MISP Events">
                <i className="material-icons align-middle me-1" style={{ fontSize: 14 }}>cloud_done</i>
                {uuid.length}
            </span>
        ) : null;
    };

    renderStatusTag = (item) => {
        if (this.isTakeover(item)) {
            const badge = DANGLING_STATUS_BADGES[item.status_tag] || { label: item.status_tag, className: 'bg-secondary' };
            return <span className={`badge ${badge.className}`}>{badge.label}</span>;
        }
        return (
            <span className={`badge ${item.status_tag === 'active' ? 'bg-danger' : 'bg-secondary'}`}>
                {item.status_tag === 'active' ? 'Active' : 'Archived'}
            </span>
        );
    };

    renderSourceBadge = (item) => {
        const badge = SOURCE_BADGES[item.source] || { label: item.source, className: 'bg-secondary' };
        return <span className={`badge ${badge.className}`}>{badge.label}</span>;
    };

    displayDisableModal = (item) => {
        this.setState({ showDisableModal: true, selectedItem: item });
    };

    disableModal = () => {
        const handleClose = () => this.setState({ showDisableModal: false, selectedItem: null });
        const item = this.state.selectedItem;
        if (!item) return null;
        const isActive = item.status_tag === 'active';

        const onSubmit = e => {
            e.preventDefault();
            this.props.updateAlertStatus(item.id, { status: !isActive });
            handleClose();
        };

        return (
            <Modal show={this.state.showDisableModal} onHide={handleClose} centered>
                <Modal.Header closeButton>
                    <Modal.Title>Action Requested</Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    Are you sure you want to <b><u>{isActive ? 'disable' : 'enable'}</u></b> this alert?
                </Modal.Body>
                <Modal.Footer>
                    <form onSubmit={onSubmit}>
                        <Button variant="secondary" className="me-2" onClick={handleClose}>Close</Button>
                        <Button type="submit" variant="warning">Yes, I'm sure</Button>
                    </form>
                </Modal.Footer>
            </Modal>
        );
    };

    displayConfirmModal = (item, action, label) => {
        this.setState({ showConfirmModal: true, selectedItem: item, confirmAction: action, confirmLabel: label });
    };

    confirmModal = () => {
        const handleClose = () => this.setState({ showConfirmModal: false, selectedItem: null });
        const item = this.state.selectedItem;
        if (!item) return null;

        const onSubmit = e => {
            e.preventDefault();
            this.props.patchDanglingSubdomain(
                item.technical_details.dangling_subdomain_id, { status: this.state.confirmAction }
            );
            handleClose();
        };

        return (
            <Modal show={this.state.showConfirmModal} onHide={handleClose} centered>
                <Modal.Header closeButton>
                    <Modal.Title>Action Requested</Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    Are you sure you want to mark <b>{item.domain_name}</b> as <b>{this.state.confirmLabel}</b>?
                </Modal.Body>
                <Modal.Footer>
                    <form onSubmit={onSubmit}>
                        <Button variant="secondary" className="me-2" onClick={handleClose}>Close</Button>
                        <Button type="submit" variant="warning">Yes, I'm sure</Button>
                    </form>
                </Modal.Footer>
            </Modal>
        );
    };

    displayAddModal = (item) => {
        this.setState({ showAddModal: true, selectedItem: item, domainName: item.domain_name });
    };

    addModal = () => {
        const handleClose = () => this.setState({ showAddModal: false, selectedItem: null });
        const item = this.state.selectedItem;

        const onSubmit = e => {
            e.preventDefault();
            const domain_name = this.state.domainName;
            const ticket_id = this.inputTicketRef.current.value;
            const expiry = this.state.day;
            const ip_monitoring = this.ipMonitoringRef.current.checked;
            const content_monitoring = this.webContentMonitoringRef.current.checked;
            const mail_monitoring = this.emailMonitoringRef.current.checked;
            const site = expiry
                ? { domain_name, ticket_id, expiry, ip_monitoring, content_monitoring, mail_monitoring }
                : { domain_name, ticket_id, ip_monitoring, content_monitoring, mail_monitoring };

            this.props.addSite(site);
            handleClose();
        };

        return (
            <Modal show={this.state.showAddModal} onHide={handleClose} centered>
                <Modal.Header closeButton>
                    <Modal.Title>Action Requested</Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    <Container>
                        <Row className="show-grid">
                            <Col md={{ span: 12 }}>
                                <Form onSubmit={onSubmit}>
                                    <Form.Group as={Row}>
                                        <Form.Label column sm="4">Domain name</Form.Label>
                                        <Col sm="8">{item?.domain_name}</Col>
                                        <Form.Label column sm="4">Ticket ID</Form.Label>
                                        <Col sm="8">
                                            <Form.Control ref={this.inputTicketRef} size="md" type="text"
                                                          pattern="^[a-zA-Z0-9]+(-[a-zA-Z0-9]+)*(\.[a-zA-Z0-9]+(-[a-zA-Z0-9]+)*)*$"
                                                          placeholder="230509-200a2" />
                                        </Col>
                                        <Form.Label column sm="6">Ip Monitoring</Form.Label>
                                        <Col sm="6">
                                            <Form.Check ref={this.ipMonitoringRef} defaultChecked={true} className="mt-2" type="switch" id="threats-ip-monitoring" label="" />
                                        </Col>
                                        <Form.Label column sm="6">Web Content Monitoring</Form.Label>
                                        <Col sm="6">
                                            <Form.Check ref={this.webContentMonitoringRef} defaultChecked={true} className="mt-2" type="switch" id="threats-content-monitoring" label="" />
                                        </Col>
                                        <Form.Label column sm="6">Email Monitoring</Form.Label>
                                        <Col sm="6">
                                            <Form.Check ref={this.emailMonitoringRef} defaultChecked={true} className="mt-2" type="switch" id="threats-email-monitoring" label="" />
                                        </Col>
                                    </Form.Group>
                                    <Col md={{ span: 5, offset: 8 }}>
                                        <Button variant="secondary" className="me-2" onClick={handleClose}>Close</Button>
                                        <Button type="submit" variant="success">Add</Button>
                                    </Col>
                                </Form>
                            </Col>
                        </Row>
                    </Container>
                </Modal.Body>
            </Modal>
        );
    };

    isMonitored = (domainName) => this.props.sites.some(site => site.domain_name === domainName);

    displayExportModal = (item) => {
        const isTakeover = this.isTakeover(item);
        const td = item.technical_details;

        this.setState({
            showExportModal: true,
            exportMode: isTakeover ? 'subdomainTakeover' : 'dnsFinder',
            selectedItem: item,
            exportDomain: {
                id: item.id,
                domain_name: item.domain_name,
                misp_event_uuid: item.misp_event_uuid,
            },
            exportSourceData: isTakeover ? null : {
                dns_monitored: item.corporate_dns || null,
                keyword_monitored: item.corporate_keyword || null,
                fuzzer: td?.fuzzer || null,
            }
        });
    };

    closeExportModal = () => {
        this.setState({ showExportModal: false, exportDomain: null, exportSourceData: null, selectedItem: null });
        this.props.getThreatsMonitored();
    };

    handleMispExport = async ({ id, event_uuid }) => {
        const item = this.state.selectedItem;
        if (!item) return;
        await this.props.exportToMISP(id, event_uuid, item.domain_name, this.isTakeover(item) ? 'subdomain_takeover' : undefined);
    };

    handleLegitimateDomainExport = async ({ domain_name, comment }) => {
        try {
            await this.props.exportToLegitimateDomains({ domain_name }, comment);
            return { success: true };
        } catch (err) {
            console.error('Export to Legitimate Domains failed:', err);
            throw err;
        }
    };

    handleDeleteRequest = async (alertId, domainName) => {
        try {
            await this.props.updateAlertStatus(alertId, { status: false });
            await new Promise(resolve => setTimeout(resolve, 300));
            await this.props.getThreatsMonitored();
        } catch (err) {
            console.error('Failed to archive alert:', err);
        }
    };

    displayDetailsModal = (item) => {
        this.setState({ showDetailsModal: true, selectedItem: item });
    };

    detailsModal = () => {
        const handleClose = () => this.setState({ showDetailsModal: false, selectedItem: null });
        const item = this.state.selectedItem;
        if (!item) return null;
        const td = item.technical_details || {};

        const renderFields = () => {
            if (item.source === 'dnstwist') {
                return (
                    <Fragment>
                        <Form.Label column sm="4">Fuzzer</Form.Label>
                        <Col sm="8" className="mt-2">{td.fuzzer || '-'}</Col>
                        <Form.Label column sm="4">Corporate DNS</Form.Label>
                        <Col sm="8" className="mt-2">{td.corporate_dns || '-'}</Col>
                        <Form.Label column sm="4">Detected At</Form.Label>
                        <Col sm="8" className="mt-2"><DateWithTooltip date={td.detected_at} includeTime={true} type="created" /></Col>
                    </Fragment>
                );
            }
            if (item.source === 'certstream_keyword') {
                return (
                    <Fragment>
                        <Form.Label column sm="4">Corporate Keyword</Form.Label>
                        <Col sm="8" className="mt-2">{td.corporate_keyword || '-'}</Col>
                        <Form.Label column sm="4">Issuer</Form.Label>
                        <Col sm="8" className="mt-2">{td.issuer || '-'}</Col>
                        <Form.Label column sm="4">SAN</Form.Label>
                        <Col sm="8" className="mt-2">{Array.isArray(td.san_list) && td.san_list.length ? td.san_list.join(', ') : '-'}</Col>
                        <Form.Label column sm="4">Not Before</Form.Label>
                        <Col sm="8" className="mt-2"><DateWithTooltip date={td.not_before} includeTime={true} type="created" /></Col>
                        <Form.Label column sm="4">Not After</Form.Label>
                        <Col sm="8" className="mt-2"><DateWithTooltip date={td.not_after} includeTime={true} type="expiry" /></Col>
                        <Form.Label column sm="4">Serial Number</Form.Label>
                        <Col sm="8" className="mt-2">{td.serial_number || '-'}</Col>
                        <Form.Label column sm="4">Fingerprint SHA-256</Form.Label>
                        <Col sm="8" className="mt-2" style={{ wordBreak: 'break-all' }}>{td.fingerprint_sha256 || '-'}</Col>
                    </Fragment>
                );
            }
            return (
                <Fragment>
                    <Form.Label column sm="4">Provider</Form.Label>
                    <Col sm="8" className="mt-2">{td.provider || '-'}</Col>
                    <Form.Label column sm="4">CNAME Target</Form.Label>
                    <Col sm="8" className="mt-2">{td.cname_target || '-'}</Col>
                    <Form.Label column sm="4">HTTP Status</Form.Label>
                    <Col sm="8" className="mt-2">{td.http_status_code || '-'}</Col>
                    <Form.Label column sm="4">Last Checked</Form.Label>
                    <Col sm="8" className="mt-2"><DateWithTooltip date={td.last_checked_at} includeTime={true} type="checked" /></Col>
                    <Form.Label column sm="4">Corporate DNS</Form.Label>
                    <Col sm="8" className="mt-2">{td.corporate_dns || '-'}</Col>
                </Fragment>
            );
        };

        return (
            <Modal show={this.state.showDetailsModal} onHide={handleClose} centered>
                <Modal.Header closeButton>
                    <Modal.Title>Technical details for <b>{item.domain_name}</b></Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    <Container>
                        <Row className="show-grid">
                            <Col md={12}>
                                <Form.Group as={Row}>{renderFields()}</Form.Group>
                                <Col md={{ span: 3, offset: 10 }}>
                                    <Button variant="secondary" onClick={handleClose}>Close</Button>
                                </Col>
                            </Col>
                        </Row>
                    </Container>
                </Modal.Body>
            </Modal>
        );
    };

    render() {
        const { globalFilters, filteredData, threatsMonitored } = this.props;
        const dataToUse = filteredData || threatsMonitored;
        const { showTimelineModal, timelineId, timelineLabel } = this.state;

        const renderLoadingState = () => (
            <tr>
                <td colSpan="6" className="text-center py-5">
                    <div className="d-flex flex-column align-items-center">
                        <div className="spinner-border text-primary mb-3" role="status">
                            <span className="visually-hidden">Loading...</span>
                        </div>
                        <p className="text-muted mb-0">Loading data...</p>
                    </div>
                </td>
            </tr>
        );

        return (
            <Fragment>
                <div className="row">
                    <div className="col-lg-12">
                        <div className="float-start" style={{ marginBottom: 12 }}>
                            <h4>DNS Threats Monitored</h4>
                        </div>
                    </div>
                </div>

                <TableManager
                    data={dataToUse}
                    filterConfig={[]}
                    customFilters={this.customFilters}
                    searchFields={['domain_name', 'corporate_dns', 'corporate_keyword']}
                    dateFields={['created_at']}
                    defaultSort="created_at"
                    globalFilters={globalFilters}
                    moduleKey="dnsFinder_threats"
                >
                    {({
                        paginatedData, renderItemsInfo, renderPagination, handleSort, renderSortIcons,
                        getTableContainerStyle, theadRef
                    }) => (
                        <Fragment>
                            {renderItemsInfo()}
                            <div className="row">
                                <div className="col-lg-12">
                                    <div style={{ ...getTableContainerStyle(), overflowX: 'auto' }}>
                                        <table className="table table-striped table-hover">
                                            <thead ref={theadRef}>
                                                <tr>
                                                    <th style={{ cursor: 'pointer' }} onClick={() => handleSort('domain_name')}>
                                                        Domain Name{renderSortIcons('domain_name')}
                                                    </th>
                                                    <th style={{ cursor: 'pointer' }} onClick={() => handleSort('source')}>
                                                        Source{renderSortIcons('source')}
                                                    </th>
                                                    <th>Corporate Keyword</th>
                                                    <th style={{ cursor: 'pointer' }} onClick={() => handleSort('corporate_dns')}>
                                                        Corporate DNS{renderSortIcons('corporate_dns')}
                                                    </th>
                                                    <th style={{ cursor: 'pointer' }} onClick={() => handleSort('created_at')}>
                                                        Created At{renderSortIcons('created_at')}
                                                    </th>
                                                    <th />
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {this.state.isLoading ? renderLoadingState() : paginatedData.length === 0 ? (
                                                    <tr><td colSpan="6" className="text-center text-muted py-4">No results found</td></tr>
                                                ) : (
                                                    paginatedData.map(item => (
                                                        <tr key={`${item.source}-${item.id}`}>
                                                            <td>
                                                                <div>
                                                                    <strong>
                                                                        {this.getMispStatusBadge(item)}
                                                                        {item.domain_name}
                                                                    </strong>
                                                                    <div style={{ marginTop: 4 }}>{this.renderStatusTag(item)}</div>
                                                                </div>
                                                            </td>
                                                            <td>{this.renderSourceBadge(item)}</td>
                                                            <td>{item.corporate_keyword || '-'}</td>
                                                            <td>{item.corporate_dns || '-'}</td>
                                                            <td><DateWithTooltip date={item.created_at} includeTime={true} type="created" /></td>
                                                            <td className="text-end" style={{ whiteSpace: 'nowrap' }}>
                                                                <button onClick={() => this.displayDetailsModal(item)} className="btn btn-outline-info btn-sm me-2" title="Technical Details">
                                                                    <i className="material-icons" style={{ fontSize: 17, lineHeight: 1.8, margin: -2.5 }}>info</i>
                                                                </button>
                                                                <button onClick={() => this.displayExportModal(item)} className="btn btn-outline-primary btn-sm me-2" title="Export">
                                                                    <i className="material-icons" style={{ fontSize: 17, lineHeight: 1.8, margin: -2.5 }}>
                                                                        {this.extractUUID(item.misp_event_uuid).length ? 'cloud_done' : 'cloud_upload'}
                                                                    </i>
                                                                </button>
                                                                {!this.isTakeover(item) && (
                                                                    <Fragment>
                                                                        <button
                                                                            onClick={() => this.displayAddModal(item)}
                                                                            className={`btn btn-sm me-2 ${this.isMonitored(item.domain_name) ? 'btn-success' : 'btn-secondary'}`}
                                                                            title={this.isMonitored(item.domain_name) ? `${item.domain_name} is monitored` : `Monitor ${item.domain_name}`}
                                                                            disabled={this.isMonitored(item.domain_name)}
                                                                        >
                                                                            <i className="material-icons" style={{ fontSize: 17, lineHeight: 1.8, margin: -2.5 }}>
                                                                                {this.isMonitored(item.domain_name) ? 'playlist_add_check' : 'playlist_add'}
                                                                            </i>
                                                                        </button>
                                                                        <button onClick={() => this.displayDisableModal(item)} className="btn btn-outline-primary btn-sm me-2">
                                                                            {item.status_tag === 'active' ? 'Disable' : 'Enable'}
                                                                        </button>
                                                                    </Fragment>
                                                                )}
                                                                {this.isTakeover(item) && (
                                                                    <Fragment>
                                                                        <button className="btn btn-outline-success btn-sm me-2" title="Mark Resolved"
                                                                                onClick={() => this.displayConfirmModal(item, 'resolved', 'Resolved')}>
                                                                            <i className="material-icons" style={{ fontSize: 17, lineHeight: 1.8, margin: -2.5 }}>check_circle</i>
                                                                        </button>
                                                                        <button className="btn btn-outline-secondary btn-sm me-2" title="Mark False Positive"
                                                                                onClick={() => this.displayConfirmModal(item, 'false_positive', 'False Positive')}>
                                                                            <i className="material-icons" style={{ fontSize: 17, lineHeight: 1.8, margin: -2.5 }}>block</i>
                                                                        </button>
                                                                        <button className="btn btn-outline-warning btn-sm me-2" title="Re-check"
                                                                                onClick={() => this.displayConfirmModal(item, 'pending', 'Pending Re-check')}>
                                                                            <i className="material-icons" style={{ fontSize: 17, lineHeight: 1.8, margin: -2.5 }}>refresh</i>
                                                                        </button>
                                                                        <button
                                                                            className="btn btn-outline-secondary btn-sm"
                                                                            title="History"
                                                                            onClick={() => this.setState({
                                                                                showTimelineModal: true,
                                                                                timelineId: item.technical_details.dangling_subdomain_id,
                                                                                timelineLabel: item.domain_name
                                                                            })}
                                                                        >
                                                                            <i className="material-icons" style={{ fontSize: 17, lineHeight: 1.8, margin: -2.5 }}>history</i>
                                                                        </button>
                                                                    </Fragment>
                                                                )}
                                                            </td>
                                                        </tr>
                                                    ))
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                            {renderPagination()}
                        </Fragment>
                    )}
                </TableManager>

                {this.disableModal()}
                {this.confirmModal()}
                {this.addModal()}
                {this.detailsModal()}

                <ExportModal
                    show={this.state.showExportModal}
                    domain={this.state.exportDomain}
                    sourceData={this.state.exportSourceData}
                    alertId={this.state.selectedItem?.id}
                    onClose={this.closeExportModal}
                    onMispExport={this.handleMispExport}
                    onLegitimateDomainExport={this.handleLegitimateDomainExport}
                    onDeleteRequest={this.handleDeleteRequest}
                    mode={this.state.exportMode}
                />

                <TimelineModal
                    show={showTimelineModal}
                    onHide={() => this.setState({ showTimelineModal: false, timelineId: null, timelineLabel: '' })}
                    contentType="dns_finder.danglingsubdomain"
                    objectId={timelineId}
                    label={timelineLabel}
                />
            </Fragment>
        );
    }
}

const mapStateToProps = state => ({
    threatsMonitored: state.DnsFinder.threatsMonitored,
    sites: state.SiteMonitoring.sites,
    auth: state.auth,
    error: state.errors
});

export default connect(mapStateToProps, {
    getThreatsMonitored, updateAlertStatus, patchDanglingSubdomain, exportToMISP,
    exportToLegitimateDomains, addSite, getSites
})(ThreatsMonitored);
```

- [ ] **Step 3: Manual smoke check**

Run `npm run build` from the repo root. Expected: no Babel/webpack errors (import cycles, missing exports, JSX syntax).

- [ ] **Step 4: Commit**

```bash
git add Watcher/Watcher/frontend/src/components/DnsFinder/ThreatsMonitored.js Watcher/Watcher/frontend/src/components/common/ExportModal.js
git commit -m "feat(frontend): ThreatsMonitored component with per-source technical details modal"
```

---

## Task 10: Corporate DNS Asset detail modal on `DnsMonitored.js`

**Files:**
- Modify: `Watcher/Watcher/frontend/src/components/DnsFinder/DnsMonitored.js`
- Modify: `Watcher/Watcher/frontend/src/actions/DnsFinder.js` (new `getDnsMonitoredDanglingSubdomains` action — not stored in Redux, resolved on demand per spec §2.3)

**Context:** Replaces the deleted `Dangling Subdomains` panel: clicking an action on a `DnsMonitored` row now opens a modal listing every `DanglingSubdomain` tracked for that asset (including `pending`/`ok` rows that never alerted), fetched only when the modal opens (§2.3 — "appelé uniquement à l'ouverture de la modale détail").

**Interfaces:**
- Produces: `getDnsMonitoredDanglingSubdomains(dnsMonitoredId) -> Promise<array>` (plain promise-returning thunk, no reducer case — the component holds the result in local state, matching §2.3's "not embedded in the list serializer" intent).
- Consumes: `GET /api/dns_finder/dns_monitored/{id}/dangling_subdomains/` (Task 6).

- [ ] **Step 1: Add the action**

In `Watcher/Watcher/frontend/src/actions/DnsFinder.js`, add near `getDnsMonitored`:

```javascript
// GET DANGLING SUBDOMAINS FOR ONE CORPORATE DNS ASSET (on-demand, not stored in Redux)
export const getDnsMonitoredDanglingSubdomains = (dnsMonitoredId) => (dispatch, getState) => {
    return axios
        .get(`/api/dns_finder/dns_monitored/${dnsMonitoredId}/dangling_subdomains/`, tokenConfig(getState))
        .then(res => res.data)
        .catch(err => {
            dispatch(returnErrors(err.response?.data, err.response?.status));
            throw err;
        });
};
```

- [ ] **Step 2: Wire the modal into `DnsMonitored.js`**

In `Watcher/Watcher/frontend/src/components/DnsFinder/DnsMonitored.js`:

Add to the imports:

```javascript
import { getDnsMonitored, deleteDnsMonitored, addDnsMonitored, patchDnsMonitored, getDnsMonitoredDanglingSubdomains } from "../../actions/DnsFinder";
```

Add to `propTypes`:

```javascript
        getDnsMonitoredDanglingSubdomains: PropTypes.func.isRequired,
```

Add to `state` in the constructor:

```javascript
            showDanglingModal: false,
            danglingSubdomains: [],
            danglingLoading: false,
            danglingDomainName: '',
```

Add these two methods (near `displayEditModal`):

```javascript
    displayDanglingModal = (domain) => {
        this.setState({ showDanglingModal: true, danglingLoading: true, danglingDomainName: domain.domain_name, danglingSubdomains: [] });
        this.props.getDnsMonitoredDanglingSubdomains(domain.id)
            .then(subdomains => this.setState({ danglingSubdomains: subdomains, danglingLoading: false }))
            .catch(() => this.setState({ danglingLoading: false }));
    };

    danglingModal = () => {
        const handleClose = () => this.setState({ showDanglingModal: false, danglingSubdomains: [] });
        const STATUS_BADGES = {
            pending: { label: 'Pending', className: 'bg-secondary' },
            ok: { label: 'OK', className: 'bg-success' },
            dangling_suspected: { label: 'Suspected', className: 'bg-warning text-dark' },
            dangling_confirmed: { label: 'Confirmed', className: 'bg-danger' },
            resolved: { label: 'Resolved', className: 'bg-info text-dark' },
            false_positive: { label: 'False Positive', className: 'bg-dark' },
        };

        return (
            <Modal show={this.state.showDanglingModal} onHide={handleClose} centered size="lg">
                <Modal.Header closeButton>
                    <Modal.Title>Dangling Subdomains for <b>{this.state.danglingDomainName}</b></Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    {this.state.danglingLoading ? (
                        <div className="d-flex flex-column align-items-center py-4">
                            <div className="spinner-border text-primary mb-2" role="status">
                                <span className="visually-hidden">Loading...</span>
                            </div>
                        </div>
                    ) : this.state.danglingSubdomains.length === 0 ? (
                        <p className="text-muted text-center py-4 mb-0">No subdomains tracked for this asset yet.</p>
                    ) : (
                        <table className="table table-striped table-hover mb-0">
                            <thead>
                                <tr>
                                    <th>Subdomain</th>
                                    <th>Provider</th>
                                    <th>CNAME Target</th>
                                    <th>Status</th>
                                    <th>Last Checked</th>
                                </tr>
                            </thead>
                            <tbody>
                                {this.state.danglingSubdomains.map(sub => {
                                    const badge = STATUS_BADGES[sub.status] || { label: sub.status, className: 'bg-secondary' };
                                    return (
                                        <tr key={sub.id}>
                                            <td>{sub.subdomain}</td>
                                            <td>{sub.provider || '-'}</td>
                                            <td>{sub.cname_target || '-'}</td>
                                            <td><span className={`badge ${badge.className}`}>{badge.label}</span></td>
                                            <td>
                                                <DateWithTooltip date={sub.last_checked_at} includeTime={true} type="checked" />
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}
                </Modal.Body>
                <Modal.Footer>
                    <Button variant="secondary" onClick={handleClose}>Close</Button>
                </Modal.Footer>
            </Modal>
        );
    };
```

In `render()`, add a new action button next to the existing Edit/Delete/History buttons (inside the `canManage && (...)` block, or as its own unconditional button since viewing is read-only and shouldn't require `canManage` — place it just before the `{canManage && (` block):

```javascript
                                                                <button
                                                                    className="btn btn-outline-secondary btn-sm me-2"
                                                                    data-toggle="tooltip"
                                                                    data-placement="top"
                                                                    title="View Dangling Subdomains"
                                                                    onClick={() => this.displayDanglingModal(domain)}
                                                                >
                                                                    <i className="material-icons" style={{ fontSize: 17, lineHeight: 1.8, margin: -2.5 }}>link_off</i>
                                                                </button>
```

Add `{this.danglingModal()}` next to the other modal renders at the bottom of `render()` (alongside `{this.deleteModal()}{this.editModal()}{this.addModal()}`).

Update `mapStateToProps`/`connect` at the bottom of the file to include the new action:

```javascript
export default connect(mapStateToProps, {
    getDnsMonitored,
    deleteDnsMonitored,
    addDnsMonitored,
    patchDnsMonitored,
    getDnsMonitoredDanglingSubdomains
})(DnsMonitored);
```

- [ ] **Step 3: Manual smoke check**

Run `npm run build`. Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add Watcher/Watcher/frontend/src/components/DnsFinder/DnsMonitored.js Watcher/Watcher/frontend/src/actions/DnsFinder.js
git commit -m "feat(frontend): Corporate DNS Asset detail modal"
```

---

## Task 11: Dashboard layout, stats panel, and old-panel removal

**Files:**
- Modify: `Watcher/Watcher/frontend/src/components/DnsFinder/Dashboard.js`
- Modify: `Watcher/Watcher/frontend/src/components/DnsFinder/DnsFinderStats.js`
- Modify: `Watcher/Watcher/frontend/src/config/layoutPresets.js` (`DNS_PRESETS`)
- Delete: `Watcher/Watcher/frontend/src/components/DnsFinder/Alerts.js`
- Delete: `Watcher/Watcher/frontend/src/components/DnsFinder/ArchivedAlerts.js`
- Delete: `Watcher/Watcher/frontend/src/components/DnsFinder/DanglingSubdomains.js`

**Interfaces:**
- Consumes: `ThreatsMonitored` (Task 9), `getThreatsMonitored` (Task 8).

- [ ] **Step 1: Rewrite `Dashboard.js`**

Replace the whole file:

```javascript
import React, {Component, Fragment} from 'react';
import { connect } from 'react-redux';
import { getThreatsMonitored, getDnsMonitored, getKeywordMonitored } from "../../actions/DnsFinder";
import ThreatsMonitored from "./ThreatsMonitored";
import DnsMonitored from "./DnsMonitored";
import KeywordMonitored from "./KeywordMonitored";
import TableManager from '../common/TableManager';
import DnsFinderStats from "./DnsFinderStats";
import PanelGrid from '../common/PanelGrid';
import { LAYOUT_PRESETS } from '../../config/layoutPresets';

const DEFAULT_LAYOUT = [
    { i: 'stats',    x: 0, y: 0,  w: 12, h: 8,  minW: 6, minH: 3 },
    { i: 'threats',  x: 0, y: 8,  w: 12, h: 14, minW: 6, minH: 6 },
    { i: 'dns',      x: 0, y: 22, w: 6,  h: 11, minW: 3, minH: 5 },
    { i: 'keywords', x: 6, y: 22, w: 6,  h: 11, minW: 3, minH: 5 },
];

const DEFAULT_ACTIVE = ['stats', 'threats', 'dns', 'keywords'];

const SOURCE_OPTIONS = [
    { value: 'dnstwist', label: 'Dnstwist Algorithm' },
    { value: 'certstream_keyword', label: 'Certificate Transparency Stream' },
    { value: 'subdomain_takeover', label: 'Subdomain Takeover Detection' },
];

const DANGLING_STATUS_OPTIONS = [
    { value: 'pending', label: 'Pending' },
    { value: 'ok', label: 'OK' },
    { value: 'dangling_suspected', label: 'Suspected' },
    { value: 'dangling_confirmed', label: 'Confirmed' },
    { value: 'resolved', label: 'Resolved' },
    { value: 'false_positive', label: 'False Positive' },
];

class Dashboard extends Component {
    constructor(props) {
        super(props);
        this.state = {
            globalFilters: {
                search: '',
                source: '',
                corporate_dns: '',
                fuzzer: '',
                corporate_keyword: '',
                provider: '',
                cname_target: '',
                dangling_status: ''
            },
            filteredThreats: [],
            isLoadingInBackground: false,
            allDataLoaded: false
        };
        this.loadingTimer = null;
    }

    componentDidMount() {
        this.loadInitialData();
    }

    componentWillUnmount() {
        if (this.loadingTimer) {
            clearTimeout(this.loadingTimer);
        }
    }

    loadInitialData = async () => {
        try {
            await this.props.getThreatsMonitored(1, 100);

            await Promise.all([
                this.props.getDnsMonitored(1, 100),
                this.props.getKeywordMonitored(1, 100)
            ]);

            this.loadingTimer = setTimeout(() => {
                this.loadRemainingDataInBackground();
            }, 500);
        } catch (error) {
        }
    };

    loadRemainingDataInBackground = async () => {
        const { threatsMonitoredNext, dnsMonitoredNext, keywordMonitoredNext } = this.props;

        if (!threatsMonitoredNext && !dnsMonitoredNext && !keywordMonitoredNext) {
            return;
        }

        this.setState({ isLoadingInBackground: true });

        try {
            if (threatsMonitoredNext) {
                let currentPage = 2;
                let hasMore = true;
                while (hasMore) {
                    try {
                        const response = await this.props.getThreatsMonitored(currentPage, 100);
                        hasMore = response?.next !== null;
                        currentPage++;
                        if (hasMore) await new Promise(resolve => setTimeout(resolve, 300));
                    } catch (error) {
                        hasMore = false;
                    }
                }
            }

            if (dnsMonitoredNext) {
                let currentPage = 2;
                let hasMore = true;
                while (hasMore) {
                    try {
                        const response = await this.props.getDnsMonitored(currentPage, 100);
                        hasMore = response?.next !== null;
                        currentPage++;
                        if (hasMore) await new Promise(resolve => setTimeout(resolve, 200));
                    } catch (error) {
                        hasMore = false;
                    }
                }
            }

            if (keywordMonitoredNext) {
                let currentPage = 2;
                let hasMore = true;
                while (hasMore) {
                    try {
                        const response = await this.props.getKeywordMonitored(currentPage, 100);
                        hasMore = response?.next !== null;
                        currentPage++;
                        if (hasMore) await new Promise(resolve => setTimeout(resolve, 200));
                    } catch (error) {
                        hasMore = false;
                    }
                }
            }

            this.setState({ allDataLoaded: true, isLoadingInBackground: false });
        } catch (error) {
            this.setState({ isLoadingInBackground: false });
        }
    };

    getFilterConfig = () => {
        const { dnsMonitored, threatsMonitored } = this.props;
        const { globalFilters } = this.state;
        const uniqueDomains = [...new Set((dnsMonitored || []).map(d => d.domain_name).filter(Boolean))].sort();

        const base = [
            {
                key: 'search',
                type: 'search',
                label: 'Search',
                placeholder: 'Search domains, keywords, providers...',
                width: 3
            },
            {
                key: 'source',
                type: 'select',
                label: 'Source',
                width: 2,
                options: SOURCE_OPTIONS
            },
            {
                key: 'corporate_dns',
                type: 'select',
                label: 'Corporate DNS',
                width: 2,
                options: uniqueDomains.map(domain => ({ value: domain, label: domain }))
            }
        ];

        // Per-source dynamic filters (spec 3.4): only show the filter relevant
        // to the currently-selected source, since TableManager renders every
        // entry in filterConfig unconditionally.
        if (globalFilters.source === 'dnstwist') {
            const uniqueFuzzers = [...new Set(
                (threatsMonitored || [])
                    .filter(t => t.source === 'dnstwist')
                    .map(t => t.technical_details?.fuzzer)
                    .filter(Boolean)
            )].sort();
            base.push({ key: 'fuzzer', type: 'select', label: 'Fuzzer', width: 2, options: uniqueFuzzers.map(f => ({ value: f, label: f })) });
        }

        if (globalFilters.source === 'certstream_keyword') {
            const uniqueKeywords = [...new Set(
                (threatsMonitored || [])
                    .filter(t => t.source === 'certstream_keyword')
                    .map(t => t.corporate_keyword)
                    .filter(Boolean)
            )].sort();
            base.push({ key: 'corporate_keyword', type: 'select', label: 'Corporate Keyword', width: 2, options: uniqueKeywords.map(k => ({ value: k, label: k })) });
        }

        if (globalFilters.source === 'subdomain_takeover') {
            const uniqueProviders = [...new Set(
                (threatsMonitored || [])
                    .filter(t => t.source === 'subdomain_takeover')
                    .map(t => t.technical_details?.provider)
                    .filter(Boolean)
            )].sort();
            base.push({ key: 'provider', type: 'select', label: 'Provider', width: 2, options: uniqueProviders.map(p => ({ value: p, label: p })) });
            base.push({ key: 'dangling_status', type: 'select', label: 'Status', width: 2, options: DANGLING_STATUS_OPTIONS });
        }

        return base;
    };

    handleFilterChange = (filters) => {
        this.setState({
            globalFilters: {
                search: filters.search || '',
                source: filters.source || '',
                corporate_dns: filters.corporate_dns || '',
                fuzzer: filters.fuzzer || '',
                corporate_keyword: filters.corporate_keyword || '',
                provider: filters.provider || '',
                cname_target: filters.cname_target || '',
                dangling_status: filters.dangling_status || ''
            }
        });
    };

    onDataFiltered = (filteredData) => {
        this.setState({ filteredThreats: filteredData });
    };

    buildPanels() {
        const { globalFilters, filteredThreats } = this.state;
        const { threatsMonitored } = this.props;
        const filterConfig = this.getFilterConfig();
        const dataToPass = filteredThreats.length > 0 ? filteredThreats : threatsMonitored;

        return {
            stats: {
                label: 'Statistics',
                icon: 'bar_chart',
                tooltip: 'Overview of DNS threats across all three detection sources',
                children: (
                    <div style={{ padding: '12px 16px', height: '100%', overflowY: 'auto' }}>
                        <DnsFinderStats />
                    </div>
                ),
            },
            threats: {
                label: 'DNS Threats Monitored',
                icon: 'gpp_maybe',
                tooltip: 'Dnstwist, Certificate Transparency Stream and Subdomain Takeover detections, unified',
                children: (
                    <div style={{ padding: '12px 16px', height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                        <TableManager
                            data={threatsMonitored}
                            filterConfig={filterConfig}
                            onFiltersChange={this.handleFilterChange}
                            onDataFiltered={this.onDataFiltered}
                            enableDateFilter={true}
                            dateFields={['created_at']}
                            dateFilterWidth={2}
                            searchFields={['domain_name', 'corporate_dns', 'corporate_keyword']}
                            defaultSort="created_at"
                            moduleKey="dnsFinder"
                        >
                            {({ renderFilterControls, renderFilters, renderSaveModal }) => (
                                <Fragment>
                                    {renderFilterControls()}
                                    {renderFilters()}
                                    {renderSaveModal()}
                                </Fragment>
                            )}
                        </TableManager>
                        <ThreatsMonitored globalFilters={globalFilters} filteredData={dataToPass} />
                    </div>
                ),
            },
            dns: {
                label: 'Corporate DNS Assets Monitored',
                icon: 'dns',
                tooltip: 'Corporate domains watched for typosquatting, phishing variants, and subdomain takeover',
                children: (
                    <div style={{ padding: '12px 16px', height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                        <DnsMonitored globalFilters={globalFilters} />
                    </div>
                ),
            },
            keywords: {
                label: 'Corporate Keywords Monitored',
                icon: 'search',
                tooltip: 'Keywords used to detect suspicious domain registrations in CertStream',
                children: (
                    <div style={{ padding: '12px 16px', height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                        <KeywordMonitored globalFilters={globalFilters} />
                    </div>
                ),
            },
        };
    }

    render() {
        return (
            <Fragment>
                <PanelGrid
                    panels={this.buildPanels()}
                    defaultLayout={DEFAULT_LAYOUT}
                    defaultActive={DEFAULT_ACTIVE}
                    storageKey="watcher_dns_finder_grid"
                    layoutPresets={LAYOUT_PRESETS['watcher_dns_finder_grid']}
                />
            </Fragment>
        );
    }
}

const mapStateToProps = state => ({
    threatsMonitored: state.DnsFinder.threatsMonitored || [],
    threatsMonitoredCount: state.DnsFinder.threatsMonitoredCount || 0,
    threatsMonitoredNext: state.DnsFinder.threatsMonitoredNext || null,
    dnsMonitored: state.DnsFinder.dnsMonitored || [],
    dnsMonitoredNext: state.DnsFinder.dnsMonitoredNext || null,
    keywordMonitored: state.DnsFinder.keywordMonitored || [],
    keywordMonitoredNext: state.DnsFinder.keywordMonitoredNext || null
});

export default connect(mapStateToProps, {getThreatsMonitored, getDnsMonitored, getKeywordMonitored})(Dashboard);
```

- [ ] **Step 2: Update `DnsFinderStats.js` to reflect the 3 sources**

In `Watcher/Watcher/frontend/src/components/DnsFinder/DnsFinderStats.js`, replace the "Dangling Subdomains" KPI card's label to be explicit about the unified terminology, and add a "Subdomain Takeover" line to the top-fuzzers-style breakdown is out of scope (spec only asks the stats panel to "reflect the 3 sources", the existing KPI row already has a dedicated `Dangling Subdomains` card wired to `statistics.totalDanglingConfirmed`). Replace only the label for clarity:

```javascript
                    <div className="col mb-2">
                        <KpiCard title="Subdomain Takeover" value={statistics.totalDanglingConfirmed ?? 0}
                                 sub="confirmed takeover risk" icon="link_off" variant="danger" />
                    </div>
```

(This replaces the existing `<KpiCard title="Dangling Subdomains" ...>` block — same data source, renamed to match the new "Subdomain Takeover Detection" source label used throughout `ThreatsMonitored.js`.)

- [ ] **Step 3: Update `layoutPresets.js`'s `DNS_PRESETS`**

In `Watcher/Watcher/frontend/src/config/layoutPresets.js`, replace the entire `DNS_PRESETS` array:

```javascript
//DNS Finder
const DNS_PRESETS = [
    {
        id: 'default',
        name: 'Standard',
        description: 'Full view: stats, unified DNS threats, corporate assets and keywords.',
        icon: 'dashboard',
        layout: [
            { i: 'stats',    x: 0, y: 0,  w: 12, h: 8,  minW: 6, minH: 3 },
            { i: 'threats',  x: 0, y: 8,  w: 12, h: 14, minW: 6, minH: 6 },
            { i: 'dns',      x: 0, y: 22, w: 6,  h: 11, minW: 3, minH: 5 },
            { i: 'keywords', x: 6, y: 22, w: 6,  h: 11, minW: 3, minH: 5 },
        ],
        active: ['stats', 'threats', 'dns', 'keywords'],
    },
    {
        id: 'triage',
        name: 'Threat Triage',
        description: 'Rapid threat review: stats and the full unified threats table - no asset/keyword panels.',
        icon: 'warning',
        layout: [
            { i: 'stats',    x: 0, y: 0,  w: 12, h: 6,  minW: 6, minH: 3 },
            { i: 'threats',  x: 0, y: 6,  w: 12, h: 22, minW: 6, minH: 6 },
        ],
        active: ['stats', 'threats'],
    },
    {
        id: 'management',
        name: 'Asset Management',
        description: 'Corporate DNS assets and keyword configuration side by side.',
        icon: 'find_in_page',
        layout: [
            { i: 'stats',    x: 0, y: 0,  w: 12, h: 6,  minW: 6, minH: 3 },
            { i: 'keywords', x: 0, y: 6,  w: 5,  h: 14, minW: 3, minH: 5 },
            { i: 'dns',      x: 5, y: 6,  w: 7,  h: 14, minW: 3, minH: 5 },
        ],
        active: ['stats', 'keywords', 'dns'],
    },
    {
        id: 'minimal',
        name: 'Minimal',
        description: 'Stats and threats table only - stripped down.',
        icon: 'crop_free',
        layout: [
            { i: 'stats',   x: 0, y: 0, w: 12, h: 8,  minW: 6, minH: 3 },
            { i: 'threats', x: 0, y: 8, w: 12, h: 16, minW: 6, minH: 6 },
        ],
        active: ['stats', 'threats'],
    },
];
```

- [ ] **Step 4: Delete the three superseded components**

```bash
rm "Watcher/Watcher/frontend/src/components/DnsFinder/Alerts.js"
rm "Watcher/Watcher/frontend/src/components/DnsFinder/ArchivedAlerts.js"
rm "Watcher/Watcher/frontend/src/components/DnsFinder/DanglingSubdomains.js"
```

- [ ] **Step 5: Grep for stale references**

Run: `grep -rn "DnsFinder/Alerts\|DnsFinder/ArchivedAlerts\|DnsFinder/DanglingSubdomains" Watcher/Watcher/frontend/src Watcher/Watcher/cypress`
Expected: no matches outside Task 12's Cypress test (which is rewritten in Task 12, not yet at this point — if Task 12 hasn't run yet, its old spec file referencing `DanglingSubdomains` panel selectors will show up here; that's expected and fixed in Task 12).

- [ ] **Step 6: Manual smoke check + verify the app runs**

Run `npm run build` from repo root — expected: no errors (no dangling imports of the deleted files). If a local stack is up (see repo CLAUDE.md's `/deploy-full-e2e` section), reload the DNS Finder page and confirm: Statistics / DNS Threats Monitored / Corporate DNS Assets Monitored / Corporate Keywords Monitored panels render, the Source filter appears and swapping it changes the secondary filter shown, and a Corporate DNS Asset row's new "View Dangling Subdomains" button opens the modal from Task 10.

- [ ] **Step 7: Commit**

```bash
git add Watcher/Watcher/frontend/src/components/DnsFinder/Dashboard.js Watcher/Watcher/frontend/src/components/DnsFinder/DnsFinderStats.js Watcher/Watcher/frontend/src/config/layoutPresets.js
git rm Watcher/Watcher/frontend/src/components/DnsFinder/Alerts.js Watcher/Watcher/frontend/src/components/DnsFinder/ArchivedAlerts.js Watcher/Watcher/frontend/src/components/DnsFinder/DanglingSubdomains.js
git commit -m "chore(frontend): remove ArchivedAlerts/DanglingSubdomains panels, update Dashboard layout"
```

---

## Task 12: E2E coverage for the unified DNS Threats Monitored table

**Files:**
- Modify or Create: `Watcher/cypress/e2e/dns_finder.cy.js` (or wherever the existing "Dangling Subdomains panel" Cypress spec lives — locate it first: `grep -rn "Dangling" Watcher/cypress`)

**Context:** The repo's CLAUDE.md notes E2E tests use Cypress (`Watcher/cypress/`), run via `npm run cypress:open` (interactive) or `npm run test:e2e` (headless). This task assumes a full local stack is up (see CLAUDE.md's `/deploy-full-e2e` section) since Cypress drives the real running app, not a mock.

- [ ] **Step 1: Locate the existing Dangling Subdomains panel spec**

Run: `grep -rln "Dangling" Watcher/cypress`

- [ ] **Step 2: Replace panel-specific assertions with the unified table**

In whichever spec file that grep finds, replace assertions that open the `dangling` panel / look for `Dangling Subdomains` panel text with assertions against the `threats` panel and `DNS Threats Monitored` heading. At minimum, cover:

```javascript
describe('DNS Threats Monitored (unified)', () => {
    beforeEach(() => {
        cy.login(); // reuse this repo's existing login helper/command
        cy.visit('/#/dns_finder');
    });

    it('shows the unified DNS Threats Monitored panel with all three sources selectable', () => {
        cy.contains('DNS Threats Monitored').should('be.visible');
        cy.get('select').contains('option', 'Dnstwist Algorithm').should('exist');
        cy.get('select').contains('option', 'Certificate Transparency Stream').should('exist');
        cy.get('select').contains('option', 'Subdomain Takeover Detection').should('exist');
    });

    it('filters the table down to a single source', () => {
        cy.contains('button', 'Show Filters').click();
        cy.get('select').eq(0).select('subdomain_takeover');
        cy.get('table tbody tr').each($row => {
            cy.wrap($row).find('td').eq(1).invoke('text').then(text => {
                if (!text.includes('No results found')) {
                    expect(text).to.contain('Subdomain Takeover Detection');
                }
            });
        });
    });

    it('opens the Technical Details modal for a row', () => {
        cy.get('table tbody tr').first().within(() => {
            cy.get('button[title="Technical Details"]').click();
        });
        cy.contains('Technical details for').should('be.visible');
        cy.get('.modal').within(() => {
            cy.contains('button', 'Close').click();
        });
    });

    it('the Corporate DNS Assets panel opens the dangling-subdomains detail modal', () => {
        cy.contains('Corporate DNS Assets Monitored').should('be.visible');
        cy.get('button[title="View Dangling Subdomains"]').first().click();
        cy.contains('Dangling Subdomains for').should('be.visible');
        cy.get('.modal').within(() => {
            cy.contains('button', 'Close').click();
        });
    });
});
```

Adapt selectors/helper names (`cy.login()`, the exact route) to whatever the pre-existing spec file already uses — read it first before writing the replacement so the new spec matches this repo's established Cypress conventions (custom commands, fixtures, login flow) rather than introducing new ones.

- [ ] **Step 3: Run the E2E suite**

Run (with the local stack up, from repo root): `npm run test:e2e`
Expected: PASS for the DNS Finder spec.

- [ ] **Step 4: Commit**

```bash
git add Watcher/cypress
git commit -m "test(e2e): cover the unified DNS Threats Monitored table"
```

---

## Final Verification

- [ ] Run the full backend suite: `python manage.py test dns_finder common -v 2` from `Watcher/Watcher/` — all green.
- [ ] Run `npm run build` from the repo root — no errors.
- [ ] Run `npm run test:e2e` — all green (requires a live local stack).
- [ ] `grep -rn "DanglingSubdomains\|ArchivedAlerts" Watcher/Watcher/frontend/src/components/DnsFinder/Dashboard.js` returns nothing.
- [ ] `grep -rn "\.source" Watcher/Watcher/dns_finder/core.py Watcher/Watcher/dns_finder/admin.py` shows no remaining reference to the old `DanglingAlert.source` name (only `Alert.source`/`Alert.SOURCE_*` should remain).
- [ ] Confirm no `git push` was run — only local commits, one per task above, in order.
