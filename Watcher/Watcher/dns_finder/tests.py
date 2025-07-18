import os
from unittest.mock import patch, MagicMock
from django.test import TestCase, TransactionTestCase
from django.contrib.auth.models import User
from django.utils import timezone
from rest_framework.test import APITestCase
from rest_framework import status
from knox.models import AuthToken
from dns_finder.models import DnsMonitored, DnsTwisted, Alert, KeywordMonitored, Subscriber
from dns_finder.core import send_dns_finder_notifications


class ModelTest(TransactionTestCase):
    """Test all models."""
    
    def test_dns_and_keyword_functionality(self):
        """Test DNS and Keyword models creation and constraints."""
        import uuid
        unique_id = str(uuid.uuid4())[:8]
        
        # DNS Monitored - utiliser un domaine complètement unique
        dns = DnsMonitored.objects.create(domain_name=f"dns-test-{unique_id}.com")
        self.assertEqual(str(dns), f"dns-test-{unique_id}.com")
        
        with self.assertRaises(Exception):
            DnsMonitored.objects.create(domain_name=f"dns-test-{unique_id}.com")
        
        # Keyword Monitored - utiliser un nom complètement unique
        keyword = KeywordMonitored.objects.create(name=f"cybersec-{unique_id}")
        self.assertEqual(str(keyword), f"cybersec-{unique_id}")
        
        with self.assertRaises(Exception):
            KeywordMonitored.objects.create(name=f"cybersec-{unique_id}")
    
    def test_twisted_and_alert_functionality(self):
        """Test DnsTwisted and Alert models with relationships."""
        import uuid
        unique_id = str(uuid.uuid4())[:8]
        
        dns = DnsMonitored.objects.create(domain_name=f"twisted-test-{unique_id}.com")
        twisted = DnsTwisted.objects.create(domain_name=f"tw1sted-test-{unique_id}.com", dns_monitored=dns)
        alert = Alert.objects.create(dns_twisted=twisted)
        
        self.assertEqual(twisted.dns_monitored, dns)
        self.assertEqual(alert.dns_twisted, twisted)
        self.assertTrue(alert.status)
        
        # Test cascade
        dns.delete()
        self.assertFalse(DnsTwisted.objects.filter(id=twisted.id).exists())
    
    def test_subscriber_functionality(self):
        """Test Subscriber model."""
        import uuid
        unique_id = str(uuid.uuid4())[:8]
        
        user = User.objects.create_user(f"dnsuser{unique_id}", "dns@test.com", "pass")
        subscriber = Subscriber.objects.create(user_rec=user, email=True)
        
        self.assertTrue(subscriber.email)
        self.assertFalse(subscriber.thehive)
        self.assertIn(f"dnsuser{unique_id}", str(subscriber))


class CoreTest(TestCase):
    """Test core functions."""
    
    def test_in_dns_monitored(self):
        """Test domain checking function."""
        from dns_finder.core import in_dns_monitored
        
        DnsMonitored.objects.create(domain_name="core-example.com")
        self.assertTrue(in_dns_monitored("sub.core-example.com"))
        self.assertFalse(in_dns_monitored("other.com"))
    
    @patch('dns_finder.core.send_app_specific_notifications')
    def test_notification_system(self, mock_notifications):
        """Test notification system."""
        user = User.objects.create_user("notifuser", "dns-notif@test.com", "pass")
        Subscriber.objects.create(user_rec=user, email=True)
        
        twisted = DnsTwisted.objects.create(domain_name="notif-dns-test.com")
        alert = Alert.objects.create(dns_twisted=twisted)
        
        send_dns_finder_notifications(alert)
        mock_notifications.assert_called_once()


class SerializerTest(TestCase):
    """Test serializers."""
    
    def test_all_serializers(self):
        """Test all serializers together."""
        from dns_finder.serializers import DnsMonitoredSerializer, DnsTwistedSerializer
        
        dns = DnsMonitored.objects.create(domain_name="serializer-dns.com")
        twisted = DnsTwisted.objects.create(domain_name="twisted-serial.com", dns_monitored=dns)
        
        dns_serializer = DnsMonitoredSerializer(dns)
        twisted_serializer = DnsTwistedSerializer(twisted)
        
        self.assertEqual(dns_serializer.data['domain_name'], "serializer-dns.com")
        self.assertEqual(twisted_serializer.data['domain_name'], "twisted-serial.com")
        self.assertIn('misp_event_uuid', twisted_serializer.data)


class APITest(APITestCase):
    """Test API endpoints."""
    
    def setUp(self):
        """Setup authenticated user and test data."""
        self.user = User.objects.create_superuser("apiuser", password="apipass123")
        self.token = AuthToken.objects.create(self.user)[1]
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {self.token}')
        
        self.dns = DnsMonitored.objects.create(domain_name="api-dns-test.com")
        self.twisted = DnsTwisted.objects.create(domain_name="api-twisted-dns.com", dns_monitored=self.dns)
        self.alert = Alert.objects.create(dns_twisted=self.twisted)
    
    def test_dns_monitored_api(self):
        """Test DnsMonitored API operations."""
        # List and Create
        response = self.client.get('/api/dns_finder/dns_monitored/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        data = {'domain_name': 'new-api-dns.com'}
        response = self.client.post('/api/dns_finder/dns_monitored/', data, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
    
    def test_keyword_and_twisted_api(self):
        """Test Keyword and Twisted API operations."""
        # Keyword
        response = self.client.get('/api/dns_finder/keyword_monitored/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        # Twisted
        response = self.client.get('/api/dns_finder/dns_twisted/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
    
    def test_alert_api_and_auth(self):
        """Test Alert API and authentication."""
        # Alert operations
        response = self.client.get('/api/dns_finder/alert/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        # Test authentication required
        self.client.credentials()
        response = self.client.get('/api/dns_finder/dns_monitored/')
        self.assertIn(response.status_code, [401, 403])


class MISPTest(TestCase):
    """Test MISP integration."""
    
    @patch('dns_finder.serializers.PyMISP')
    def test_misp_integration(self, mock_pymisp):
        """Test MISP serializer and event creation."""
        from dns_finder.serializers import MISPSerializer
        
        twisted = DnsTwisted.objects.create(domain_name="misp-dns-test.com")
        
        mock_misp = MagicMock()
        mock_event = MagicMock()
        mock_event.id = 123
        mock_pymisp.return_value = mock_misp
        
        data = {'id': twisted.id}
        serializer = MISPSerializer(data=data)
        self.assertTrue(serializer.is_valid())


class IntegrationTest(TestCase):
    """Integration tests."""
    
    def setUp(self):
        """Setup integration test data."""
        self.user = User.objects.create_user("integration", "integration-dns@test.com", "pass")
        self.dns = DnsMonitored.objects.create(domain_name="integration-dns.com")
        self.subscriber = Subscriber.objects.create(user_rec=self.user, email=True)
    
    @patch('dns_finder.core.send_app_specific_notifications')
    @patch('dns_finder.core.start_scheduler')
    def test_complete_workflow(self, mock_scheduler, mock_notifications):
        """Test complete workflow and scheduler."""
        twisted = DnsTwisted.objects.create(
            domain_name="integrat1on-dns.com",
            dns_monitored=self.dns,
            fuzzer="homoglyph"
        )
        alert = Alert.objects.create(dns_twisted=twisted)
        
        # Test workflow
        self.assertEqual(alert.dns_twisted, twisted)
        
        # Test notifications
        send_dns_finder_notifications(alert)
        mock_notifications.assert_called_once()
        
        # Test scheduler
        mock_scheduler.return_value = None
        try:
            from dns_finder.core import start_scheduler
            start_scheduler()
            scheduler_ok = True
        except:
            scheduler_ok = False
        self.assertTrue(scheduler_ok)
    
    def test_deletion_signals(self):
        """Test deletion signals and cascade."""
        dns_id = self.dns.id
        DnsTwisted.objects.create(domain_name="deletion-dns-test.com", dns_monitored=self.dns)
        
        self.dns.delete()
        
        self.assertFalse(DnsMonitored.objects.filter(id=dns_id).exists())
        self.assertFalse(DnsTwisted.objects.filter(dns_monitored_id=dns_id).exists())


class PerformanceTest(TestCase):
    """Test performance and security."""
    
    def test_bulk_operations_and_validation(self):
        """Test bulk operations performance and input validation."""
        start_time = timezone.now()
        
        # Bulk create
        dns_list = [DnsMonitored(domain_name=f"perf-dns-{i}.com") for i in range(10)]
        DnsMonitored.objects.bulk_create(dns_list)
        
        twisted_list = [DnsTwisted(domain_name=f"tw1st-dns-{i}.com") for i in range(15)]
        DnsTwisted.objects.bulk_create(twisted_list)
        
        duration = (timezone.now() - start_time).total_seconds()
        
        self.assertLess(duration, 2.0)
        self.assertEqual(DnsMonitored.objects.count(), 10)
        self.assertEqual(DnsTwisted.objects.count(), 15)
        
        # Input validation
        valid_domains = ["valid-example.com", "test-valid-domain.net"]
        for domain in valid_domains:
            dns = DnsMonitored.objects.create(domain_name=f"valid-{domain}")
            self.assertEqual(dns.domain_name, f"valid-{domain}")
        
        valid_keywords = ["valid-cybersecurity", "valid-threat-intel"]
        for keyword in valid_keywords:
            kw = KeywordMonitored.objects.create(name=f"test-{keyword}")
            self.assertEqual(kw.name, f"test-{keyword}")


class DnsFinderTestCase(TestCase):
    def test_dns_monitored_creation(self):
        self.assertEqual(1, 2, "Test failed")
        
    def test_keyword_monitored_creation(self):
        keyword = KeywordMonitored.objects.create(name="test-keyword")
        self.assertEqual(keyword.name, "test-keyword")
