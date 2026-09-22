import os
from unittest.mock import patch, MagicMock
from django.test import TestCase, TransactionTestCase
from django.contrib.auth.models import User
from django.utils import timezone
from rest_framework.test import APITestCase
from rest_framework import status
from knox.models import AuthToken
from dns_finder.models import DnsMonitored, DnsTwisted, Alert, KeywordMonitored, Subscriber
from dns_finder.core import in_dns_monitored, send_dns_finder_notifications
import uuid
from unittest.mock import patch
import dns.resolver


class ModelTest(TransactionTestCase):
    """Test all models."""

    def test_dns_and_keyword_functionality(self):
        """Test DNS and Keyword models creation and constraints."""
        unique_id = str(uuid.uuid4())[:8]

        # DNS Monitored
        dns = DnsMonitored.objects.create(domain_name=f"dns-test-{unique_id}.com")
        self.assertEqual(str(dns), f"dns-test-{unique_id}.com")

        with self.assertRaises(Exception):
            DnsMonitored.objects.create(domain_name=f"dns-test-{unique_id}.com")

        # Keyword Monitored
        keyword = KeywordMonitored.objects.create(name=f"cybersec-{unique_id}")
        self.assertEqual(str(keyword), f"cybersec-{unique_id}")

        with self.assertRaises(Exception):
            KeywordMonitored.objects.create(name=f"cybersec-{unique_id}")

    def test_twisted_and_alert_functionality(self):
        """Test DnsTwisted and Alert models with relationships."""
        unique_id = str(uuid.uuid4())[:8]

        dns = DnsMonitored.objects.create(domain_name=f"twisted-test-{unique_id}.com")
        twisted = DnsTwisted.objects.create(
            domain_name=f"tw1sted-test-{unique_id}.com",
            dns_monitored=dns,
            fuzzer="homoglyph"
        )
        alert = Alert.objects.create(dns_twisted=twisted)

        self.assertEqual(twisted.dns_monitored, dns)
        self.assertEqual(twisted.fuzzer, "homoglyph")
        self.assertEqual(alert.dns_twisted, twisted)
        self.assertEqual(alert.status, Alert.STATUS_PENDING)

        # Test cascade
        dns_id = dns.id
        dns.delete()
        self.assertFalse(DnsTwisted.objects.filter(id=twisted.id).exists())
        self.assertFalse(DnsMonitored.objects.filter(id=dns_id).exists())

    def test_subscriber_functionality(self):
        """Test Subscriber model."""
        unique_id = str(uuid.uuid4())[:8]

        user = User.objects.create_user(f"dnsuser{unique_id}", "dns@test.com", "pass")
        subscriber = Subscriber.objects.create(user_rec=user, email=True, slack=True)

        self.assertTrue(subscriber.email)
        self.assertTrue(subscriber.slack)
        self.assertFalse(subscriber.thehive)
        self.assertFalse(subscriber.citadel)
        self.assertIn(f"dnsuser{unique_id}", str(subscriber))

    def test_dns_twisted_dangling_and_takeover_alert(self):
        """DnsTwisted and Alert together carry a subdomain_takeover finding."""
        unique_id = str(uuid.uuid4())[:8]

        dns = DnsMonitored.objects.create(domain_name=f"dangling-test-{unique_id}.com")
        dangling = DnsTwisted.objects.create(
            domain_name=f"old-app.dangling-test-{unique_id}.com",
            dns_monitored=dns,
        )
        self.assertEqual(str(dangling), f"old-app.dangling-test-{unique_id}.com")

        with self.assertRaises(Exception):
            DnsTwisted.objects.create(
                domain_name=f"old-app.dangling-test-{unique_id}.com",
                dns_monitored=dns,
            )

        alert = Alert.objects.create(
            dns_twisted=dangling, source=Alert.SOURCE_SUBDOMAIN_TAKEOVER, trigger='certstream'
        )
        self.assertEqual(alert.dns_twisted, dangling)
        self.assertEqual(alert.status, Alert.STATUS_PENDING)
        self.assertEqual(alert.trigger, 'certstream')
        self.assertEqual(alert.source, Alert.SOURCE_SUBDOMAIN_TAKEOVER)

        # Test cascade
        dns_id = dns.id
        dns.delete()
        self.assertFalse(DnsTwisted.objects.filter(id=dangling.id).exists())
        self.assertFalse(DnsMonitored.objects.filter(id=dns_id).exists())

    def test_alert_status_choices_are_the_unified_soc_lifecycle(self):
        """Alert.status replaced the old boolean Disable/Enable with a 5-state
        triage lifecycle, shared uniformly across all 3 sources."""
        unique_id = str(uuid.uuid4())[:8]
        dns = DnsMonitored.objects.create(domain_name=f"status-test-{unique_id}.com")
        twisted = DnsTwisted.objects.create(domain_name=f"tw1sted-status-{unique_id}.com", dns_monitored=dns)
        alert = Alert.objects.create(dns_twisted=twisted)

        self.assertEqual(alert.status, 'pending')

        for value in (
            Alert.STATUS_SUSPECTED, Alert.STATUS_CONFIRMED, Alert.STATUS_RESOLVED, Alert.STATUS_FALSE_POSITIVE
        ):
            alert.status = value
            alert.full_clean()
            alert.save()
            alert.refresh_from_db()
            self.assertEqual(alert.status, value)

    def test_alert_comments_field(self):
        """Comments is a free-text field on Alert, matching LegitimateDomain.comments."""
        unique_id = str(uuid.uuid4())[:8]
        dns = DnsMonitored.objects.create(domain_name=f"comments-test-{unique_id}.com")
        twisted = DnsTwisted.objects.create(domain_name=f"tw1sted-comments-{unique_id}.com", dns_monitored=dns)
        alert = Alert.objects.create(dns_twisted=twisted, comments="Confirmed with the asset owner.")

        alert.refresh_from_db()
        self.assertEqual(alert.comments, "Confirmed with the asset owner.")

    def test_dns_twisted_certificate_metadata_fields(self):
        """DnsTwisted must accept the CT certificate metadata columns."""
        unique_id = str(uuid.uuid4())[:8]
        dns = DnsMonitored.objects.create(domain_name=f"cert-meta-test-{unique_id}.com")

        twisted = DnsTwisted.objects.create(
            domain_name=f"cert-meta-evil-{unique_id}.com",
            dns_monitored=dns,
            issuer="Let's Encrypt",
            san_list=[f"cert-meta-evil-{unique_id}.com", f"www.cert-meta-evil-{unique_id}.com"],
        )

        twisted.refresh_from_db()
        self.assertEqual(twisted.issuer, "Let's Encrypt")
        self.assertEqual(len(twisted.san_list), 2)

        # dnstwist-sourced rows never populate these - all must stay nullable
        twisted_dnstwist = DnsTwisted.objects.create(
            domain_name=f"cert-meta-dnstwist-{unique_id}.com", dns_monitored=dns
        )
        self.assertIsNone(twisted_dnstwist.issuer)
        self.assertIsNone(twisted_dnstwist.san_list)

    def test_admin_verbose_names_are_title_cased(self):
        """Every dns_finder model must have an explicit, correctly-capitalized
        verbose_name_plural, so the admin index shows a clean label."""
        self.assertEqual(Alert._meta.verbose_name_plural, 'Alerts')
        self.assertEqual(Subscriber._meta.verbose_name_plural, 'Subscribers')
        self.assertEqual(DnsTwisted._meta.verbose_name_plural, 'Detected Domains')


class AdminTest(TestCase):
    """Test dns_finder's admin registration."""

    def test_alert_admin_list_display_includes_source(self):
        from django.contrib import admin
        self.assertIn('source', admin.site._registry[Alert].list_display)

    def test_ModelAdmin_classes_do_not_shadow_their_model(self):
        """Every dns_finder ModelAdmin must be named <Model>Admin, not reuse
        the model's own name (which used to shadow the imported model class
        within admin.py's module namespace)."""
        import dns_finder.admin as admin_module
        for model_name in ('Alert', 'KeywordMonitored', 'DnsMonitored', 'DnsTwisted', 'Subscriber'):
            self.assertTrue(
                hasattr(admin_module, f'{model_name}Admin'),
                f'dns_finder.admin must define {model_name}Admin',
            )

    def test_dns_twisted_admin_mark_recheck_action_targets_dangling_rows_only(self):
        """mark_recheck resets the related subdomain_takeover Alert(s) back
        to 'pending', and must not touch plain dnstwist/certstream_keyword
        rows (they have no such Alert)."""
        from django.contrib import admin
        from django.contrib.auth.models import User

        dns_monitored = DnsMonitored.objects.create(domain_name="admin-recheck-test.com")
        dangling = DnsTwisted.objects.create(
            domain_name="old.admin-recheck-test.com", dns_monitored=dns_monitored,
        )
        dangling_alert = Alert.objects.create(
            dns_twisted=dangling, source=Alert.SOURCE_SUBDOMAIN_TAKEOVER, status=Alert.STATUS_CONFIRMED
        )
        plain = DnsTwisted.objects.create(
            domain_name="tw1sted-admin-recheck-test.com", dns_monitored=dns_monitored, fuzzer='homoglyph',
        )
        plain_alert = Alert.objects.create(dns_twisted=plain, source=Alert.SOURCE_DNSTWIST)

        dns_twisted_admin = admin.site._registry[DnsTwisted]
        self.assertIn('mark_recheck', [action.__name__ for action in dns_twisted_admin.actions])

        user = User.objects.create_superuser("admin_recheck_user", password="pass")
        request = type('Req', (), {'user': user, '_messages': []})()
        from django.contrib.messages.storage.fallback import FallbackStorage
        request.session = {}
        request._messages = FallbackStorage(request)

        dns_twisted_admin.mark_recheck(request, DnsTwisted.objects.filter(pk__in=[dangling.pk, plain.pk]))

        dangling_alert.refresh_from_db()
        plain_alert.refresh_from_db()
        self.assertEqual(dangling_alert.status, Alert.STATUS_PENDING)
        self.assertEqual(plain_alert.status, Alert.STATUS_PENDING)  # unchanged, was already pending


class CoreTest(TestCase):
    """Test core functions."""

    def test_in_dns_monitored(self):
        """Test domain checking function."""
        DnsMonitored.objects.create(domain_name="core-example.com")
        self.assertTrue(in_dns_monitored("sub.core-example.com"))
        self.assertTrue(in_dns_monitored("core-example.com"))
        self.assertFalse(in_dns_monitored("other.com"))

    def test_clean_wildcard_domain(self):
        """Test wildcard domain cleaning."""
        from dns_finder.core import clean_wildcard_domain

        self.assertEqual(clean_wildcard_domain("*.example.com"), "example.com")
        self.assertEqual(clean_wildcard_domain("example.com"), "example.com")

    @patch('dns_finder.core.send_app_specific_notifications')
    def test_notification_system(self, mock_notifications):
        """Test notification system."""
        dns = DnsMonitored.objects.create(domain_name="notify-test.com")
        twisted = DnsTwisted.objects.create(
            domain_name="twisted-notify.com",
            dns_monitored=dns
        )
        alert = Alert.objects.create(dns_twisted=twisted)

        user = User.objects.create_user("notif_user", "test@test.com", "pass")
        Subscriber.objects.create(user_rec=user, email=True)

        send_dns_finder_notifications(alert)

        mock_notifications.assert_called_once()
        self.assertEqual(mock_notifications.call_args[0][0], 'dns_finder')

    @patch('dns_finder.core.send_app_specific_notifications')
    def test_dangling_notification_routes_to_dedicated_app_name(self, mock_notifications):
        """A subdomain_takeover alert must route to the dedicated
        'dns_finder_dangling' templates, regardless of its Status value."""
        dns_monitored = DnsMonitored.objects.create(domain_name="dangling-notify-test.com")
        dns_twisted = DnsTwisted.objects.create(
            domain_name="old.dangling-notify-test.com", dns_monitored=dns_monitored,
        )
        alert = Alert.objects.create(
            dns_twisted=dns_twisted, source=Alert.SOURCE_SUBDOMAIN_TAKEOVER, status=Alert.STATUS_CONFIRMED
        )

        user = User.objects.create_user("dangling_notif_user", "test2@test.com", "pass")
        Subscriber.objects.create(user_rec=user, email=True)

        send_dns_finder_notifications(alert)

        mock_notifications.assert_called_once()
        self.assertEqual(mock_notifications.call_args[0][0], 'dns_finder_dangling')

    @patch('dns_finder.core.subprocess.check_output')
    def test_check_dnstwist(self, mock_subprocess):
        """Test dnstwist checking."""
        from dns_finder.core import check_dnstwist

        mock_subprocess.return_value = b'{"domain": "test.com"}'

        dns = DnsMonitored.objects.create(domain_name="dnstwist-test.com")

        with patch('dns_finder.core.open', create=True) as mock_open:
            mock_open.return_value.__enter__.return_value.read.return_value = '[{"domain": "twisted.com", "fuzzer": "addition"}]'

            check_dnstwist(dns)

            self.assertTrue(mock_subprocess.called)

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
        self.assertEqual(alert.status, Alert.STATUS_PENDING)

    def test_print_callback_persists_source(self):
        """print_callback's keyword branch must persist Alert.source."""
        from dns_finder.core import print_callback
        from dns_finder.models import Alert

        KeywordMonitored.objects.create(name="source-keyword-test")
        message = {'data': {'leaf_cert': {'subject': {'CN': 'source-keyword-test-evil.com'}}}}

        print_callback(message, None)

        alert = Alert.objects.get(dns_twisted__domain_name="source-keyword-test-evil.com")
        self.assertEqual(alert.source, Alert.SOURCE_CERTSTREAM_KEYWORD)

    def test_extract_certificate_metadata_full_message(self):
        from dns_finder.core import extract_certificate_metadata

        message = {
            'data': {
                'leaf_cert': {
                    'subject': {'CN': 'evil.example.com'},
                    'all_domains': ['evil.example.com', 'www.evil.example.com'],
                },
                'chain': [{'subject': {'O': "Let's Encrypt", 'CN': 'R3'}}],
            }
        }

        metadata = extract_certificate_metadata(message)

        self.assertEqual(metadata['issuer'], "Let's Encrypt")
        self.assertEqual(metadata['san_list'], ['evil.example.com', 'www.evil.example.com'])

    def test_extract_certificate_metadata_missing_fields_is_safe(self):
        """A leaner/older certstream-server-go payload must never raise."""
        from dns_finder.core import extract_certificate_metadata

        metadata = extract_certificate_metadata({'data': {'leaf_cert': {'subject': {'CN': 'x.com'}}}})

        self.assertIsNone(metadata['issuer'])
        self.assertIsNone(metadata['san_list'])

    def test_print_callback_stores_certificate_metadata_on_dns_twisted(self):
        from dns_finder.core import print_callback
        from dns_finder.models import DnsTwisted

        KeywordMonitored.objects.create(name="cert-capture-test")
        message = {
            'data': {
                'leaf_cert': {
                    'subject': {'CN': 'cert-capture-test-evil.com'},
                    'all_domains': ['cert-capture-test-evil.com'],
                },
                'chain': [{'subject': {'O': "Let's Encrypt"}}],
            }
        }

        print_callback(message, None)

        twisted = DnsTwisted.objects.get(domain_name="cert-capture-test-evil.com")
        self.assertEqual(twisted.issuer, "Let's Encrypt")
        self.assertEqual(twisted.san_list, ['cert-capture-test-evil.com'])


class DanglingDnsDetectionTest(TestCase):
    """Test dangling DNS detection engine (pure technical probe, no status
    write anymore - see DanglingDnsRealtimeTest for the Alert.status mapping)."""

    def setUp(self):
        self.dns_monitored = DnsMonitored.objects.create(domain_name="detect-test.com")

    def test_match_fingerprint_hit(self):
        from dns_finder.core import match_fingerprint
        fingerprint = match_fingerprint("mybucket.s3.amazonaws.com")
        self.assertIsNotNone(fingerprint)
        self.assertEqual(fingerprint['provider'], "Amazon S3")

    def test_match_fingerprint_miss(self):
        from dns_finder.core import match_fingerprint
        self.assertIsNone(match_fingerprint("random.internal-host.corp"))
        self.assertIsNone(match_fingerprint(None))

    @patch('dns_finder.core.dns.resolver.resolve')
    def test_resolve_cname_chain_follows_cname(self, mock_resolve):
        from dns_finder.core import resolve_cname_chain

        class FakeAnswer:
            def __init__(self, target):
                self.target = target

        mock_resolve.side_effect = [
            [FakeAnswer("mybucket.s3.amazonaws.com.")],
            dns.resolver.NoAnswer(),
        ]
        target = resolve_cname_chain("old.detect-test.com")
        self.assertEqual(target, "mybucket.s3.amazonaws.com")

    @patch('dns_finder.core.requests.get')
    @patch('dns_finder.core.dns.resolver.resolve')
    def test_check_dangling_status_confirmed_via_http(self, mock_resolve, mock_get):
        from dns_finder.core import check_dangling_status

        class FakeAnswer:
            def __init__(self, target):
                self.target = target

        dns_twisted = DnsTwisted.objects.create(
            domain_name="old.detect-test.com", dns_monitored=self.dns_monitored
        )

        # 1st resolve() call: CNAME lookup on the subdomain -> S3 bucket
        # 2nd resolve() call: CNAME lookup on target fails (no more CNAMEs)
        # 3rd resolve() call: A lookup on the terminal CNAME target -> resolves fine
        mock_resolve.side_effect = [
            [FakeAnswer("mybucket.s3.amazonaws.com.")],
            dns.resolver.NoAnswer(),
            MagicMock(),
        ]
        # The probe is streamed and capped: the body is read from response.raw,
        # not response.text.
        mock_response = MagicMock()
        mock_response.status_code = 404
        mock_response.raw.read.return_value = b"<Error><Code>NoSuchBucket</Code></Error>"
        mock_get.return_value = mock_response

        new_status = check_dangling_status(dns_twisted)

        self.assertEqual(new_status, 'dangling_confirmed')
        dns_twisted.refresh_from_db()
        self.assertEqual(dns_twisted.provider, 'Amazon S3')
        self.assertEqual(dns_twisted.cname_target, 'mybucket.s3.amazonaws.com')
        self.assertEqual(dns_twisted.http_status_code, 404)

        # The probe must be bounded: tuple timeout, no redirects, streamed.
        _, kwargs = mock_get.call_args
        self.assertEqual(kwargs['timeout'], (3, 5))
        self.assertFalse(kwargs['allow_redirects'])
        self.assertTrue(kwargs['stream'])
        mock_response.raw.read.assert_called_once_with(65536, decode_content=True)

    @patch('dns_finder.core.dns.resolver.resolve')
    def test_check_dangling_status_no_fingerprint_match_is_ok(self, mock_resolve):
        from dns_finder.core import check_dangling_status

        dns_twisted = DnsTwisted.objects.create(
            domain_name="old2.detect-test.com", dns_monitored=self.dns_monitored
        )
        mock_resolve.side_effect = dns.resolver.NoAnswer()

        new_status = check_dangling_status(dns_twisted)

        self.assertEqual(new_status, 'ok')
        dns_twisted.refresh_from_db()
        self.assertIsNone(dns_twisted.provider)


class DanglingDnsRealtimeTest(TestCase):
    """Test the CertStream real-time dangling DNS hook and the raw probe
    verdict -> unified Alert.status mapping/notification rules."""

    def setUp(self):
        self.dns_monitored = DnsMonitored.objects.create(domain_name="realtime-test.com")

    @patch('dns_finder.core.check_dangling_status')
    @patch('dns_finder.core.send_dns_finder_notifications')
    def test_evaluate_creates_and_confirms_alert_on_first_check(self, mock_notify, mock_check):
        """A domain with no prior Alert, immediately found dangling_confirmed
        on its first check, must still notify - 'pending' is the assumed
        baseline for a freshly get_or_create'd Alert, not a no-op."""
        from dns_finder.core import evaluate_dangling_subdomain

        dns_twisted = DnsTwisted.objects.create(
            domain_name="old.realtime-test.com", dns_monitored=self.dns_monitored
        )
        mock_check.return_value = 'dangling_confirmed'

        evaluate_dangling_subdomain(dns_twisted, source='certstream')

        alert = Alert.objects.get(dns_twisted=dns_twisted, source=Alert.SOURCE_SUBDOMAIN_TAKEOVER)
        self.assertEqual(alert.status, Alert.STATUS_CONFIRMED)
        self.assertEqual(alert.trigger, 'certstream')
        self.assertTrue(mock_notify.called)

    @patch('dns_finder.core.check_dangling_status')
    @patch('dns_finder.core.send_dns_finder_notifications')
    def test_evaluate_no_notification_when_still_confirmed(self, mock_notify, mock_check):
        """Rechecking an already-confirmed alert and finding it still
        confirmed must not re-notify."""
        from dns_finder.core import evaluate_dangling_subdomain

        dns_twisted = DnsTwisted.objects.create(
            domain_name="old2.realtime-test.com", dns_monitored=self.dns_monitored,
        )
        alert = Alert.objects.create(
            dns_twisted=dns_twisted, source=Alert.SOURCE_SUBDOMAIN_TAKEOVER, status=Alert.STATUS_CONFIRMED
        )
        mock_check.return_value = 'dangling_confirmed'

        evaluate_dangling_subdomain(dns_twisted, source='periodic_recheck')

        alert.refresh_from_db()
        self.assertEqual(alert.status, Alert.STATUS_CONFIRMED)
        self.assertFalse(mock_notify.called)

    @patch('dns_finder.core.check_dangling_status')
    @patch('dns_finder.core.send_dns_finder_notifications')
    def test_evaluate_updates_confirmed_to_resolved_without_notifying(self, mock_notify, mock_check):
        """A confirmed takeover that gets fixed (probe now comes back clean)
        must have its Status move to Resolved - otherwise the unified feed
        keeps showing it as Confirmed forever, since nothing else revisits it."""
        from dns_finder.core import evaluate_dangling_subdomain

        dns_twisted = DnsTwisted.objects.create(
            domain_name="fixed.realtime-test.com", dns_monitored=self.dns_monitored,
        )
        alert = Alert.objects.create(
            dns_twisted=dns_twisted, source=Alert.SOURCE_SUBDOMAIN_TAKEOVER,
            status=Alert.STATUS_CONFIRMED, trigger='certstream',
        )
        mock_check.return_value = 'ok'

        evaluate_dangling_subdomain(dns_twisted, source='periodic_recheck')

        alert.refresh_from_db()
        self.assertEqual(alert.status, Alert.STATUS_RESOLVED)
        self.assertEqual(alert.trigger, 'periodic_recheck')
        self.assertFalse(mock_notify.called)

    @patch('dns_finder.core.check_dangling_status')
    @patch('dns_finder.core.send_dns_finder_notifications')
    def test_evaluate_downgrades_confirmed_to_suspected_without_notifying(self, mock_notify, mock_check):
        """A transient probe error on an already-confirmed domain moves the
        visible Status to Suspected (the current best understanding), but
        does not re-notify - only escalating back into 'confirmed' does."""
        from dns_finder.core import evaluate_dangling_subdomain

        dns_twisted = DnsTwisted.objects.create(
            domain_name="still-dangling.realtime-test.com", dns_monitored=self.dns_monitored,
        )
        alert = Alert.objects.create(
            dns_twisted=dns_twisted, source=Alert.SOURCE_SUBDOMAIN_TAKEOVER, status=Alert.STATUS_CONFIRMED
        )
        mock_check.return_value = 'dangling_suspected'

        evaluate_dangling_subdomain(dns_twisted, source='periodic_recheck')

        alert.refresh_from_db()
        self.assertEqual(alert.status, Alert.STATUS_SUSPECTED)
        self.assertFalse(mock_notify.called)

    @patch('dns_finder.core.check_dangling_status')
    @patch('dns_finder.core.send_dns_finder_notifications')
    def test_evaluate_notifies_on_suspected_to_confirmed_escalation(self, mock_notify, mock_check):
        """An inconclusive 'suspected' becoming a proven takeover must alert."""
        from dns_finder.core import evaluate_dangling_subdomain

        dns_twisted = DnsTwisted.objects.create(
            domain_name="escalate.realtime-test.com", dns_monitored=self.dns_monitored,
        )
        alert = Alert.objects.create(
            dns_twisted=dns_twisted, source=Alert.SOURCE_SUBDOMAIN_TAKEOVER, status=Alert.STATUS_SUSPECTED
        )
        mock_check.return_value = 'dangling_confirmed'

        evaluate_dangling_subdomain(dns_twisted, source='periodic_recheck')

        alert.refresh_from_db()
        self.assertEqual(alert.status, Alert.STATUS_CONFIRMED)
        self.assertEqual(alert.trigger, 'periodic_recheck')
        self.assertTrue(mock_notify.called)

    @patch('dns_finder.core.check_dangling_status')
    @patch('dns_finder.core.send_dns_finder_notifications')
    def test_evaluate_no_notification_on_repeated_suspected(self, mock_notify, mock_check):
        """A flapping subdomain re-entering 'suspected' must not re-page."""
        from dns_finder.core import evaluate_dangling_subdomain

        dns_twisted = DnsTwisted.objects.create(
            domain_name="flapping.realtime-test.com", dns_monitored=self.dns_monitored,
        )
        alert = Alert.objects.create(
            dns_twisted=dns_twisted, source=Alert.SOURCE_SUBDOMAIN_TAKEOVER, status=Alert.STATUS_SUSPECTED
        )
        mock_check.return_value = 'dangling_suspected'

        evaluate_dangling_subdomain(dns_twisted, source='periodic_recheck')

        alert.refresh_from_db()
        self.assertEqual(alert.status, Alert.STATUS_SUSPECTED)
        self.assertFalse(mock_notify.called)

    @patch('dns_finder.core.check_dangling_status')
    @patch('dns_finder.core.send_dns_finder_notifications')
    def test_evaluate_pending_to_ok_becomes_resolved_without_notifying(self, mock_notify, mock_check):
        """A freshly-catalogued (pending) domain whose first check finds
        nothing wrong becomes Resolved directly, never having been Confirmed -
        so no notification fires."""
        from dns_finder.core import evaluate_dangling_subdomain

        dns_twisted = DnsTwisted.objects.create(
            domain_name="never-dangling.realtime-test.com", dns_monitored=self.dns_monitored,
        )
        alert = Alert.objects.create(
            dns_twisted=dns_twisted, source=Alert.SOURCE_SUBDOMAIN_TAKEOVER, status=Alert.STATUS_PENDING
        )
        mock_check.return_value = 'ok'

        evaluate_dangling_subdomain(dns_twisted, source='periodic_recheck')

        alert.refresh_from_db()
        self.assertEqual(alert.status, Alert.STATUS_RESOLVED)
        self.assertFalse(mock_notify.called)

    @patch('dns_finder.core.evaluate_dangling_subdomain')
    def test_track_dangling_subdomain_creates_pending_alert_for_genuine_subdomain(self, mock_evaluate):
        """Discovery is catalog-only: a DnsTwisted row plus its single
        'pending' subdomain_takeover Alert are created, and nothing else
        happens here (no blocking DNS/HTTP work on the CertStream reader thread)."""
        from dns_finder.core import track_dangling_subdomain

        track_dangling_subdomain("old.realtime-test.com")

        dns_twisted = DnsTwisted.objects.get(domain_name="old.realtime-test.com")
        alert = Alert.objects.get(dns_twisted=dns_twisted, source=Alert.SOURCE_SUBDOMAIN_TAKEOVER)
        self.assertEqual(alert.status, Alert.STATUS_PENDING)
        self.assertEqual(alert.trigger, 'certstream')
        self.assertFalse(mock_evaluate.called)

    @patch('dns_finder.core.evaluate_dangling_subdomain')
    def test_track_dangling_subdomain_upgrades_existing_row(self, mock_evaluate):
        """domain_name is a single unique column shared across all 3 sources -
        a DnsTwisted row created first by dnstwist/certstream_keyword must
        still get a subdomain_takeover Alert attached, not be silently ignored."""
        from dns_finder.core import track_dangling_subdomain

        existing = DnsTwisted.objects.create(
            domain_name="already-twisted.realtime-test.com", dns_monitored=self.dns_monitored,
            fuzzer="homoglyph",
        )
        self.assertFalse(Alert.objects.filter(dns_twisted=existing).exists())

        track_dangling_subdomain("already-twisted.realtime-test.com")

        alert = Alert.objects.get(dns_twisted=existing, source=Alert.SOURCE_SUBDOMAIN_TAKEOVER)
        self.assertEqual(alert.status, Alert.STATUS_PENDING)
        self.assertFalse(mock_evaluate.called)

    @patch('dns_finder.core.evaluate_dangling_subdomain')
    def test_track_dangling_subdomain_rejects_invalid_hostname(self, mock_evaluate):
        """A CertStream CN carrying URL metacharacters must never reach the DB,
        even when it would suffix-match a monitored root domain."""
        from dns_finder.core import track_dangling_subdomain

        for bad_domain in (
            "evil.com/x.realtime-test.com",
            "evil.com#.realtime-test.com",
            "evil.com?a=b.realtime-test.com",
            "192.0.2.1.realtime-test.com:8080",
        ):
            with self.subTest(domain=bad_domain):
                track_dangling_subdomain(bad_domain)
                self.assertFalse(DnsTwisted.objects.filter(domain_name=bad_domain).exists())

        self.assertFalse(Alert.objects.filter(source=Alert.SOURCE_SUBDOMAIN_TAKEOVER).exists())
        self.assertFalse(mock_evaluate.called)

    @patch('dns_finder.core.evaluate_dangling_subdomain')
    def test_track_dangling_subdomain_ignores_root_domain(self, mock_evaluate):
        from dns_finder.core import track_dangling_subdomain

        track_dangling_subdomain("realtime-test.com")

        self.assertFalse(DnsTwisted.objects.filter(domain_name="realtime-test.com").exists())
        self.assertFalse(mock_evaluate.called)

    @patch('dns_finder.core.evaluate_dangling_subdomain')
    def test_track_dangling_subdomain_ignores_unrelated_domain(self, mock_evaluate):
        from dns_finder.core import track_dangling_subdomain

        track_dangling_subdomain("totally-unrelated.example")

        self.assertFalse(Alert.objects.filter(source=Alert.SOURCE_SUBDOMAIN_TAKEOVER).exists())
        self.assertFalse(mock_evaluate.called)

    @patch('dns_finder.core.track_dangling_subdomain')
    def test_print_callback_keyword_loop_survives_dangling_tracking_error(self, mock_track):
        """A fault in the new dangling-DNS path must not skip the pre-existing
        keyword-matching/typosquat detection loop for that CertStream message."""
        from dns_finder.core import print_callback

        mock_track.side_effect = Exception("boom")
        KeywordMonitored.objects.create(name="realtime-test")

        message = {'data': {'leaf_cert': {'subject': {'CN': 'realtime-test-evil.com'}}}}

        print_callback(message, None)

        self.assertTrue(mock_track.called)
        self.assertTrue(DnsTwisted.objects.filter(domain_name="realtime-test-evil.com").exists())
        self.assertTrue(Alert.objects.filter(dns_twisted__domain_name="realtime-test-evil.com").exists())


class DanglingDnsRecheckTest(TransactionTestCase):
    """Test the periodic dangling DNS recheck job.

    Uses TransactionTestCase so close_old_connections() doesn't break test
    isolation (see cyber_watch.tests for the same pattern).
    """

    def setUp(self):
        self.dns_monitored = DnsMonitored.objects.create(domain_name="recheck-test.com")
        # Prevent close_old_connections() from dropping the test DB connection
        self._conn_patcher = patch('dns_finder.core.close_old_connections')
        self._conn_patcher.start()

    def tearDown(self):
        self._conn_patcher.stop()

    @patch('dns_finder.core.time.sleep')
    @patch('dns_finder.core.evaluate_dangling_subdomain')
    def test_recheck_evaluates_pending_and_dangling_rows(self, mock_evaluate, mock_sleep):
        from dns_finder.core import recheck_dangling_subdomains

        def make(domain_name, status):
            twisted = DnsTwisted.objects.create(domain_name=domain_name, dns_monitored=self.dns_monitored)
            Alert.objects.create(dns_twisted=twisted, source=Alert.SOURCE_SUBDOMAIN_TAKEOVER, status=status)
            return twisted

        pending = make("pending.recheck-test.com", Alert.STATUS_PENDING)
        confirmed = make("confirmed.recheck-test.com", Alert.STATUS_CONFIRMED)
        resolved = make("resolved.recheck-test.com", Alert.STATUS_RESOLVED)
        false_positive = make("fp.recheck-test.com", Alert.STATUS_FALSE_POSITIVE)
        # A plain dnstwist/certstream row (no subdomain_takeover Alert at all)
        # must never be swept into the dangling recheck loop.
        non_dangling = DnsTwisted.objects.create(
            domain_name="typosquat.recheck-test.com", dns_monitored=self.dns_monitored, fuzzer='addition'
        )
        Alert.objects.create(dns_twisted=non_dangling, source=Alert.SOURCE_DNSTWIST)

        recheck_dangling_subdomains()

        checked_domains = {call.args[0].domain_name for call in mock_evaluate.call_args_list}
        self.assertIn(pending.domain_name, checked_domains)
        self.assertIn(confirmed.domain_name, checked_domains)
        self.assertNotIn(resolved.domain_name, checked_domains)
        self.assertNotIn(false_positive.domain_name, checked_domains)
        self.assertNotIn(non_dangling.domain_name, checked_domains)

        for call in mock_evaluate.call_args_list:
            self.assertEqual(call.args[1], 'periodic_recheck')


class DnsTwistedTimelineTest(TransactionTestCase):
    """DnsTwisted must be tracked by the timeline app."""

    def setUp(self):
        self.dns_monitored = DnsMonitored.objects.create(domain_name="dnstwisted-timeline-test.com")

    def _ct(self):
        from django.contrib.contenttypes.models import ContentType
        return ContentType.objects.get_for_model(DnsTwisted)

    def test_timeline_event_created_on_create(self):
        from timeline.models import TimelineEvent

        twisted = DnsTwisted.objects.create(
            domain_name="tw1sted-timeline-test.com", dns_monitored=self.dns_monitored, fuzzer="homoglyph"
        )

        self.assertTrue(
            TimelineEvent.objects.filter(
                content_type=self._ct(),
                object_id=twisted.pk,
                action=TimelineEvent.ACTION_CREATED,
            ).exists(),
            "Creating a DnsTwisted must produce an ACTION_CREATED TimelineEvent.",
        )

    def test_timeline_event_updated_on_fuzzer_edit(self):
        """The Edit modal's fuzzer/issuer PATCH must be recorded."""
        from timeline.models import TimelineEvent

        twisted = DnsTwisted.objects.create(
            domain_name="edited-timeline-test.com", dns_monitored=self.dns_monitored, fuzzer="addition"
        )

        twisted.fuzzer = "bitsquatting"
        twisted.save()

        events = TimelineEvent.objects.filter(
            content_type=self._ct(), object_id=twisted.pk, action=TimelineEvent.ACTION_UPDATED,
        )
        self.assertTrue(events.exists())
        event = events.first()
        self.assertIn('fuzzer', event.diff)
        self.assertEqual(event.diff['fuzzer']['old'], 'addition')
        self.assertEqual(event.diff['fuzzer']['new'], 'bitsquatting')

    def test_bulk_update_does_not_create_timeline_event(self):
        """check_dangling_status' queryset .update() must stay signal-free."""
        from timeline.models import TimelineEvent

        dangling = DnsTwisted.objects.create(
            domain_name="churn.dnstwisted-timeline-test.com", dns_monitored=self.dns_monitored,
        )
        before = TimelineEvent.objects.filter(
            content_type=self._ct(), object_id=dangling.pk,
            action=TimelineEvent.ACTION_UPDATED,
        ).count()

        DnsTwisted.objects.filter(pk=dangling.pk).update(provider='Amazon S3')

        after = TimelineEvent.objects.filter(
            content_type=self._ct(), object_id=dangling.pk,
            action=TimelineEvent.ACTION_UPDATED,
        ).count()
        self.assertEqual(before, after)


class AlertTimelineTest(TransactionTestCase):
    """Alert must be tracked by the timeline app."""

    def setUp(self):
        self.dns_monitored = DnsMonitored.objects.create(domain_name="alert-timeline-test.com")
        self.dns_twisted = DnsTwisted.objects.create(
            domain_name="tw1sted-alert-timeline-test.com", dns_monitored=self.dns_monitored,
        )

    def _ct(self):
        from django.contrib.contenttypes.models import ContentType
        return ContentType.objects.get_for_model(Alert)

    def test_timeline_event_created_on_create(self):
        from timeline.models import TimelineEvent

        alert = Alert.objects.create(dns_twisted=self.dns_twisted)

        self.assertTrue(
            TimelineEvent.objects.filter(
                content_type=self._ct(), object_id=alert.pk, action=TimelineEvent.ACTION_CREATED,
            ).exists(),
            "Creating an Alert must produce an ACTION_CREATED TimelineEvent.",
        )

    def test_timeline_event_updated_on_status_and_comments_edit(self):
        """Status and Comments edits on Alert must be recorded."""
        from timeline.models import TimelineEvent

        alert = Alert.objects.create(dns_twisted=self.dns_twisted)

        alert.status = Alert.STATUS_CONFIRMED
        alert.comments = "Escalated to the asset owner."
        alert.save()

        events = TimelineEvent.objects.filter(
            content_type=self._ct(), object_id=alert.pk, action=TimelineEvent.ACTION_UPDATED,
        )
        self.assertTrue(events.exists())
        event = events.first()
        self.assertIn('status', event.diff)
        self.assertEqual(event.diff['status']['old'], Alert.STATUS_PENDING)
        self.assertEqual(event.diff['status']['new'], Alert.STATUS_CONFIRMED)
        self.assertIn('comments', event.diff)
        self.assertEqual(event.diff['comments']['new'], "Escalated to the asset owner.")


class SerializerTest(TestCase):
    """Test serializers."""

    def test_all_serializers(self):
        """Test all serializers together."""
        from dns_finder.serializers import DnsMonitoredSerializer, DnsTwistedSerializer, KeywordMonitoredSerializer

        dns = DnsMonitored.objects.create(domain_name="serializer-dns.com")
        keyword = KeywordMonitored.objects.create(name="serializer-keyword")
        twisted = DnsTwisted.objects.create(
            domain_name="twisted-serial.com",
            dns_monitored=dns,
            keyword_monitored=keyword,
            fuzzer="homoglyph"
        )

        dns_serializer = DnsMonitoredSerializer(dns)
        keyword_serializer = KeywordMonitoredSerializer(keyword)
        twisted_serializer = DnsTwistedSerializer(twisted)

        self.assertEqual(dns_serializer.data['domain_name'], "serializer-dns.com")
        self.assertEqual(keyword_serializer.data['name'], "serializer-keyword")
        self.assertEqual(twisted_serializer.data['domain_name'], "twisted-serial.com")
        self.assertEqual(twisted_serializer.data['fuzzer'], "homoglyph")
        self.assertIn('misp_event_uuid', twisted_serializer.data)

    def test_dns_twisted_serializer_status_reflects_related_takeover_alert(self):
        """DnsTwistedSerializer.status is a read-only computed field pulling
        from the related subdomain_takeover Alert - None when there isn't one."""
        from dns_finder.serializers import DnsTwistedSerializer

        dns = DnsMonitored.objects.create(domain_name="serializer-status-dns.com")
        plain = DnsTwisted.objects.create(domain_name="plain-serializer-status.com", dns_monitored=dns)
        self.assertIsNone(DnsTwistedSerializer(plain).data['status'])

        dangling = DnsTwisted.objects.create(domain_name="dangling-serializer-status.com", dns_monitored=dns)
        Alert.objects.create(dns_twisted=dangling, source=Alert.SOURCE_SUBDOMAIN_TAKEOVER, status=Alert.STATUS_SUSPECTED)
        self.assertEqual(DnsTwistedSerializer(dangling).data['status'], Alert.STATUS_SUSPECTED)

    def test_domain_validation(self):
        """Test domain name validation in serializer."""
        from dns_finder.serializers import DnsMonitoredSerializer

        serializer = DnsMonitoredSerializer(data={'domain_name': 'valid.com'})
        self.assertTrue(serializer.is_valid())

        serializer = DnsMonitoredSerializer(data={'domain_name': 'invalid domain'})
        self.assertFalse(serializer.is_valid())


class APITest(APITestCase):
    """Test API endpoints."""

    def setUp(self):
        """Setup authenticated user and test data."""
        self.user = User.objects.create_superuser("apiuser", password="apipass123")
        self.token = AuthToken.objects.create(self.user)[1]
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {self.token}')

        self.dns = DnsMonitored.objects.create(domain_name="api-dns-test.com")
        self.keyword = KeywordMonitored.objects.create(name="api-keyword")
        self.twisted = DnsTwisted.objects.create(
            domain_name="api-twisted-dns.com",
            dns_monitored=self.dns,
            fuzzer="addition"
        )
        self.alert = Alert.objects.create(dns_twisted=self.twisted)
        self.dangling_subdomain = DnsTwisted.objects.create(
            domain_name="old.api-dns-test.com", dns_monitored=self.dns, provider='Amazon S3'
        )
        self.dangling_alert = Alert.objects.create(
            dns_twisted=self.dangling_subdomain, source=Alert.SOURCE_SUBDOMAIN_TAKEOVER, status=Alert.STATUS_CONFIRMED
        )

    def test_dns_monitored_api(self):
        """Test DnsMonitored API operations."""
        # List and Create
        response = self.client.get('/api/dns_finder/dns_monitored/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        data = {'domain_name': 'new-api-dns.com'}
        response = self.client.post('/api/dns_finder/dns_monitored/', data, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        response = self.client.delete(f'/api/dns_finder/dns_monitored/{self.dns.pk}/')
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)

    def test_keyword_and_twisted_api(self):
        """Test Keyword and Twisted API operations."""
        # Keyword
        response = self.client.get('/api/dns_finder/keyword_monitored/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        data = {'name': 'new-keyword'}
        response = self.client.post('/api/dns_finder/keyword_monitored/', data, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        response = self.client.get('/api/dns_finder/dns_twisted/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(len(response.data), 1)

    def test_dns_twisted_patch_updates_fuzzer(self):
        """The unified feed's Edit modal PATCHes fuzzer (dnstwist) / issuer
        (certstream_keyword) directly on DnsTwisted."""
        update_data = {'fuzzer': 'bitsquatting'}
        response = self.client.patch(f'/api/dns_finder/dns_twisted/{self.twisted.pk}/', update_data)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['fuzzer'], 'bitsquatting')

        update_data = {'issuer': "DigiCert Inc"}
        response = self.client.patch(f'/api/dns_finder/dns_twisted/{self.twisted.pk}/', update_data)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['issuer'], "DigiCert Inc")

    def test_alert_api_status_and_comments(self):
        """Test Alert API: unified Status field and Comments, same endpoint
        and same shape for all 3 sources."""
        response = self.client.get('/api/dns_finder/alert/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        update_data = {'status': Alert.STATUS_RESOLVED, 'comments': 'Confirmed benign by asset owner.'}
        response = self.client.patch(f'/api/dns_finder/alert/{self.alert.pk}/', update_data)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['status'], Alert.STATUS_RESOLVED)
        self.assertEqual(response.data['comments'], 'Confirmed benign by asset owner.')

        # The subdomain_takeover alert goes through the exact same endpoint -
        # no separate Disable/Enable or dangling-specific route.
        response = self.client.patch(
            f'/api/dns_finder/alert/{self.dangling_alert.pk}/', {'status': Alert.STATUS_FALSE_POSITIVE}
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['status'], Alert.STATUS_FALSE_POSITIVE)

        self.client.credentials()
        response = self.client.post('/api/dns_finder/dns_monitored/', {'domain_name': 'test.com'})
        self.assertIn(response.status_code, [401, 403])

    def test_statistics_include_dangling_counts(self):
        """Test that the statistics endpoint reports dangling subdomain counts."""
        response = self.client.get('/api/dns_finder/dns_monitored/statistics/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('totalDanglingSubdomains', response.data)
        self.assertIn('totalDanglingConfirmed', response.data)
        self.assertIn('totalDanglingSuspected', response.data)
        self.assertEqual(response.data['totalDanglingSubdomains'], 1)
        self.assertEqual(response.data['totalDanglingConfirmed'], 1)

    def test_dns_monitored_dangling_subdomains_action(self):
        """The per-asset dangling-subdomains action must return every
        DnsTwisted row with a subdomain_takeover Alert, including 'pending'
        ones - and must not leak in plain dnstwist/certstream rows."""
        never_confirmed = DnsTwisted.objects.create(
            domain_name="pending-only.api-dns-test.com", dns_monitored=self.dns
        )
        Alert.objects.create(dns_twisted=never_confirmed, source=Alert.SOURCE_SUBDOMAIN_TAKEOVER)

        other_dns = DnsMonitored.objects.create(domain_name="other-asset-test.com")
        unrelated = DnsTwisted.objects.create(domain_name="unrelated.other-asset-test.com", dns_monitored=other_dns)
        Alert.objects.create(dns_twisted=unrelated, source=Alert.SOURCE_SUBDOMAIN_TAKEOVER)

        response = self.client.get(f'/api/dns_finder/dns_monitored/{self.dns.pk}/dangling_subdomains/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        domains = {item['domain_name'] for item in response.data}
        self.assertIn(self.dangling_subdomain.domain_name, domains)
        self.assertIn(never_confirmed.domain_name, domains)
        self.assertNotIn('unrelated.other-asset-test.com', domains)
        self.assertNotIn(self.twisted.domain_name, domains)

    @patch('dns_finder.serializers.PyMISP')
    def test_misp_export(self, mock_pymisp):
        """Test MISP export functionality."""
        mock_pymisp_instance = MagicMock()
        mock_pymisp.return_value = mock_pymisp_instance
        mock_event_obj = MagicMock()
        mock_event_obj.id = 123
        mock_event_obj.uuid = 'test-uuid-123'
        mock_pymisp_instance.add_event.return_value = mock_event_obj
        mock_pymisp_instance.search.return_value = []
        mock_pymisp_instance.get.return_value = {}
        export_data = {
            'id': self.twisted.id,
            'event_uuid': ''
        }
        response = self.client.post('/api/dns_finder/misp/', export_data, format='json')
        self.assertIn(response.status_code, [200, 201, 400])


class ThreatsMonitoredAPITest(APITestCase):
    """Test the unified DNS Threats Monitored endpoint (single Alert table
    across dnstwist / certstream_keyword / subdomain_takeover)."""

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

        self.dangling = DnsTwisted.objects.create(
            domain_name="old.threats-api-test.com", dns_monitored=self.dns,
            provider='Amazon S3', cname_target='bucket.s3.amazonaws.com'
        )
        self.dangling_alert = Alert.objects.create(
            dns_twisted=self.dangling, source=Alert.SOURCE_SUBDOMAIN_TAKEOVER, trigger='certstream',
            status=Alert.STATUS_CONFIRMED,
        )

    def test_unified_feed_returns_all_three_sources(self):
        response = self.client.get('/api/dns_finder/threats_monitored/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        sources = {item['source'] for item in response.data['results']}
        self.assertEqual(sources, {'dnstwist', 'certstream_keyword', 'subdomain_takeover'})

    def test_unified_feed_items_have_unique_ids(self):
        """All three sources live in one Alert table (a single auto-increment
        sequence), so id alone is globally unique across the unified feed."""
        response = self.client.get('/api/dns_finder/threats_monitored/')
        ids = [item['id'] for item in response.data['results']]
        self.assertEqual(len(ids), len(set(ids)))

    def test_unified_feed_sorted_chronologically(self):
        response = self.client.get('/api/dns_finder/threats_monitored/')
        created_ats = [item['created_at'] for item in response.data['results']]
        self.assertEqual(created_ats, sorted(created_ats, reverse=True))

    def test_unified_feed_filter_by_source(self):
        response = self.client.get('/api/dns_finder/threats_monitored/?source=subdomain_takeover')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data['results']), 1)
        self.assertEqual(response.data['results'][0]['source'], 'subdomain_takeover')
        self.assertEqual(response.data['results'][0]['status'], 'confirmed')

    def test_unified_feed_filter_by_status(self):
        """status filters uniformly by the 5-state lifecycle across all 3 sources."""
        Alert.objects.filter(pk=self.alert_dnstwist.pk).update(status=Alert.STATUS_RESOLVED)

        response = self.client.get('/api/dns_finder/threats_monitored/?status=resolved')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        sources = {item['source'] for item in response.data['results']}
        self.assertEqual(sources, {'dnstwist'})

        response = self.client.get('/api/dns_finder/threats_monitored/?status=pending')
        sources = {item['source'] for item in response.data['results']}
        self.assertEqual(sources, {'certstream_keyword'})

        response = self.client.get('/api/dns_finder/threats_monitored/?status=confirmed')
        sources = {item['source'] for item in response.data['results']}
        self.assertEqual(sources, {'subdomain_takeover'})

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
        self.assertEqual(item['technical_details']['dns_twisted_id'], self.twisted_dnstwist.id)

    def test_unified_feed_certstream_keyword_technical_details(self):
        """dns_twisted_id must also be exposed for certstream_keyword items -
        both source's Timeline/Edit buttons target the DnsTwisted row behind
        the alert, not the Alert row itself."""
        response = self.client.get('/api/dns_finder/threats_monitored/?source=certstream_keyword')
        item = response.data['results'][0]
        self.assertEqual(item['technical_details']['dns_twisted_id'], self.twisted_certstream.id)

    def test_unified_feed_subdomain_takeover_technical_details(self):
        response = self.client.get('/api/dns_finder/threats_monitored/?source=subdomain_takeover')
        item = response.data['results'][0]
        self.assertEqual(item['technical_details']['provider'], 'Amazon S3')
        self.assertEqual(item['technical_details']['cname_target'], 'bucket.s3.amazonaws.com')
        self.assertEqual(item['technical_details']['dns_twisted_id'], self.dangling.id)

    def test_unified_feed_exposes_comments(self):
        Alert.objects.filter(pk=self.alert_dnstwist.pk).update(comments='Confirmed typosquat, monitoring.')
        response = self.client.get('/api/dns_finder/threats_monitored/?source=dnstwist')
        self.assertEqual(response.data['results'][0]['comments'], 'Confirmed typosquat, monitoring.')

    def test_unified_feed_requires_auth(self):
        self.client.credentials()
        response = self.client.get('/api/dns_finder/threats_monitored/')
        self.assertIn(response.status_code, [401, 403])


class MISPTest(TestCase):
    """Test MISP integration."""

    @patch('dns_finder.serializers.PyMISP')
    def test_misp_serializer(self, mock_misp):
        """Test MISP serializer."""
        from dns_finder.serializers import MISPSerializer

        mock_api = MagicMock()
        mock_api.add_event.return_value = MagicMock(id='123', uuid='test-uuid')
        mock_misp.return_value = mock_api

        dns = DnsMonitored.objects.create(domain_name="misp-test.com")
        twisted = DnsTwisted.objects.create(
            domain_name="misp-twisted.com",
            dns_monitored=dns
        )

        serializer = MISPSerializer(data={'id': twisted.id, 'event_uuid': ''})
        self.assertTrue(serializer.is_valid())

    @patch('dns_finder.serializers.PyMISP')
    def test_misp_serializer_resolves_dangling_row_via_dns_twisted(self, mock_misp):
        from dns_finder.serializers import MISPSerializer

        mock_misp.return_value = MagicMock()

        dns_monitored = DnsMonitored.objects.create(domain_name="misp-serializer-takeover.com")
        dangling = DnsTwisted.objects.create(
            domain_name="old.misp-serializer-takeover.com", dns_monitored=dns_monitored,
        )

        serializer = MISPSerializer(data={'domain_name': dangling.domain_name, 'event_uuid': ''})
        self.assertTrue(serializer.is_valid())
        self.assertEqual(serializer.validated_data['id'], dangling.id)

    def test_create_or_update_objects_dispatches_via_related_takeover_alert(self):
        """create_or_update_objects must build takeover-shaped MISP objects
        for a DnsTwisted row with a subdomain_takeover Alert, and
        standard-shaped objects for one without."""
        from common.misp import create_or_update_objects

        dns_monitored = DnsMonitored.objects.create(domain_name="misp-dispatch-test.com")
        takeover_domain = DnsTwisted.objects.create(
            domain_name="old.misp-dispatch-test.com", dns_monitored=dns_monitored, provider='Amazon S3',
        )
        Alert.objects.create(dns_twisted=takeover_domain, source=Alert.SOURCE_SUBDOMAIN_TAKEOVER)
        plain_domain = DnsTwisted.objects.create(
            domain_name="plain.misp-dispatch-test.com", dns_monitored=dns_monitored, fuzzer='homoglyph',
        )
        Alert.objects.create(dns_twisted=plain_domain, source=Alert.SOURCE_DNSTWIST)

        with patch('common.misp.find_domain_object', return_value=(False, None)), \
             patch('common.misp.create_takeover_objects') as mock_takeover_builder, \
             patch('common.misp.create_objects') as mock_standard_builder:
            mock_takeover_builder.return_value = []
            mock_standard_builder.return_value = []

            create_or_update_objects(MagicMock(), {'Event': {'id': 1, 'uuid': 'x'}}, takeover_domain, dry_run=True)
            self.assertTrue(mock_takeover_builder.called)
            self.assertFalse(mock_standard_builder.called)

            mock_takeover_builder.reset_mock()
            create_or_update_objects(MagicMock(), {'Event': {'id': 1, 'uuid': 'x'}}, plain_domain, dry_run=True)
            self.assertFalse(mock_takeover_builder.called)
            self.assertTrue(mock_standard_builder.called)


class IntegrationTest(TestCase):
    """Integration tests."""

    def setUp(self):
        self.user = User.objects.create_user("integ_user", "test@test.com", "pass")
        Subscriber.objects.create(user_rec=self.user, email=True)

    @patch('dns_finder.core.send_dns_finder_notifications')
    @patch('dns_finder.core.start_scheduler')
    def test_complete_workflow(self, mock_scheduler, mock_notifications):
        """Test complete DNS monitoring workflow."""
        dns = DnsMonitored.objects.create(domain_name="workflow-test.com")

        twisted = DnsTwisted.objects.create(
            domain_name="w0rkflow-test.com",
            dns_monitored=dns,
            fuzzer="homoglyph"
        )

        alert = Alert.objects.create(dns_twisted=twisted)

        self.assertEqual(twisted.dns_monitored, dns)
        self.assertEqual(alert.dns_twisted, twisted)

    def test_deletion_signals(self):
        """Test cascade deletion and MISP cleanup."""
        from common.models import MISPEventUuidLink

        dns = DnsMonitored.objects.create(domain_name="signal-test.com")
        twisted = DnsTwisted.objects.create(
            domain_name="signal-twisted.com",
            dns_monitored=dns
        )

        MISPEventUuidLink.objects.create(
            domain_name="signal-twisted.com",
            misp_event_uuid=["test-uuid"]
        )

        dns.delete()

        self.assertFalse(DnsTwisted.objects.filter(id=twisted.id).exists())


class LastEventFieldTest(APITestCase):
    """Test that the last_event field is present and null when no TimelineEvents exist."""

    def setUp(self):
        self.user = User.objects.create_superuser(username='dnslastevent', password='pass')
        _, token = AuthToken.objects.create(self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token}')
        DnsMonitored.objects.create(domain_name='lastevent-dns.com')
        KeywordMonitored.objects.create(name='lastevent-keyword')

    def test_dns_monitored_last_event_null(self):
        """GET /api/dns_finder/dns_monitored/ must include last_event=null when no events."""
        response = self.client.get('/api/dns_finder/dns_monitored/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        results = response.data.get('results', list(response.data))
        self.assertTrue(len(results) >= 1)
        first = results[0]
        self.assertIn('last_event', first)
        last_event = first['last_event']
        if last_event is not None:
            self.assertIn('action', last_event)
            self.assertIn('username', last_event)

    def test_keyword_monitored_last_event_null(self):
        """GET /api/dns_finder/keyword_monitored/ must include last_event=null when no events."""
        response = self.client.get('/api/dns_finder/keyword_monitored/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        results = response.data.get('results', list(response.data))
        self.assertTrue(len(results) >= 1)
        first = results[0]
        self.assertIn('last_event', first)
        last_event = first['last_event']
        if last_event is not None:
            self.assertIn('action', last_event)
            self.assertIn('username', last_event)


class PerformanceTest(TestCase):
    """Test performance and security."""

    def test_bulk_operations_and_validation(self):
        """Test bulk operations performance."""
        start_time = timezone.now()

        dns_list = [DnsMonitored(domain_name=f"perf-{i}.com") for i in range(10)]
        DnsMonitored.objects.bulk_create(dns_list)

        end_time = timezone.now()
        duration = (end_time - start_time).total_seconds()

        self.assertLess(duration, 2.0)
        self.assertEqual(DnsMonitored.objects.filter(domain_name__startswith="perf-").count(), 10)
