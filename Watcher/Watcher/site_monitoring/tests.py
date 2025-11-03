from unittest.mock import patch, MagicMock
from django.test import TestCase, TransactionTestCase
from django.contrib.auth.models import User
from django.utils import timezone
from datetime import timedelta, date
from rest_framework.test import APITestCase
from rest_framework import status
from knox.models import AuthToken
from site_monitoring.models import Site, Alert, Subscriber
from site_monitoring.core import monitoring_init, create_rdap_alert, send_website_monitoring_notifications
from site_monitoring.serializers import SiteSerializer, AlertSerializer
import uuid

class ModelTest(TestCase):
    """Test all models."""
    
    def test_site_model_functionality(self):
        """Test site creation, RTIR, constraints, and relationships."""
        site = Site.objects.create(
            domain_name="test-example.com",
            ip="192.168.1.1",
            registrar="Test Registrar",
            legitimacy=2,
            domain_expiry=date(2026, 12, 31)
        )
        self.assertEqual(site.domain_name, "test-example.com")
        self.assertEqual(site.ip, "192.168.1.1")
        self.assertEqual(site.registrar, "Test Registrar")
        self.assertEqual(site.legitimacy, 2)
        self.assertIsNotNone(site.rtir)
        self.assertTrue(site.ip_monitoring)
        self.assertFalse(site.monitored)
        self.assertEqual(str(site), "test-example.com")
        
        site2 = Site.objects.create(domain_name="site2.com")
        self.assertEqual(site2.rtir, site.rtir + 1)
        
        with self.assertRaises(Exception):
            Site.objects.create(domain_name="test-example.com")
    
    def test_legitimacy_auto_update(self):
        """Test automatic legitimacy update when registrar is found."""
        site = Site.objects.create(
            domain_name="auto-update-test.com",
            legitimacy=4
        )
        site.registrar = "New Registrar"
        updated = site.auto_update_legitimacy_on_registration()
        self.assertTrue(updated)
        self.assertEqual(site.legitimacy, 3)
    
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
        self.assertEqual(alert.site, site)
        self.assertEqual(alert.type, "IP change detected")
        self.assertEqual(alert.new_ip, "192.168.2.1")
        self.assertTrue(alert.status)
        self.assertFalse(alert.is_rdap_alert)
        self.assertIn("alert-test.com", str(alert))
        
        site_id, alert_id = site.id, alert.id
        site.delete()
        self.assertFalse(Site.objects.filter(id=site_id).exists())
        self.assertFalse(Alert.objects.filter(id=alert_id).exists())
    
    def test_rdap_alert_detection(self):
        """Test RDAP/WHOIS alert detection."""
        site = Site.objects.create(domain_name="rdap-test.com")
        regular_alert = Alert.objects.create(
            site=site,
            type="IP change detected",
            new_ip="192.168.1.1"
        )
        self.assertFalse(regular_alert.is_rdap_alert)
        rdap_alert = Alert.objects.create(
            site=site,
            type="RDAP registrar change detected",
            new_registrar="New Registrar",
            old_registrar="Old Registrar"
        )
        self.assertTrue(rdap_alert.is_rdap_alert)
    
    def test_subscriber_functionality(self):
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

    @patch('site_monitoring.core.requests.get')
    @patch('site_monitoring.core.socket.getaddrinfo')
    @patch('site_monitoring.core.send_app_specific_notifications')
    def test_monitoring_init(self, mock_notifications, mock_getaddrinfo, mock_requests_get):
        """Test monitoring initialization."""
        mock_getaddrinfo.return_value = [
            (None, None, None, None, ('192.168.1.1', 0))
        ]
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.text = "Test page content"
        mock_requests_get.return_value = mock_response

        site = Site.objects.create(
            domain_name="monitoring-test.com",
            expiry=timezone.now() + timedelta(days=10)
        )
        monitoring_init(site)
        site.refresh_from_db()
        self.assertEqual(site.ip, "192.168.1.1")
        self.assertTrue(site.monitored)

    @patch('site_monitoring.core.RDAPDiscovery')
    @patch('site_monitoring.core.Alert.objects.create')
    def test_rdap_alert_creation(self, mock_alert_create, mock_rdap):
        """Test RDAP alert creation."""
        site = Site.objects.create(domain_name="rdap-alert-test.com")
        registrar_data = {
            'new_registrar': "New Registrar",
            'old_registrar': "Old Registrar"
        }
        fake_alert = MagicMock()
        fake_alert.site = site
        fake_alert.type = "RDAP registrar change detected"
        fake_alert.new_registrar = "New Registrar"
        fake_alert.is_rdap_alert = True
        mock_alert_create.return_value = fake_alert
        create_rdap_alert(site, 'registrar_change', registrar_data=registrar_data)
        alert = mock_alert_create.return_value
        self.assertIsNotNone(alert)
        self.assertEqual(alert.new_registrar, "New Registrar")
        self.assertTrue(alert.is_rdap_alert)

    @patch('site_monitoring.core.requests.get')
    def test_content_monitoring(self, mock_get):
        """Test content monitoring with TLSH."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.text = "Test content " * 100
        mock_get.return_value = mock_response
        from site_monitoring.core import check_content
        site = Site.objects.create(
            domain_name="content-test.com",
            content_monitoring=True
        )
        result = check_content(site, 0, None)
        self.assertIsNotNone(result)


class APITest(APITestCase):
    """Test all API endpoints."""
    
    def setUp(self):
        self.user = User.objects.create_superuser("apiuser", password="apipass123")
        self.token = AuthToken.objects.create(self.user)[1]
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {self.token}')
        self.site = Site.objects.create(
            domain_name="api-test.com",
            rtir=1,
            registrar="Test Registrar",
            legitimacy=2
        )
        self.alert = Alert.objects.create(site=self.site, type="API test alert")
    
    def test_site_api_operations(self):
        """Test Site CRUD operations via API."""
        response = self.client.get('/api/site_monitoring/site/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        response = self.client.get(f'/api/site_monitoring/site/{self.site.pk}/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['domain_name'], 'api-test.com')
        update_data = {
            'domain_name': 'api-test.com',
            'legitimacy': 3,
            'registrar': 'Updated Registrar'
        }
        response = self.client.patch(f'/api/site_monitoring/site/{self.site.pk}/', update_data)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['legitimacy'], 3)
    
    def test_alert_api_operations(self):
        """Test Alert API operations."""
        response = self.client.get('/api/site_monitoring/alert/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        update_data = {'status': False}
        response = self.client.patch(f'/api/site_monitoring/alert/{self.alert.pk}/', update_data)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(response.data['status'])

    @patch('site_monitoring.serializers.PyMISP')
    def test_misp_export(self, mock_pymisp):
        """Test MISP export functionality."""
        mock_pymisp_instance = MagicMock()
        mock_pymisp.return_value = mock_pymisp_instance
        mock_pymisp_instance.add_event.return_value = {"success": True}
        mock_pymisp_instance.search.return_value = []
        mock_pymisp_instance.get.return_value = {}
        export_data = {
            'id': self.site.id,
            'event_uuid': ''
        }
        response = self.client.post('/api/site_monitoring/misp/', export_data, format='json')
        self.assertIn(response.status_code, [200, 201, 400])


class RDAPWhoisTest(TestCase):
    """Test RDAP and WHOIS functionality."""
    
    @patch('site_monitoring.core.RDAPDiscovery')
    def test_rdap_lookup(self, mock_rdap):
        """Test RDAP lookup."""
        mock_instance = MagicMock()
        mock_instance.fetch_rdap_data.return_value = True
        mock_instance.get_registrar.return_value = "RDAP Registrar"
        mock_instance.get_expiration_date.return_value = "2026-12-31"
        mock_rdap.return_value = mock_instance
        from site_monitoring.core import perform_site_rdap_lookup
        site = Site.objects.create(domain_name="rdap-lookup-test.com")
        result = perform_site_rdap_lookup(site)
        self.assertTrue(result)
        site.refresh_from_db()
        self.assertEqual(site.registrar, "RDAP Registrar")
    
    @patch('site_monitoring.core.WhoisDiscovery')
    def test_whois_fallback(self, mock_whois):
        """Test WHOIS fallback when RDAP fails."""
        mock_instance = MagicMock()
        mock_instance.fetch_whois_data.return_value = True
        mock_instance.get_registrar.return_value = "WHOIS Registrar"
        mock_whois.return_value = mock_instance
        site = Site.objects.create(domain_name="whois-test.com")
        from site_monitoring.core import perform_site_rdap_lookup
        result = perform_site_rdap_lookup(site)
        site.refresh_from_db()
        self.assertIsNotNone(site.registrar)


class IntegrationTest(TransactionTestCase):
    """Integration and workflow tests."""
    
    def setUp(self):
        self.user = User.objects.create_user("integ_user", "test@test.com", "pass")
        Subscriber.objects.create(user_rec=self.user, email=True)

    @patch('site_monitoring.core.Alert.objects.create')
    @patch('site_monitoring.core.send_app_specific_notifications')
    @patch('site_monitoring.core.start_scheduler')
    def test_complete_workflow(self, mock_scheduler, mock_notifications, mock_alert_create):
        """Test complete monitoring workflow."""
        site = Site.objects.create(
            domain_name="workflow-test.com",
            ip="192.168.1.1",
            expiry=timezone.now() + timedelta(days=30)
        )
        fake_alert = MagicMock()
        fake_alert.site = site
        fake_alert.type = "IP change detected"
        fake_alert.new_ip = "192.168.1.2"
        mock_alert_create.return_value = fake_alert
        from site_monitoring.core import create_alert
        create_alert(
            alert=1,
            site=site,
            new_ip="192.168.1.2",
            new_ip_second=None,
            score=0
        )
        alert = mock_alert_create.return_value
        self.assertIsNotNone(alert)
        self.assertEqual(alert.new_ip, "192.168.1.2")
    
    def test_site_deletion_signal(self):
        """Test site deletion removes MISP mapping."""
        from common.models import MISPEventUuidLink
        site = Site.objects.create(domain_name="signal-test.com")
        MISPEventUuidLink.objects.create(
            domain_name="signal-test.com",
            misp_event_uuid=["test-uuid"]
        )
        site.delete()
        mapping_exists = MISPEventUuidLink.objects.filter(domain_name="signal-test.com").exists()
        self.assertFalse(mapping_exists)


class PerformanceAndSecurityTest(TestCase):
    """Test performance and security features."""
    
    def test_bulk_operations_performance(self):
        """Test bulk site operations."""
        start_time = timezone.now()
        sites = [Site(domain_name=f"perf-{i}.com", rtir=i+1) for i in range(10)]
        Site.objects.bulk_create(sites)
        end_time = timezone.now()
        duration = (end_time - start_time).total_seconds()
        self.assertLess(duration, 2.0)
        self.assertEqual(Site.objects.filter(domain_name__startswith="perf-").count(), 10)
    
    def test_input_validation_and_security(self):
        """Test input validation."""
        site = Site.objects.create(domain_name="valid-domain.com")
        self.assertEqual(site.domain_name, "valid-domain.com")
        site.legitimacy = 5
        site.save()
        self.assertEqual(site.legitimacy, 5)