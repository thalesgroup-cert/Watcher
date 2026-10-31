import os
import re
import types
from unittest.mock import patch, MagicMock
from django.test import SimpleTestCase, TestCase, TransactionTestCase, RequestFactory, override_settings
from django.contrib.auth.models import User, AnonymousUser, Permission
from django.utils import timezone
from datetime import timedelta
from rest_framework.test import APITestCase, APIClient
from rest_framework import status
from knox.models import AuthToken
from common.models import MISPEventUuidLink, LegitimateDomain, PendingAction, Screenshot
from common.core import (generate_ref, _cve_title_parts, citadel_content, _notification_label,
                         send_app_specific_notifications, take_screenshot, collect_observables, thehive_alert_tags,
                         thehive_comment, thehive_severity_for, watcher_object_url)
from common.misp import get_misp_uuid, update_misp_uuid
from django.conf import settings
from django.http import HttpResponse
from common.access_log import AccessLogMiddleware
from common.utils.send_citadel_messages import send_citadel_message
from common.utils.send_slack_messages import send_slack_message
from connectors.notifications import all_types, get_type, render_text, render_title
from types import SimpleNamespace
from common.mail_template.base import Raw, facts_table, render_email
from common.mail_template.data_leak_template import get_data_leak_template
from common.mail_template.site_monitoring_template import get_site_monitoring_template
from common.utils.job_log import (job_count, logged_job, note_channel, report_channel, reported_notification,
                                  run_channel)
from data_leak.models import Alert as LeakAlert, Keyword as LeakKeyword, Subscriber
from django.db.models.signals import post_save
from common import search
from cyber_watch.models import CVEAlert, RansomwareGroup, RansomwareVictim, WatchRule
from dns_finder.models import Alert as DnsAlert, DnsMonitored, DnsTwisted, KeywordMonitored
from site_monitoring.models import Site
from threats_watcher.models import MonitoredKeyword, TrendyWord, auto_generate_trendy_word_summary
from common.utils.update_thehive import create_new_alert, create_observables
import runpy
import logging
import requests


class MISPEventUuidLinkModelTest(TestCase):
    """Test MISPEventUuidLink model basic functionality."""
    
    def test_model_creation_and_string_representation(self):
        """Test model creation and string representation."""
        mapping = MISPEventUuidLink.objects.create(
            domain_name="test.com",
            misp_event_uuid=["uuid-123", "uuid-456"]
        )
        
        self.assertEqual(mapping.domain_name, "test.com")
        self.assertEqual(len(mapping.misp_event_uuid), 2)
        self.assertEqual(str(mapping), "test.com - 2 UUID")
    
    def test_unique_domain_constraint(self):
        """Test domain name unique constraint."""
        MISPEventUuidLink.objects.create(domain_name="unique.com")
        
        with self.assertRaises(Exception):
            MISPEventUuidLink.objects.create(domain_name="unique.com")
    
    def test_empty_uuid_handling(self):
        """Test handling of empty or None UUID lists."""
        empty_mapping = MISPEventUuidLink.objects.create(
            domain_name="empty.com",
            misp_event_uuid=[]
        )
        none_mapping = MISPEventUuidLink.objects.create(
            domain_name="none.com",
            misp_event_uuid=None
        )
        
        self.assertEqual(str(empty_mapping), "empty.com - 0 UUID")
        self.assertEqual(str(none_mapping), "none.com - 0 UUID")


class CoreFunctionsTest(TestCase):
    """Test core utility functions."""
    
    def test_generate_ref_uniqueness(self):
        """Test reference generation produces unique values."""
        refs = [generate_ref() for _ in range(10)]
        unique_refs = set(refs)
        
        self.assertEqual(len(refs), len(unique_refs))
        for ref in refs:
            self.assertIsInstance(ref, str)
            self.assertGreater(len(ref), 5)


class MISPIntegrationTest(TestCase):
    """Test MISP UUID management functions."""
    
    def test_get_misp_uuid_operations(self):
        """Test getting MISP UUIDs for domains."""
        # Test non-existing domain
        uuids = get_misp_uuid("non-existing.com")
        self.assertEqual(uuids, [])
        
        # Test existing domain
        MISPEventUuidLink.objects.create(
            domain_name="existing.com",
            misp_event_uuid=["uuid-123", "uuid-456"]
        )
        uuids = get_misp_uuid("existing.com")
        self.assertEqual(len(uuids), 2)
        self.assertIn("uuid-123", uuids)
    
    def test_update_misp_uuid_operations(self):
        """Test updating MISP UUIDs for domains."""
        # Test new domain
        uuids = update_misp_uuid("new.com", "new-uuid")
        self.assertEqual(len(uuids), 1)
        self.assertIn("new-uuid", uuids)
        
        # Test existing domain
        uuids = update_misp_uuid("new.com", "another-uuid")
        self.assertEqual(len(uuids), 2)
        self.assertIn("another-uuid", uuids)
        
        # Test duplicate prevention
        uuids = update_misp_uuid("new.com", "new-uuid")
        self.assertEqual(len(uuids), 2)
        self.assertEqual(uuids[-1], "new-uuid")  # Should be moved to end
    
    @patch('common.misp.MISPEventUuidLink.objects.get_or_create')
    def test_update_misp_uuid_error_handling(self, mock_get_or_create):
        """Test error handling in UUID update."""
        mock_get_or_create.side_effect = Exception("Database Error")
        
        result = update_misp_uuid("error.com", "uuid")
        self.assertEqual(result, [])


class TakeoverMispObjectTest(TestCase):
    """Test the dedicated MISP object builder for subdomain-takeover findings."""

    def test_create_takeover_objects_includes_expected_attributes(self):
        from common.misp import create_takeover_objects
        from dns_finder.models import DnsMonitored, DnsTwisted

        dns_monitored = DnsMonitored.objects.create(domain_name="misp-takeover-test.com")
        dangling = DnsTwisted.objects.create(
            domain_name="old.misp-takeover-test.com",
            dns_monitored=dns_monitored,
            cname_target="bucket.s3.amazonaws.com",
            provider="Amazon S3",
            http_status_code=404,
        )

        objects = create_takeover_objects(dangling)

        self.assertEqual(len(objects), 1)
        values = {(attr.type, attr.value) for attr in objects[0].attributes}
        self.assertIn(('domain', 'old.misp-takeover-test.com'), values)
        self.assertIn(('hostname', 'bucket.s3.amazonaws.com'), values)
        self.assertIn(('text', 'Amazon S3'), values)

    def test_create_takeover_objects_skips_existing_values(self):
        from common.misp import create_takeover_objects
        from dns_finder.models import DnsMonitored, DnsTwisted

        dns_monitored = DnsMonitored.objects.create(domain_name="misp-takeover-dedup.com")
        dangling = DnsTwisted.objects.create(
            domain_name="old.misp-takeover-dedup.com", dns_monitored=dns_monitored,
            provider="Amazon S3"
        )

        objects = create_takeover_objects(
            dangling, existing_values={('domain', 'old.misp-takeover-dedup.com')}
        )

        values = {(attr.type, attr.value) for attr in objects[0].attributes}
        self.assertNotIn(('domain', 'old.misp-takeover-dedup.com'), values)
        self.assertIn(('text', 'Amazon S3'), values)


class NotificationSystemTest(TestCase):
    """Test notification system components."""
    
    @patch('common.core.send_slack_message')
    @patch('common.core.send_email_notifications') 
    def test_notification_functions_exist(self, mock_email, mock_slack):
        """Test that notification functions can be called without errors."""
        from common.core import send_app_specific_notifications
        from data_leak.models import Subscriber
        
        user = User.objects.create_user("testuser", "test@test.com", "pass")
        subscriber = Subscriber.objects.create(user_rec=user, email=True)
        
        # Test with QuerySet (not list)
        subscribers = Subscriber.objects.filter(id=subscriber.id)
        context_data = {'test': 'data'}
        
        # Must not raise
        send_app_specific_notifications('data_leak', context_data, subscribers)

    @patch('common.core.send_slack_message')
    @patch('common.core.send_email_notifications')
    def test_dns_finder_dangling_notifications(self, mock_email, mock_slack):
        """Test that the dns_finder_dangling app_name dispatches without error."""
        from common.core import send_app_specific_notifications
        from dns_finder.models import DnsMonitored, DnsTwisted, Alert, Subscriber

        user = User.objects.create_user("dangling_notify_user", "dangling@test.com", "pass")
        subscriber = Subscriber.objects.create(user_rec=user, email=True)
        from connectors.notifications import save_setting
        save_setting('dns_finder_dangling', 'slack', enabled=True)
        save_setting('dns_finder_dangling', 'email', enabled=True)

        dns_monitored = DnsMonitored.objects.create(domain_name="notify-dangling.com")
        dangling = DnsTwisted.objects.create(
            domain_name="old.notify-dangling.com",
            dns_monitored=dns_monitored,
            provider='Amazon S3',
            cname_target='mybucket.s3.amazonaws.com',
        )
        alert = Alert.objects.create(dns_twisted=dangling, source=Alert.SOURCE_SUBDOMAIN_TAKEOVER, trigger='certstream')

        subscribers = Subscriber.objects.filter(id=subscriber.id)
        context_data = {'alert': alert}

        send_app_specific_notifications('dns_finder_dangling', context_data, subscribers)

        self.assertTrue(mock_slack.called)
        self.assertTrue(mock_email.called)

    @patch('common.core.send_thehive_alert')
    @patch('common.core.send_slack_message')
    @patch('common.core.send_email_notifications')
    def test_dns_finder_dangling_notifications_reflect_takeover_status(self, mock_email, mock_slack, mock_thehive):
        """Every channel states whether the takeover is confirmed or only suspected,
        and TheHive files a suspected one below a confirmed one."""
        from common.core import send_app_specific_notifications
        from connectors.notifications import get_type, save_setting
        from dns_finder.models import DnsMonitored, DnsTwisted, Alert, Subscriber

        user = User.objects.create_user("dangling_status_user", "dangling_status@test.com", "pass")
        subscriber = Subscriber.objects.create(user_rec=user, email=True)
        subscribers = Subscriber.objects.filter(id=subscriber.id)
        for channel in ('slack', 'email', 'thehive'):
            save_setting('dns_finder_dangling', channel, enabled=True)
        dns_monitored = DnsMonitored.objects.create(domain_name="status-dangling.com")

        cases = [
            (Alert.STATUS_SUSPECTED, 'Suspected', 1),
            (Alert.STATUS_CONFIRMED, 'Confirmed', get_type('dns_finder_dangling').thehive_meta['severity']),
        ]
        for alert_status, label, severity in cases:
            with self.subTest(status=alert_status):
                mock_email.reset_mock()
                mock_slack.reset_mock()
                mock_thehive.reset_mock()
                dangling = DnsTwisted.objects.create(
                    domain_name=f"{alert_status}.status-dangling.com", dns_monitored=dns_monitored,
                )
                alert = Alert.objects.create(
                    dns_twisted=dangling, source=Alert.SOURCE_SUBDOMAIN_TAKEOVER, status=alert_status,
                )

                send_app_specific_notifications('dns_finder_dangling', {'alert': alert}, subscribers)

                self.assertIn(f"{label} Subdomain Takeover", mock_slack.call_args[0][0])
                self.assertIn(f"({label})", mock_email.call_args[0][0])
                self.assertIn(f"{label} -", mock_email.call_args[0][1])
                thehive_kwargs = mock_thehive.call_args.kwargs
                self.assertTrue(thehive_kwargs['title'].startswith(f"{label} Subdomain Takeover"))
                self.assertEqual(thehive_kwargs['severity'], severity)

    @patch('common.core.send_email_notifications')
    def test_dns_finder_notifications_certstream_keyword_source_uses_real_template(self, mock_email):
        """
        Regression test for the source-branch bug: Alert.source is now written as
        'certstream_keyword' (Alert.SOURCE_CERTSTREAM_KEYWORD), but common/core.py used to
        branch on the old literal 'print_callback', so this path always fell through to the
        generic "Alert with no specific model defined." fallback body instead of the real
        DNS Threats Monitored cert-transparency HTML template. Exercises the real
        send_dns_finder_notifications -> send_app_specific_notifications path (not a mock of
        the dispatch itself), only mocking the outbound SMTP call.
        """
        from dns_finder.core import send_dns_finder_notifications
        from dns_finder.models import DnsMonitored, KeywordMonitored, DnsTwisted, Alert, Subscriber

        user = User.objects.create_user("certstream_notify_user", "certstream_notify@test.com", "pass")
        Subscriber.objects.create(user_rec=user, email=True)
        from connectors.notifications import save_setting
        save_setting('dns_finder_cert_transparency', 'email', enabled=True)

        dns_monitored = DnsMonitored.objects.create(domain_name="notify-certstream.com")
        keyword = KeywordMonitored.objects.create(name="notify-keyword")
        dns_twisted = DnsTwisted.objects.create(
            domain_name="evil.notify-certstream.com",
            dns_monitored=dns_monitored,
            keyword_monitored=keyword,
        )
        alert = Alert.objects.create(dns_twisted=dns_twisted, source=Alert.SOURCE_CERTSTREAM_KEYWORD)

        send_dns_finder_notifications(alert)

        self.assertTrue(mock_email.called)
        email_body = mock_email.call_args[0][1]
        self.assertNotEqual(email_body, "Alert with no specific model defined.")
        self.assertIn("evil[.]notify-certstream[.]com", email_body)

    @patch('common.core.send_email_notifications')
    def test_dns_finder_notifications_dnstwist_source_uses_real_template(self, mock_email):
        """
        Same regression as above, for the 'dnstwist' (Alert.SOURCE_DNSTWIST) source value,
        which common/core.py used to compare against the old literal 'check_dnstwist'.
        """
        from dns_finder.core import send_dns_finder_notifications
        from dns_finder.models import DnsMonitored, DnsTwisted, Alert, Subscriber

        user = User.objects.create_user("dnstwist_notify_user", "dnstwist_notify@test.com", "pass")
        Subscriber.objects.create(user_rec=user, email=True)
        from connectors.notifications import save_setting
        save_setting('dns_finder', 'email', enabled=True)

        dns_monitored = DnsMonitored.objects.create(domain_name="notify-dnstwist.com")
        dns_twisted = DnsTwisted.objects.create(
            domain_name="notify-dnstw1st.com",
            dns_monitored=dns_monitored,
        )
        alert = Alert.objects.create(dns_twisted=dns_twisted, source=Alert.SOURCE_DNSTWIST)

        send_dns_finder_notifications(alert)

        self.assertTrue(mock_email.called)
        email_body = mock_email.call_args[0][1]
        self.assertNotEqual(email_body, "Alert with no specific model defined.")
        self.assertIn("notify-dnstw1st[.]com", email_body)


class SecurityTest(TestCase):
    """Test security-related functionality."""
    
    def test_domain_input_sanitization(self):
        """Test domain name input handling."""
        test_domains = [
            "normal-domain.com",
            "sub.domain.com",
            "domain-with-dashes.org"
        ]
        
        for domain in test_domains:
            uuids = update_misp_uuid(domain, "test-uuid")
            self.assertIsInstance(uuids, list)
            
            # Cleanup
            try:
                mapping = MISPEventUuidLink.objects.get(domain_name=domain)
                mapping.delete()
            except MISPEventUuidLink.DoesNotExist:
                pass
    
    @patch.dict(os.environ, {'MISP_KEY': 'test-key'})
    def test_environment_variable_handling(self):
        """Test environment variable configuration."""
        self.assertEqual(os.environ.get('MISP_KEY'), 'test-key')


class PerformanceTest(TestCase):
    """Test performance with reasonable data sizes."""
    
    def test_moderate_uuid_operations(self):
        """Test performance with moderate data sizes."""
        # Test with 10 domains instead of 100
        domains = [f"perf-test-{i}.com" for i in range(10)]
        
        start_time = timezone.now()
        
        for domain in domains:
            update_misp_uuid(domain, f"uuid-{domain}")
        
        end_time = timezone.now()
        duration = (end_time - start_time).total_seconds()
        
        self.assertLess(duration, 2.0)
        self.assertEqual(MISPEventUuidLink.objects.count(), 10)
    
    def test_reasonable_uuid_list_size(self):
        """Test with reasonable UUID list size."""
        domain = "uuid-list-test.com"
        
        # Test with 5 UUIDs instead of 50
        uuid_list = [f"uuid-{i}" for i in range(5)]
        MISPEventUuidLink.objects.create(
            domain_name=domain,
            misp_event_uuid=uuid_list
        )
        
        start_time = timezone.now()
        
        for _ in range(10):
            uuids = get_misp_uuid(domain)
            self.assertEqual(len(uuids), 5)
        
        end_time = timezone.now()
        duration = (end_time - start_time).total_seconds()
        
        self.assertLess(duration, 1.0)


class IntegrationTest(TransactionTestCase):
    """Integration tests for common module workflow."""
    
    def setUp(self):
        """Set up test data."""
        self.user = User.objects.create_user(
            username="integrationuser",
            email="integration@test.com", 
            password="testpass123"
        )
    
    def test_misp_workflow_integration(self):
        """Test complete MISP UUID workflow."""
        domain = "integration-test.com"
        
        # Test initial state
        uuids = get_misp_uuid(domain)
        self.assertEqual(uuids, [])
        
        # Test adding UUID
        uuids = update_misp_uuid(domain, "first-uuid")
        self.assertEqual(len(uuids), 1)
        
        # Test adding another UUID
        uuids = update_misp_uuid(domain, "second-uuid")
        self.assertEqual(len(uuids), 2)
        
        # Verify persistence
        retrieved_uuids = get_misp_uuid(domain)
        self.assertEqual(len(retrieved_uuids), 2)
    
    @patch('dns_finder.models.DnsTwisted')
    @patch('site_monitoring.models.Site')
    def test_domain_cleanup_workflow(self, mock_site, mock_dns_twisted):
        """Test domain cleanup functionality."""
        domain = "cleanup-test.com"
        
        # Create mapping
        MISPEventUuidLink.objects.create(
            domain_name=domain,
            misp_event_uuid=["cleanup-uuid"]
        )
        
        # Mock that domain is not used anywhere
        mock_site.objects.filter.return_value.exists.return_value = False
        mock_dns_twisted.objects.filter.return_value.exists.return_value = False
        
        # Test cleanup
        result = MISPEventUuidLink.check_and_delete_unused_domain(domain)
        
        self.assertTrue(result)
        self.assertFalse(MISPEventUuidLink.objects.filter(domain_name=domain).exists())


class ModelValidationTest(TestCase):
    """Test model validation and constraints."""
    
    def test_misp_link_field_validation(self):
        """Test MISPEventUuidLink field validation."""
        # Test with valid data
        mapping = MISPEventUuidLink.objects.create(
            domain_name="valid.com",
            misp_event_uuid=["valid-uuid-1", "valid-uuid-2"]
        )
        
        self.assertTrue(mapping.id)
        self.assertIsNotNone(mapping.created_at)
        self.assertIsNotNone(mapping.updated_at)
    
    def test_domain_name_requirements(self):
        """Test domain name field requirements."""
        # Test domain name with valid data works
        mapping = MISPEventUuidLink.objects.create(domain_name="valid.com")
        self.assertTrue(mapping.id)
        
        # Test very long domain name (should work within MySQL limits)
        long_domain = "a" * 100 + ".com"
        long_mapping = MISPEventUuidLink.objects.create(domain_name=long_domain)
        self.assertTrue(long_mapping.id)
        
        # Test domain name validation (this is more about business logic than DB constraints)
        # Empty string is allowed by Django CharField, so we test that it creates successfully
        empty_mapping = MISPEventUuidLink.objects.create(domain_name="")
        self.assertTrue(empty_mapping.id)


class PendingActionResolutionTest(APITestCase):
    """
    Test that approving/rejecting a PendingAction of type 'udrp_transfer'
    creates the expected TimelineEvent via _record_resolution_event.
    """

    def setUp(self):
        from site_monitoring.models import Site
        from timeline.models import TimelineEvent

        self.TimelineEvent = TimelineEvent

        # Authenticated user
        self.user = User.objects.create_superuser(
            username='pa_resolver', password='testpass123'
        )
        _, token = AuthToken.objects.create(self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token}')

        # A monitored site
        self.site = Site.objects.create(domain_name='pa-test.com')

        # The corresponding legitimate domain (same domain_name, unique constraint OK
        # because LegitimateDomain and Site are different tables)
        self.legit = LegitimateDomain.objects.create(domain_name='pa-test.com')

        # A pending UDRP transfer action
        self.pa = PendingAction.objects.create(
            action_type='udrp_transfer',
            title='UDRP: pa-test.com',
            description='Transfer pa-test.com to Legitimate Domains',
            metadata={
                'site_id': self.site.pk,
                'domain_name': 'pa-test.com',
            },
        )

    def _approve_url(self):
        return f'/api/common/pending_actions/{self.pa.pk}/approve/'

    def _reject_url(self):
        return f'/api/common/pending_actions/{self.pa.pk}/reject/'

    @patch('common.api._execute_pending_action')
    def test_approve_creates_transferred_event(self, mock_execute):
        """
        POST /api/common/pending_actions/{id}/approve/ must create a TimelineEvent
        with ACTION_TRANSFERRED linked to the LegitimateDomain.
        """
        from django.contrib.contenttypes.models import ContentType

        mock_execute.return_value = None  # Skip actual site transfer/deletion

        response = self.client.post(self._approve_url(), format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)

        ct = ContentType.objects.get_for_model(LegitimateDomain)
        event_exists = self.TimelineEvent.objects.filter(
            content_type=ct,
            object_id=self.legit.pk,
            action=self.TimelineEvent.ACTION_TRANSFERRED,
        ).exists()
        self.assertTrue(
            event_exists,
            "Expected a ACTION_TRANSFERRED TimelineEvent on the LegitimateDomain after approval"
        )

    def test_reject_creates_cancelled_event(self):
        """
        POST /api/common/pending_actions/{id}/reject/ must create a TimelineEvent
        with ACTION_CANCELLED and object_id == site.pk.
        """
        from django.contrib.contenttypes.models import ContentType
        from site_monitoring.models import Site

        response = self.client.post(self._reject_url(), format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)

        ct = ContentType.objects.get_for_model(Site)
        event_exists = self.TimelineEvent.objects.filter(
            content_type=ct,
            object_id=self.site.pk,
            action=self.TimelineEvent.ACTION_CANCELLED,
        ).exists()
        self.assertTrue(
            event_exists,
            "Expected a ACTION_CANCELLED TimelineEvent with object_id=site.pk after rejection"
        )


class DocumentedModulesImportTest(SimpleTestCase):
    """docs/build_the_docs.sh comments out the `from .models` / `from common` / `from connectors`
    lines of the apps so that Sphinx can import their modules without Django's app registry:
    module-level code must not use the names those lines bind (a signal registered at import time
    on a model broke the documentation build with a NameError)."""

    MODULES = (
        "common/core.py", "common/misp.py", "cyber_watch/core.py", "data_leak/core.py",
        "dns_finder/core.py", "site_monitoring/core.py", "threats_watcher/core.py",
    )
    COMMENTED_OUT = re.compile(r'^[ \t]*from (\.models|common|site_monitoring\.models|connectors)')

    def test_documented_modules_import_without_their_models(self):
        base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        for relative_path in self.MODULES:
            with self.subTest(module=relative_path):
                path = os.path.join(base_dir, relative_path)
                with open(path) as source_file:
                    lines = source_file.read().splitlines(keepends=True)
                source = "".join("#" + line if self.COMMENTED_OUT.match(line) else line for line in lines)
                module = types.ModuleType(relative_path)
                module.__package__ = relative_path.split("/")[0]
                exec(compile(source, path, "exec"), module.__dict__)


class NormalizeDomainTest(SimpleTestCase):
    """common.bulk.normalize_domain: what a pasted domain is turned into."""

    def test_scheme_path_port_case_and_trailing_dot_are_removed(self):
        from common.bulk import normalize_domain
        self.assertEqual(normalize_domain('  HTTPS://Example.COM:8443/login?x=1#top  '), 'example.com')
        self.assertEqual(normalize_domain('other.org.'), 'other.org')

    def test_defanged_domains_are_restored(self):
        from common.bulk import normalize_domain
        self.assertEqual(normalize_domain('hxxps://evil[.]example[.]com/login'), 'evil.example.com')
        self.assertEqual(normalize_domain('foo(.)org'), 'foo.org')
        self.assertEqual(normalize_domain('bar{.}net'), 'bar.net')
        self.assertEqual(normalize_domain('HXXP[://]baz[.]io'), 'baz.io')


class BulkCreateTest(APITestCase):
    """POST /api/common/legitimate_domains/bulk_create/ ("One item per line" forms), provided by common.bulk.BulkCreateMixin."""

    URL = '/api/common/legitimate_domains/bulk_create/'

    def setUp(self):
        self.admin = User.objects.create_superuser(username='bulk_admin', password='testpass123')
        self._login(self.admin)

    def _login(self, user):
        _, token = AuthToken.objects.create(user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token}')

    def _post(self, values, shared=None):
        return self.client.post(self.URL, {'values': values, 'shared': shared or {}}, format='json')

    @staticmethod
    def _statuses(response):
        return {r['value']: r['status'] for r in response.data['results']}

    def test_valid_batch_applies_shared_fields_to_every_item(self):
        response = self._post('one.com\ntwo.com\nthree.com',
                              {'ticket_id': 'T-1', 'contact': 'soc@example.com', 'comments': 'bulk'})
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual((response.data['total'], response.data['created']), (3, 3))
        domains = LegitimateDomain.objects.filter(domain_name__in=['one.com', 'two.com', 'three.com'])
        self.assertEqual(domains.count(), 3)
        for domain in domains:
            self.assertEqual((domain.ticket_id, domain.contact, domain.comments), ('T-1', 'soc@example.com', 'bulk'))
        self.assertTrue(all(r['id'] for r in response.data['results']))

    def test_mixed_batch_reports_each_item_without_blocking_the_others(self):
        LegitimateDomain.objects.create(domain_name='exists.com')
        response = self._post('good.com\nexists.com\nfoo\nGOOD.com')
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        # "GOOD.com" is normalized to "good.com", so it is the batch duplicate of the first line
        self.assertEqual(
            [(r['value'], r['status']) for r in response.data['results']],
            [('good.com', 'created'), ('exists.com', 'skipped'), ('foo', 'error'), ('good.com', 'skipped')],
        )
        reasons = {r['reason'] for r in response.data['results']}
        self.assertIn('Already exists', reasons)
        self.assertIn('Duplicate in batch', reasons)
        self.assertEqual((response.data['created'], response.data['skipped'], response.data['errors']), (1, 2, 1))
        self.assertTrue(LegitimateDomain.objects.filter(domain_name='good.com').exists())
        self.assertFalse(LegitimateDomain.objects.filter(domain_name='foo').exists())

    def test_lines_are_trimmed_empty_lines_ignored_and_domains_normalized(self):
        response = self._post('  HTTPS://Example.COM/login?x=1  \n\n   \r\nother.org.\n')
        self.assertEqual(response.data['total'], 2)
        self.assertEqual(self._statuses(response), {'example.com': 'created', 'other.org': 'created'})

    def test_defanged_domains_are_restored(self):
        response = self._post('hxxps://evil[.]example[.]com/login\nfoo(.)org')
        self.assertEqual(self._statuses(response), {'evil.example.com': 'created', 'foo.org': 'created'})

    def test_single_create_applies_the_same_normalization(self):
        response = self.client.post('/api/common/legitimate_domains/',
                                    {'domain_name': 'hxxps://Single[.]Example[.]com/x'}, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertEqual(response.data['domain_name'], 'single.example.com')

    def test_dry_run_reports_without_writing_anything(self):
        LegitimateDomain.objects.create(domain_name='old.com')
        response = self.client.post(self.URL, {'values': 'new.com\nold.com\nfoo', 'dry_run': True}, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertTrue(response.data['dry_run'])
        self.assertEqual(self._statuses(response), {'new.com': 'created', 'old.com': 'skipped', 'foo': 'error'})
        self.assertFalse(LegitimateDomain.objects.filter(domain_name='new.com').exists())

    def test_accepts_a_list_of_values(self):
        self.assertEqual(self._post(['list-a.com', 'list-b.com']).data['created'], 2)

    def test_limit_exceeded_is_rejected_and_creates_nothing(self):
        with self.settings(BULK_CREATE_MAX_ITEMS=3):
            response = self._post('a.com\nb.com\nc.com\nd.com')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(LegitimateDomain.objects.filter(domain_name='a.com').exists())

    def test_empty_input_is_rejected(self):
        self.assertEqual(self._post(' \n \n').status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(self.client.post(self.URL, {'shared': {}}, format='json').status_code, status.HTTP_400_BAD_REQUEST)

    def test_unauthenticated_request_is_rejected(self):
        self.client.credentials()
        self.assertIn(self._post('x.com').status_code, (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN))

    def test_any_authenticated_user_can_bulk_create_like_a_single_create(self):
        self._login(User.objects.create_user(username='bulk_reader', password='testpass123'))
        self.assertEqual(self._post('reader.com').data['created'], 1)


class BulkActionTest(APITestCase):
    """POST /api/common/legitimate_domains/bulk_update/ and bulk_delete/ (common.bulk.BulkActionMixin)."""

    URL = '/api/common/legitimate_domains/'

    def setUp(self):
        self.admin = User.objects.create_superuser(username='action_admin', password='testpass123')
        _, token = AuthToken.objects.create(self.admin)
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token}')

    def test_bulk_delete_removes_every_selected_row_and_reports_missing_ids(self):
        a = LegitimateDomain.objects.create(domain_name='del-a.com')
        b = LegitimateDomain.objects.create(domain_name='del-b.com')
        response = self.client.post(self.URL + 'bulk_delete/', {'ids': [a.pk, b.pk, 999999]}, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual((response.data['succeeded'], response.data['skipped']), (2, 1))
        self.assertFalse(LegitimateDomain.objects.filter(pk__in=[a.pk, b.pk]).exists())

    def test_only_authentication_is_required_like_a_single_delete(self):
        domain = LegitimateDomain.objects.create(domain_name='plain-user.com')
        _, token = AuthToken.objects.create(User.objects.create_user(username='plain', password='testpass123'))
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token}')
        response = self.client.post(self.URL + 'bulk_delete/', {'ids': [domain.pk]}, format='json')
        self.assertEqual(response.data['succeeded'], 1, response.data)

    def test_only_repurchased_can_be_changed_in_bulk(self):
        domain = LegitimateDomain.objects.create(domain_name='keep.com')
        response = self.client.post(self.URL + 'bulk_update/',
                                    {'ids': [domain.pk], 'changes': {'domain_name': 'other.com'}}, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        domain.refresh_from_db()
        self.assertEqual(domain.domain_name, 'keep.com')

        response = self.client.post(self.URL + 'bulk_update/',
                                    {'ids': [domain.pk], 'changes': {'repurchased': True}}, format='json')
        self.assertEqual(response.data['succeeded'], 1, response.data)
        domain.refresh_from_db()
        self.assertTrue(domain.repurchased)

    def test_invalid_ids_and_limit(self):
        url = self.URL + 'bulk_delete/'
        self.assertEqual(self.client.post(url, {'ids': []}, format='json').status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(self.client.post(url, {'ids': ['x']}, format='json').status_code, status.HTTP_400_BAD_REQUEST)
        with self.settings(BULK_ACTION_MAX_ITEMS=2):
            self.assertEqual(self.client.post(url, {'ids': [1, 2, 3]}, format='json').status_code, status.HTTP_400_BAD_REQUEST)

    def test_unauthenticated_requests_are_rejected(self):
        self.client.credentials()
        response = self.client.post(self.URL + 'bulk_delete/', {'ids': [1]}, format='json')
        self.assertIn(response.status_code, (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN))


class LegitimateDomainListAPITest(APITestCase):
    """GET /api/common/legitimate_domains/ filters and statistics, public and authenticated views."""

    URL = '/api/common/legitimate_domains/'

    def setUp(self):
        today = timezone.now().date()
        make = LegitimateDomain.objects.create
        self.expired = make(domain_name='expired.com', expiry=today - timedelta(days=3), ticket_id='T-1',
                            comments='internal note')
        self.soon = make(domain_name='soon.fr', expiry=today + timedelta(days=10), ssl_expiry=today - timedelta(days=1))
        self.valid = make(domain_name='valid.com', expiry=today + timedelta(days=200), repurchased=True,
                          ssl_expiry=today + timedelta(days=20))
        self.no_date = make(domain_name='nodate.org')
        _, self.token = AuthToken.objects.create(User.objects.create_user(username='reader', password='testpass123'))

    def names(self, query=''):
        response = self.client.get(self.URL + query)
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        return sorted(row['domain_name'] for row in response.data['results'])

    def login(self):
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {self.token}')

    def test_status_filter_follows_the_domain_expiry(self):
        self.assertEqual(self.names('?status=expired'), ['expired.com'])
        self.assertEqual(self.names('?status=expiring_soon'), ['soon.fr'])
        self.assertEqual(self.names('?status=attention'), ['expired.com', 'soon.fr'])
        self.assertEqual(self.names('?status=valid'), ['valid.com'])
        self.assertEqual(self.names('?status=none'), ['nodate.org'])
        self.assertEqual(len(self.names('?status=unknown')), 4)

    def test_ssl_and_repurchased_filters(self):
        self.assertEqual(self.names('?ssl=expired'), ['soon.fr'])
        self.assertEqual(self.names('?ssl=attention'), ['soon.fr', 'valid.com'])
        self.assertEqual(self.names('?ssl=none'), ['expired.com', 'nodate.org'])
        self.assertEqual(self.names('?repurchased=true'), ['valid.com'])
        self.assertEqual(self.names('?repurchased=false&status=attention'), ['expired.com', 'soon.fr'])

    def test_anonymous_visitors_do_not_get_internal_fields(self):
        row = self.client.get(self.URL + f'{self.expired.pk}/').data
        for field in ('ticket_id', 'comments', 'misp_event_uuid', 'last_event'):
            self.assertNotIn(field, row)
        self.assertEqual(row['domain_name'], 'expired.com')

        self.login()
        row = self.client.get(self.URL + f'{self.expired.pk}/').data
        self.assertEqual((row['ticket_id'], row['comments']), ('T-1', 'internal note'))

    def test_anonymous_search_ignores_internal_fields(self):
        self.assertEqual(self.names('?search=internal'), [])
        self.login()
        self.assertEqual(self.names('?search=internal'), ['expired.com'])

    def test_ordering_on_expiry_columns(self):
        response = self.client.get(self.URL + '?ordering=ssl_expiry&ssl=attention')
        self.assertEqual([r['domain_name'] for r in response.data['results']], ['soon.fr', 'valid.com'])

    def test_statistics_use_the_same_rules_as_the_filters(self):
        stats = self.client.get(self.URL + 'statistics/').data
        self.assertEqual(
            {k: stats[k] for k in ('total', 'repurchased', 'expired', 'expiringSoon', 'noExpiry', 'sslExpired', 'sslExpiringSoon', 'sslNoExpiry')},
            {'total': 4, 'repurchased': 1, 'expired': 1, 'expiringSoon': 1, 'noExpiry': 1, 'sslExpired': 1, 'sslExpiringSoon': 1, 'sslNoExpiry': 2},
        )
        self.assertEqual(stats['topTlds'][0], {'tld': '.com', 'count': 2})
        self.assertEqual(len(stats['upcoming']), 12)
        today = timezone.now().date()
        self.assertEqual(stats['upcoming'][0]['month'], f'{today.year}-{today.month:02d}')
        self.assertEqual(sum(m['domains'] for m in stats['upcoming']), 2)
        self.assertEqual(sum(m['certificates'] for m in stats['upcoming']), 1)


# Access log (who did what) and the Gunicorn configuration
def _answer(status):
    return lambda request: HttpResponse(status=status)


class AccessLogTest(TestCase):
    def setUp(self):
        self.factory = RequestFactory()
        self.alice = User.objects.create_user('alice', 'alice@example.com', 'pass')

    def _request(self, method, path, status=200, user=None, address='172.21.0.1', **extra):
        request = getattr(self.factory, method.lower())(path, REMOTE_ADDR=address, **extra)
        request.user = user or AnonymousUser()
        AccessLogMiddleware(_answer(status))(request)

    def _logged(self, method, path, status=200, **kwargs):
        with self.assertLogs('watcher.access', level='DEBUG') as logs:
            self._request(method, path, status, **kwargs)
        return logs.records[0]

    def test_an_action_that_changes_something_says_who_did_what(self):
        record = self._logged('PATCH', '/api/connectors/thehive/', user=self.alice)
        self.assertEqual(record.levelname, 'INFO')
        self.assertRegex(record.getMessage(), r'^alice 172\.21\.0\.1 PATCH /api/connectors/thehive/ 200 \d+ms$')

    def test_a_refused_action_is_a_warning(self):
        self.assertEqual(self._logged('POST', '/api/data_leak/keyword/', 400, user=self.alice).levelname, 'WARNING')

    def test_access_denied_is_a_warning_even_for_a_read(self):
        for code in (401, 403):
            with self.subTest(status=code):
                self.assertEqual(self._logged('GET', '/api/connectors/', code).levelname, 'WARNING')

    def test_a_server_error_is_an_error(self):
        self.assertEqual(self._logged('GET', '/api/cyber_watch/cves/', 500, user=self.alice).levelname, 'ERROR')

    def test_login_success_is_info_and_failure_is_a_warning(self):
        self.assertEqual(self._logged('POST', '/api/auth/login', 200).levelname, 'INFO')
        self.assertEqual(self._logged('POST', '/api/auth/login', 400).levelname, 'WARNING')

    def test_a_read_of_the_api_is_only_debug(self):
        self.assertEqual(self._logged('GET', '/api/auth/user', user=self.alice).levelname, 'DEBUG')
        with self.assertNoLogs('watcher.access', level='INFO'):
            self._request('GET', '/api/auth/user', user=self.alice)

    def test_the_files_of_the_interface_are_not_logged(self):
        with self.assertNoLogs('watcher.access', level='DEBUG'):
            self._request('GET', '/static/frontend/main.js', 304)

    def test_the_health_check_of_docker_is_not_logged_but_the_same_visit_from_elsewhere_is(self):
        with self.assertNoLogs('watcher.access', level='DEBUG'):
            self._request('GET', '/', address='127.0.0.1')
        self.assertEqual(self._logged('GET', '/', address='172.21.0.1').levelname, 'DEBUG')

    def test_a_visitor_who_is_not_signed_in_is_a_dash(self):
        self.assertTrue(self._logged('POST', '/api/auth/login', 200).getMessage().startswith('- 172.21.0.1 POST'))

    def test_the_query_string_is_left_out(self):
        record = self._logged('PATCH', '/api/x/?search=secret+name', user=self.alice)
        self.assertNotIn('secret', record.getMessage())

    def test_the_address_a_proxy_forwards_is_told_apart_from_the_one_the_server_sees(self):
        record = self._logged('POST', '/api/x/', user=self.alice, HTTP_X_FORWARDED_FOR='203.0.113.9')
        self.assertIn('172.21.0.1 (forwarded for 203.0.113.9)', record.getMessage())

    def test_a_failure_to_write_a_line_never_breaks_the_request(self):
        request = self.factory.post('/api/x/')
        request.user = self.alice
        with patch('common.access_log.logger.log', side_effect=RuntimeError('disk full')):
            response = AccessLogMiddleware(_answer(200))(request)
        self.assertEqual(response.status_code, 200)

    def test_the_user_is_the_one_the_api_authenticated(self):
        """Through the whole stack: the API signs the user in after the middleware has been entered."""
        client = APIClient()
        client.force_authenticate(self.alice)
        with self.assertLogs('watcher.access', level='DEBUG') as logs:
            response = client.get('/api/auth/user')
        self.assertEqual(response.status_code, 200)
        self.assertTrue(logs.records[-1].getMessage().startswith('alice '))


class WiringTest(SimpleTestCase):
    def test_the_access_log_sees_every_request_so_it_comes_first(self):
        self.assertEqual(settings.MIDDLEWARE[0], 'common.access_log.AccessLogMiddleware')

    def test_the_access_log_has_its_own_file_apart_from_the_application_log(self):
        import logging
        logger = logging.getLogger('watcher.access')
        self.assertFalse(logger.propagate)
        files = [getattr(handler, 'baseFilename', '') for handler in logger.handlers]
        self.assertTrue(any(name.endswith('access.log') for name in files))
        self.assertFalse(any(name.endswith('common.log') for name in files))


class GunicornConfigTest(SimpleTestCase):
    def _config(self):
        return runpy.run_path(os.path.join(settings.BASE_DIR, 'gunicorn.conf.py'))

    def test_one_worker_so_that_the_scheduled_jobs_do_not_run_twice(self):
        config = self._config()
        self.assertEqual(config['workers'], 1)
        self.assertEqual(config['worker_class'], 'gthread')
        self.assertGreater(config['threads'], 1)
        self.assertFalse(config.get('preload_app', False))

    def test_gunicorn_does_not_write_an_access_log_of_its_own(self):
        self.assertIsNone(self._config()['accesslog'])

    def test_the_urls_are_loaded_when_the_worker_starts(self):
        config = self._config()
        with patch('importlib.import_module') as import_module:
            config['post_worker_init'](None)
        import_module.assert_called_once_with(settings.ROOT_URLCONF)

    def test_the_image_starts_gunicorn(self):
        dockerfile = os.path.join(os.path.dirname(settings.BASE_DIR), 'Dockerfile')
        if not os.path.exists(dockerfile):  # inside the image, the Dockerfile is not copied
            self.skipTest('no Dockerfile next to the project')
        with open(dockerfile) as source:
            self.assertIn('CMD ["gunicorn", "watcher.wsgi:application"]', source.read())


class RequestWarningsTest(SimpleTestCase):
    def test_django_does_not_repeat_the_4xx_that_the_access_log_already_tells(self):
        import logging
        self.assertEqual(logging.getLogger('django.request').level, logging.ERROR)


# Content of the Slack, Citadel and TheHive messages
class ChatMessagesTest(TestCase):
    def test_every_slack_and_citadel_message_links_to_watcher_without_filler(self):
        for ntype in all_types():
            for channel in ('slack', 'citadel'):
                if channel not in ntype.layouts:
                    continue
                with self.subTest(type=ntype.id, channel=channel):
                    message = render_text(ntype, channel, ntype.sample())
                    self.assertIn('Open in Watcher', message)
                    self.assertNotIn('Dear team', message)
                    self.assertNotIn('find more details', message)

    def test_a_slack_message_shows_only_the_values_that_exist(self):
        ctx = dict(get_type('website_monitoring').sample(), new_ip='203.0.113.7', old_ip=None, difference_score=None,
                   new_mx_records=None, old_mx_records=None, new_ip_second=None, old_ip_second=None,
                   new_mail_A_record_ip=None, old_mail_A_record_ip=None)
        message = render_text(get_type('website_monitoring'), 'slack', ctx)
        self.assertIn('• *New IP address:* 203.0.113.7', message)
        self.assertNotIn('None', message)
        self.assertNotIn('Previous', message)

    def test_a_slack_message_is_a_list_of_bullets(self):
        message = render_text(get_type('dns_finder'), 'slack', get_type('dns_finder').sample())
        bullets = [line for line in message.split('\n') if line.startswith('• ')]
        self.assertEqual(len(bullets), 4)
        self.assertIn('• *Matches corporate domain:* example[.]com', bullets)

    def test_a_citadel_message_is_a_table_of_facts(self):
        message = render_text(get_type('data_leak'), 'citadel', get_type('data_leak').sample())
        self.assertIn('<table>', message)
        self.assertIn('<tr><td><strong>Source</strong></td><td>https://pastebin.com/abc123</td></tr>', message)
        self.assertTrue(message.endswith("<p><a href='https://watcher.example.com/#data_leak'>Open in Watcher</a></p>"))

    def test_the_link_goes_to_the_object_when_it_is_known(self):
        ctx = dict(get_type('data_leak').sample(), object_url='https://w.example/#/data_leak?alert=7')
        self.assertIn('https://w.example/#/data_leak?alert=7', render_text(get_type('data_leak'), 'slack', ctx))

    def test_the_plain_text_of_a_citadel_message_is_readable(self):
        content = citadel_content('data_leak', get_type('data_leak').sample())
        self.assertEqual(content['format'], 'org.matrix.custom.html')
        self.assertIn('<table>', content['formatted_body'])
        self.assertNotIn('<', content['body'])
        self.assertIn('Keyword: example.com', content['body'])
        self.assertIn('Source: https://pastebin.com/abc123', content['body'])
        self.assertNotIn('Incident Alert', content['body'])


class SendersTest(SimpleTestCase):
    @patch('common.utils.send_slack_messages.get_slack_config', return_value={'token': 't', 'channel': 'C1'})
    @patch('common.utils.send_slack_messages.requests.post')
    def test_slack_sends_the_text_as_it_is(self, post, _config):
        post.return_value = MagicMock(status_code=200, json=lambda: {'ok': True})
        send_slack_message('hello', 'C1', 'test')
        self.assertEqual(post.call_args.kwargs['json'], {'channel': 'C1', 'text': 'hello'})

    @patch('common.utils.send_slack_messages.get_slack_config', return_value={'token': 't', 'channel': 'C1'})
    @patch('common.utils.send_slack_messages.requests.post')
    def test_a_message_slack_refuses_is_logged_as_a_failure(self, post, _config):
        post.return_value = MagicMock(status_code=200, text='{"ok": false}',
                                      json=lambda: {'ok': False, 'error': 'channel_not_found'})
        with self.assertLogs('watcher.common', level='ERROR'):
            send_slack_message('hello', 'C1', 'test')

    @patch('common.utils.send_citadel_messages.get_citadel_config',
           return_value={'token': 't', 'room_id': '!r:c', 'url': 'http://citadel'})
    @patch('common.utils.send_citadel_messages.requests.post')
    def test_citadel_sends_the_message_without_a_time_prefix(self, post, _config):
        post.return_value = MagicMock(status_code=200)
        send_citadel_message({'body': 'plain', 'format': 'org.matrix.custom.html', 'formatted_body': '<p>html</p>'},
                             '!r:c', 'test')
        payload = post.call_args.kwargs['json']
        self.assertEqual(payload['body'], 'plain')
        self.assertEqual(payload['formatted_body'], '<p>html</p>')


class CorporateDomainTest(TestCase):
    def test_the_corporate_domain_is_written_with_brackets_on_every_channel(self):
        ntype = get_type('dns_finder')
        ctx = ntype.sample()
        for channel in ('slack', 'citadel', 'thehive'):
            with self.subTest(channel=channel):
                message = render_text(ntype, channel, ctx)
                self.assertIn('example[.]com', message)
                self.assertNotIn('example.com', message.replace('watcher.example.com', ''))

    def test_the_subdomain_takeover_message_defangs_its_domains(self):
        ntype = get_type('dns_finder_dangling')
        for channel in ('slack', 'citadel', 'thehive'):
            with self.subTest(channel=channel):
                message = render_text(ntype, channel, ntype.sample())
                self.assertIn('old[.]example[.]com', message)
                self.assertIn('bucket[.]s3[.]amazonaws[.]com', message)


class UnknownSeverityTest(TestCase):
    """A severity or a score the source does not give is left out of the rows and of the titles."""

    def _ctx(self, type_id):
        ntype = get_type(type_id)
        return ntype, dict(ntype.sample(), severity='N/A', cvss_score='N/A', **_cve_title_parts('N/A', 'N/A'))

    def test_a_cve_without_severity_shows_nothing_about_it(self):
        ntype, ctx = self._ctx('cyber_watch_new_cve')
        for channel in ('slack', 'citadel', 'thehive'):
            with self.subTest(channel=channel):
                message = render_text(ntype, channel, ctx)
                self.assertNotIn('Severity', message)
                self.assertNotIn('N/A', message)
                self.assertIn(ctx['cve_id'], message)
        self.assertEqual(render_title(ntype, ctx), f"New CVE - {ctx['cve_id']}")
        self.assertEqual(ntype.email.subject.format(**ctx), f"New CVE - {ctx['cve_id']}")

    def test_a_rule_hit_without_severity_has_a_clean_title(self):
        ntype, ctx = self._ctx('cyber_watch_cve_hit')
        self.assertNotIn('[', render_title(ntype, ctx))
        self.assertNotIn('[', ntype.email.subject.format(**ctx))

    def test_a_known_severity_and_score_stay_in_the_titles(self):
        ntype = get_type('cyber_watch_new_cve')
        ctx = dict(ntype.sample(), **_cve_title_parts('HIGH', 7.5))
        self.assertEqual(render_title(ntype, ctx), f"New CVE - {ctx['cve_id']} | Severity: HIGH | CVSS: 7.5")
        self.assertEqual(ntype.email.subject.format(**ctx), f"New CVE - {ctx['cve_id']} (HIGH)")


# Content of the e-mails
class EmailLayoutTest(SimpleTestCase):
    def test_every_sample_email_has_the_button_and_no_filler(self):
        for ntype in all_types():
            if not ntype.email:
                continue
            with self.subTest(type=ntype.id):
                body = ntype.email.sample_body(ntype.sample())
                self.assertIn('Open in Watcher', body)
                self.assertNotIn('Dear team', body)
                self.assertNotIn('Kind Regards', body)
                self.assertNotIn('Best Regards', body)
                self.assertNotIn('>None<', body)
                self.assertNotIn('N/A', body)

    def test_a_fact_without_a_value_is_left_out(self):
        table = facts_table([('Keep', 'yes'), ('A', None), ('B', ''), ('C', 'None'), ('D', 'N/A'), ('E', 'Unknown')])
        self.assertIn('Keep', table)
        for dropped in ('>A<', '>B<', '>C<', '>D<', '>E<'):
            self.assertNotIn(dropped, table)

    def test_no_fact_at_all_means_no_table(self):
        self.assertEqual(facts_table([('A', None)]), '')

    def test_values_are_escaped_and_links_are_clickable(self):
        table = facts_table([('Keyword', '<script>alert(1)</script>'), ('Source', 'https://example.com/x?a=1&b=2')])
        self.assertNotIn('<script>', table)
        self.assertIn('&lt;script&gt;', table)
        self.assertIn('<a href="https://example.com/x?a=1&amp;b=2">', table)

    def test_a_raw_value_keeps_its_markup(self):
        self.assertIn('<b>x</b>', facts_table([('A', Raw('<b>x</b>'))]))

    def test_the_button_leads_where_it_is_told(self):
        body = render_email(title='T', intro='I', link='https://w.example/#/data_leak?alert=3')
        self.assertIn('href="https://w.example/#/data_leak?alert=3"', body)
        self.assertNotIn('Open in Watcher', render_email(title='T', intro='I'))


class SiteMonitoringEmailTest(SimpleTestCase):
    def test_only_the_values_that_changed_are_shown(self):
        body = get_site_monitoring_template('bad.example', '-', {
            'type': 'IP address change detected', 'new_ip': '203.0.113.7', 'old_ip': '198.51.100.4',
            'new_ip_second': 'None', 'old_ip_second': None, 'new_MX_records': 'None'})
        self.assertIn('New IP address', body)
        self.assertIn('Previous IP address', body)
        self.assertNotIn('second', body)
        self.assertNotIn('MX records', body)
        self.assertIn('bad[.]example', body)

    def test_a_missing_key_is_not_an_error(self):
        self.assertIn('Domain', get_site_monitoring_template('bad.example', '-', {'type': 'Mail record detected'}))

    def test_mx_records_are_shown_on_one_line(self):
        body = get_site_monitoring_template('bad.example', '-', {
            'type': 'Mail record detected', 'new_MX_records': ['10 mx1.example.', '20 mx2.example.']})
        self.assertIn('10 mx1.example., 20 mx2.example.', body)

    def test_the_button_opens_the_change(self):
        body = get_site_monitoring_template('bad.example', '-', {'type': 'x'}, link_url='http://w/#/website_monitoring?tab=changes&change=4')
        self.assertIn('change=4', body)


class DataLeakEmailTest(SimpleTestCase):
    def test_what_a_page_contains_cannot_inject_markup(self):
        alert = SimpleNamespace(keyword='<img src=x onerror=alert(1)>', url='https://example.com')
        body = get_data_leak_template(alert)
        self.assertNotIn('<img src=x', body)
        self.assertIn('&lt;img src=x', body)


class DomainsInEmailsTest(SimpleTestCase):
    def test_domains_of_a_dns_email_are_written_with_brackets(self):
        from common.mail_template.dns_finder_template import get_dns_finder_template
        alert = SimpleNamespace(dns_twisted=SimpleNamespace(
            domain_name='login.evil.example', dns_monitored='corporate.example', keyword_monitored=None, fuzzer=None))
        body = get_dns_finder_template(alert)
        self.assertIn('login[.]evil[.]example', body)
        self.assertIn('corporate[.]example', body)
        self.assertNotIn('>corporate.example<', body)

    def test_domains_of_a_takeover_email_are_written_with_brackets(self):
        from common.mail_template.dns_finder_dangling_template import get_dns_finder_dangling_template
        alert = SimpleNamespace(status='confirmed', dns_twisted=SimpleNamespace(
            domain_name='old.corporate.example', dns_monitored='corporate.example', cname_target='bucket.s3.example', provider='S3'))
        body = get_dns_finder_dangling_template(alert)
        for domain in ('old[.]corporate[.]example', 'bucket[.]s3[.]example'):
            self.assertIn(domain, body)


# Logging: job summaries, notification report, health check filter
log = logging.getLogger('watcher.common')


class JobSummaryTest(SimpleTestCase):
    def test_a_job_ends_with_what_it_counted_and_how_long_it_took(self):
        @logged_job("Sample job", log)
        def job():
            job_count('domains', 3)
            job_count('updated')
            job_count('errors', 0)

        with self.assertLogs('watcher.common', level='INFO') as logs:
            job()
        line = logs.output[-1]
        self.assertIn('CRON TASK done: Sample job - domains=3, updated=1 (', line)
        self.assertNotIn('errors', line)

    def test_a_job_that_did_nothing_says_so(self):
        @logged_job("Quiet job", log)
        def job():
            return 'result'

        with self.assertLogs('watcher.common', level='INFO') as logs:
            self.assertEqual(job(), 'result')
        self.assertIn('Quiet job - nothing to report', logs.output[-1])

    def test_a_job_stopped_by_an_error_says_so_and_still_raises(self):
        @logged_job("Failing job", log)
        def job():
            job_count('domains')
            raise RuntimeError('boom')

        with self.assertLogs('watcher.common', level='INFO') as logs, self.assertRaises(RuntimeError):
            job()
        self.assertTrue(logs.output[-1].startswith('ERROR'))
        self.assertIn('stopped by an error', logs.output[-1])

    def test_counting_outside_of_a_job_does_nothing(self):
        job_count('anything')  # no error

    def test_two_jobs_do_not_share_their_counts(self):
        @logged_job("Inner", log)
        def inner():
            job_count('inner_items')

        @logged_job("Outer", log)
        def outer():
            job_count('outer_items')
            inner()

        with self.assertLogs('watcher.common', level='INFO') as logs:
            outer()
        self.assertIn('Inner - inner_items=1', logs.output[0])
        self.assertIn('Outer - outer_items=1', logs.output[1])


def _label(app_name, context_data):
    return 'sample #1'


class NotificationReportTest(SimpleTestCase):
    def _report(self, channels):
        @reported_notification(_label, log)
        def send(app_name, context_data):
            for channel, action in channels:
                run_channel(channel, action) if action else report_channel(channel, 'off')

        with self.assertLogs('watcher.common', level='INFO') as logs:
            send('app', {})
        return logs.output[-1]

    def test_one_line_tells_how_the_notification_went_on_every_channel(self):
        line = self._report([('slack', lambda: None), ('citadel', None), ('email', lambda: None)])
        self.assertTrue(line.startswith('INFO'))
        self.assertIn('Notification sample #1: slack=ok, citadel=off, email=ok', line)

    def test_a_channel_that_logs_an_error_is_reported_as_failed_and_makes_the_line_a_warning(self):
        def citadel():
            log.error('Failed to send message to Citadel: 401 - M_UNKNOWN_TOKEN')

        line = self._report([('slack', lambda: None), ('citadel', citadel)])
        self.assertTrue(line.startswith('WARNING'))
        self.assertIn('slack=ok, citadel=failed (Failed to send message to Citadel: 401', line)

    def test_a_channel_that_is_not_configured_is_not_reported_as_sent(self):
        def slack():
            log.warning('No configuration for Slack, notifications disabled.')

        self.assertIn('slack=not configured', self._report([('slack', slack)]))

    def test_a_channel_can_say_why_it_sent_nothing(self):
        def email():
            note_channel('no recipients')

        self.assertIn('email=no recipients', self._report([('email', email)]))

    def test_an_exception_in_a_channel_is_reported_and_reaches_the_caller(self):
        def thehive():
            raise ValueError('bad key')

        @reported_notification(_label, log)
        def send(app_name, context_data):
            with self.assertRaises(ValueError):
                run_channel('thehive', thehive)

        with self.assertLogs('watcher.common', level='INFO') as logs:
            send('app', {})
        self.assertIn('thehive=failed (bad key)', logs.output[-1])

    def test_the_channels_are_listed_in_a_fixed_order(self):
        line = self._report([('email', lambda: None), ('slack', lambda: None), ('thehive', lambda: None)])
        self.assertIn('slack=ok, thehive=ok, email=ok', line)

    def test_the_error_of_another_thread_is_not_blamed_on_the_channel(self):
        import threading

        def slack():
            thread = threading.Thread(target=lambda: log.error('unrelated error in another job'))
            thread.start()
            thread.join()

        self.assertIn('slack=ok', self._report([('slack', slack)]))


class RealNotificationTest(TestCase):
    @patch('common.core.send_email_notifications')
    @patch('common.core.send_slack_message')
    @patch('common.core.is_enabled', side_effect=lambda type_id, channel: channel in ('slack', 'email'))
    def test_a_data_leak_alert_is_reported_with_its_number_and_the_result_of_each_channel(self, _enabled, slack, email):
        slack.side_effect = lambda *args, **kwargs: log.error('Failed to send message to Slack: 200 - {"ok": false}')
        alert = LeakAlert.objects.create(keyword=LeakKeyword.objects.create(name='arkena'), url='https://example.com/x')

        with self.assertLogs('watcher.common', level='INFO') as logs:
            send_app_specific_notifications('data_leak', {'alert': alert}, Subscriber.objects.all())

        line = [entry for entry in logs.output if 'Notification data_leak' in entry][-1]
        self.assertIn(f'Notification data_leak #{alert.pk} (arkena): ', line)
        self.assertIn('slack=failed (Failed to send message to Slack', line)
        self.assertIn('citadel=off, thehive=off, email=no recipients', line)
        email.assert_not_called()

    def test_the_label_names_the_alert_of_each_module(self):
        from types import SimpleNamespace
        site = SimpleNamespace(domain_name='bad.example')
        self.assertEqual(_notification_label('website_monitoring', {'site': site, 'alert_data': {'id': 7}}),
                         'website_monitoring #7 (bad.example)')
        self.assertEqual(_notification_label('cyber_watch', {'notification_type': 'new_cve', 'cve_id': 'CVE-1'}),
                         'cyber_watch new_cve (CVE-1)')
        self.assertEqual(_notification_label('threats_watcher', {'notification_type': 'breakingnews'}),
                         'threats_watcher breakingnews')


class QuietLoopsTest(TestCase):
    @patch('data_leak.core.check_keywords')
    def test_the_data_leak_job_reports_once_per_run(self, check):
        from data_leak.core import main_data_leak
        with self.assertLogs('watcher.data_leak', level='INFO') as logs:
            main_data_leak()
        self.assertTrue(any('CRON TASK done: Fetch searx & pastebin' in entry for entry in logs.output))


class HealthCheckFilterTest(SimpleTestCase):
    HEALTH_LINE = '"GET / HTTP/1.1" 200 768'

    def _record(self, message, peer='127.0.0.1'):
        from types import SimpleNamespace
        record = logging.LogRecord('django.server', logging.INFO, __file__, 1, message, (), None)
        record.request = SimpleNamespace(getpeername=lambda: (peer, 40000))
        return record

    def test_the_health_check_of_the_container_is_dropped(self):
        from common.utils.log_filters import HealthCheckFilter
        for peer in ('127.0.0.1', '::1', '::ffff:127.0.0.1'):
            with self.subTest(peer=peer):
                self.assertFalse(HealthCheckFilter().filter(self._record(self.HEALTH_LINE, peer)))

    def test_the_same_request_from_elsewhere_is_kept(self):
        from common.utils.log_filters import HealthCheckFilter
        self.assertTrue(HealthCheckFilter().filter(self._record(self.HEALTH_LINE, '172.21.0.1')))

    def test_another_request_from_the_container_is_kept(self):
        from common.utils.log_filters import HealthCheckFilter
        self.assertTrue(HealthCheckFilter().filter(self._record('"GET /api/auth/user HTTP/1.1" 200 214')))
        self.assertTrue(HealthCheckFilter().filter(self._record('"POST / HTTP/1.1" 405 0')))

    def test_a_line_whose_origin_is_unknown_is_kept(self):
        from common.utils.log_filters import HealthCheckFilter
        record = logging.LogRecord('django.server', logging.INFO, __file__, 1, self.HEALTH_LINE, (), None)
        self.assertTrue(HealthCheckFilter().filter(record))

    def test_the_web_server_logger_uses_the_filter(self):
        from common.utils.log_filters import HealthCheckFilter
        logger = logging.getLogger('django.server')
        self.assertTrue(any(isinstance(f, HealthCheckFilter) for f in logger.filters))
        self.assertTrue(logger.handlers)


# Screenshots of the objects of a module
SERVICE = 'http://screenshotter:8080'
JPEG = b'\xff\xd8\xff\xe0fake-jpeg-bytes'


def _service_answer(status=200, content=JPEG, text=''):
    response = MagicMock()
    response.status_code, response.content, response.text = status, content, text
    return response


@override_settings(SCREENSHOT_SERVICE_URL=SERVICE, SCREENSHOT_KEEP=3)
class TakeTest(TestCase):
    def test_a_screenshot_is_kept_for_the_object_with_who_took_it(self):
        user = User.objects.create_user('analyst')
        with patch('common.core.requests.post', return_value=_service_answer()):
            shot = take_screenshot('data_leak.alert', 7, 'https://pastebin.example/abc', user)
        self.assertEqual((shot.target, shot.target_id, shot.url, shot.taken_by), ('data_leak.alert', 7, 'https://pastebin.example/abc', user))
        self.assertEqual(bytes(shot.image), JPEG)

    def test_only_the_newest_ones_of_an_object_are_kept(self):
        with patch('common.core.requests.post', return_value=_service_answer()):
            for _ in range(5):
                take_screenshot('data_leak.alert', 7, 'https://pastebin.example/abc')
            take_screenshot('data_leak.alert', 8, 'https://pastebin.example/other')
        self.assertEqual(Screenshot.objects.filter(target_id=7).count(), 3)
        self.assertEqual(Screenshot.objects.filter(target_id=8).count(), 1)

    def test_nothing_is_kept_when_the_service_fails(self):
        with patch('common.core.requests.post', side_effect=requests.exceptions.ConnectionError('down')):
            self.assertIsNone(take_screenshot('data_leak.alert', 7, 'https://pastebin.example/abc'))
        self.assertEqual(Screenshot.objects.count(), 0)

    def test_the_screenshots_of_an_object_that_goes_away_go_with_it(self):
        alert = LeakAlert.objects.create(keyword=LeakKeyword.objects.create(name='acme'), url='https://pastebin.example/abc')
        alert_id = alert.pk
        Screenshot.objects.create(target='data_leak.alert', target_id=alert_id, url=alert.url, image=JPEG, size=len(JPEG))
        Screenshot.objects.create(target='data_leak.alert', target_id=alert_id + 1, url=alert.url, image=JPEG, size=len(JPEG))
        alert.delete()
        self.assertEqual(list(Screenshot.objects.values_list('target_id', flat=True)), [alert_id + 1])


@override_settings(SCREENSHOT_SERVICE_URL=SERVICE)
class LeakScreenshotApiTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user('analyst', 'analyst@example.com', 'pass')
        self.client.force_authenticate(self.user)
        self.alert = LeakAlert.objects.create(keyword=LeakKeyword.objects.create(name='acme'), url='https://pastebin.example/abc')
        self.shot = Screenshot.objects.create(target='data_leak.alert', target_id=self.alert.pk, url=self.alert.url,
                                              image=JPEG, size=len(JPEG), taken_by=self.user)

    def _allow(self, *codenames):
        self.user.user_permissions.add(*Permission.objects.filter(codename__in=codenames))
        self.user = User.objects.get(pk=self.user.pk)
        self.client.force_authenticate(self.user)

    def _url(self, suffix):
        return f'/api/data_leak/alert/{self.alert.pk}/screenshots/{suffix}'

    def test_the_list_says_who_took_each_one_and_never_carries_the_images(self):
        data = self.client.get(self._url('')).json()
        self.assertTrue(data['configured'])
        self.assertEqual([(s['id'], s['taken_by'], s['url']) for s in data['results']], [(self.shot.pk, 'analyst', self.alert.url)])
        self.assertNotIn('image', data['results'][0])

    def test_the_list_does_not_read_the_images(self):
        with self.assertNumQueries(2):  # the alert, then its screenshots (with who took them)
            self.client.get(self._url(''))

    def test_the_screenshots_are_not_public(self):
        self.assertIn(APIClient().get(self._url('')).status_code, (401, 403))
        self.assertIn(APIClient().get(self._url(f'{self.shot.pk}/image/')).status_code, (401, 403))

    def test_the_image_is_served_as_a_jpeg(self):
        response = self.client.get(self._url(f'{self.shot.pk}/image/'), HTTP_ACCEPT='image/avif,image/webp,*/*')
        self.assertEqual((response.status_code, response['Content-Type'], response.content), (200, 'image/jpeg', JPEG))

    def test_the_image_of_another_object_is_not_reachable_through_this_one(self):
        other = LeakAlert.objects.create(keyword=self.alert.keyword, url='https://pastebin.example/other')
        foreign = Screenshot.objects.create(target='data_leak.alert', target_id=other.pk, url=other.url, image=b'secret', size=6)
        self.assertEqual(self.client.get(self._url(f'{foreign.pk}/image/')).status_code, 404)

    def test_taking_one_needs_the_right_to_change_alerts(self):
        self.assertEqual(self.client.post(self._url('capture/')).status_code, 403)

    def test_taking_one_keeps_it_and_logs_who_asked(self):
        self._allow('change_alert')
        with patch('common.core.requests.post', return_value=_service_answer(content=b'new')) as post, \
                self.assertLogs('watcher.common', level='INFO') as logs:
            response = self.client.post(self._url('capture/'))
        self.assertEqual(response.status_code, 201, response.content)
        self.assertEqual(post.call_args.kwargs['json'], {'url': 'https://pastebin.example/abc'})
        self.assertEqual(Screenshot.objects.filter(target_id=self.alert.pk).count(), 2)
        self.assertTrue(any('taken by analyst' in line for line in logs.output))

    @override_settings(SCREENSHOT_SERVICE_URL='')
    def test_taking_one_says_when_the_service_is_not_configured(self):
        self._allow('change_alert')
        self.assertEqual(self.client.post(self._url('capture/')).status_code, 503)
        self.assertFalse(self.client.get(self._url('')).json()['configured'])

    def test_taking_one_says_when_the_page_cannot_be_captured(self):
        self._allow('change_alert')
        with patch('common.core.requests.post', return_value=_service_answer(502, b'', 'capture failed')):
            self.assertEqual(self.client.post(self._url('capture/')).status_code, 502)

    def test_an_alert_without_an_address_has_nothing_to_capture(self):
        self._allow('change_alert')
        self.alert.url = ''
        self.alert.save()
        self.assertEqual(self.client.post(self._url('capture/')).status_code, 400)


@override_settings(SCREENSHOT_SERVICE_URL=SERVICE)
class DomainScreenshotApiTest(TestCase):
    """Legitimate domains: the list is public, the screenshots are not; a capture visits https://<domain>/."""

    def setUp(self):
        from common.models import LegitimateDomain
        self.client = APIClient()
        self.user = User.objects.create_user('analyst', 'analyst@example.com', 'pass')
        self.client.force_authenticate(self.user)
        self.domain = LegitimateDomain.objects.create(domain_name='arkena-avionics.example')
        self.shot = Screenshot.objects.create(target='common.legitimate_domain', target_id=self.domain.pk,
                                              url='https://arkena-avionics.example/', image=JPEG, size=len(JPEG))

    def _url(self, suffix):
        return f'/api/common/legitimate_domains/{self.domain.pk}/screenshots/{suffix}'

    def test_the_domains_stay_readable_by_everyone_but_their_screenshots_do_not(self):
        anonymous = APIClient()
        self.assertEqual(anonymous.get(f'/api/common/legitimate_domains/{self.domain.pk}/').status_code, 200)
        self.assertIn(anonymous.get(self._url('')).status_code, (401, 403))
        self.assertIn(anonymous.get(self._url(f'{self.shot.pk}/image/')).status_code, (401, 403))

    def test_a_signed_in_user_sees_them(self):
        self.assertEqual(len(self.client.get(self._url('')).json()['results']), 1)
        response = self.client.get(self._url(f'{self.shot.pk}/image/'))
        self.assertEqual((response.status_code, response.content), (200, JPEG))

    def test_taking_one_needs_the_right_to_change_domains(self):
        self.assertEqual(self.client.post(self._url('capture/')).status_code, 403)

    def test_taking_one_visits_the_site_of_the_domain(self):
        self.user.user_permissions.add(*Permission.objects.filter(codename='change_legitimatedomain'))
        self.client.force_authenticate(User.objects.get(pk=self.user.pk))
        with patch('common.core.requests.post', return_value=_service_answer(content=b'new')) as post:
            response = self.client.post(self._url('capture/'))
        self.assertEqual(response.status_code, 201, response.content)
        self.assertEqual(post.call_args.kwargs['json'], {'url': 'https://arkena-avionics.example/'})

    def test_the_screenshots_go_with_the_domain(self):
        domain_id = self.domain.pk
        self.domain.delete()
        self.assertFalse(Screenshot.objects.filter(target='common.legitimate_domain', target_id=domain_id).exists())


# Global search
URL = '/api/search/'


class SearchTestBase(APITestCase):
    def setUp(self):
        # Saving a TrendyWord would load the summarizer model: not needed to test the search.
        post_save.disconnect(auto_generate_trendy_word_summary, sender=TrendyWord)
        self.addCleanup(post_save.connect, auto_generate_trendy_word_summary, sender=TrendyWord)
        self.user = User.objects.create_user('search_user', 'u@test.com', 'password')
        _, self.token = AuthToken.objects.create(self.user)

    def login(self):
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {self.token}')

    def groups(self, q, **extra):
        resp = self.client.get(URL, {'q': q}, **extra)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        return {g['module']: g for g in resp.data['groups']}


class SearchQueryTest(SearchTestBase):
    def test_short_or_empty_query_returns_nothing(self):
        TrendyWord.objects.create(name='ransomware')
        for q in ('', ' ', 'r', ' r '):
            self.assertEqual(self.client.get(URL, {'q': q}).data['groups'], [])

    def test_long_query_is_cut_not_refused(self):
        resp = self.client.get(URL, {'q': 'a' * 500})
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(len(resp.data['query']), search.MAX_LENGTH)

    def test_match_is_case_insensitive_and_opens_the_object(self):
        word = TrendyWord.objects.create(name='Ransomware', occurrences=7)
        group = self.groups('RANSOM')['threats_watcher']
        self.assertEqual(group['label'], 'Threats Watcher')
        hit = group['results'][0]
        self.assertEqual(hit['id'], word.id)
        self.assertEqual(hit['title'], 'Ransomware')
        self.assertEqual(hit['to'], f'/threats_watcher?word={word.id}')

    def test_group_is_cut_at_five_and_says_there_is_more(self):
        for i in range(8):
            TrendyWord.objects.create(name=f'phish-{i}')
        group = self.groups('phish')['threats_watcher']
        self.assertEqual(len(group['results']), search.LIMIT)
        self.assertTrue(group['more'])

    def test_group_without_overflow_has_no_more(self):
        TrendyWord.objects.create(name='phish-1')
        self.assertFalse(self.groups('phish')['threats_watcher']['more'])

    def test_providers_of_a_module_share_its_five_places(self):
        for i in range(8):
            TrendyWord.objects.create(name=f'zeus-{i}')
        keyword = MonitoredKeyword.objects.create(name='zeus')
        results = self.groups('zeus')['threats_watcher']['results']
        self.assertEqual(len(results), search.LIMIT)
        self.assertIn(f'/threats_watcher?tab=keywords&keyword={keyword.id}', [r['to'] for r in results])

    def test_modules_without_a_match_are_left_out(self):
        TrendyWord.objects.create(name='phish')
        self.assertEqual(list(self.groups('phish')), ['threats_watcher'])


class SearchAccessTest(SearchTestBase):
    def setUp(self):
        super().setUp()
        self.domain = LegitimateDomain.objects.create(domain_name='acme.com', ticket_id='TCK-77')

    def test_anonymous_sees_the_public_modules_only(self):
        TrendyWord.objects.create(name='acme')
        found = self.groups('acme')
        self.assertEqual(set(found), {'threats_watcher', 'legitimate_domains'})

    def test_anonymous_does_not_search_internal_fields(self):
        self.assertNotIn('legitimate_domains', self.groups('TCK-77'))

    def test_authenticated_searches_the_ticket_too(self):
        self.login()
        hit = self.groups('TCK-77')['legitimate_domains']['results'][0]
        self.assertEqual(hit['to'], f'/legitimate_domains?domain={self.domain.id}')

    def test_permission_access_rule(self):
        self.assertFalse(search.allowed(self.user, 'auth.view_user'))
        self.user.user_permissions.add(Permission.objects.get(codename='view_user'))
        self.user = User.objects.get(pk=self.user.pk)
        self.assertTrue(search.allowed(self.user, 'auth.view_user'))

    def test_superuser_access_rule(self):
        admin = User.objects.create_superuser('search_admin', 'a@test.com', 'password')
        self.assertTrue(search.allowed(admin, 'superuser'))
        self.assertFalse(search.allowed(self.user, 'superuser'))


class SearchModulesTest(SearchTestBase):
    def setUp(self):
        super().setUp()
        self.login()

    def only(self, q, module):
        found = self.groups(q)
        self.assertIn(module, found)
        return found[module]['results']

    def test_cyber_watch_cves_and_victims(self):
        cve = CVEAlert.objects.create(cve_id='CVE-2026-1234', description='Remote code execution in Acme gateway')
        victim = RansomwareVictim.objects.create(group=RansomwareGroup.objects.create(name='lockbit'), victim_name='Acme Corp', country='FR')
        rule = WatchRule.objects.create(name='Acme watch', keywords=['acme'])
        found = {r['to'] for r in self.only('acme', 'cyber_watch')}
        self.assertEqual(found, {f'/cyber_watch?tab=cves&cve={cve.id}', f'/cyber_watch?tab=ransomware&victim={victim.id}'})
        # Rules need their own permission, like the tab.
        self.assertNotIn(f'/cyber_watch?tab=rules&rule={rule.id}', found)

    def test_watch_rules_with_the_permission(self):
        rule = WatchRule.objects.create(name='Acme watch', keywords=['acme'])
        self.user.user_permissions.add(Permission.objects.get(codename='view_watchrule'))
        self.assertIn(f'/cyber_watch?tab=rules&rule={rule.id}', [r['to'] for r in self.only('acme', 'cyber_watch')])

    def test_data_leak_alerts_and_patterns(self):
        keyword = LeakKeyword.objects.create(name='acme-secret')
        alert = LeakAlert.objects.create(keyword=keyword, url='https://paste.example/acme-secret-dump', content='x')
        found = {r['to'] for r in self.only('acme-secret', 'data_leak')}
        self.assertEqual(found, {f'/data_leak?alert={alert.id}', f'/data_leak?tab=patterns&pattern={keyword.id}'})

    def test_dns_finder_assets_and_threats(self):
        domain = DnsMonitored.objects.create(domain_name='acme.com')
        keyword = KeywordMonitored.objects.create(name='acme')
        threat = DnsAlert.objects.create(dns_twisted=DnsTwisted.objects.create(domain_name='acme-login.com', dns_monitored=domain))
        found = {r['to'] for r in self.only('acme', 'dns_finder')}
        self.assertEqual(found, {
            f'/dns_finder?tab=domains&did={domain.id}',
            f'/dns_finder?tab=keywords&kid={keyword.id}',
            f'/dns_finder?threat={threat.id}',
        })

    def test_sites_by_domain_or_ticket(self):
        site = Site.objects.create(domain_name='phish-acme.com', ticket_id='TCK-9')
        self.assertEqual([r['to'] for r in self.only('TCK-9', 'website_monitoring')], [f'/website_monitoring?site={site.id}'])
        self.assertEqual([r['id'] for r in self.only('phish-acme', 'website_monitoring')], [site.id])

    def test_connectors_for_superusers_only(self):
        self.assertNotIn('connectors', self.groups('smtp'))
        admin = User.objects.create_superuser('search_root', 'r@test.com', 'password')
        _, token = AuthToken.objects.create(admin)
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token}')
        results = self.only('smtp', 'connectors')
        self.assertTrue(all(r['to'] == '/connectors' for r in results))
        self.assertTrue(any(r['id'] == 'smtp' for r in results))

    def test_a_user_sees_no_group_without_a_match(self):
        self.assertEqual(self.groups('nothing-matches-this'), {})


class SearchIsolationTest(SearchTestBase):
    def test_a_failing_provider_does_not_break_the_others(self):
        TrendyWord.objects.create(name='boom')

        def broken(q, limit, user):
            raise RuntimeError('database gone')

        failing = search.Provider('connectors', 'Connectors', 'connector', 'public', broken)
        original = search.PROVIDERS
        search.PROVIDERS = [*original, failing]
        try:
            found = self.groups('boom')
        finally:
            search.PROVIDERS = original
        self.assertEqual(len(found['threats_watcher']['results']), 1)
        self.assertTrue(found['connectors']['error'])
        self.assertEqual(found['connectors']['results'], [])
        self.assertFalse(found['threats_watcher']['error'])


# Content of the TheHive alerts
BASE_TAGS = ['Watcher', 'Impersonation', 'Malicious Domain', 'Typosquatting']


def _twisted(**kwargs):
    values = dict(domain_name='login.arkena-avionics.xyz', fuzzer='homoglyph', provider=None, cname_target=None,
                  keyword_monitored=SimpleNamespace(name='arkena'),
                  dns_monitored=SimpleNamespace(domain_name='arkena-avionics.com'))
    values.update(kwargs)
    return SimpleNamespace(**values)


class OptionalLinesTest(SimpleTestCase):
    """A line of a message is left out when it has nothing to show."""

    def _site_message(self, **values):
        ntype = get_type('website_monitoring')
        ctx = {'alert_type': 'Mail record detected', 'domain_name_sanitized': 'example[.]com',
               'details_url': 'https://w.example/#/x'}
        ctx.update(values)
        return render_text(ntype, 'thehive', ctx)

    def test_no_none_lines_when_nothing_changed(self):
        message = self._site_message(new_mx_records=None, old_mx_records=None, new_ip=None, difference_score=None)
        self.assertNotIn('None', message)
        self.assertNotIn('MX', message)

    def test_a_value_that_exists_is_shown(self):
        message = self._site_message(new_mx_records='10 mx.example.com.', old_mx_records=None)
        self.assertIn('| **New MX records** | 10 mx.example.com. |', message)
        self.assertNotIn('Previous MX records', message)

    def test_what_the_modules_write_for_nothing_counts_as_nothing(self):
        for empty in ('N/A', 'None', 'unknown', '', '  '):
            with self.subTest(empty=empty):
                self.assertNotIn('Detection method', render_text(get_type('dns_finder'), 'thehive', {
                    'subdomain_sanitized': 'a[.]b', 'parent_domain_sanitized': 'b[.]c', 'keyword': None,
                    'corporate_dns': None, 'fuzzer': empty, 'details_url': 'u'}))

    def test_the_way_back_to_watcher_ends_every_description(self):
        self.assertTrue(self._site_message().rstrip().endswith('[Open in Watcher](https://w.example/#/x)'))


class AlertTagsTest(SimpleTestCase):
    def test_domain_tags_stay_on_alerts_about_a_domain(self):
        alert = SimpleNamespace(dns_twisted=_twisted())
        tags = thehive_alert_tags('dns_finder', {'alert': alert}, BASE_TAGS)
        for tag in ('Watcher', 'Impersonation', 'Malicious Domain', 'Typosquatting', 'module:dns_finder'):
            self.assertIn(tag, tags)
        self.assertIn('fuzzer:homoglyph', tags)
        self.assertIn('keyword:arkena', tags)
        self.assertIn('corporate_domain:arkena-avionics.com', tags)

    def test_other_alerts_do_not_claim_to_be_about_a_domain(self):
        tags = thehive_alert_tags('cyber_watch', {'notification_type': 'new_victim', 'group_name': 'qilin',
                                                  'sector': 'Manufacturing', 'country': 'N/A'}, BASE_TAGS)
        self.assertEqual(tags, ['Watcher', 'module:cyber_watch', 'group:qilin', 'sector:Manufacturing'])

    def test_a_tag_the_admin_added_is_kept_everywhere(self):
        self.assertIn('TLP:AMBER', thehive_alert_tags('data_leak', {}, BASE_TAGS + ['TLP:AMBER']))

    def test_the_takeover_alert_is_a_dns_finder_alert(self):
        tags = thehive_alert_tags('dns_finder_dangling', {'alert': SimpleNamespace(dns_twisted=_twisted(provider='Amazon S3'))}, BASE_TAGS)
        self.assertIn('module:dns_finder', tags)
        self.assertIn('provider:Amazon S3', tags)

    def test_no_tag_twice(self):
        tags = thehive_alert_tags('cyber_watch', {'severity': 'HIGH', 'keyword': 'x', 'rule_name': 'r'}, ['Watcher', 'Watcher'])
        self.assertEqual(len(tags), len(set(tags)))


class ObservablesTest(SimpleTestCase):
    def test_a_ransomware_victim_is_context_not_an_indicator(self):
        observables = collect_observables('cyber_watch', {
            'notification_type': 'victim_hit', 'victim_name': 'Acme', 'group_name': 'qilin', 'sector': 'Manufacturing',
            'country': 'FR', 'keyword': 'aerospace'})
        self.assertEqual([o['data'] for o in observables], ['Acme'])
        self.assertFalse(observables[0]['ioc'])
        self.assertIn('qilin', observables[0]['message'])

    def test_a_suspicious_domain_is_an_indicator_and_says_why(self):
        observables = collect_observables('dns_finder', {'alert': SimpleNamespace(dns_twisted=_twisted())})
        domain = observables[0]
        self.assertEqual(domain['data'], 'login.arkena-avionics.xyz')
        self.assertTrue(domain['ioc'])
        for part in ("'arkena'", 'arkena-avionics.com', 'homoglyph'):
            self.assertIn(part, domain['message'])
        self.assertFalse(observables[1]['ioc'])  # its parent domain only locates it

    def test_a_page_found_by_a_keyword_is_to_be_reviewed(self):
        alert = SimpleNamespace(url='https://github.com/x/y', keyword=SimpleNamespace(name='arkena'))
        observable = collect_observables('data_leak', {'alert': alert})[0]
        self.assertFalse(observable['ioc'])
        self.assertIn("'arkena'", observable['message'])

    def test_new_addresses_are_indicators_old_ones_are_not(self):
        site = SimpleNamespace(domain_name='bad.example', legitimacy=5, get_legitimacy_display=lambda: 'Malicious (registered)')
        observables = collect_observables('website_monitoring', {
            'site': site, 'alert_data': {'type': 'IP address change detected', 'new_ip': '203.0.113.9', 'old_ip': '198.51.100.1'}})
        by_data = {o['data']: o for o in observables}
        self.assertTrue(by_data['bad.example']['ioc'])
        self.assertTrue(by_data['203.0.113.9']['ioc'])
        self.assertFalse(by_data['198.51.100.1']['ioc'])
        self.assertIn('Previous IP address', by_data['198.51.100.1']['message'])

    def test_mx_records_are_shown_on_one_line(self):
        site = SimpleNamespace(domain_name='bad.example', legitimacy=None, get_legitimacy_display=lambda: '')
        observables = collect_observables('website_monitoring', {
            'site': site, 'alert_data': {'type': 'Mail record detected', 'new_MX_records': ['10 mx1.', '20 mx2.']}})
        self.assertIn('10 mx1., 20 mx2.', [o['data'] for o in observables])

    def test_what_watcher_sends_to_thehive(self):
        sent = create_observables([
            {'dataType': 'domain', 'data': 'bad.example', 'message': 'Suspicious domain', 'ioc': True, 'tags': ['a:b']},
            {'dataType': 'other', 'data': 'Acme', 'message': 'Ransomware victim', 'tags': []},
        ], tlp=2, pap=2)
        self.assertEqual([o['ioc'] for o in sent], [True, False])
        self.assertEqual({o['sighted'] for o in sent}, {False})
        self.assertEqual({o['tlp'] for o in sent}, {2})
        self.assertEqual(sent[0]['message'], 'Suspicious domain')
        self.assertEqual(sent[0]['tags'], ['a:b'])


class CommentAndSeverityTest(SimpleTestCase):
    def _site(self, legitimacy=None):
        return SimpleNamespace(domain_name='bad.example', legitimacy=legitimacy)

    def test_the_comment_says_what_changed(self):
        comment = thehive_comment('website_monitoring', {
            'site': self._site(), 'alert_data': {'type': 'IP address change detected', 'old_ip': '1.1.1.1',
                                                  'new_ip': '2.2.2.2', 'difference_score': 12}})
        self.assertIn('IP address change detected', comment)
        self.assertIn('bad[.]example', comment)
        self.assertIn('- IP address: 1.1.1.1 -> 2.2.2.2', comment)
        self.assertIn('Content difference score: 12', comment)
        self.assertNotIn('processed by', comment)

    def test_only_the_changed_things_are_listed(self):
        comment = thehive_comment('website_monitoring', {'site': self._site(), 'alert_data': {'type': 'Mail record detected'}})
        self.assertEqual(comment.count('\n'), 0)

    def test_a_value_that_appears_or_disappears_is_said_so(self):
        comment = thehive_comment('website_monitoring', {
            'site': self._site(), 'alert_data': {'type': 'Mail record detected', 'new_MX_records': ['10 mx.example.'],
                                                  'old_mail_A_record_ip': '1.2.3.4'}})
        self.assertIn('- MX records: 10 mx.example. (new)', comment)
        self.assertIn('- Mail server address: 1.2.3.4 (no longer there)', comment)
        self.assertNotIn(' -> ', comment)

    def test_the_word_none_that_missing_values_are_filled_with_is_not_a_change(self):
        comment = thehive_comment('website_monitoring', {
            'site': self._site(), 'alert_data': {
                'type': 'IP address change detected', 'old_ip': '1.1.1.1', 'new_ip': '2.2.2.2',
                'old_ip_second': 'None', 'new_ip_second': 'None', 'new_MX_records': 'None', 'old_MX_records': 'None',
                'new_mail_A_record_ip': 'None', 'old_mail_A_record_ip': 'None', 'difference_score': 'None'}})
        self.assertNotIn('None', comment)
        self.assertEqual(comment.count('\n'), 1)

    def test_the_other_modules_have_no_follow_up_comment(self):
        self.assertIsNone(thehive_comment('data_leak', {}))

    def test_severity_follows_the_cve(self):
        self.assertEqual(thehive_severity_for('cyber_watch', {'severity': 'CRITICAL'}, 1), 4)
        self.assertEqual(thehive_severity_for('cyber_watch', {'severity': 'LOW'}, 2), 2)
        self.assertEqual(thehive_severity_for('cyber_watch', {'severity': 'N/A'}, 1), 1)

    def test_severity_follows_the_legitimacy_of_the_site(self):
        self.assertEqual(thehive_severity_for('website_monitoring', {'site': self._site(6)}, 1), 3)
        self.assertEqual(thehive_severity_for('website_monitoring', {'site': self._site(3)}, 1), 2)
        self.assertEqual(thehive_severity_for('website_monitoring', {'site': self._site(1)}, 1), 1)
        self.assertEqual(thehive_severity_for('data_leak', {}, 1), 1)


class NewAlertTest(TestCase):
    @patch('common.utils.update_thehive.requests.post')
    def test_a_new_alert_links_back_to_watcher_and_adds_no_boilerplate_comment(self, post):
        response = MagicMock()
        response.json.return_value = {'_id': '~1'}
        post.return_value = response

        create_new_alert('REF-1', 'title', 'description', 2, 2, 2, ['Watcher'], 'data_leak', [], None, None,
                         'http://thehive', 'key', external_link='https://w.example/#data_leak')

        self.assertEqual(post.call_count, 1)
        body = post.call_args.kwargs['json']
        self.assertEqual(body['externalLink'], 'https://w.example/#data_leak')
        self.assertEqual(body['sourceRef'], 'REF-1')


@override_settings(WATCHER_URL='http://localhost:9002/')
class ObjectLinkTest(SimpleTestCase):
    """A message links to the object itself: the page opens on it."""

    def test_a_data_leak_opens_its_alert(self):
        url = watcher_object_url('data_leak', {'alert': SimpleNamespace(pk=7)})
        self.assertEqual(url, 'http://localhost:9002/#/data_leak?alert=7')

    def test_a_suspicious_domain_opens_its_threat(self):
        url = watcher_object_url('dns_finder', {'alert': SimpleNamespace(pk=12)})
        self.assertEqual(url, 'http://localhost:9002/#/dns_finder?tab=threats&threat=12')
        self.assertEqual(watcher_object_url('dns_finder_dangling', {'alert': SimpleNamespace(pk=12)}), url)

    def test_a_site_change_opens_the_change_or_else_the_site(self):
        site = SimpleNamespace(pk=3)
        self.assertEqual(watcher_object_url('website_monitoring', {'site': site, 'alert_data': {'id': 21}}),
                         'http://localhost:9002/#/website_monitoring?tab=changes&change=21')
        self.assertEqual(watcher_object_url('website_monitoring', {'site': site, 'alert_data': {}}),
                         'http://localhost:9002/#/website_monitoring?site=3')

    @patch('cyber_watch.models.CVEAlert.objects')
    def test_a_cve_opens_its_row(self, cves):
        cves.filter.return_value.first.return_value = SimpleNamespace(pk=40)
        url = watcher_object_url('cyber_watch', {'notification_type': 'cve_hit', 'cve_id': 'CVE-2026-1'})
        self.assertEqual(url, 'http://localhost:9002/#/cyber_watch?tab=cves&cve=40')

    @patch('cyber_watch.models.RansomwareVictim.objects')
    def test_a_victim_opens_its_row(self, victims):
        victims.filter.return_value.first.return_value = SimpleNamespace(pk=9)
        url = watcher_object_url('cyber_watch', {'notification_type': 'new_victim', 'victim_name': 'Acme', 'group_name': 'qilin'})
        self.assertEqual(url, 'http://localhost:9002/#/cyber_watch?tab=ransomware&victim=9')

    @patch('cyber_watch.models.CVEAlert.objects')
    def test_nothing_found_means_no_link(self, cves):
        cves.filter.return_value.first.return_value = None
        self.assertIsNone(watcher_object_url('cyber_watch', {'notification_type': 'new_cve', 'cve_id': 'CVE-0'}))
        self.assertIsNone(watcher_object_url('threats_watcher', {}))

    def test_the_description_ends_with_the_link_and_falls_back_to_the_module_page(self):
        ntype = get_type('data_leak')
        base = {'keyword_name': 'k', 'url': 'u', 'alert_pk': 1, 'details_url': 'http://w/#data_leak'}
        self.assertTrue(render_text(ntype, 'thehive', dict(base, object_url='http://w/#/data_leak?alert=1'))
                        .rstrip().endswith('[Open in Watcher](http://w/#/data_leak?alert=1)'))
        self.assertTrue(render_text(ntype, 'thehive', base).rstrip().endswith('[Open in Watcher](http://w/#data_leak)'))
