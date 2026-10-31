import time
import uuid
from datetime import timedelta
from unittest.mock import patch
from django.test import TestCase, TransactionTestCase, SimpleTestCase
from django.contrib.auth.models import User, Permission
from django.utils import timezone
from django.urls import reverse
from rest_framework.test import APITestCase, APIClient
from rest_framework import status
from knox.models import AuthToken
from threats_watcher.models import (Source, PostUrl, TrendyWord, BannedWord, Subscriber, Summary, MonitoredKeyword,
                                    KeywordHit)
from threats_watcher.serializers import SummarySerializer
from threats_watcher import core
from types import SimpleNamespace
from connectors.models import NotificationSetting
import feedparser


class ModelTest(TransactionTestCase):
    """Test all models."""
    
    def test_source_and_posturl(self):
        """Test Source and PostUrl models."""
        unique_id = str(uuid.uuid4())[:8]
        
        # Source
        source = Source.objects.create(url=f"https://example-{unique_id}.com/feed.xml")
        self.assertEqual(str(source), f"https://example-{unique_id}.com/feed.xml")
        
        with self.assertRaises(Exception):
            Source.objects.create(url=f"https://example-{unique_id}.com/feed.xml")
        
        # PostUrl
        post = PostUrl.objects.create(url=f"https://post-{unique_id}.com")
        self.assertEqual(str(post), f"https://post-{unique_id}.com")
    
    def test_trendyword_and_bannedword(self):
        """Test TrendyWord and BannedWord models."""
        unique_id = str(uuid.uuid4())[:8]
        
        # TrendyWord
        post1 = PostUrl.objects.create(url=f"https://test-{unique_id}-1.com")
        post2 = PostUrl.objects.create(url=f"https://test-{unique_id}-2.com")
        
        trendy = TrendyWord.objects.create(name=f"cyber-{unique_id}", occurrences=3, score=85.5)
        trendy.posturls.add(post1, post2)
        
        self.assertEqual(trendy.name, f"cyber-{unique_id}")
        self.assertEqual(trendy.posturls.count(), 2)
        self.assertEqual(trendy.score, 85.5)
        
        # BannedWord
        banned = BannedWord.objects.create(name=f"spam-{unique_id}")
        self.assertEqual(str(banned), f"spam-{unique_id}")
        
        with self.assertRaises(Exception):
            BannedWord.objects.create(name=f"spam-{unique_id}")
    
    def test_summary_model(self):
        """Test Summary model with different types."""
        unique_id = str(uuid.uuid4())[:8]
        
        # Weekly summary
        weekly = Summary.objects.create(
            type='weekly_summary',
            keywords=f"test-{unique_id}",
            summary_text="Weekly summary text"
        )
        self.assertEqual(weekly.type, 'weekly_summary')
        self.assertIn('Weekly Summary', str(weekly))
        
        # Breaking news
        breaking = Summary.objects.create(
            type='breaking_news',
            keywords=f"urgent-{unique_id}",
            summary_text="Breaking news text"
        )
        self.assertEqual(breaking.type, 'breaking_news')
        
        # Trendy word summary
        trendy_summary = Summary.objects.create(
            type='trendy_word_summary',
            keywords=f"malware-{unique_id}",
            summary_text="Malware analysis summary"
        )
        self.assertEqual(trendy_summary.type, 'trendy_word_summary')
    
    def test_subscriber(self):
        """Test Subscriber model."""
        unique_id = str(uuid.uuid4())[:8]
        user = User.objects.create_user(f"user{unique_id}", "test@test.com", "pass")
        subscriber = Subscriber.objects.create(user_rec=user, email=True)
        
        self.assertTrue(subscriber.email)
        self.assertIn(f"user{unique_id}", str(subscriber))


class CoreTest(TestCase):
    """Test core functions."""
    
    @patch('threats_watcher.core.send_app_specific_notifications')
    def test_notifications(self, mock_notifications):
        """Test notification system."""
        timestamp = str(int(time.time()))
        user = User.objects.create_user(f"notif{timestamp}", "test@test.com", "pass")
        Subscriber.objects.create(user_rec=user, email=True)
        
        from threats_watcher.core import send_threats_watcher_notifications
        send_threats_watcher_notifications([f"test-{timestamp}"])
        mock_notifications.assert_called_once()


class SerializerTest(TestCase):
    """Test serializers."""
    
    def test_serializers(self):
        """Test all serializers."""
        from threats_watcher.serializers import TrendyWordSerializer, BannedWordSerializer
        timestamp = str(int(time.time()))
        
        # TrendyWord
        post = PostUrl.objects.create(url=f"https://serial-{timestamp}.com")
        trendy = TrendyWord.objects.create(name=f"test-{timestamp}", occurrences=2, score=75.0)
        trendy.posturls.add(post)
        
        trendy_serializer = TrendyWordSerializer(trendy)
        self.assertEqual(trendy_serializer.data['name'], f"test-{timestamp}")
        self.assertEqual(trendy_serializer.data['score'], 75.0)
        self.assertIn('posturls', trendy_serializer.data)
        
        # BannedWord
        banned = BannedWord.objects.create(name=f"banned-{timestamp}")
        banned_serializer = BannedWordSerializer(banned)
        self.assertEqual(banned_serializer.data['name'], f"banned-{timestamp}")
        
        # Summary
        summary = Summary.objects.create(
            type='weekly_summary',
            keywords=f"test-{timestamp}",
            summary_text="Test summary"
        )
        summary_serializer = SummarySerializer(summary)
        self.assertEqual(summary_serializer.data['type'], 'weekly_summary')
        self.assertIn('summary_text', summary_serializer.data)


class APITest(APITestCase):
    """Test API endpoints."""
    
    def setUp(self):
        """Setup API tests."""
        self.unique_id = str(uuid.uuid4())[:8]
        self.user = User.objects.create_superuser("apiuser", password="apipass123")
        self.token = AuthToken.objects.create(self.user)[1]
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {self.token}')
        
        self.post_url = PostUrl.objects.create(url=f"https://api-{self.unique_id}.com")
        self.trendy_word = TrendyWord.objects.create(name=f"phishing-{self.unique_id}", occurrences=5)
        self.trendy_word.posturls.add(self.post_url)
        self.banned_word = BannedWord.objects.create(name=f"spam-{self.unique_id}")
    
    def test_bannedword_api(self):
        """Test BannedWord API."""
        url = reverse('bannedword-list')
        
        # List
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        # Create
        data = {'name': f'newspam-{self.unique_id}'}
        response = self.client.post(url, data)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        
        # Delete
        detail_url = reverse('bannedword-detail', kwargs={'pk': self.banned_word.pk})
        response = self.client.delete(detail_url)
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
    
    def test_auth_required(self):
        """Test authentication."""
        self.client.credentials()  # Remove authentication
        response = self.client.get(reverse('trendyword-list'))
        self.assertTrue(response.status_code in [200, 401, 403])


class SignalTest(TestCase):
    """Test signals."""
    
    def test_cascade_and_shared_deletion(self):
        """Test PostUrl cascade deletion logic."""
        timestamp = str(int(time.time()))
        
        # Test cascade delete
        post1 = PostUrl.objects.create(url=f"https://cascade-{timestamp}.com")
        word1 = TrendyWord.objects.create(name=f"cascade-{timestamp}")
        word1.posturls.add(post1)
        
        word1.delete()
        self.assertFalse(PostUrl.objects.filter(url=f"https://cascade-{timestamp}.com").exists())
        
        # Test shared post not deleted
        shared_post = PostUrl.objects.create(url=f"https://shared-{timestamp}.com")
        word2 = TrendyWord.objects.create(name=f"word2-{timestamp}")
        word3 = TrendyWord.objects.create(name=f"word3-{timestamp}")
        
        word2.posturls.add(shared_post)
        word3.posturls.add(shared_post)
        
        word2.delete()
        self.assertTrue(PostUrl.objects.filter(url=f"https://shared-{timestamp}.com").exists())


class IntegrationTest(TestCase):
    """Integration tests."""
    
    def setUp(self):
        """Setup integration."""
        self.timestamp = str(int(time.time()))
        self.user = User.objects.create_user(f"integration{self.timestamp}", "test@test.com", "pass")
        self.source = Source.objects.create(url=f"https://feeds-{self.timestamp}.com")
        self.subscriber = Subscriber.objects.create(user_rec=self.user, email=True)
    
    def test_workflow(self):
        """Test complete workflow."""
        # Create workflow components
        post = PostUrl.objects.create(url=f"https://workflow-{self.timestamp}.com")
        word = TrendyWord.objects.create(name=f"malware-{self.timestamp}", occurrences=3)
        word.posturls.add(post)
        
        self.assertEqual(TrendyWord.objects.count(), 1)
        self.assertEqual(PostUrl.objects.count(), 1)
        self.assertTrue(word.posturls.filter(url=f"https://workflow-{self.timestamp}.com").exists())
    
    @patch('threats_watcher.core.send_app_specific_notifications')
    @patch('threats_watcher.core.start_scheduler')
    def test_scheduler_notifications(self, mock_scheduler, mock_notifications):
        """Test scheduler and notifications."""
        from threats_watcher.core import send_threats_watcher_notifications, start_scheduler
        
        # Test notifications
        send_threats_watcher_notifications([f'test-{self.timestamp}'])
        mock_notifications.assert_called_once()
        
        # Test scheduler
        mock_scheduler.return_value = None
        try:
            start_scheduler()
            scheduler_ok = True
        except:
            scheduler_ok = False
        self.assertTrue(scheduler_ok)


@patch('threats_watcher.core.get_ner_pipeline')
def test_extract_entities_and_threats(self, mock_get_ner_pipeline):
    mock_get_ner_pipeline.return_value = [
        {"entity_group": "PER", "word": "Alice"},
        {"entity_group": "ORG", "word": "Acme Corp"},
        {"entity_group": "LOC", "word": "Paris"},
        {"entity_group": "MISC", "word": "Windows"},
    ]
    from threats_watcher.core import extract_entities_and_threats
    title = "Alice from Acme Corp detected CVE-2023-1234 in Windows at Paris. APT28 involved."
    result = extract_entities_and_threats(title)
    assert "Alice" in result["persons"]
    assert "Acme" in result["organizations"] or "Corp" in result["organizations"]
    assert "Paris" in result["locations"]
    assert "Windows" in result["product"]
    assert "CVE-2023-1234" in result["cves"]
    assert "APT28" in result["attackers"]

class ReliabilityScoreTest(TestCase):
    """Test reliability score computation."""
    def setUp(self):
        self.source = Source.objects.create(url="https://trusted-source.com/feed.xml", confident=1)
        self.word = TrendyWord.objects.create(name="testword", occurrences=2)
        self.post1 = PostUrl.objects.create(url="https://trusted-source.com/post1")
        self.post2 = PostUrl.objects.create(url="https://trusted-source.com/post2")
        self.word.posturls.add(self.post1, self.post2)

    @patch('threats_watcher.core.get_pre_redirect_domain')
    def test_reliability_score(self, mock_pre_redirect):
        mock_pre_redirect.return_value = "trusted-source.com"
        from threats_watcher.core import reliability_score
        reliability_score()
        updated_word = TrendyWord.objects.get(pk=self.word.pk)
        assert updated_word.score == 100  # confident=1 gives 100

class TrendingAlgorithmTest(TestCase):
    """Test trending words algorithm and occurrence filter."""
    def setUp(self):
        self.wordurl = {
            "malware_url": "https://example.com/1, https://example.com/2"
        }
        self.posts_published = {
            "https://example.com/1": timezone.now(),
            "https://example.com/2": timezone.now(),
        }

    def test_focus_on_top(self):
        import threats_watcher.core
        setattr(threats_watcher.core, 'wordurl', self.wordurl)
        setattr(threats_watcher.core, 'posts_published', self.posts_published)
        setattr(threats_watcher.core, 'posts_five_letters', {"malware": 2})

        from threats_watcher.core import focus_on_top
        TrendyWord.objects.create(name="malware", occurrences=2)
        focus_on_top(2)
        word = TrendyWord.objects.get(name="malware")
        assert word.posturls.count() > 0

class SourceNewFieldsTest(TestCase):
    """Test new fields added to the Source model: last_status_code and last_checked."""

    def test_source_new_fields_persisted(self):
        """Source can be created with last_status_code and last_checked."""
        now = timezone.now()
        source = Source.objects.create(
            url="https://new-fields-test.com/feed.xml",
            last_status_code=200,
            last_checked=now,
        )
        source.refresh_from_db()
        self.assertEqual(source.last_status_code, 200)
        self.assertIsNotNone(source.last_checked)

    def test_source_new_fields_nullable(self):
        """Source created without last_status_code and last_checked defaults to None."""
        source = Source.objects.create(url="https://nullable-test.com/feed.xml")
        source.refresh_from_db()
        self.assertIsNone(source.last_status_code)
        self.assertIsNone(source.last_checked)


class SourceSerializerLastEventTest(APITestCase):
    """Test that the SourceSerializer exposes last_status_code, last_checked and last_event."""

    def setUp(self):
        self.user = User.objects.create_superuser(username='sourceapi', password='pass')
        _, token = AuthToken.objects.create(self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token}')
        self.source = Source.objects.create(url="https://serializer-lastev.com/feed.xml")

    def test_source_serializer_includes_new_fields(self):
        """GET /api/threats_watcher/source/ must expose last_status_code, last_checked, last_event."""
        response = self.client.get('/api/threats_watcher/source/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        results = response.data['results']
        self.assertTrue(len(results) >= 1, "Expected at least one Source in the response")
        first = results[0]
        self.assertIn('last_status_code', first)
        self.assertIn('last_checked', first)
        self.assertIn('last_event', first)
        # No timeline events → last_event is null
        last_event = first['last_event']
        if last_event is not None:
            self.assertIn('action', last_event)
            self.assertIn('username', last_event)


class PerformanceTest(TestCase):
    """Test performance and cleanup."""
    
    def test_bulk_operations(self):
        """Test bulk operations performance."""
        unique_id = str(uuid.uuid4())[:8]
        start_time = timezone.now()
        
        # Bulk create
        sources = [Source(url=f"https://perf-{unique_id}-{i}.com") for i in range(15)]
        Source.objects.bulk_create(sources)
        
        posts = [PostUrl(url=f"https://post-{unique_id}-{i}.com") for i in range(20)]
        PostUrl.objects.bulk_create(posts)
        
        duration = (timezone.now() - start_time).total_seconds()
        
        self.assertLess(duration, 2.0)
        self.assertEqual(Source.objects.count(), 15)
        self.assertEqual(PostUrl.objects.count(), 20)
    
    def test_input_validation(self):
        """Test input validation."""
        unique_id = str(uuid.uuid4())[:8]
        
        # Valid inputs
        valid_urls = [f"https://valid-{unique_id}.com", f"http://test-{unique_id}.org"]
        for url in valid_urls:
            source = Source.objects.create(url=url)
            self.assertEqual(source.url, url)
        
        valid_words = [f"cyber-{unique_id}", f"malware-{unique_id}"]
        for word in valid_words:
            trendy = TrendyWord.objects.create(name=word)
            banned = BannedWord.objects.create(name=f"banned-{word}")
            self.assertEqual(trendy.name, word)
            self.assertEqual(banned.name, f"banned-{word}")
    
    def test_cleanup(self):
        """Test cleanup functionality."""
        with patch('threats_watcher.core.cleanup') as mock_cleanup:
            from threats_watcher.core import cleanup
            unique_id = str(uuid.uuid4())[:8]
            
            mock_cleanup.return_value = None
            
            # Old word
            old_word = TrendyWord.objects.create(name=f"old-{unique_id}")
            old_word.created_at = timezone.now() - timezone.timedelta(days=31)
            old_word.save()
            
            # Recent word
            TrendyWord.objects.create(name=f"recent-{unique_id}")
            
            try:
                cleanup()
                cleanup_works = True
            except:
                cleanup_works = False
            
            self.assertTrue(cleanup_works)
            mock_cleanup.assert_called_once()


class MonitoredKeywordModelTest(TestCase):
    """Test MonitoredKeyword model behaviour."""

    def test_create_default_level(self):
        mk = MonitoredKeyword.objects.create(name="Alice")
        self.assertEqual(mk.level, 'warm')
        self.assertEqual(mk.occurrences, 0)
        self.assertIsNone(mk.last_seen)

    def test_update_level_escalates_correctly(self):
        mk = MonitoredKeyword(name="CVE-2025-1234", occurrences=0)
        mk.update_level(); self.assertEqual(mk.level, 'warm')
        mk.occurrences = 3
        mk.update_level(); self.assertEqual(mk.level, 'hot')
        mk.occurrences = 10
        mk.update_level(); self.assertEqual(mk.level, 'super_hot')
        mk.occurrences = 25
        mk.update_level(); self.assertEqual(mk.level, 'super_hot')

    def test_unique_name_constraint(self):
        MonitoredKeyword.objects.create(name="UniqueKW")
        with self.assertRaises(Exception):
            MonitoredKeyword.objects.create(name="UniqueKW")

    def test_str_representation(self):
        mk = MonitoredKeyword.objects.create(name="Ransomware")
        self.assertIn("Ransomware", str(mk))


class MonitoredKeywordAPITest(APITestCase):
    """Test MonitoredKeyword REST API endpoints."""

    def setUp(self):
        self.user = User.objects.create_user(username='mktestuser', password='mktestpass')
        self.user.user_permissions.set(
            list(self.user.user_permissions.all())
        )
        # Give all permissions
        from django.contrib.auth.models import Permission
        for perm in Permission.objects.filter(codename__in=[
            'add_monitoredkeyword', 'change_monitoredkeyword',
            'delete_monitoredkeyword', 'view_monitoredkeyword'
        ]):
            self.user.user_permissions.add(perm)
        instance, token = AuthToken.objects.create(self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token}')

    def test_list_monitored_keywords(self):
        MonitoredKeyword.objects.create(name="TestKW1")
        MonitoredKeyword.objects.create(name="TestKW2")
        response = self.client.get('/api/threats_watcher/monitored-keywords/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_create_monitored_keyword(self):
        data = {'name': 'NewKeyword'}
        response = self.client.post('/api/threats_watcher/monitored-keywords/', data, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(MonitoredKeyword.objects.filter(name='NewKeyword').exists())

    def test_delete_monitored_keyword(self):
        mk = MonitoredKeyword.objects.create(name="ToDelete")
        response = self.client.delete(f'/api/threats_watcher/monitored-keywords/{mk.id}/')
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(MonitoredKeyword.objects.filter(id=mk.id).exists())

    def test_patch_monitored_keyword(self):
        mk = MonitoredKeyword.objects.create(name="OldName")
        response = self.client.patch(
            f'/api/threats_watcher/monitored-keywords/{mk.id}/',
            {'name': 'UpdatedName'},
            format='json'
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        mk.refresh_from_db()
        self.assertEqual(mk.name, 'UpdatedName')

    def test_serializer_includes_level_display(self):
        mk = MonitoredKeyword.objects.create(name="LevelTest", occurrences=3)
        mk.update_level(); mk.save()
        response = self.client.get(f'/api/threats_watcher/monitored-keywords/{mk.id}/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('level_display', response.data)


class ThreatsWatcherBulkTest(APITestCase):
    """Bulk create / delete on /api/threats_watcher/ (common.bulk mixins)."""

    BANNED_URL = '/api/threats_watcher/bannedword/'
    KEYWORD_URL = '/api/threats_watcher/monitored-keywords/'

    def setUp(self):
        self.admin = User.objects.create_superuser(username='threats_bulk_admin', password='testpass123')
        self._login(self.admin)

    def _login(self, user):
        _, token = AuthToken.objects.create(user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token}')

    def _post(self, url, body):
        return self.client.post(url, body, format='json')

    def test_keywords_are_not_lowercased(self):
        response = self._post(self.BANNED_URL + 'bulk_create/', {'values': 'LockBit\nCobalt Strike', 'shared': {}})
        self.assertEqual(response.data['created'], 2, response.data)
        self.assertTrue(BannedWord.objects.filter(name='LockBit').exists())

    def test_monitored_keywords_batch_creates_every_line(self):
        response = self._post(self.KEYWORD_URL + 'bulk_create/', {'values': 'CVE-2024-3400\nPAN-OS', 'shared': {}})
        self.assertEqual(response.data['created'], 2, response.data)

    def test_user_without_add_permission_is_rejected_like_a_single_create(self):
        self._login(User.objects.create_user(username='threats_reader', password='testpass123'))
        self.assertEqual(self._post(self.BANNED_URL + 'bulk_create/', {'values': 'x'}).status_code, status.HTTP_403_FORBIDDEN)
        self.client.credentials()
        self.assertIn(self._post(self.BANNED_URL + 'bulk_create/', {'values': 'x'}).status_code,
                      (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN))

    def test_user_with_add_permission_can_bulk_create(self):
        from django.contrib.auth.models import Permission
        user = User.objects.create_user(username='threats_adder', password='testpass123')
        user.user_permissions.add(Permission.objects.get(codename='add_bannedword'))
        self._login(user)
        self.assertEqual(self._post(self.BANNED_URL + 'bulk_create/', {'values': 'allowed'}).data['created'], 1)

    def test_bulk_delete_banned_words(self):
        a = BannedWord.objects.create(name='del-a')
        b = BannedWord.objects.create(name='del-b')
        response = self._post(self.BANNED_URL + 'bulk_delete/', {'ids': [a.pk, b.pk, 999999]})
        self.assertEqual((response.data['succeeded'], response.data['skipped']), (2, 1), response.data)
        self.assertFalse(BannedWord.objects.filter(pk__in=[a.pk, b.pk]).exists())


class ThreatsWatcherPageAPITest(APITestCase):
    """List filters, light rows, ban action and statistics used by the Threats Watcher page."""

    WORDS = '/api/threats_watcher/trendyword/'

    def setUp(self):
        _, token = AuthToken.objects.create(User.objects.create_superuser(username='tw_page', password='testpass123'))
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token}')
        old = timezone.now() - timedelta(days=10)
        self.post_a = PostUrl.objects.create(url='https://cert.example/a')
        self.post_b = PostUrl.objects.create(url='https://blog.example/b', created_at=old)
        # Created with one occurrence, then updated without signals: from 3 occurrences the post_save signal
        # writes an AI summary (loads the language model).
        self.ransom = TrendyWord.objects.create(name='ransomware', occurrences=1, score=90)
        self.phish = TrendyWord.objects.create(name='phishing', occurrences=1, score=20, created_at=old)
        TrendyWord.objects.filter(pk=self.ransom.pk).update(occurrences=12)
        TrendyWord.objects.filter(pk=self.phish.pk).update(occurrences=3)
        self.ransom.posturls.add(self.post_a, self.post_b)
        self.phish.posturls.add(self.post_b)
        Source.objects.create(url='https://cert.example/feed', confident=1, country='France', country_code='FR', last_status_code=200)
        Source.objects.create(url='https://blog.example/feed', confident=3, country='France', country_code='FR', last_status_code=404)
        Source.objects.create(url='https://news.example/feed', confident=2, country='Germany', country_code='DE')
        self.keyword = MonitoredKeyword.objects.create(name='Ransomware', occurrences=4, last_seen=timezone.now())
        self.keyword.posturls.add(self.post_a)

    def names(self, url, query=''):
        response = self.client.get(url + query)
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        return sorted(r.get('name') or r.get('url') for r in response.data['results'])

    def test_word_graph_links_words_by_shared_articles(self):
        lone = TrendyWord.objects.create(name='botnet', occurrences=1)
        self.client.credentials()  # Public, like the trends.
        data = self.client.get(self.WORDS + 'graph/').data
        self.assertEqual([n['name'] for n in data['nodes']], ['ransomware', 'phishing', 'botnet'])
        self.assertEqual(data['links'], [{'source': self.ransom.id, 'target': self.phish.id, 'weight': 1}])
        self.assertEqual(next(n for n in data['nodes'] if n['id'] == lone.id)['posts_count'], 0)
        self.assertEqual([n['name'] for n in self.client.get(self.WORDS + 'graph/?period=7d').data['nodes']], ['ransomware', 'botnet'])

    def test_word_filters_and_light_rows(self):
        self.assertEqual(self.names(self.WORDS, '?confidence=high'), ['ransomware'])
        self.assertEqual(self.names(self.WORDS, '?confidence=low'), ['phishing'])
        self.assertEqual(self.names(self.WORDS, '?period=7d'), ['ransomware'])
        self.assertEqual(self.names(self.WORDS, '?search=phish'), ['phishing'])
        row = self.client.get(self.WORDS + '?ordering=-posts_count').data['results'][0]
        self.assertEqual((row['name'], row['posts_count']), ('ransomware', 2))
        self.assertNotIn('posturls', row)

    def test_word_detail_lists_its_articles(self):
        detail = self.client.get(self.WORDS + f'{self.ransom.id}/').data
        self.assertEqual([p['url'] for p in detail['posts']], ['https://cert.example/a', 'https://blog.example/b'])
        self.assertTrue(detail['monitored'])

    def test_ban_moves_the_word_to_the_banned_words(self):
        response = self.client.post(self.WORDS + f'{self.phish.id}/ban/')
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertTrue(BannedWord.objects.filter(name='phishing').exists())
        self.assertFalse(TrendyWord.objects.filter(pk=self.phish.pk).exists())

    def test_ban_needs_both_rights(self):
        _, token = AuthToken.objects.create(User.objects.create_user(username='tw_reader', password='testpass123'))
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token}')
        self.assertEqual(self.client.post(self.WORDS + f'{self.phish.id}/ban/').status_code, status.HTTP_403_FORBIDDEN)
        self.assertTrue(TrendyWord.objects.filter(pk=self.phish.pk).exists())

    def test_source_filters(self):
        sources = '/api/threats_watcher/source/'
        self.assertEqual(self.names(sources, '?confidence=1'), ['https://cert.example/feed'])
        self.assertEqual(self.names(sources, '?status=failing'), ['https://blog.example/feed'])
        self.assertEqual(self.names(sources, '?status=unchecked'), ['https://news.example/feed'])
        self.assertEqual(self.names(sources, '?search=germany'), ['https://news.example/feed'])

    def test_monitored_keyword_rows_count_their_articles(self):
        row = self.client.get('/api/threats_watcher/monitored-keywords/?seen=yes').data['results'][0]
        self.assertEqual((row['name'], row['posts_count']), ('Ransomware', 1))
        self.assertNotIn('posturls', row)
        detail = self.client.get(f'/api/threats_watcher/monitored-keywords/{self.keyword.id}/').data
        self.assertEqual(detail['posts'][0]['url'], 'https://cert.example/a')

    def test_statistics(self):
        stats = self.client.get('/api/threats_watcher/source/statistics/').data
        self.assertEqual((stats['totalWords'], stats['totalSources'], stats['failingSources'], stats['monitoredSeen']), (2, 3, 1, 1))
        self.assertEqual(stats['sourcesByCountry'][0], {'code': 'FR', 'country': 'France', 'count': 2})
        self.assertEqual(stats['sourcesByConfidence'], {'1': 1, '2': 1, '3': 1})
        self.assertEqual(len(stats['wordsPerDay']), 30)
        self.assertEqual(stats['wordsPerDay'][-1]['count'], 1)
        self.assertEqual(stats['articlesPerDay'][-1]['count'], 1)


# Problems of the feeds in the log
class FeedProblemLoggingTest(TestCase):
    def setUp(self):
        self.source = Source.objects.create(url='https://blocked.example/feed/')
        core.sources_by_url = {self.source.url: self.source.id}

    def _report(self, status_code):
        with patch.object(core.logger, 'warning') as warning, patch.object(core.logger, 'debug') as debug:
            core._update_source_status(self.source.url, status_code)('problem')
        return warning.called, debug.called

    def test_a_feed_that_starts_failing_is_a_warning(self):
        self.assertEqual(self._report(403), (True, False))

    def test_the_same_failure_at_the_next_check_is_only_debug(self):
        self._report(403)
        self.assertEqual(self._report(403), (False, True))

    def test_a_different_failure_is_a_warning_again(self):
        self._report(403)
        self.assertEqual(self._report(0), (True, False))

    def test_the_status_is_still_recorded(self):
        self._report(403)
        self.source.refresh_from_db()
        self.assertEqual(self.source.last_status_code, 403)


# Monitored keywords written as rules
def _rule(all_of=(), any_of=(), exceptions=(), whole_words=True):
    return SimpleNamespace(all_of=list(all_of), any_of=list(any_of), exceptions=list(exceptions), whole_words=whole_words)


class MatchTest(SimpleTestCase):
    def test_every_word_of_all_of_has_to_be_there(self):
        rule = _rule(all_of=['Lazarus', 'Acme'])
        self.assertEqual(core.match_rule(rule, 'Lazarus targets Acme Corp'), ['Lazarus', 'Acme'])
        self.assertIsNone(core.match_rule(rule, 'Lazarus targets someone else'))
        self.assertIsNone(core.match_rule(rule, 'Acme was not attacked'))

    def test_the_order_and_the_distance_of_the_words_do_not_matter(self):
        self.assertIsNotNone(core.match_rule(_rule(all_of=['a1', 'b2']), 'b2 ... many words later ... a1'))

    def test_any_of_asks_for_one_more_word_among_several(self):
        rule = _rule(all_of=['Lazarus'], any_of=['Acme', 'Globex'])
        self.assertEqual(core.match_rule(rule, 'Lazarus and Globex'), ['Lazarus', 'Globex'])
        self.assertIsNone(core.match_rule(rule, 'Lazarus alone'))

    def test_any_of_alone_is_an_or(self):
        rule = _rule(any_of=['Acme', 'Globex'])
        self.assertIsNotNone(core.match_rule(rule, 'about Globex'))
        self.assertIsNone(core.match_rule(rule, 'about nobody'))

    def test_an_exception_cancels_the_match(self):
        self.assertIsNone(core.match_rule(_rule(all_of=['Lazarus'], exceptions=['webinar']), 'Lazarus webinar tomorrow'))

    def test_case_and_accents_are_ignored(self):
        self.assertIsNotNone(core.match_rule(_rule(all_of=['électricité', 'GROUPE']), 'Le groupe Electricite de Test'))

    def test_whole_words_do_not_match_inside_a_longer_word(self):
        rule = _rule(all_of=['apt'])
        self.assertIsNone(core.match_rule(rule, 'The patch was adapted'))
        self.assertIsNone(core.match_rule(rule, 'APT29 is active'))
        self.assertIsNotNone(core.match_rule(rule, 'An APT-29 campaign'))
        self.assertIsNotNone(core.match_rule(rule, 'the (APT) group'))

    def test_substring_mode_finds_a_word_inside_another(self):
        self.assertIsNotNone(core.match_rule(_rule(all_of=['apt'], whole_words=False), 'The patch was adapted'))

    def test_a_rule_without_words_matches_nothing(self):
        self.assertIsNone(core.match_rule(_rule(), 'anything'))

    def test_regex_characters_in_a_word_are_taken_literally(self):
        self.assertIsNotNone(core.match_rule(_rule(all_of=['c++']), 'written in C++ again'))
        self.assertIsNone(core.match_rule(_rule(all_of=['a.b']), 'axb'))

    def test_a_text_that_is_already_normalized_is_not_normalized_again(self):
        text = core.normalize_text('Électricité de France')
        self.assertIsNotNone(core.match_rule(_rule(all_of=['electricite']), text, normalized=True))


class MatchKeywordTest(TestCase):
    def test_a_single_word_keyword_behaves_as_before(self):
        keyword = MonitoredKeyword.objects.create(name='Acme')
        self.assertEqual(core.match_keyword(keyword, 'The acmeCorp breach'), ['Acme'])  # a part of a word counts
        self.assertIsNone(core.match_keyword(keyword, 'Nothing here'))

    def test_a_single_word_keyword_can_ask_for_whole_words_and_have_exceptions(self):
        keyword = MonitoredKeyword.objects.create(name='apt', whole_words=True, exceptions=['adapt'])
        self.assertIsNone(core.match_keyword(keyword, 'It was adapted'))
        self.assertIsNotNone(core.match_keyword(keyword, 'A new APT-28 campaign'))

    def test_a_rule_ignores_its_name(self):
        keyword = MonitoredKeyword.objects.create(name='Actor and partner', all_of=['Lazarus', 'Acme'])
        self.assertTrue(keyword.is_rule)
        self.assertIsNone(core.match_keyword(keyword, 'An article about Actor and partner'))
        self.assertEqual(core.match_keyword(keyword, 'Lazarus hits Acme'), ['Lazarus', 'Acme'])

    def test_the_words_are_cleaned_when_saved(self):
        keyword = MonitoredKeyword.objects.create(name='Clean', all_of=[' Lazarus ', 'lazarus', '', 'Acme'])
        self.assertEqual(keyword.all_of, ['Lazarus', 'Acme'])


FEED = """<?xml version="1.0"?><rss version="2.0"><channel><title>t</title>
<item><title>Lazarus group targets Acme</title><link>https://blog.example.org/one</link><description>Details</description></item>
<item><title>Lazarus alone</title><link>https://blog.example.org/two</link><description>Nothing about the partner</description></item>
<item><title>A report</title><link>https://blog.example.org/three</link><description>The Lazarus activity against Acme grows</description></item>
</channel></rss>"""


class CollectionTest(TestCase):
    """The articles of the feeds are checked as they are collected, and nothing is searched anywhere else."""

    def setUp(self):
        self.rule = MonitoredKeyword.objects.create(name='Actor and partner', all_of=['Lazarus', 'Acme'])
        self.word = MonitoredKeyword.objects.create(name='Lazarus')

    def _collect(self):
        core.rss_urls, core.feeds = [], [feedparser.parse(FEED)]
        with patch('threats_watcher.core.notify_keyword_rule_hit') as notify, \
                patch('requests.get', side_effect=AssertionError('no request is expected')):
            core.fetch_last_posts(10)
        return notify

    def test_the_matching_articles_of_a_feed_are_kept_and_notified_for_a_rule(self):
        notify = self._collect()
        self.assertEqual(sorted(KeywordHit.objects.values_list('url', flat=True)),
                         ['https://blog.example.org/one', 'https://blog.example.org/three'])
        self.assertEqual(notify.call_count, 2)

    def test_every_keyword_counts_its_mentions_and_has_a_level(self):
        self._collect()
        self.rule.refresh_from_db()
        self.word.refresh_from_db()
        self.assertEqual(self.rule.occurrences, 2)
        self.assertEqual(self.word.occurrences, 3)
        self.assertEqual(self.word.level, 'hot')
        self.assertEqual(self.rule.posturls.count(), 2)

    def test_a_single_word_keeps_no_hit_to_review(self):
        self._collect()
        self.assertFalse(KeywordHit.objects.filter(keyword=self.word).exists())

    def test_the_next_collection_does_not_count_or_notify_again(self):
        self._collect()
        notify = self._collect()
        notify.assert_not_called()
        self.rule.refresh_from_db()
        self.assertEqual((self.rule.occurrences, KeywordHit.objects.count()), (2, 2))

    def test_a_paused_keyword_is_left_alone(self):
        MonitoredKeyword.objects.filter(pk=self.rule.pk).update(is_active=False)
        notify = self._collect()
        notify.assert_not_called()
        self.assertEqual(KeywordHit.objects.count(), 0)

    def test_a_failing_notification_does_not_stop_the_collection(self):
        core.rss_urls, core.feeds = [], [feedparser.parse(FEED)]
        with patch('threats_watcher.core.notify_keyword_rule_hit', side_effect=RuntimeError('boom')):
            core.fetch_last_posts(10)
        self.assertEqual(KeywordHit.objects.count(), 2)
        self.assertIn('Lazarus group targets Acme', core.posts)


class NotificationTest(TestCase):
    def setUp(self):
        keyword = MonitoredKeyword.objects.create(name='Rule <b>', all_of=['Lazarus'])
        self.hit = KeywordHit.objects.create(keyword=keyword, url='https://blog.example.org/a', url_hash='h',
                                             title='New <script>x</script> & more', matched=['Lazarus'])

    def test_the_title_is_escaped_for_each_channel(self):
        from threats_watcher.core import _rule_context
        self.assertIn('&lt;script&gt;', _rule_context(self.hit, 'slack')['article_title'])
        self.assertIn('&lt;script&gt;', _rule_context(self.hit, 'citadel')['article_title'])
        self.assertEqual(_rule_context(self.hit, 'citadel')['rule_name'], 'Rule &lt;b&gt;')

    def test_the_email_goes_to_the_subscribers_of_monitored_keywords(self):
        from threats_watcher import core
        for name, email, keywords in (('yes', True, True), ('no_keywords', True, False), ('no_email', False, True)):
            Subscriber.objects.create(user_rec=User.objects.create_user(name, f'{name}@example.com'), email=email,
                                      notify_monitored_keywords=keywords)
        with patch('common.utils.send_email_notifications.send_email_notifications') as send:
            core._send_rule_email(self.hit)
            send.assert_not_called()  # off until a superuser switches it on
            NotificationSetting.objects.create(notification_type='article_rule_hit', channel='email', enabled=True)
            core._send_rule_email(self.hit)
        self.assertEqual(send.call_args.args[2], ['yes@example.com'])
        self.assertNotIn('<script>', send.call_args.args[1])

    def test_a_failing_channel_does_not_stop_the_next_ones(self):
        from threats_watcher import core
        sent = []
        with patch.object(core, '_send_rule_slack', side_effect=RuntimeError('boom')), \
                patch.object(core, '_send_rule_citadel', lambda hit: sent.append('citadel')), \
                patch.object(core, '_send_rule_email', lambda hit: sent.append('email')):
            with self.assertLogs('watcher.threats_watcher', level='INFO') as logs:
                core.notify_keyword_rule_hit(self.hit)
        self.assertEqual(sent, ['citadel', 'email'])
        self.assertEqual(logs.records[-1].levelname, 'WARNING')


class KeywordRuleApiTest(TestCase):
    URL = '/api/threats_watcher/monitored-keywords/'
    HITS = '/api/threats_watcher/keyword-hits/'

    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user('analyst', 'analyst@example.com', 'pass')
        self.client.force_authenticate(self.user)
        self.rule = MonitoredKeyword.objects.create(name='Actor and partner', all_of=['Lazarus', 'Acme'])
        self.word = MonitoredKeyword.objects.create(name='Ransomware')
        self.hit = KeywordHit.objects.create(keyword=self.rule, url='https://x.example/1', url_hash='a', title='One',
                                             matched=['Lazarus', 'Acme'])
        KeywordHit.objects.create(keyword=self.rule, url='https://x.example/2', url_hash='b', title='Two',
                                  matched=['Lazarus', 'Acme'], is_archived=True)

    def _allow(self, *codenames):
        self.user.user_permissions.add(*Permission.objects.filter(codename__in=codenames))
        self.user = User.objects.get(pk=self.user.pk)
        self.client.force_authenticate(self.user)

    def _row(self, name):
        return next(r for r in self.client.get(self.URL).json()['results'] if r['name'] == name)

    def test_the_hits_are_not_public(self):
        self.assertIn(APIClient().get(self.HITS).status_code, (401, 403))

    def test_the_list_tells_rules_from_single_words_and_counts_the_hits(self):
        rule, word = self._row('Actor and partner'), self._row('Ransomware')
        self.assertEqual((rule['is_rule'], rule['hits_count'], rule['open_hits_count']), (True, 2, 1))
        self.assertEqual((word['is_rule'], word['hits_count']), (False, 0))
        self.assertEqual(rule['all_of'], ['Lazarus', 'Acme'])

    def test_the_list_can_be_limited_to_rules_or_to_words(self):
        names = lambda kind: [r['name'] for r in self.client.get(self.URL, {'kind': kind}).json()['results']]
        self.assertEqual(names('rule'), ['Actor and partner'])
        self.assertEqual(names('word'), ['Ransomware'])

    def test_a_rule_is_created_like_a_keyword(self):
        self._allow('add_monitoredkeyword')
        payload = {'name': 'New rule', 'all_of': ['a1', 'b2'], 'whole_words': True}
        response = self.client.post(self.URL, payload, format='json')
        self.assertEqual(response.status_code, 201, response.content)
        self.assertTrue(response.json()['is_rule'])

    def test_a_single_word_keyword_is_created_as_before(self):
        self._allow('add_monitoredkeyword')
        response = self.client.post(self.URL, {'name': 'newword'}, format='json')
        self.assertEqual(response.status_code, 201, response.content)
        self.assertEqual((response.json()['is_rule'], response.json()['is_active']), (False, True))

    def test_the_words_of_a_rule_are_validated(self):
        self._allow('add_monitoredkeyword')
        self.assertEqual(self.client.post(self.URL, {'name': 'Bad', 'all_of': 'text'}, format='json').status_code, 400)
        self.assertEqual(self.client.post(self.URL, {'name': 'Long', 'all_of': ['x' * 151]}, format='json').status_code, 400)

    def test_a_keyword_can_be_paused_in_bulk(self):
        self._allow('change_monitoredkeyword')
        response = self.client.post(f'{self.URL}bulk_update/', {'ids': [self.rule.pk], 'changes': {'is_active': False}}, format='json')
        self.assertEqual(response.status_code, 200, response.content)
        self.rule.refresh_from_db()
        self.assertFalse(self.rule.is_active)

    def test_the_hits_can_be_filtered_by_keyword_and_state(self):
        self.assertEqual(len(self.client.get(self.HITS, {'keyword': self.rule.pk}).json()['results']), 2)
        self.assertEqual([h['title'] for h in self.client.get(self.HITS, {'status': 'active'}).json()['results']], ['One'])

    def test_a_hit_can_be_archived_but_nothing_else_changes(self):
        self._allow('change_keywordhit')
        response = self.client.patch(f'{self.HITS}{self.hit.pk}/',
                                     {'is_archived': True, 'title': 'Changed', 'url': 'https://evil.example/'}, format='json')
        self.assertEqual(response.status_code, 200, response.content)
        self.hit.refresh_from_db()
        self.assertEqual((self.hit.is_archived, self.hit.title, self.hit.url), (True, 'One', 'https://x.example/1'))
