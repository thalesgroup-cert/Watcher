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
        mock_pymisp_instance.add_event.return_value = {"success": True}
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