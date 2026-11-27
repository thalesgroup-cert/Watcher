import os
import requests as requests_module
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

CLUSTER_SUMMARY_HTML = (
    "<div style='border-left: 3px solid #64748b; padding-left: 0.8em;'>"
    "<div class='d-flex'><strong class='text-info'>Executive Summary</strong>"
    "<span id='watcher-toggle-all'>Collapse All</span></div>"
    "<p class='mt-1'>Surge of threats this week.</p></div>"
    "<details open class='watcher-cluster' style='border-left: 3px solid #ef4444; padding-left: 0.8em;'>"
    "<summary><div><span class='material-icons'>arrow_drop_down</span>"
    "<strong class='m-0'>Atlassian Vulnerabilities</strong></div>"
    "<div><span class='text-muted fst-italic'>Oct 06, 2026</span>"
    "<span class='badge' style='color: #ef4444'>Critical</span></div></summary>"
    "<p class='mb-3'>Atlassian disclosed multiple flaws.</p>"
    "<div class='d-flex'>"
    "<div class='m-0'><strong class='text-muted'>Threats:</strong> <span class='badge'>APT1</span></div>"
    "<div class='m-0'><strong class='text-muted'>CVEs:</strong> "
    "<a href='https://nvd.nist.gov/vuln/detail/CVE-2023-1111'>CVE-2023-1111</a> | "
    "<a href='https://nvd.nist.gov/vuln/detail/CVE-2023-2222'>CVE-2023-2222</a></div>"
    "</div></details>"
)

BREAKING_NEWS_HTML = (
    "<p class='mb-3'>A DDoS attack disrupted Ubuntu.</p>"
    "<div class='mt-3 p-3'><h6 class='text-uppercase'>Threat Context</h6><div class='d-flex'>"
    "<div><strong class='text-muted'>Impact Level:</strong> <span class='badge bg-danger'>High</span></div>"
    "<div><strong class='text-muted'>CVEs:</strong> "
    "<a href='https://nvd.nist.gov/vuln/detail/CVE-2026-1' class='fw-bold'>CVE-2026-1</a> | "
    "<a href='https://nvd.nist.gov/vuln/detail/CVE-2026-2'>CVE-2026-2</a></div>"
    "</div></div>"
)

class HtmlToCitadelHtmlTest(TestCase):
    """Test the conversion of the web summary HTML to the Matrix/Citadel HTML subset."""

    def setUp(self):
        from common.core import html_to_citadel_html
        self.convert = html_to_citadel_html

    def test_executive_summary_is_converted(self):
        out = self.convert(CLUSTER_SUMMARY_HTML)
        self.assertIn('<font data-mx-color="#64748b"><strong>EXECUTIVE SUMMARY</strong></font>', out)
        self.assertIn('Surge of threats this week.', out)

    def test_cluster_uses_severity_color_from_border(self):
        out = self.convert(CLUSTER_SUMMARY_HTML)
        self.assertIn('<font data-mx-color="#ef4444"><strong>▌ Atlassian Vulnerabilities</strong></font>', out)
        self.assertIn('(Oct 06, 2026 · Critical)', out)

    def test_web_artifacts_are_removed(self):
        out = self.convert(CLUSTER_SUMMARY_HTML)
        for artifact in ('Collapse All', 'arrow_drop_down', 'class=', 'style=', '<details', '<summary', '<span'):
            self.assertNotIn(artifact, out)

    def test_cluster_cves_are_plain_text_without_links(self):
        out = self.convert(CLUSTER_SUMMARY_HTML)
        self.assertNotIn('<a ', out)
        self.assertNotIn('nvd.nist.gov', out)
        self.assertIn('<strong>CVEs:</strong> CVE-2023-1111, CVE-2023-2222', out)

    def test_cluster_threats_are_kept(self):
        out = self.convert(CLUSTER_SUMMARY_HTML)
        self.assertIn('<strong>Threats:</strong> APT1', out)

    def test_blank_line_between_description_and_related_items(self):
        out = self.convert(CLUSTER_SUMMARY_HTML)
        self.assertIn('Atlassian disclosed multiple flaws.<br><br><strong>Threats:</strong> APT1', out)

    def test_duplicate_cves_are_listed_once(self):
        html = CLUSTER_SUMMARY_HTML.replace('CVE-2023-2222', 'CVE-2023-1111')
        out = self.convert(html)
        self.assertEqual(out.count('CVE-2023-1111'), 1)

    def test_cluster_without_title_is_skipped(self):
        html = (
            "<details style='border-left: 3px solid #ef4444;'><summary></summary>"
            "<p>No title here</p></details>"
        )
        out = self.convert(html)
        self.assertNotIn('data-mx-color="#ef4444"', out)

    def test_breaking_news_impact_is_colored(self):
        out = self.convert(BREAKING_NEWS_HTML)
        self.assertIn('<font data-mx-color="#eab308"><strong>High</strong></font>', out)

    def test_breaking_news_impact_colors_follow_the_severity(self):
        for level, color in (('Critical', '#ef4444'), ('Actively exploited', '#ef4444'),
                             ('High', '#eab308'), ('Medium', '#38bdf8')):
            out = self.convert(f"<div><span class='badge'>{level}</span></div>")
            self.assertIn(f'<font data-mx-color="{color}"><strong>{level}</strong></font>', out)

    def test_unknown_impact_level_stays_plain_text(self):
        out = self.convert("<div><span class='badge'>Weird</span></div>")
        self.assertNotIn('data-mx-color', out)
        self.assertIn('Weird', out)

    def test_breaking_news_cves_have_no_links(self):
        out = self.convert(BREAKING_NEWS_HTML)
        self.assertNotIn('<a ', out)
        self.assertNotIn('nvd.nist.gov', out)
        self.assertIn('CVE-2026-1, CVE-2026-2', out)
        self.assertNotIn('|', out)

    def test_breaking_news_keeps_basic_structure(self):
        out = self.convert(BREAKING_NEWS_HTML)
        self.assertIn('A DDoS attack disrupted Ubuntu.', out)
        self.assertIn('<strong>Threat Context</strong>', out)
        self.assertIn('<strong>Impact Level:</strong>', out)
        self.assertNotIn('class=', out)

    def test_output_has_no_newline(self):
        # The caller replaces '\n' by '<br>', so the converter must not emit any
        self.assertNotIn('\n', self.convert(CLUSTER_SUMMARY_HTML.replace('><', '>\n<')))
        self.assertNotIn('\n', self.convert(BREAKING_NEWS_HTML.replace('><', '>\n<')))


class HtmlToSlackAttachmentsTest(TestCase):
    """Test the Slack Block Kit attachments built from the web summary HTML."""

    def setUp(self):
        from common.core import html_to_slack_attachments
        self.convert = html_to_slack_attachments

    def test_executive_summary_and_cluster_colors(self):
        attachments = self.convert(CLUSTER_SUMMARY_HTML)
        self.assertEqual([a['color'] for a in attachments], ['#64748b', '#ef4444'])

    def test_executive_summary_block(self):
        executive = self.convert(CLUSTER_SUMMARY_HTML)[0]
        self.assertEqual(executive['blocks'][0]['text']['text'], 'Executive Summary')
        self.assertEqual(executive['blocks'][1]['text']['text'], 'Surge of threats this week.')

    def test_cluster_block_has_title_description_and_cves(self):
        cluster = self.convert(CLUSTER_SUMMARY_HTML)[1]
        self.assertEqual(cluster['blocks'][0]['text']['text'], 'Atlassian Vulnerabilities')
        text = cluster['blocks'][1]['text']['text']
        self.assertIn('Atlassian disclosed multiple flaws.', text)
        self.assertIn('*CVEs :*', text)
        self.assertIn('CVE-2023-1111', text)

    def test_plain_html_falls_back_to_single_attachment(self):
        attachments = self.convert(BREAKING_NEWS_HTML)
        self.assertEqual(len(attachments), 1)
        self.assertEqual(attachments[0]['color'], '#ef4444')
        text = attachments[0]['blocks'][0]['text']['text']
        self.assertNotIn('<', text)
        self.assertIn('*Threat Context*', text)

    def test_fallback_text_is_truncated_for_slack(self):
        attachments = self.convert("<p>" + "x" * 5000 + "</p>")
        self.assertLessEqual(len(attachments[0]['blocks'][0]['text']['text']), 2900)


class CleanHtmlForEmailTest(TestCase):
    """Test the removal of the interactive web elements before sending a summary by email."""

    def setUp(self):
        from common.core import clean_html_for_email
        self.clean = clean_html_for_email

    def test_collapse_button_is_removed(self):
        self.assertNotIn('Collapse All', self.clean(CLUSTER_SUMMARY_HTML))

    def test_details_and_summary_are_replaced(self):
        out = self.clean(CLUSTER_SUMMARY_HTML)
        for tag in ('<details', '</details>', '<summary', '</summary>'):
            self.assertNotIn(tag, out)

    def test_cluster_title_date_and_badge_are_rebuilt(self):
        out = self.clean(CLUSTER_SUMMARY_HTML)
        self.assertIn('Atlassian Vulnerabilities', out)
        self.assertIn('Oct 06, 2026', out)
        self.assertIn('Critical', out)
        self.assertIn('border: 1px solid #ef4444', out)

    def test_material_icon_is_removed(self):
        self.assertNotIn('arrow_drop_down', self.clean(CLUSTER_SUMMARY_HTML))

    def test_summary_without_title_is_dropped(self):
        out = self.clean("<details><summary><span>no title</span></summary><p>Body</p></details>")
        self.assertNotIn('no title', out)
        self.assertIn('Body', out)

    def test_empty_paragraphs_and_divs_are_removed(self):
        out = self.clean("<p>   </p><div></div><p>Kept</p>")
        self.assertEqual(out, "<p>Kept</p>")

    def test_consecutive_line_breaks_are_collapsed(self):
        self.assertEqual(self.clean("a<br><br><br>b"), "a<br>b")


class SendCitadelMessageTest(TestCase):
    """Test the Citadel notification sender (timeout and error handling)."""

    CONFIG = {'url': 'https://citadel.example', 'token': 'tok', 'room_id': '!room:citadel.example'}
    CONTENT = {
        'msgtype': 'm.text',
        'format': 'org.matrix.custom.html',
        'body': 'Alert',
        'formatted_body': '<b>Alert</b>',
    }

    def _send(self, content=None):
        from common.utils.send_citadel_messages import send_citadel_message
        return send_citadel_message(content or self.CONTENT, '!room:citadel.example', 'threats_watcher')

    @patch('common.utils.send_citadel_messages.requests.post')
    @patch('common.utils.send_citadel_messages.get_citadel_config', return_value=CONFIG)
    def test_posts_to_the_matrix_send_endpoint(self, _config, mock_post):
        mock_post.return_value = MagicMock(status_code=200)
        self._send()
        args, kwargs = mock_post.call_args
        self.assertEqual(
            args[0],
            'https://citadel.example/_matrix/client/r0/rooms/!room:citadel.example/send/m.room.message'
        )
        self.assertEqual(kwargs['headers']['Authorization'], 'Bearer tok')

    @patch('common.utils.send_citadel_messages.requests.post')
    @patch('common.utils.send_citadel_messages.get_citadel_config', return_value=CONFIG)
    def test_post_has_a_timeout(self, _config, mock_post):
        mock_post.return_value = MagicMock(status_code=200)
        self._send()
        self.assertIsNotNone(mock_post.call_args.kwargs.get('timeout'))

    @patch('common.utils.send_citadel_messages.requests.post')
    @patch('common.utils.send_citadel_messages.get_citadel_config', return_value=CONFIG)
    def test_payload_is_sent_as_it_is_without_a_timestamp(self, _config, mock_post):
        mock_post.return_value = MagicMock(status_code=200)
        self._send()
        payload = mock_post.call_args.kwargs['json']
        self.assertEqual(payload['msgtype'], 'm.text')
        self.assertEqual(payload['format'], 'org.matrix.custom.html')
        # The room shows the time of every message: the text is not prefixed with one
        self.assertEqual(payload['body'], 'Alert')
        self.assertEqual(payload['formatted_body'], '<b>Alert</b>')

    @patch('common.utils.send_citadel_messages.requests.post')
    @patch('common.utils.send_citadel_messages.get_citadel_config', return_value=CONFIG)
    def test_formatted_body_is_none_when_absent(self, _config, mock_post):
        mock_post.return_value = MagicMock(status_code=200)
        self._send({'body': 'Plain'})
        self.assertIsNone(mock_post.call_args.kwargs['json']['formatted_body'])

    @patch('common.utils.send_citadel_messages.time.sleep')
    @patch('common.utils.send_citadel_messages.requests.post')
    @patch('common.utils.send_citadel_messages.get_citadel_config', return_value=CONFIG)
    def test_a_message_refused_with_too_many_requests_is_sent_again_after_the_wait_the_server_asks(self, _config, mock_post, sleep):
        slow = MagicMock(status_code=429, text='{"errcode":"M_LIMIT_EXCEEDED"}')
        slow.json.return_value = {'errcode': 'M_LIMIT_EXCEEDED', 'retry_after_ms': 1500}
        mock_post.side_effect = [slow, MagicMock(status_code=200)]
        self.assertEqual(self._send(), (True, ''))
        self.assertEqual(mock_post.call_count, 2)
        self.assertIn(1.5, [c.args[0] for c in sleep.call_args_list])

    @patch('common.utils.send_citadel_messages.time.sleep')
    @patch('common.utils.send_citadel_messages.requests.post')
    @patch('common.utils.send_citadel_messages.get_citadel_config', return_value=CONFIG)
    def test_a_message_still_refused_after_the_attempts_is_reported_as_failed(self, _config, mock_post, _sleep):
        from common.utils.send_citadel_messages import MAX_ATTEMPTS
        slow = MagicMock(status_code=429, text='Too Many Requests')
        slow.json.return_value = {'retry_after_ms': 100}
        mock_post.return_value = slow
        with self.assertLogs('watcher.common', level='ERROR') as logs:
            sent, reason = self._send()
        self.assertEqual((sent, reason), (False, '429'))
        self.assertEqual(mock_post.call_count, MAX_ATTEMPTS)
        self.assertIn('429', logs.output[0])

    @patch('common.utils.send_citadel_messages.time.sleep')
    @patch('common.utils.send_citadel_messages.requests.post')
    @patch('common.utils.send_citadel_messages.get_citadel_config', return_value=CONFIG)
    def test_the_wait_asked_by_the_server_is_never_longer_than_the_limit(self, _config, mock_post, sleep):
        from common.utils.send_citadel_messages import MAX_WAIT
        slow = MagicMock(status_code=429, text='x')
        slow.json.return_value = {'retry_after_ms': 10 * 60 * 1000}
        mock_post.side_effect = [slow, MagicMock(status_code=200)]
        self._send()
        self.assertLessEqual(max(c.args[0] for c in sleep.call_args_list), MAX_WAIT)

    @patch('common.utils.send_citadel_messages.requests.post')
    @patch('common.utils.send_citadel_messages.get_citadel_config', return_value=CONFIG)
    def test_network_error_is_logged_not_raised(self, _config, mock_post):
        import requests
        mock_post.side_effect = requests.exceptions.ReadTimeout('timed out')
        with self.assertLogs('watcher.common', level='ERROR') as logs:
            self._send()
        self.assertIn('ReadTimeout', logs.output[0])

    @patch('common.utils.send_citadel_messages.requests.post')
    @patch('common.utils.send_citadel_messages.get_citadel_config', return_value=CONFIG)
    def test_http_error_status_is_logged(self, _config, mock_post):
        mock_post.return_value = MagicMock(status_code=401, text='M_UNKNOWN_TOKEN')
        with self.assertLogs('watcher.common', level='ERROR') as logs:
            self._send()
        self.assertIn('401', logs.output[0])

    @patch('common.utils.send_citadel_messages.requests.post')
    @patch('common.utils.send_citadel_messages.get_citadel_config', return_value=CONFIG)
    def test_success_is_logged(self, _config, mock_post):
        mock_post.return_value = MagicMock(status_code=200)
        with self.assertLogs('watcher.common', level='INFO') as logs:
            self._send()
        self.assertIn('Message sent to Citadel successfully', logs.output[0])

    @patch('common.utils.send_citadel_messages.requests.post')
    @patch('common.utils.send_citadel_messages.get_citadel_config',
           return_value={'url': 'https://citadel.example', 'token': '', 'room_id': ''})
    def test_missing_configuration_sends_nothing(self, _config, mock_post):
        with self.assertLogs('watcher.common', level='WARNING'):
            self._send()
        mock_post.assert_not_called()


class SendSlackMessageTest(TestCase):
    """Test the Slack notification sender, including the optional attachments."""

    CONFIG = {'token': 'xoxb-test', 'channel': '#alerts'}

    def _send(self, **kwargs):
        from common.utils.send_slack_messages import send_slack_message
        return send_slack_message('Hello', '#alerts', 'threats_watcher', **kwargs)

    @patch('common.utils.send_slack_messages.requests.post')
    @patch('common.utils.send_slack_messages.get_slack_config', return_value=CONFIG)
    def test_payload_without_attachments(self, _config, mock_post):
        mock_post.return_value = MagicMock(status_code=200)
        self._send()
        payload = mock_post.call_args.kwargs['json']
        self.assertEqual(payload['channel'], '#alerts')
        self.assertTrue(payload['text'].endswith('Hello'))
        self.assertNotIn('attachments', payload)

    @patch('common.utils.send_slack_messages.requests.post')
    @patch('common.utils.send_slack_messages.get_slack_config', return_value=CONFIG)
    def test_attachments_are_added_to_the_payload(self, _config, mock_post):
        mock_post.return_value = MagicMock(status_code=200)
        attachments = [{'color': '#ef4444', 'blocks': []}]
        self._send(attachments=attachments)
        self.assertEqual(mock_post.call_args.kwargs['json']['attachments'], attachments)

    @patch('common.utils.send_slack_messages.requests.post')
    @patch('common.utils.send_slack_messages.get_slack_config', return_value=CONFIG)
    def test_empty_attachments_are_not_sent(self, _config, mock_post):
        mock_post.return_value = MagicMock(status_code=200)
        self._send(attachments=[])
        self.assertNotIn('attachments', mock_post.call_args.kwargs['json'])

    @patch('common.utils.send_slack_messages.requests.post')
    @patch('common.utils.send_slack_messages.get_slack_config', return_value={'token': '', 'channel': ''})
    def test_missing_configuration_sends_nothing(self, _config, mock_post):
        with self.assertLogs('watcher.common', level='WARNING'):
            self._send()
        mock_post.assert_not_called()


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
                            comments='internal note', expiry_source='RDAP', expiry_check='ok',
                            expiry_checked_at=timezone.now())
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
                    self.assertIn(' in Watcher', message)
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
        self.assertEqual(len(bullets), 5)
        self.assertIn('• *Matches corporate domain:* example[.]com', bullets)

    def test_a_citadel_message_is_a_headline_and_a_line_per_fact(self):
        message = render_text(get_type('data_leak'), 'citadel', get_type('data_leak').sample())
        self.assertTrue(message.startswith('<h4>🔔 Data leak detected: example.com</h4><p><em>Data Leak · alert #42 · '))
        self.assertNotIn('<table>', message)
        self.assertIn('<strong>Source</strong>: https://pastebin.com/abc123<br>', message)
        self.assertTrue(message.endswith("<p><a href='https://watcher.example.com/#data_leak'>Open the leak alert in Watcher</a></p>"))

    def test_the_link_goes_to_the_object_when_it_is_known(self):
        ctx = dict(get_type('data_leak').sample(), object_url='https://w.example/#/data_leak?alert=7')
        self.assertIn('https://w.example/#/data_leak?alert=7', render_text(get_type('data_leak'), 'slack', ctx))

    def test_the_plain_text_of_a_citadel_message_is_readable(self):
        content = citadel_content('data_leak', get_type('data_leak').sample())
        self.assertEqual(content['format'], 'org.matrix.custom.html')
        self.assertNotIn('<table>', content['formatted_body'])
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
        from common.access_log import HealthCheckFilter
        for peer in ('127.0.0.1', '::1', '::ffff:127.0.0.1'):
            with self.subTest(peer=peer):
                self.assertFalse(HealthCheckFilter().filter(self._record(self.HEALTH_LINE, peer)))

    def test_the_same_request_from_elsewhere_is_kept(self):
        from common.access_log import HealthCheckFilter
        self.assertTrue(HealthCheckFilter().filter(self._record(self.HEALTH_LINE, '172.21.0.1')))

    def test_another_request_from_the_container_is_kept(self):
        from common.access_log import HealthCheckFilter
        self.assertTrue(HealthCheckFilter().filter(self._record('"GET /api/auth/user HTTP/1.1" 200 214')))
        self.assertTrue(HealthCheckFilter().filter(self._record('"POST / HTTP/1.1" 405 0')))

    def test_a_line_whose_origin_is_unknown_is_kept(self):
        from common.access_log import HealthCheckFilter
        record = logging.LogRecord('django.server', logging.INFO, __file__, 1, self.HEALTH_LINE, (), None)
        self.assertTrue(HealthCheckFilter().filter(record))

    def test_the_web_server_logger_uses_the_filter(self):
        from common.access_log import HealthCheckFilter
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
            response = self.client.post(self._url('capture/'))
        self.assertEqual(response.status_code, 502)
        # A service that gives no reason (an older one) gets the plain sentence
        self.assertEqual(response.json()['error'], 'The screenshot could not be taken. The cause is not known: see the log of Watcher.')

    def test_the_answer_says_why_the_page_could_not_be_captured(self):
        self._allow('change_alert')
        cases = [
            (_service_answer(502, b'', 'timeout'), 'The site did not answer in time.'),
            (_service_answer(502, b'', 'dns'), 'The domain name could not be resolved.'),
            (_service_answer(502, b'', 'refused'), 'The site refused the connection.'),
            (_service_answer(502, b'', 'tls'), 'The certificate of the site is not valid.'),
            (_service_answer(502, b'', 'unreachable'), 'The site could not be reached (name not found, connection refused, or an address that is not public).'),
            (_service_answer(400, b'', 'address'), 'This is not an address the service can visit: it must be a public http(s) address.'),
            (_service_answer(400, b'', 'address not allowed'), 'This is not an address the service can visit: it must be a public http(s) address.'),
            (_service_answer(400, b'', 'dns'), 'The domain name could not be resolved.'),
            (_service_answer(400, b'', 'private'), 'This address is not a public one: the service only visits public addresses.'),
            (_service_answer(500, b'', 'boom'), 'The screenshot service failed.'),
            (_service_answer(200, b'x' * (3 * 1024 * 1024 + 1)), 'The capture is too big to keep.'),
        ]
        for answer, sentence in cases:
            with self.subTest(sentence=sentence), patch('common.core.requests.post', return_value=answer):
                response = self.client.post(self._url('capture/'))
                self.assertEqual(response.status_code, 502)
                self.assertEqual(response.json()['error'], 'The screenshot could not be taken. ' + sentence)

    def test_the_answer_says_when_the_service_does_not_answer(self):
        self._allow('change_alert')
        with patch('common.core.requests.post', side_effect=requests.exceptions.ConnectionError('down')):
            response = self.client.post(self._url('capture/'))
        self.assertEqual(response.json()['error'], 'The screenshot could not be taken. The screenshot service did not answer.')

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

    def test_a_user_cannot_flood_the_browser_with_captures(self):
        from django.core.cache import cache
        cache.clear()
        self.addCleanup(cache.clear)
        self.user.user_permissions.add(*Permission.objects.filter(codename='change_legitimatedomain'))
        self.client.force_authenticate(User.objects.get(pk=self.user.pk))
        with override_settings(WATCHER_THROTTLES={'screenshot': '2/min'}), \
                patch('common.core.requests.post', return_value=_service_answer(content=b'new')):
            codes = [self.client.post(self._url('capture/')).status_code for _ in range(3)]
        self.assertEqual(codes, [201, 201, 429])

    def test_only_a_few_captures_run_at_the_same_time(self):
        from common import api
        self.user.user_permissions.add(*Permission.objects.filter(codename='change_legitimatedomain'))
        self.client.force_authenticate(User.objects.get(pk=self.user.pk))
        slots = [api._capture_slots.acquire(blocking=False) for _ in range(4)]
        try:
            self.assertEqual(self.client.post(self._url('capture/')).status_code, 429)
        finally:
            for _ in filter(None, slots):
                api._capture_slots.release()
        with patch('common.core.requests.post', return_value=_service_answer(content=b'new')):
            self.assertEqual(self.client.post(self._url('capture/')).status_code, 201)


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
        self.assertNotIn(f'/threats_watcher?tab=keywords&keyword={keyword.id}',
                         [r['to'] for r in self.groups('zeus')['threats_watcher']['results']])  # not without signing in
        self.login()
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

    def test_the_search_is_limited_per_visitor(self):
        from django.core.cache import cache
        cache.clear()
        self.addCleanup(cache.clear)
        with override_settings(WATCHER_THROTTLES={'search': '3/min'}):
            codes = [self.client.get(URL, {'q': 'acme'}).status_code for _ in range(4)]
        self.assertEqual(codes, [200, 200, 200, 429])

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


class ScheduledJobsEndLineTest(SimpleTestCase):
    """Every long scheduled job writes one `CRON TASK done` line (duration and counts): without it a job that never ends,
    or that ends in an hour instead of a quarter of an hour, cannot be told from the logs."""

    JOBS = (
        ('threats_watcher.core', 'main_watch'),
        ('cyber_watch.core', 'fetch_latest_cves'),
        ('cyber_watch.core', 'fetch_ransomware_data'),
        ('cyber_watch.core', 'fetch_ransomlook_data'),
        ('dns_finder.core', 'main_dns_twist'),
        ('dns_finder.core', 'recheck_dangling_subdomains'),
        ('data_leak.core', 'main_data_leak'),
        ('site_monitoring.core', 'monitoring_check'),
        ('site_monitoring.core', 'check_monitored_pages'),
        ('site_monitoring.core', 'update_site_monitoring_rdap_data'),
        ('common.core', 'update_legitimate_domains_rdap_data'),
        ('common.core', 'update_all_ssl_certificates'),
        ('connectors.core', 'run_weekly_health_checks'),
    )

    def test_each_job_is_wrapped_by_the_end_line(self):
        import importlib
        for module, name in self.JOBS:
            job = getattr(importlib.import_module(module), name)
            self.assertTrue(hasattr(job, '__wrapped__'), f'{module}.{name} writes no end line')

    def test_a_job_that_fails_says_so(self):
        import logging
        from common.utils import job_log
        logger = logging.getLogger('watcher.test_end_line')

        @job_log.logged_job('Probe', logger)
        def failing():
            job_log.job_count('items', 3)
            raise RuntimeError('boom')

        with self.assertLogs('watcher.test_end_line', level='INFO') as logs:
            with self.assertRaises(RuntimeError):
                failing()
        self.assertIn('CRON TASK done: Probe - items=3', logs.output[0])
        self.assertIn('stopped by an error', logs.output[0])


class ChannelBreakerTest(SimpleTestCase):
    """A channel that fails several times in a row is skipped for a while, then tried once again."""

    def setUp(self):
        from common.utils import job_log
        self.job_log = job_log
        job_log.reset_breakers()
        self.clock = [1000.0]
        patcher = patch('common.utils.job_log._now', new=lambda: self.clock[0])
        patcher.start()
        self.addCleanup(patcher.stop)
        self.addCleanup(job_log.reset_breakers)
        self.calls = {'slack': 0, 'email': 0}

    def _sender(self, channel, outcome):
        import logging

        def send():
            self.calls[channel] += 1
            if outcome[0] == 'fail':
                logging.getLogger('watcher.common').error(f'Failed to send message to {channel}: 500')
            elif outcome[0] == 'note':
                self.job_log.note_channel('no recipient')
        return send

    def _run(self, channel, outcome):
        return self.job_log.run_channel(channel, self._sender(channel, outcome))

    def test_the_channel_is_skipped_after_five_failures_in_a_row(self):
        outcome = ['fail']
        for _ in range(5):
            self.assertTrue(self._run('slack', outcome).startswith('failed'))
        status = self._run('slack', outcome)
        self.assertTrue(status.startswith('skipped'), status)
        self.assertEqual(self.calls['slack'], 5)  # the sixth was not even tried
        for _ in range(10):
            self._run('slack', outcome)
        self.assertEqual(self.calls['slack'], 5)

    def test_one_success_clears_the_count(self):
        for _ in range(4):
            self._run('slack', ['fail'])
        self._run('slack', ['ok'])
        for _ in range(4):
            self._run('slack', ['fail'])
        self.assertTrue(self._run('slack', ['ok']) == 'ok')  # still tried: four in a row, not five

    def test_a_channel_that_has_nothing_to_send_is_not_a_failure(self):
        for _ in range(20):
            self.assertEqual(self._run('email', ['note']), 'no recipient')
        self.assertEqual(self.calls['email'], 20)

    def test_the_channels_are_independent(self):
        for _ in range(5):
            self._run('slack', ['fail'])
        self.assertTrue(self._run('slack', ['fail']).startswith('skipped'))
        self.assertEqual(self._run('email', ['ok']), 'ok')

    def test_after_the_cooldown_one_attempt_is_let_through_and_a_success_reopens_the_channel(self):
        for _ in range(5):
            self._run('slack', ['fail'])
        self.clock[0] += 301
        self.assertEqual(self._run('slack', ['ok']), 'ok')
        self.assertEqual(self.calls['slack'], 6)
        self.assertEqual(self._run('slack', ['ok']), 'ok')  # back to normal, nothing skipped

    def test_a_failed_attempt_after_the_cooldown_skips_the_channel_again(self):
        for _ in range(5):
            self._run('slack', ['fail'])
        self.clock[0] += 301
        self.assertTrue(self._run('slack', ['fail']).startswith('failed'))
        self.assertTrue(self._run('slack', ['fail']).startswith('skipped'))
        self.assertEqual(self.calls['slack'], 6)

    def test_the_breaker_says_when_it_opens_and_when_the_channel_is_back(self):
        with self.assertLogs('watcher.common', level='INFO') as logs:
            for _ in range(5):
                self._run('slack', ['fail'])
            self.clock[0] += 301
            self._run('slack', ['ok'])
        lines = [line for line in logs.output if 'Notification channel' in line]
        self.assertEqual(len(lines), 2, logs.output)
        self.assertIn('slack keeps failing (5 in a row', lines[0])
        self.assertIn('skipped for 5 min', lines[0])
        self.assertIn('slack answers again', lines[1])

    def test_the_end_line_of_a_job_counts_what_was_skipped(self):
        import logging
        for _ in range(5):
            self._run('slack', ['fail'])

        @self.job_log.logged_job('Probe', logging.getLogger('watcher.test_breaker'))
        def job():
            for _ in range(8):
                self._run('slack', ['fail'])

        with self.assertLogs('watcher.test_breaker', level='INFO') as logs:
            job()
        self.assertIn('notifications_skipped=8', logs.output[0])

    def test_twenty_notifications_try_a_failing_channel_five_times(self):
        from common import core
        attempts = []

        def send():
            attempts.append(1)
            import logging
            logging.getLogger('watcher.common').error('Failed to send message to Slack: 500')

        with patch.object(core, 'is_enabled', return_value=True):
            for _ in range(20):
                core._send_channel('new_cve', 'slack', 'cyber_watch', send)
        self.assertEqual(len(attempts), 5)


class ExpiryCheckTest(SimpleTestCase):
    """Where the stored expiry date stands against what the registry says."""

    TODAY = __import__('datetime').date(2026, 11, 13)

    def _verdict(self, stored, rdap):
        from common.utils import expiry_check
        return expiry_check.verdict(stored, rdap, self.TODAY)

    def test_the_same_date_is_ok(self):
        self.assertEqual(self._verdict('2027-11-07', '2027-11-07')[0], 'ok')

    def test_a_past_date_for_a_domain_still_registered_is_the_wrong_expired(self):
        code, text, source = self._verdict('2026-03-01', '2027-11-07')
        self.assertEqual(code, 'expired_but_registered')
        self.assertEqual(str(source), '2027-11-07')
        self.assertIn('still registered', text)

    def test_a_date_that_really_passed_is_only_stale(self):
        # The registry says it expired as well: nothing is wrong, the domain is expired
        self.assertEqual(self._verdict('2026-03-01', '2026-03-01')[0], 'ok')
        self.assertEqual(self._verdict('2026-03-01', '2026-06-01')[0], 'stale')

    def test_a_different_future_date_is_stale_with_its_direction(self):
        self.assertIn('earlier', self._verdict('2027-01-01', '2027-11-07')[1])
        self.assertIn('later', self._verdict('2028-01-01', '2027-11-07')[1])

    def test_no_stored_date_is_missing_and_no_answer_is_no_data(self):
        self.assertEqual(self._verdict(None, '2027-11-07')[0], 'missing')
        self.assertEqual(self._verdict('2027-11-07', None)[0], 'no_data')
        self.assertEqual(self._verdict(None, None)[0], 'no_data')

    def test_an_unreadable_date_is_not_a_date(self):
        from common.utils import expiry_check
        self.assertIsNone(expiry_check.parse_day('not a date'))
        self.assertEqual(self._verdict('2027-11-07', 'garbage')[0], 'no_data')


class CheckExpiryDatesCommandTest(TestCase):
    """The command reads, compares and says; it never writes."""

    def _run(self, *args, found=None):
        from io import StringIO
        from django.core.management import call_command
        out = StringIO()
        found = found or {'rdap': '2027-11-07', 'rdap_source': 'https://rdap.example/'}
        with patch('common.utils.expiry_check.lookup', return_value=found) as lookup:
            call_command('check_expiry_dates', *args, '--delay', '0', stdout=out)
        return out.getvalue(), lookup

    def test_it_flags_a_domain_shown_as_expired_that_is_still_registered(self):
        from datetime import date
        LegitimateDomain.objects.create(domain_name='thalesgroup.com', expiry=date(2026, 3, 1))
        output, _ = self._run('thalesgroup.com')
        self.assertIn('expired_but_registered', output)
        self.assertIn('stored=2026-03-01', output)
        self.assertIn('rdap=2027-11-07', output)
        self.assertIn('To correct: thalesgroup.com', output)

    def test_it_never_writes(self):
        from datetime import date
        LegitimateDomain.objects.create(domain_name='thalesgroup.com', expiry=date(2026, 3, 1))
        self._run('thalesgroup.com')
        self.assertEqual(LegitimateDomain.objects.get(domain_name='thalesgroup.com').expiry, date(2026, 3, 1))

    def test_a_right_date_is_ok_and_nothing_is_to_correct(self):
        from datetime import date
        LegitimateDomain.objects.create(domain_name='thalesgroup.com', expiry=date(2027, 11, 7))
        output, _ = self._run('thalesgroup.com')
        self.assertIn('-> ok', output)
        self.assertNotIn('To correct', output)

    def test_expired_checks_only_the_domains_shown_as_expired(self):
        from datetime import timedelta
        past, future = timezone.now().date() - timedelta(days=30), timezone.now().date() + timedelta(days=300)
        LegitimateDomain.objects.create(domain_name='old.example', expiry=past)
        LegitimateDomain.objects.create(domain_name='fine.example', expiry=future)
        LegitimateDomain.objects.create(domain_name='nodate.example')
        _, lookup = self._run('--expired')
        self.assertEqual([call.args[0] for call in lookup.call_args_list], ['old.example'])

    def test_a_domain_unknown_to_watcher_is_checked_as_missing(self):
        output, _ = self._run('not-in-watcher.example')
        self.assertIn('stored=-', output)
        self.assertIn('-> missing', output)

    def test_it_asks_for_something_to_check(self):
        from django.core.management import call_command
        from django.core.management.base import CommandError
        with self.assertRaises(CommandError):
            call_command('check_expiry_dates')


class LegitimateExpiryJobGuardTest(TestCase):
    """The job does not lower an expiry date on one answer: the registry has to say it twice."""

    def _run(self, rdap_answer):
        from common.core import update_legitimate_domains_rdap_data
        with patch('common.core.close_old_connections'), patch('common.utils.rdap.RDAPDiscovery') as rdap:
            rdap.return_value.status = 'ok' if rdap_answer is not None else 'error'
            rdap.return_value.fetch_rdap_data.return_value = rdap_answer is not None
            rdap.return_value.get_expiration_date.return_value = rdap_answer
            rdap.return_value.get_registration_date.return_value = None
            with self.assertLogs('watcher.common', level='INFO') as logs:
                update_legitimate_domains_rdap_data()
        return '\n'.join(logs.output)

    def _end(self, output):
        return [line for line in output.splitlines() if 'CRON TASK done' in line][0]

    def _domain(self, name='back.example', **fields):
        return LegitimateDomain.objects.create(domain_name=name, **fields)

    def _reload(self, name='back.example'):
        return LegitimateDomain.objects.get(domain_name=name)

    def test_an_unchanged_date_is_counted_with_its_source(self):
        from datetime import date
        self._domain('same.example', expiry=date(2027, 11, 7))
        end = self._end(self._run('2027-11-07'))
        self.assertIn('via_rdap=1', end)
        self.assertIn('unchanged=1', end)
        self.assertNotIn('held', end)

    def test_a_date_that_goes_back_is_held_the_first_time(self):
        from datetime import timedelta
        today = timezone.now().date()
        future, earlier = today + timedelta(days=100), today - timedelta(days=10)
        self._domain(expiry=future)
        output = self._run(earlier.isoformat())
        domain = self._reload()
        self.assertEqual(domain.expiry, future)          # the stored date is kept: it does not show as Expired
        self.assertEqual(domain.expiry_pending, earlier)  # the answer waits
        self.assertEqual(domain.expiry_pending_source, 'RDAP')
        self.assertIn('held=1', self._end(output))
        self.assertNotIn('regressed', self._end(output))
        warning = [line for line in output.splitlines() if 'EARLIER than the one stored' in line][0]
        self.assertTrue(warning.startswith('WARNING'))
        self.assertIn('kept until a second pass confirms it', warning)
        self.assertIn('check_expiry_dates back.example', warning)

    def test_the_same_earlier_date_twice_is_written(self):
        from datetime import timedelta
        today = timezone.now().date()
        earlier = today - timedelta(days=10)
        self._domain(expiry=today + timedelta(days=100))
        self._run(earlier.isoformat())
        output = self._run(earlier.isoformat())
        domain = self._reload()
        self.assertEqual(domain.expiry, earlier)
        self.assertIsNone(domain.expiry_pending)
        end = self._end(output)
        self.assertIn('regressed=1', end)
        self.assertIn('turned_expired=1', end)
        self.assertIn('the same earlier expiry date twice', output)
        self.assertIn('it now shows as Expired', output)

    def test_a_different_earlier_date_on_the_second_pass_does_not_confirm(self):
        from datetime import timedelta
        today = timezone.now().date()
        future = today + timedelta(days=100)
        self._domain(expiry=future)
        self._run((today - timedelta(days=10)).isoformat())
        self._run((today - timedelta(days=20)).isoformat())
        domain = self._reload()
        self.assertEqual(domain.expiry, future)
        self.assertEqual(domain.expiry_pending, today - timedelta(days=20))

    def test_the_stored_date_coming_back_clears_the_waiting_answer(self):
        from datetime import timedelta
        today = timezone.now().date()
        future = today + timedelta(days=100)
        self._domain(expiry=future)
        self._run((today - timedelta(days=10)).isoformat())
        self._run(future.isoformat())
        domain = self._reload()
        self.assertEqual(domain.expiry, future)
        self.assertIsNone(domain.expiry_pending)
        self.assertIsNone(domain.expiry_pending_source)
        self.assertIsNone(domain.expiry_pending_at)

    def test_a_waiting_answer_older_than_a_day_does_not_confirm(self):
        from datetime import timedelta
        today = timezone.now().date()
        earlier, future = today - timedelta(days=10), today + timedelta(days=100)
        self._domain(expiry=future, expiry_pending=earlier, expiry_pending_source='RDAP',
                     expiry_pending_at=timezone.now() - timedelta(hours=25))
        self._run(earlier.isoformat())
        domain = self._reload()
        self.assertEqual(domain.expiry, future)  # held again: the first sighting was too long ago

    def test_a_later_date_is_a_renewal_and_clears_what_waited(self):
        from datetime import date, timedelta
        today = timezone.now().date()
        self._domain('renewed.example', expiry=date(2027, 1, 1), expiry_pending=today - timedelta(days=5),
                     expiry_pending_source='RDAP', expiry_pending_at=timezone.now())
        end = self._end(self._run('2028-01-01'))
        domain = self._reload('renewed.example')
        self.assertEqual(domain.expiry, date(2028, 1, 1))
        self.assertIsNone(domain.expiry_pending)
        self.assertNotIn('regressed', end)

    def test_an_answer_without_a_date_is_counted_and_changes_nothing(self):
        from datetime import date
        self._domain('nodate.example', expiry=date(2027, 1, 1))
        end = self._end(self._run(''))
        self.assertIn('no_date_in_answer=1', end)
        self.assertEqual(self._reload('nodate.example').expiry, date(2027, 1, 1))


class ExpiryDecisionTest(SimpleTestCase):
    """The rule that decides what an answer does to a stored date."""

    NOW = __import__('datetime').datetime(2026, 11, 13, 12, 0)

    def _decide(self, stored, new, pending=None, source=None, at=None):
        from common.utils import expiry_check
        return expiry_check.decide(stored, new, pending, source, at, self.NOW)

    def test_each_case(self):
        from datetime import date, timedelta
        hour, day = timedelta(hours=1), timedelta(hours=30)
        # (stored, new, pending, source, at) -> action
        cases = [
            (None, '2027-01-01', None, None, None, 'fill'),
            ('2027-01-01', '2027-01-01', None, None, None, 'keep'),
            ('2027-01-01', '2028-01-01', None, None, None, 'renew'),
            ('2027-01-01', '2026-03-01', None, None, None, 'hold'),
            ('2027-01-01', '2026-03-01', date(2026, 3, 1), 'RDAP', self.NOW - hour, 'confirm'),
            ('2027-01-01', '2026-03-01', date(2026, 3, 1), 'RDAP', self.NOW - day, 'hold'),
            ('2027-01-01', '2026-03-01', date(2026, 4, 1), 'RDAP', self.NOW - hour, 'hold'),
        ]
        for stored, new, pending, source, at, expected in cases:
            action = self._decide(stored, new, pending, source, at)[0]
            self.assertEqual(action, expected, (stored, new, pending, source, at))

    def test_a_confirmation_or_a_renewal_leaves_nothing_waiting(self):
        for args in (('2027-01-01', '2028-01-01'), ('2027-01-01', '2027-01-01')):
            self.assertEqual(self._decide(*args)[1:], (None, None, None))

    def test_a_hold_remembers_the_answer_the_source_and_the_time(self):
        action, pending, source, at = self._decide('2027-01-01', '2026-03-01')
        self.assertEqual((action, str(pending), source, at), ('hold', '2026-03-01', 'RDAP', self.NOW))


class CheckExpiryDatesLabelTest(TestCase):
    """For a domain without a date, the command says whether the registry answered without one or did not answer."""

    def _output(self, rdap_source):
        from io import StringIO
        from django.core.management import call_command
        out = StringIO()
        found = {'rdap': None, 'rdap_source': rdap_source}
        with patch('common.utils.expiry_check.lookup', return_value=found):
            call_command('check_expiry_dates', 'thales.de', '--delay', '0', stdout=out)
        return out.getvalue()

    def test_a_registry_that_answers_without_an_expiry_date_is_told_apart(self):
        self.assertIn('rdap=- (answered, no expiry date)', self._output('https://rdap.denic.de/domain/thales.de'))

    def test_a_registry_that_does_not_answer_is_told_apart(self):
        self.assertIn('rdap=- (no answer)', self._output(None))


class CheckExpiryDatesPendingTest(TestCase):
    """The command shows an answer that waits for a second pass, so a held date is visible."""

    def test_a_waiting_answer_is_shown_next_to_the_stored_date(self):
        from datetime import date
        from io import StringIO
        from django.core.management import call_command
        LegitimateDomain.objects.create(domain_name='held.example', expiry=date(2027, 11, 7), expiry_pending=date(2026, 3, 1),
                                        expiry_pending_source='RDAP')
        out = StringIO()
        found = {'rdap': '2027-11-07', 'rdap_source': 'https://rdap.example/'}
        with patch('common.utils.expiry_check.lookup', return_value=found):
            call_command('check_expiry_dates', 'held.example', '--delay', '0', stdout=out)
        self.assertIn('stored=2027-11-07 (waiting for confirmation: 2026-03-01)', out.getvalue())


class RdapBootstrapTest(SimpleTestCase):
    """The RDAP server of a domain comes from the IANA bootstrap, not from a list kept in the code."""

    BOOTSTRAP = {'services': [
        [['com', 'net'], ['https://rdap.verisign.com/com/v1/']],
        [['UK'], ['http://rdap.nominet.uk/uk/', 'https://rdap.nominet.uk/uk/']],
        [['ca'], ['https://rdap.ca.fury.ca/rdap']],
    ]}

    def setUp(self):
        from common.utils import rdap
        self.rdap = rdap
        rdap.reset_bootstrap()
        self.addCleanup(rdap.reset_bootstrap)
        sleeper = patch('common.utils.rdap.time.sleep')
        sleeper.start()
        self.addCleanup(sleeper.stop)

    def _response(self, status=200, body=None, headers=None):
        response = MagicMock(status_code=status, headers=headers or {})
        response.json.return_value = body if body is not None else {}
        response.raise_for_status.side_effect = None if status < 400 else requests_module.HTTPError(str(status))
        return response

    def _get(self, *answers):
        """requests.get: the bootstrap first, then the given answers one after the other."""
        calls = iter([self._response(200, self.BOOTSTRAP), *answers])
        return patch('common.utils.rdap.requests.get', side_effect=lambda *a, **k: next(calls))

    def test_the_server_of_an_extension_comes_from_the_bootstrap(self):
        with self._get():
            self.assertEqual(self.rdap.rdap_servers_for('thalesgroup.com'), ['https://rdap.verisign.com/com/v1/'])
            self.assertEqual(self.rdap.rdap_servers_for('thales.ca'), ['https://rdap.ca.fury.ca/rdap/'])  # the slash is added

    def test_the_https_server_comes_first_and_the_extension_is_matched_in_lowercase(self):
        with self._get():
            self.assertEqual(self.rdap.rdap_servers_for('BBC.CO.UK'),
                             ['https://rdap.nominet.uk/uk/', 'http://rdap.nominet.uk/uk/'])

    def test_an_extension_the_bootstrap_does_not_list_has_no_server(self):
        with self._get():
            self.assertEqual(self.rdap.rdap_servers_for('thales.de'), [])
            self.assertEqual(self.rdap.rdap_servers_for('localhost'), [])
            self.assertEqual(self.rdap.rdap_servers_for(''), [])

    def test_the_bootstrap_is_read_once_a_day_not_for_each_domain(self):
        with self._get() as get:
            for domain in ('a.com', 'b.net', 'c.ca', 'd.uk'):
                self.rdap.rdap_servers_for(domain)
            self.assertEqual(get.call_count, 1)

    def test_a_failed_read_keeps_the_last_copy_and_does_not_retry_at_once(self):
        calls = {'n': 0}

        def get(*args, **kwargs):
            calls['n'] += 1
            if calls['n'] == 1:
                return self._response(200, self.BOOTSTRAP)
            raise requests_module.ConnectionError('down')

        with patch('common.utils.rdap.requests.get', side_effect=get), \
                patch('common.utils.rdap.time.monotonic', side_effect=[0, 100000, 100010]):
            self.assertTrue(self.rdap.rdap_servers_for('a.com'))       # read
            with self.assertLogs('watcher.common', level='WARNING') as logs:
                self.assertTrue(self.rdap.rdap_servers_for('b.com'))   # a day later: the read fails, the old copy serves
            self.assertTrue(self.rdap.rdap_servers_for('c.com'))       # ten seconds later: no new attempt
        self.assertEqual(calls['n'], 2)
        self.assertIn('the last copy is used', logs.output[0])

    def test_no_bootstrap_at_all_means_no_server_and_no_crash(self):
        with patch('common.utils.rdap.requests.get', side_effect=requests_module.ConnectionError('down')):
            with self.assertLogs('watcher.common', level='WARNING') as logs:
                self.assertEqual(self.rdap.rdap_servers_for('a.com'), [])
        self.assertIn('no RDAP lookup is possible until it is read', logs.output[0])

    def test_an_international_name_is_asked_in_punycode(self):
        with self._get(self._response(200, {'events': []})) as get:
            lookup = self.rdap.RDAPDiscovery('BÜCHER.com')
            self.assertTrue(lookup.fetch_rdap_data())
        self.assertTrue(get.call_args.args[0].endswith('/domain/xn--bcher-kva.com'))

    def test_a_record_is_ok_and_gives_its_expiry(self):
        record = {'events': [{'eventAction': 'expiration', 'eventDate': '2027-11-07T00:00:00Z'}]}
        with self._get(self._response(200, record)):
            lookup = self.rdap.RDAPDiscovery('thalesgroup.com')
            self.assertTrue(lookup.fetch_rdap_data())
        self.assertEqual((lookup.status, lookup.get_expiration_date()), ('ok', '2027-11-07'))

    def test_a_404_from_the_registry_is_an_answer_not_a_failure(self):
        with self._get(self._response(404)):
            lookup = self.rdap.RDAPDiscovery('not-registered.com')
            self.assertFalse(lookup.fetch_rdap_data())
        self.assertEqual(lookup.status, 'not_found')

    def test_an_extension_without_a_server_is_unsupported(self):
        with self._get():
            lookup = self.rdap.RDAPDiscovery('thales.de')
            self.assertFalse(lookup.fetch_rdap_data())
        self.assertEqual(lookup.status, 'unsupported')

    def test_a_registry_that_says_slow_down_is_waited_for_once(self):
        record = {'events': []}
        with self._get(self._response(429, headers={'Retry-After': '2'}), self._response(200, record)) as get, \
                patch('common.utils.rdap.time.sleep') as sleep:
            lookup = self.rdap.RDAPDiscovery('a.com')
            self.assertTrue(lookup.fetch_rdap_data())
        sleep.assert_called_once_with(2.0)
        self.assertEqual(get.call_count, 3)  # the bootstrap, the refused try, the new one

    def test_two_refusals_in_a_row_are_a_rate_limit_and_a_long_wait_is_not_waited_for(self):
        with self._get(self._response(429, headers={'Retry-After': '1'}), self._response(429, headers={'Retry-After': '1'})), \
                patch('common.utils.rdap.time.sleep'):
            lookup = self.rdap.RDAPDiscovery('a.com')
            self.assertFalse(lookup.fetch_rdap_data())
        self.assertEqual(lookup.status, 'rate_limited')
        with self._get(self._response(429, headers={'Retry-After': '600'})), patch('common.utils.rdap.time.sleep') as sleep:
            self.rdap.reset_bootstrap()
            lookup = self.rdap.RDAPDiscovery('a.com')
            self.assertFalse(lookup.fetch_rdap_data())
        sleep.assert_not_called()
        self.assertEqual(lookup.status, 'rate_limited')

    def test_a_timeout_or_a_bad_answer_is_an_error(self):
        calls = iter([self._response(200, self.BOOTSTRAP)])

        def get(*args, **kwargs):
            try:
                return next(calls)
            except StopIteration:
                raise requests_module.ConnectTimeout('slow')

        with patch('common.utils.rdap.requests.get', side_effect=get):
            lookup = self.rdap.RDAPDiscovery('a.com')
            self.assertFalse(lookup.fetch_rdap_data())
        self.assertEqual(lookup.status, 'error')
        not_json = self._response(200)
        not_json.json.side_effect = ValueError('not json')
        with self._get(not_json):
            self.rdap.reset_bootstrap()
            lookup = self.rdap.RDAPDiscovery('a.com')
            self.assertFalse(lookup.fetch_rdap_data())
        self.assertEqual(lookup.status, 'error')

    def test_a_500_is_an_error_and_the_other_servers_of_the_extension_are_tried(self):
        with self._get(self._response(500), self._response(200, {'events': []})):
            lookup = self.rdap.RDAPDiscovery('bbc.co.uk')  # two servers listed for .uk
            self.assertTrue(lookup.fetch_rdap_data())
        self.assertEqual(lookup.status, 'ok')

    def test_the_hard_coded_list_is_gone(self):
        import inspect
        source = inspect.getsource(self.rdap)
        self.assertNotIn('tld_mappings', source)
        self.assertNotIn('rdap_endpoints', source)


class LegitimateExpiryJobRegistryTest(TestCase):
    """What the job does with what the registry says about the domain itself."""

    def _run(self, status, rdap_answer=None):
        from common.core import update_legitimate_domains_rdap_data
        with patch('common.core.close_old_connections'), patch('common.utils.rdap.RDAPDiscovery') as rdap:
            rdap.return_value.status = status
            rdap.return_value.fetch_rdap_data.return_value = rdap_answer is not None
            rdap.return_value.get_expiration_date.return_value = rdap_answer
            rdap.return_value.get_registration_date.return_value = None
            with self.assertLogs('watcher.common', level='INFO') as logs:
                update_legitimate_domains_rdap_data()
        return '\n'.join(logs.output)

    def _end(self, output):
        return [line for line in output.splitlines() if 'CRON TASK done' in line][0]

    def test_a_domain_the_registry_says_does_not_exist_is_counted_and_has_no_date(self):
        LegitimateDomain.objects.create(domain_name='gone.example')
        end = self._end(self._run('not_found'))
        self.assertIn('not_registered=1', end)
        self.assertIsNone(LegitimateDomain.objects.get(domain_name='gone.example').expiry)

    def test_an_extension_without_an_rdap_server_is_counted_and_remembered(self):
        LegitimateDomain.objects.create(domain_name='thales.example')
        end = self._end(self._run('unsupported'))
        self.assertIn('rdap_unsupported=1', end)
        domain = LegitimateDomain.objects.get(domain_name='thales.example')
        self.assertEqual(domain.expiry_check, 'unsupported')
        self.assertIsNone(domain.expiry)

    def test_a_registry_that_failed_is_counted_and_remembered_as_unreachable(self):
        LegitimateDomain.objects.create(domain_name='flaky.example')
        end = self._end(self._run('error'))
        self.assertIn('without_data=1', end)
        self.assertEqual(LegitimateDomain.objects.get(domain_name='flaky.example').expiry_check, 'unreachable')

    def test_nothing_goes_to_a_third_party(self):
        import common.utils
        self.assertFalse(hasattr(common.utils, 'whois'))
        with self.assertRaises(ImportError):
            __import__('common.utils.whois')


class RdapRetryTest(SimpleTestCase):
    """A passing failure is tried once more; a lasting one says what it was."""

    BOOTSTRAP = {'services': [[['com'], ['https://rdap.verisign.com/com/v1/']]]}

    def setUp(self):
        from common.utils import rdap
        self.rdap = rdap
        rdap.reset_bootstrap()
        self.addCleanup(rdap.reset_bootstrap)
        sleeper = patch('common.utils.rdap.time.sleep')
        self.sleep = sleeper.start()
        self.addCleanup(sleeper.stop)

    def _response(self, status=200, body=None):
        response = MagicMock(status_code=status, headers={})
        response.json.return_value = body if body is not None else {}
        return response

    def _answers(self, *answers):
        """The bootstrap, then the answers given in order: an exception is raised, a response is returned."""
        queue = iter([self._response(200, self.BOOTSTRAP), *answers])

        def get(*args, **kwargs):
            answer = next(queue)
            if isinstance(answer, Exception):
                raise answer
            return answer
        return patch('common.utils.rdap.requests.get', side_effect=get)

    def test_a_timeout_then_an_answer_is_an_answer(self):
        record = {'events': [{'eventAction': 'expiration', 'eventDate': '2027-11-07T00:00:00Z'}]}
        with self._answers(requests_module.ConnectTimeout('slow'), self._response(200, record)):
            lookup = self.rdap.RDAPDiscovery('thalesgroup.com')
            self.assertTrue(lookup.fetch_rdap_data())
        self.assertEqual((lookup.status, lookup.get_expiration_date()), ('ok', '2027-11-07'))
        self.sleep.assert_called_once_with(1)

    def test_a_503_then_an_answer_is_an_answer(self):
        with self._answers(self._response(503), self._response(200, {'events': []})):
            lookup = self.rdap.RDAPDiscovery('a.com')
            self.assertTrue(lookup.fetch_rdap_data())

    def test_a_lasting_timeout_is_an_error_that_says_what_it_was(self):
        with self._answers(requests_module.ConnectTimeout('slow'), requests_module.ConnectTimeout('slow')):
            lookup = self.rdap.RDAPDiscovery('a.com')
            self.assertFalse(lookup.fetch_rdap_data())
        self.assertEqual((lookup.status, lookup.detail), ('error', 'ConnectTimeout'))

    def test_a_lasting_503_is_an_error_with_its_code(self):
        with self._answers(self._response(503), self._response(503)):
            lookup = self.rdap.RDAPDiscovery('a.com')
            self.assertFalse(lookup.fetch_rdap_data())
        self.assertEqual((lookup.status, lookup.detail), ('error', 'HTTP 503'))

    def test_a_403_is_not_tried_again(self):
        with self._answers(self._response(403)) as get:
            lookup = self.rdap.RDAPDiscovery('a.com')
            self.assertFalse(lookup.fetch_rdap_data())
        self.assertEqual(get.call_count, 2)  # the bootstrap, then the one try
        self.assertEqual((lookup.status, lookup.detail), ('error', 'HTTP 403'))
        self.sleep.assert_not_called()

    def test_a_success_and_a_404_have_no_detail(self):
        with self._answers(self._response(404)):
            lookup = self.rdap.RDAPDiscovery('gone.com')
            lookup.fetch_rdap_data()
        self.assertEqual((lookup.status, lookup.detail), ('not_found', None))


class LegitimateDomainExpiryConfirmationTest(APITestCase):
    """A past date is Expired only when a registry confirmed it lately; otherwise it is Unconfirmed."""

    URL = '/api/common/legitimate_domains/'

    def setUp(self):
        today = timezone.now().date()
        now = timezone.now()
        make = LegitimateDomain.objects.create
        past = today - timedelta(days=3)
        self.confirmed = make(domain_name='confirmed.com', expiry=past, expiry_source='RDAP', expiry_check='ok', expiry_checked_at=now)
        self.whois = make(domain_name='whois.example', expiry=past, expiry_source='WHOIS', expiry_check='ok', expiry_checked_at=now)
        self.manual = make(domain_name='manual.example', expiry=past, expiry_source='manual')
        self.stale = make(domain_name='stale.com', expiry=past, expiry_source='RDAP', expiry_check='ok',
                          expiry_checked_at=now - timedelta(days=10))
        self.valid = make(domain_name='valid.com', expiry=today + timedelta(days=200), expiry_source='RDAP', expiry_check='ok',
                          expiry_checked_at=now)
        self.never = make(domain_name='never.example')
        _, self.token = AuthToken.objects.create(User.objects.create_user(username='editor', password='testpass123'))

    def names(self, query=''):
        response = self.client.get(self.URL + query)
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        return sorted(row['domain_name'] for row in response.data['results'])

    def login(self):
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {self.token}')

    def test_only_a_date_a_registry_confirmed_lately_is_expired(self):
        self.assertEqual(self.names('?status=expired'), ['confirmed.com'])

    def test_a_past_date_nobody_confirmed_is_unconfirmed(self):
        # left by the old WHOIS service, typed by hand, or confirmed more than a week ago
        self.assertEqual(self.names('?status=unconfirmed'), ['manual.example', 'stale.com', 'whois.example'])

    def test_unverified_is_what_no_registry_answered_for_lately(self):
        self.assertEqual(self.names('?status=unverified'), ['manual.example', 'never.example', 'stale.com'])

    def test_attention_still_includes_every_past_date(self):
        self.assertEqual(self.names('?status=attention'), ['confirmed.com', 'manual.example', 'stale.com', 'whois.example'])

    def test_the_other_filters_are_unchanged(self):
        self.assertEqual(self.names('?status=valid'), ['valid.com'])
        self.assertEqual(self.names('?status=none'), ['never.example'])

    def test_the_statistics_count_the_same_way(self):
        stats = self.client.get(self.URL + 'statistics/').data
        self.assertEqual((stats['expired'], stats['unconfirmed'], stats['unverified']), (1, 3, 3))

    def test_the_rows_say_whether_the_date_is_confirmed_and_where_it_comes_from(self):
        rows = {row['domain_name']: row for row in self.client.get(self.URL).data['results']}
        self.assertTrue(rows['confirmed.com']['expiry_confirmed'])
        for name in ('whois.example', 'manual.example', 'stale.com', 'never.example'):
            self.assertFalse(rows[name]['expiry_confirmed'], name)
        self.assertEqual((rows['confirmed.com']['expiry_source'], rows['confirmed.com']['expiry_check']), ('RDAP', 'ok'))
        self.assertIsNotNone(rows['confirmed.com']['expiry_checked_at'])
        self.assertIsNone(rows['never.example']['expiry_source'])

    def test_typing_a_new_date_marks_it_manual_and_forgets_what_waited(self):
        self.login()
        self.confirmed.expiry_pending = timezone.now().date()
        self.confirmed.expiry_pending_source = 'RDAP'
        self.confirmed.expiry_pending_at = timezone.now()
        self.confirmed.save()
        response = self.client.patch(f'{self.URL}{self.confirmed.pk}/', {'expiry': '2030-01-01'}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        domain = LegitimateDomain.objects.get(pk=self.confirmed.pk)
        self.assertEqual((domain.expiry_source, domain.expiry_check, domain.expiry_checked_at), ('manual', None, None))
        self.assertEqual((domain.expiry_pending, domain.expiry_pending_source, domain.expiry_pending_at), (None, None, None))
        self.assertFalse(response.data['expiry_confirmed'])

    def test_changing_something_else_or_the_same_date_leaves_the_check_alone(self):
        self.login()
        same = self.confirmed.expiry.isoformat()
        self.client.patch(f'{self.URL}{self.confirmed.pk}/', {'contact': 'someone@example.com'}, format='json')
        self.client.patch(f'{self.URL}{self.confirmed.pk}/', {'expiry': same}, format='json')
        domain = LegitimateDomain.objects.get(pk=self.confirmed.pk)
        self.assertEqual((domain.expiry_source, domain.expiry_check), ('RDAP', 'ok'))
        self.assertTrue(domain.expiry_confirmed)

    def test_a_domain_created_with_a_date_is_manual_and_without_one_is_not(self):
        self.login()
        with_date = self.client.post(self.URL, {'domain_name': 'typed.example', 'expiry': '2031-01-01'}, format='json')
        without = self.client.post(self.URL, {'domain_name': 'blank.example'}, format='json')
        self.assertEqual((with_date.status_code, without.status_code), (201, 201), (with_date.data, without.data))
        self.assertEqual(LegitimateDomain.objects.get(domain_name='typed.example').expiry_source, 'manual')
        self.assertIsNone(LegitimateDomain.objects.get(domain_name='blank.example').expiry_source)

    def test_the_model_rule_is_a_week(self):
        self.assertTrue(self.confirmed.expiry_confirmed)
        self.assertFalse(self.stale.expiry_confirmed)
        self.assertFalse(self.whois.expiry_confirmed)
        self.assertFalse(self.manual.expiry_confirmed)


class LegitimateExpiryJobRecordsTheCheckTest(TestCase):
    """The job remembers where each date comes from and what the last lookup said, without writing a timeline event."""

    def _run(self, status, rdap_answer=None):
        from common.core import update_legitimate_domains_rdap_data
        with patch('common.core.close_old_connections'), patch('common.utils.rdap.RDAPDiscovery') as rdap:
            rdap.return_value.status = status
            rdap.return_value.fetch_rdap_data.return_value = rdap_answer is not None
            rdap.return_value.get_expiration_date.return_value = rdap_answer or None
            rdap.return_value.get_registration_date.return_value = None
            update_legitimate_domains_rdap_data()

    def _get(self, name):
        return LegitimateDomain.objects.get(domain_name=name)

    def test_a_date_from_rdap_is_confirmed(self):
        LegitimateDomain.objects.create(domain_name='a.example')
        self._run('ok', rdap_answer='2027-11-07')
        domain = self._get('a.example')
        self.assertEqual((domain.expiry_source, domain.expiry_check), ('RDAP', 'ok'))
        self.assertIsNotNone(domain.expiry_checked_at)
        self.assertTrue(domain.expiry_confirmed)

    def test_the_registry_agreeing_with_a_typed_date_confirms_it(self):
        from datetime import date
        LegitimateDomain.objects.create(domain_name='a.example', expiry=date(2027, 11, 7), expiry_source='manual')
        self._run('ok', rdap_answer='2027-11-07')
        domain = self._get('a.example')
        self.assertEqual((domain.expiry_source, domain.expiry_check), ('RDAP', 'ok'))
        self.assertTrue(domain.expiry_confirmed)

    def test_an_earlier_date_that_waits_is_called_contradicted_and_does_not_confirm_the_stored_one(self):
        from datetime import timedelta
        today = timezone.now().date()
        LegitimateDomain.objects.create(domain_name='a.example', expiry=today + timedelta(days=100), expiry_source='manual')
        self._run('ok', rdap_answer=(today - timedelta(days=10)).isoformat())
        domain = self._get('a.example')
        self.assertEqual(domain.expiry_check, 'contradicted')
        self.assertEqual(domain.expiry_source, 'manual')  # the date is still the typed one
        self.assertFalse(domain.expiry_confirmed)

    def test_each_kind_of_answer_without_a_date_is_told_apart(self):
        # (what the registry said, its answer, check recorded, whether a registry answered)
        cases = [
            ('not_found', None, 'vanished', True),  # a first "does not exist" waits for a second answer (see LostLegitimateDomainsTest)
            ('ok', '', 'no_date', True),       # a record exists but gives no expiry date
            ('unsupported', None, 'unsupported', False),
            ('error', None, 'unreachable', False),
        ]
        for status, answer, expected, answered in cases:
            with self.subTest(status=status):
                LegitimateDomain.objects.all().delete()  # one domain per case: a pass handles all of them
                LegitimateDomain.objects.create(domain_name='case.example')
                self._run(status, rdap_answer=answer)
                domain = self._get('case.example')
                self.assertEqual(domain.expiry_check, expected)
                self.assertEqual(domain.expiry_checked_at is not None, answered)

    def test_a_pass_that_changes_no_date_writes_no_timeline_event(self):
        from datetime import date
        from timeline.models import TimelineEvent
        LegitimateDomain.objects.create(domain_name='quiet.example', expiry=date(2027, 11, 7))
        before = TimelineEvent.objects.count()
        for _ in range(3):
            self._run('ok', rdap_answer='2027-11-07')
        self.assertEqual(TimelineEvent.objects.count(), before)


class ExpiryAlertsTest(TestCase):
    """The notifications about the expiry date of a legitimate domain: when they go out, once, and never by surprise."""

    def setUp(self):
        from datetime import timedelta
        self.today = timezone.now().date()
        self.timedelta = timedelta

    def _domain(self, days, **extra):
        values = dict(domain_name='alert.example', expiry=self.today + self.timedelta(days=days), expiry_source='RDAP',
                      expiry_check='ok', expiry_checked_at=timezone.now())
        values.update(extra)
        return LegitimateDomain.objects.create(**values)

    def _notify(self, domain):
        from common.utils import expiry_alerts
        with patch('common.utils.expiry_alerts._send', return_value=True) as send:
            return expiry_alerts.notify_expiring(domain), send

    def test_a_confirmed_date_within_thirty_days_notifies_once(self):
        domain = self._domain(12)
        sent, send = self._notify(domain)
        self.assertTrue(sent)
        self.assertEqual(send.call_args.args[0], 'legitimate_domain_expiring')
        self.assertEqual(send.call_args.args[1]['days_text'], 'in 12 days')
        self.assertEqual(LegitimateDomain.objects.get(pk=domain.pk).expiry_alerted, domain.expiry)
        sent_again, send_again = self._notify(LegitimateDomain.objects.get(pk=domain.pk))
        self.assertFalse(sent_again)
        send_again.assert_not_called()

    def test_a_renewal_can_notify_again(self):
        domain = self._domain(12)
        self._notify(domain)
        domain = LegitimateDomain.objects.get(pk=domain.pk)
        domain.expiry = self.today + self.timedelta(days=5)  # a new date
        sent, _ = self._notify(domain)
        self.assertTrue(sent)

    def test_nothing_goes_out_when_the_date_is_far_past_unconfirmed_or_empty(self):
        cases = {
            'far': self._domain(31),
            'past': self._domain(-1, domain_name='past.example'),
            'whois': self._domain(10, domain_name='whois.example', expiry_source='WHOIS'),
            'manual': self._domain(10, domain_name='manual.example', expiry_source='manual', expiry_check=None),
            'stale': self._domain(10, domain_name='stale.example',
                                  expiry_checked_at=timezone.now() - self.timedelta(days=8)),
            'empty': LegitimateDomain.objects.create(domain_name='empty.example'),
        }
        for name, domain in cases.items():
            with self.subTest(case=name):
                sent, send = self._notify(domain)
                self.assertFalse(sent)
                send.assert_not_called()

    def test_the_last_day_counts_and_so_does_today(self):
        for days in (0, 30):
            with self.subTest(days=days):
                sent, _ = self._notify(self._domain(days, domain_name=f'd{days}.example'))
                self.assertTrue(sent)

    def test_with_every_channel_off_nothing_is_marked_so_a_later_switch_still_alerts(self):
        from common.utils import expiry_alerts
        domain = self._domain(12)
        with patch('connectors.notifications.is_enabled', return_value=False), \
                patch('common.utils.send_slack_messages.send_slack_message') as slack:
            self.assertFalse(expiry_alerts.notify_expiring(domain))
        slack.assert_not_called()
        self.assertIsNone(LegitimateDomain.objects.get(pk=domain.pk).expiry_alerted)

    def test_a_channel_that_fails_does_not_stop_the_next_one(self):
        from common.utils import expiry_alerts
        domain = self._domain(12)
        with patch('connectors.notifications.is_enabled', return_value=True), \
                patch('common.utils.send_slack_messages.send_slack_message', side_effect=RuntimeError('down')), \
                patch('common.utils.send_citadel_messages.send_citadel_message') as citadel, \
                patch('common.utils.send_email_notifications.send_email_notifications'), \
                patch('connectors.core.get_slack_config', return_value={'channel': 'c'}), \
                patch('connectors.core.get_citadel_config', return_value={'room_id': 'r'}):
            self.assertTrue(expiry_alerts.notify_expiring(domain))
        citadel.assert_called_once()

    def test_the_regression_message_says_whether_the_domain_now_shows_as_expired(self):
        from common.utils import expiry_alerts
        domain = self._domain(-3)
        ctx = expiry_alerts.regression_context(domain, self.today + self.timedelta(days=200), self.today)
        self.assertEqual(ctx['status_text'], 'Expired')
        self.assertEqual(ctx['domain_name_sanitized'], 'alert[.]example')

    def test_both_notifications_are_off_by_default(self):
        from connectors.notifications import is_enabled
        for type_id in ('legitimate_domain_expiring', 'legitimate_domain_expiry_regression'):
            for channel in ('slack', 'citadel', 'email'):
                self.assertFalse(is_enabled(type_id, channel))


class ExpiryAlertsInTheJobTest(TestCase):
    """What the scheduled job hands to the notifications."""

    def _run(self, rdap_answer):
        from common.core import update_legitimate_domains_rdap_data
        with patch('common.core.close_old_connections'), patch('common.utils.rdap.RDAPDiscovery') as rdap:
            rdap.return_value.status = 'ok'
            rdap.return_value.fetch_rdap_data.return_value = True
            rdap.return_value.get_expiration_date.return_value = rdap_answer
            rdap.return_value.get_registration_date.return_value = None
            update_legitimate_domains_rdap_data()

    def test_a_domain_the_registry_says_is_close_to_expiry_notifies(self):
        from datetime import timedelta
        today = timezone.now().date()
        LegitimateDomain.objects.create(domain_name='soon.example')
        with patch('common.utils.expiry_alerts._send', return_value=True) as send:
            self._run((today + timedelta(days=9)).isoformat())
        self.assertEqual([c.args[0] for c in send.call_args_list], ['legitimate_domain_expiring'])

    def test_a_date_moved_earlier_twice_notifies_the_regression_only_at_the_second_answer(self):
        from datetime import timedelta
        today = timezone.now().date()
        LegitimateDomain.objects.create(domain_name='back.example', expiry=today + timedelta(days=300))
        earlier = (today + timedelta(days=100)).isoformat()
        with patch('common.utils.expiry_alerts._send', return_value=True) as send:
            self._run(earlier)
            send.assert_not_called()  # the first answer only waits
            self._run(earlier)
        self.assertEqual([c.args[0] for c in send.call_args_list], ['legitimate_domain_expiry_regression'])
        self.assertEqual(send.call_args.args[1]['old_expiry'], (today + timedelta(days=300)).isoformat())

    def test_a_failing_notification_does_not_stop_the_job(self):
        from datetime import timedelta
        today = timezone.now().date()
        LegitimateDomain.objects.create(domain_name='one.example')
        LegitimateDomain.objects.create(domain_name='two.example')
        with patch('common.utils.expiry_alerts._send', side_effect=RuntimeError('boom')):
            self._run((today + timedelta(days=9)).isoformat())
        for name in ('one.example', 'two.example'):
            self.assertIsNotNone(LegitimateDomain.objects.get(domain_name=name).expiry)


class RegistrationActionsTest(APITestCase):
    """A domain Watcher follows that the registry stops knowing goes to Pending actions, and approving does the move."""

    def setUp(self):
        self.user = User.objects.create_superuser(username='registrar_pa', password='testpass123')
        _, token = AuthToken.objects.create(self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token}')

    def _legit_pass(self, status='not_found', expiry='2027-05-05'):
        from common.core import update_legitimate_domains_rdap_data
        with patch('common.core.close_old_connections'), patch('common.utils.rdap.RDAPDiscovery') as rdap:
            rdap.return_value.status = status
            rdap.return_value.fetch_rdap_data.return_value = status == 'ok'
            rdap.return_value.get_expiration_date.return_value = expiry
            rdap.return_value.get_registration_date.return_value = None
            update_legitimate_domains_rdap_data()

    def _queued(self, action_type):
        from common.models import PendingAction
        return list(PendingAction.objects.filter(action_type=action_type, status='pending'))

    def _approve(self, pa):
        response = self.client.post(f'/api/common/pending_actions/{pa.pk}/approve/')
        self.assertEqual(response.status_code, 200, response.data)

    # --- a legitimate domain that is lost ---

    def test_a_registered_legitimate_domain_the_registry_no_longer_knows_is_queued_at_the_second_answer(self):
        domain = LegitimateDomain.objects.create(domain_name='lost.example', expiry_check='ok', expiry_source='RDAP')
        self._legit_pass()
        self.assertEqual(self._queued('legitimate_domain_lost'), [])  # one answer is not enough
        self.assertEqual(LegitimateDomain.objects.get(pk=domain.pk).expiry_check, 'vanished')
        self._legit_pass()
        queued = self._queued('legitimate_domain_lost')
        self.assertEqual(len(queued), 1)
        self.assertEqual(queued[0].metadata['domain_name'], 'lost.example')
        self.assertEqual(LegitimateDomain.objects.get(pk=domain.pk).expiry_check, 'not_registered')

    def test_it_is_queued_once_whatever_the_number_of_passes(self):
        LegitimateDomain.objects.create(domain_name='lost.example', expiry_check='ok', expiry_source='RDAP')
        LegitimateDomain.objects.create(domain_name='never.example')
        LegitimateDomain.objects.create(domain_name='typed.example', expiry_source='manual')
        for _ in range(4):
            self._legit_pass()
        # A domain never found is a lost one too (see LostLegitimateDomainsTest): one action each, however many passes
        self.assertEqual(sorted(pa.metadata['domain_name'] for pa in self._queued('legitimate_domain_lost')),
                         ['lost.example', 'never.example', 'typed.example'])

    def test_a_registry_that_answers_again_between_the_two_cancels_the_first(self):
        domain = LegitimateDomain.objects.create(domain_name='flaky.example', expiry_check='ok', expiry_source='RDAP')
        self._legit_pass()
        self._legit_pass(status='ok')
        self.assertEqual(LegitimateDomain.objects.get(pk=domain.pk).expiry_check, 'ok')
        self._legit_pass()
        self.assertEqual(self._queued('legitimate_domain_lost'), [])

    def test_approving_moves_a_lost_domain_to_website_monitoring(self):
        from site_monitoring.models import Site
        LegitimateDomain.objects.create(domain_name='lost.example', expiry_check='ok', expiry_source='RDAP', ticket_id='T-7')
        self._legit_pass()
        self._legit_pass()
        self._approve(self._queued('legitimate_domain_lost')[0])
        self.assertFalse(LegitimateDomain.objects.filter(domain_name='lost.example').exists())
        site = Site.objects.get(domain_name='lost.example')
        self.assertEqual((site.legitimacy, site.ticket_id, site.domain_expiry_check), (4, 'T-7', 'not_registered'))

    def test_approving_does_nothing_when_the_domain_is_registered_again(self):
        from site_monitoring.models import Site
        LegitimateDomain.objects.create(domain_name='back.example', expiry_check='ok', expiry_source='RDAP')
        self._legit_pass()
        self._legit_pass()
        pa = self._queued('legitimate_domain_lost')[0]
        self._legit_pass(status='ok')  # the registry knows it again before anyone decides
        self._approve(pa)
        self.assertTrue(LegitimateDomain.objects.filter(domain_name='back.example').exists())
        self.assertFalse(Site.objects.filter(domain_name='back.example').exists())

    def test_rejecting_keeps_the_domain(self):
        LegitimateDomain.objects.create(domain_name='lost.example', expiry_check='ok', expiry_source='RDAP')
        self._legit_pass()
        self._legit_pass()
        pa = self._queued('legitimate_domain_lost')[0]
        response = self.client.post(f'/api/common/pending_actions/{pa.pk}/reject/')
        self.assertEqual(response.status_code, 200)
        self.assertTrue(LegitimateDomain.objects.filter(domain_name='lost.example').exists())

    def test_a_lost_domain_already_in_website_monitoring_is_not_duplicated(self):
        from site_monitoring.models import Site
        LegitimateDomain.objects.create(domain_name='twice.example', expiry_check='ok', expiry_source='RDAP')
        Site.objects.create(domain_name='twice.example', legitimacy=6)
        self._legit_pass()
        self._legit_pass()
        self._approve(self._queued('legitimate_domain_lost')[0])
        self.assertEqual(Site.objects.filter(domain_name='twice.example').count(), 1)
        self.assertEqual(Site.objects.get(domain_name='twice.example').legitimacy, 6)  # left as it was
        self.assertFalse(LegitimateDomain.objects.filter(domain_name='twice.example').exists())

    # --- a monitored website whose domain is now available ---

    def _site_dropped(self, name, legitimacy):
        from site_monitoring.models import Site
        from site_monitoring.core import perform_site_rdap_lookup
        site = Site.objects.create(domain_name=name, registrar='Gandi', legitimacy=legitimacy, domain_expiry_check='ok')
        for _ in range(2):
            with patch('site_monitoring.core.RDAPDiscovery') as rdap, \
                    patch('common.utils.expiry_alerts._send', return_value=True):
                rdap.return_value.status = 'not_found'
                rdap.return_value.fetch_rdap_data.return_value = False
                perform_site_rdap_lookup(site)
        site.refresh_from_db()
        return site

    def test_a_dropped_site_domain_is_queued_and_approving_moves_its_legitimacy(self):
        for before, after in ((5, 6), (3, 4)):
            with self.subTest(level=before):
                site = self._site_dropped(f'dropped{before}.com', before)
                queued = [pa for pa in self._queued('site_domain_available') if pa.metadata['site_id'] == site.pk]
                self.assertEqual(len(queued), 1)
                self.assertEqual(queued[0].metadata['new_legitimacy'], after)
                self.assertEqual(site.legitimacy, before)  # nothing changes until someone approves
                self._approve(queued[0])
                site.refresh_from_db()
                self.assertEqual(site.legitimacy, after)

    def test_a_level_without_an_available_twin_is_only_acknowledged(self):
        site = self._site_dropped('mild.com', 2)
        pa = [pa for pa in self._queued('site_domain_available') if pa.metadata['site_id'] == site.pk][0]
        self.assertIsNone(pa.metadata['new_legitimacy'])
        self._approve(pa)
        site.refresh_from_db()
        self.assertEqual(site.legitimacy, 2)

    def test_approving_does_nothing_when_the_site_domain_is_registered_again(self):
        site = self._site_dropped('back.com', 5)
        pa = [pa for pa in self._queued('site_domain_available') if pa.metadata['site_id'] == site.pk][0]
        from site_monitoring.models import Site
        Site.objects.filter(pk=site.pk).update(domain_expiry_check='ok')
        self._approve(pa)
        site.refresh_from_db()
        self.assertEqual(site.legitimacy, 5)

    def test_a_site_domain_that_never_was_registered_queues_nothing(self):
        from site_monitoring.models import Site
        from site_monitoring.core import perform_site_rdap_lookup
        site = Site.objects.create(domain_name='never.com', legitimacy=5)
        for _ in range(3):
            with patch('site_monitoring.core.RDAPDiscovery') as rdap:
                rdap.return_value.status = 'not_found'
                rdap.return_value.fetch_rdap_data.return_value = False
                perform_site_rdap_lookup(site)
        self.assertEqual([pa for pa in self._queued('site_domain_available') if pa.metadata['site_id'] == site.pk], [])



class LostLegitimateDomainsTest(APITestCase):
    """A legitimate domain the registry does not know is not ours: it goes to Pending actions, whether it was registered before or not."""

    def setUp(self):
        self.user = User.objects.create_superuser(username='lost_pa', password='testpass123')
        _, token = AuthToken.objects.create(self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token}')

    def _pass(self, status='not_found'):
        from common.core import update_legitimate_domains_rdap_data
        with patch('common.core.close_old_connections'), patch('common.utils.rdap.RDAPDiscovery') as rdap:
            rdap.return_value.status = status
            rdap.return_value.fetch_rdap_data.return_value = status == 'ok'
            rdap.return_value.get_expiration_date.return_value = '2027-05-05'
            rdap.return_value.get_registration_date.return_value = None
            update_legitimate_domains_rdap_data()

    def _queued(self):
        return sorted(pa.metadata['domain_name'] for pa in PendingAction.objects.filter(action_type='legitimate_domain_lost', status='pending'))

    def test_a_name_with_a_subdomain_is_told_apart_from_a_registrable_domain(self):
        from common.utils.rdap import has_subdomain
        for name in ('en.wordpress.com', 'zimbra.free.fr', 'www.example.co.uk', 'a.b.example.org'):
            self.assertTrue(has_subdomain(name), name)
        for name in ('wordpress.com', 'example.co.uk', 'thales.fr', 'lost.example', 'localhost', ''):
            self.assertFalse(has_subdomain(name), name)

    def test_a_domain_never_found_is_queued_at_the_second_answer_like_a_registered_one(self):
        LegitimateDomain.objects.create(domain_name='never-found.com')
        LegitimateDomain.objects.create(domain_name='typed-by-hand.com', expiry_source='manual')
        self._pass()
        self.assertEqual(self._queued(), [])  # one answer is not enough
        self.assertEqual(LegitimateDomain.objects.get(domain_name='never-found.com').expiry_check, 'vanished')
        self._pass()
        self.assertEqual(self._queued(), ['never-found.com', 'typed-by-hand.com'])

    def test_it_is_queued_once_even_after_it_was_rejected(self):
        LegitimateDomain.objects.create(domain_name='kept.com')
        for _ in range(2):
            self._pass()
        pa = PendingAction.objects.get(action_type='legitimate_domain_lost')
        self.assertEqual(self.client.post(f'/api/common/pending_actions/{pa.pk}/reject/').status_code, 200)
        for _ in range(4):
            self._pass()
        self.assertEqual(PendingAction.objects.filter(action_type='legitimate_domain_lost').count(), 1)

    def test_a_subdomain_is_never_queued_because_the_registry_does_not_know_it(self):
        LegitimateDomain.objects.create(domain_name='en.wordpress.com')
        for _ in range(4):
            self._pass()
        self.assertEqual(self._queued(), [])
        self.assertEqual(LegitimateDomain.objects.get().expiry_check, 'subdomain')

    def test_a_registry_that_answers_again_between_the_two_cancels_the_first(self):
        LegitimateDomain.objects.create(domain_name='flaky-never.com')
        self._pass()
        self._pass(status='ok')
        self._pass()
        self.assertEqual(self._queued(), [])

    def test_the_list_and_the_figures_have_a_not_registered_view(self):
        LegitimateDomain.objects.create(domain_name='gone.com', expiry_check='not_registered')
        LegitimateDomain.objects.create(domain_name='here.com', expiry_check='ok', expiry_source='RDAP', expiry_checked_at=timezone.now())
        rows = self.client.get('/api/common/legitimate_domains/?status=not_registered').data['results']
        self.assertEqual([r['domain_name'] for r in rows], ['gone.com'])
        self.assertEqual(self.client.get('/api/common/legitimate_domains/statistics/').data['notRegistered'], 1)

    def test_a_lost_domain_arrives_in_website_monitoring_with_its_comments(self):
        from site_monitoring.models import Site
        from common.utils import registration_actions
        domain = LegitimateDomain.objects.create(domain_name='carried.com', expiry_check='not_registered', comments='Bought for the 2019 campaign')
        bare = LegitimateDomain.objects.create(domain_name='bare.com', expiry_check='not_registered')
        long = LegitimateDomain.objects.create(domain_name='verbose.com', expiry_check='not_registered', comments='y' * 300)
        ids = [registration_actions.queue_domain_lost(d).pk for d in (domain, bare, long)]
        self.client.post('/api/common/pending_actions/resolve/', {'ids': ids, 'decision': 'approve'}, format='json')
        from datetime import date
        reason = f'[{date.today().isoformat()}] Moved from Legitimate Domains: not registered.'
        self.assertEqual(Site.objects.get(domain_name='carried.com').comments, f'{reason}\nBought for the 2019 campaign')
        self.assertEqual(Site.objects.get(domain_name='bare.com').comments, reason)
        # A comment that leaves no room for the line is kept as it is: the text of a person is never cut
        self.assertEqual(Site.objects.get(domain_name='verbose.com').comments, 'y' * 300)

    # --- deciding several at once ---

    def _lost(self, *names):
        from common.utils import registration_actions
        for name in names:
            registration_actions.queue_domain_lost(LegitimateDomain.objects.create(domain_name=name, expiry_check='not_registered'))
        return list(PendingAction.objects.filter(action_type='legitimate_domain_lost').order_by('id').values_list('id', flat=True))

    def test_several_lost_domains_are_approved_in_one_request(self):
        from site_monitoring.models import Site
        ids = self._lost('one-lost.com', 'two-lost.com', 'three-lost.com')
        response = self.client.post('/api/common/pending_actions/resolve/', {'ids': ids, 'decision': 'approve'}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data, {'succeeded': 3, 'failed': []})
        self.assertEqual(sorted(Site.objects.values_list('domain_name', flat=True)), ['one-lost.com', 'three-lost.com', 'two-lost.com'])
        self.assertEqual(LegitimateDomain.objects.count(), 0)
        self.assertEqual(PendingAction.objects.filter(status='approved').count(), 3)

    def test_several_are_rejected_without_doing_anything(self):
        ids = self._lost('keep-one.com', 'keep-two.com')
        response = self.client.post('/api/common/pending_actions/resolve/', {'ids': ids, 'decision': 'reject'}, format='json')
        self.assertEqual(response.data['succeeded'], 2)
        self.assertEqual(LegitimateDomain.objects.count(), 2)
        self.assertEqual(PendingAction.objects.filter(status='rejected').count(), 2)

    def test_one_that_cannot_be_decided_is_reported_and_the_others_still_go(self):
        ids = self._lost('go-one.com', 'go-two.com')
        PendingAction.objects.filter(pk=ids[0]).update(status='rejected')
        response = self.client.post('/api/common/pending_actions/resolve/', {'ids': ids + [999999], 'decision': 'approve'}, format='json')
        self.assertEqual(response.data['succeeded'], 1)
        self.assertEqual(sorted(f['id'] for f in response.data['failed']), sorted([ids[0], 999999]))

    def test_the_request_is_checked(self):
        for body in ({'ids': [1], 'decision': 'maybe'}, {'ids': [], 'decision': 'approve'}, {'ids': 'x', 'decision': 'approve'},
                     {'ids': list(range(1, 502)), 'decision': 'approve'}):
            self.assertEqual(self.client.post('/api/common/pending_actions/resolve/', body, format='json').status_code, 400, body)
        self.client.credentials()
        self.assertIn(self.client.post('/api/common/pending_actions/resolve/', {'ids': [1], 'decision': 'approve'}, format='json').status_code, (401, 403))


class QueueLostDomainsCommandTest(TestCase):
    """The domains found 'not registered' before they were queued: listed first, queued only on request."""

    def _run(self, *args):
        from io import StringIO
        from django.core.management import call_command
        out = StringIO()
        call_command('queue_lost_domains', *args, stdout=out)
        return out.getvalue()

    def setUp(self):
        LegitimateDomain.objects.create(domain_name='lost-one.com', expiry_check='not_registered', ticket_id='T-1')
        LegitimateDomain.objects.create(domain_name='lost-two.com', expiry_check='not_registered')
        LegitimateDomain.objects.create(domain_name='en.wordpress.com', expiry_check='not_registered')
        LegitimateDomain.objects.create(domain_name='fine.com', expiry_check='ok')

    def test_it_only_lists_without_apply(self):
        text = self._run()
        self.assertIn('lost-one.com\tT-1', text)
        self.assertIn('lost-two.com', text)
        self.assertNotIn('en.wordpress.com', text)
        self.assertNotIn('fine.com', text)
        self.assertEqual(PendingAction.objects.count(), 0)

    def test_apply_queues_each_once_and_leaves_alone_the_ones_already_decided(self):
        from common.utils import registration_actions
        registration_actions.queue_domain_lost(LegitimateDomain.objects.get(domain_name='lost-two.com'))
        PendingAction.objects.update(status='rejected')  # someone decided: it is not asked again
        self._run('--apply')
        self.assertEqual(sorted(PendingAction.objects.filter(status='pending').values_list('metadata__domain_name', flat=True)), ['lost-one.com'])
        self._run('--apply')
        self.assertEqual(PendingAction.objects.count(), 2)


class LegitimateDomainsSslTest(TestCase):
    """The certificates of the legitimate domains are read, side by side, and only written when they change."""

    def test_the_dates_are_kept_and_a_domain_the_registry_does_not_know_is_left_out(self):
        from common.utils import ssl_checker
        LegitimateDomain.objects.create(domain_name='a.com')
        LegitimateDomain.objects.create(domain_name='b.com', ssl_expiry='2026-12-01')
        LegitimateDomain.objects.create(domain_name='c.com', ssl_expiry='2026-01-01')
        LegitimateDomain.objects.create(domain_name='gone.com', expiry_check='not_registered')
        answers = {'a.com': '2027-03-03', 'b.com': '2026-12-01', 'c.com': None, 'gone.com': '2030-01-01'}
        with patch('django.db.close_old_connections'), \
                patch.object(ssl_checker, '_certificate_expiry', side_effect=lambda name: answers[name]) as read:
            checked, updated = ssl_checker.update_legitimate_domains_ssl_certificates(workers=3)
        self.assertEqual((checked, updated), (2, 1))  # c.com did not answer, gone.com is not asked
        self.assertEqual(read.call_count, 3)
        rows = {d.domain_name: str(d.ssl_expiry) for d in LegitimateDomain.objects.all()}
        self.assertEqual(rows, {'a.com': '2027-03-03', 'b.com': '2026-12-01', 'c.com': '2026-01-01', 'gone.com': 'None'})

    def test_a_certificate_that_cannot_be_read_gives_none(self):
        from common.utils import ssl_checker
        with patch.object(ssl_checker, 'SSLCertificateChecker', side_effect=OSError('refused')):
            self.assertIsNone(ssl_checker._certificate_expiry('nowhere.example'))

    def test_the_job_counts_both_kinds(self):
        from common.core import update_all_ssl_certificates
        with patch('common.core.close_old_connections'), \
                patch('common.utils.ssl_checker.update_all_sites_ssl_certificates', return_value=5), \
                patch('common.utils.ssl_checker.update_legitimate_domains_ssl_certificates', return_value=(7, 3)) as domains:
            update_all_ssl_certificates()
        domains.assert_called_once()


class SiteSubdomainTest(TestCase):
    """The registry does not know a name with a subdomain: a monitored website under one is not 'available' because of it."""

    def test_a_site_under_a_subdomain_is_not_queued_as_available(self):
        from site_monitoring.models import Site
        from site_monitoring.core import perform_site_rdap_lookup
        site = Site.objects.create(domain_name='www.dropped-example.com', legitimacy=5, domain_expiry_check='ok', domain_expiry_source='RDAP')
        for _ in range(3):
            with patch('site_monitoring.core.RDAPDiscovery') as rdap:
                rdap.return_value.status = 'not_found'
                rdap.return_value.fetch_rdap_data.return_value = False
                perform_site_rdap_lookup(site)
        site.refresh_from_db()
        self.assertEqual(site.domain_expiry_check, 'subdomain')
        self.assertEqual(PendingAction.objects.filter(action_type='site_domain_available').count(), 0)


class AutoCommentsTest(APITestCase):
    """The lines Watcher writes by itself in the comments: dated, above what a person wrote, never cutting it."""

    def setUp(self):
        from datetime import date
        self.today = date.today().isoformat()
        self.user = User.objects.create_superuser(username='auto_comments', password='testpass123')
        _, token = AuthToken.objects.create(self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token}')

    # --- the helper ---

    def test_a_line_is_dated_and_goes_above_what_was_written(self):
        from common.utils import auto_comments
        self.assertEqual(auto_comments.line('Moved.'), f'[{self.today}] Moved.')
        self.assertEqual(auto_comments.combine('Moved.', ''), f'[{self.today}] Moved.')
        self.assertEqual(auto_comments.combine('Moved.', 'A note.'), f'[{self.today}] Moved.\nA note.')

    def test_what_does_not_fit_is_not_written_and_the_text_is_never_cut(self):
        from common.utils import auto_comments
        text = 'x' * 290
        self.assertEqual(auto_comments.combine('Moved from somewhere.', text), text)
        self.assertEqual(auto_comments.join('First', 'y' * 300), 'First')
        self.assertEqual(auto_comments.join('First', 'Second'), 'First\nSecond')

    def test_a_note_is_written_on_what_the_object_has_now_not_on_what_a_job_read_before(self):
        from common.utils import auto_comments
        from site_monitoring.models import Site
        site = Site.objects.create(domain_name='fresh-note.com', comments='first')
        Site.objects.filter(pk=site.pk).update(comments='written meanwhile by a person')  # `site` is now out of date
        self.assertTrue(auto_comments.add_note(Site, site.pk, 'Note.'))
        self.assertEqual(Site.objects.get(pk=site.pk).comments, f'[{self.today}] Note.\nwritten meanwhile by a person')
        Site.objects.filter(pk=site.pk).update(comments='z' * 300)
        self.assertFalse(auto_comments.add_note(Site, site.pk, 'No room.'))
        self.assertEqual(Site.objects.get(pk=site.pk).comments, 'z' * 300)

    # --- the paths ---

    def test_a_udrp_win_carries_the_comments_of_the_website(self):
        from site_monitoring.models import Site
        from site_monitoring.udrp import transfer_to_legitimate_domains
        site = Site.objects.create(domain_name='won-udrp.com', comments='Phishing kit on the home page')
        self.assertTrue(transfer_to_legitimate_domains(site))
        self.assertEqual(LegitimateDomain.objects.get(domain_name='won-udrp.com').comments,
                         f'[{self.today}] UDRP won (WIPO): moved from Website Monitoring.\nPhishing kit on the home page')

    def test_a_udrp_win_writes_its_line_on_a_domain_that_was_already_there(self):
        from site_monitoring.models import Site
        from site_monitoring.udrp import transfer_to_legitimate_domains
        LegitimateDomain.objects.create(domain_name='already-here.com', comments='Ours since 2012')
        self.assertFalse(transfer_to_legitimate_domains(Site.objects.create(domain_name='already-here.com')))
        self.assertEqual(LegitimateDomain.objects.get().comments, f'[{self.today}] UDRP won (WIPO): moved from Website Monitoring.\nOurs since 2012')

    def test_a_bulk_export_says_where_it_comes_from_and_keeps_the_comments_of_the_website(self):
        from site_monitoring.models import Site
        site = Site.objects.create(domain_name='exported.com', legitimacy=5, comments='Seen in March')
        response = self.client.post('/api/site_monitoring/site/bulk_export_legitimate/', {'ids': [site.pk]}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(LegitimateDomain.objects.get(domain_name='exported.com').comments,
                         f'[{self.today}] Exported from Website Monitoring - Original legitimacy: Malicious (registered)\nSeen in March')

    def test_an_export_with_its_own_comment_keeps_it_and_the_comments_of_the_website_only_when_they_fit(self):
        from site_monitoring.models import Site
        short = Site.objects.create(domain_name='short-export.com', comments='Seen in March')
        long = Site.objects.create(domain_name='long-export.com', comments='w' * 300)
        self.client.post('/api/site_monitoring/site/bulk_export_legitimate/', {'ids': [short.pk, long.pk], 'comment': 'Typed by hand'}, format='json')
        self.assertEqual(LegitimateDomain.objects.get(domain_name='short-export.com').comments, 'Typed by hand\nSeen in March')
        self.assertEqual(LegitimateDomain.objects.get(domain_name='long-export.com').comments, 'Typed by hand')

    def test_a_site_marked_available_says_so(self):
        from site_monitoring.models import Site
        from common.utils import registration_actions
        site = Site.objects.create(domain_name='gone-available.com', legitimacy=5, domain_expiry_check='not_registered', comments='Kept an eye on it')
        pa = registration_actions.queue_site_available(site)
        self.client.post(f'/api/common/pending_actions/{pa.pk}/approve/')
        site.refresh_from_db()
        self.assertEqual(site.legitimacy, 6)
        self.assertEqual(site.comments, f'[{self.today}] Legitimacy set to "Malicious (available/disabled)": the domain is not registered.\nKept an eye on it')

    def test_the_lookup_that_raises_a_legitimacy_says_so_without_erasing_a_comment_written_meanwhile(self):
        from site_monitoring.models import Site
        from site_monitoring.core import perform_site_rdap_lookup
        site = Site.objects.create(domain_name='registered-now.com', legitimacy=6)
        Site.objects.filter(pk=site.pk).update(comments='Written while the job ran')  # `site` is the copy read before
        with patch('site_monitoring.core.RDAPDiscovery') as rdap:
            rdap.return_value.status = 'ok'
            rdap.return_value.fetch_rdap_data.return_value = True
            rdap.return_value.get_registrar.return_value = 'Gandi'
            rdap.return_value.get_expiration_date.return_value = '2028-01-01'
            rdap.return_value.get_registration_date.return_value = None
            perform_site_rdap_lookup(site)
        site.refresh_from_db()
        self.assertEqual(site.legitimacy, 5)
        self.assertEqual(site.comments, f'[{self.today}] Legitimacy raised to "Malicious (registered)": the domain is registered.\nWritten while the job ran')


# The scheduled jobs: their passages are kept, and the Scheduled jobs page and the headers of the modules read them
import logging as _logging
from unittest import mock as _mock

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger

from common.models import JobRun
from common.utils import job_log


def _demo_job():
    job_log.job_count('items', 3)
    job_log.job_count('nothing', 0)


_logged_demo = job_log.logged_job('Demo job', _logging.getLogger('watcher.tests'))(_demo_job)


class JobRunTest(TestCase):
    def test_a_logged_job_keeps_its_pass(self):
        _logged_demo()
        # Only this job: a real scheduled job may run in this process while the tests do
        run = JobRun.objects.get(job='common._demo_job')
        self.assertEqual(run.job, 'common._demo_job')
        self.assertEqual(run.label, 'Demo job')
        self.assertEqual(run.counts, {'items': 3})  # what is zero is not kept
        self.assertFalse(run.failed)
        self.assertEqual(run.error, '')
        self.assertGreaterEqual(run.duration, 0)

    def test_a_failure_is_kept_with_its_cause_and_still_raised(self):
        @job_log.logged_job('Failing job', _logging.getLogger('watcher.tests'))
        def broken():
            raise ValueError('boom')
        with self.assertLogs('watcher.tests', level='ERROR'):
            with self.assertRaises(ValueError):
                broken()
        run = JobRun.objects.get(job='common.broken')
        self.assertTrue(run.failed)
        self.assertEqual(run.error, 'ValueError: boom')

    def test_only_the_last_passes_of_a_job_are_kept(self):
        with _mock.patch.object(JobRun, 'KEEP', 3):
            for _ in range(5):
                _logged_demo()
        self.assertEqual(JobRun.objects.filter(job='common._demo_job').count(), 3)

    def test_the_jobs_are_not_mixed_up(self):
        _logged_demo()
        JobRun.objects.create(job='cyber_watch.other', label='Other', started_at=timezone.now(), duration=1)
        self.assertEqual(JobRun.objects.filter(job='common._demo_job').count(), 1)
        self.assertEqual(JobRun.objects.filter(job__in=['common._demo_job', 'cyber_watch.other']).count(), 2)

    def test_a_job_is_running_from_its_start_to_its_end(self):
        seen = {}

        @job_log.logged_job('Watching job', _logging.getLogger('watcher.tests'))
        def watching():
            seen['during'] = dict(job_log.running_jobs())
        watching()
        self.assertIn('common.watching', seen['during'])
        self.assertNotIn('common.watching', job_log.running_jobs())

    def test_a_pass_that_cannot_be_kept_never_breaks_the_job(self):
        with _mock.patch.object(JobRun.objects, 'create', side_effect=RuntimeError('database gone')):
            _logged_demo()  # no exception
        self.assertEqual(JobRun.objects.filter(job='common._demo_job').count(), 0)

    def test_schedules_are_told_in_words(self):
        said = job_log.describe_schedule
        self.assertEqual(said(IntervalTrigger(minutes=30)), 'every 30 minutes')
        self.assertEqual(said(IntervalTrigger(hours=1)), 'every hour')
        self.assertEqual(said(CronTrigger(day_of_week='mon-sun', minute='*/15')), 'every 15 minutes')
        self.assertEqual(said(CronTrigger(day_of_week='mon-sun', minute='3-59/15')), 'every 15 minutes')
        self.assertEqual(said(CronTrigger(day_of_week='mon-sun', minute='11-59/30')), 'every 30 minutes')
        self.assertEqual(said(CronTrigger(day_of_week='mon-sun', hour='*/6')), 'every 6 hours')
        self.assertEqual(said(CronTrigger(day_of_week='mon-sun', hour='*/1')), 'every hour')
        self.assertEqual(said(CronTrigger(day_of_week='mon-sun', hour=8, minute=0)), 'every day at 08:00')
        self.assertEqual(said(CronTrigger(day_of_week='mon', hour=6, minute=0)), 'every Monday at 06:00')


class ScheduledJobsApiTest(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser('boss', 'boss@example.com', 'pw')
        self.user = User.objects.create_user('analyst', 'a@example.com', 'pw')
        self.scheduler = BackgroundScheduler()  # never started: its jobs are pending, which is enough to list them
        self.scheduler.add_job(_logged_demo, 'interval', minutes=30, id='demo_job')
        job_log.register_scheduler(self.scheduler)
        self.addCleanup(lambda: job_log._schedulers.remove(self.scheduler))

    def test_only_a_superuser_sees_the_jobs(self):
        self.assertIn(self.client.get('/api/common/scheduled_jobs/').status_code, (401, 403))
        self.client.force_authenticate(self.user)
        self.assertEqual(self.client.get('/api/common/scheduled_jobs/').status_code, 403)
        self.client.force_authenticate(self.admin)
        self.assertEqual(self.client.get('/api/common/scheduled_jobs/').status_code, 200)

    def test_a_job_that_never_reported_is_listed_without_a_last_pass(self):
        self.client.force_authenticate(self.admin)
        job = next(j for j in self.client.get('/api/common/scheduled_jobs/').data['jobs'] if j['key'] == 'common._demo_job')
        self.assertEqual((job['module'], job['schedule'], job['reported'], job['last'], job['running']),
                         ('Legitimate Domains', 'every 30 minutes', False, None, False))
        # It keeps summaries, so it is known by its name even before its first pass
        self.assertEqual((job['tracked'], job['label']), (True, 'Demo job'))

    def test_the_last_passes_of_a_job_are_told(self):
        _logged_demo()
        _logged_demo()
        self.client.force_authenticate(self.admin)
        job = next(j for j in self.client.get('/api/common/scheduled_jobs/').data['jobs'] if j['key'] == 'common._demo_job')
        self.assertTrue(job['reported'])
        self.assertEqual(job['label'], 'Demo job')
        self.assertEqual(job['last']['counts'], {'items': 3})
        self.assertFalse(job['last']['failed'])
        self.assertEqual(len(job['recent']), 2)
        self.assertIsNotNone(job['average_duration'])


class OverviewApiTest(APITestCase):
    """One answer for the whole Overview, under the permissions of each module."""

    URL = '/api/overview/'

    def setUp(self):
        now = timezone.now()
        for n in range(7):
            CVEAlert.objects.create(cve_id=f'CVE-2026-80{n:02d}', severity='CRITICAL', cvss_score=9.5 - n / 10, published=now)
        group = RansomwareGroup.objects.create(name='overviewgroup')
        RansomwareVictim.objects.create(group=group, victim_name='Corp O', country='FR', sector='Energy', attacked_at=now)
        self.analyst = User.objects.create_user('overview_analyst', 'o@example.com', 'pw')

    def test_a_visitor_gets_the_public_parts_only(self):
        data = self.client.get(self.URL).data
        self.assertEqual(set(data), {'threats', 'cyber', 'domains', 'graph', 'brief', 'topCves', 'pending', 'leaks', 'dns', 'sites', 'latest'})
        self.assertIsNotNone(data['threats'])
        self.assertIsNotNone(data['cyber'])
        self.assertIsNotNone(data['domains'])
        self.assertEqual(len(data['topCves']), 5)
        for private in ('leaks', 'dns', 'sites', 'pending'):
            self.assertIsNone(data[private], private)
        self.assertEqual(data['latest'], {'cves': [], 'victims': [], 'leaks': [], 'threats': [], 'changes': []})
        self.assertEqual({row['hits_count'] for row in data['topCves']}, {0})

    def test_a_signed_in_person_gets_everything(self):
        self.client.force_authenticate(self.analyst)
        data = self.client.get(self.URL).data
        # No right on the modules themselves: the figures need an account only
        self.assertIsNotNone(data['leaks'])
        self.assertIsNotNone(data['dns'])
        self.assertIsNotNone(data['sites'])
        self.assertEqual(data['pending'], {'count': 0})
        self.assertEqual(len(data['latest']['cves']), 7)
        self.assertEqual(len(data['latest']['victims']), 1)

    def test_the_top_cves_are_the_best_scored_first(self):
        scores = [row['cvss_score'] for row in self.client.get(self.URL).data['topCves']]
        self.assertEqual(scores, sorted(scores, reverse=True))

    def test_a_module_that_fails_leaves_the_rest(self):
        with patch('threats_watcher.api.SourceViewSet.get_statistics', side_effect=RuntimeError('boom')):
            response = self.client.get(self.URL)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIsNone(response.data['threats'])
        self.assertIsNotNone(response.data['cyber'])

    def test_it_changes_nothing(self):
        self.assertEqual(self.client.post(self.URL, {}).status_code, status.HTTP_405_METHOD_NOT_ALLOWED)


class HistoryRetentionTest(TestCase):
    """The AI summaries and the activity journal are kept for a while, not for ever; the latest summary of each kind stays."""

    def _summary(self, kind, days_ago, keywords=''):
        from threats_watcher.models import Summary
        summary = Summary.objects.create(type=kind, keywords=keywords, summary_text='x')
        Summary.objects.filter(pk=summary.pk).update(created_at=timezone.now() - timedelta(days=days_ago))
        return summary

    def _event(self, days_ago):
        from django.contrib.contenttypes.models import ContentType
        from timeline.models import TimelineEvent
        event = TimelineEvent.objects.create(content_type=ContentType.objects.get_for_model(User), object_id=1, action='created')
        TimelineEvent.objects.filter(pk=event.pk).update(timestamp=timezone.now() - timedelta(days=days_ago))

    @override_settings(SUMMARY_RETENTION_DAYS=90, TIMELINE_RETENTION_DAYS=365)
    def test_old_summaries_go_but_the_latest_of_each_kind_stays(self):
        from threats_watcher.models import Summary
        self._summary('weekly_summary', 200)
        self._summary('weekly_summary', 150)
        kept_weekly = self._summary('weekly_summary', 100)
        self._summary('breaking_news', 120)
        recent = self._summary('breaking_news', 5)
        self._summary('trendy_word_summary', 300, keywords='lockbit')
        self._summary('trendy_word_summary', 250, keywords='lockbit')
        from common.core import purge_history
        counts = purge_history()
        self.assertEqual(counts['summaries'], 4)
        self.assertEqual(set(Summary.objects.values_list('pk', flat=True)), {kept_weekly.pk, recent.pk, Summary.objects.get(keywords='lockbit').pk})

    @override_settings(SUMMARY_RETENTION_DAYS=90, TIMELINE_RETENTION_DAYS=365)
    def test_old_activity_goes_and_recent_stays(self):
        from timeline.models import TimelineEvent
        self._event(400)
        self._event(10)
        from common.core import purge_history
        self.assertEqual(purge_history()['timeline'], 1)
        self.assertEqual(TimelineEvent.objects.count(), 1)

    @override_settings(SUMMARY_RETENTION_DAYS=0, TIMELINE_RETENTION_DAYS=0)
    def test_zero_keeps_everything(self):
        from threats_watcher.models import Summary
        from timeline.models import TimelineEvent
        self._summary('weekly_summary', 900)
        self._summary('weekly_summary', 800)
        self._event(2000)
        from common.core import purge_history
        self.assertEqual(purge_history(), {'summaries': 0, 'timeline': 0})
        self.assertEqual((Summary.objects.count(), TimelineEvent.objects.count()), (2, 1))

    @override_settings(SUMMARY_RETENTION_DAYS=90, TIMELINE_RETENTION_DAYS=365)
    def test_dry_run_counts_and_removes_nothing(self):
        from threats_watcher.models import Summary
        self._summary('weekly_summary', 200)
        self._summary('weekly_summary', 150)
        self._event(400)
        from common.core import purge_history
        self.assertEqual(purge_history(dry_run=True), {'summaries': 1, 'timeline': 1})
        self.assertEqual(Summary.objects.count(), 2)


class AdminPagesTest(TestCase):
    """Every page of the admin lists its rows, with its search and its filters: a wrong field fails here, not in front of an admin."""

    APPS = ('accounts', 'common', 'connectors', 'cyber_watch', 'data_leak', 'dns_finder', 'site_monitoring', 'threats_watcher', 'timeline')

    def setUp(self):
        from django.contrib.auth.models import User
        self.client.force_login(User.objects.create_superuser(username='admin-pages', password='pass12345', email='a@a.com'))

    def test_every_changelist_opens_and_searches(self):
        from django.contrib import admin
        from django.urls import reverse
        pages = [model for model in admin.site._registry if model._meta.app_label in self.APPS]
        self.assertGreater(len(pages), 30)
        for model in pages:
            url = reverse(f'admin:{model._meta.app_label}_{model._meta.model_name}_changelist')
            with self.subTest(model=model._meta.label):
                self.assertEqual(self.client.get(url).status_code, 200)
                self.assertEqual(self.client.get(url, {'q': 'x'}).status_code, 200)

    def test_the_alerts_of_a_site_are_filtered_by_type(self):
        response = self.client.get('/admin/site_monitoring/alert/')
        self.assertContains(response, 'By type')
        self.assertEqual(self.client.get('/admin/site_monitoring/alert/', {'type': 'IP'}).status_code, 200)


@patch('common.core._keep_delivery')
@patch('common.core.get_citadel_config', return_value={'room_id': '!room'})
@patch('common.core.get_slack_config', return_value={'channel': 'C1'})
@patch('common.core.is_enabled', return_value=True)
class ChatDigestTest(TestCase):
    """Many alerts of one notification in a job run: one message in Slack and Citadel, the others are untouched."""

    def _run(self, count, type_id='dns_finder', channel='slack', **ctx):
        from common.core import _send_channel
        sent = []
        sample = get_type(type_id).sample()

        @logged_job("Digest job", log)
        def job():
            for i in range(count):
                _send_channel(type_id, channel, type_id, lambda i=i: sent.append(i),
                              context=dict(sample, dns_domain_name_sanitized=f'bad{i}[.]com', **ctx))
        job()
        return sent

    @patch('common.core.send_slack_message')
    def test_from_the_threshold_one_message_lists_the_alerts(self, slack, *_):
        sent = self._run(12)
        self.assertEqual(sent, [])
        self.assertEqual(slack.call_count, 1)
        text = slack.call_args.args[0]
        self.assertIn('*🚨 12 suspicious domains*', text)
        self.assertIn('• bad0[.]com', text)
        self.assertIn('• bad9[.]com', text)
        self.assertNotIn('bad10[.]com', text)
        self.assertIn('… and 2 more', text)
        self.assertIn('Open the alerts in Watcher', text)

    @patch('common.core.send_slack_message')
    def test_below_the_threshold_the_messages_go_one_by_one(self, slack, *_):
        self.assertEqual(self._run(3), [0, 1, 2])
        slack.assert_not_called()

    @override_settings(NOTIFICATION_DIGEST_THRESHOLD=0)
    @patch('common.core.send_slack_message')
    def test_a_threshold_of_zero_never_groups(self, slack, *_):
        self.assertEqual(len(self._run(12)), 12)

    @override_settings(NOTIFICATION_DIGEST_THRESHOLD=2)
    @patch('common.core.send_slack_message')
    def test_the_threshold_is_the_setting(self, slack, *_):
        self._run(2)
        self.assertEqual(slack.call_count, 1)

    @patch('common.core.send_citadel_message')
    def test_citadel_gets_html_and_a_plain_text(self, citadel, *_):
        self._run(5, channel='citadel')
        content = citadel.call_args.kwargs['content']
        self.assertEqual(content['format'], 'org.matrix.custom.html')
        self.assertIn('<h4>🚨 5 suspicious domains</h4>', content['formatted_body'])
        self.assertIn('bad4[.]com (example - homoglyph)<br>', content['formatted_body'])
        self.assertNotIn('<', content['body'])
        self.assertIn('bad4[.]com', content['body'])

    def test_a_notification_outside_of_a_job_is_sent_at_once(self, is_enabled, *_):
        from common.core import _send_channel
        sent = []
        _send_channel('dns_finder', 'slack', 'dns_finder', lambda: sent.append(1), context={})
        self.assertEqual(sent, [1])

    def test_a_channel_that_is_off_keeps_nothing(self, is_enabled, *_):
        is_enabled.return_value = False
        self.assertEqual(self._run(12), [])

    @patch('common.core.send_slack_message')
    def test_notifications_that_are_not_grouped_go_one_by_one(self, slack, *_):
        self.assertEqual(len(self._run(12, type_id='data_leak')), 12)

    @patch('common.core.send_slack_message')
    def test_every_grouped_notification_has_a_message(self, slack, *_):
        from connectors.notifications.digest import DIGESTS, render_digest
        for type_id in DIGESTS:
            contexts = [get_type(type_id).sample()] * 4
            for channel in ('slack', 'citadel'):
                with self.subTest(type=type_id, channel=channel):
                    rendered = render_digest(type_id, channel, contexts)
                    text = rendered if channel == 'slack' else rendered[0]
                    self.assertIn('4', text)
                    self.assertIn(' in Watcher', text)


class DnsAlertSourceTest(SimpleTestCase):
    """A suspicious-domain alert says where it comes from (Look-alike, Certificate) on every channel."""

    def _alert(self, source):
        from connectors.notifications.samples import _dns_alert
        alert = _dns_alert()
        alert.source = source
        return alert

    def test_the_email_of_a_look_alike_names_its_source(self):
        from common.mail_template.dns_finder_template import get_dns_finder_template
        self.assertIn('Look-alike', get_dns_finder_template(self._alert('dnstwist')))

    def test_the_email_of_a_certificate_names_its_source(self):
        from common.mail_template.dns_finder_cert_transparency import get_dns_finder_cert_transparency_template
        self.assertIn('Certificate', get_dns_finder_cert_transparency_template(self._alert('certstream_keyword')))

    def test_an_unknown_source_adds_no_line(self):
        from common.mail_template.base import dns_source
        self.assertEqual(dns_source(self._alert('something_else')), '')

    def test_slack_citadel_and_thehive_show_the_source(self):
        ntype = get_type('dns_finder')
        ctx = ntype.sample()
        for channel, expected in (('slack', '*Source:* Look-alike'), ('citadel', '<strong>Source</strong>: Look-alike'),
                                  ('thehive', '| **Source** | Look-alike |')):
            with self.subTest(channel=channel):
                self.assertIn(expected, render_text(ntype, channel, ctx))
        ctx['source_label'] = ''
        self.assertNotIn('Source', render_text(ntype, 'slack', ctx))
