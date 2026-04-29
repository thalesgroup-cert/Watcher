from django.test import TestCase, TransactionTestCase
from django.contrib.auth.models import User
from django.utils import timezone
from rest_framework.test import APITestCase
from rest_framework import status
from knox.models import AuthToken
from unittest.mock import patch, MagicMock

from .models import CVEAlert, RansomwareGroup, RansomwareVictim, WatchRule, WatchRuleHit


class CVEAlertModelTest(TestCase):
    def test_create_cve_alert(self):
        cve = CVEAlert.objects.create(
            cve_id='CVE-2025-99999',
            description='Test vulnerability',
            cvss_score=9.8,
            severity='CRITICAL'
        )
        self.assertEqual(str(cve), 'CVE-2025-99999')
        self.assertFalse(cve.is_archived)


class CVEAlertConstraintTest(TransactionTestCase):
    """Constraint tests must use TransactionTestCase to avoid broken transactions on MySQL."""

    def test_unique_cve_id(self):
        CVEAlert.objects.create(cve_id='CVE-2025-00001')
        with self.assertRaises(Exception):
            CVEAlert.objects.create(cve_id='CVE-2025-00001')


class RansomwareGroupModelTest(TestCase):
    def test_create_group(self):
        group = RansomwareGroup.objects.create(name='LockBit', source='ransomware.live')
        self.assertEqual(str(group), 'LockBit')


class RansomwareGroupConstraintTest(TransactionTestCase):
    def test_unique_group_name(self):
        RansomwareGroup.objects.create(name='UniqueGroup')
        with self.assertRaises(Exception):
            RansomwareGroup.objects.create(name='UniqueGroup')


class RansomwareVictimModelTest(TestCase):
    def setUp(self):
        self.group = RansomwareGroup.objects.create(name='TestGroup')

    def test_create_victim(self):
        victim = RansomwareVictim.objects.create(
            group=self.group,
            victim_name='ACME Corp',
            country='US',
            sector='Finance'
        )
        self.assertEqual(str(victim), 'ACME Corp (TestGroup)')
        self.assertFalse(victim.is_archived)


class RansomwareVictimConstraintTest(TransactionTestCase):
    def test_unique_together_constraint(self):
        group = RansomwareGroup.objects.create(name='ConstraintGroup')
        attacked = timezone.now()
        RansomwareVictim.objects.create(
            group=group,
            victim_name='Victim Inc',
            attacked_at=attacked
        )
        with self.assertRaises(Exception):
            RansomwareVictim.objects.create(
                group=group,
                victim_name='Victim Inc',
                attacked_at=attacked
            )


class CVEAlertAPITest(APITestCase):
    def setUp(self):
        CVEAlert.objects.create(
            cve_id='CVE-2025-11111',
            severity='HIGH',
            cvss_score=7.5,
            published=timezone.now()
        )
        CVEAlert.objects.create(
            cve_id='CVE-2025-22222',
            severity='CRITICAL',
            cvss_score=9.8
        )

    def test_list_cves(self):
        response = self.client.get('/api/cyber_watch/cves/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_filter_by_severity(self):
        response = self.client.get('/api/cyber_watch/cves/?severity=CRITICAL')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = list(response.data)
        self.assertTrue(all(c['severity'] == 'CRITICAL' for c in data))

    def test_filter_days(self):
        response = self.client.get('/api/cyber_watch/cves/?days=7')
        self.assertEqual(response.status_code, status.HTTP_200_OK)


class RansomwareGroupAPITest(APITestCase):
    def setUp(self):
        self.group = RansomwareGroup.objects.create(name='APITestGroup')

    def test_list_groups(self):
        response = self.client.get('/api/cyber_watch/ransomware/groups/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_group_has_victim_count(self):
        response = self.client.get(f'/api/cyber_watch/ransomware/groups/{self.group.id}/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('victim_count', response.data)


class RansomwareVictimAPITest(APITestCase):
    def setUp(self):
        self.group = RansomwareGroup.objects.create(name='FilterGroup')
        RansomwareVictim.objects.create(
            group=self.group,
            victim_name='Corp A',
            country='FR',
            sector='Healthcare',
            attacked_at=timezone.now()
        )
        RansomwareVictim.objects.create(
            group=self.group,
            victim_name='Corp B',
            country='US',
            sector='Energy',
            attacked_at=timezone.now()
        )

    def test_list_victims(self):
        response = self.client.get('/api/cyber_watch/ransomware/victims/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_filter_by_country(self):
        response = self.client.get('/api/cyber_watch/ransomware/victims/?country=FR')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = list(response.data)
        self.assertTrue(all('FR' in v['country'] for v in data))

    def test_filter_by_group(self):
        response = self.client.get('/api/cyber_watch/ransomware/victims/?group=FilterGroup')
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_victim_serializer_has_group_name(self):
        response = self.client.get('/api/cyber_watch/ransomware/victims/')
        data = list(response.data)
        self.assertTrue(len(data) > 0)
        self.assertIn('group_name', data[0])



class FetchCVETest(TransactionTestCase):
    """Use TransactionTestCase so close_old_connections() doesn't break test isolation."""

    def setUp(self):
        # Prevent close_old_connections() from dropping the test DB connection
        self._conn_patcher = patch('cyber_watch.core.close_old_connections')
        self._conn_patcher.start()

    def tearDown(self):
        self._conn_patcher.stop()

    @patch('cyber_watch.core.requests.get')
    def test_fetch_latest_cves_creates_new_records(self, mock_get):
        mock_response = MagicMock()
        mock_response.raise_for_status.return_value = None
        mock_response.json.return_value = [
            {
                'id': 'CVE-2025-MOCK01',
                'summary': 'A mock vulnerability',
                'cvss': 8.1,
                'severity': 'high',
                'Published': None,
                'references': []
            }
        ]
        mock_get.return_value = mock_response

        from cyber_watch.core import fetch_latest_cves
        fetch_latest_cves()

        self.assertTrue(CVEAlert.objects.filter(cve_id='CVE-2025-MOCK01').exists())
        cve = CVEAlert.objects.get(cve_id='CVE-2025-MOCK01')
        self.assertEqual(cve.description, 'A mock vulnerability')
        self.assertEqual(cve.severity, 'HIGH')

    @patch('cyber_watch.core.requests.get')
    def test_fetch_cves_idempotent(self, mock_get):
        """Calling fetch twice must not create duplicates."""
        mock_response = MagicMock()
        mock_response.raise_for_status.return_value = None
        mock_response.json.return_value = [
            {
                'id': 'CVE-2025-IDEM01', 'summary': 'Idempotent test',
                'cvss': 5.0, 'severity': 'medium', 'Published': None, 'references': []
            }
        ]
        mock_get.return_value = mock_response

        from cyber_watch.core import fetch_latest_cves
        fetch_latest_cves()
        fetch_latest_cves()

        self.assertEqual(CVEAlert.objects.filter(cve_id='CVE-2025-IDEM01').count(), 1)

    @patch('cyber_watch.core.requests.get')
    def test_fetch_cves_handles_network_error(self, mock_get):
        """Network errors must not raise - just log."""
        mock_get.side_effect = Exception('network error')
        from cyber_watch.core import fetch_latest_cves
        try:
            fetch_latest_cves()
        except Exception:
            self.fail("fetch_latest_cves() raised an exception on network error")


class FetchRansomwareTest(TransactionTestCase):
    """Use TransactionTestCase so close_old_connections() doesn't break test isolation."""

    def setUp(self):
        self._conn_patcher = patch('cyber_watch.core.close_old_connections')
        self._conn_patcher.start()

    def tearDown(self):
        self._conn_patcher.stop()

    def _make_mock(self, groups_data, victims_data):
        """Return a mock that returns groups_data for first call, victims_data for second."""
        def side_effect(url, **kwargs):
            resp = MagicMock()
            resp.raise_for_status.return_value = None
            if 'groups' in url:
                resp.json.return_value = groups_data
            else:
                resp.json.return_value = victims_data
            return resp
        return side_effect

    @patch('cyber_watch.core.requests.get')
    def test_fetch_ransomware_groups(self, mock_get):
        mock_get.side_effect = self._make_mock(
            groups_data=[{'name': 'MockGroup', 'description': 'A test ransomware group'}],
            victims_data=[]
        )
        from cyber_watch.core import fetch_ransomware_data
        fetch_ransomware_data()
        self.assertTrue(RansomwareGroup.objects.filter(name='MockGroup').exists())

    @patch('cyber_watch.core.requests.get')
    def test_fetch_ransomware_data_idempotent(self, mock_get):
        mock_get.side_effect = self._make_mock(
            groups_data=[{'name': 'IdemGroup', 'description': 'Idempotent'}],
            victims_data=[]
        )
        from cyber_watch.core import fetch_ransomware_data
        fetch_ransomware_data()
        # Re-set side_effect (it's consumed by call above)
        mock_get.side_effect = self._make_mock(
            groups_data=[{'name': 'IdemGroup', 'description': 'Idempotent'}],
            victims_data=[]
        )
        fetch_ransomware_data()
        self.assertEqual(RansomwareGroup.objects.filter(name='IdemGroup').count(), 1)

    @patch('cyber_watch.core.requests.get')
    def test_fetch_ransomware_handles_network_error(self, mock_get):
        mock_get.side_effect = Exception('network error')
        from cyber_watch.core import fetch_ransomware_data
        try:
            fetch_ransomware_data()
        except Exception:
            self.fail("fetch_ransomware_data() raised an exception on network error")



class WatchRuleModelTest(TestCase):
    def test_create_watch_rule(self):
        rule = WatchRule.objects.create(
            name='Watch',
            keywords=['test', 'example'],
            exceptions=['protected'],
            scope='both',
        )
        self.assertEqual(str(rule), 'Watch')
        self.assertTrue(rule.is_active)
        self.assertEqual(rule.scope, 'both')


class WatchRuleAPITest(APITestCase):
    def setUp(self):
        self.user = User.objects.create_superuser(username='cwtest', password='pass', email='cw@test.com')
        _, token = AuthToken.objects.create(self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token}')
        self.rule = WatchRule.objects.create(
            name='API Test Rule',
            keywords=['keyword1'],
            exceptions=[],
            scope='cve',
        )

    def test_list_watch_rules(self):
        response = self.client.get('/api/cyber_watch/watch-rules/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = list(response.data)
        self.assertTrue(any(r['name'] == 'API Test Rule' for r in data))

    def test_create_watch_rule(self):
        payload = {
            'name': 'New Rule',
            'keywords': ['search1', 'search2'],
            'exceptions': [],
            'scope': 'ransomware',
            'is_active': True,
        }
        response = self.client.post('/api/cyber_watch/watch-rules/', payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(WatchRule.objects.filter(name='New Rule').exists())

    def test_delete_watch_rule(self):
        response = self.client.delete(f'/api/cyber_watch/watch-rules/{self.rule.id}/')
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(WatchRule.objects.filter(id=self.rule.id).exists())

    def test_patch_watch_rule(self):
        response = self.client.patch(
            f'/api/cyber_watch/watch-rules/{self.rule.id}/',
            {'name': 'Updated Rule'},
            format='json'
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.rule.refresh_from_db()
        self.assertEqual(self.rule.name, 'Updated Rule')


class WatchRuleHitTest(TestCase):
    def setUp(self):
        self.rule = WatchRule.objects.create(
            name='Hit Test Rule',
            keywords=['acme'],
            scope='both',
        )

    def test_create_hit(self):
        hit = WatchRuleHit.objects.create(
            rule=self.rule,
            hit_type='cve',
            object_id='CVE-2025-99999',
            hit_display='CVE-2025-99999 - test vulnerability',
            matched_keyword='acme',
        )
        self.assertEqual(str(hit), 'Hit Test Rule \u2192 CVE-2025-99999 [acme]')
        self.assertFalse(hit.is_archived)

    def test_hits_list_api(self):
        WatchRuleHit.objects.create(
            rule=self.rule,
            hit_type='ransomware_victim',
            object_id='LockBit::ACME Corp',
            hit_display='ACME Corp (LockBit) \u2014 US',
            matched_keyword='acme',
        )
        from django.contrib.auth.models import User as DjUser
        from knox.models import AuthToken as KT
        from rest_framework.test import APIClient
        user = DjUser.objects.create_superuser(username='hittest', password='pass', email='ht@t.com')
        _, token = KT.objects.create(user)
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f'Token {token}')
        response = client.get('/api/cyber_watch/watch-rule-hits/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = list(response.data)
        self.assertTrue(len(data) >= 1)
        self.assertIn('rule_name', data[0])
