from django.test import SimpleTestCase, TestCase, TransactionTestCase, override_settings
from django.contrib.auth.models import User
from django.utils import timezone
from datetime import timedelta
from rest_framework.test import APITestCase
from rest_framework import status
from knox.models import AuthToken
from unittest.mock import patch, MagicMock

from .core import purge_old_data
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


def sign_in(client, username='reader'):
    """A signed-in person with no special right: Cyber Watch is closed to visitors."""
    _, token = AuthToken.objects.create(User.objects.create_user(username=username, password='pass'))
    client.credentials(HTTP_AUTHORIZATION=f'Token {token}')


class CVEAlertAPITest(APITestCase):
    def setUp(self):
        sign_in(self.client)
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
        data = response.data['results']
        self.assertTrue(all(c['severity'] == 'CRITICAL' for c in data))

    def test_filter_days(self):
        response = self.client.get('/api/cyber_watch/cves/?days=7')
        self.assertEqual(response.status_code, status.HTTP_200_OK)


class RansomwareGroupAPITest(APITestCase):
    def setUp(self):
        sign_in(self.client)
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
        sign_in(self.client)
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
        data = response.data['results']
        self.assertTrue(all('FR' in v['country'] for v in data))

    def test_filter_by_group(self):
        response = self.client.get('/api/cyber_watch/ransomware/victims/?group=FilterGroup')
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_victim_serializer_has_group_name(self):
        response = self.client.get('/api/cyber_watch/ransomware/victims/')
        data = response.data['results']
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
        data = response.data['results']
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
            matched_keywords=['acme'],
        )
        self.assertEqual(str(hit), 'Hit Test Rule \u2192 CVE-2025-99999 [acme]')
        self.assertFalse(hit.is_archived)

    def test_hits_list_api(self):
        WatchRuleHit.objects.create(
            rule=self.rule,
            hit_type='ransomware_victim',
            object_id='LockBit::ACME Corp',
            hit_display='ACME Corp (LockBit) \u2014 US',
            matched_keywords=['acme'],
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
        data = response.data['results']
        self.assertTrue(len(data) >= 1)
        self.assertIn('rule_name', data[0])
        # The field of 3.8 is still there, with the first keyword
        self.assertEqual(data[0]['matched_keyword'], 'acme')
        self.assertEqual(data[0]['matched_keywords'], ['acme'])


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
        results = response.data['results']
        self.assertTrue(len(results) >= 1)
        first = next(r for r in results if r['name'] == 'LastEventRule')
        self.assertIn('last_event', first)
        last_event = first['last_event']
        if last_event is not None:
            self.assertIn('action', last_event)
            self.assertIn('username', last_event)


class VisitorAccessTest(APITestCase):
    """A visitor sees what the Overview shows (figures, the top five CVEs) and nothing else of Cyber Watch."""

    CVES = '/api/cyber_watch/cves/'

    def setUp(self):
        now = timezone.now()
        for n in range(8):
            CVEAlert.objects.create(cve_id=f'CVE-2026-90{n:02d}', description=f'Flaw {n}', severity='HIGH', cvss_score=9.0 - n / 10, published=now)
        group = RansomwareGroup.objects.create(name='visitorgroup')
        RansomwareVictim.objects.create(group=group, victim_name='Corp V', country='FR', sector='Energy', attacked_at=now)
        rule = WatchRule.objects.create(name='Internal rule', keywords=['flaw'], scope='cve')
        WatchRuleHit.objects.create(rule=rule, hit_type='cve', object_id='CVE-2026-9000', hit_display='CVE-2026-9000', matched_keywords=['flaw'])

    def refused(self, url):
        return self.client.get(url).status_code in (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN)

    def test_the_figures_of_the_overview_are_open(self):
        self.assertEqual(self.client.get('/api/cyber_watch/statistics/').status_code, status.HTTP_200_OK)

    def test_a_visitor_gets_no_figure_about_the_watch_rules(self):
        data = self.client.get('/api/cyber_watch/statistics/').data
        self.assertEqual((data['cves']['matched'], data['victims']['matched']), (0, 0))
        self.assertEqual(data['hits']['open'], 0)
        self.assertEqual(data['hits']['perDay'], [])
        self.assertNotIn('rules', data)
        sign_in(self.client)
        data = self.client.get('/api/cyber_watch/statistics/').data
        self.assertEqual(data['hits']['open'], 1)
        self.assertEqual(data['cves']['matched'], 1)

    def test_a_visitor_gets_the_top_five_cves(self):
        response = self.client.get(f'{self.CVES}?page_size=5&ordering=-cvss_score&status=active')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data['results']), 5)
        self.assertEqual(response.data['count'], 8)

    def test_a_visitor_never_learns_which_cve_a_rule_matched(self):
        rows = self.client.get(f'{self.CVES}?page_size=5').data['results']
        self.assertEqual({row['hits_count'] for row in rows}, {0})
        self.assertTrue(self.refused(f'{self.CVES}?page_size=5&matched=yes'))
        sign_in(self.client)
        signed = self.client.get(f'{self.CVES}?page_size=8').data['results']
        self.assertEqual(sum(row['hits_count'] for row in signed), 1)

    def test_a_visitor_cannot_go_further_than_that(self):
        for query in ('', '?page_size=6', '?page_size=100', '?page_size=abc', '?page_size=5&page=2', '?page_size=5&search=flaw'):
            self.assertTrue(self.refused(f'{self.CVES}{query}'), query)
        cve = CVEAlert.objects.first()
        self.assertTrue(self.refused(f'{self.CVES}{cve.id}/'))

    def test_a_visitor_cannot_change_anything(self):
        self.assertEqual(self.client.post(self.CVES, {'cve_id': 'CVE-2026-9999'}).status_code, status.HTTP_401_UNAUTHORIZED)

    def test_the_rest_of_cyber_watch_is_closed(self):
        for url in ('/api/cyber_watch/ransomware/victims/', '/api/cyber_watch/ransomware/victims/?page_size=5',
                    '/api/cyber_watch/ransomware/groups/', '/api/cyber_watch/watch-rule-hits/',
                    '/api/cyber_watch/watch-rules/'):
            self.assertTrue(self.refused(url), url)

    def test_a_signed_in_person_reads_it_all(self):
        sign_in(self.client)
        for url in (self.CVES, '/api/cyber_watch/ransomware/victims/', '/api/cyber_watch/ransomware/groups/', '/api/cyber_watch/watch-rule-hits/'):
            self.assertEqual(self.client.get(url).status_code, status.HTTP_200_OK, url)


class CyberWatchPageAPITest(APITestCase):
    """Filters, counters, preview / scan of rules, hit targets and statistics used by the Cyber Watch page."""

    def setUp(self):
        self.user = User.objects.create_superuser(username='cwpage', password='pass', email='cwpage@t.com')
        _, token = AuthToken.objects.create(self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token}')
        now = timezone.now()
        CVEAlert.objects.create(cve_id='CVE-2026-0001', description='Fortinet FortiOS remote code execution',
                                severity='CRITICAL', cvss_score=9.8, published=now)
        CVEAlert.objects.create(cve_id='CVE-2026-0002', description='WordPress plugin XSS', published=now - timedelta(days=40))
        CVEAlert.objects.create(cve_id='CVE-2026-0003', description='Old Fortinet flaw', severity='HIGH', published=now, is_archived=True)
        self.group = RansomwareGroup.objects.create(name='akira')
        RansomwareVictim.objects.create(group=self.group, victim_name='Clinic Nord', country='FR', sector='Healthcare', attacked_at=now)
        RansomwareVictim.objects.create(group=self.group, victim_name='Steel Corp', country='DE', sector='Manufacturing',
                                        attacked_at=now - timedelta(days=2))
        self.rule = WatchRule.objects.create(name='Edge', keywords=['fortinet'], exceptions=['old'], scope='cve')
        self.hit = WatchRuleHit.objects.create(rule=self.rule, hit_type='cve', object_id='CVE-2026-0001',
                                               hit_display='CVE-2026-0001 - Fortinet', matched_keywords=['fortinet'])

    def results(self, url):
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        return response.data['results']

    def test_cve_filters_and_hits_count(self):
        rows = self.results('/api/cyber_watch/cves/?severity=critical,none')
        self.assertEqual({r['cve_id'] for r in rows}, {'CVE-2026-0001', 'CVE-2026-0002'})
        self.assertEqual(next(r for r in rows if r['cve_id'] == 'CVE-2026-0001')['hits_count'], 1)
        self.assertEqual([r['cve_id'] for r in self.results('/api/cyber_watch/cves/?period=7d&search=fortinet')], ['CVE-2026-0001'])
        self.assertEqual([r['cve_id'] for r in self.results('/api/cyber_watch/cves/?matched=no')], ['CVE-2026-0002'])
        self.assertEqual([r['cve_id'] for r in self.results('/api/cyber_watch/cves/?status=archived')], ['CVE-2026-0003'])
        self.assertEqual(len(self.results('/api/cyber_watch/cves/?status=all')), 3)

    def test_victim_filters(self):
        self.assertEqual([r['victim_name'] for r in self.results('/api/cyber_watch/ransomware/victims/?country=fr')], ['Clinic Nord'])
        self.assertEqual([r['victim_name'] for r in self.results('/api/cyber_watch/ransomware/victims/?sector=manufacturing')], ['Steel Corp'])
        rows = self.results(f'/api/cyber_watch/ransomware/victims/?group_id={self.group.id}&ordering=victim_name')
        self.assertEqual([r['victim_name'] for r in rows], ['Clinic Nord', 'Steel Corp'])
        self.assertEqual(self.client.get(f'/api/cyber_watch/ransomware/groups/{self.group.id}/').data['victim_count'], 2)

    def test_preview_does_not_record(self):
        response = self.client.post('/api/cyber_watch/watch-rules/preview/',
                                    {'keywords': ['Fortinet', 'healthcare'], 'exceptions': ['old'], 'scope': 'both'}, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual((response.data['cves'], response.data['victims']), (1, 1))
        self.assertEqual(response.data['victimSamples'][0]['label'], 'Clinic Nord')
        self.assertEqual(WatchRuleHit.objects.count(), 1)
        bad = self.client.post('/api/cyber_watch/watch-rules/preview/', {'keywords': [' ']}, format='json')
        self.assertEqual(bad.status_code, status.HTTP_400_BAD_REQUEST)

    def test_scan_records_hits_once(self):
        rule = WatchRule.objects.create(name='Health', keywords=['healthcare'], scope='ransomware')
        self.assertEqual(self.client.post(f'/api/cyber_watch/watch-rules/{rule.id}/scan/').data, {'created': 1})
        self.assertEqual(self.client.post(f'/api/cyber_watch/watch-rules/{rule.id}/scan/').data, {'created': 0})
        row = next(r for r in self.results('/api/cyber_watch/watch-rules/') if r['id'] == rule.id)
        self.assertEqual((row['hits_count'], row['open_hits_count']), (1, 1))
        rule.is_active = False
        rule.save()
        self.assertEqual(self.client.post(f'/api/cyber_watch/watch-rules/{rule.id}/scan/').status_code, status.HTTP_400_BAD_REQUEST)

    def test_hits_carry_their_target_and_archive_in_bulk(self):
        WatchRuleHit.objects.create(rule=self.rule, hit_type='ransomware_victim', object_id='akira::Clinic Nord',
                                    hit_display='Clinic Nord (akira) - FR', matched_keywords=['clinic'])
        rows = {r['hit_type']: r for r in self.results('/api/cyber_watch/watch-rule-hits/')}
        self.assertEqual(rows['cve']['target']['cvss_score'], 9.8)
        self.assertEqual(rows['ransomware_victim']['target']['victim_name'], 'Clinic Nord')
        self.assertEqual(self.client.get(f'/api/cyber_watch/watch-rule-hits/{self.hit.id}/').data['target']['cve_id'], 'CVE-2026-0001')
        response = self.client.post('/api/cyber_watch/watch-rule-hits/bulk_update/',
                                    {'ids': [self.hit.id], 'changes': {'is_archived': True}}, format='json')
        self.assertEqual(response.data['succeeded'], 1)
        self.assertEqual([r['object_id'] for r in self.results('/api/cyber_watch/watch-rule-hits/?status=archived')], ['CVE-2026-0001'])
        self.assertEqual(self.results('/api/cyber_watch/cves/?search=0001')[0]['hits_count'], 0)

    def test_statistics(self):
        data = self.client.get('/api/cyber_watch/statistics/').data
        self.assertEqual(data['cves']['critical7d'], 1)
        self.assertEqual((data['cves']['matched'], data['victims']['matched']), (1, 0))
        self.assertEqual(data['cves']['bySeverity'], {'CRITICAL': 1, 'NONE': 1})
        self.assertEqual(len(data['cves']['perDay']), 30)
        self.assertEqual(data['victims']['topGroups'], [{'id': self.group.id, 'name': 'akira', 'count': 2}])
        self.assertEqual({c['name'] for c in data['victims']['byCountry']}, {'FR', 'DE'})
        # Each country says how many victims came in the last 30 and 7 days, and none matched a rule here
        self.assertTrue(all({'count', 'd30', 'd7'} <= set(c) for c in data['victims']['byCountry']))
        self.assertEqual(data['victims']['byCountryMatched'], [])
        self.assertEqual(data['hits']['openCve'], 1)
        self.assertEqual(data['rules']['byRule'][0]['name'], 'Edge')
        self.client.credentials()
        self.assertNotIn('rules', self.client.get('/api/cyber_watch/statistics/').data)


class CvssTest(SimpleTestCase):
    """The score is found wherever the source keeps it, and computed from a vector when only that is given."""

    def test_a_cve_record_keeps_it_in_the_metrics_of_its_containers(self):
        from cyber_watch.core import best_cvss
        record = {'containers': {'cna': {'metrics': [{'cvssV3_1': {'version': '3.1', 'baseScore': 8.8, 'baseSeverity': 'HIGH'}}]}}}
        self.assertEqual(best_cvss(record), (8.8, 'HIGH'))
        adp = {'containers': {'cna': {}, 'adp': [{'metrics': [{'cvssV3_1': {'baseScore': 9.8, 'baseSeverity': 'CRITICAL'}}]}]}}
        self.assertEqual(best_cvss(adp), (9.8, 'CRITICAL'))

    def test_the_unified_format_keeps_it_in_its_vulnerabilities(self):
        from cyber_watch.core import best_cvss
        item = {'vulnerabilities': [{'id': 'GHSA-x', 'scores': [{'cvss_v3': {'baseScore': 7.5, 'baseSeverity': 'HIGH'}}]}]}
        self.assertEqual(best_cvss(item), (7.5, 'HIGH'))

    def test_the_severity_is_deduced_from_the_score_when_the_label_is_missing(self):
        from cyber_watch.core import best_cvss, severity_of
        self.assertEqual(best_cvss({'metrics': {'cvssV3_1': {'baseScore': 9.1}}}), (9.1, 'CRITICAL'))
        self.assertEqual([severity_of(s) for s in (0, 0.1, 3.9, 4.0, 6.9, 7.0, 8.9, 9.0, 10)], ['', 'LOW', 'LOW', 'MEDIUM', 'MEDIUM', 'HIGH', 'HIGH', 'CRITICAL', 'CRITICAL'])
        # A CVSS 2.0 score is never critical
        self.assertEqual(severity_of(10, version=2), 'HIGH')

    def test_version_3_comes_before_4_and_2_and_the_highest_of_a_version_is_kept(self):
        from cyber_watch.core import best_cvss
        item = {'containers': {'cna': {'metrics': [
            {'cvssV4_0': {'baseScore': 9.3, 'baseSeverity': 'CRITICAL'}},
            {'cvssV3_1': {'baseScore': 6.5, 'baseSeverity': 'MEDIUM'}},
            {'cvssV3_1': {'baseScore': 7.2, 'baseSeverity': 'HIGH'}},
            {'cvssV2_0': {'baseScore': 10.0}},
        ]}}}
        self.assertEqual(best_cvss(item), (7.2, 'HIGH'))
        self.assertEqual(best_cvss({'metrics': [{'cvssV4_0': {'baseScore': 8.0, 'baseSeverity': 'HIGH'}}, {'cvssV2_0': {'baseScore': 9.0}}]}), (8.0, 'HIGH'))
        self.assertEqual(best_cvss({'metrics': [{'cvssV2_0': {'baseScore': 9.0}}]}), (9.0, 'HIGH'))

    def test_the_older_formats_still_work(self):
        from cyber_watch.core import best_cvss
        self.assertEqual(best_cvss({'cvss': 8.1}), (8.1, 'HIGH'))
        self.assertEqual(best_cvss({'cvss': '8.1'}), (None, ''))

    def test_a_vector_alone_gives_its_score(self):
        from cyber_watch.core import best_cvss, v3_score
        self.assertEqual(v3_score('CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H'), 9.8)
        self.assertEqual(v3_score('CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:H/A:H'), 8.8)
        self.assertEqual(v3_score('CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:C/C:H/I:H/A:H'), 10.0)
        self.assertEqual(v3_score('CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:L'), 5.3)
        self.assertEqual(v3_score('CVSS:3.0/AV:L/AC:L/PR:N/UI:R/S:U/C:H/I:H/A:H'), 7.8)
        self.assertEqual(v3_score('CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:N'), 0.0)
        self.assertEqual(best_cvss({'severity': [{'type': 'CVSS_V3', 'score': 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H'}]}), (9.8, 'CRITICAL'))

    def test_what_is_not_a_vector_gives_nothing(self):
        from cyber_watch.core import best_cvss, v3_score
        for bad in (None, '', 'high', 'CVSS:4.0/AV:N/AC:L', 'CVSS:3.1/AV:N', 'CVSS:3.1/AV:X/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H', 42):
            self.assertIsNone(v3_score(bad), bad)
        self.assertEqual(best_cvss({'severity': [{'type': 'CVSS_V4', 'score': 'CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:N/VC:H/VI:H/VA:H/SC:N/SI:N/SA:N'}]}), (None, ''))

    def test_not_scored_yet_is_not_an_error(self):
        from cyber_watch.core import best_cvss
        for item in ({}, {'id': 'CVE-2026-1'}, {'containers': {'cna': {'metrics': []}}}, {'metrics': {'cvssV3_1': {'baseScore': 'n/a'}}},
                     {'metrics': {'cvssV3_1': {'baseScore': 11}}}, {'metrics': {'cvssV3_1': {'baseScore': True}}}):
            self.assertEqual(best_cvss(item), (None, ''), item)

    def test_a_record_gives_its_date_and_description(self):
        from cyber_watch.core import record_values
        values = record_values({'cveMetadata': {'datePublished': '2026-03-03T19:15:34.000Z'},
                                'containers': {'cna': {'descriptions': [{'lang': 'en', 'value': 'A flaw in the parser'}]}}})
        self.assertEqual(values['description'], 'A flaw in the parser')
        self.assertEqual(values['published'].year, 2026)
        self.assertIsNone(values['published'].tzinfo)
        self.assertEqual(record_values({}), {'published': None, 'description': ''})


class EnrichUnscoredTest(TestCase):
    """A CVE is often published before it is scored: the ones still without are asked again, a few at every pass."""

    CONFIG = {'cve_api_url': 'https://cve.example/api/last'}

    def answer(self, status_code=200, body=None):
        response = MagicMock()
        response.status_code = status_code
        response.json.return_value = body
        return response

    def scored_record(self, score=9.8, label='CRITICAL'):
        return {'cveMetadata': {'datePublished': '2026-03-03T19:15:34Z'},
                'containers': {'cna': {'descriptions': [{'value': 'Remote code execution'}], 'metrics': [{'cvssV3_1': {'baseScore': score, 'baseSeverity': label}}]}}}

    def setUp(self):
        self.old = timezone.now() - timedelta(days=1)
        self.cve = CVEAlert.objects.create(cve_id='CVE-2026-5001')
        CVEAlert.objects.filter(pk=self.cve.pk).update(fetched_at=self.old)

    def run_enrich(self, response, **kwargs):
        from cyber_watch.core import enrich_unscored
        with patch('cyber_watch.core.get_cyberwatch_cve_config', return_value=self.CONFIG), \
                patch('cyber_watch.core.requests.get', return_value=response) as get:
            return enrich_unscored(**kwargs), get

    def test_a_cve_the_source_now_scores_gets_its_score_date_and_description(self):
        scored, get = self.run_enrich(self.answer(body=self.scored_record()))
        self.assertEqual(scored, 1)
        self.assertEqual(get.call_args.args[0], 'https://cve.example/api/vulnerability/CVE-2026-5001')
        self.cve.refresh_from_db()
        self.assertEqual((self.cve.cvss_score, self.cve.severity), (9.8, 'CRITICAL'))
        self.assertEqual(self.cve.description, 'Remote code execution')
        self.assertIsNotNone(self.cve.published)

    def test_what_a_cve_already_has_is_kept(self):
        CVEAlert.objects.filter(pk=self.cve.pk).update(description='Mine', published=timezone.now() - timedelta(days=3))
        before = CVEAlert.objects.get(pk=self.cve.pk).published
        self.run_enrich(self.answer(body=self.scored_record()))
        self.cve.refresh_from_db()
        self.assertEqual((self.cve.description, self.cve.published), ('Mine', before))

    def test_a_cve_still_not_scored_is_asked_again_later_not_first(self):
        scored, _ = self.run_enrich(self.answer(body={'cveMetadata': {}, 'containers': {'cna': {}}}))
        self.assertEqual(scored, 0)
        self.cve.refresh_from_db()
        self.assertIsNone(self.cve.cvss_score)
        # It was asked now: the others have their turn before it comes back
        self.assertGreater(self.cve.fetched_at, self.old)

    def test_the_cves_come_in_turn(self):
        other = CVEAlert.objects.create(cve_id='CVE-2026-5002')
        CVEAlert.objects.filter(pk=other.pk).update(fetched_at=self.old + timedelta(hours=1))
        _, get = self.run_enrich(self.answer(status_code=404), limit=1)
        self.assertTrue(get.call_args.args[0].endswith('CVE-2026-5001'))
        _, get = self.run_enrich(self.answer(status_code=404), limit=1)
        self.assertTrue(get.call_args.args[0].endswith('CVE-2026-5002'))

    def test_the_cves_that_have_a_score_are_not_asked(self):
        CVEAlert.objects.filter(pk=self.cve.pk).update(cvss_score=5.0)
        scored, get = self.run_enrich(self.answer(body=self.scored_record()))
        self.assertEqual(scored, 0)
        get.assert_not_called()

    def test_an_unreachable_source_changes_nothing_and_is_no_error(self):
        import requests
        from cyber_watch.core import enrich_unscored
        with patch('cyber_watch.core.get_cyberwatch_cve_config', return_value=self.CONFIG), \
                patch('cyber_watch.core.requests.get', side_effect=requests.exceptions.ConnectionError('down')):
            self.assertEqual(enrich_unscored(), 0)
        self.cve.refresh_from_db()
        self.assertIsNone(self.cve.cvss_score)

    def test_a_source_that_is_not_the_latest_list_is_not_guessed_at(self):
        from cyber_watch.core import enrich_unscored
        with patch('cyber_watch.core.get_cyberwatch_cve_config', return_value={'cve_api_url': 'https://other.example/feed.json'}), \
                patch('cyber_watch.core.requests.get') as get:
            self.assertEqual(enrich_unscored(), 0)
        get.assert_not_called()

    def test_the_new_severity_is_checked_against_the_rules(self):
        WatchRule.objects.create(name='Critical ones', keywords=['critical'], scope='cve')
        self.run_enrich(self.answer(body=self.scored_record()))
        self.assertTrue(WatchRuleHit.objects.filter(object_id='CVE-2026-5001').exists())


class FetchKeepsWhatItKnowsTest(TransactionTestCase):
    """The list of the latest CVEs: the score is read where the source keeps it, and what it leaves out is not erased."""

    def setUp(self):
        patcher = patch('cyber_watch.core.close_old_connections')
        patcher.start()
        self.addCleanup(patcher.stop)

    def fetch(self, items):
        from cyber_watch.core import fetch_latest_cves
        response = MagicMock()
        response.raise_for_status.return_value = None
        response.json.return_value = items
        with patch('cyber_watch.core.requests.get', return_value=response), patch('cyber_watch.core.enrich_unscored', return_value=0):
            fetch_latest_cves()

    def test_the_score_of_a_cve_record_is_read(self):
        self.fetch([{'id': 'CVE-2026-6001', 'published': '2026-03-03T19:15:34Z',
                     'containers': {'cna': {'metrics': [{'cvssV3_1': {'baseScore': 9.8, 'baseSeverity': 'CRITICAL'}}]}}}])
        cve = CVEAlert.objects.get(cve_id='CVE-2026-6001')
        self.assertEqual((cve.cvss_score, cve.severity), (9.8, 'CRITICAL'))

    def test_a_vector_alone_is_enough(self):
        self.fetch([{'id': 'CVE-2026-6002', 'severity': [{'type': 'CVSS_V3', 'score': 'CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:H/A:H'}]}])
        cve = CVEAlert.objects.get(cve_id='CVE-2026-6002')
        self.assertEqual((cve.cvss_score, cve.severity), (8.8, 'HIGH'))

    def test_what_the_source_leaves_out_this_time_is_not_erased(self):
        CVEAlert.objects.create(cve_id='CVE-2026-6003', description='Known', cvss_score=7.5, severity='HIGH', published=timezone.now())
        self.fetch([{'id': 'CVE-2026-6003'}])
        cve = CVEAlert.objects.get(cve_id='CVE-2026-6003')
        self.assertEqual((cve.description, cve.cvss_score, cve.severity), ('Known', 7.5, 'HIGH'))
        self.assertIsNotNone(cve.published)

    def test_a_score_that_arrives_later_is_taken(self):
        CVEAlert.objects.create(cve_id='CVE-2026-6004', description='Known')
        self.fetch([{'id': 'CVE-2026-6004', 'metrics': {'cvssV3_1': {'baseScore': 6.1, 'baseSeverity': 'MEDIUM'}}}])
        cve = CVEAlert.objects.get(cve_id='CVE-2026-6004')
        self.assertEqual((cve.cvss_score, cve.severity, cve.description), (6.1, 'MEDIUM', 'Known'))


class OneHitPerObjectTest(APITestCase):
    """A rule that matches a CVE or a victim on several keywords leaves one hit, with all its keywords."""

    def setUp(self):
        self.rule = WatchRule.objects.create(name='Perimeter', keywords=['netscaler', 'citrix'], scope='both')
        self.cve = CVEAlert.objects.create(cve_id='CVE-2026-7001', description='Citrix NetScaler memory overflow')
        group = RansomwareGroup.objects.create(name='akira')
        self.victim = RansomwareVictim.objects.create(group=group, victim_name='Citrix Partners', country='FR', sector='IT', attacked_at=timezone.now())

    def check_cve(self):
        from cyber_watch.core import _check_watch_rules_for_cve
        with patch('cyber_watch.core.send_cyber_watch_notifications') as notify:
            _check_watch_rules_for_cve(self.cve)
        return notify

    def test_a_cve_that_matches_two_keywords_is_one_hit(self):
        notify = self.check_cve()
        hits = WatchRuleHit.objects.filter(object_id='CVE-2026-7001')
        self.assertEqual(hits.count(), 1)
        self.assertEqual(hits.get().matched_keywords, ['netscaler', 'citrix'])
        # One piece of news, naming both keywords
        notify.assert_called_once()
        self.assertEqual(notify.call_args.args[0]['keyword'], 'netscaler, citrix')

    def test_checking_again_changes_nothing_and_says_nothing(self):
        self.check_cve()
        notify = self.check_cve()
        self.assertEqual(WatchRuleHit.objects.count(), 1)
        notify.assert_not_called()

    def test_a_keyword_that_matches_later_is_added_to_the_hit_without_news(self):
        self.rule.keywords = ['netscaler']
        self.rule.save()
        self.check_cve()
        self.rule.keywords = ['netscaler', 'citrix']
        self.rule.save()
        notify = self.check_cve()
        self.assertEqual(WatchRuleHit.objects.get().matched_keywords, ['netscaler', 'citrix'])
        notify.assert_not_called()

    def test_a_victim_is_one_hit_too(self):
        from cyber_watch.core import _check_watch_rules_for_victim
        self.rule.keywords = ['citrix', 'partners']
        self.rule.save()
        with patch('cyber_watch.core.send_cyber_watch_notifications') as notify:
            _check_watch_rules_for_victim(self.victim)
        hit = WatchRuleHit.objects.get(hit_type='ransomware_victim')
        self.assertEqual(hit.matched_keywords, ['citrix', 'partners'])
        notify.assert_called_once()

    def test_scanning_a_rule_counts_objects_not_keywords(self):
        from cyber_watch.core import record_rule_hits
        self.assertEqual(record_rule_hits(self.rule), 2)  # the CVE and the victim, each on two keywords or one
        self.assertEqual(record_rule_hits(self.rule), 0)
        self.assertEqual(WatchRuleHit.objects.filter(hit_type='cve').get().matched_keywords, ['netscaler', 'citrix'])

    def test_the_same_object_cannot_have_two_hits_of_one_rule(self):
        from django.db import IntegrityError, transaction
        WatchRuleHit.objects.create(rule=self.rule, hit_type='cve', object_id='CVE-2026-7001', hit_display='x', matched_keywords=['a'])
        with self.assertRaises(IntegrityError), transaction.atomic():
            WatchRuleHit.objects.create(rule=self.rule, hit_type='cve', object_id='CVE-2026-7001', hit_display='x', matched_keywords=['b'])
        other = WatchRule.objects.create(name='Other', keywords=['x'], scope='cve')
        WatchRuleHit.objects.create(rule=other, hit_type='cve', object_id='CVE-2026-7001', hit_display='x', matched_keywords=['x'])

    def test_the_page_lists_one_row_with_its_keywords_and_finds_it_by_any_of_them(self):
        self.check_cve()
        sign_in(self.client)
        rows = self.client.get('/api/cyber_watch/watch-rule-hits/').data['results']
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]['matched_keywords'], ['netscaler', 'citrix'])
        self.assertEqual(len(self.client.get('/api/cyber_watch/watch-rule-hits/?search=citrix').data['results']), 1)
        self.assertEqual(len(self.client.get('/api/cyber_watch/watch-rule-hits/?search=fortinet').data['results']), 0)
        stats = self.client.get('/api/cyber_watch/statistics/').data
        self.assertEqual((stats['hits']['open'], stats['hits']['openCve']), (1, 1))

    def test_a_hit_reads_with_its_keywords(self):
        self.check_cve()
        self.assertEqual(str(WatchRuleHit.objects.get()), 'Perimeter → CVE-2026-7001 [netscaler, citrix]')


class MergeHitsMigrationTest(TransactionTestCase):
    """The hits already recorded, one per keyword, become one per object."""

    BEFORE = [('cyber_watch', '0002_remove_subscriber_channel_flags')]
    AFTER = [('cyber_watch', '0003_one_hit_per_object')]

    def setUp(self):
        from django.db import connection
        from django.db.migrations.executor import MigrationExecutor
        self.connection = connection
        self.executor_class = MigrationExecutor
        MigrationExecutor(connection).migrate(self.BEFORE)
        self.apps = MigrationExecutor(connection).loader.project_state(self.BEFORE).apps
        self.addCleanup(lambda: MigrationExecutor(connection).migrate(MigrationExecutor(connection).loader.graph.leaf_nodes()))

    def migrate_forward(self):
        self.executor_class(self.connection).migrate(self.AFTER)
        return self.executor_class(self.connection).loader.project_state(self.AFTER).apps.get_model('cyber_watch', 'WatchRuleHit')

    def old_hit(self, rule, object_id, keyword, archived=False, days=0):
        return self.apps.get_model('cyber_watch', 'WatchRuleHit').objects.create(
            rule=rule, hit_type='cve', object_id=object_id, hit_display=object_id, matched_keyword=keyword,
            is_archived=archived, hit_at=timezone.now() - timedelta(days=days))

    def test_the_keywords_of_an_object_are_merged_into_the_oldest_hit(self):
        Rule = self.apps.get_model('cyber_watch', 'WatchRule')
        rule = Rule.objects.create(name='Perimeter', keywords=['netscaler', 'citrix', 'fortinet'], scope='cve')
        first = self.old_hit(rule, 'CVE-1', 'netscaler', days=2)
        self.old_hit(rule, 'CVE-1', 'citrix', days=1)
        alone = self.old_hit(rule, 'CVE-2', 'fortinet')
        Hit = self.migrate_forward()
        self.assertEqual(Hit.objects.count(), 2)
        merged = Hit.objects.get(object_id='CVE-1')
        self.assertEqual((merged.pk, merged.matched_keywords), (first.pk, ['netscaler', 'citrix']))
        self.assertEqual(Hit.objects.get(object_id='CVE-2').pk, alone.pk)
        self.assertEqual(Hit.objects.get(object_id='CVE-2').matched_keywords, ['fortinet'])

    def test_an_object_is_still_to_review_while_one_of_its_hits_was(self):
        Rule = self.apps.get_model('cyber_watch', 'WatchRule')
        rule = Rule.objects.create(name='Perimeter', keywords=['a', 'b'], scope='cve')
        self.old_hit(rule, 'CVE-1', 'a', archived=True)
        self.old_hit(rule, 'CVE-1', 'b', archived=False)
        self.old_hit(rule, 'CVE-2', 'a', archived=True)
        self.old_hit(rule, 'CVE-2', 'b', archived=True)
        Hit = self.migrate_forward()
        self.assertFalse(Hit.objects.get(object_id='CVE-1').is_archived)
        self.assertTrue(Hit.objects.get(object_id='CVE-2').is_archived)

    def test_the_same_object_under_two_rules_stays_two_hits(self):
        Rule = self.apps.get_model('cyber_watch', 'WatchRule')
        one = Rule.objects.create(name='One', keywords=['a'], scope='cve')
        two = Rule.objects.create(name='Two', keywords=['a'], scope='cve')
        self.old_hit(one, 'CVE-1', 'a')
        self.old_hit(two, 'CVE-1', 'a')
        self.assertEqual(self.migrate_forward().objects.count(), 2)

    def test_going_back_keeps_the_first_keyword(self):
        Rule = self.apps.get_model('cyber_watch', 'WatchRule')
        rule = Rule.objects.create(name='Perimeter', keywords=['netscaler', 'citrix'], scope='cve')
        self.old_hit(rule, 'CVE-1', 'netscaler')
        self.old_hit(rule, 'CVE-1', 'citrix')
        self.migrate_forward()
        self.executor_class(self.connection).migrate(self.BEFORE)
        Hit = self.executor_class(self.connection).loader.project_state(self.BEFORE).apps.get_model('cyber_watch', 'WatchRuleHit')
        self.assertEqual([h.matched_keyword for h in Hit.objects.all()], ['netscaler'])


class EnrichThrottleTest(TestCase):
    """The CVE source is a public service that limits its requests: it is obeyed, not hammered."""

    CONFIG = {'cve_api_url': 'https://cve.example/api/last'}

    def answer(self, status_code=200, body=None, headers=None):
        response = MagicMock()
        response.status_code = status_code
        response.json.return_value = body
        response.headers = headers or {}
        return response

    def setUp(self):
        self.old = timezone.now() - timedelta(days=1)
        for n in range(3):
            cve = CVEAlert.objects.create(cve_id=f'CVE-2026-70{n}')
            CVEAlert.objects.filter(pk=cve.pk).update(fetched_at=self.old + timedelta(minutes=n))

    def batch(self, *responses, **kwargs):
        from cyber_watch.core import enrich_batch
        with patch('cyber_watch.core.get_cyberwatch_cve_config', return_value=self.CONFIG), \
                patch('cyber_watch.core.requests.get', side_effect=list(responses)) as get:
            return enrich_batch(**kwargs), get

    def test_too_many_requests_stops_the_pass_and_gives_the_wait(self):
        (result, get) = self.batch(self.answer(429, headers={'Retry-After': '45'}), limit=3)
        self.assertEqual(result, (0, 45))
        self.assertEqual(get.call_count, 1)

    def test_the_cve_that_was_refused_is_not_marked_as_asked(self):
        self.batch(self.answer(429, headers={'Retry-After': '10'}), limit=3)
        self.assertFalse(CVEAlert.objects.filter(fetched_at__gt=self.old + timedelta(hours=1)).exists())
        self.assertEqual(CVEAlert.objects.order_by('fetched_at').first().cve_id, 'CVE-2026-700')

    def test_what_came_before_the_refusal_is_kept(self):
        scored = self.answer(200, body={'metrics': {'cvssV3_1': {'baseScore': 7.5, 'baseSeverity': 'HIGH'}}})
        (result, get) = self.batch(scored, self.answer(429, headers={'Retry-After': '20'}), limit=3)
        self.assertEqual(result, (1, 20))
        self.assertEqual(CVEAlert.objects.get(cve_id='CVE-2026-700').cvss_score, 7.5)

    def test_the_wait_has_a_default_and_a_ceiling(self):
        self.assertEqual(self.batch(self.answer(429), limit=1)[0], (0, 30))
        self.assertEqual(self.batch(self.answer(429, headers={'Retry-After': 'soon'}), limit=1)[0], (0, 30))
        self.assertEqual(self.batch(self.answer(429, headers={'Retry-After': '99999'}), limit=1)[0], (0, 120))
        self.assertEqual(self.batch(self.answer(429, headers={'Retry-After': '0'}), limit=1)[0], (0, 1))

    def test_the_job_only_counts_what_it_scored(self):
        from cyber_watch.core import enrich_unscored
        with patch('cyber_watch.core.get_cyberwatch_cve_config', return_value=self.CONFIG), \
                patch('cyber_watch.core.requests.get', return_value=self.answer(429)):
            self.assertEqual(enrich_unscored(), 0)


class KevTest(TransactionTestCase):
    """CISA's catalogue of the vulnerabilities exploited in the wild flags the CVEs of Watcher that are in it."""

    CONFIG = {'cve_api_url': 'https://cve.example/api/last', 'kev_url': 'https://kev.example/kev.json', 'epss_url': ''}

    def setUp(self):
        patcher = patch('cyber_watch.core.close_old_connections')
        patcher.start()
        self.addCleanup(patcher.stop)
        self.exposed = CVEAlert.objects.create(cve_id='CVE-2026-8001', description='Remote code execution')
        self.quiet = CVEAlert.objects.create(cve_id='CVE-2026-8002', description='Information disclosure')

    def catalogue(self, *rows):
        response = MagicMock()
        response.status_code = 200
        response.raise_for_status.return_value = None
        response.json.return_value = {'title': 'CISA Catalog', 'vulnerabilities': list(rows)}
        return response

    def row(self, cve_id, added='2026-11-01', due='2026-11-22', ransomware='Unknown'):
        return {'cveID': cve_id, 'dateAdded': added, 'dueDate': due, 'knownRansomwareCampaignUse': ransomware, 'vendorProject': 'X'}

    def run_kev(self, response, config=None):
        from cyber_watch.core import fetch_kev
        with patch('cyber_watch.core.get_cyberwatch_cve_config', return_value=config or self.CONFIG), \
                patch('cyber_watch.core.requests.get', return_value=response) as get:
            fetch_kev()
        return get

    def test_a_cve_of_the_catalogue_is_flagged_with_its_dates(self):
        self.run_kev(self.catalogue(self.row('CVE-2026-8001', ransomware='Known'), self.row('CVE-2019-0001')))
        self.exposed.refresh_from_db()
        self.assertTrue(self.exposed.exploited)
        self.assertEqual((str(self.exposed.kev_added), str(self.exposed.kev_due)), ('2026-11-01', '2026-11-22'))
        self.assertTrue(self.exposed.kev_ransomware)

    def test_the_cves_that_are_not_in_it_are_left_alone(self):
        self.run_kev(self.catalogue(self.row('CVE-2026-8001')))
        self.quiet.refresh_from_db()
        self.assertFalse(self.quiet.exploited)
        self.assertIsNone(self.quiet.kev_added)
        self.assertFalse(CVEAlert.objects.filter(cve_id='CVE-2019-0001').exists())  # the catalogue does not add CVEs

    def test_ransomware_use_is_only_when_it_is_known(self):
        self.run_kev(self.catalogue(self.row('CVE-2026-8001', ransomware='Unknown')))
        self.exposed.refresh_from_db()
        self.assertFalse(self.exposed.kev_ransomware)

    def test_a_cve_that_left_the_catalogue_is_unflagged(self):
        self.run_kev(self.catalogue(self.row('CVE-2026-8001')))
        self.run_kev(self.catalogue(self.row('CVE-2019-0001')))
        self.exposed.refresh_from_db()
        self.assertEqual((self.exposed.exploited, self.exposed.kev_added, self.exposed.kev_ransomware), (False, None, False))

    def test_a_second_pass_changes_nothing(self):
        response = self.catalogue(self.row('CVE-2026-8001'))
        self.run_kev(response)
        before = CVEAlert.objects.get(pk=self.exposed.pk)
        self.run_kev(response)
        after = CVEAlert.objects.get(pk=self.exposed.pk)
        self.assertEqual((before.exploited, before.kev_added, before.kev_due), (after.exploited, after.kev_added, after.kev_due))

    def test_a_bad_date_is_no_date_not_an_error(self):
        self.run_kev(self.catalogue(self.row('CVE-2026-8001', added='soon', due='')))
        self.exposed.refresh_from_db()
        self.assertTrue(self.exposed.exploited)
        self.assertIsNone(self.exposed.kev_added)
        self.assertIsNone(self.exposed.kev_due)

    def test_the_catalogue_can_be_switched_off(self):
        get = self.run_kev(self.catalogue(self.row('CVE-2026-8001')), config={**self.CONFIG, 'kev_url': ''})
        get.assert_not_called()
        self.exposed.refresh_from_db()
        self.assertFalse(self.exposed.exploited)

    def test_an_unreachable_or_unreadable_catalogue_changes_nothing_and_is_no_error(self):
        import requests
        self.run_kev(self.catalogue(self.row('CVE-2026-8001')))
        from cyber_watch.core import fetch_kev
        with patch('cyber_watch.core.get_cyberwatch_cve_config', return_value=self.CONFIG), \
                patch('cyber_watch.core.requests.get', side_effect=requests.exceptions.ConnectionError('down')):
            fetch_kev()
        broken = MagicMock()
        broken.raise_for_status.return_value = None
        broken.json.side_effect = ValueError('not json')
        self.run_kev(broken)
        self.run_kev(self.catalogue('not a row', {'no': 'id'}))
        # What was known stays known only when the catalogue could not be read: a readable one without it unflags
        self.exposed.refresh_from_db()
        self.assertFalse(self.exposed.exploited)

    def test_the_job_is_planned_once_a_day(self):
        from apscheduler.schedulers.background import BackgroundScheduler
        from cyber_watch import core
        created = []
        original = BackgroundScheduler.add_job
        with patch.object(BackgroundScheduler, 'start'), patch.object(BackgroundScheduler, 'add_job', autospec=True,
                                                                     side_effect=lambda self, *a, **k: created.append((a, k)) or original(self, *a, **k)):
            core.start_scheduler()
        jobs = {kwargs['id']: (args, kwargs) for args, kwargs in created}
        for job_id in ('fetch_kev', 'fetch_epss'):
            args, kwargs = jobs[job_id]
            self.assertEqual(args[1], 'cron')
            self.assertEqual(kwargs['max_instances'], 1)
            self.assertIn('next_run_time', kwargs)  # a first pass a few minutes after the start


class EpssTest(TransactionTestCase):
    """EPSS: the probability that a CVE is exploited in the next 30 days, once a day, in batches."""

    CONFIG = {'cve_api_url': 'https://cve.example/api/last', 'kev_url': '', 'epss_url': 'https://epss.example/data/v1/epss'}

    def setUp(self):
        patcher = patch('cyber_watch.core.close_old_connections')
        patcher.start()
        self.addCleanup(patcher.stop)

    def answer(self, rows, status_code=200):
        response = MagicMock()
        response.status_code = status_code
        response.raise_for_status.return_value = None
        response.json.return_value = {'status': 'OK', 'data': rows}
        return response

    def run_epss(self, responses, config=None):
        from cyber_watch.core import fetch_epss
        with patch('cyber_watch.core.get_cyberwatch_cve_config', return_value=config or self.CONFIG), \
                patch('cyber_watch.core.requests.get', side_effect=responses) as get:
            fetch_epss()
        return get

    def test_the_score_and_the_percentile_are_kept(self):
        CVEAlert.objects.create(cve_id='CVE-2026-8101')
        get = self.run_epss([self.answer([{'cve': 'CVE-2026-8101', 'epss': '0.94321', 'percentile': '0.99012', 'date': '2026-11-18'}])])
        cve = CVEAlert.objects.get()
        self.assertAlmostEqual(cve.epss, 0.94321)
        self.assertAlmostEqual(cve.epss_percentile, 0.99012)
        self.assertEqual(get.call_args.kwargs['params'], {'cve': 'CVE-2026-8101'})

    def test_the_cves_go_by_batches_of_a_hundred(self):
        for n in range(150):
            CVEAlert.objects.create(cve_id=f'CVE-2026-{9000 + n}')
        get = self.run_epss([self.answer([]), self.answer([])])
        self.assertEqual(get.call_count, 2)
        sizes = sorted(len(call.kwargs['params']['cve'].split(',')) for call in get.call_args_list)
        self.assertEqual(sizes, [50, 100])

    def test_only_the_cves_are_asked_not_the_other_advisories_nor_the_archived(self):
        CVEAlert.objects.create(cve_id='CVE-2026-8102')
        CVEAlert.objects.create(cve_id='GHSA-xxxx-yyyy')
        CVEAlert.objects.create(cve_id='CVE-2026-8103', is_archived=True)
        get = self.run_epss([self.answer([])])
        self.assertEqual(get.call_args.kwargs['params'], {'cve': 'CVE-2026-8102'})

    def test_a_value_that_makes_no_sense_is_not_kept(self):
        CVEAlert.objects.create(cve_id='CVE-2026-8104')
        CVEAlert.objects.create(cve_id='CVE-2026-8105')
        CVEAlert.objects.create(cve_id='CVE-2026-8106')
        self.run_epss([self.answer([
            {'cve': 'CVE-2026-8104', 'epss': '7', 'percentile': '0.5'},
            {'cve': 'CVE-2026-8105', 'epss': 'high', 'percentile': '0.5'},
            {'cve': 'CVE-2026-8106'},
            {'cve': 'CVE-2026-0000', 'epss': '0.5', 'percentile': '0.5'},
        ])])
        self.assertFalse(CVEAlert.objects.exclude(epss=None).exists())

    def test_the_source_asking_to_slow_down_stops_the_pass(self):
        for n in range(150):
            CVEAlert.objects.create(cve_id=f'CVE-2026-{9000 + n}')
        get = self.run_epss([self.answer([], status_code=429), self.answer([])])
        self.assertEqual(get.call_count, 1)

    def test_an_unreachable_source_is_no_error(self):
        import requests
        CVEAlert.objects.create(cve_id='CVE-2026-8107')
        self.run_epss(requests.exceptions.ConnectionError('down'))
        self.assertIsNone(CVEAlert.objects.get().epss)

    def test_the_scores_can_be_switched_off(self):
        CVEAlert.objects.create(cve_id='CVE-2026-8108')
        get = self.run_epss([self.answer([])], config={**self.CONFIG, 'epss_url': ''})
        get.assert_not_called()


class ExploitationApiTest(APITestCase):
    """The exploited CVEs: a filter, an order, a figure, and first in the top of the Overview."""

    def setUp(self):
        sign_in(self.client)
        now = timezone.now()
        self.hot = CVEAlert.objects.create(cve_id='CVE-2026-8201', description='Exploited, medium', cvss_score=5.0, severity='MEDIUM',
                                           published=now, exploited=True, kev_added=now.date(), kev_ransomware=True, epss=0.9, epss_percentile=0.99)
        self.high = CVEAlert.objects.create(cve_id='CVE-2026-8202', description='Not exploited, critical', cvss_score=9.8, severity='CRITICAL', published=now, epss=0.01)
        self.low = CVEAlert.objects.create(cve_id='CVE-2026-8203', description='Low', cvss_score=2.0, severity='LOW', published=now)

    def ids(self, query):
        response = self.client.get(f'/api/cyber_watch/cves/{query}')
        self.assertEqual(response.status_code, 200, response.data)
        return [row['cve_id'] for row in response.data['results']]

    def test_the_rows_say_whether_a_cve_is_exploited_and_how_likely_it_is_to_be(self):
        row = next(r for r in self.client.get('/api/cyber_watch/cves/').data['results'] if r['cve_id'] == 'CVE-2026-8201')
        self.assertTrue(row['exploited'])
        self.assertTrue(row['kev_ransomware'])
        self.assertEqual(row['kev_added'], timezone.now().date().isoformat())
        self.assertEqual((row['epss'], row['epss_percentile']), (0.9, 0.99))
        other = next(r for r in self.client.get('/api/cyber_watch/cves/').data['results'] if r['cve_id'] == 'CVE-2026-8203')
        self.assertEqual((other['exploited'], other['epss']), (False, None))

    def test_the_exploited_ones_can_be_filtered(self):
        self.assertEqual(self.ids('?exploited=yes'), ['CVE-2026-8201'])
        self.assertEqual(sorted(self.ids('?exploited=no')), ['CVE-2026-8202', 'CVE-2026-8203'])
        self.assertEqual(len(self.ids('?exploited=maybe')), 3)

    def test_the_cves_can_be_ordered_by_exploitation_and_by_epss(self):
        self.assertEqual(self.ids('?ordering=-exploited')[0], 'CVE-2026-8201')
        self.assertEqual(self.ids('?ordering=-epss')[0], 'CVE-2026-8201')

    def test_several_fields_can_be_given_and_an_unknown_one_is_ignored(self):
        self.assertEqual(self.ids('?ordering=-exploited,-cvss_score'), ['CVE-2026-8201', 'CVE-2026-8202', 'CVE-2026-8203'])
        self.assertEqual(self.ids('?ordering=-cvss_score,password'), self.ids(''))

    def test_the_figures_count_the_exploited_ones(self):
        self.assertEqual(self.client.get('/api/cyber_watch/statistics/').data['cves']['exploited'], 1)

    def test_the_top_of_the_overview_puts_the_exploited_first_for_everyone(self):
        self.client.credentials()  # a visitor
        top = [row['cve_id'] for row in self.client.get('/api/overview/').data['topCves']]
        self.assertEqual(top, ['CVE-2026-8201', 'CVE-2026-8202', 'CVE-2026-8203'])
        row = self.client.get('/api/overview/').data['topCves'][0]
        self.assertTrue(row['exploited'])

    def test_each_source_is_a_connector_of_its_own(self):
        from connectors.contrib.cisa_kev.connector import DEFINITION as KEV
        from connectors.contrib.first_epss.connector import DEFINITION as EPSS
        from connectors.contrib.cyberwatch_cve.connector import DEFINITION as CVE
        from connectors.core import get_cyberwatch_cve_config, get_all_connectors
        self.assertEqual([f['name'] for f in KEV['fields']], ['CYBER_WATCH_KEV_URL'])
        self.assertEqual([f['name'] for f in EPSS['fields']], ['CYBER_WATCH_EPSS_API_URL'])
        # And no longer fields of the CVE connector
        self.assertEqual([f['name'] for f in CVE['fields']], ['CYBER_WATCH_CVE_API_URL'])
        config = get_cyberwatch_cve_config()
        self.assertTrue(config['kev_url'].startswith('https://www.cisa.gov/'))
        self.assertTrue(config['epss_url'].startswith('https://api.first.org/'))
        listed = {c['id']: c for c in get_all_connectors()}
        self.assertEqual((listed['cisa_kev']['name'], listed['first_epss']['name']), ('CISA KEV', 'FIRST EPSS'))

    def test_what_an_admin_saves_in_the_connector_is_what_the_jobs_use(self):
        from connectors.core import get_cyberwatch_cve_config, save_connector_overrides
        save_connector_overrides('cisa_kev', {'CYBER_WATCH_KEV_URL': 'https://mirror.example/kev.json'})
        save_connector_overrides('first_epss', {'CYBER_WATCH_EPSS_API_URL': ''})
        config = get_cyberwatch_cve_config()
        self.assertEqual(config['kev_url'], 'https://mirror.example/kev.json')
        self.assertEqual(config['epss_url'], '')  # empty: switched off


class ExploitedNotificationTest(TransactionTestCase):
    """A CVE that CISA has just added to its catalogue of exploited vulnerabilities is news; the history is not."""

    CONFIG = {'cve_api_url': 'https://cve.example/api/last', 'kev_url': 'https://kev.example/kev.json', 'epss_url': ''}

    def setUp(self):
        patcher = patch('cyber_watch.core.close_old_connections')
        patcher.start()
        self.addCleanup(patcher.stop)
        self.today = timezone.now().date()

    def catalogue(self, *rows):
        response = MagicMock()
        response.status_code = 200
        response.raise_for_status.return_value = None
        response.json.return_value = {'vulnerabilities': list(rows)}
        return response

    def row(self, cve_id, added, ransomware='Unknown', due=None):
        return {'cveID': cve_id, 'dateAdded': str(added), 'dueDate': str(due or self.today + timedelta(days=21)), 'knownRansomwareCampaignUse': ransomware}

    def run_kev(self, *rows, notify=None):
        from cyber_watch.core import fetch_kev
        notify = notify or MagicMock()
        with patch('cyber_watch.core.get_cyberwatch_cve_config', return_value=self.CONFIG), \
                patch('cyber_watch.core.requests.get', return_value=self.catalogue(*rows)), \
                patch('cyber_watch.core.send_cyber_watch_notifications', notify):
            fetch_kev()
        return notify

    def test_a_cve_added_today_is_notified_once_with_what_is_known_of_it(self):
        CVEAlert.objects.create(cve_id='CVE-2026-9001', description='Remote code execution', cvss_score=9.8, severity='CRITICAL', epss=0.943)
        notify = self.run_kev(self.row('CVE-2026-9001', self.today, ransomware='Known'))
        notify.assert_called_once()
        content = notify.call_args.args[0]
        self.assertEqual(content['notification_type'], 'cve_exploited')
        self.assertEqual((content['cve_id'], content['severity'], content['cvss_score']), ('CVE-2026-9001', 'CRITICAL', 9.8))
        self.assertEqual((content['epss'], content['ransomware']), ('94 %', 'Known to be used by ransomware groups'))
        self.assertEqual(content['fix_by'], str(self.today + timedelta(days=21)))
        # And it is not told again the next day
        again = self.run_kev(self.row('CVE-2026-9001', self.today))
        again.assert_not_called()

    def test_the_history_of_the_catalogue_is_not_news(self):
        CVEAlert.objects.create(cve_id='CVE-2026-9002')
        notify = self.run_kev(self.row('CVE-2026-9002', self.today - timedelta(days=200)))
        notify.assert_not_called()
        self.assertTrue(CVEAlert.objects.get(cve_id='CVE-2026-9002').exploited)  # flagged all the same

    def test_two_weeks_is_the_limit(self):
        CVEAlert.objects.create(cve_id='CVE-2026-9003')
        CVEAlert.objects.create(cve_id='CVE-2026-9004')
        notify = self.run_kev(self.row('CVE-2026-9003', self.today - timedelta(days=14)), self.row('CVE-2026-9004', self.today - timedelta(days=15)))
        self.assertEqual([call.args[0]['cve_id'] for call in notify.call_args_list], ['CVE-2026-9003'])

    def test_a_cve_without_figures_says_so_with_not_available(self):
        CVEAlert.objects.create(cve_id='CVE-2026-9005')
        content = self.run_kev(self.row('CVE-2026-9005', self.today)).call_args.args[0]
        self.assertEqual((content['severity'], content['cvss_score'], content['epss'], content['ransomware']), ('N/A', 'N/A', 'N/A', 'N/A'))

    def test_one_pass_does_not_flood(self):
        for n in range(5):
            CVEAlert.objects.create(cve_id=f'CVE-2026-91{n}')
        with patch('cyber_watch.core.KEV_NEWS_MAX', 2):
            notify = self.run_kev(*[self.row(f'CVE-2026-91{n}', self.today) for n in range(5)])
        self.assertEqual(notify.call_count, 2)
        self.assertEqual(CVEAlert.objects.filter(exploited=True).count(), 5)

    def test_a_notification_that_fails_does_not_stop_the_job(self):
        CVEAlert.objects.create(cve_id='CVE-2026-9006')
        CVEAlert.objects.create(cve_id='CVE-2026-9007')
        notify = MagicMock(side_effect=RuntimeError('slack is down'))
        self.run_kev(self.row('CVE-2026-9006', self.today), self.row('CVE-2026-9007', self.today), notify=notify)
        self.assertEqual(notify.call_count, 2)
        self.assertEqual(CVEAlert.objects.filter(exploited=True).count(), 2)

    def test_the_subscribers_who_ticked_exploited_cves_get_the_email(self):
        from cyber_watch.core import send_cyber_watch_notifications
        from cyber_watch.models import Subscriber
        wanting = Subscriber.objects.create(user_rec=User.objects.create_user('wants', 'w@example.com'), email=True)
        Subscriber.objects.create(user_rec=User.objects.create_user('declines', 'd@example.com'), email=True, notify_exploited_cves=False)
        self.assertTrue(wanting.notify_exploited_cves)  # on by default, like the others
        with patch('cyber_watch.core.send_app_specific_notifications') as send:
            send_cyber_watch_notifications({'notification_type': 'cve_exploited', 'cve_id': 'CVE-2026-9008'})
        self.assertEqual(list(send.call_args.args[2]), [wanting])


class ExploitedMessageTest(TestCase):
    """The notification "CVE exploited in the wild" on each channel."""

    TYPE = 'cyber_watch_cve_exploited'

    def sample(self):
        from connectors.notifications.catalogue import get_type
        from common.core import _cve_title_parts
        ctx = dict(get_type(self.TYPE).sample())
        ctx.update(_cve_title_parts(ctx['severity'], ctx['cvss_score']))
        ctx['object_url'] = 'https://watcher.example/#/cyber_watch'
        return ctx

    def test_it_is_a_notification_of_the_four_channels_and_off_until_it_is_set_up(self):
        from connectors.notifications.catalogue import find_type
        from connectors.notifications.store import is_enabled
        ntype = find_type(self.TYPE)
        self.assertEqual((ntype.module, ntype.label), ('cyber_watch', 'CVE exploited in the wild'))
        self.assertEqual(set(ntype.channels), {'slack', 'citadel', 'thehive', 'email'})
        self.assertFalse(any(is_enabled(self.TYPE, channel) for channel in ntype.channels))

    def test_the_message_says_what_matters_on_every_channel(self):
        from connectors.notifications.store import render_message
        for channel in ('slack', 'citadel', 'thehive'):
            text = render_message(self.TYPE, channel, self.sample())
            for expected in ('CVE-2026-12345', '94 %', '2026-12-01', 'ransomware'):
                self.assertIn(expected, text, f'{expected} on {channel}')
        self.assertIn('exploited in the wild', render_message(self.TYPE, 'slack', self.sample()))

    def test_what_is_not_known_is_left_out_not_written_as_not_available(self):
        from connectors.notifications.store import render_message
        ctx = {**self.sample(), 'epss': 'N/A', 'fix_by': 'N/A', 'ransomware': 'N/A', 'cvss_score': 'N/A', 'severity': 'N/A'}
        ctx.update({'severity_suffix': '', 'cvss_part': '', 'severity_part': ''})
        text = render_message(self.TYPE, 'slack', ctx)
        self.assertIn('CVE-2026-12345', text)
        for gone in ('EPSS', 'Fix by', 'Ransomware', 'N/A'):
            self.assertNotIn(gone, text)

    def test_the_title_on_thehive_and_the_email_subject_name_the_cve(self):
        from connectors.notifications.store import email_subject, render_thehive_title
        ctx = self.sample()
        self.assertEqual(render_thehive_title(self.TYPE, ctx), 'Exploited CVE - CVE-2026-12345 | Severity: CRITICAL | CVSS: 9.8')
        self.assertEqual(email_subject(self.TYPE, ctx), 'Exploited CVE - CVE-2026-12345 (CRITICAL)')

    def test_the_email_has_its_own_layout(self):
        from common.mail_template.cyber_watch_template import get_cyber_watch_template
        body = get_cyber_watch_template({'notification_type': 'cve_exploited', 'cve_id': 'CVE-2026-12345', 'severity': 'CRITICAL', 'epss': '94 %',
                                         'fix_by': '2026-12-01', 'ransomware': 'Known to be used by ransomware groups'})
        for expected in ('CVE Exploited in the Wild', 'CVE-2026-12345', '94 %', '2026-12-01', 'ransomware groups'):
            self.assertIn(expected, body)


class AdvisoryIdTest(SimpleTestCase):
    """The identifier an advisory is kept under: its CVE when it is about one."""

    def test_a_cve_keeps_its_id_in_capitals(self):
        from cyber_watch.core import cve_id_of
        self.assertEqual(cve_id_of({'id': 'CVE-2026-1234'}), 'CVE-2026-1234')
        self.assertEqual(cve_id_of({'id': 'cve-2026-1234'}), 'CVE-2026-1234')
        self.assertEqual(cve_id_of({'cveMetadata': {'cveId': 'CVE-2026-9999'}}), 'CVE-2026-9999')

    def test_an_alias_gives_the_cve_of_an_advisory(self):
        from cyber_watch.core import cve_id_of
        self.assertEqual(cve_id_of({'id': 'GHSA-xxxx-yyyy-zzzz', 'aliases': ['PYSEC-1', 'CVE-2026-4321']}), 'CVE-2026-4321')

    def test_the_cve_written_in_an_id_is_the_one_of_the_advisory(self):
        from cyber_watch.core import cve_id_of
        self.assertEqual(cve_id_of({'id': 'DEBIAN-CVE-2026-119760'}), 'CVE-2026-119760')

    def test_an_advisory_that_is_not_about_a_cve_keeps_its_own_id(self):
        from cyber_watch.core import cve_id_of
        for advisory in ('OSV-2022-400', 'PYSEC-2025-19', 'RLSA-2026:1234', 'DEBIAN-TEMP-0000000-ABCDEF', 'RUSTSEC-2026-0001', 'MAL-2026-5'):
            self.assertEqual(cve_id_of({'id': advisory}), advisory)
        self.assertEqual(cve_id_of({}), '')


class AdvisoryJobTest(TransactionTestCase):
    """The list of the latest CVEs: an advisory about a CVE is that CVE, not a second row."""

    def setUp(self):
        patcher = patch('cyber_watch.core.close_old_connections')
        patcher.start()
        self.addCleanup(patcher.stop)

    def fetch(self, items):
        from cyber_watch.core import fetch_latest_cves
        response = MagicMock()
        response.raise_for_status.return_value = None
        response.json.return_value = items
        with patch('cyber_watch.core.requests.get', return_value=response), patch('cyber_watch.core.enrich_unscored', return_value=0):
            fetch_latest_cves()

    def test_a_debian_advisory_is_the_cve_it_is_about(self):
        CVEAlert.objects.create(cve_id='CVE-2026-7001', description='Known', cvss_score=8.1, severity='HIGH')
        self.fetch([{'id': 'DEBIAN-CVE-2026-7001', 'summary': 'Seen by Debian'}])
        self.assertEqual(CVEAlert.objects.filter(cve_id__contains='2026-7001').count(), 1)
        cve = CVEAlert.objects.get(cve_id='CVE-2026-7001')
        self.assertEqual((cve.cvss_score, cve.severity), (8.1, 'HIGH'))

    def test_a_debian_advisory_of_a_cve_not_seen_yet_creates_that_cve(self):
        self.fetch([{'id': 'DEBIAN-CVE-2026-7002', 'summary': 'First seen by Debian'}])
        self.assertTrue(CVEAlert.objects.filter(cve_id='CVE-2026-7002').exists())
        self.assertFalse(CVEAlert.objects.filter(cve_id__startswith='DEBIAN').exists())

    def test_an_advisory_that_is_not_a_cve_is_kept_under_its_own_id(self):
        self.fetch([{'id': 'GHSA-aaaa-bbbb-cccc', 'summary': 'A package flaw'}])
        self.assertEqual(CVEAlert.objects.get().cve_id, 'GHSA-aaaa-bbbb-cccc')


class CvesAndAdvisoriesApiTest(APITestCase):
    """The CVEs, and apart from them the other advisories of the source."""

    def setUp(self):
        sign_in(self.client)
        now = timezone.now()
        for n in range(3):
            CVEAlert.objects.create(cve_id=f'CVE-2026-81{n}', description='A flaw', cvss_score=9.0 - n, severity='CRITICAL' if n == 0 else 'HIGH', published=now)
        for advisory in ('OSV-2026-1', 'RLSA-2026:2', 'GHSA-aaaa-bbbb-cccc'):
            CVEAlert.objects.create(cve_id=advisory, description='An advisory', cvss_score=10.0, severity='CRITICAL', published=now)

    def ids(self, query):
        response = self.client.get(f'/api/cyber_watch/cves/{query}')
        self.assertEqual(response.status_code, 200, response.data)
        return {row['cve_id'] for row in response.data['results']}

    def test_the_list_can_be_the_cves_or_the_other_advisories(self):
        self.assertEqual(self.ids('?kind=cve'), {'CVE-2026-810', 'CVE-2026-811', 'CVE-2026-812'})
        self.assertEqual(self.ids('?kind=advisory'), {'OSV-2026-1', 'RLSA-2026:2', 'GHSA-aaaa-bbbb-cccc'})
        self.assertEqual(len(self.ids('')), 6)  # no kind: everything, as before

    def test_the_figures_count_the_cves_and_the_advisories_apart(self):
        cves = self.client.get('/api/cyber_watch/statistics/').data['cves']
        self.assertEqual(cves['total'], 3)
        self.assertEqual(cves['advisories'], 3)
        self.assertEqual(cves['bySeverity'], {'CRITICAL': 1, 'HIGH': 2})
        self.assertEqual(cves['critical7d'], 1)  # the three critical advisories are not counted

    def test_an_archived_advisory_is_not_an_archived_cve(self):
        CVEAlert.objects.create(cve_id='OSV-2026-9', is_archived=True)
        CVEAlert.objects.create(cve_id='CVE-2026-899', is_archived=True)
        self.assertEqual(self.client.get('/api/cyber_watch/statistics/').data['cves']['archived'], 1)

    def test_the_overview_shows_the_cves_only(self):
        self.client.credentials()  # a visitor
        data = self.client.get('/api/overview/').data
        self.assertEqual([row['cve_id'] for row in data['topCves']], ['CVE-2026-810', 'CVE-2026-811', 'CVE-2026-812'])
        sign_in(self.client, 'reader2')
        latest = self.client.get('/api/overview/').data['latest']['cves']
        self.assertTrue(all(row['cve_id'].startswith('CVE-') for row in latest))


class RansomwareFiltersTest(APITestCase):
    """The victims: every group, sector and country that has some, and the ones the source does not know."""

    def setUp(self):
        sign_in(self.client)
        now = timezone.now()
        self.akira = RansomwareGroup.objects.create(name='akira')
        self.qilin = RansomwareGroup.objects.create(name='qilin')
        for n in range(30):
            RansomwareGroup.objects.create(name=f'quiet{n}')  # known to the sources, no victim here
        rows = [
            (self.akira, 'A1', 'FR', 'Healthcare'), (self.akira, 'A2', 'FR', 'Not Found'), (self.akira, 'A3', '', 'Energy'),
            (self.qilin, 'Q1', 'US', ''), (self.qilin, 'Q2', 'DE', 'Healthcare'), (self.qilin, 'Q3', '', 'Not Found'),
        ]
        for group, name, country, sector in rows:
            RansomwareVictim.objects.create(group=group, victim_name=name, country=country, sector=sector, attacked_at=now)

    def names(self, query):
        response = self.client.get(f'/api/cyber_watch/ransomware/victims/{query}')
        self.assertEqual(response.status_code, 200, response.data)
        return {row['victim_name'] for row in response.data['results']}

    def stats(self):
        return self.client.get('/api/cyber_watch/statistics/').data['victims']

    def test_the_victims_without_a_sector_are_found_with_unknown(self):
        self.assertEqual(self.names('?sector=unknown'), {'A2', 'Q1', 'Q3'})
        self.assertEqual(self.names('?sector=Healthcare'), {'A1', 'Q2'})

    def test_the_victims_without_a_country_are_found_with_unknown(self):
        self.assertEqual(self.names('?country=unknown'), {'A3', 'Q3'})
        self.assertEqual(self.names('?country=FR'), {'A1', 'A2'})

    def test_the_filters_offer_every_group_that_has_victims_and_only_those(self):
        by_group = self.stats()['byGroup']
        self.assertEqual([(g['name'], g['count']) for g in by_group], [('akira', 3), ('qilin', 3)])
        self.assertEqual(self.stats()['groups'], 32)
        self.assertEqual(self.stats()['groupsWithVictims'], 2)

    def test_the_filters_offer_every_sector_and_say_how_many_victims_have_none(self):
        stats = self.stats()
        self.assertEqual({s['name'] for s in stats['bySector']}, {'Healthcare', 'Energy'})
        self.assertEqual(stats['unknown'], {'sector': 3, 'country': 2})

    def test_the_charts_keep_their_short_lists(self):
        for index in range(15):
            group = RansomwareGroup.objects.create(name=f'busy{index}')
            RansomwareVictim.objects.create(group=group, victim_name=f'B{index}', country='FR', sector=f'Sector {index}', attacked_at=timezone.now())
        stats = self.stats()
        self.assertEqual(len(stats['topGroups']), 10)
        self.assertEqual(len(stats['topSectors']), 10)
        self.assertEqual(len(stats['byGroup']), 17)  # the filter has them all
        self.assertGreaterEqual(len(stats['bySector']), 17)


class MergeAdvisoriesMigrationTest(TransactionTestCase):
    """The advisories already collected under a Debian id become their CVE."""

    BEFORE = [('cyber_watch', '0005_subscriber_notify_exploited_cves')]
    AFTER = [('cyber_watch', '0006_merge_advisories_with_their_cve')]

    def setUp(self):
        from django.db import connection
        from django.db.migrations.executor import MigrationExecutor
        self.connection = connection
        self.executor_class = MigrationExecutor
        MigrationExecutor(connection).migrate(self.BEFORE)
        self.apps = MigrationExecutor(connection).loader.project_state(self.BEFORE).apps
        self.addCleanup(lambda: MigrationExecutor(connection).migrate(MigrationExecutor(connection).loader.graph.leaf_nodes()))

    def forward(self):
        self.executor_class(self.connection).migrate(self.AFTER)
        return self.executor_class(self.connection).loader.project_state(self.AFTER).apps

    def hit(self, rule, object_id, keywords, archived=False):
        return self.apps.get_model('cyber_watch', 'WatchRuleHit').objects.create(
            rule=rule, hit_type='cve', object_id=object_id, hit_display=object_id, matched_keywords=keywords, is_archived=archived)

    def test_an_advisory_of_a_cve_already_there_is_merged_into_it(self):
        CVE = self.apps.get_model('cyber_watch', 'CVEAlert')
        CVE.objects.create(cve_id='CVE-2026-3000', description='')
        CVE.objects.create(cve_id='DEBIAN-CVE-2026-3000', description='Seen by Debian', cvss_score=7.5, severity='HIGH')
        apps = self.forward()
        rows = apps.get_model('cyber_watch', 'CVEAlert').objects.all()
        self.assertEqual([r.cve_id for r in rows], ['CVE-2026-3000'])
        # It only gave what the CVE lacked
        self.assertEqual((rows[0].description, rows[0].cvss_score, rows[0].severity), ('Seen by Debian', 7.5, 'HIGH'))

    def test_what_the_cve_has_is_not_overwritten(self):
        CVE = self.apps.get_model('cyber_watch', 'CVEAlert')
        CVE.objects.create(cve_id='CVE-2026-3010', description='Mine', cvss_score=9.8, severity='CRITICAL')
        CVE.objects.create(cve_id='DEBIAN-CVE-2026-3010', description='Theirs', cvss_score=3.0, severity='LOW')
        row = self.forward().get_model('cyber_watch', 'CVEAlert').objects.get()
        self.assertEqual((row.description, row.cvss_score, row.severity), ('Mine', 9.8, 'CRITICAL'))

    def test_an_advisory_of_a_cve_not_there_becomes_that_cve(self):
        CVE = self.apps.get_model('cyber_watch', 'CVEAlert')
        CVE.objects.create(cve_id='DEBIAN-CVE-2026-3020', description='First seen by Debian')
        row = self.forward().get_model('cyber_watch', 'CVEAlert').objects.get()
        self.assertEqual((row.cve_id, row.description), ('CVE-2026-3020', 'First seen by Debian'))

    def test_the_other_advisories_are_left_as_they_are(self):
        CVE = self.apps.get_model('cyber_watch', 'CVEAlert')
        for advisory in ('OSV-2026-1', 'RLSA-2026:2', 'DEBIAN-TEMP-0000-AB'):
            CVE.objects.create(cve_id=advisory)
        ids = sorted(self.forward().get_model('cyber_watch', 'CVEAlert').objects.values_list('cve_id', flat=True))
        self.assertEqual(ids, ['DEBIAN-TEMP-0000-AB', 'OSV-2026-1', 'RLSA-2026:2'])

    def test_the_matches_follow_the_advisory(self):
        CVE = self.apps.get_model('cyber_watch', 'CVEAlert')
        Rule = self.apps.get_model('cyber_watch', 'WatchRule')
        rule = Rule.objects.create(name='Debian stack', keywords=['debian', 'kernel'], scope='cve')
        CVE.objects.create(cve_id='DEBIAN-CVE-2026-3030')
        CVE.objects.create(cve_id='CVE-2026-3040')
        CVE.objects.create(cve_id='DEBIAN-CVE-2026-3040')
        self.hit(rule, 'DEBIAN-CVE-2026-3030', ['debian'])
        self.hit(rule, 'CVE-2026-3040', ['kernel'], archived=True)
        self.hit(rule, 'DEBIAN-CVE-2026-3040', ['debian'], archived=False)
        Hit = self.forward().get_model('cyber_watch', 'WatchRuleHit')
        self.assertEqual(Hit.objects.get(object_id='CVE-2026-3030').matched_keywords, ['debian'])
        merged = Hit.objects.get(object_id='CVE-2026-3040')
        self.assertEqual(merged.matched_keywords, ['kernel', 'debian'])
        self.assertFalse(merged.is_archived)  # still to review while one of them was
        self.assertEqual(Hit.objects.count(), 2)
        self.assertFalse(Hit.objects.filter(object_id__startswith='DEBIAN').exists())


class RetentionTest(TestCase):
    """What is older than the retention goes every night; what still matters stays."""

    def setUp(self):
        self.old = timezone.now() - timedelta(days=500)
        self.recent = timezone.now() - timedelta(days=10)
        self.group = RansomwareGroup.objects.create(name='akira')

    def _cve(self, cve_id, published, **extra):
        return CVEAlert.objects.create(cve_id=cve_id, published=published, **extra)

    def _victim(self, name, attacked_at, **extra):
        return RansomwareVictim.objects.create(group=self.group, victim_name=name, attacked_at=attacked_at, **extra)

    def test_old_cves_go_and_recent_ones_stay(self):
        self._cve('CVE-2020-0001', self.old)
        self._cve('CVE-2026-0001', self.recent)
        counts = purge_old_data()
        self.assertEqual(counts['cves'], 1)
        self.assertEqual(list(CVEAlert.objects.values_list('cve_id', flat=True)), ['CVE-2026-0001'])

    def test_an_old_cve_exploited_in_the_wild_stays(self):
        self._cve('CVE-2020-0002', self.old, exploited=True)
        purge_old_data()
        self.assertTrue(CVEAlert.objects.filter(cve_id='CVE-2020-0002').exists())

    def test_what_a_watch_rule_matched_stays(self):
        rule = WatchRule.objects.create(name='mine', keywords=['x'])
        self._cve('CVE-2020-0003', self.old)
        self._cve('CVE-2020-0004', self.old)
        WatchRuleHit.objects.create(rule=rule, hit_type='cve', object_id='CVE-2020-0003', hit_display='x')
        self._victim('Acme', self.old)
        self._victim('Other', self.old)
        WatchRuleHit.objects.create(rule=rule, hit_type='ransomware_victim', object_id='akira::Acme', hit_display='x')
        purge_old_data()
        self.assertEqual(list(CVEAlert.objects.values_list('cve_id', flat=True)), ['CVE-2020-0003'])
        self.assertEqual(list(RansomwareVictim.objects.values_list('victim_name', flat=True)), ['Acme'])

    def test_without_a_date_the_day_it_was_fetched_counts(self):
        self._cve('CVE-2020-0005', None, fetched_at=self.old)
        self._cve('CVE-2026-0005', None, fetched_at=self.recent)
        self._victim('Old fetch', None, fetched_at=self.old)
        self._victim('New fetch', None, fetched_at=self.recent)
        counts = purge_old_data()
        self.assertEqual(counts, {'cves': 1, 'victims': 1})

    def test_zero_keeps_everything(self):
        self._cve('CVE-2020-0006', self.old)
        self._victim('Old', self.old)
        with override_settings(CYBER_WATCH_CVE_RETENTION_DAYS=0, CYBER_WATCH_VICTIM_RETENTION_DAYS=0):
            self.assertEqual(purge_old_data(), {'cves': 0, 'victims': 0})
        self.assertEqual((CVEAlert.objects.count(), RansomwareVictim.objects.count()), (1, 1))

    def test_a_dry_run_only_counts(self):
        self._cve('CVE-2020-0007', self.old)
        self._victim('Old', self.old)
        self.assertEqual(purge_old_data(dry_run=True), {'cves': 1, 'victims': 1})
        self.assertEqual((CVEAlert.objects.count(), RansomwareVictim.objects.count()), (1, 1))

    def test_a_long_list_goes_in_batches(self):
        for i in range(7):
            self._cve(f'CVE-2019-{i:04d}', self.old)
        with patch('cyber_watch.core.PURGE_BATCH', 3):
            self.assertEqual(purge_old_data()['cves'], 7)
        self.assertEqual(CVEAlert.objects.count(), 0)

    def test_the_job_counts_what_it_removed_and_the_command_says_it(self):
        from io import StringIO
        from django.core.management import call_command
        from cyber_watch.core import cleanup_old_data
        self._cve('CVE-2020-0008', self.old)
        # The job closes the connection of its thread, which the test transaction must keep
        with patch('cyber_watch.core.close_old_connections'):
            cleanup_old_data()
        self.assertEqual(CVEAlert.objects.count(), 0)
        self._cve('CVE-2020-0009', self.old)
        out = StringIO()
        call_command('purge_cyber_watch', '--dry-run', stdout=out)
        self.assertIn('1 CVEs and 0 ransomware victims would be removed', out.getvalue())
        self.assertEqual(CVEAlert.objects.count(), 1)
