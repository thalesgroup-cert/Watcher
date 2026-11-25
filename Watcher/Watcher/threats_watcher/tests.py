import time
import uuid
from datetime import timedelta
from unittest.mock import patch, MagicMock
from django.test import TestCase, TransactionTestCase, SimpleTestCase, override_settings
from django.contrib.auth.models import User, Permission
from django.conf import settings
from django.utils import timezone
from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework.test import APITestCase, APIClient
from rest_framework import status
from knox.models import AuthToken
from threats_watcher.models import (Source, PostUrl, TrendyWord, BannedWord, Subscriber, Summary, MonitoredKeyword,
                                    KeywordHit, WatcherConfiguration)
from threats_watcher.serializers import SummarySerializer
from threats_watcher.summary_manager import (fetch_article_texts, sanitize_summary_html, _grounded_cves, _grounded_names,
                                             _source_links)
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


class TitlesGoThroughTheModelOnceTest(TestCase):
    """The model reads a title once, the first time it is met: not twice, and not again at the next run."""

    def setUp(self):
        import threats_watcher.core as core
        self.core = core
        core._entities_cache.clear()
        self.addCleanup(core._entities_cache.clear)
        now = timezone.now()
        core.posts = {"Lockbit hits Acme": "https://x.test/1", "CVE-2026-1111 exploited": "https://x.test/2",
                      "An old story": "https://x.test/3"}
        core.posts_published = {"https://x.test/1": now, "https://x.test/2": now, "https://x.test/3": now - timedelta(days=45)}
        self.pipeline = MagicMock(return_value=[{"entity_group": "ORG", "word": "Acme"}])

    def _run(self):
        with patch('threats_watcher.core.get_ner_pipeline', return_value=self.pipeline), \
                patch('threats_watcher.core.job_log.job_count') as count:
            self.core.tokenize_count_urls()
        return {call.args[0]: sum(c.args[1] if len(c.args) > 1 else 1 for c in count.call_args_list if c.args[0] == call.args[0])
                for call in count.call_args_list}

    def test_the_model_is_asked_once_per_title_and_not_for_an_old_one(self):
        counts = self._run()
        self.assertEqual(self.pipeline.call_count, 2)  # two recent titles, one model call each
        self.assertEqual(counts, {"titles": 2, "titles_analyzed": 2})

    def test_a_title_met_at_a_previous_run_is_not_given_to_the_model_again(self):
        self._run()
        self.pipeline.reset_mock()
        counts = self._run()
        self.pipeline.assert_not_called()
        self.assertEqual(counts, {"titles": 2, "titles_cached": 2})
        self.assertEqual(self.core.posts_words.get("Acme"), 2)  # the counts do not change

    def test_a_new_title_is_analysed_and_the_known_one_is_not(self):
        self._run()
        self.pipeline.reset_mock()
        self.core.posts["A third story"] = "https://x.test/4"
        self.core.posts_published["https://x.test/4"] = timezone.now()
        counts = self._run()
        self.assertEqual(self.pipeline.call_count, 1)
        self.assertEqual(counts, {"titles": 3, "titles_analyzed": 1, "titles_cached": 2})

    def test_the_memory_is_bounded(self):
        with patch.object(self.core, 'ENTITIES_CACHE_MAX', 1):
            self._run()
        self.assertEqual(len(self.core._entities_cache), 1)

    def test_it_says_when_the_model_is_not_there(self):
        with patch('threats_watcher.core.get_ner_pipeline', return_value=None), \
                patch('threats_watcher.core.job_log.job_count') as count:
            self.core.tokenize_count_urls()
        count.assert_called_once_with("ner_unavailable")

    @override_settings(NER_TORCH_THREADS=1)
    def test_the_threads_of_the_model_are_limited_then_given_back(self):
        try:
            import torch
        except ImportError:
            self.skipTest('torch is not installed')
        before = torch.get_num_threads()
        seen = []
        self.pipeline.side_effect = lambda title: seen.append(torch.get_num_threads()) or []
        self._run()
        self.assertEqual(set(seen), {1})
        self.assertEqual(torch.get_num_threads(), before)

    @override_settings(NER_TORCH_THREADS=0)
    def test_zero_leaves_the_threads_alone(self):
        self.assertIsNone(self.core._limit_model_threads())


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

    def test_monitored_keywords_are_not_readable_without_signing_in(self):
        MonitoredKeyword.objects.create(name='TestKW1', all_of=['actor', 'partner'])
        self.client.credentials()
        for url in ('/api/threats_watcher/monitored-keywords/', '/api/threats_watcher/monitored-keywords/1/'):
            self.assertEqual(self.client.get(url).status_code, status.HTTP_401_UNAUTHORIZED)

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

    def test_out_of_range_value_returns_400(self):
        self._login(User.objects.create_superuser("cfgadmin", password="cfgpass123"))
        for value in (0, 1441):
            response = self.client.post(self.URL, {'regenerate_cooldown_minutes': value}, format='json')
            self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(WatcherConfiguration.get_cooldown(), 15)

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


class FetchArticleTextsTest(SimpleTestCase):
    """fetch_article_texts is shared by the weekly summary, breaking news and keyword summaries."""

    @staticmethod
    def _posts(n):
        return [MagicMock(url=f'https://example.com/{i}') for i in range(n)]

    def _run(self, texts, max_texts, max_workers=2):
        posts = self._posts(len(texts))
        by_url = {p.url: t for p, t in zip(posts, texts)}

        def fake_get(post):
            value = by_url[post.url]
            if isinstance(value, Exception):
                raise value
            return value

        with patch('threats_watcher.summary_manager.get_article_title_or_summary', side_effect=fake_get) as mock_get:
            return fetch_article_texts(posts, max_texts=max_texts, max_workers=max_workers), mock_get

    def test_keeps_most_recent_first_order(self):
        texts = [f'Article number {i} about a critical vulnerability' for i in range(4)]
        result, _ = self._run(texts, max_texts=10)
        self.assertEqual(result, texts)

    def test_duplicates_are_removed(self):
        headline = 'Same headline about a ransomware attack on hospitals'
        other = 'Another distinct article about a phishing campaign'
        result, _ = self._run([headline, headline.upper() + '!', other], max_texts=10)
        self.assertEqual(result, [headline, other])

    def test_empty_and_short_texts_are_dropped(self):
        long_text = 'A long enough article about a zero-day exploit in VPN gateways'
        result, _ = self._run(['', 'too short', long_text], max_texts=10)
        self.assertEqual(result, [long_text])

    def test_a_failing_article_does_not_stop_the_others(self):
        ok = 'A valid article about a supply chain compromise'
        result, _ = self._run([Exception('boom'), ok], max_texts=10)
        self.assertEqual(result, [ok])

    def test_stops_fetching_once_enough_unique_texts_are_found(self):
        texts = [f'Unique article {i} about a data breach at a telecom operator' for i in range(10)]
        result, mock_get = self._run(texts, max_texts=2, max_workers=2)
        self.assertEqual(len(result), 2)
        self.assertEqual(mock_get.call_count, 2)

class GroundedEntitiesTest(SimpleTestCase):
    """The weekly summary only shows CVEs and names that appear in the news sent to the LLM."""

    CORPUS = "CISA warns that CVE-2026-12345 is exploited by LockBit against hospitals."

    def test_cves_not_in_the_news_are_dropped(self):
        result = _grounded_cves(['CVE-2026-12345', 'CVE-2026-XXXX', 'CVE-2026-99999', 'cve-2026-12345'], self.CORPUS)
        self.assertEqual(result, ['CVE-2026-12345'])

    def test_placeholders_and_names_not_in_the_news_are_dropped(self):
        result = _grounded_names(['LockBit', 'N/A', 'APT Groups', 'lockbit'], self.CORPUS)
        self.assertEqual(result, ['LockBit'])

    def test_cve_with_extra_text_is_kept(self):
        self.assertEqual(_grounded_cves(['CVE-2026-12345 (Citrix)'], self.CORPUS), ['CVE-2026-12345'])

    def test_unicode_dash_in_name_still_matches_the_news(self):
        corpus = "Russia-linked groups used the Yggdrasil mesh network."
        self.assertEqual(_grounded_names(['Russia\u2011linked groups'], corpus), ['Russia\u2011linked groups'])


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

    def test_statistics_say_how_many_titles_a_word_needs(self):
        stats = self.client.get('/api/threats_watcher/source/statistics/').data
        self.assertEqual(stats['minTitles'], settings.WORDS_OCCURRENCE)


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


class TrendingMomentumTest(APITestCase):
    """The words that jump come first: the last 24 hours against the daily average of the 6 days before."""

    WORDS = '/api/threats_watcher/trendyword/'

    def setUp(self):
        now = timezone.now()
        self.n = 0

        def word(name, hours_ago):
            # Created with one occurrence, then updated without signals (from 3 the post_save signal loads the language model)
            tw = TrendyWord.objects.create(name=name, occurrences=1, score=90)
            TrendyWord.objects.filter(pk=tw.pk).update(occurrences=len(hours_ago) + 1)
            for h in hours_ago:
                self.n += 1
                tw.posturls.add(PostUrl.objects.create(url=f'https://news.example/{self.n}', created_at=now - timedelta(hours=h)))
            return tw

        # Four articles today, none before: a jump
        self.surge = word('surge', [1, 2, 3, 4])
        # Always there: one article a day for a week, one today
        self.giant = word('giant', [2, 30, 54, 78, 102, 126, 150])
        # Was talked about, not any more
        self.fading = word('fading', [30, 54, 78, 102, 126, 150])
        # Old news only
        self.old = word('old', [24 * 20, 24 * 21])

    def rows(self, query):
        response = self.client.get(self.WORDS + query)
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        return response.data['results']

    def test_rows_say_how_the_word_is_doing_now(self):
        rows = {r['name']: r for r in self.rows('?page_size=50')}
        self.assertEqual((rows['surge']['mentions_24h'], rows['surge']['mentions_week']), (4, 4))
        self.assertEqual((rows['giant']['mentions_24h'], rows['giant']['mentions_week']), (1, 7))
        self.assertEqual((rows['old']['mentions_24h'], rows['old']['mentions_week']), (0, 0))

    def test_the_words_that_jump_come_first(self):
        names = [r['name'] for r in self.rows('?ordering=-rising')]
        self.assertEqual(names[0], 'surge')
        self.assertEqual(names[-1], 'fading')
        self.assertLess(names.index('giant'), names.index('old'))

    def test_a_steady_word_scores_about_zero_and_a_fading_one_below(self):
        rows = {r['name']: r['rising'] for r in self.rows('?page_size=50')}
        self.assertGreater(rows['surge'], 2)
        self.assertAlmostEqual(rows['giant'], 0, delta=0.2)
        self.assertLess(rows['fading'], 0)
        self.assertEqual(rows['old'], 0)

    def test_ordering_by_the_last_24_hours(self):
        names = [r['name'] for r in self.rows('?ordering=-mentions_24h')]
        self.assertEqual(names[0], 'surge')

    def test_a_tie_keeps_a_fixed_order(self):
        first = [r['id'] for r in self.rows('?ordering=-rising&page_size=50')]
        again = [r['id'] for r in self.rows('?ordering=-rising&page_size=50')]
        self.assertEqual(first, again)

    def test_the_word_detail_carries_the_same_figures(self):
        detail = self.client.get(self.WORDS + f'{self.surge.id}/').data
        self.assertEqual(detail['mentions_24h'], 4)
        self.assertGreater(detail['rising'], 2)

    def test_it_is_public_like_the_trends(self):
        self.client.credentials()
        self.assertEqual(self.client.get(self.WORDS + '?ordering=-rising').status_code, status.HTTP_200_OK)

    def test_rows_give_the_articles_of_each_of_the_last_7_days(self):
        rows = {r['name']: r['daily'] for r in self.rows('?page_size=50')}
        for daily in rows.values():
            self.assertEqual(len(daily), 7)
        # Today is the last day; a few hours ago can fall on yesterday just after midnight, so only the total is exact
        self.assertEqual(sum(rows['surge']), 4)
        self.assertGreaterEqual(sum(rows['giant']), 6)
        self.assertEqual(sum(rows['old']), 0)
        self.assertEqual(rows['surge'][:5], [0, 0, 0, 0, 0])

    def test_the_days_are_counted_for_the_whole_page_at_once(self):
        from django.db import connection
        from django.test.utils import CaptureQueriesContext
        with CaptureQueriesContext(connection) as few:
            self.rows('?page_size=1')
        with CaptureQueriesContext(connection) as many:
            self.rows('?page_size=50')
        self.assertEqual(len(few), len(many))

    def test_ordering_by_the_week(self):
        names = [r['name'] for r in self.rows('?ordering=-mentions_week')]
        self.assertEqual(names[-1], 'old')

    def test_the_word_detail_gives_its_days_too(self):
        detail = self.client.get(self.WORDS + f'{self.surge.id}/').data
        self.assertEqual(sum(detail['daily']), 4)


class FaviconTest(APITestCase):
    """The icon of the sites of the articles: fetched by Watcher, only for its own sites, small images only."""

    URL = '/api/threats_watcher/favicon/'
    PNG = b'\x89PNG\r\n\x1a\n' + b'0' * 40

    def setUp(self):
        from threats_watcher import favicons
        self.favicons = favicons
        favicons._cache.clear()
        self.addCleanup(favicons._cache.clear)
        PostUrl.objects.create(url='https://www.cert.example/advisory-1')
        Source.objects.create(url='https://feeds.blog.example/rss.xml', confident=1, country='France', country_code='FR')

    def test_a_site_of_watcher_gets_its_icon(self):
        with patch.object(self.favicons, 'fetch_icon', return_value=('image/png', self.PNG)) as fetch:
            response = self.client.get(self.URL + '?host=cert.example')
            self.client.get(self.URL + '?host=cert.example')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response['Content-Type'], 'image/png')
        self.assertEqual(response['X-Content-Type-Options'], 'nosniff')
        self.assertIn('max-age=86400', response['Cache-Control'])
        self.assertEqual(response.content, self.PNG)
        # The site is read at the address the article is on (with its www), and only once while the icon is kept
        fetch.assert_called_once_with('www.cert.example')

    def test_a_site_of_a_source_counts_too(self):
        with patch.object(self.favicons, 'fetch_icon', return_value=('image/png', self.PNG)):
            self.assertEqual(self.client.get(self.URL + '?host=feeds.blog.example').status_code, 200)

    def test_a_site_watcher_does_not_know_is_never_fetched(self):
        with patch.object(self.favicons, 'fetch_icon') as fetch:
            self.assertEqual(self.client.get(self.URL + '?host=evil.example').status_code, 404)
            self.assertEqual(self.client.get(self.URL + '?host=192.168.0.1').status_code, 404)
        fetch.assert_not_called()
        self.assertEqual(len(self.favicons._cache), 0)

    def test_what_is_not_a_host_is_refused_before_anything_is_looked_up(self):
        with patch.object(self.favicons, 'known_host') as known:
            for host in ('', 'localhost', '../etc/passwd', 'a b.example', 'cert.example/x', 'cert.example:8080', '-a.example', 'x' * 300 + '.example'):
                self.assertEqual(self.client.get(self.URL, {'host': host}).status_code, 404, host)
        known.assert_not_called()

    def test_a_missing_icon_is_remembered_for_a_while(self):
        with patch.object(self.favicons, 'fetch_icon', return_value=None) as fetch:
            first = self.client.get(self.URL + '?host=cert.example')
            self.client.get(self.URL + '?host=cert.example')
        self.assertEqual(first.status_code, 404)
        self.assertIn('max-age=3600', first['Cache-Control'])
        fetch.assert_called_once()

    def test_a_failure_is_a_missing_icon_not_an_error(self):
        with patch.object(self.favicons, 'fetch_icon', side_effect=RuntimeError('boom')):
            self.assertEqual(self.client.get(self.URL + '?host=cert.example').status_code, 404)

    def test_it_is_public_like_the_articles(self):
        self.client.credentials()
        with patch.object(self.favicons, 'fetch_icon', return_value=('image/png', self.PNG)):
            self.assertEqual(self.client.get(self.URL + '?host=cert.example').status_code, 200)

    def test_only_small_images_of_a_known_kind_are_shown(self):
        sniff = self.favicons.sniff
        self.assertEqual(sniff(self.PNG), 'image/png')
        self.assertEqual(sniff(b'\x00\x00\x01\x00' + b'0' * 20), 'image/x-icon')
        self.assertEqual(sniff(b'GIF89a' + b'0' * 20), 'image/gif')
        self.assertEqual(sniff(b'\xff\xd8\xff\xe0' + b'0' * 20), 'image/jpeg')
        self.assertEqual(sniff(b'RIFF0000WEBPVP8 '), 'image/webp')
        # A vector image or a page could carry script: never served
        self.assertIsNone(sniff(b'<svg xmlns="http://www.w3.org/2000/svg"></svg>'))
        self.assertIsNone(sniff(b'<html><script>alert(1)</script></html>'))

    def test_the_icon_a_page_declares_is_found(self):
        link = self.favicons.icon_link
        self.assertEqual(link('<head><link rel="stylesheet" href="/a.css"><link rel="shortcut icon" href="/img/i.png"></head>', 'https://x.example/'), 'https://x.example/img/i.png')
        self.assertEqual(link("<link href='//cdn.example/i.ico' rel='icon'>", 'https://x.example/'), 'https://cdn.example/i.ico')
        self.assertIsNone(link('<link rel="mask-icon" href="/m.svg"><link rel="stylesheet" href="/a.css">', 'https://x.example/'))

    def test_the_icon_is_taken_from_favicon_ico_else_from_the_home_page(self):
        favicons = self.favicons

        def download(session, url, limit, truncate=False):
            return {
                'https://a.example/favicon.ico': self.PNG,
                'https://b.example/favicon.ico': b'<html>not an icon</html>',
                'https://b.example/': b'<link rel="icon" href="/real.png">',
                'https://b.example/real.png': self.PNG,
            }.get(url)

        with patch.object(favicons, '_download', side_effect=download), patch.object(favicons, 'page_session'):
            self.assertEqual(favicons.fetch_icon('a.example'), ('image/png', self.PNG))
            self.assertEqual(favicons.fetch_icon('b.example'), ('image/png', self.PNG))
            self.assertIsNone(favicons.fetch_icon('c.example'))

    def test_watcher_does_not_reach_its_own_network_through_an_icon(self):
        favicons = self.favicons
        session = type('S', (), {'get': lambda *a, **k: (_ for _ in ()).throw(AssertionError('connected'))})()
        with patch.object(favicons, 'is_public', return_value=False):
            self.assertIsNone(favicons._download(session, 'https://internal.example/favicon.ico', 1000))
        self.assertIsNone(favicons._download(session, 'ftp://x.example/favicon.ico', 1000))


class SanitizeSummaryHtmlTest(TestCase):
    """The summaries are written from what an AI read in articles nobody vouches for: only Watcher's own markup survives."""

    CLUSTER = (
        "<div style='border-left: 3px solid #64748b; padding-left: 0.8em;'>"
        "<div class='d-flex'><strong class='text-info'>Executive Summary</strong>"
        "<span id='watcher-toggle-all' class='text-muted'>Collapse All</span></div><p class='mt-1'>Surge.</p></div>\n"
        "<details open class='watcher-cluster' style='border-left: 3px solid #ef4444;'><summary class='d-flex'>"
        "<span class='material-icons' style='color: #ef4444'>arrow_drop_down</span><strong>Atlassian flaws</strong></summary>"
        "<p>Several flaws.</p><div><strong>CVEs:</strong> "
        "<a href='https://nvd.nist.gov/vuln/detail/CVE-2023-1111' target='_blank' class='text-info'>CVE-2023-1111</a></div></details>"
    )

    def test_what_watcher_writes_comes_out_as_it_went_in(self):
        self.assertEqual(sanitize_summary_html(self.CLUSTER), self.CLUSTER)

    def test_scripts_and_what_they_hold_are_dropped(self):
        out = sanitize_summary_html("<p>Hello</p><script>steal(document.cookie)</script><style>p{x:y}</style>")
        self.assertEqual(out, '<p>Hello</p>')

    def test_active_tags_and_handlers_are_dropped(self):
        out = sanitize_summary_html("<p onclick='x()'>a</p><img src='https://evil/p.gif' onerror='x()'><iframe src='https://evil'></iframe><b onmouseover='x()'>b</b>")
        self.assertEqual(out, '<p>a</p><b>b</b>')

    def test_a_link_keeps_only_a_web_address(self):
        self.assertEqual(sanitize_summary_html("<a href='javascript:alert(1)'>click</a>"), 'click')
        self.assertEqual(sanitize_summary_html("<a href='data:text/html,<b>x</b>'>click</a>"), 'click')
        self.assertIn("href='https://example.com/a'", sanitize_summary_html("<a href='https://example.com/a' onclick='x()'>ok</a>"))

    def test_dangerous_styles_and_ids_are_dropped(self):
        out = sanitize_summary_html("<div style='background: url(https://evil/x)' id='admin'>t</div>")
        self.assertEqual(out, '<div>t</div>')

    def test_text_that_looks_like_markup_stays_text(self):
        out = sanitize_summary_html("<p>R&D uses a < b and 5 > 3</p>")
        self.assertEqual(out, '<p>R&amp;D uses a &lt; b and 5 &gt; 3</p>')

    def test_what_is_left_open_is_closed_and_a_stray_end_tag_is_dropped(self):
        self.assertEqual(sanitize_summary_html("<div><p>open</div></span>"), '<div><p>open</p></div>')

    def test_it_is_idempotent_and_keeps_empty_values(self):
        once = sanitize_summary_html(self.CLUSTER + "<script>x</script>")
        self.assertEqual(sanitize_summary_html(once), once)
        self.assertEqual(sanitize_summary_html(''), '')
        self.assertIsNone(sanitize_summary_html(None))


class ArticleFetchStaysPublicTest(TestCase):
    """The address of an article comes from a feed: Watcher only reads public addresses (no read of its own network)."""

    def article(self, url):
        return type('Post', (), {'url': url})()

    def test_a_private_address_is_never_requested(self):
        from threats_watcher.summary_manager import get_article_title_or_summary
        for url in ('http://127.0.0.1:9002/api/', 'http://169.254.169.254/latest/meta-data/', 'http://10.10.10.5:3306/', 'http://localhost/', 'ftp://example.com/x'):
            with self.subTest(url=url), patch('requests.Session.get', side_effect=AssertionError('no request is expected')):
                self.assertEqual(get_article_title_or_summary(self.article(url)), '')

    def test_a_redirect_to_a_private_address_is_refused(self):
        from threats_watcher.summary_manager import _get_public_page, PageError
        redirect = type('R', (), {'is_redirect': True, 'headers': {'Location': 'http://127.0.0.1/admin'}, 'close': lambda self: None})()
        with patch('threats_watcher.summary_manager.is_public', side_effect=lambda host: host != '127.0.0.1'), \
                patch('requests.Session.get', return_value=redirect) as fetched:
            with self.assertRaises(PageError):
                _get_public_page('https://news.example/a', {}, 5)
        self.assertEqual(fetched.call_count, 1)


class GenerationProgressTest(APITestCase):
    """What is being written is told by the server: a refresh of the page, or another page, does not lose it."""

    URL = '/api/threats_watcher/summary/generating/'

    def setUp(self):
        from threats_watcher import api as progress
        progress.reset_generations()
        self.addCleanup(progress.reset_generations)
        self.user = get_user_model().objects.create_user(username='progress-user', password='pass')

    def test_nothing_is_running_at_first(self):
        self.assertEqual(self.client.get(self.URL).json(), {'running': []})

    def test_a_weekly_report_being_written_is_told_until_it_is_written(self):
        from threats_watcher import api as progress
        seen = []
        Summary.objects.create(type='weekly_summary', keywords='old', summary_text='old')
        Summary.objects.update(updated_at=timezone.now() - timedelta(hours=2))

        def writing(notify=True):
            seen.append(self.client.get(self.URL).json()['running'])
            return Summary.objects.create(type='weekly_summary', keywords='new', summary_text='new')

        self.client.force_authenticate(user=self.user)
        with patch('threats_watcher.summary_manager.generate_weekly_summary', side_effect=writing):
            self.client.post('/api/threats_watcher/summary/regenerate-weekly/')
        self.assertEqual(seen, [['weekly']])
        self.assertEqual(progress.running_generations(), [])

    def test_a_failed_writing_is_not_left_running(self):
        from threats_watcher import api as progress
        self.client.force_authenticate(user=self.user)
        with patch('threats_watcher.summary_manager.generate_weekly_summary', side_effect=RuntimeError('boom')):
            self.client.post('/api/threats_watcher/summary/regenerate-weekly/')
        self.assertEqual(progress.running_generations(), [])

    def test_two_writings_of_one_thing_are_both_counted(self):
        from threats_watcher import api as progress
        progress.start_generation('weekly')
        progress.start_generation('weekly')
        progress.finish_generation('weekly')
        self.assertEqual(progress.running_generations(), ['weekly'])
        progress.finish_generation('weekly')
        self.assertEqual(progress.running_generations(), [])

    def test_a_writing_that_never_ended_is_not_shown_for_ever(self):
        from threats_watcher import api as progress
        progress.start_generation('breaking:x')
        with patch.object(progress, 'GENERATION_STALE_AFTER', -1):
            self.assertEqual(progress.running_generations(), [])

    def test_the_word_is_the_same_whatever_its_case(self):
        from threats_watcher import api as progress
        self.assertEqual(progress.generation_key('word', ' LockBit '), 'word:lockbit')


class VisitorCannotHaveASummaryWrittenTest(APITestCase):
    """Reading a summary is open; having one written costs an AI call, so it is for the people who signed in."""

    def setUp(self):
        from threats_watcher.models import TrendyWord
        self.word = TrendyWord.objects.create(name='lockbit', occurrences=5, score=50)

    def test_a_visitor_gets_the_summary_that_exists(self):
        Summary.objects.create(type='trendy_word_summary', keywords='lockbit', summary_text='Already written.')
        response = self.client.get('/api/threats_watcher/summary/by-keyword/lockbit/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['summary_text'], 'Already written.')

    def test_a_visitor_does_not_start_a_writing_and_is_told_why(self):
        with patch('threats_watcher.summary_manager.generate_trendy_word_summary') as generate:
            response = self.client.get('/api/threats_watcher/summary/by-keyword/lockbit/')
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.json()['error'], 'login_required')
        generate.assert_not_called()


class WeeklySourcesTest(SimpleTestCase):
    """A cluster cites the news it is based on by id: its sources are the articles of the ones that were sent to the model."""

    ARTICLES = {'A1': 'https://www.cert.example/a?x=1&y=2', 'A2': 'https://cert.example/b', 'A3': 'https://blog.example/c'}
    CORPUS = '- [A1] one\n- [A2] two\n- [A3] three'

    def test_one_link_per_site(self):
        links = _source_links(['A1', 'a2', '[A3]'], self.ARTICLES, self.CORPUS)
        self.assertEqual(links.count("class='watcher-source'"), 2)
        self.assertIn("href='https://www.cert.example/a?x=1&amp;y=2'", links)
        self.assertIn('>cert.example</a>', links)
        self.assertIn('>blog.example</a>', links)

    def test_an_id_that_was_not_sent_is_left_out(self):
        self.assertEqual(_source_links(['A9', 'nonsense', None], self.ARTICLES, self.CORPUS), '')
        self.assertEqual(_source_links(['A3'], self.ARTICLES, '- [A1] one'), '')
        self.assertEqual(_source_links('A1', self.ARTICLES, self.CORPUS), '')

    def test_the_address_of_each_text_is_given_back(self):
        posts = [SimpleNamespace(url='https://one.example/a'), SimpleNamespace(url='https://two.example/b')]
        texts = {'https://one.example/a': 'First article of the week', 'https://two.example/b': 'Second article of the week'}
        urls = {}
        with patch('threats_watcher.summary_manager._fetch_article_text', side_effect=lambda post: texts[post.url]):
            result = fetch_article_texts(posts, max_texts=5, urls=urls)
        self.assertEqual(result, list(texts.values()))
        self.assertEqual(urls, {text: url for url, text in texts.items()})
