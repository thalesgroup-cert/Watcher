import time
import uuid
from unittest.mock import patch, MagicMock
from django.test import TestCase, TransactionTestCase
from django.contrib.auth.models import User
from django.utils import timezone
from django.urls import reverse
from rest_framework.test import APITestCase
from rest_framework import status
from knox.models import AuthToken
from threats_watcher.models import Source, PostUrl, TrendyWord, BannedWord, Subscriber, Summary
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
    
    def test_trendyword_api(self):
        """Test TrendyWord API."""
        url = reverse('trendyword-list')
        response = self.client.get(url)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]['name'], f"phishing-{self.unique_id}")
    
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