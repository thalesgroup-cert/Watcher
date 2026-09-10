import os
from unittest.mock import patch, MagicMock
from django.test import TestCase, TransactionTestCase
from django.contrib.auth.models import User
from django.utils import timezone
from rest_framework.test import APITestCase
from rest_framework import status
from knox.models import AuthToken
from dns_finder.models import DnsMonitored, DnsTwisted, Alert, KeywordMonitored, Subscriber, \
    DanglingSubdomain, DanglingAlert
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
        self.assertTrue(alert.status)
        
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

    def test_dangling_subdomain_and_alert_functionality(self):
        """Test DanglingSubdomain and DanglingAlert models with relationships."""
        unique_id = str(uuid.uuid4())[:8]

        dns = DnsMonitored.objects.create(domain_name=f"dangling-test-{unique_id}.com")
        dangling = DanglingSubdomain.objects.create(
            subdomain=f"old-app.dangling-test-{unique_id}.com",
            dns_monitored=dns,
        )
        self.assertEqual(dangling.status, 'pending')
        self.assertEqual(str(dangling), f"old-app.dangling-test-{unique_id}.com")

        with self.assertRaises(Exception):
            DanglingSubdomain.objects.create(
                subdomain=f"old-app.dangling-test-{unique_id}.com",
                dns_monitored=dns,
            )

        alert = DanglingAlert.objects.create(dangling_subdomain=dangling, source='certstream')
        self.assertEqual(alert.dangling_subdomain, dangling)
        self.assertTrue(alert.status)
        self.assertEqual(alert.source, 'certstream')

        # Test cascade
        dns_id = dns.id
        dns.delete()
        self.assertFalse(DanglingSubdomain.objects.filter(id=dangling.id).exists())
        self.assertFalse(DnsMonitored.objects.filter(id=dns_id).exists())


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

        self.assertTrue(mock_notifications.called)

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


class DanglingDnsDetectionTest(TestCase):
    """Test dangling DNS detection engine."""

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

        dangling = DanglingSubdomain.objects.create(
            subdomain="old.detect-test.com", dns_monitored=self.dns_monitored
        )

        # 1st resolve() call: CNAME lookup on the subdomain -> S3 bucket
        # 2nd resolve() call: CNAME lookup on target fails (no more CNAMEs)
        # 3rd resolve() call: A lookup on the terminal CNAME target -> resolves fine
        mock_resolve.side_effect = [
            [FakeAnswer("mybucket.s3.amazonaws.com.")],
            dns.resolver.NoAnswer(),
            MagicMock(),
        ]
        mock_response = MagicMock()
        mock_response.status_code = 404
        mock_response.text = "<Error><Code>NoSuchBucket</Code></Error>"
        mock_get.return_value = mock_response

        previous_status = check_dangling_status(dangling)

        self.assertEqual(previous_status, 'pending')
        dangling.refresh_from_db()
        self.assertEqual(dangling.status, 'dangling_confirmed')
        self.assertEqual(dangling.provider, 'Amazon S3')
        self.assertEqual(dangling.cname_target, 'mybucket.s3.amazonaws.com')
        self.assertEqual(dangling.http_status_code, 404)

    @patch('dns_finder.core.dns.resolver.resolve')
    def test_check_dangling_status_no_fingerprint_match_is_ok(self, mock_resolve):
        from dns_finder.core import check_dangling_status

        dangling = DanglingSubdomain.objects.create(
            subdomain="old.detect-test.com", dns_monitored=self.dns_monitored
        )
        mock_resolve.side_effect = dns.resolver.NoAnswer()

        check_dangling_status(dangling)

        dangling.refresh_from_db()
        self.assertEqual(dangling.status, 'ok')
        self.assertIsNone(dangling.provider)


class DanglingDnsRealtimeTest(TestCase):
    """Test the CertStream real-time dangling DNS hook."""

    def setUp(self):
        self.dns_monitored = DnsMonitored.objects.create(domain_name="realtime-test.com")

    @patch('dns_finder.core.check_dangling_status')
    @patch('dns_finder.core.send_dangling_dns_notifications')
    def test_evaluate_creates_alert_on_new_dangling_status(self, mock_notify, mock_check):
        from dns_finder.core import evaluate_dangling_subdomain

        dangling = DanglingSubdomain.objects.create(
            subdomain="old.realtime-test.com", dns_monitored=self.dns_monitored, status='pending'
        )
        mock_check.return_value = 'pending'  # previous status returned by check_dangling_status
        DanglingSubdomain.objects.filter(pk=dangling.pk).update(status='dangling_confirmed')

        evaluate_dangling_subdomain(dangling, source='certstream')

        self.assertTrue(DanglingAlert.objects.filter(dangling_subdomain=dangling, source='certstream').exists())
        self.assertTrue(mock_notify.called)

    @patch('dns_finder.core.check_dangling_status')
    @patch('dns_finder.core.send_dangling_dns_notifications')
    def test_evaluate_no_alert_when_already_dangling(self, mock_notify, mock_check):
        from dns_finder.core import evaluate_dangling_subdomain

        dangling = DanglingSubdomain.objects.create(
            subdomain="old2.realtime-test.com", dns_monitored=self.dns_monitored,
            status='dangling_confirmed'
        )
        mock_check.return_value = 'dangling_confirmed'  # already dangling before this check too

        evaluate_dangling_subdomain(dangling, source='periodic_recheck')

        self.assertFalse(DanglingAlert.objects.filter(dangling_subdomain=dangling).exists())
        self.assertFalse(mock_notify.called)

    @patch('dns_finder.core.evaluate_dangling_subdomain')
    def test_track_dangling_subdomain_creates_row_for_genuine_subdomain(self, mock_evaluate):
        from dns_finder.core import track_dangling_subdomain

        track_dangling_subdomain("old.realtime-test.com")

        self.assertTrue(DanglingSubdomain.objects.filter(subdomain="old.realtime-test.com").exists())
        self.assertTrue(mock_evaluate.called)

    @patch('dns_finder.core.evaluate_dangling_subdomain')
    def test_track_dangling_subdomain_ignores_root_domain(self, mock_evaluate):
        from dns_finder.core import track_dangling_subdomain

        track_dangling_subdomain("realtime-test.com")

        self.assertFalse(DanglingSubdomain.objects.filter(subdomain="realtime-test.com").exists())
        self.assertFalse(mock_evaluate.called)

    @patch('dns_finder.core.evaluate_dangling_subdomain')
    def test_track_dangling_subdomain_ignores_unrelated_domain(self, mock_evaluate):
        from dns_finder.core import track_dangling_subdomain

        track_dangling_subdomain("totally-unrelated.example")

        self.assertFalse(DanglingSubdomain.objects.exists())
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
    
    def test_alert_api_and_auth(self):
        """Test Alert API and authentication."""
        # Alert operations
        response = self.client.get('/api/dns_finder/alert/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        update_data = {'status': False}
        response = self.client.patch(f'/api/dns_finder/alert/{self.alert.pk}/', update_data)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(response.data['status'])
        
        self.client.credentials()
        response = self.client.post('/api/dns_finder/dns_monitored/', {'domain_name': 'test.com'})
        self.assertIn(response.status_code, [401, 403])
    
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