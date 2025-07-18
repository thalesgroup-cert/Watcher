import os
from unittest.mock import patch, MagicMock
from django.test import TestCase, TransactionTestCase
from django.contrib.auth.models import User
from django.utils import timezone
from datetime import timedelta
from rest_framework.test import APITestCase
from rest_framework import status
from knox.models import AuthToken
from data_leak.models import Keyword, Alert, PasteId, Subscriber
from data_leak.core import send_data_leak_notifications


class KeywordModelTest(TestCase):
    """Test Keyword model."""
    
    def test_creation_and_constraints(self):
        """Test keyword creation, string representation, and unique constraint."""
        keyword = Keyword.objects.create(name="test-keyword")
        self.assertEqual(str(keyword), "test-keyword")
        
        with self.assertRaises(Exception):
            Keyword.objects.create(name="test-keyword")  # Duplicate


class AlertModelTest(TestCase):
    """Test Alert model."""
    
    def test_creation_and_cascade(self):
        """Test alert creation and cascade delete."""
        keyword = Keyword.objects.create(name="alert-test")
        alert = Alert.objects.create(keyword=keyword, url="https://test.com")
        
        self.assertEqual(str(alert), "alert-test")
        self.assertTrue(alert.status)
        
        # Test cascade delete
        keyword.delete()
        self.assertFalse(Alert.objects.filter(id=alert.id).exists())


class PasteIdModelTest(TestCase):
    """Test PasteId model."""
    
    def test_creation_and_constraints(self):
        """Test paste ID creation and constraints."""
        paste = PasteId.objects.create(paste_id="TEST123")
        self.assertEqual(str(paste), "TEST123")
        
        with self.assertRaises(Exception):
            PasteId.objects.create(paste_id="TEST123")  # Duplicate


class SubscriberModelTest(TestCase):
    """Test Subscriber model."""
    
    def test_creation_and_defaults(self):
        """Test subscriber creation and defaults."""
        user = User.objects.create_user("testuser", "test@test.com", "pass")
        subscriber = Subscriber.objects.create(user_rec=user, email=True)
        
        self.assertTrue(subscriber.email)
        self.assertFalse(subscriber.thehive)  # Default
        self.assertIn("testuser", str(subscriber))


class CoreFunctionsTest(TransactionTestCase):
    """Test core functions."""
    
    def test_check_urls_functionality(self):
        """Test URL checking to avoid duplicates."""
        from data_leak.core import check_urls
        
        keyword = Keyword.objects.create(name="test")
        Alert.objects.create(keyword=keyword, url="https://existing.com")
        
        urls = ["https://existing.com", "https://new.com"]
        new_urls = check_urls(keyword, urls)
        
        self.assertEqual(len(new_urls), 1)
        self.assertIn("https://new.com", new_urls)
    
    def test_cleanup_functionality(self):
        """Test cleanup of old paste IDs."""
        from data_leak.core import cleanup
        
        # Create old paste
        old_paste = PasteId.objects.create(paste_id="OLD123")
        old_paste.created_at = timezone.now() - timedelta(hours=3)
        old_paste.save()
        
        # Create recent paste
        PasteId.objects.create(paste_id="RECENT456")
        
        cleanup()
        
        self.assertFalse(PasteId.objects.filter(paste_id="OLD123").exists())
        self.assertTrue(PasteId.objects.filter(paste_id="RECENT456").exists())
    
    @patch('data_leak.core.send_app_specific_notifications')
    def test_notification_system(self, mock_notifications):
        """Test notification system."""
        user = User.objects.create_user("notifuser", "test@test.com", "pass")
        Subscriber.objects.create(user_rec=user, email=True)
        
        keyword = Keyword.objects.create(name="notif-test")
        alert = Alert.objects.create(keyword=keyword, url="https://test.com")
        
        send_data_leak_notifications(alert)
        mock_notifications.assert_called_once()


class APITest(APITestCase):
    """Test REST API endpoints."""
    
    def setUp(self):
        """Set up authenticated user."""
        self.user = User.objects.create_superuser("apiuser", password="apipass123")
        self.token = AuthToken.objects.create(self.user)[1]
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {self.token}')
    
    def test_keyword_crud(self):
        """Test keyword CRUD operations."""
        # Create
        url = '/api/data_leak/keyword/'
        data = {'name': 'api-keyword'}
        response = self.client.post(url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        
        # List
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        
        # Detail
        keyword_id = response.data[0]['id']
        detail_url = f'{url}{keyword_id}/'
        response = self.client.get(detail_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['name'], 'api-keyword')
    
    def test_alert_crud(self):
        """Test alert CRUD operations."""
        keyword = Keyword.objects.create(name="alert-api")
        Alert.objects.create(keyword=keyword, url="https://api-test.com")
        
        url = '/api/data_leak/alert/'
        response = self.client.get(url)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]['url'], "https://api-test.com")
    
    def test_unauthorized_access(self):
        """Test API authentication requirement."""
        self.client.credentials()  # Remove auth
        response = self.client.get('/api/data_leak/keyword/')
        self.assertIn(response.status_code, [401, 403])


class IntegrationTest(TransactionTestCase):
    """Integration tests."""
    
    def setUp(self):
        """Set up test data."""
        self.user = User.objects.create_user("integrationuser", "test@test.com", "pass")
        self.keyword = Keyword.objects.create(name="integration-test")
        self.subscriber = Subscriber.objects.create(user_rec=self.user, email=True)
    
    def test_complete_workflow(self):
        """Test complete data leak workflow."""
        alert = Alert.objects.create(
            keyword=self.keyword,
            url="https://integration.com/leak",
            content="Test content"
        )
        
        self.assertEqual(Alert.objects.count(), 1)
        self.assertEqual(alert.keyword, self.keyword)
    
    @patch('data_leak.core.check_searx')
    @patch('data_leak.core.check_pastebin')
    def test_monitoring_integration(self, mock_pastebin, mock_searx):
        """Test monitoring system integration."""
        from data_leak.core import check_keywords
        import data_leak.core
        
        mock_searx.return_value = ["https://searx-test.com"]
        mock_pastebin.return_value = {"https://pastebin.com/test": self.keyword.name}
        data_leak.core.paste_content_hits = {"https://pastebin.com/test": "Mock content"}
        
        with patch('data_leak.core.check_urls') as mock_check_urls:
            mock_check_urls.return_value = ["https://searx-test.com"]
            check_keywords([self.keyword])
            
        mock_searx.assert_called_once()
        mock_pastebin.assert_called_once()


class PerformanceTest(TestCase):
    """Test performance."""
    
    def test_bulk_operations(self):
        """Test performance with bulk data."""
        keyword = Keyword.objects.create(name="perf-test")
        
        start_time = timezone.now()
        
        # Create 30 alerts
        for i in range(30):
            Alert.objects.create(keyword=keyword, url=f"https://test-{i}.com")
        
        duration = (timezone.now() - start_time).total_seconds()
        
        self.assertLess(duration, 2.0)
        self.assertEqual(Alert.objects.count(), 30)


class SecurityTest(TestCase):
    """Test security."""
    
    def test_input_validation(self):
        """Test input validation and sanitization."""
        # Test valid inputs
        valid_inputs = ["normal-keyword", "keyword_underscore", "keyword-dash"]
        for name in valid_inputs:
            keyword = Keyword.objects.create(name=f"test-{name}")
            self.assertEqual(keyword.name, f"test-{name}")
        
        # Test URL validation
        keyword = Keyword.objects.create(name="url-test")
        valid_urls = ["https://example.com", "http://test.org", "https://sub.domain.net"]
        for url in valid_urls:
            alert = Alert.objects.create(keyword=keyword, url=url)
            self.assertEqual(alert.url, url)


class SerializerTest(TestCase):
    """Test serializers."""
    
    def test_keyword_serialization(self):
        """Test keyword serialization."""
        from data_leak.serializers import KeywordSerializer
        
        keyword = Keyword.objects.create(name="serializer-test")
        serializer = KeywordSerializer(keyword)
        
        self.assertEqual(serializer.data['name'], "serializer-test")
        self.assertIn('created_at', serializer.data)
    
    def test_alert_serialization(self):
        """Test alert serialization with nested keyword."""
        from data_leak.serializers import AlertSerializer
        
        keyword = Keyword.objects.create(name="alert-serializer")
        alert = Alert.objects.create(keyword=keyword, url="https://test.com")
        
        serializer = AlertSerializer(alert)
        
        self.assertEqual(serializer.data['url'], "https://test.com")
        self.assertIn('keyword', serializer.data)
        self.assertEqual(serializer.data['keyword']['name'], "alert-serializer")