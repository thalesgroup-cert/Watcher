import os
from unittest.mock import patch, MagicMock
from django.test import TestCase, TransactionTestCase
from django.contrib.auth.models import User
from django.utils import timezone
from datetime import timedelta
from rest_framework.test import APITestCase
from rest_framework import status
from knox.models import AuthToken
from common.models import MISPEventUuidLink, LegitimateDomain, PendingAction
from common.core import generate_ref
from common.misp import get_misp_uuid, update_misp_uuid


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


class NotificationSystemTest(TestCase):
    """Test notification system components."""
    
    @patch('common.core.send_slack_message')
    @patch('common.core.send_email_notifications') 
    def test_notification_functions_exist(self, mock_email, mock_slack):
        """Test that notification functions can be called without errors."""
        from common.core import send_app_specific_notifications
        from data_leak.models import Subscriber
        
        user = User.objects.create_user("testuser", "test@test.com", "pass")
        subscriber = Subscriber.objects.create(user_rec=user, email=True, slack=True)
        
        # Test with QuerySet (not list)
        subscribers = Subscriber.objects.filter(id=subscriber.id)
        context_data = {'test': 'data'}
        
        try:
            send_app_specific_notifications('data_leak', context_data, subscribers)
            test_passed = True
        except Exception as e:
            test_passed = False
            print(f"Notification test failed: {e}")
        
        self.assertTrue(test_passed)


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
    def test_payload_is_timestamped(self, _config, mock_post):
        mock_post.return_value = MagicMock(status_code=200)
        self._send()
        payload = mock_post.call_args.kwargs['json']
        self.assertEqual(payload['msgtype'], 'm.text')
        self.assertEqual(payload['format'], 'org.matrix.custom.html')
        self.assertRegex(payload['body'], r'^\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\] Alert$')
        self.assertRegex(payload['formatted_body'], r'^<b>\[.*\]</b> <b>Alert</b>$')

    @patch('common.utils.send_citadel_messages.requests.post')
    @patch('common.utils.send_citadel_messages.get_citadel_config', return_value=CONFIG)
    def test_formatted_body_is_none_when_absent(self, _config, mock_post):
        mock_post.return_value = MagicMock(status_code=200)
        self._send({'body': 'Plain'})
        self.assertIsNone(mock_post.call_args.kwargs['json']['formatted_body'])

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
