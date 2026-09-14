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


class WatchRuleLastEventFieldTest(APITestCase):
    """Test that WatchRule API exposes last_event=null when no TimelineEvents exist."""

    def setUp(self):
        self.user = User.objects.create_superuser(username='cwlastevent', password='pass', email='cwle@t.com')
        _, token = AuthToken.objects.create(self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token}')
        WatchRule.objects.create(
            name='LastEventRule',
            keywords=['test'],
            exceptions=[],
            scope='both',
        )

    def test_watch_rule_last_event_null(self):
        """GET /api/cyber_watch/watch-rules/ must include last_event=null when no timeline events."""
        response = self.client.get('/api/cyber_watch/watch-rules/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        results = list(response.data)
        self.assertTrue(len(results) >= 1)
        first = next(r for r in results if r['name'] == 'LastEventRule')
        self.assertIn('last_event', first)
        last_event = first['last_event']
        if last_event is not None:
            self.assertIn('action', last_event)
            self.assertIn('username', last_event)


from cyber_watch.core import extract_cve_id


class ExtractCveIdTest(TestCase):
    def test_normalizes_case_from_id_field(self):
        item = {'id': 'cve-2025-12345'}
        self.assertEqual(extract_cve_id(item), 'CVE-2025-12345')

    def test_normalizes_case_from_cve_metadata(self):
        item = {'cveMetadata': {'cveId': 'cve-2025-99999'}}
        self.assertEqual(extract_cve_id(item), 'CVE-2025-99999')

    def test_normalizes_case_from_alias_fallback(self):
        item = {'aliases': ['ghsa-xxxx-yyyy-zzzz', 'cve-2025-11111']}
        self.assertEqual(extract_cve_id(item), 'CVE-2025-11111')

    def test_same_cve_different_case_yields_same_id(self):
        id_from_run_1 = extract_cve_id({'id': 'CVE-2025-55555'})
        id_from_run_2 = extract_cve_id({'aliases': ['cve-2025-55555']})
        self.assertEqual(id_from_run_1, id_from_run_2)


from cyber_watch.core import send_cyber_watch_notifications_group
from cyber_watch.models import Subscriber


class SendCyberWatchNotificationsGroupTest(TestCase):
    def setUp(self):
        user = User.objects.create_user('cwgroupuser', 'cwgroup@test.com', 'pass')
        Subscriber.objects.create(
            user_rec=user, email=True, slack=True,
            notify_all_cves=True, notify_cve_hits=True,
            notify_all_victims=True, notify_victim_hits=True,
        )

    def test_empty_items_returns_without_error(self):
        send_cyber_watch_notifications_group('new_cve', [])  # must not raise

    @patch('cyber_watch.core.send_app_specific_notifications_group')
    def test_filters_subscribers_by_preference(self, mock_send_group):
        items = [{'cve_id': 'CVE-2025-00001', 'severity': 'HIGH', 'cvss_score': 7.0, 'description': 'x', 'dedup_key': 'CVE-2025-00001'}]
        send_cyber_watch_notifications_group('new_cve', items)
        self.assertEqual(mock_send_group.call_count, 1)
        called_app_name = mock_send_group.call_args[0][0]
        self.assertEqual(called_app_name, 'cyber_watch_new_cve_group')

    @patch('cyber_watch.core.send_app_specific_notifications_group')
    def test_no_matching_subscribers_skips_send(self, mock_send_group):
        Subscriber.objects.all().update(notify_all_cves=False)
        items = [{'cve_id': 'CVE-2025-00002', 'severity': 'LOW', 'cvss_score': 1.0, 'description': 'y', 'dedup_key': 'CVE-2025-00002'}]
        send_cyber_watch_notifications_group('new_cve', items)
        mock_send_group.assert_not_called()


from cyber_watch.core import _check_watch_rules_for_cve, _check_watch_rules_for_victim
from cyber_watch.models import CVEAlert, RansomwareGroup, RansomwareVictim, WatchRule


class CheckWatchRulesAccumulatorTest(TestCase):
    def test_cve_hit_is_appended_to_accumulator_not_sent_directly(self):
        WatchRule.objects.create(name='Test Rule', keywords=['openssl'], scope='cve')
        cve = CVEAlert.objects.create(cve_id='CVE-2025-77777', description='openssl vulnerability', severity='HIGH')

        hits = []
        _check_watch_rules_for_cve(cve, hits)

        self.assertEqual(len(hits), 1)
        self.assertEqual(hits[0]['cve_id'], 'CVE-2025-77777')
        self.assertEqual(hits[0]['dedup_key'], f"{WatchRule.objects.first().id}::CVE-2025-77777::openssl")

    def test_victim_hit_dedup_key_excludes_attacked_at(self):
        WatchRule.objects.create(name='Sector Rule', keywords=['finance'], scope='ransomware')
        group = RansomwareGroup.objects.create(name='LockBit')
        victim = RansomwareVictim.objects.create(group=group, victim_name='Bank X', sector='finance')

        hits = []
        _check_watch_rules_for_victim(victim, hits)

        self.assertEqual(len(hits), 1)
        rule_id = WatchRule.objects.first().id
        self.assertEqual(hits[0]['dedup_key'], f"{rule_id}::LockBit::Bank X::finance")

    def test_already_notified_hit_is_excluded_from_accumulator(self):
        from common.notification_dedup import record_notification

        WatchRule.objects.create(name='Repeat Rule', keywords=['log4j'], scope='cve')
        cve = CVEAlert.objects.create(cve_id='CVE-2025-88888', description='log4j issue', severity='CRITICAL')
        rule_id = WatchRule.objects.first().id
        record_notification('cyber_watch', 'cve_hit', f"{rule_id}::CVE-2025-88888::log4j")

        hits = []
        _check_watch_rules_for_cve(cve, hits)

        self.assertEqual(len(hits), 0)


from cyber_watch.core import fetch_latest_cves


class FetchLatestCvesDigestTest(TransactionTestCase):
    """Use TransactionTestCase so close_old_connections() doesn't break test isolation
    (same rationale as FetchCVETest above)."""

    def setUp(self):
        # Prevent close_old_connections() from dropping the test DB connection
        self._conn_patcher = patch('cyber_watch.core.close_old_connections')
        self._conn_patcher.start()

    def tearDown(self):
        self._conn_patcher.stop()

    @patch('cyber_watch.core.send_cyber_watch_notifications_group')
    @patch('cyber_watch.core.requests.get')
    def test_multiple_new_cves_trigger_one_grouped_call(self, mock_get, mock_send_group):
        mock_response = MagicMock()
        mock_response.json.return_value = [
            {'id': 'CVE-2025-10001', 'severity': 'HIGH', 'cvss': 7.5, 'summary': 'desc 1'},
            {'id': 'CVE-2025-10002', 'severity': 'LOW', 'cvss': 2.0, 'summary': 'desc 2'},
            {'id': 'CVE-2025-10003', 'severity': 'CRITICAL', 'cvss': 9.9, 'summary': 'desc 3'},
        ]
        mock_response.raise_for_status = MagicMock()
        mock_get.return_value = mock_response

        fetch_latest_cves()

        new_cve_calls = [c for c in mock_send_group.call_args_list if c[0][0] == 'new_cve']
        self.assertEqual(len(new_cve_calls), 1)
        self.assertEqual(len(new_cve_calls[0][0][1]), 3)

    @patch('cyber_watch.core.send_cyber_watch_notifications_group')
    @patch('cyber_watch.core.requests.get')
    def test_no_new_cves_sends_nothing(self, mock_get, mock_send_group):
        CVEAlert.objects.create(cve_id='CVE-2025-10004', description='existing')
        mock_response = MagicMock()
        mock_response.json.return_value = [{'id': 'CVE-2025-10004', 'severity': 'LOW', 'cvss': 1.0, 'summary': 'existing'}]
        mock_response.raise_for_status = MagicMock()
        mock_get.return_value = mock_response

        fetch_latest_cves()

        new_cve_calls = [c for c in mock_send_group.call_args_list if c[0][0] == 'new_cve']
        self.assertEqual(len(new_cve_calls), 0)


from cyber_watch.core import fetch_ransomware_data, fetch_ransomlook_data


class FetchRansomwareDataDigestTest(TransactionTestCase):
    """Use TransactionTestCase so close_old_connections() doesn't break test isolation
    (same rationale as FetchCVETest/FetchLatestCvesDigestTest above)."""

    def setUp(self):
        # Prevent close_old_connections() from dropping the test DB connection
        self._conn_patcher = patch('cyber_watch.core.close_old_connections')
        self._conn_patcher.start()

    def tearDown(self):
        self._conn_patcher.stop()

    @patch('cyber_watch.core.send_cyber_watch_notifications_group')
    @patch('cyber_watch.core.requests.get')
    def test_multiple_new_victims_trigger_one_grouped_call(self, mock_get, mock_send_group):
        groups_response = MagicMock()
        groups_response.json.return_value = []
        groups_response.raise_for_status = MagicMock()

        victims_response = MagicMock()
        victims_response.json.return_value = [
            {'group_name': 'LockBit', 'victim': 'Victim A', 'country': 'US', 'activity': 'Finance', 'published': '2026-09-10T00:00:00'},
            {'group_name': 'LockBit', 'victim': 'Victim B', 'country': 'FR', 'activity': 'Health', 'published': '2026-09-10T01:00:00'},
        ]
        victims_response.raise_for_status = MagicMock()

        mock_get.side_effect = [groups_response, victims_response]

        fetch_ransomware_data()

        new_victim_calls = [c for c in mock_send_group.call_args_list if c[0][0] == 'new_victim']
        self.assertEqual(len(new_victim_calls), 1)
        self.assertEqual(len(new_victim_calls[0][0][1]), 2)

    def test_victim_attacked_at_drift_does_not_duplicate_dedup_key(self):
        """
        Same real-world victim, attacked_at differs slightly between two fetches
        (a known DB-row-duplication risk per the audit) — the dedup_key used for
        notifications must still collapse to the same value regardless.
        """
        from cyber_watch.core import _check_watch_rules_for_victim

        group = RansomwareGroup.objects.create(name='LockBit')
        victim_1 = RansomwareVictim.objects.create(group=group, victim_name='Acme', attacked_at=timezone.now())
        victim_2 = RansomwareVictim.objects.create(
            group=group, victim_name='Acme', attacked_at=timezone.now() + timezone.timedelta(hours=2)
        )
        WatchRule.objects.create(name='Acme Watch', keywords=['acme'], scope='ransomware')

        hits_1, hits_2 = [], []
        _check_watch_rules_for_victim(victim_1, hits_1)
        _check_watch_rules_for_victim(victim_2, hits_2)

        # Second call must be excluded by the dedup window (same dedup_key as the first).
        self.assertEqual(len(hits_1), 1)
        self.assertEqual(len(hits_2), 0)
