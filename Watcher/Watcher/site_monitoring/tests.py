from unittest.mock import patch, MagicMock
from django.test import TestCase, TransactionTestCase, SimpleTestCase, override_settings
from django.contrib.auth.models import User, Permission
from django.utils import timezone
from datetime import timedelta, date
from rest_framework.test import APITestCase, APIClient
from rest_framework import status
from knox.models import AuthToken
from site_monitoring.models import Site, Alert, Subscriber, MonitoredPage, PageVersion, PageScreenshot
from site_monitoring.core import monitoring_init, create_rdap_alert, create_banner_alert, create_alert
from common.core import _join_records, SCREENSHOT_MAX_BYTES, capture_page, screenshots_configured
from connectors.models import NotificationSetting
from site_monitoring import core
import requests

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
        subscriber = Subscriber.objects.create(user_rec=user, email=True)
        self.assertEqual(subscriber.user_rec, user)
        self.assertTrue(subscriber.email)
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


class RDAPLookupTest(TestCase):
    """Test the RDAP lookup of a site."""
    
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


class SiteBulkTest(APITestCase):
    """Bulk create / update / delete / export on /api/site_monitoring/ (common.bulk mixins)."""

    SITE_URL = '/api/site_monitoring/site/'

    def setUp(self):
        self.admin = User.objects.create_superuser(username='site_bulk_admin', password='testpass123')
        self._login(self.admin)
        patcher = patch('site_monitoring.api.monitoring_init')
        self.mock_monitoring_init = patcher.start()
        self.addCleanup(patcher.stop)

    def _login(self, user):
        _, token = AuthToken.objects.create(user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token}')

    def _sites(self, *names):
        return [Site.objects.create(domain_name=n, legitimacy=2) for n in names]

    def _post(self, action, body):
        return self.client.post(self.SITE_URL + action + '/', body, format='json')

    # ---- bulk create
    def test_bulk_create_creates_the_sites_with_the_shared_fields(self):
        with patch('threading.Thread'):
            response = self._post('bulk_create', {'values': 'bulk-a.com\nbulk-b.com', 'shared': {'legitimacy': 4}})
        self.assertEqual(response.data['created'], 2, response.data)
        self.assertEqual(Site.objects.filter(domain_name__in=['bulk-a.com', 'bulk-b.com'], legitimacy=4).count(), 2)

    def test_bulk_create_refuses_a_domain_that_is_already_a_legitimate_domain(self):
        from common.models import LegitimateDomain
        LegitimateDomain.objects.create(domain_name='legit.com')
        with patch('threading.Thread'):
            response = self._post('bulk_create', {'values': 'legit.com\nsuspicious.com', 'shared': {'legitimacy': 2}})
        self.assertEqual({r['value']: r['status'] for r in response.data['results']},
                         {'legit.com': 'error', 'suspicious.com': 'created'})

    def test_bulk_create_starts_a_single_sequential_monitoring_thread(self):
        with patch('threading.Thread') as thread_cls:
            response = self._post('bulk_create', {'values': 'site-a.com\nsite-b.com\nsite-c.com'})
        self.assertEqual(response.data['created'], 3)
        self.assertEqual(thread_cls.call_count, 1)
        thread_cls.call_args.kwargs['target']()  # run the deferred worker synchronously
        self.assertEqual(self.mock_monitoring_init.call_count, 3)

    def test_single_create_still_starts_its_own_monitoring_thread_and_normalizes_the_domain(self):
        with patch('threading.Thread') as thread_cls:
            response = self.client.post(self.SITE_URL, {'domain_name': 'HTTP://Site-Single.com:8080/'}, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertEqual(response.data['domain_name'], 'site-single.com')
        self.assertEqual(thread_cls.call_count, 1)

    def test_bulk_create_needs_the_add_permission(self):
        self._login(User.objects.create_user(username='site_reader', password='testpass123'))
        self.assertEqual(self._post('bulk_create', {'values': 'x.com'}).status_code, status.HTTP_403_FORBIDDEN)
        self.client.credentials()
        self.assertIn(self._post('bulk_create', {'values': 'x.com'}).status_code,
                      (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN))

    # ---- bulk delete / update
    def test_bulk_delete_removes_every_selected_row_and_reports_missing_ids(self):
        a, b = self._sites('del-a.com', 'del-b.com')
        response = self._post('bulk_delete', {'ids': [a.pk, b.pk, 999999]})
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual((response.data['succeeded'], response.data['skipped']), (2, 1))
        self.assertFalse(Site.objects.filter(pk__in=[a.pk, b.pk]).exists())

    def test_bulk_update_changes_several_whitelisted_fields_at_once(self):
        a, b = self._sites('upd-a.com', 'upd-b.com')
        response = self._post('bulk_update', {'ids': [a.pk, b.pk], 'changes': {'legitimacy': 5, 'takedown_request': True}})
        self.assertEqual(response.data['succeeded'], 2, response.data)
        for site in Site.objects.filter(pk__in=[a.pk, b.pk]):
            self.assertEqual((site.legitimacy, site.takedown_request), (5, True))

    def test_bulk_update_rejects_fields_outside_the_whitelist(self):
        (a,) = self._sites('upd-forbidden.com')
        response = self._post('bulk_update', {'ids': [a.pk], 'changes': {'domain_name': 'other.com'}})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        a.refresh_from_db()
        self.assertEqual(a.domain_name, 'upd-forbidden.com')

    def test_bulk_update_reports_validation_errors_per_row(self):
        a, b = self._sites('upd-val-a.com', 'upd-val-b.com')
        response = self._post('bulk_update', {'ids': [a.pk, b.pk], 'changes': {'legitimacy': 99}})
        self.assertEqual((response.data['succeeded'], response.data['errors']), (0, 2))

    def test_bulk_update_alert_status(self):
        (site,) = self._sites('alert-site.com')
        alerts = [Alert.objects.create(site=site, type='x') for _ in range(2)]
        response = self.client.post('/api/site_monitoring/alert/bulk_update/',
                                    {'ids': [a.pk for a in alerts], 'changes': {'status': False}}, format='json')
        self.assertEqual(response.data['succeeded'], 2, response.data)
        self.assertFalse(Alert.objects.filter(status=True).exists())

    def test_bulk_update_and_delete_need_the_change_and_delete_permissions(self):
        from django.contrib.auth.models import Permission
        (site,) = self._sites('perm.com')
        user = User.objects.create_user(username='site_no_perm', password='testpass123')
        self._login(user)
        self.assertEqual(self._post('bulk_delete', {'ids': [site.pk]}).status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(self._post('bulk_update', {'ids': [site.pk], 'changes': {'legitimacy': 3}}).status_code,
                         status.HTTP_403_FORBIDDEN)
        user.user_permissions.add(Permission.objects.get(codename='delete_site'))
        self._login(User.objects.get(pk=user.pk))
        self.assertEqual(self._post('bulk_delete', {'ids': [site.pk]}).data['succeeded'], 1)

    # ---- exports
    def test_bulk_export_to_legitimate_domains_removes_the_exported_sites(self):
        from common.models import LegitimateDomain
        a, b, c = self._sites('exp-a.com', 'exp-b.com', 'exp-c.com')
        LegitimateDomain.objects.create(domain_name='exp-b.com')
        response = self._post('bulk_export_legitimate', {'ids': [a.pk, b.pk, c.pk], 'comment': 'bulk export'})
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual((response.data['succeeded'], response.data['skipped']), (2, 1))
        self.assertEqual(LegitimateDomain.objects.get(domain_name='exp-a.com').comments, 'bulk export')
        # exported sites are removed from Website Monitoring, the skipped one is kept
        self.assertFalse(Site.objects.filter(pk__in=[a.pk, c.pk]).exists())
        self.assertTrue(Site.objects.filter(pk=b.pk).exists())
        self.assertIn('removed from Website Monitoring', response.data['results'][0]['reason'])

    def test_bulk_export_to_legitimate_domains_needs_the_delete_site_permission(self):
        from django.contrib.auth.models import Permission
        (site,) = self._sites('exp-perm.com')
        user = User.objects.create_user(username='exp_no_delete', password='testpass123')
        self._login(user)
        self.assertEqual(self._post('bulk_export_legitimate', {'ids': [site.pk]}).status_code, status.HTTP_403_FORBIDDEN)
        user.user_permissions.add(Permission.objects.get(codename='delete_site'))
        self._login(User.objects.get(pk=user.pk))
        self.assertEqual(self._post('bulk_export_legitimate', {'ids': [site.pk]}).data['succeeded'], 1)
        self.assertFalse(Site.objects.filter(pk=site.pk).exists())

    def test_bulk_export_to_misp_creates_one_event_per_site_or_updates_the_latest(self):
        a, b = self._sites('misp-a.com', 'misp-b.com')
        calls = []

        class FakeMISPSerializer:
            def __init__(self, data):
                self.data_in = data

            def is_valid(self, raise_exception=False):
                return True

            def save(self):
                calls.append(self.data_in)

        with patch('site_monitoring.api.MISPSerializer', FakeMISPSerializer), \
                patch('site_monitoring.api.get_misp_uuid', side_effect=lambda d: ['uuid-old', 'uuid-latest'] if d == 'misp-b.com' else []):
            response = self._post('bulk_export_misp', {'ids': [a.pk, b.pk]})
        self.assertEqual(response.data['succeeded'], 2, response.data)
        self.assertEqual(calls, [{'id': a.pk}, {'id': b.pk, 'event_uuid': 'uuid-latest'}])

    def test_bulk_export_to_misp_needs_the_add_site_permission(self):
        (site,) = self._sites('misp-perm.com')
        self._login(User.objects.create_user(username='misp_no_perm', password='testpass123'))
        self.assertEqual(self._post('bulk_export_misp', {'ids': [site.pk]}).status_code, status.HTTP_403_FORBIDDEN)


class SiteInitProgressTest(APITestCase):
    """New sites are checked in the background: the API says which ones are not finished yet."""

    URL = '/api/site_monitoring/site/'

    def setUp(self):
        self.admin = User.objects.create_superuser(username='init_admin', password='testpass123')
        _, token = AuthToken.objects.create(self.admin)
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token}')

    def test_pending_counts_only_sites_whose_first_check_is_not_finished(self):
        Site.objects.create(domain_name='checking-a.com', monitored=False)
        Site.objects.create(domain_name='checking-b.com', monitored=False)
        Site.objects.create(domain_name='done.com', monitored=True)
        response = self.client.get(self.URL + 'init_progress/')
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data, {'pending': 2})

    def test_expired_and_old_sites_are_not_reported_as_initializing(self):
        from datetime import timedelta
        from django.utils import timezone
        Site.objects.create(domain_name='expired.com', monitored=False, expiry=timezone.now() - timedelta(days=1))
        old = Site.objects.create(domain_name='crashed.com', monitored=False)
        Site.objects.filter(pk=old.pk).update(created_at=timezone.now() - timedelta(hours=7))
        self.assertEqual(self.client.get(self.URL + 'init_progress/').data, {'pending': 0})

    def test_unauthenticated_request_is_rejected(self):
        self.client.credentials()
        self.assertIn(self.client.get(self.URL + 'init_progress/').status_code,
                      (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN))


class SitePageAPITest(APITestCase):
    """Site / alert list filters, counters and statistics used by the Website Monitoring page."""

    SITES = '/api/site_monitoring/site/'
    ALERTS = '/api/site_monitoring/alert/'

    def setUp(self):
        _, token = AuthToken.objects.create(User.objects.create_superuser(username='site_page', password='testpass123'))
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token}')
        today = timezone.now().date()
        self.online = Site.objects.create(domain_name='online.com', legitimacy=5, monitored=True, web_status=200,
                                          takedown_request=True, registrar='Gandi', domain_expiry=today + timedelta(days=10))
        self.offline = Site.objects.create(domain_name='offline.com', legitimacy=2, monitored=True, web_status=None,
                                           domain_expiry=today - timedelta(days=1))
        self.pending = Site.objects.create(domain_name='pending.com', legitimacy=1, monitored=False)
        self.ip_alert = Alert.objects.create(site=self.online, type='IP address change detected')
        self.mail_alert = Alert.objects.create(site=self.online, type='Mail record + Web content changes detected', status=False)
        self.rdap_alert = Alert.objects.create(site=self.offline, type='RDAP registrar change detected',
                                               created_at=timezone.now() - timedelta(days=10))

    def names(self, query=''):
        response = self.client.get(self.SITES + query)
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        return sorted(r['domain_name'] for r in response.data['results'])

    def alert_ids(self, query=''):
        response = self.client.get(self.ALERTS + query)
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        return sorted(r['id'] for r in response.data['results'])

    def test_site_filters(self):
        self.assertEqual(self.names('?legitimacy=5,6'), ['online.com'])
        self.assertEqual(self.names('?web=online'), ['online.com'])
        self.assertEqual(self.names('?web=offline'), ['offline.com'])
        self.assertEqual(self.names('?web=pending'), ['pending.com'])
        # A past date nobody checked is not "expired" yet: it is unconfirmed (see SiteExpiryOnThePageTest)
        self.assertEqual(self.names('?expiry=expired'), [])
        self.assertEqual(self.names('?expiry=unconfirmed'), ['offline.com'])
        self.assertEqual(self.names('?expiry=expiring_soon'), ['online.com'])
        self.assertEqual(self.names('?action=takedown'), ['online.com'])
        self.assertEqual(self.names('?action=none'), ['offline.com', 'pending.com'])
        self.assertEqual(self.names('?search=gandi'), ['online.com'])

    def test_sites_carry_their_alert_counts(self):
        rows = self.client.get(self.SITES + '?ordering=-alerts_count').data['results']
        self.assertEqual((rows[0]['domain_name'], rows[0]['alerts_count'], rows[0]['open_alerts_count']), ('online.com', 2, 1))
        self.assertIsNotNone(rows[0]['last_alert_at'])

    def test_alert_filters_and_light_rows(self):
        self.assertEqual(self.alert_ids('?status=active'), sorted([self.ip_alert.id, self.rdap_alert.id]))
        self.assertEqual(self.alert_ids('?status=archived'), [self.mail_alert.id])
        self.assertEqual(self.alert_ids('?kind=mail'), [self.mail_alert.id])
        self.assertEqual(self.alert_ids('?kind=content'), [self.mail_alert.id])
        self.assertEqual(self.alert_ids('?kind=registration'), [self.rdap_alert.id])
        self.assertEqual(self.alert_ids('?period=7d'), sorted([self.ip_alert.id, self.mail_alert.id]))
        self.assertEqual(self.alert_ids('?search=offline'), [self.rdap_alert.id])
        row = self.client.get(self.ALERTS + '?kind=hosting').data['results'][0]
        self.assertEqual(row['site'], {'id': self.online.id, 'domain_name': 'online.com', 'legitimacy': 5})
        detail = self.client.get(self.ALERTS + f'{self.ip_alert.id}/').data
        self.assertEqual(detail['site']['registrar'], 'Gandi')

    def test_archiving_a_change_is_recorded_in_its_history(self):
        from timeline.models import TimelineEvent
        self.client.patch(self.ALERTS + f'{self.ip_alert.id}/', {'status': False}, format='json')
        event = TimelineEvent.objects.get(object_id=self.ip_alert.id, content_type__app_label='site_monitoring',
                                          content_type__model='alert', action='updated')
        self.assertEqual(event.diff, {'status': {'old': True, 'new': False}})

    def test_statistics(self):
        stats = self.client.get(self.SITES + 'statistics/').data
        self.assertEqual((stats['total'], stats['malicious'], stats['offline'], stats['expiringSoon']), (3, 1, 1, 1))
        self.assertEqual((stats['openAlerts'], stats['archivedAlerts']), (2, 1))
        self.assertEqual(stats['byLegitimacy'], {'5': 1, '2': 1, '1': 1})
        self.assertEqual(stats['alertsByKind']['mail'], 1)
        self.assertEqual(stats['alertsByKind']['hosting'], 1)
        self.assertEqual(len(stats['alertsPerDay']), 30)
        self.assertEqual(stats['alertsPerDay'][-1]['count'], 2)
        self.assertEqual(stats['topRegistrars'], [{'name': 'Gandi', 'count': 1}])


# Mail alert notification
class MailAlertNotificationTest(TestCase):
    """The mail fields of an alert are written after it is created: the notification has to carry them."""

    @patch('site_monitoring.core.time.sleep')
    @patch('site_monitoring.core.send_website_monitoring_notifications')
    def test_notification_carries_the_mx_records_stored_on_the_alert(self, send, _sleep):
        site = Site.objects.create(domain_name='mailnotif.example', monitored=True, mail_monitoring=True)
        # check_mail has already stored the MX it found; the site object handed to create_alert is the stale one
        Site.objects.filter(pk=site.pk).update(MX_records=['10 mx.mailnotif.example.'])

        create_alert(8, site, None, None, None)

        alert_data = send.call_args.args[1]
        self.assertEqual(alert_data['new_MX_records'], ['10 mx.mailnotif.example.'])

    @patch('site_monitoring.core.time.sleep')
    @patch('site_monitoring.core.send_website_monitoring_notifications')
    def test_nothing_is_added_when_the_alert_has_no_mail_data(self, send, _sleep):
        site = Site.objects.create(domain_name='nomail.example', monitored=True, mail_monitoring=True)

        create_alert(8, site, None, None, None)

        self.assertFalse(send.call_args.args[1].get('new_MX_records'))


class JoinRecordsTest(TestCase):
    def test_a_list_is_shown_on_one_line(self):
        self.assertEqual(_join_records(['10 mx1.example.', '20 mx2.example.']), '10 mx1.example., 20 mx2.example.')

    def test_empty_values_stay_empty(self):
        self.assertIsNone(_join_records([]))
        self.assertIsNone(_join_records(None))

    def test_a_text_is_left_alone(self):
        self.assertEqual(_join_records('mx.example.'), 'mx.example.')


# Monitored pages
def _html(*paragraphs, extra=''):
    return ('<html><head><title>t</title><script>var x = 1;</script></head><body><nav>Home About</nav>'
            + ''.join(f'<p>{p}</p>' for p in paragraphs) + extra + '<footer>© 2026</footer></body></html>').encode()


class ExtractTextTest(SimpleTestCase):
    def test_scripts_menus_and_footers_are_not_part_of_the_text(self):
        self.assertEqual(core.extract_page_text(_html('First post', 'Second post')), 'First post\nSecond post')

    def test_dates_hours_and_counters_do_not_count_as_a_change(self):
        first = core.extract_page_text(_html('Post of 2026-10-29 12:30', 'Read 3 hours ago', '1,204 views', 'Content'))
        second = core.extract_page_text(_html('Post of 2026-10-30 08:05', 'Read 5 hours ago', '1,310 views', 'Content'))
        self.assertEqual(first, second)
        self.assertEqual(first, 'Post of\nRead\nContent')

    def test_written_out_dates_are_ignored_too(self):
        self.assertEqual(core.extract_page_text(_html('Published 29 October 2026', 'October 30, 2026', 'Text')), 'Published\nText')

    def test_a_css_selector_keeps_only_that_part(self):
        body = _html('Outside', extra='<article><p>Inside</p></article>')
        self.assertEqual(core.extract_page_text(body, 'article'), 'Inside')

    def test_a_selector_that_matches_nothing_falls_back_to_the_whole_page(self):
        self.assertEqual(core.extract_page_text(_html('Text'), '#missing'), 'Text')

    def test_the_patterns_of_the_page_are_removed(self):
        self.assertEqual(core.extract_page_text(_html('Ticket ABC-123 open', 'Body'), ignore_patterns=r'ABC-\d+'),
                         'Ticket open\nBody')

    def test_an_invalid_pattern_never_stops_the_check(self):
        self.assertEqual(core.extract_page_text(_html('Body'), ignore_patterns='(unclosed'), 'Body')

    def test_hidden_elements_and_comments_are_left_out(self):
        body = b'<body><p hidden>secret</p><!-- comment --><p>Seen</p></body>'
        self.assertEqual(core.extract_page_text(body), 'Seen')

    def test_invalid_patterns_are_refused_with_a_message(self):
        with self.assertRaises(ValueError):
            core.compile_ignore_patterns('ok\n(unclosed')
        with self.assertRaises(ValueError):
            core.compile_ignore_patterns('a' * 201)

    def test_a_pattern_that_can_freeze_the_worker_is_refused(self):
        for pattern in ('(a+)+b', r'(?:\w+\s?)*', '(a*)*', '((ab)+c*)+', '(x+x+)+y'):
            with self.subTest(pattern=pattern), self.assertRaises(ValueError):
                core.compile_ignore_patterns(pattern)

    def test_ordinary_patterns_are_kept(self):
        patterns = core.compile_ignore_patterns('ABC-\\d+\nvisits: \\d{1,6}\n(?:cookies|tracking)\n\\d+ (views|likes)\n(ab){1,5}')
        self.assertEqual(len(patterns), 5)

    def test_an_old_slow_pattern_does_not_stop_the_check(self):
        self.assertEqual(core.extract_page_text(_html('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa!'), ignore_patterns='(a+)+b'),
                         'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa!')


class CompareTest(SimpleTestCase):
    def test_same_text_is_zero_and_different_text_is_a_hundred(self):
        self.assertEqual(core.compare_texts('a\nb', 'a\nb')[0], 0.0)
        self.assertEqual(core.compare_texts('aaa\nbbb', 'xxx\nyyy')[0], 100.0)

    def test_a_small_addition_is_a_small_ratio(self):
        old = '\n'.join(f'line number {i} of the article' for i in range(40))
        ratio, added, removed = core.compare_texts(old, old + '\nOne new sentence')
        self.assertTrue(0 < ratio < 5, ratio)
        self.assertEqual((added, removed), (['One new sentence'], []))

    def test_the_summary_is_short(self):
        added = [f'new line {i} ' + 'x' * 400 for i in range(10)]
        summary = core.summarize_change(added, [])
        self.assertEqual(len(summary['added']), core.PAGE_SUMMARY_LINES)
        self.assertEqual(summary['more_added'], 4)
        self.assertTrue(all(len(line) <= core.PAGE_SUMMARY_WIDTH for line in summary['added']))

    def test_the_rows_of_a_diff_cut_the_long_unchanged_parts(self):
        old = '\n'.join(f'same {i}' for i in range(30))
        rows = core.diff_rows(old, old + '\nnew')
        self.assertEqual([r['kind'] for r in rows], ['skip', 'same', 'same', 'same', 'add'])
        self.assertEqual(rows[0]['text'], '27')


class AddressTest(SimpleTestCase):
    def test_a_private_address_is_refused(self):
        for url in ('http://127.0.0.1/', 'http://10.0.0.5/admin', 'http://localhost/', 'ftp://example.com/'):
            with self.subTest(url=url), self.assertRaises(core.PageError):
                core.fetch_page(url)

    def test_a_redirect_to_a_private_address_is_refused(self):
        class Redirect:
            is_redirect = True
            status_code = 302
            headers = {'Location': 'http://127.0.0.1/secret'}
            def close(self): pass

        session = MagicMock()
        session.get.return_value = Redirect()
        with patch.object(core, 'is_public', side_effect=lambda host: host != '127.0.0.1'), \
                patch.object(core, 'page_session', return_value=session):
            with self.assertRaises(core.PageError):
                core.fetch_page('https://blog.example.org/')

    def test_the_connection_goes_to_the_address_that_was_checked(self):
        """DNS rebinding: a name that answers a public address to the check and a private one afterwards is refused."""
        answers = iter([[(2, 1, 6, '', ('93.184.216.34', 0))], [(2, 1, 6, '', ('127.0.0.1', 0))]])
        with patch.object(core.socket, 'getaddrinfo', side_effect=lambda *a, **k: next(answers)):
            self.assertTrue(core.is_public('rebind.example.org'))
            connection = core._PublicOnlyHTTPConnection('rebind.example.org', 80)
            with self.assertRaises(core.PageError):
                connection._new_conn()

    def test_a_public_address_is_connected_with_the_name_kept(self):
        connection = core._PublicOnlyHTTPConnection('blog.example.org', 80)
        with patch.object(core.socket, 'getaddrinfo', return_value=[(2, 1, 6, '', ('93.184.216.34', 0))]), \
                patch('urllib3.util.connection.create_connection') as create:
            connection._new_conn()
        self.assertEqual(create.call_args.args[0], ('93.184.216.34', 80))
        self.assertEqual(connection.host, 'blog.example.org')


class CheckPageTest(TestCase):
    def setUp(self):
        self.page = MonitoredPage.objects.create(url='https://blog.example.org/', name='Blog', threshold=10)

    def _check(self, body, status=200):
        with patch.object(core, 'fetch_page', return_value=(status, body)), \
                patch('site_monitoring.core.notify_page_change') as notify:
            version = core.check_page(MonitoredPage.objects.get(pk=self.page.pk))
        return version, notify

    def test_the_first_check_keeps_a_version_and_notifies_nothing(self):
        version, notify = self._check(_html('Hello'))
        self.assertIsNotNone(version)
        self.assertIsNone(version.change_ratio)
        notify.assert_not_called()

    def test_an_unchanged_page_adds_no_version(self):
        self._check(_html('Hello'))
        version, _ = self._check(_html('Hello'))
        self.assertIsNone(version)
        self.assertEqual(PageVersion.objects.count(), 1)

    def test_noise_alone_adds_no_version(self):
        self._check(_html('Hello', 'Updated 2026-10-29 10:00'))
        version, _ = self._check(_html('Hello', 'Updated 2026-10-30 11:12'))
        self.assertIsNone(version)

    def test_a_big_change_is_kept_and_notified(self):
        self._check(_html('Hello'))
        version, notify = self._check(_html('Something else entirely', 'with more text'))
        self.assertGreaterEqual(version.change_ratio, 10)
        notify.assert_called_once()
        self.assertTrue(PageVersion.objects.get(pk=version.pk).notified)

    def test_a_small_change_is_kept_but_not_notified(self):
        long_text = [f'paragraph {i} with enough words to weigh something' for i in range(60)]
        self._check(_html(*long_text))
        version, notify = self._check(_html(*long_text, 'a short new line'))
        self.assertLess(version.change_ratio, 10)
        notify.assert_not_called()
        self.assertEqual(PageVersion.objects.count(), 2)

    def test_the_status_of_the_page_is_recorded(self):
        self._check(None, status=404)
        self.page.refresh_from_db()
        self.assertEqual(self.page.last_status, 404)
        self.assertIsNotNone(self.page.last_checked)
        self.assertEqual(PageVersion.objects.count(), 0)

    def test_an_unreachable_page_is_recorded_without_a_version(self):
        with patch.object(core, 'fetch_page', side_effect=core.PageError('unreachable')):
            self.assertIsNone(core.check_page(self.page))
        self.page.refresh_from_db()
        self.assertIsNone(self.page.last_status)
        self.assertIsNotNone(self.page.last_checked)

    def test_only_the_newest_versions_are_kept(self):
        MonitoredPage.objects.filter(pk=self.page.pk).update(retention=3)
        for number in range(6):
            self._check(_html(f'Version {number} ' + 'text ' * (number + 1) + 'x' * number * 50))
        self.assertEqual(PageVersion.objects.filter(page=self.page).count(), 3)

    def test_a_failing_notification_does_not_lose_the_version(self):
        self._check(_html('Hello'))
        with patch.object(core, 'fetch_page', return_value=(200, _html('Entirely different words here'))), \
                patch('site_monitoring.core.notify_page_change', side_effect=RuntimeError('smtp down')):
            with self.assertRaises(RuntimeError):
                core.check_page(MonitoredPage.objects.get(pk=self.page.pk))
        self.assertEqual(PageVersion.objects.count(), 2)


class DuePagesTest(TestCase):
    def test_a_page_is_due_after_its_interval(self):
        from datetime import timedelta
        from django.utils import timezone
        now = timezone.now()
        never = MonitoredPage.objects.create(url='https://a.example.org/')
        recent = MonitoredPage.objects.create(url='https://b.example.org/', last_checked=now - timedelta(minutes=10))
        old = MonitoredPage.objects.create(url='https://c.example.org/', last_checked=now - timedelta(minutes=90))
        paused = MonitoredPage.objects.create(url='https://d.example.org/', is_active=False)
        due = core.due_pages(now)
        self.assertEqual({p.pk for p in due}, {never.pk, old.pk})
        self.assertNotIn(recent, due)
        self.assertNotIn(paused, due)


class NotificationTest(TestCase):
    def setUp(self):
        self.page = MonitoredPage.objects.create(url='https://blog.example.org/', name='Blog <b>')
        self.version = PageVersion.objects.create(page=self.page, text='x', content_hash='h', size=1, change_ratio=12.5)
        self.summary = {'added': ['New <script>alert(1)</script> & more'], 'removed': ['Old line'],
                        'more_added': 2, 'more_removed': 0}

    def test_the_text_of_the_page_is_escaped_for_each_channel(self):
        from site_monitoring.core import _page_context
        slack = _page_context(self.page, self.version, self.summary, 'slack')
        citadel = _page_context(self.page, self.version, self.summary, 'citadel')
        self.assertIn('&lt;script&gt;', slack['added_text'])
        self.assertNotIn('<script>', slack['added_text'])
        self.assertIn('&lt;script&gt;', citadel['added_text'])
        self.assertIn('<br>', citadel['added_text'])
        self.assertEqual(citadel['page_name'], 'Blog &lt;b&gt;')

    def test_the_context_says_how_much_changed_and_how_many_lines_are_left_out(self):
        from site_monitoring.core import _page_context
        context = _page_context(self.page, self.version, self.summary, 'slack')
        self.assertEqual(context['change_percent'], '12.5 %')
        self.assertIn('… and 2 more', context['added_text'])
        self.assertEqual(context['removed_text'], '• Old line')

    def test_one_failing_channel_does_not_stop_the_next_ones(self):
        from site_monitoring import core
        sent = []
        with patch.object(core, '_send_page_slack', side_effect=RuntimeError('boom')), \
                patch.object(core, '_send_page_citadel', lambda *a: sent.append('citadel')), \
                patch.object(core, '_send_page_email', lambda *a: sent.append('email')):
            with self.assertLogs('watcher.site_monitoring', level='INFO') as logs:
                core.notify_page_change(self.page, self.version, self.summary)
        self.assertEqual(sent, ['citadel', 'email'])
        self.assertIn('slack=failed', logs.output[-1])
        self.assertEqual(logs.records[-1].levelname, 'WARNING')

    def test_the_email_goes_to_the_subscribers_who_ticked_email(self):
        from site_monitoring import core
        from site_monitoring.models import Subscriber
        for name, wants in (('wants', True), ('declines', False)):
            Subscriber.objects.create(user_rec=User.objects.create_user(name, f'{name}@example.com'), email=wants)
        with patch('common.utils.send_email_notifications.send_email_notifications') as send:
            core._send_page_email(self.page, self.version, self.summary)
            send.assert_not_called()  # a notification is off until a superuser switches it on
            NotificationSetting.objects.create(notification_type='page_change', channel='email', enabled=True)
            core._send_page_email(self.page, self.version, self.summary)
        self.assertEqual(send.call_args.args[2], ['wants@example.com'])
        self.assertNotIn('<script>', send.call_args.args[1])


class PageApiTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user('analyst', 'analyst@example.com', 'pass')
        self.client.force_authenticate(self.user)
        self.page = MonitoredPage.objects.create(url='https://blog.example.org/', name='Blog')
        self.old = PageVersion.objects.create(page=self.page, text='one\ntwo', content_hash='a', size=7)
        self.new = PageVersion.objects.create(page=self.page, text='one\nthree', content_hash='b', size=9,
                                              change_ratio=40.0)

    def _allow(self, *codenames):
        self.user.user_permissions.add(*Permission.objects.filter(codename__in=codenames))
        self.user = User.objects.get(pk=self.user.pk)
        self.client.force_authenticate(self.user)

    def test_the_list_shows_the_history_figures(self):
        row = self.client.get('/api/site_monitoring/page/').json()['results'][0]
        self.assertEqual((row['versions_count'], row['last_ratio']), (2, 40.0))

    def test_creating_a_page_needs_the_permission(self):
        self.assertEqual(self.client.post('/api/site_monitoring/page/', {'url': 'https://x.example.org/'}).status_code, 403)
        self._allow('add_monitoredpage')
        self.assertEqual(self.client.post('/api/site_monitoring/page/', {'url': 'https://x.example.org/'}).status_code, 201)

    def test_the_input_is_validated(self):
        self._allow('add_monitoredpage')
        for payload in ({'url': 'ftp://x.example.org/'}, {'url': 'https://x.example.org/', 'threshold': 0},
                        {'url': 'https://x.example.org/', 'check_interval': 1},
                        {'url': 'https://x.example.org/', 'ignore_patterns': '(oops'},
                        {'url': 'https://x.example.org/', 'css_selector': 'div['}):
            with self.subTest(payload=payload):
                self.assertEqual(self.client.post('/api/site_monitoring/page/', payload).status_code, 400)

    def test_anonymous_visitors_see_nothing(self):
        self.assertIn(APIClient().get('/api/site_monitoring/page/').status_code, (401, 403))

    def test_versions_come_newest_first_without_their_text(self):
        data = self.client.get(f'/api/site_monitoring/page/{self.page.pk}/versions/').json()
        self.assertEqual([v['id'] for v in data], [self.new.pk, self.old.pk])
        self.assertNotIn('text', data[0])

    def test_one_version_gives_its_text(self):
        data = self.client.get(f'/api/site_monitoring/page/{self.page.pk}/versions/{self.old.pk}/').json()
        self.assertEqual(data['text'], 'one\ntwo')

    def test_a_version_of_another_page_is_not_found(self):
        other = MonitoredPage.objects.create(url='https://other.example.org/')
        foreign = PageVersion.objects.create(page=other, text='z', content_hash='z', size=1)
        self.assertEqual(self.client.get(f'/api/site_monitoring/page/{self.page.pk}/versions/{foreign.pk}/').status_code, 404)

    def test_the_diff_compares_the_last_two_versions_by_default(self):
        data = self.client.get(f'/api/site_monitoring/page/{self.page.pk}/diff/').json()
        self.assertEqual([(r['kind'], r['text']) for r in data['rows']],
                         [('same', 'one'), ('remove', 'two'), ('add', 'three')])
        self.assertEqual((data['from']['id'], data['to']['id']), (self.old.pk, self.new.pk))

    def test_the_diff_can_compare_chosen_versions(self):
        url = f'/api/site_monitoring/page/{self.page.pk}/diff/?from={self.new.pk}&to={self.old.pk}'
        self.assertEqual(self.client.get(url).json()['rows'][-1], {'kind': 'add', 'text': 'two'})

    def test_a_page_with_one_version_has_nothing_to_compare(self):
        other = MonitoredPage.objects.create(url='https://other.example.org/')
        PageVersion.objects.create(page=other, text='z', content_hash='z', size=1)
        self.assertEqual(self.client.get(f'/api/site_monitoring/page/{other.pk}/diff/').status_code, 400)

    def test_check_now_runs_a_check(self):
        self._allow('add_monitoredpage')
        with patch('site_monitoring.api.check_page', return_value=None) as check:
            response = self.client.post(f'/api/site_monitoring/page/{self.page.pk}/check/')
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.json()['changed'])
        check.assert_called_once()

    def test_pages_can_be_paused_in_bulk(self):
        self._allow('change_monitoredpage')
        response = self.client.post('/api/site_monitoring/page/bulk_update/',
                                    {'ids': [self.page.pk], 'changes': {'is_active': False}}, format='json')
        self.assertEqual(response.status_code, 200, response.content)
        self.page.refresh_from_db()
        self.assertFalse(self.page.is_active)


# Screenshots of the monitored pages
SERVICE = 'http://screenshotter:8080'
JPEG = b'\xff\xd8\xff\xe0fake-jpeg-bytes'


def _plain_html(*paragraphs):
    return ('<html><body>' + ''.join(f'<p>{p}</p>' for p in paragraphs) + '</body></html>').encode()


def _answer(status=200, content=JPEG, text=''):
    response = MagicMock()
    response.status_code, response.content, response.text = status, content, text
    return response


@override_settings(SCREENSHOT_SERVICE_URL=SERVICE)
class CaptureTest(TestCase):
    def test_the_address_of_the_page_is_sent_to_the_service_without_a_proxy(self):
        with patch('common.core.requests.post', return_value=_answer()) as post:
            self.assertEqual(capture_page('https://blog.example.org/'), JPEG)
        self.assertEqual(post.call_args.args[0], SERVICE + '/screenshot')
        self.assertEqual(post.call_args.kwargs['json'], {'url': 'https://blog.example.org/'})
        self.assertEqual(post.call_args.kwargs['proxies'], {'http': None, 'https': None})

    @override_settings(SCREENSHOT_SERVICE_URL='')
    def test_without_the_service_nothing_is_sent(self):
        with patch('common.core.requests.post') as post:
            self.assertIsNone(capture_page('https://blog.example.org/'))
        post.assert_not_called()
        self.assertFalse(screenshots_configured())

    def test_a_refusal_a_failure_or_a_silent_service_gives_nothing_and_is_logged(self):
        cases = (_answer(400, b'', 'address not allowed'), _answer(502, b'', 'capture failed'),
                 requests.exceptions.ConnectionError('down'), requests.exceptions.Timeout('slow'))
        for case in cases:
            kwargs = {'side_effect': case} if isinstance(case, Exception) else {'return_value': case}
            with self.subTest(case=str(case)[:30]), patch('common.core.requests.post', **kwargs):
                with self.assertLogs('watcher.common', level='WARNING'):
                    self.assertIsNone(capture_page('https://blog.example.org/'))

    def test_a_screenshot_that_is_too_big_is_not_kept(self):
        big = _answer(content=b'x' * (SCREENSHOT_MAX_BYTES + 1))
        with patch('common.core.requests.post', return_value=big):
            with self.assertLogs('watcher.common', level='WARNING'):
                self.assertIsNone(capture_page('https://blog.example.org/'))

    def test_a_new_screenshot_replaces_the_one_of_a_version(self):
        page = MonitoredPage.objects.create(url='https://blog.example.org/')
        version = PageVersion.objects.create(page=page, text='a', content_hash='a', size=1)
        for image in (b'first', b'second'):
            with patch('common.core.requests.post', return_value=_answer(content=image)):
                self.assertTrue(core.capture_for_version(page, version))
        self.assertEqual(PageScreenshot.objects.count(), 1)
        self.assertEqual(bytes(PageScreenshot.objects.get().image), b'second')


@override_settings(SCREENSHOT_SERVICE_URL=SERVICE)
class CheckPageScreenshotTest(TestCase):
    def setUp(self):
        self.page = MonitoredPage.objects.create(url='https://blog.example.org/', threshold=10)

    def _check(self, body):
        with patch.object(core, 'fetch_page', return_value=(200, body)), \
                patch('site_monitoring.core.notify_page_change'):
            return core.check_page(MonitoredPage.objects.get(pk=self.page.pk))

    def test_every_new_version_gets_a_screenshot_so_that_there_is_always_a_before(self):
        with patch('common.core.requests.post', return_value=_answer()) as post:
            first = self._check(_plain_html('Hello'))
            second = self._check(_plain_html('Something else entirely', 'with more text'))
        self.assertEqual(post.call_count, 2)
        self.assertEqual(set(PageScreenshot.objects.values_list('version_id', flat=True)), {first.pk, second.pk})

    def test_an_unchanged_page_is_not_captured_again(self):
        with patch('common.core.requests.post', return_value=_answer()) as post:
            self._check(_plain_html('Hello'))
            self._check(_plain_html('Hello'))
        self.assertEqual(post.call_count, 1)

    def test_a_page_can_be_left_out(self):
        MonitoredPage.objects.filter(pk=self.page.pk).update(capture_screenshots=False)
        with patch('common.core.requests.post') as post:
            self._check(_plain_html('Hello'))
        post.assert_not_called()

    def test_a_service_that_fails_does_not_lose_the_version(self):
        with patch('common.core.requests.post', side_effect=requests.exceptions.ConnectionError('down')):
            version = self._check(_plain_html('Hello'))
        self.assertIsNotNone(version)
        self.assertEqual(PageScreenshot.objects.count(), 0)

    def test_an_unexpected_error_does_not_lose_the_version_nor_the_notification(self):
        self._check(_plain_html('Hello'))
        with patch('site_monitoring.core.capture_for_version', side_effect=RuntimeError('disk full')), \
                patch.object(core, 'fetch_page', return_value=(200, _plain_html('Entirely different words here', 'and more'))), \
                patch('site_monitoring.core.notify_page_change') as notify:
            with self.assertLogs('watcher.site_monitoring', level='ERROR'):
                version = core.check_page(MonitoredPage.objects.get(pk=self.page.pk))
        self.assertIsNotNone(version)
        notify.assert_called_once()

    def test_the_screenshots_of_the_versions_that_are_trimmed_go_with_them(self):
        MonitoredPage.objects.filter(pk=self.page.pk).update(retention=2)
        with patch('common.core.requests.post', return_value=_answer()):
            for number in range(5):
                self._check(_plain_html(f'Version {number} ' + 'text ' * (number + 1) + 'x' * number * 50))
        self.assertEqual(PageVersion.objects.filter(page=self.page).count(), 2)
        self.assertEqual(PageScreenshot.objects.count(), 2)


@override_settings(SCREENSHOT_SERVICE_URL=SERVICE)
class ScreenshotApiTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user('analyst', 'analyst@example.com', 'pass')
        self.client.force_authenticate(self.user)
        self.page = MonitoredPage.objects.create(url='https://blog.example.org/', name='Blog')
        self.old = PageVersion.objects.create(page=self.page, text='one', content_hash='a', size=3)
        self.new = PageVersion.objects.create(page=self.page, text='two', content_hash='b', size=3, change_ratio=40.0)
        PageScreenshot.objects.create(version=self.old, image=JPEG, size=len(JPEG))

    def _allow(self, *codenames):
        self.user.user_permissions.add(*Permission.objects.filter(codename__in=codenames))
        self.user = User.objects.get(pk=self.user.pk)
        self.client.force_authenticate(self.user)

    def _url(self, suffix=''):
        return f'/api/site_monitoring/page/{self.page.pk}/{suffix}'

    def test_the_versions_say_which_ones_have_a_screenshot(self):
        data = {v['id']: v['has_screenshot'] for v in self.client.get(self._url('versions/')).json()}
        self.assertEqual(data, {self.old.pk: True, self.new.pk: False})

    def test_the_diff_says_it_too(self):
        data = self.client.get(self._url('diff/')).json()
        self.assertEqual((data['from']['has_screenshot'], data['to']['has_screenshot']), (True, False))

    def test_the_image_of_a_version_is_served_as_a_jpeg(self):
        response = self.client.get(self._url(f'versions/{self.old.pk}/screenshot/'), HTTP_ACCEPT='image/avif,image/webp,*/*')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response['Content-Type'], 'image/jpeg')
        self.assertEqual(response.content, JPEG)

    def test_a_version_without_screenshot_is_not_found(self):
        self.assertEqual(self.client.get(self._url(f'versions/{self.new.pk}/screenshot/')).status_code, 404)

    def test_the_image_of_another_page_is_not_reachable_through_this_one(self):
        other = MonitoredPage.objects.create(url='https://other.example.org/')
        foreign = PageVersion.objects.create(page=other, text='z', content_hash='z', size=1)
        PageScreenshot.objects.create(version=foreign, image=b'secret', size=6)
        self.assertEqual(self.client.get(self._url(f'versions/{foreign.pk}/screenshot/')).status_code, 404)

    def test_the_images_are_not_public(self):
        self.assertIn(APIClient().get(self._url(f'versions/{self.old.pk}/screenshot/')).status_code, (401, 403))

    def test_listing_the_versions_does_not_read_the_images(self):
        with self.assertNumQueries(2):  # the page, then its versions
            self.client.get(self._url('versions/'))

    def test_a_manual_capture_is_kept_with_the_newest_version(self):
        self._allow('add_monitoredpage')
        with patch('common.core.requests.post', return_value=_answer(content=b'manual')):
            response = self.client.post(self._url('screenshot/'))
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.json()['has_screenshot'], True)
        self.assertEqual(bytes(PageScreenshot.objects.get(version=self.new).image), b'manual')

    def test_a_manual_capture_needs_the_permission(self):
        self.assertEqual(self.client.post(self._url('screenshot/')).status_code, 403)

    @override_settings(SCREENSHOT_SERVICE_URL='')
    def test_a_manual_capture_says_when_the_service_is_not_configured(self):
        self._allow('add_monitoredpage')
        self.assertEqual(self.client.post(self._url('screenshot/')).status_code, 503)

    def test_a_manual_capture_says_when_the_service_fails(self):
        self._allow('add_monitoredpage')
        with patch('common.core.requests.post', side_effect=requests.exceptions.ConnectionError('down')):
            self.assertEqual(self.client.post(self._url('screenshot/')).status_code, 502)

    def test_a_page_without_version_cannot_be_captured(self):
        self._allow('add_monitoredpage')
        empty = MonitoredPage.objects.create(url='https://empty.example.org/')
        self.assertEqual(self.client.post(f'/api/site_monitoring/page/{empty.pk}/screenshot/').status_code, 400)

    def test_a_page_can_be_left_out_of_the_screenshots(self):
        self._allow('change_monitoredpage')
        response = self.client.patch(self._url(), {'capture_screenshots': False}, format='json')
        self.assertEqual(response.status_code, 200, response.content)
        self.assertFalse(response.json()['capture_screenshots'])


class UserAgentTest(SimpleTestCase):
    """The User-Agent of a monitored site's check comes from a fixed list: no network call, and no waiting on a dead service."""

    def test_the_user_agent_is_a_desktop_browser_from_the_fixed_list(self):
        for _ in range(50):
            agent = core.shadow_useragent.random_nomobile
            self.assertIn(agent, core.DESKTOP_USER_AGENTS)
            self.assertNotIn('Mobile', agent)
            self.assertNotIn('Android', agent)

    def test_picking_one_makes_no_network_call(self):
        with patch('requests.get', side_effect=AssertionError('network call')), \
                patch('socket.create_connection', side_effect=AssertionError('network call')):
            self.assertTrue(core.shadow_useragent.random_nomobile)

    @patch('site_monitoring.core._handle_banner_change')
    @patch('site_monitoring.core.Site.objects')
    @patch('site_monitoring.core.requests.get')
    def test_a_site_check_sends_one_request_with_that_user_agent(self, mock_get, mock_sites, _banner):
        mock_get.return_value = MagicMock(status_code=500)
        site = MagicMock(domain_name='example.test', content_monitoring=False)
        core.check_content(site, 0, core.shadow_useragent)
        self.assertEqual(mock_get.call_count, 1)
        self.assertIn(mock_get.call_args.kwargs['headers']['User-Agent'], core.DESKTOP_USER_AGENTS)


class SiteExpiryGuardsTest(TestCase):
    """The expiry date of a monitored site follows the same guards as the legitimate domains."""

    def _lookup(self, site, rdap=None, status='ok', registrar='Registrar Inc.', created=None):
        """One pass of the lookup. `rdap` is the expiry date the registry answers (None: it has nothing)."""
        from site_monitoring.core import perform_site_rdap_lookup
        with patch('site_monitoring.core.RDAPDiscovery') as r:
            r.return_value.status = status
            r.return_value.fetch_rdap_data.return_value = rdap is not None
            r.return_value.get_expiration_date.return_value = rdap
            r.return_value.get_registrar.return_value = registrar
            r.return_value.get_registration_date.return_value = created
            result = perform_site_rdap_lookup(site)
        site.refresh_from_db()
        return result

    def _site(self, name='guard-test.com', **extra):
        return Site.objects.create(domain_name=name, registrar='Registrar Inc.', **extra)

    def _expiry_alerts(self, site):
        return Alert.objects.filter(site=site, type="RDAP domain expiration change detected").count()

    def test_a_date_from_rdap_is_stored_and_confirmed(self):
        site = self._site()
        self._lookup(site, rdap='2027-05-05')
        self.assertEqual(site.domain_expiry, date(2027, 5, 5))
        self.assertEqual((site.domain_expiry_source, site.domain_expiry_check), ('RDAP', 'ok'))
        self.assertTrue(site.domain_expiry_confirmed)

    def test_a_registration_date_is_stored_and_follows_the_registry(self):
        site = self._site()
        self._lookup(site, rdap='2027-05-05', created='2020-01-02')
        self.assertEqual(site.domain_created_at, date(2020, 1, 2))
        self._lookup(site, rdap='2027-05-05', created='2026-11-01')  # registered again after it lapsed
        self.assertEqual(site.domain_created_at, date(2026, 11, 1))

    def test_nothing_is_asked_of_a_third_party(self):
        with self.assertRaises(ImportError):
            __import__('common.utils.whois')

    def test_an_earlier_rdap_date_waits_for_a_second_answer(self):
        site = self._site(domain_expiry=date(2027, 5, 5))
        self._lookup(site, rdap='2026-12-01')
        self.assertEqual(site.domain_expiry, date(2027, 5, 5))  # kept
        self.assertEqual(site.domain_expiry_pending, date(2026, 12, 1))
        self.assertEqual(site.domain_expiry_check, 'contradicted')
        self.assertFalse(site.domain_expiry_confirmed)
        self.assertEqual(self._expiry_alerts(site), 0)  # nothing changed yet: no alert
        self._lookup(site, rdap='2026-12-01')
        self.assertEqual(site.domain_expiry, date(2026, 12, 1))  # the same answer twice: written
        self.assertIsNone(site.domain_expiry_pending)
        self.assertEqual(self._expiry_alerts(site), 1)

    def test_a_different_earlier_answer_does_not_confirm_the_first(self):
        site = self._site(domain_expiry=date(2027, 5, 5))
        self._lookup(site, rdap='2026-12-01')
        self._lookup(site, rdap='2026-11-01')
        self.assertEqual(site.domain_expiry, date(2027, 5, 5))
        self.assertEqual(site.domain_expiry_pending, date(2026, 11, 1))

    def test_a_renewal_is_written_at_once_with_an_alert(self):
        site = self._site(domain_expiry=date(2026, 12, 1))
        self._lookup(site, rdap='2027-12-01')
        self.assertEqual(site.domain_expiry, date(2027, 12, 1))
        self.assertEqual(self._expiry_alerts(site), 1)

    def test_a_domain_the_registry_does_not_know_is_recorded(self):
        site = Site.objects.create(domain_name='unknown-domain.com')  # never registered: no registrar, nothing known
        result = self._lookup(site, rdap=None, status='not_found')
        self.assertFalse(result)
        self.assertEqual(site.domain_expiry_check, 'not_registered')

    def test_nobody_answering_is_told_apart_and_does_not_touch_the_last_answer_time(self):
        site = self._site()
        self._lookup(site, rdap=None, status='unsupported')
        self.assertEqual(site.domain_expiry_check, 'unsupported')
        self.assertIsNone(site.domain_expiry_checked_at)
        self._lookup(site, rdap=None, status='error')
        self.assertEqual(site.domain_expiry_check, 'unreachable')

    def test_a_site_the_registry_gives_no_date_for_does_not_raise_an_alert_on_every_pass(self):
        site = self._site()
        for _ in range(3):
            self._lookup(site, rdap=None, status='unsupported')
        self.assertEqual(Alert.objects.filter(site=site).count(), 0)

    def test_the_first_answer_of_the_registry_is_the_starting_point_not_an_alert(self):
        site = Site.objects.create(domain_name='first-answer.com')  # no registrar, no date yet
        self._lookup(site, rdap='2027-05-05')
        self._lookup(site, rdap='2027-05-05')
        self.assertEqual(Alert.objects.filter(site=site).count(), 0)
        self.assertEqual(site.registrar, 'Registrar Inc.')
        self.assertEqual(str(site.domain_expiry), '2027-05-05')

    def test_a_later_change_of_registrar_is_still_an_alert(self):
        site = Site.objects.create(domain_name='moved-registrar.com')
        self._lookup(site, rdap='2027-05-05')
        self._lookup(site, rdap='2027-05-05', registrar='Another Registrar')
        self.assertEqual(Alert.objects.filter(site=site, type='RDAP registrar change detected').count(), 1)

    def test_the_lookup_does_not_put_back_what_the_monitoring_wrote_meanwhile(self):
        """The sites are read at the start of a long pass: saving the whole row undid the work of the monitoring."""
        site = Site.objects.create(domain_name='stale-snapshot.com', MX_records=['10 old.mx.'], ip='10.0.0.1', content_fuzzy_hash='old')
        Site.objects.filter(pk=site.pk).update(MX_records=['10 new.mx.'], ip='10.0.0.2', content_fuzzy_hash='new', server_banner='nginx/1')
        self._lookup(site, rdap='2027-05-05')  # the object given is the one read before
        self.assertEqual(site.registrar, 'Registrar Inc.')
        self.assertEqual(site.MX_records, ['10 new.mx.'])
        self.assertEqual((site.ip, site.content_fuzzy_hash, site.server_banner), ('10.0.0.2', 'new', 'nginx/1'))


class SiteExpiryOnThePageTest(APITestCase):
    """What the Website Monitoring page learns about the domain expiry: confirmed or not, and where it comes from."""

    SITES = '/api/site_monitoring/site/'

    def setUp(self):
        _, token = AuthToken.objects.create(User.objects.create_superuser(username='site_expiry', password='testpass123'))
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token}')
        self.today = timezone.now().date()
        past = self.today - timedelta(days=5)
        checked = dict(domain_expiry_check='ok', domain_expiry_source='RDAP', domain_expiry_checked_at=timezone.now())
        self.confirmed = Site.objects.create(domain_name='confirmed.com', domain_expiry=past, **checked)
        self.whois = Site.objects.create(domain_name='whois.com', domain_expiry=past, domain_expiry_check='ok',
                                         domain_expiry_source='WHOIS', domain_expiry_checked_at=timezone.now())
        self.stale = Site.objects.create(domain_name='stale.com', domain_expiry=past, domain_expiry_check='ok',
                                         domain_expiry_source='RDAP',
                                         domain_expiry_checked_at=timezone.now() - timedelta(days=8))
        self.unchecked = Site.objects.create(domain_name='unchecked.com', domain_expiry=past)
        self.future = Site.objects.create(domain_name='future.com', domain_expiry=self.today + timedelta(days=90), **checked)

    def names(self, query):
        response = self.client.get(self.SITES + query)
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        return sorted(r['domain_name'] for r in response.data['results'])

    def test_a_past_date_is_expired_only_when_a_registry_confirmed_it(self):
        self.assertEqual(self.names('?expiry=expired'), ['confirmed.com'])
        self.assertEqual(self.names('?expiry=unconfirmed'), ['stale.com', 'unchecked.com', 'whois.com'])

    def test_unverified_lists_the_dates_no_registry_checked_lately(self):
        self.assertEqual(self.names('?expiry=unverified'), ['stale.com', 'unchecked.com'])

    def test_the_list_says_whether_each_date_is_confirmed_and_hides_the_pending_answer(self):
        rows = {r['domain_name']: r for r in self.client.get(self.SITES).data['results']}
        self.assertTrue(rows['confirmed.com']['domain_expiry_confirmed'])
        self.assertFalse(rows['whois.com']['domain_expiry_confirmed'])
        self.assertFalse(rows['stale.com']['domain_expiry_confirmed'])
        self.assertEqual(rows['whois.com']['domain_expiry_source'], 'WHOIS')
        self.assertNotIn('domain_expiry_pending', rows['whois.com'])

    def test_the_statistics_count_the_unconfirmed_and_the_unverified(self):
        stats = self.client.get(self.SITES + 'statistics/').data
        self.assertEqual((stats['unconfirmed'], stats['unverified']), (3, 2))

    def test_a_date_typed_by_hand_is_marked_manual_and_stops_waiting_for_a_registry(self):
        Site.objects.filter(pk=self.confirmed.pk).update(domain_expiry_pending=self.today, domain_expiry_pending_source='RDAP',
                                                         domain_expiry_pending_at=timezone.now())
        response = self.client.patch(f'{self.SITES}{self.confirmed.pk}/', {'domain_expiry': '2030-01-01'}, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.confirmed.refresh_from_db()
        self.assertEqual((self.confirmed.domain_expiry_source, self.confirmed.domain_expiry_check), ('manual', None))
        self.assertIsNone(self.confirmed.domain_expiry_pending)
        self.assertFalse(self.confirmed.domain_expiry_confirmed)

    def test_saving_the_same_date_again_keeps_what_the_registry_said(self):
        response = self.client.patch(f'{self.SITES}{self.confirmed.pk}/',
                                     {'domain_expiry': self.confirmed.domain_expiry.isoformat(), 'legitimacy': 3}, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.confirmed.refresh_from_db()
        self.assertEqual(self.confirmed.domain_expiry_source, 'RDAP')
        self.assertTrue(self.confirmed.domain_expiry_confirmed)


class SiteExpiringNotificationTest(TestCase):
    """The notification about the domain of a monitored website close to expiry."""

    def setUp(self):
        self.today = timezone.now().date()

    def _site(self, days, name='soon.com', **extra):
        values = dict(domain_expiry=self.today + timedelta(days=days), domain_expiry_source='RDAP', domain_expiry_check='ok',
                      domain_expiry_checked_at=timezone.now(), legitimacy=5, registrar='Gandi')
        values.update(extra)
        return Site.objects.create(domain_name=name, **values)

    def _notify(self, site):
        from common.utils import expiry_alerts
        with patch('common.utils.expiry_alerts._send', return_value=True) as send:
            return expiry_alerts.notify_site_expiring(site), send

    def test_a_confirmed_date_within_thirty_days_notifies_once_per_date(self):
        site = self._site(12, takedown_request=True, ticket_id='T-9')
        sent, send = self._notify(site)
        self.assertTrue(sent)
        type_id, ctx = send.call_args.args[0], send.call_args.args[1]
        self.assertEqual(type_id, 'site_domain_expiring')
        self.assertEqual((ctx['days_text'], ctx['actions'], ctx['ticket']), ('in 12 days', 'Takedown requested', 'T-9'))
        self.assertEqual(ctx['legitimacy_label'], 'Malicious (registered)')
        site.refresh_from_db()
        self.assertEqual(site.domain_expiry_alerted, site.domain_expiry)
        self.assertFalse(self._notify(site)[0])  # the same date: nothing more
        site.domain_expiry = self.today + timedelta(days=5)  # renewed: a new date
        self.assertTrue(self._notify(site)[0])

    def test_nothing_goes_out_for_a_far_past_unconfirmed_or_empty_date(self):
        cases = [
            self._site(31, 'far.com'), self._site(-1, 'past.com'),
            self._site(10, 'whois.com', domain_expiry_source='WHOIS'),
            self._site(10, 'manual.com', domain_expiry_source='manual', domain_expiry_check=None),
            self._site(10, 'stale.com', domain_expiry_checked_at=timezone.now() - timedelta(days=8)),
            Site.objects.create(domain_name='empty.com'),
        ]
        for site in cases:
            with self.subTest(site=site.domain_name):
                sent, send = self._notify(site)
                self.assertFalse(sent)
                send.assert_not_called()

    def test_with_every_channel_off_nothing_is_marked(self):
        from common.utils import expiry_alerts
        site = self._site(12)
        with patch('connectors.notifications.is_enabled', return_value=False):
            self.assertFalse(expiry_alerts.notify_site_expiring(site))
        site.refresh_from_db()
        self.assertIsNone(site.domain_expiry_alerted)

    def test_it_is_off_by_default(self):
        from connectors.notifications import is_enabled
        for channel in ('slack', 'citadel', 'email'):
            self.assertFalse(is_enabled('site_domain_expiring', channel))

    def test_the_lookup_notifies_when_the_registry_says_the_date_is_close(self):
        site = Site.objects.create(domain_name='lookup.com', registrar='Gandi')
        answer = (self.today + timedelta(days=9)).isoformat()
        with patch('site_monitoring.core.RDAPDiscovery') as rdap, \
                patch('common.utils.expiry_alerts._send', return_value=True) as send:
            rdap.return_value.status = 'ok'
            rdap.return_value.fetch_rdap_data.return_value = True
            rdap.return_value.get_registrar.return_value = 'Gandi'
            rdap.return_value.get_expiration_date.return_value = answer
            from site_monitoring.core import perform_site_rdap_lookup
            perform_site_rdap_lookup(site)
            perform_site_rdap_lookup(site)  # the next pass of the job: no second message
        self.assertEqual([c.args[0] for c in send.call_args_list], ['site_domain_expiring'])

    def test_a_date_that_gets_close_without_changing_still_notifies(self):
        # The date was stored weeks ago and the registry still says the same: it became close by itself
        site = self._site(20, 'waiting.com')
        with patch('site_monitoring.core.RDAPDiscovery') as rdap, \
                patch('common.utils.expiry_alerts._send', return_value=True) as send:
            rdap.return_value.status = 'ok'
            rdap.return_value.fetch_rdap_data.return_value = True
            rdap.return_value.get_registrar.return_value = 'Gandi'
            rdap.return_value.get_expiration_date.return_value = site.domain_expiry.isoformat()
            from site_monitoring.core import perform_site_rdap_lookup
            self.assertFalse(perform_site_rdap_lookup(site))  # nothing changed...
        send.assert_called_once()  # ...and it still says so

    def test_a_failing_channel_does_not_stop_the_lookup(self):
        site = self._site(12)
        with patch('common.utils.expiry_alerts._send', side_effect=RuntimeError('down')):
            from common.utils import expiry_alerts
            self.assertFalse(expiry_alerts.notify_site_expiring(site))


class SiteDomainAvailableNotificationTest(TestCase):
    """The notification for a monitored website whose domain goes from registered to not registered."""

    def _pass(self, site, status='not_found'):
        """One pass of the lookup in which the registry answers `status` (not_found: the domain does not exist)."""
        from site_monitoring.core import perform_site_rdap_lookup
        with patch('site_monitoring.core.RDAPDiscovery') as rdap, \
                patch('common.utils.expiry_alerts._send', return_value=True) as send:
            rdap.return_value.status = status
            rdap.return_value.fetch_rdap_data.return_value = status == 'ok'
            rdap.return_value.get_registrar.return_value = 'Gandi'
            rdap.return_value.get_expiration_date.return_value = '2027-05-05'
            perform_site_rdap_lookup(site)
        site.refresh_from_db()
        return [c.args[0] for c in send.call_args_list if c.args[0] == 'site_domain_available']

    def test_a_registered_domain_the_registry_no_longer_knows_notifies_at_the_second_answer(self):
        site = Site.objects.create(domain_name='dropped.com', registrar='Gandi', domain_expiry_check='ok',
                                   domain_expiry_source='RDAP', domain_expiry_checked_at=timezone.now())
        self.assertEqual(self._pass(site), [])  # one answer is not enough
        self.assertEqual(site.domain_expiry_check, 'vanished')
        self.assertEqual(self._pass(site), ['site_domain_available'])  # the same answer twice in a row
        self.assertEqual(site.domain_expiry_check, 'not_registered')

    def test_it_is_said_once_not_on_every_pass(self):
        site = Site.objects.create(domain_name='dropped.com', registrar='Gandi', domain_expiry_check='ok')
        sent = [self._pass(site) for _ in range(4)]
        self.assertEqual(sum(len(s) for s in sent), 1)

    def test_a_domain_that_never_was_registered_says_nothing(self):
        site = Site.objects.create(domain_name='never.com')
        for _ in range(3):
            self.assertEqual(self._pass(site), [])
        self.assertEqual(site.domain_expiry_check, 'not_registered')

    def test_a_domain_already_known_as_not_registered_says_nothing(self):
        site = Site.objects.create(domain_name='gone.com', registrar='Gandi', domain_expiry_check='not_registered')
        self.assertEqual(self._pass(site), [])
        self.assertEqual(site.domain_expiry_check, 'not_registered')

    def test_a_registry_that_answers_again_between_the_two_cancels_the_first(self):
        site = Site.objects.create(domain_name='flaky.com', registrar='Gandi', domain_expiry_check='ok')
        self._pass(site)  # vanished
        self._pass(site, status='ok')  # the registry knows it again
        self.assertEqual(site.domain_expiry_check, 'ok')
        self.assertEqual(self._pass(site), [])  # a new first answer, not a second one
        self.assertEqual(site.domain_expiry_check, 'vanished')

    def test_a_domain_that_comes_back_and_goes_again_notifies_again(self):
        site = Site.objects.create(domain_name='again.com', registrar='Gandi', domain_expiry_check='ok')
        self._pass(site)
        self.assertEqual(self._pass(site), ['site_domain_available'])
        self._pass(site, status='ok')  # registered again
        self._pass(site)
        self.assertEqual(self._pass(site), ['site_domain_available'])

    def test_the_message_names_the_last_registrar_and_expiry(self):
        from common.utils import expiry_alerts
        site = Site.objects.create(domain_name='dropped.com', registrar='Gandi', legitimacy=5, takedown_request=True,
                                   domain_expiry=date(2026, 11, 2), ticket_id='T-5')
        ctx = expiry_alerts.site_available_context(site)
        self.assertEqual((ctx['registrar'], ctx['expiry'], ctx['actions'], ctx['ticket']), ('Gandi', '2026-11-02', 'Takedown requested', 'T-5'))
        self.assertEqual(ctx['domain_name_sanitized'], 'dropped[.]com')

    def test_it_is_off_by_default(self):
        from connectors.notifications import is_enabled
        for channel in ('slack', 'citadel', 'email'):
            self.assertFalse(is_enabled('site_domain_available', channel))

    def test_a_failing_channel_does_not_stop_the_lookup(self):
        from common.utils import expiry_alerts
        site = Site.objects.create(domain_name='dropped.com', registrar='Gandi')
        with patch('common.utils.expiry_alerts._send', side_effect=RuntimeError('down')):
            self.assertFalse(expiry_alerts.notify_site_available(site))


class MxConfirmationTest(TestCase):
    """The MX records are said to be gone only when two passes in a row find none: one empty answer can be a resolver failing."""

    DOMAIN = 'mx-confirm.test'

    def _site(self, mx=('10 mx.mx-confirm.test.',)):
        return Site.objects.create(domain_name=self.DOMAIN, MX_records=None if mx is None else list(mx), mail_A_record_ip=None, mail_monitoring=True)

    def _check(self, site, answer=None):
        from site_monitoring.core import check_mail
        answers = {} if answer is None else {(self.DOMAIN, 'MX'): answer}  # nothing in the table: the name does not exist
        with patch('site_monitoring.core.resolver.Resolver', return_value=FakeResolver(answers)):
            alert = check_mail(site, 0)
        site.refresh_from_db()
        return alert

    def test_one_empty_answer_is_not_a_change(self):
        site = self._site()
        self.assertEqual(self._check(site), 0)
        self.assertEqual(site.MX_records, ['10 mx.mx-confirm.test.'])
        self.assertEqual(site.mx_missed, 1)

    def test_a_second_empty_answer_in_a_row_confirms_it_once(self):
        site = self._site()
        self._check(site)
        self.assertEqual(self._check(site), 8)
        self.assertEqual((site.MX_records, site.mx_missed), ([], 0))
        self.assertEqual(self._check(site), 0)  # told once

    def test_the_records_coming_back_start_the_count_again(self):
        site = self._site()
        self._check(site)
        self.assertEqual(self._check(site, ['10 mx.mx-confirm.test.']), 0)
        self.assertEqual(site.mx_missed, 0)
        self.assertEqual(self._check(site), 0)  # a new first miss, not the second
        self.assertEqual(site.MX_records, ['10 mx.mx-confirm.test.'])

    def test_servers_that_do_not_answer_say_nothing_about_the_records(self):
        import dns.exception
        import dns.resolver
        for error in (dns.resolver.NoNameservers(), dns.exception.Timeout(), dns.exception.DNSException()):
            site = self._site()
            for _ in range(3):
                self.assertEqual(self._check(site, error), 0)
            self.assertEqual((site.MX_records, site.mx_missed), (['10 mx.mx-confirm.test.'], 0), type(error).__name__)
            site.delete()

    def test_a_site_never_checked_gets_its_starting_point_without_an_alert(self):
        site = self._site(mx=None)
        self.assertEqual(self._check(site), 0)
        self.assertEqual(site.MX_records, [])

    def test_records_that_change_are_still_told_at_once(self):
        site = self._site()
        self.assertEqual(self._check(site, ['10 other.mx-confirm.test.']), 8)
        self.assertEqual(site.MX_records, ['10 other.mx-confirm.test.'])


class BannerKeyTest(TestCase):
    """A banner changes when its products or their major version do, not for a patch or a distribution in brackets."""

    def _handle(self, site, server, powered=''):
        from site_monitoring.core import _handle_banner_change
        response = MagicMock(headers={'Server': server, 'X-Powered-By': powered})
        with patch('site_monitoring.core.send_website_monitoring_notifications'):
            _handle_banner_change(site, response)
        site.refresh_from_db()
        return Alert.objects.filter(site=site, type='Server banner change detected').count()

    def _site(self, server='nginx/1.28.3 (Ubuntu)', powered=''):
        return Site.objects.create(domain_name='banner-key.test', server_banner=server, x_powered_by=powered)

    def test_the_key_keeps_products_and_major_versions(self):
        from site_monitoring.core import banner_key
        self.assertEqual(banner_key('nginx/1.28.3 (Ubuntu)'), banner_key('nginx/1.28.3'))
        self.assertEqual(banner_key('Apache/2.4.58 (Debian) OpenSSL/3.0.13'), banner_key('openssl/3.1.0 apache/2.4.1'))
        self.assertNotEqual(banner_key('Apache/2.4.58'), banner_key('Apache/3.0.0'))
        self.assertNotEqual(banner_key('nginx'), banner_key('Apache'))
        self.assertEqual(banner_key(None), banner_key(''))

    def test_a_distribution_in_brackets_is_not_a_change_but_is_stored(self):
        site = self._site('nginx/1.28.3 (Ubuntu)')
        self.assertEqual(self._handle(site, 'nginx/1.28.3'), 0)
        self.assertEqual(site.server_banner, 'nginx/1.28.3')

    def test_a_patch_of_the_same_major_version_is_not_a_change(self):
        site = self._site('nginx/1.28.3')
        self.assertEqual(self._handle(site, 'nginx/1.28.9'), 0)
        self.assertEqual(site.server_banner, 'nginx/1.28.9')

    def test_another_product_or_major_version_is_a_change(self):
        site = self._site('Apache/2.4.58')
        self.assertEqual(self._handle(site, 'nginx/1.28.3'), 1)
        Alert.objects.all().delete()  # a second banner alert within the hour is held back by create_banner_alert
        self.assertEqual(self._handle(site, 'nginx/2.0.0'), 1)

    def test_the_powered_by_header_follows_the_same_rule(self):
        site = self._site('nginx/1', powered='PHP/8.2.1')
        self.assertEqual(self._handle(site, 'nginx/1', 'PHP/8.2.9'), 0)
        self.assertEqual(self._handle(site, 'nginx/1', 'PHP/9.0.0'), 1)


class SiteCommentsTest(APITestCase):
    """A website has comments, as a legitimate domain has: written, kept, searched, limited to 300 characters."""

    URL = '/api/site_monitoring/site/'

    def setUp(self):
        user = User.objects.create_superuser(username='site_comments', password='testpass123')
        _, token = AuthToken.objects.create(user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token}')

    def test_a_website_is_created_and_changed_with_its_comments(self):
        site = Site.objects.create(domain_name='commented-site.com', comments='Seen in a phishing campaign')
        self.assertEqual(self.client.get(f'{self.URL}{site.pk}/').data['comments'], 'Seen in a phishing campaign')
        response = self.client.patch(f'{self.URL}{site.pk}/', {'comments': 'Takedown sent'}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        site.refresh_from_db()
        self.assertEqual(site.comments, 'Takedown sent')

    def test_the_list_is_searched_in_the_comments_too(self):
        Site.objects.create(domain_name='one-site.com', comments='Moved from Legitimate Domains')
        Site.objects.create(domain_name='two-site.com', comments='Campaign of March')
        names = [r['domain_name'] for r in self.client.get(self.URL, {'search': 'Legitimate Domains'}).data['results']]
        self.assertEqual(names, ['one-site.com'])

    def test_a_comment_is_limited_to_300_characters(self):
        site = Site.objects.create(domain_name='long-comment.com')
        self.assertEqual(self.client.patch(f'{self.URL}{site.pk}/', {'comments': 'x' * 301}, format='json').status_code, 400)
        self.assertEqual(self.client.patch(f'{self.URL}{site.pk}/', {'comments': 'x' * 300}, format='json').status_code, 200)

    def test_the_comments_of_a_bulk_add_go_to_every_website(self):
        response = self.client.post(f'{self.URL}bulk_create/', {'values': 'bulk-a.com\nbulk-b.com', 'shared': {'comments': 'From the campaign'}}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(list(Site.objects.filter(domain_name__startswith='bulk-').values_list('comments', flat=True)), ['From the campaign'] * 2)
