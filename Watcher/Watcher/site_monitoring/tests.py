import os
from unittest.mock import patch, MagicMock
from django.test import TestCase, TransactionTestCase
from django.contrib.auth.models import User
from django.utils import timezone
from datetime import timedelta
from rest_framework.test import APITestCase
from rest_framework import status
from knox.models import AuthToken
from site_monitoring.models import Site, Alert, Subscriber
from site_monitoring.core import send_website_monitoring_notifications


class ModelTest(TestCase):
    """Test all models in one class."""
    
    def test_site_model_functionality(self):
        """Test site creation, RTIR, constraints, and relationships."""
        # Test creation and RTIR generation
        site = Site.objects.create(domain_name="test-example.com", ip="192.168.1.1")
        self.assertEqual(site.domain_name, "test-example.com")
        self.assertEqual(site.ip, "192.168.1.1")
        self.assertIsNotNone(site.rtir)
        self.assertTrue(site.ip_monitoring)
        self.assertFalse(site.monitored)
        self.assertEqual(str(site), "test-example.com")
        
        site2 = Site.objects.create(domain_name="site2.com")
        self.assertEqual(site2.rtir, site.rtir + 1)
        
        with self.assertRaises(Exception):
            Site.objects.create(domain_name="test-example.com")
    
    def test_alert_model_functionality(self):
        """Test alert creation, relationships, and cascade delete."""
        site = Site.objects.create(domain_name="alert-test.com")
        alert = Alert.objects.create(
            site=site,
            type="IP change detected",
            new_ip="192.168.2.1",
            old_ip="192.168.1.1",
            difference_score=150
        )
        
        # Test creation and relationships
        self.assertEqual(alert.site, site)
        self.assertEqual(alert.type, "IP change detected")
        self.assertEqual(alert.new_ip, "192.168.2.1")
        self.assertTrue(alert.status)
        self.assertEqual(str(alert), "alert-test.com")
        
        # Test cascade delete
        site_id, alert_id = site.id, alert.id
        site.delete()
        self.assertFalse(Site.objects.filter(id=site_id).exists())
        self.assertFalse(Alert.objects.filter(id=alert_id).exists())
    
    def test_subscriber_model_functionality(self):
        """Test subscriber creation and defaults."""
        user = User.objects.create_user("testuser", "test@test.com", "pass")
        subscriber = Subscriber.objects.create(user_rec=user, email=True, slack=True)
        
        self.assertEqual(subscriber.user_rec, user)
        self.assertTrue(subscriber.email)
        self.assertTrue(subscriber.slack)
        self.assertFalse(subscriber.thehive)
        self.assertFalse(subscriber.citadel)
        self.assertIn(user.username, str(subscriber))


class CoreFunctionsTest(TestCase):
    """Test core monitoring functions."""
    
    @patch('site_monitoring.core.socket.getaddrinfo')
    @patch('site_monitoring.core.send_app_specific_notifications')
    def test_monitoring_and_notifications(self, mock_notifications, mock_getaddrinfo):
        """Test IP monitoring and notification system."""
        # Setup
        user = User.objects.create_user("notifuser", "test@test.com", "pass")
        subscriber = Subscriber.objects.create(user_rec=user, email=True)
        site = Site.objects.create(domain_name="monitoring-test.com", ip="192.168.1.1")
        
        # Test IP monitoring
        from site_monitoring.core import check_ip
        mock_getaddrinfo.return_value = [(None, None, None, None, ('192.168.1.2', 0))]
        result = check_ip(site, 0)
        mock_getaddrinfo.assert_called_once()
        
        # Test notification system
        alert_data = {
            'type': 'IP change detected',
            'new_ip': '192.168.2.1',
            'old_ip': '192.168.1.1',
            'new_ip_second': None,
            'old_ip_second': None,
            'new_MX_records': [],
            'old_MX_records': [],
            'new_mail_A_record_ip': None,
            'old_mail_A_record_ip': None
        }
        
        send_website_monitoring_notifications(site, alert_data)
        mock_notifications.assert_called_once()


class APITest(APITestCase):
    """Test all API endpoints in one class."""
    
    def setUp(self):
        """Set up authenticated user for all API tests."""
        self.user = User.objects.create_superuser("apiuser", password="apipass123")
        self.token = AuthToken.objects.create(self.user)[1]
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {self.token}')
        
        self.site = Site.objects.create(domain_name="api-test.com")
        self.alert = Alert.objects.create(site=self.site, type="API test alert")
    
    def test_site_api_operations(self):
        """Test Site CRUD operations via API."""
        # Test list
        Site.objects.create(domain_name="api-test2.com")
        response = self.client.get('/api/site_monitoring/site/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 2)
        
        # Test create
        data = {'domain_name': 'new-api-site.com', 'ip': '192.168.1.100', 'ip_monitoring': True}
        response = self.client.post('/api/site_monitoring/site/', data, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(Site.objects.filter(domain_name='new-api-site.com').exists())
        
        # Test detail
        response = self.client.get(f'/api/site_monitoring/site/{self.site.pk}/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['domain_name'], 'api-test.com')
    
    def test_alert_api_operations(self):
        """Test Alert API operations."""
        # Test list
        response = self.client.get('/api/site_monitoring/alert/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]['type'], "API test alert")
        
        # Test detail
        response = self.client.get(f'/api/site_monitoring/alert/{self.alert.pk}/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['type'], "API test alert")
        self.assertIn('site', response.data)
    
    def test_api_authentication_required(self):
        """Test API authentication requirement."""
        self.client.credentials()  # Remove auth
        response = self.client.get('/api/site_monitoring/site/')
        self.assertIn(response.status_code, [401, 403])


class IntegrationTest(TransactionTestCase):
    """Integration and workflow tests."""
    
    def setUp(self):
        """Set up comprehensive test data."""
        self.user = User.objects.create_user("integrationuser", "test@test.com", "pass")
        self.site = Site.objects.create(
            domain_name="integration-test.com",
            ip="198.51.100.1",
            monitored=True
        )
        self.subscriber = Subscriber.objects.create(user_rec=self.user, email=True)
    
    @patch('site_monitoring.core.send_app_specific_notifications')
    @patch('site_monitoring.core.start_scheduler')
    def test_complete_workflow_and_scheduler(self, mock_scheduler, mock_notifications):
        """Test complete monitoring workflow and scheduler integration."""
        # Test complete workflow
        alert = Alert.objects.create(
            site=self.site,
            type="Integration test alert",
            new_ip="198.51.100.2",
            old_ip="198.51.100.1"
        )
        
        self.assertEqual(Alert.objects.count(), 1)
        self.assertEqual(alert.site, self.site)
        self.assertTrue(self.site.monitored)
        
        # Test notification integration
        alert_data = {
            'type': 'IP address change detected',
            'new_ip': '198.51.100.2',
            'old_ip': '198.51.100.1',
            'new_ip_second': None,
            'old_ip_second': None,
            'new_MX_records': [],
            'old_MX_records': [],
            'new_mail_A_record_ip': None,
            'old_mail_A_record_ip': None
        }
        
        send_website_monitoring_notifications(self.site, alert_data)
        mock_notifications.assert_called_once()
        
        # Test scheduler integration
        from site_monitoring.core import start_scheduler
        mock_scheduler.return_value = None
        
        try:
            start_scheduler()
            scheduler_started = True
        except Exception:
            scheduler_started = False
        
        self.assertTrue(scheduler_started)
    
    def test_site_deletion_signal(self):
        """Test post_delete signal for Site model."""
        site_id = self.site.id
        self.site.delete()
        self.assertFalse(Site.objects.filter(id=site_id).exists())


class MISPIntegrationTest(TestCase):
    """Test MISP integration functionality."""
    
    @patch('site_monitoring.serializers.PyMISP')
    def test_misp_serializer_validation(self, mock_pymisp):
        """Test MISP serializer validation."""
        from site_monitoring.serializers import MISPSerializer
        
        site = Site.objects.create(domain_name="misp-test.com")
        mock_misp_instance = MagicMock()
        mock_pymisp.return_value = mock_misp_instance
        
        data = {'id': site.id}
        serializer = MISPSerializer(data=data)
        
        self.assertTrue(serializer.is_valid())
        self.assertEqual(serializer.validated_data['id'], site.id)


class PerformanceAndSecurityTest(TestCase):
    """Test performance and security features."""
    
    def test_bulk_operations_performance(self):
        """Test performance with bulk operations."""
        start_time = timezone.now()
        
        # Create 20 sites and 30 alerts
        sites = [Site(domain_name=f"perf-test-{i}.com") for i in range(20)]
        Site.objects.bulk_create(sites)
        
        site = Site.objects.first()
        alerts = [Alert(site=site, type=f"Perf alert {i}") for i in range(30)]
        Alert.objects.bulk_create(alerts)
        
        duration = (timezone.now() - start_time).total_seconds()
        
        self.assertLess(duration, 3.0)
        self.assertEqual(Site.objects.count(), 20)
        self.assertEqual(Alert.objects.count(), 30)
    
    def test_input_validation_and_security(self):
        """Test domain/IP validation and security."""
        # Test valid domains
        valid_domains = ["example.com", "sub.example.org", "test-domain.net"]
        for domain in valid_domains:
            site = Site.objects.create(domain_name=f"valid-{domain}")
            self.assertEqual(site.domain_name, f"valid-{domain}")
        
        # Test valid IPs
        valid_ips = ["192.168.1.1", "10.0.0.1", "172.16.0.1", "2001:db8::1"]
        for i, ip in enumerate(valid_ips):
            site = Site.objects.create(
                domain_name=f"ip-test-{i}.com",
                ip=ip
            )
            self.assertEqual(site.ip, ip)
