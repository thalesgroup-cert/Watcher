from unittest.mock import patch, MagicMock
from django.test import TestCase, TransactionTestCase
from django.contrib.auth.models import User
from django.utils import timezone
from datetime import timedelta, date
from rest_framework.test import APITestCase
from rest_framework import status
from knox.models import AuthToken
from site_monitoring.models import Site, Alert, Subscriber
from site_monitoring.core import monitoring_init, create_rdap_alert, create_banner_alert, send_website_monitoring_notifications
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


class BannerModelTest(TestCase):
    """Test banner fields on Site and Alert models."""

    def test_site_banner_fields_default_to_none(self):
        site = Site.objects.create(domain_name="banner-default.com")
        self.assertIsNone(site.server_banner)
        self.assertIsNone(site.x_powered_by)

    def test_site_banner_fields_store_values(self):
        site = Site.objects.create(
            domain_name="banner-store.com",
            server_banner="Apache/2.4.51",
            x_powered_by="PHP/7.4.3",
        )
        site.refresh_from_db()
        self.assertEqual(site.server_banner, "Apache/2.4.51")
        self.assertEqual(site.x_powered_by, "PHP/7.4.3")

    def test_alert_banner_fields_default_to_none(self):
        site = Site.objects.create(domain_name="alert-banner-default.com")
        alert = Alert.objects.create(site=site, type="Server banner change detected")
        self.assertIsNone(alert.old_server_banner)
        self.assertIsNone(alert.new_server_banner)
        self.assertIsNone(alert.old_x_powered_by)
        self.assertIsNone(alert.new_x_powered_by)

    def test_is_banner_alert_true_when_banner_fields_set(self):
        site = Site.objects.create(domain_name="is-banner-alert.com")
        alert = Alert.objects.create(
            site=site,
            type="Server banner change detected",
            old_server_banner="Apache/2.4.51",
            new_server_banner="nginx/1.18.0",
        )
        self.assertTrue(alert.is_banner_alert)

    def test_is_banner_alert_false_when_no_banner_fields(self):
        site = Site.objects.create(domain_name="not-banner-alert.com")
        alert = Alert.objects.create(site=site, type="IP address change detected")
        self.assertFalse(alert.is_banner_alert)


class BannerAlertTest(TestCase):
    """Test create_banner_alert and check_content banner detection."""

    def setUp(self):
        self.site = Site.objects.create(
            domain_name="banner-alert-test.com",
            server_banner="Apache/2.4.51",
            x_powered_by="PHP/7.4.3",
            monitored=True,
        )

    @patch('site_monitoring.core.send_website_monitoring_notifications')
    def test_create_banner_alert_creates_alert_record(self, mock_notif):
        alert = create_banner_alert(
            self.site,
            old_server="Apache/2.4.51",
            new_server="nginx/1.18.0",
            old_xpb="PHP/7.4.3",
            new_xpb="",
        )
        self.assertIsNotNone(alert)
        self.assertEqual(alert.type, "Server banner change detected")
        self.assertEqual(alert.old_server_banner, "Apache/2.4.51")
        self.assertEqual(alert.new_server_banner, "nginx/1.18.0")
        self.assertEqual(alert.old_x_powered_by, "PHP/7.4.3")
        self.assertEqual(alert.new_x_powered_by, "")

    @patch('site_monitoring.core.send_website_monitoring_notifications')
    def test_create_banner_alert_sends_notification(self, mock_notif):
        create_banner_alert(
            self.site,
            old_server="Apache/2.4.51",
            new_server="nginx/1.18.0",
            old_xpb="",
            new_xpb="",
        )
        mock_notif.assert_called_once()

    @patch('site_monitoring.core.send_website_monitoring_notifications')
    def test_create_banner_alert_deduplicates_within_one_hour(self, mock_notif):
        create_banner_alert(self.site, "Apache/2.4.51", "nginx/1.18.0", "", "")
        second = create_banner_alert(self.site, "Apache/2.4.51", "nginx/1.18.0", "", "")
        self.assertIsNone(second)
        self.assertEqual(Alert.objects.filter(site=self.site, type="Server banner change detected").count(), 1)

    @patch('site_monitoring.core.create_banner_alert')
    @patch('site_monitoring.core.requests.get')
    def test_check_content_triggers_banner_alert_on_change(self, mock_get, mock_banner_alert):
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.text = "content"
        mock_response.headers = {
            'Server': 'nginx/1.18.0',
            'X-Powered-By': '',
        }
        mock_get.return_value = mock_response

        from site_monitoring.core import check_content
        check_content(self.site, 0, None)

        mock_banner_alert.assert_called_once_with(
            self.site,
            old_server="Apache/2.4.51",
            new_server="nginx/1.18.0",
            old_xpb="PHP/7.4.3",
            new_xpb="",
        )

    @patch('site_monitoring.core.create_banner_alert')
    @patch('site_monitoring.core.requests.get')
    def test_check_content_stores_banner_silently_on_first_run(self, mock_get, mock_banner_alert):
        site = Site.objects.create(
            domain_name="first-run-banner.com",
            server_banner=None,
            x_powered_by=None,
        )
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.text = "content"
        mock_response.headers = {
            'Server': 'Apache/2.4.51',
            'X-Powered-By': 'PHP/7.4.3',
        }
        mock_get.return_value = mock_response

        from site_monitoring.core import check_content
        check_content(site, 0, None)

        mock_banner_alert.assert_not_called()
        site.refresh_from_db()
        self.assertEqual(site.server_banner, "Apache/2.4.51")
        self.assertEqual(site.x_powered_by, "PHP/7.4.3")

    @patch('site_monitoring.core.create_banner_alert')
    @patch('site_monitoring.core.requests.get')
    def test_check_content_no_alert_when_banner_unchanged(self, mock_get, mock_banner_alert):
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.text = "content"
        mock_response.headers = {
            'Server': 'Apache/2.4.51',
            'X-Powered-By': 'PHP/7.4.3',
        }
        mock_get.return_value = mock_response

        from site_monitoring.core import check_content
        check_content(self.site, 0, None)

        mock_banner_alert.assert_not_called()


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
        mock_response.headers = {}
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
        mock_response.headers = {}
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

    def test_alerts_can_be_filtered_by_site(self):
        """The 'Alerts for <site>' dialog only ever saw the 100 newest alerts of all sites,
        so a site whose last alert was a few hours old showed none."""
        other = Site.objects.create(domain_name="other-site.com", rtir=2)
        Alert.objects.create(site=other, type="Other site alert")

        response = self.client.get(f'/api/site_monitoring/alert/?site={self.site.pk}')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual([alert['id'] for alert in response.data['results']], [self.alert.pk])

    def test_alert_filter_ignores_a_malformed_site_id(self):
        response = self.client.get('/api/site_monitoring/alert/?site=not-a-number')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['results'], [])

    def test_network_history_is_neither_exposed_nor_overwritten_by_the_api(self):
        history = {"98.83.0.0/16": "2026-10-01T10:00:00"}
        Site.objects.filter(pk=self.site.pk).update(network_history=history)

        response = self.client.get(f'/api/site_monitoring/site/{self.site.pk}/')
        self.client.patch(f'/api/site_monitoring/site/{self.site.pk}/', {'registrar': 'Another Registrar'})
        self.site.refresh_from_db()

        self.assertNotIn('network_history', response.data)
        self.assertEqual(self.site.network_history, history)

    @patch('site_monitoring.serializers.PyMISP')
    def test_misp_export(self, mock_pymisp):
        """Test MISP export functionality."""
        mock_pymisp_instance = MagicMock()
        mock_pymisp.return_value = mock_pymisp_instance
        mock_event_obj = MagicMock()
        mock_event_obj.id = 456
        mock_event_obj.uuid = 'site-test-uuid'
        mock_pymisp_instance.add_event.return_value = mock_event_obj
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


class SiteLastEventFieldTest(APITestCase):
    """Test that the Site API exposes last_event=null when no TimelineEvents exist."""

    def setUp(self):
        self.user = User.objects.create_superuser(username='sitelastevent', password='pass')
        _, token = AuthToken.objects.create(self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token}')
        Site.objects.create(domain_name='lastevent-site.com')

    def test_site_last_event_null(self):
        """GET /api/site_monitoring/site/ must include last_event=null when no timeline events."""
        response = self.client.get('/api/site_monitoring/site/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        results = response.data.get('results', list(response.data))
        self.assertTrue(len(results) >= 1)
        first = results[0]
        self.assertIn('last_event', first)
        last_event = first['last_event']
        if last_event is not None:
            self.assertIn('action', last_event)
            self.assertIn('username', last_event)

class FakeResolver:
    """dns.resolver.Resolver stand-in answering from a {(name, rdtype): [records]} table."""

    def __init__(self, answers):
        self.answers = answers
        self.timeout = None
        self.lifetime = None

    def resolve(self, name, rdtype):
        import dns.resolver

        if (name, rdtype) not in self.answers:
            raise dns.resolver.NXDOMAIN()
        answer = self.answers[(name, rdtype)]
        if isinstance(answer, Exception):
            raise answer
        return list(answer)


class CheckMailTest(TestCase):
    """check_mail on the 'mail.<site>' A record, which is often a round-robin pool."""

    DOMAIN = "mail-pool.test"

    def _check(self, site, mail_ips):
        import dns.resolver
        from site_monitoring.core import check_mail

        answers = {} if mail_ips is None else {("mail." + self.DOMAIN, "A"): mail_ips}
        with patch('site_monitoring.core.resolver.Resolver', return_value=FakeResolver(answers)):
            alert = check_mail(site, 0)
        site.refresh_from_db()
        return alert

    def _site(self, mail_a_record_ip):
        return Site.objects.create(
            domain_name=self.DOMAIN, mail_A_record_ip=mail_a_record_ip, MX_records=[], mail_monitoring=True,
        )

    def test_rotating_answers_of_the_same_pool_raise_no_alert(self):
        """check_mail compared the *first* answer, whose order rotates, with the stored IP:
        a pool spread over several /16 networks alerted every 3 hours, for ever."""
        site = self._site("54.157.108.158")

        alert = self._check(site, ["100.28.104.175", "54.157.108.158", "98.83.184.133"])

        self.assertEqual(alert, 0)
        self.assertEqual(site.mail_A_record_ip, "54.157.108.158")

    def test_a_record_moving_to_another_network_raises_one_alert(self):
        site = self._site("54.157.108.158")

        alert = self._check(site, ["3.126.5.188", "3.71.139.153"])

        self.assertEqual(alert, 8)
        self.assertIn(site.mail_A_record_ip, ["3.126.5.188", "3.71.139.153"])

    def test_first_resolution_stores_an_ip_and_alerts(self):
        site = self._site(None)

        alert = self._check(site, ["3.126.5.188"])

        self.assertEqual(alert, 8)
        self.assertEqual(site.mail_A_record_ip, "3.126.5.188")

    def test_record_that_disappears_alerts_once(self):
        site = self._site("54.157.108.158")

        first = self._check(site, None)
        second = self._check(site, None)

        self.assertEqual(first, 8)
        self.assertEqual(second, 0)
        self.assertIsNone(site.mail_A_record_ip)


def _address(ip):
    """One socket.getaddrinfo() entry, as the standard library returns it."""
    import socket

    return (socket.AF_INET, socket.SOCK_STREAM, 6, '', (ip, 0))


class FakeWebResponse:
    """The parts of requests.Response that check_content reads."""

    def __init__(self, text, status_code=200):
        self.text = text
        self.status_code = status_code
        self.headers = {}


def _page(seed, words=400):
    """Deterministic page of 'words' pseudo-random words: long and varied enough to be fingerprinted."""
    import random

    rng = random.Random(seed)
    return " ".join("".join(rng.choices("abcdefghijklmnopqrstuvwxyz", k=rng.randint(3, 9))) for _ in range(words))


class MonitoringCheckResilienceTest(TransactionTestCase):
    """monitoring_check walks every site in a fixed order (-rtir): the sites after a failing one
    were never checked again, run after run. (TransactionTestCase: monitoring_check closes
    old connections, which a TestCase transaction would not survive.)"""

    def test_a_failing_site_does_not_stop_the_remaining_sites(self):
        import requests
        from site_monitoring import core

        Site.objects.create(domain_name="failing.test", rtir=20)  # processed first
        healthy = Site.objects.create(domain_name="healthy.test", rtir=10)
        real_check_mail = core.check_mail

        def flaky_check_mail(site, alert):
            if site.domain_name == "failing.test":
                raise RuntimeError("boom")
            return real_check_mail(site, alert)

        with patch('site_monitoring.core.requests.get', side_effect=requests.exceptions.ConnectionError), \
                patch('site_monitoring.core.socket.getaddrinfo', return_value=[_address('203.0.113.7')]), \
                patch('site_monitoring.core.resolver.Resolver', return_value=FakeResolver({})), \
                patch('site_monitoring.core.check_mail', side_effect=flaky_check_mail), \
                self.assertLogs('watcher.site_monitoring', level='ERROR') as logs:
            core.monitoring_check()

        healthy.refresh_from_db()
        self.assertEqual(healthy.ip, '203.0.113.7')
        self.assertTrue(any("failing.test" in line and "boom" in line for line in logs.output), logs.output)


class CheckIpResilienceTest(TestCase):

    def test_a_domain_that_cannot_be_encoded_is_treated_as_unresolvable(self):
        """getaddrinfo raises UnicodeError, not gaierror, for an empty or over-long DNS label:
        check_ip only caught gaierror, so such a site raised out of the whole monitoring run."""
        from site_monitoring.core import check_ip

        site = Site.objects.create(domain_name="bad..label.test", ip_monitoring=True)

        self.assertEqual(check_ip(site, 0), (0, "", ""))


class ContentHashTest(TestCase):
    """TLSH returns the string 'TNULL' for a page too short or too uniform to fingerprint."""

    def _check(self, site, text):
        from site_monitoring.core import check_content

        with patch('site_monitoring.core.requests.get', return_value=FakeWebResponse(text)):
            result = check_content(site, 0, None)
        site.refresh_from_db()
        return result

    def test_page_too_short_to_fingerprint_stores_no_hash(self):
        site = Site.objects.create(domain_name="parked.test", content_monitoring=True)

        self._check(site, "Coming soon")

        self.assertIsNone(site.content_fuzzy_hash)

    def test_hash_stored_by_an_older_version_does_not_break_the_check(self):
        site = Site.objects.create(domain_name="legacy-hash.test", content_monitoring=True, content_fuzzy_hash="TNULL")

        alert, score = self._check(site, _page(1))

        self.assertEqual((alert, score), (0, 0))
        self.assertTrue(site.content_fuzzy_hash.startswith("T1"), site.content_fuzzy_hash)

    def test_page_that_became_too_short_keeps_the_stored_hash_and_raises_nothing(self):
        site = Site.objects.create(domain_name="blanked.test", content_monitoring=True)
        self._check(site, _page(1))
        stored = site.content_fuzzy_hash

        alert, _ = self._check(site, "gone")

        self.assertEqual(alert, 0)
        self.assertEqual(site.content_fuzzy_hash, stored)

    def test_a_completely_different_page_is_still_reported(self):
        site = Site.objects.create(domain_name="rewritten.test", content_monitoring=True)
        self._check(site, _page(1))

        alert, score = self._check(site, _page(2))

        self.assertEqual(alert, 4)
        self.assertGreater(score, 160)


class CheckIpPoolTest(TestCase):
    """<site> resolving to a rotating pool of addresses spread over several /16 networks: the
    first two addresses of the (sorted) answer changed from one run to the next, and each change
    was an 'IP address changes detected' alert, up to one every 3 hours for ever."""

    def _check(self, site, ips):
        from site_monitoring.core import check_ip

        with patch('site_monitoring.core.socket.getaddrinfo', return_value=[_address(ip) for ip in ips]):
            alert = check_ip(site, 0)[0]
        site.refresh_from_db()
        return alert

    def test_pool_rotating_between_networks_already_seen_raises_no_alert(self):
        site = Site.objects.create(domain_name="pool.test", ip="3.126.5.188", ip_second="3.71.139.153")

        first = self._check(site, ["3.126.5.188", "98.83.184.133", "100.28.104.175"])
        second = self._check(site, ["3.71.139.153", "98.83.184.133", "100.28.104.175"])
        third = self._check(site, ["3.126.5.188", "3.71.139.153", "100.28.104.175"])

        self.assertNotEqual(first, 0)  # 98.83 and 100.28 are new networks for this site
        self.assertEqual((second, third), (0, 0))
        self.assertEqual(site.ip, "3.71.139.153")  # the stored addresses still follow the answer

    def test_the_networks_a_site_was_seen_in_are_remembered(self):
        site = Site.objects.create(domain_name="memory.test", ip="3.126.5.188", ip_second="3.71.139.153")

        self._check(site, ["3.126.5.188", "98.83.184.133", "100.28.104.175"])

        self.assertEqual(sorted(site.network_history), ["100.28.0.0/16", "3.126.0.0/16", "3.71.0.0/16", "98.83.0.0/16"])

    def test_a_genuinely_new_network_raises_an_alert(self):
        site = Site.objects.create(domain_name="moved.test", ip="3.126.5.188")

        self.assertEqual(self._check(site, ["203.0.113.7"]), 1)

    def test_first_resolution_raises_an_alert(self):
        site = Site.objects.create(domain_name="new-site.test")

        self.assertNotEqual(self._check(site, ["203.0.113.7"]), 0)

    def test_networks_seen_long_ago_are_forgotten(self):
        long_ago = (timezone.now() - timedelta(days=40)).isoformat(timespec='seconds')
        site = Site.objects.create(
            domain_name="forgotten.test", ip="3.126.5.188", network_history={"98.83.0.0/16": long_ago},
        )

        self.assertEqual(self._check(site, ["98.83.184.133"]), 1)

    def test_content_change_is_kept_when_the_ip_part_is_ignored(self):
        site = Site.objects.create(domain_name="both.test", ip="3.126.5.188")
        self._check(site, ["3.126.5.188", "98.83.184.133"])  # 98.83 becomes a known network

        from site_monitoring.core import check_ip

        with patch('site_monitoring.core.socket.getaddrinfo', return_value=[_address("98.83.184.133")]):
            alert = check_ip(site, 4)[0]  # 4: check_content found the page changed

        self.assertEqual(alert, 4)

    def test_sites_monitored_before_the_upgrade_are_not_flooded_with_alerts(self):
        """No history yet: the addresses already stored on the site count as known networks."""
        site = Site.objects.create(domain_name="upgraded.test", ip="3.126.5.188")  # ip_second not set yet

        self.assertEqual(self._check(site, ["3.126.5.188", "3.126.200.1"]), 0)


class CheckMailPoolTest(TestCase):
    DOMAIN = "mail-pool.test"

    def _check(self, site, answers):
        from site_monitoring.core import check_mail

        with patch('site_monitoring.core.resolver.Resolver', return_value=FakeResolver(answers)):
            alert = check_mail(site, 0)
        site.refresh_from_db()
        return alert

    def test_mail_pool_rotating_between_networks_already_seen_raises_no_alert(self):
        """Comparing the stored IP with the answer is not enough for a pool spread over many
        networks: the stored one is often absent from a 3-address answer."""
        site = Site.objects.create(domain_name=self.DOMAIN, mail_A_record_ip="54.157.108.158", MX_records=[])
        records = ("mail." + self.DOMAIN, "A")

        first = self._check(site, {records: ["3.126.5.188", "3.71.139.153"]})
        second = self._check(site, {records: ["3.126.5.188", "54.157.108.158"]})

        self.assertEqual(first, 8)  # 3.126 and 3.71 are new networks
        self.assertEqual(second, 0)

    def test_dns_timeout_is_not_a_change_of_the_records(self):
        """A timeout says nothing about the records: it cleared them (one alert), and the next
        answer brought them back (a second alert)."""
        import dns.exception

        site = Site.objects.create(
            domain_name=self.DOMAIN, mail_A_record_ip="54.157.108.158", MX_records=["10 mx.mail-pool.test."],
        )
        timeout = dns.exception.Timeout()

        alert = self._check(site, {("mail." + self.DOMAIN, "A"): timeout, (self.DOMAIN, "MX"): timeout})

        self.assertEqual(alert, 0)
        self.assertEqual(site.mail_A_record_ip, "54.157.108.158")
        self.assertEqual(site.MX_records, ["10 mx.mail-pool.test."])
