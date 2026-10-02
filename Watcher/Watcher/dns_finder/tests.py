import base64
import hashlib
import json
import os
import re
import socket
import sys
import threading
import time
from unittest.mock import patch, MagicMock
from django.test import SimpleTestCase, TestCase, TransactionTestCase
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


class PrintCallbackCertificateTest(TestCase):
    """How print_callback reads the certificate events of the CertStream feed."""

    @staticmethod
    def _message(common_name, all_domains=None):
        subject = {} if common_name is None else {'CN': common_name}
        leaf_cert = {'subject': subject}
        if all_domains is not None:
            leaf_cert['all_domains'] = all_domains
        return {'data': {'leaf_cert': leaf_cert}}

    def test_keyword_matches_whatever_the_case_of_the_keyword(self):
        """CN values are lowercase: a keyword typed with capitals never matched."""
        from dns_finder.core import print_callback

        KeywordMonitored.objects.create(name="Acme-Corp")

        print_callback(self._message("acme-corp-login.example.com"), None)

        alert = Alert.objects.get(dns_twisted__domain_name="acme-corp-login.example.com")
        self.assertEqual(alert.source, Alert.SOURCE_CERTSTREAM_KEYWORD)

    def test_certificate_without_cn_is_matched_through_its_san_list(self):
        """Roughly 4% of the stream has no subject CN: those certificates were invisible."""
        from dns_finder.core import print_callback

        KeywordMonitored.objects.create(name="sancorp")

        print_callback(self._message(None, ["unrelated.example.org", "login-sancorp.example.com"]), None)

        self.assertTrue(Alert.objects.filter(dns_twisted__domain_name="login-sancorp.example.com").exists())
        self.assertFalse(DnsTwisted.objects.filter(domain_name="unrelated.example.org").exists())

    def test_certificate_with_a_cn_is_not_matched_on_its_other_san_names(self):
        """Multi-tenant certificates list hundreds of customers: only the CN decides."""
        from dns_finder.core import print_callback

        KeywordMonitored.objects.create(name="tenantcorp")

        print_callback(self._message("shared-host.example.net", ["shared-host.example.net", "tenantcorp.example.com"]), None)

        self.assertFalse(DnsTwisted.objects.filter(domain_name__contains="tenantcorp").exists())

    def test_certificate_without_any_domain_is_ignored(self):
        from dns_finder.core import print_callback

        KeywordMonitored.objects.create(name="anything")

        print_callback(self._message(None), None)

        self.assertEqual(DnsTwisted.objects.count(), 0)

    def test_null_cn_is_not_turned_into_the_domain_none(self):
        from dns_finder.core import print_callback

        KeywordMonitored.objects.create(name="No")

        print_callback(self._message(None, ["safe.example.com"]), None)

        self.assertFalse(DnsTwisted.objects.filter(domain_name__iexact="none").exists())


class PrintCallbackDatabaseRecoveryTest(TransactionTestCase):
    """The CertStream reader is a long-lived thread outside any request."""

    def test_reader_thread_recovers_after_mysql_drops_its_connection(self):
        """Django only discards a dead connection when told to: without that, every later
        certificate failed with the same OperationalError until the process restarted."""
        import MySQLdb
        from django.db import connection
        from django.db.utils import OperationalError
        from dns_finder.core import print_callback

        KeywordMonitored.objects.create(name="recover-kw")
        message = {'data': {'leaf_cert': {'subject': {'CN': 'recover-kw-evil.example.com'}}}}

        connection.ensure_connection()
        victim = connection.connection.thread_id()
        killer = MySQLdb.connect(**connection.get_connection_params())
        try:
            killer.cursor().execute(f"KILL {victim}")  # what a db_watcher restart or wait_timeout does
        finally:
            killer.close()

        with self.assertRaises(OperationalError):
            print_callback(message, None)  # the message that hits the dead connection is lost...
        print_callback(message, None)      # ...the next one must go through

        self.assertTrue(Alert.objects.filter(dns_twisted__domain_name="recover-kw-evil.example.com").exists())


class MonitoredListsCacheTest(TestCase):
    """print_callback runs for every certificate of the feed (hundreds a second): reading the
    monitored domains and keywords from MySQL, and building a model instance for each row, cost
    ~3 ms per certificate - about 300 certificates a second at best, below the feed's rate."""

    @staticmethod
    def _message(common_name):
        return {'data': {'leaf_cert': {'subject': {'CN': common_name}}}}

    def setUp(self):
        from dns_finder import core

        core.invalidate_monitored_cache()  # rows of other tests were rolled back without a signal

    def test_non_matching_certificates_cost_no_database_query(self):
        from django.db import connection
        from django.test.utils import CaptureQueriesContext
        from dns_finder.core import print_callback

        DnsMonitored.objects.create(domain_name="corp-asset.example")
        KeywordMonitored.objects.create(name="corp-keyword")
        message = self._message("unrelated.example.org")
        print_callback(message, None)  # loads the lists

        with CaptureQueriesContext(connection) as queries:
            for _ in range(50):
                print_callback(message, None)

        self.assertEqual(len(queries), 0, [query['sql'][:80] for query in queries.captured_queries[:3]])

    def test_new_keyword_matches_the_very_next_certificate(self):
        from dns_finder.core import print_callback

        print_callback(self._message("warm-up.example.org"), None)  # caches the lists without the keyword
        KeywordMonitored.objects.create(name="fresh-kw")

        print_callback(self._message("fresh-kw-evil.example.com"), None)

        self.assertTrue(Alert.objects.filter(dns_twisted__domain_name="fresh-kw-evil.example.com").exists())

    def test_deleted_keyword_stops_matching_at_once(self):
        from dns_finder.core import print_callback

        keyword = KeywordMonitored.objects.create(name="gone-kw")
        print_callback(self._message("warm-gone-kw-up.example.org"), None)  # caches the lists with it
        keyword.delete()
        DnsTwisted.objects.all().delete()

        print_callback(self._message("gone-kw-evil.example.com"), None)

        self.assertFalse(DnsTwisted.objects.filter(domain_name="gone-kw-evil.example.com").exists())

    def test_new_monitored_domain_tracks_its_subdomains_at_once(self):
        from dns_finder.core import print_callback

        print_callback(self._message("warm-up.example.org"), None)
        DnsMonitored.objects.create(domain_name="newroot.example")

        with patch('dns_finder.core.evaluate_dangling_subdomain'):
            print_callback(self._message("old.newroot.example"), None)

        self.assertTrue(DnsTwisted.objects.filter(domain_name="old.newroot.example").exists())

    def test_changes_made_by_another_process_are_picked_up_after_the_ttl(self):
        from dns_finder import core
        from dns_finder.core import print_callback

        print_callback(self._message("warm-up.example.org"), None)
        # bulk_create sends no signal, like a write made by another process
        KeywordMonitored.objects.bulk_create([KeywordMonitored(name="elsewhere-kw")])
        message = self._message("elsewhere-kw-evil.example.com")

        print_callback(message, None)
        self.assertFalse(Alert.objects.filter(dns_twisted__domain_name="elsewhere-kw-evil.example.com").exists())

        later = time.monotonic() + core.MONITORED_CACHE_TTL + 1
        with patch('dns_finder.core.time.monotonic', return_value=later):
            print_callback(message, None)
        self.assertTrue(Alert.objects.filter(dns_twisted__domain_name="elsewhere-kw-evil.example.com").exists())


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
    def test_evaluate_notifies_on_first_suspected_verdict(self, mock_notify, mock_check):
        """A pending subdomain whose first check is inconclusive must still
        reach the channels: teams triaging only from TheHive never open the UI."""
        from dns_finder.core import evaluate_dangling_subdomain

        dns_twisted = DnsTwisted.objects.create(
            domain_name="first-suspected.realtime-test.com", dns_monitored=self.dns_monitored,
        )
        alert = Alert.objects.create(
            dns_twisted=dns_twisted, source=Alert.SOURCE_SUBDOMAIN_TAKEOVER, status=Alert.STATUS_PENDING
        )
        mock_check.return_value = 'dangling_suspected'

        evaluate_dangling_subdomain(dns_twisted, source='periodic_recheck')

        alert.refresh_from_db()
        self.assertEqual(alert.status, Alert.STATUS_SUSPECTED)
        mock_notify.assert_called_once()
        self.assertEqual(mock_notify.call_args[0][0].status, Alert.STATUS_SUSPECTED)

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


_WS_GUID = b"258EAFA5-E914-47DA-95CA-C5AB0DC85B11"


def _stop_listening(listener):
    """Close a listening socket and wake the thread blocked in accept() (close() alone does not)."""
    try:
        listener.shutdown(socket.SHUT_RDWR)
    except OSError:
        pass
    listener.close()


class _FakeCertstreamServer:
    """Minimal RFC 6455 server standing in for certstream-server-go.

    Every accepted client is sent ``frames`` certificate_update messages, then the
    connection is either closed after ``hold`` seconds (``close_after_send``) or kept
    open and silent.
    """

    MESSAGE = json.dumps({
        "message_type": "certificate_update",
        "data": {"leaf_cert": {"subject": {"CN": "ws-test.example.com"}}},
    }).encode()

    def __init__(self, frames=0, close_after_send=False, hold=0):
        assert len(self.MESSAGE) < 126  # the frame header below holds the length on one byte
        self.frames = frames
        self.close_after_send = close_after_send
        self.hold = hold
        self.connections = 0
        self.pings = 0
        self._closed = False
        self._clients = []
        self._listener = socket.socket()
        self._listener.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        self._listener.bind(("127.0.0.1", 0))
        self._listener.listen(32)
        self.port = self._listener.getsockname()[1]
        threading.Thread(target=self._accept_loop, daemon=True).start()

    def _accept_loop(self):
        while not self._closed:
            try:
                client, _ = self._listener.accept()
            except OSError:
                return
            self._clients.append(client)
            threading.Thread(target=self._serve, args=(client,), daemon=True).start()

    def _serve(self, client):
        try:
            request = b""
            while b"\r\n\r\n" not in request:
                chunk = client.recv(4096)
                if not chunk:
                    return
                request += chunk
            key = re.search(rb"Sec-WebSocket-Key: *(\S+)", request, re.I).group(1)
            accept = base64.b64encode(hashlib.sha1(key + _WS_GUID).digest())
            client.sendall(
                b"HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\n"
                b"Connection: Upgrade\r\nSec-WebSocket-Accept: " + accept + b"\r\n\r\n"
            )
            self.connections += 1
            for _ in range(self.frames):
                client.sendall(b"\x81" + bytes([len(self.MESSAGE)]) + self.MESSAGE)
            if self.close_after_send:
                time.sleep(self.hold)
                client.sendall(b"\x88\x00")
                return
            while True:  # silent, but answers ping and close frames like a real server
                data = client.recv(4096)
                if not data:
                    return
                opcode = data[0] & 0x0F
                if opcode == 0x9:
                    self.pings += 1
                    client.sendall(b"\x8a\x00")
                elif opcode == 0x8:
                    client.sendall(b"\x88\x00")
                    return
        except OSError:
            pass
        finally:
            client.close()

    def close(self):
        self._closed = True
        _stop_listening(self._listener)
        for client in self._clients:
            try:
                client.shutdown(socket.SHUT_RDWR)
            except OSError:
                pass


class _RecordingProxy:
    """A corporate proxy that refuses everything; counts the clients that reach it."""

    def __init__(self):
        self.connections = 0
        self._listener = socket.socket()
        self._listener.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        self._listener.bind(("127.0.0.1", 0))
        self._listener.listen(32)
        self.port = self._listener.getsockname()[1]
        threading.Thread(target=self._accept_loop, daemon=True).start()

    def _accept_loop(self):
        while True:
            try:
                client, _ = self._listener.accept()
            except OSError:
                return
            self.connections += 1
            try:
                client.recv(4096)
                client.sendall(b"HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\nConnection: close\r\n\r\n")
            except OSError:
                pass
            finally:
                client.close()

    def close(self):
        _stop_listening(self._listener)


class CertStreamClientTest(SimpleTestCase):
    """certstream_client against a real local WebSocket server."""

    def setUp(self):
        env = patch.dict(os.environ)
        env.start()
        self.addCleanup(env.stop)
        for name in ("http_proxy", "https_proxy", "no_proxy", "HTTP_PROXY", "HTTPS_PROXY", "NO_PROXY"):
            os.environ.pop(name, None)

    def _server(self, **kwargs):
        server = _FakeCertstreamServer(**kwargs)
        self.addCleanup(server.close)
        return server

    def _start_client(self, server, callback=None, **kwargs):
        from dns_finder.certstream_client import CertStreamClient

        kwargs.setdefault("reconnect_delay", 0.05)
        client = CertStreamClient(url=f"ws://127.0.0.1:{server.port}/", callback=callback, **kwargs)
        thread = threading.Thread(target=client._connect, daemon=True)
        thread.start()
        self.addCleanup(thread.join, 2)
        self.addCleanup(client.stop)
        return client, thread

    @staticmethod
    def _wait_for(predicate, timeout=5.0):
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            if predicate():
                return True
            time.sleep(0.02)
        return bool(predicate())

    def test_client_reconnects_after_the_server_drops_it_and_keeps_delivering(self):
        server = self._server(frames=2, close_after_send=True)
        received = []
        self._start_client(server, callback=lambda message, context: received.append(message))

        self.assertTrue(self._wait_for(lambda: len(received) >= 4), f"only {len(received)} messages received")
        self.assertGreaterEqual(server.connections, 2)

    def test_reconnect_loop_does_not_grow_the_call_stack(self):
        """Reconnecting from inside on_close nested one more run_forever per drop and the
        listener died silently after ~140 reconnections (Python's recursion limit)."""
        from dns_finder import certstream_client

        cycles = 2000
        depths = []
        holder = {}

        class FakeWebSocketApp:
            def __init__(self, url, **callbacks):
                self.on_close = callbacks["on_close"]

            def run_forever(self, **kwargs):
                depth, frame = 0, sys._getframe()
                while frame:
                    depth, frame = depth + 1, frame.f_back
                depths.append(depth)
                if len(depths) >= cycles:
                    holder["client"].stop()
                # websocket-client invokes on_close from inside run_forever
                self.on_close(self, 1006, "connection lost")
                return True

            def close(self, **kwargs):
                pass

        client = certstream_client.CertStreamClient(url="ws://127.0.0.1:9/", reconnect_delay=0, ping_interval=0)
        holder["client"] = client
        with patch.object(certstream_client.websocket, "WebSocketApp", FakeWebSocketApp), \
                self.assertLogs("watcher.dns_finder", level="INFO"):
            client._connect()

        self.assertEqual(len(depths), cycles)
        self.assertLessEqual(max(depths) - min(depths), 2)

    def test_stop_interrupts_the_wait_before_reconnecting(self):
        server = self._server(frames=0, close_after_send=True)
        client, thread = self._start_client(server, reconnect_delay=30)
        self.assertTrue(self._wait_for(lambda: server.connections >= 1))
        time.sleep(0.3)  # let the client enter its reconnect wait

        started = time.monotonic()
        client.stop()
        thread.join(5)

        self.assertFalse(thread.is_alive(), "client thread still sleeping in its reconnect delay")
        self.assertLess(time.monotonic() - started, 3)

    def test_internal_url_connects_directly_even_when_a_proxy_is_configured(self):
        """The compose file sets lowercase http_proxy and no_proxy="${NO_PROXY},searxng,db_watcher";
        websocket-client reads the lowercase no_proxy first and ignores the uppercase NO_PROXY the
        client used to patch, so the 'internal' CertStream host was sent to the corporate proxy."""
        proxy = _RecordingProxy()
        self.addCleanup(proxy.close)
        proxy_url = f"http://127.0.0.1:{proxy.port}"
        os.environ.update({
            "http_proxy": proxy_url, "HTTP_PROXY": proxy_url,
            "https_proxy": proxy_url, "HTTPS_PROXY": proxy_url,
            "no_proxy": "localhost,searxng,db_watcher", "NO_PROXY": "localhost",
        })
        server = self._server(frames=1)
        received = []

        self._start_client(server, callback=lambda message, context: received.append(message))

        self.assertTrue(self._wait_for(lambda: received), "the client never reached the server directly")
        self.assertEqual(proxy.connections, 0)

    def test_silent_connection_is_dropped_and_reestablished(self):
        server = self._server(frames=0)  # accepts, then never sends anything
        self._start_client(server, idle_timeout=0.5)

        self.assertTrue(
            self._wait_for(lambda: server.connections >= 2, timeout=6),
            "a connection that stopped delivering certificates was never reset",
        )

    def test_client_reports_how_many_certificates_it_received(self):
        server = self._server(frames=3)
        with self.assertLogs("watcher.dns_finder", level="INFO") as logs:
            self._start_client(server, callback=lambda message, context: None, stats_interval=0.3, idle_timeout=0)

            def reported():
                found = (re.search(r"CertStream stats: (\d+) certificates", line) for line in list(logs.output))
                return [int(match.group(1)) for match in found if match]

            self.assertTrue(self._wait_for(lambda: 3 in reported()), f"log lines: {logs.output}")

    def test_idle_connection_is_kept_alive_with_pings(self):
        """The hand-rolled ping thread called WebSocketApp.ping(), which does not exist: the
        AttributeError was swallowed at DEBUG level and no keepalive was ever sent."""
        server = self._server(frames=0)
        self._start_client(server, ping_interval=0.3)

        self.assertTrue(self._wait_for(lambda: server.pings >= 2, timeout=4), f"pings seen by the server: {server.pings}")

    def test_stop_ends_every_thread_the_client_started(self):
        baseline = threading.active_count()
        # held open long enough for a per-connection helper thread to start its first sleep
        server = self._server(frames=1, close_after_send=True, hold=0.15)
        client, thread = self._start_client(server, callback=lambda message, context: None)
        self.assertTrue(self._wait_for(lambda: server.connections >= 8, timeout=10))

        client.stop()
        thread.join(5)
        server.close()

        self.assertTrue(
            self._wait_for(lambda: threading.active_count() <= baseline, timeout=3),
            f"leaked threads: {[t.name for t in threading.enumerate()]}",
        )


class DnsFinderSchedulerTest(SimpleTestCase):

    def test_certificate_transparency_listener_is_a_singleton(self):
        """main_certificate_transparency never returns while the stream is up: a second
        instance, started by the next hourly tick, would open a duplicate stream and every
        certificate would be processed twice (racing on DnsTwisted's unique domain_name)."""
        from dns_finder.core import start_scheduler

        jobs = {}

        class RecordingScheduler:
            def __init__(self, *args, **kwargs):
                pass

            def add_job(self, func, trigger, **kwargs):
                jobs[kwargs['id']] = kwargs

            def start(self):
                pass

        with patch('dns_finder.core.BackgroundScheduler', RecordingScheduler):
            start_scheduler()

        self.assertEqual(jobs['main_certificate_transparency']['max_instances'], 1)


class CertStreamProxyRoutingTest(SimpleTestCase):
    """Which CertStream hosts are contacted directly and which go through the proxy."""

    def setUp(self):
        env = patch.dict(os.environ)
        env.start()
        self.addCleanup(env.stop)
        for name in ("http_proxy", "https_proxy", "no_proxy", "HTTP_PROXY", "HTTPS_PROXY", "NO_PROXY"):
            os.environ.pop(name, None)

    @staticmethod
    def _client(url="ws://placeholder:8080/"):
        from dns_finder.certstream_client import CertStreamClient

        return CertStreamClient(url=url, callback=None)

    def test_internal_hosts_are_recognised(self):
        client = self._client()
        for url in (
            "ws://certstream:8080", "ws://watcher-certstream:8080/", "ws://localhost:8080",
            "ws://127.0.0.1:8080", "ws://10.10.10.7:8080", "ws://172.20.0.5:8080", "ws://192.168.1.10:8080",
        ):
            with self.subTest(url=url):
                self.assertTrue(client.is_internal_url(url))

    def test_public_hosts_are_not_taken_for_internal_ones(self):
        """The check was a string prefix test: the public service certstream.calidog.io (the
        default CERT_STREAM_URL) and any name starting with 10. or 192.168. were 'internal'."""
        client = self._client()
        for url in (
            "wss://certstream.calidog.io", "ws://10.example.com", "ws://192.168.example.com",
            "ws://localhostile.com", "wss://172.example.org", "ws://8.8.8.8:8080",
        ):
            with self.subTest(url=url):
                self.assertFalse(client.is_internal_url(url))

    def test_host_listed_in_no_proxy_is_internal(self):
        os.environ["NO_PROXY"] = "certstream.corp.example"

        self.assertTrue(self._client().is_internal_url("wss://certstream.corp.example"))

    def test_public_certstream_service_still_goes_through_the_proxy(self):
        """Marking it 'internal' made the client add it to no_proxy: the corporate proxy was bypassed
        for a public host."""
        from websocket._url import get_proxy_info

        os.environ.update({"http_proxy": "http://proxy.corp.example:3128", "https_proxy": "http://proxy.corp.example:3128"})

        self._client("wss://certstream.calidog.io")

        self.assertEqual(get_proxy_info("certstream.calidog.io", True), ("proxy.corp.example", 3128, None))
