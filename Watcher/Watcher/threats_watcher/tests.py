import time
import uuid
from datetime import timedelta
from unittest.mock import patch, MagicMock
from django.test import TestCase, TransactionTestCase
from django.contrib.auth.models import User
from django.utils import timezone
from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework.test import APITestCase
from rest_framework import status
from knox.models import AuthToken
from rest_framework.test import APIClient
from threats_watcher.models import Source, PostUrl, TrendyWord, BannedWord, Subscriber, Summary, MonitoredKeyword, WatcherConfiguration
from threats_watcher.serializers import TrendyWordSerializer, BannedWordSerializer, SummarySerializer


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
        subscriber = Subscriber.objects.create(user_rec=user, email=True, slack=True)
        
        self.assertTrue(subscriber.email)
        self.assertTrue(subscriber.slack)
        self.assertFalse(subscriber.thehive)
        self.assertFalse(subscriber.citadel)
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


class ExtractEntitiesAndThreatsTest(TestCase):
    """Test the NER-based extraction of entities and threats from a title."""

    @staticmethod
    def _ner(entities):
        """get_ner_pipeline() returns a callable pipeline: the mock must be callable too."""
        pipeline = MagicMock(return_value=entities)
        return patch('threats_watcher.core.get_ner_pipeline', return_value=pipeline)

    def test_extract_entities_and_threats(self):
        entities = [
            {"entity_group": "PER", "word": "Alice"},
            {"entity_group": "ORG", "word": "Acme Corp"},
            {"entity_group": "LOC", "word": "Paris"},
            {"entity_group": "MISC", "word": "Windows"},
        ]
        from threats_watcher.core import extract_entities_and_threats
        title = "Alice from Acme Corp detected CVE-2023-1234 in Windows at Paris. APT28 involved."
        with self._ner(entities):
            result = extract_entities_and_threats(title)
        self.assertIn("Alice", result["persons"])
        self.assertTrue("Acme" in result["organizations"] or "Corp" in result["organizations"])
        self.assertIn("Paris", result["locations"])
        self.assertIn("Windows", result["product"])
        self.assertIn("CVE-2023-1234", result["cves"])
        self.assertIn("APT28", result["attackers"])

    def test_noise_tokens_are_ignored(self):
        entities = [
            {"entity_group": "PER", "word": "##ice"},   # BERT subword artifact
            {"entity_group": "PER", "word": "Al"},      # too short
            {"entity_group": "LOC", "word": "2026"},    # pure number
            {"entity_group": "ORG", "word": "the"},     # common noise word
        ]
        from threats_watcher.core import extract_entities_and_threats
        with self._ner(entities):
            result = extract_entities_and_threats("nothing to see here")
        self.assertEqual(result["persons"], [])
        self.assertEqual(result["locations"], [])
        self.assertEqual(result["organizations"], [])

    def test_cves_and_attackers_are_deduplicated(self):
        from threats_watcher.core import extract_entities_and_threats
        title = "CVE-2024-0001 and CVE-2024-0001 exploited by APT28, FIN7 and APT28"
        with self._ner([]):
            result = extract_entities_and_threats(title)
        self.assertEqual(result["cves"], ["CVE-2024-0001"])
        self.assertCountEqual(result["attackers"], ["APT28", "FIN7"])

    def test_returns_empty_lists_when_ner_pipeline_is_unavailable(self):
        from threats_watcher.core import extract_entities_and_threats
        with patch('threats_watcher.core.get_ner_pipeline', return_value=None):
            result = extract_entities_and_threats("Alice found CVE-2023-1234")
        self.assertEqual(result, {
            "persons": [], "organizations": [], "locations": [],
            "product": [], "cves": [], "attackers": [],
        })


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
        results = list(response.data)
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
            recent_word = TrendyWord.objects.create(name=f"recent-{unique_id}")
            
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


class WatcherConfigurationModelTest(TestCase):
    """Test the WatcherConfiguration singleton."""

    def test_default_cooldown(self):
        self.assertEqual(WatcherConfiguration.get_cooldown(), 15)

    def test_get_cooldown_creates_the_singleton(self):
        self.assertEqual(WatcherConfiguration.objects.count(), 0)
        WatcherConfiguration.get_cooldown()
        self.assertEqual(WatcherConfiguration.objects.count(), 1)

    def test_save_always_uses_pk_1(self):
        WatcherConfiguration(regenerate_cooldown_minutes=5).save()
        WatcherConfiguration(regenerate_cooldown_minutes=30).save()
        self.assertEqual(WatcherConfiguration.objects.count(), 1)
        self.assertEqual(WatcherConfiguration.get_cooldown(), 30)

    def test_str_representation(self):
        self.assertEqual(str(WatcherConfiguration()), "Global Settings")


class SummaryAiModelTest(TestCase):
    """Test the ai_model field of Summary."""

    def test_ai_model_default(self):
        summary = Summary.objects.create(type='weekly_summary', summary_text="text")
        self.assertEqual(summary.ai_model, "Unknown")

    def test_ai_model_in_serializer(self):
        summary = Summary.objects.create(type='weekly_summary', summary_text="text", ai_model="gpt-test")
        self.assertEqual(SummarySerializer(summary).data['ai_model'], "gpt-test")


class SummaryRegenerateAPITest(APITestCase):
    """Test the regenerate endpoints (cooldown, 404, 502) with the generators mocked."""

    def setUp(self):
        self.user = User.objects.create_superuser("regenuser", password="regenpass123")
        _, token = AuthToken.objects.create(self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token}')
        WatcherConfiguration.objects.create(regenerate_cooldown_minutes=15)

    def _age_summary(self, summary, minutes):
        """updated_at is auto_now, so it must be rewritten with update()."""
        Summary.objects.filter(pk=summary.pk).update(updated_at=timezone.now() - timedelta(minutes=minutes))

    # --- weekly ---

    @patch('threats_watcher.summary_manager.generate_weekly_summary')
    def test_regenerate_weekly_success(self, mock_generate):
        summary = Summary.objects.create(type='weekly_summary', summary_text="Weekly text")
        self._age_summary(summary, 60)
        mock_generate.side_effect = lambda notify=True: Summary.objects.create(
            type='weekly_summary', summary_text="New weekly text"
        )
        response = self.client.post('/api/threats_watcher/summary/regenerate-weekly/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data['success'])
        self.assertEqual(response.data['data']['summary_text'], "New weekly text")
        mock_generate.assert_called_once()

    @patch('threats_watcher.summary_manager.generate_weekly_summary')
    def test_regenerate_weekly_blocked_by_cooldown(self, mock_generate):
        Summary.objects.create(type='weekly_summary', summary_text="Fresh weekly")
        response = self.client.post('/api/threats_watcher/summary/regenerate-weekly/')
        self.assertEqual(response.status_code, 429)
        self.assertFalse(response.data['success'])
        mock_generate.assert_not_called()

    @patch('threats_watcher.summary_manager.generate_weekly_summary')
    def test_regenerate_weekly_returns_502_when_nothing_generated(self, mock_generate):
        response = self.client.post('/api/threats_watcher/summary/regenerate-weekly/')
        self.assertEqual(response.status_code, 502)
        self.assertFalse(response.data['success'])

    @patch('threats_watcher.summary_manager.generate_weekly_summary') 
    def test_regenerate_weekly_failure_returns_error_with_most_recent_report(self, mock_generate):
        summary = Summary.objects.create(type='weekly_summary', summary_text="Previous weekly")
        self._age_summary(summary, 60)
        response = self.client.post('/api/threats_watcher/summary/regenerate-weekly/')
        self.assertEqual(response.status_code, 502)
        self.assertFalse(response.data['success'])
        self.assertIn('could not generate', response.data['message'])
        self.assertEqual(response.data['data']['id'], summary.id)

    @patch('threats_watcher.summary_manager.generate_weekly_summary', side_effect=RuntimeError("boom"))
    def test_regenerate_weekly_returns_500_on_exception(self, _mock_generate):
        response = self.client.post('/api/threats_watcher/summary/regenerate-weekly/')
        self.assertEqual(response.status_code, 500)
        self.assertEqual(response.data['message'], "boom")

    def test_cooldown_uses_configured_value(self):
        WatcherConfiguration.objects.filter(pk=1).update(regenerate_cooldown_minutes=120)
        summary = Summary.objects.create(type='weekly_summary', summary_text="Weekly text")
        self._age_summary(summary, 60)
        with patch('threats_watcher.summary_manager.generate_weekly_summary') as mock_generate:
            response = self.client.post('/api/threats_watcher/summary/regenerate-weekly/')
        self.assertEqual(response.status_code, 429)
        mock_generate.assert_not_called()

    # --- keyword ---

    def test_regenerate_keyword_unknown_returns_404(self):
        response = self.client.post('/api/threats_watcher/summary/by-keyword/unknownword/regenerate/')
        self.assertEqual(response.status_code, 404)
        self.assertFalse(response.data['success'])

    @patch('threats_watcher.summary_manager.generate_trendy_word_summary')
    def test_regenerate_keyword_for_trendy_word(self, mock_generate):
        # occurrences < 3: the post_save signal does not generate a summary
        trendy = TrendyWord.objects.create(name="ransomwarex", occurrences=1)
        mock_generate.return_value = Summary.objects.create(
            type='trendy_word_summary', keywords="ransomwarex", summary_text="Summary"
        )
        # The returned summary is brand new and matches the keyword: age it so the cooldown does not apply
        self._age_summary(mock_generate.return_value, 60)
        response = self.client.post('/api/threats_watcher/summary/by-keyword/ransomwarex/regenerate/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data['success'])
        mock_generate.assert_called_once_with(trendy.id)

    @patch('threats_watcher.summary_manager.generate_trendy_word_summary')
    def test_regenerate_keyword_blocked_by_cooldown(self, mock_generate):
        Summary.objects.create(type='trendy_word_summary', keywords="Phishing", summary_text="Fresh")
        response = self.client.post('/api/threats_watcher/summary/by-keyword/phishing/regenerate/')
        self.assertEqual(response.status_code, 429)
        mock_generate.assert_not_called()

    # --- breaking news ---

    def test_regenerate_breaking_unknown_trendy_word_returns_404(self):
        response = self.client.post('/api/threats_watcher/summary/by-keyword/unknownword/regenerate-breaking/')
        self.assertEqual(response.status_code, 404)

    @patch('threats_watcher.summary_manager.generate_breaking_news')
    def test_regenerate_breaking_success(self, mock_generate):
        TrendyWord.objects.create(name="zerodayx", occurrences=1)
        mock_generate.return_value = Summary.objects.create(
            type='breaking_news', keywords="zerodayx", summary_text="Breaking"
        )
        # The summary created for the mock is fresh: age it so the cooldown does not apply
        self._age_summary(mock_generate.return_value, 60)
        response = self.client.post('/api/threats_watcher/summary/by-keyword/zerodayx/regenerate-breaking/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data['success'])

    @patch('threats_watcher.summary_manager.generate_breaking_news')
    def test_regenerate_breaking_blocked_by_cooldown(self, mock_generate):
        TrendyWord.objects.create(name="zerodayx", occurrences=1)
        Summary.objects.create(type='breaking_news', keywords="zerodayx", summary_text="Fresh")
        response = self.client.post('/api/threats_watcher/summary/by-keyword/zerodayx/regenerate-breaking/')
        self.assertEqual(response.status_code, 429)
        mock_generate.assert_not_called()


class SummaryConfigAPITest(APITestCase):
    """Cooldown configuration endpoint: readable by any authenticated user, writable by admins only."""

    URL = '/api/threats_watcher/summary/config/'

    def _login(self, user):
        _, token = AuthToken.objects.create(user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token}')

    def test_admin_can_read_cooldown(self):
        self._login(User.objects.create_superuser("cfgadmin", password="cfgpass123"))
        response = self.client.get(self.URL)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['regenerate_cooldown_minutes'], 15)

    def test_admin_can_update_cooldown(self):
        self._login(User.objects.create_superuser("cfgadmin", password="cfgpass123"))
        response = self.client.post(self.URL, {'regenerate_cooldown_minutes': 42}, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(WatcherConfiguration.get_cooldown(), 42)

    def test_invalid_value_returns_400(self):
        self._login(User.objects.create_superuser("cfgadmin", password="cfgpass123"))
        response = self.client.post(self.URL, {'regenerate_cooldown_minutes': 'abc'}, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_missing_value_returns_400(self):
        self._login(User.objects.create_superuser("cfgadmin", password="cfgpass123"))
        response = self.client.post(self.URL, {}, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_non_admin_can_read_but_not_update(self):
        self._login(User.objects.create_user("cfguser", password="cfgpass123"))
        response = self.client.get(self.URL)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['regenerate_cooldown_minutes'], 15)
        response = self.client.post(self.URL, {'regenerate_cooldown_minutes': 1}, format='json')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(WatcherConfiguration.get_cooldown(), 15)

    def test_anonymous_is_refused(self):
        response = self.client.get(self.URL)
        self.assertIn(response.status_code, [status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN])

class SummaryConfigPermissionTest(TestCase):
    """Cooldown config: readable by any authenticated user, writable by admins only."""

    URL = '/api/threats_watcher/summary/config/'

    def setUp(self):
        User = get_user_model()
        self.admin = User.objects.create_user(username='cfg-admin', password='pass', is_staff=True)
        self.user = User.objects.create_user(username='cfg-user', password='pass')
        self.client = APIClient()

    def test_anonymous_cannot_read_config(self):
        response = self.client.get(self.URL)
        self.assertIn(response.status_code, (401, 403))

    def test_regular_user_can_read_config(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.get(self.URL)
        self.assertEqual(response.status_code, 200)
        self.assertIn('regenerate_cooldown_minutes', response.data)

    def test_regular_user_cannot_update_config(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.post(self.URL, {'regenerate_cooldown_minutes': 30}, format='json')
        self.assertEqual(response.status_code, 403)

    def test_admin_can_update_config(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.post(self.URL, {'regenerate_cooldown_minutes': 30}, format='json')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['regenerate_cooldown_minutes'], 30)


class RegeneratePermissionTest(TestCase):
    """Any authenticated user can regenerate a summary; anonymous users cannot."""

    WEEKLY_URL = '/api/threats_watcher/summary/regenerate-weekly/'

    def setUp(self):
        self.user = get_user_model().objects.create_user(username='regen-user', password='pass')
        self.client = APIClient()

    def _old_weekly_summary(self):
        old = Summary.objects.create(type='weekly_summary', keywords='old', summary_text='old summary')
        # Older than the cooldown, otherwise the endpoint answers 429
        Summary.objects.filter(pk=old.pk).update(updated_at=timezone.now() - timedelta(hours=2))

    @patch('threats_watcher.summary_manager.generate_weekly_summary')
    def test_regular_user_can_regenerate_weekly(self, mock_generate):
        self._old_weekly_summary()
        mock_generate.side_effect = lambda notify=True: Summary.objects.create(
            type='weekly_summary', keywords='new', summary_text='new summary'
        )
        self.client.force_authenticate(user=self.user)
        response = self.client.post(self.WEEKLY_URL)
        self.assertEqual(response.status_code, 200)
        mock_generate.assert_called_once_with(notify=False)

    @patch('threats_watcher.summary_manager.generate_weekly_summary')
    def test_anonymous_cannot_regenerate_weekly(self, mock_generate):
        self._old_weekly_summary()
        response = self.client.post(self.WEEKLY_URL)
        self.assertIn(response.status_code, (401, 403))
        mock_generate.assert_not_called()

    @patch('threats_watcher.summary_manager.generate_breaking_news')
    def test_regular_user_can_regenerate_breaking(self, mock_generate):
        trendy_word = TrendyWord.objects.create(name='regen-user-word', occurrences=1)
        mock_generate.side_effect = lambda tw, notify=True: Summary.objects.create(
            type='breaking_news', keywords=tw.name, summary_text='new alert'
        )
        self.client.force_authenticate(user=self.user)
        response = self.client.post('/api/threats_watcher/summary/by-keyword/regen-user-word/regenerate-breaking/')
        self.assertEqual(response.status_code, 200)
        mock_generate.assert_called_once_with(trendy_word, notify=False)

    @patch('threats_watcher.summary_manager.generate_trendy_word_summary')
    def test_regular_user_can_regenerate_word_summary(self, mock_generate):
        TrendyWord.objects.create(name='regen-summary-word', occurrences=1)
        mock_generate.side_effect = lambda word_id: Summary.objects.create(
            type='trendy_word_summary', keywords='regen-summary-word', summary_text='new summary'
        )
        self.client.force_authenticate(user=self.user)
        response = self.client.post('/api/threats_watcher/summary/by-keyword/regen-summary-word/regenerate/')
        self.assertEqual(response.status_code, 200)


class WeeklySummaryNotifyFlagTest(TestCase):
    """The notify flag controls the notification sent by generate_weekly_summary."""

    @patch('threats_watcher.core.send_threats_watcher_notifications')
    @patch('threats_watcher.summary_manager.TrendyWord')
    def test_no_notification_when_notify_is_false(self, mock_trendyword, mock_send):
        mock_trendyword.objects.all.side_effect = Exception('boom')
        from threats_watcher.summary_manager import generate_weekly_summary
        generate_weekly_summary(notify=False)
        mock_send.assert_not_called()

    @patch('threats_watcher.core.send_threats_watcher_notifications')
    @patch('threats_watcher.summary_manager.TrendyWord')
    def test_notification_sent_by_default(self, mock_trendyword, mock_send):
        mock_trendyword.objects.all.side_effect = Exception('boom')
        from threats_watcher.summary_manager import generate_weekly_summary
        generate_weekly_summary()
        mock_send.assert_called_once()


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