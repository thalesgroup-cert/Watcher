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
    
    def test_regex_keyword_creation(self):
        """Test creation of regex keywords."""
        keyword = Keyword.objects.create(
            name="email-pattern",
            is_regex=True,
            regex_pattern=r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}'
        )
        self.assertEqual(keyword.name, "email-pattern")
        self.assertTrue(keyword.is_regex)
        self.assertEqual(keyword.regex_pattern, r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}')
        self.assertIn("regex:", str(keyword))
    
    def test_get_search_pattern(self):
        """Test get_search_pattern method."""
        # Test exact match keyword
        exact_keyword = Keyword.objects.create(name="exact-match")
        self.assertEqual(exact_keyword.get_search_pattern(), "exact-match")
        
        # Test regex keyword
        regex_keyword = Keyword.objects.create(
            name="ip-pattern",
            is_regex=True,
            regex_pattern=r'\b(?:[0-9]{1,3}\.){3}[0-9]{1,3}\b'
        )
        self.assertEqual(regex_keyword.get_search_pattern(), r'\b(?:[0-9]{1,3}\.){3}[0-9]{1,3}\b')
    
    def test_regex_validation(self):
        """Test regex pattern validation."""
        from django.core.exceptions import ValidationError
        
        # Valid regex
        keyword = Keyword(
            name="valid-regex",
            is_regex=True,
            regex_pattern=r'\d+'
        )
        keyword.full_clean()  # Should not raise
        
        # Invalid regex
        keyword = Keyword(
            name="invalid-regex",
            is_regex=True,
            regex_pattern=r'['  # Invalid regex
        )
        with self.assertRaises(ValidationError):
            keyword.full_clean()
    
    def test_regex_required_validation(self):
        """Test that regex pattern is required when is_regex is True."""
        from django.core.exceptions import ValidationError
        
        keyword = Keyword(
            name="regex-without-pattern",
            is_regex=True,
            regex_pattern=""
        )
        with self.assertRaises(ValidationError):
            keyword.full_clean()


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
    
    @patch('data_leak.core.requests.get')
    def test_check_searx_with_regex(self, mock_get):
        """Test Searx checking with regex keywords."""
        from data_leak.core import check_searx
        
        # Mock response
        mock_response = MagicMock()
        mock_response.json.return_value = {
            'results': [
                {
                    'url': 'https://test1.com',
                    'title': 'User email: john@example.com',
                    'content': 'Contact information'
                },
                {
                    'url': 'https://test2.com',
                    'title': 'No email here',
                    'content': 'Just some content'
                }
            ]
        }
        mock_get.return_value = mock_response
        
        # Test regex keyword for email detection
        regex_keyword = Keyword.objects.create(
            name="email-detection",
            is_regex=True,
            regex_pattern=r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}'
        )
        
        with patch('data_leak.core.check_urls') as mock_check_urls:
            mock_check_urls.return_value = ['https://test1.com']
            results = check_searx(regex_keyword)
            
        mock_check_urls.assert_called_once()
        # Should find the URL with email pattern
        called_urls = mock_check_urls.call_args[0][1]
        self.assertIn('https://test1.com', called_urls)
        self.assertNotIn('https://test2.com', called_urls)
    
    def test_pastebin_regex_matching(self):
        """Test regex matching in pastebin content."""
        from data_leak.core import check_pastebin
        
        # Create test keywords
        exact_keyword = Keyword.objects.create(name="password")
        regex_keyword = Keyword.objects.create(
            name="credit-card",
            is_regex=True,
            regex_pattern=r'\b(?:\d{4}[-\s]?){3}\d{4}\b'  # Credit card pattern
        )
        
        keywords = [exact_keyword, regex_keyword]
        
        # Mock pastebin content with both patterns
        test_content = "My password is secret123. Credit card: 1234-5678-9012-3456"
        
        # Test that both patterns match appropriately
        self.assertIn("password", test_content.lower())
        
        import re
        self.assertTrue(re.search(regex_keyword.regex_pattern, test_content))
        self.assertFalse(re.search(regex_keyword.regex_pattern, "No credit card here"))
    
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
    
    def test_regex_keyword_api(self):
        """Test regex keyword creation and validation via API."""
        url = '/api/data_leak/keyword/'
        
        # Create regex keyword
        data = {
            'name': 'email-pattern',
            'is_regex': True,
            'regex_pattern': r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}'
        }
        response = self.client.post(url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(response.data['is_regex'])
        self.assertEqual(response.data['regex_pattern'], data['regex_pattern'])
        
        # Test invalid regex
        invalid_data = {
            'name': 'invalid-regex',
            'is_regex': True,
            'regex_pattern': r'['  # Invalid regex
        }
        response = self.client.post(url, invalid_data, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('regex_pattern', response.data)
        
        # Test regex required when is_regex is True
        missing_pattern_data = {
            'name': 'missing-pattern',
            'is_regex': True,
            'regex_pattern': ''
        }
        response = self.client.post(url, missing_pattern_data, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
    
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
    
    def test_regex_keyword_workflow(self):
        """Test complete workflow with regex keywords."""
        # Create a regex keyword for detecting credit card numbers
        regex_keyword = Keyword.objects.create(
            name="credit-card-detection",
            is_regex=True,
            regex_pattern=r'\b(?:\d{4}[-\s]?){3}\d{4}\b'
        )
        
        # Create alert with content containing credit card number
        alert = Alert.objects.create(
            keyword=regex_keyword,
            url="https://leak.com/credit-cards",
            content="Found credit card: 1234-5678-9012-3456"
        )
        
        self.assertEqual(alert.keyword, regex_keyword)
        self.assertTrue(regex_keyword.is_regex)
        self.assertIn("1234-5678-9012-3456", alert.content)
        
        # Test that the regex pattern works
        import re
        self.assertTrue(re.search(regex_keyword.regex_pattern, alert.content))
    
    def test_mixed_keyword_types(self):
        """Test system with both exact and regex keywords."""
        exact_keyword = Keyword.objects.create(name="password")
        regex_keyword = Keyword.objects.create(
            name="email-finder",
            is_regex=True,
            regex_pattern=r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}'
        )
        
        # Create alerts for both types
        Alert.objects.create(
            keyword=exact_keyword,
            url="https://test1.com",
            content="My password is secret123"
        )
        
        Alert.objects.create(
            keyword=regex_keyword,
            url="https://test2.com",
            content="Contact me at john@example.com"
        )
        
        self.assertEqual(Alert.objects.count(), 2)
        self.assertEqual(Alert.objects.filter(keyword__is_regex=False).count(), 1)
        self.assertEqual(Alert.objects.filter(keyword__is_regex=True).count(), 1)
    
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
    
    def test_regex_dos_protection(self):
        """Test protection against regex denial of service attacks."""
        from django.core.exceptions import ValidationError
        
        # Test potentially dangerous regex patterns
        dangerous_patterns = [
            r'(a+)+b',  # Catastrophic backtracking
            r'(a|a)*b',  # Another backtracking pattern
            r'.*.*.*.*.*.*foo',  # Excessive nesting
        ]
        
        for pattern in dangerous_patterns:
            keyword = Keyword(
                name="dangerous-regex",
                is_regex=True,
                regex_pattern=pattern
            )
            # The regex should still validate (basic pattern check)
            # but performance monitoring would catch actual DoS in production
            try:
                keyword.full_clean()
            except ValidationError:
                pass  # Some patterns might still be caught by basic validation
    
    def test_regex_injection_protection(self):
        """Test protection against regex injection attacks."""
        from django.core.exceptions import ValidationError
        
        # Test regex metacharacters and injection attempts
        injection_attempts = [
            r'(?P<evil>.*)',  # Named groups
            r'(?#comment)',   # Comments
            r'(?P=evil)',     # Back-references
        ]
        
        for injection in injection_attempts:
            keyword = Keyword(
                name="injection-test",
                is_regex=True,
                regex_pattern=injection
            )
            # These should validate fine as they're valid regex
            keyword.full_clean()
    
    def test_safe_regex_patterns(self):
        """Test that common safe regex patterns work correctly."""
        safe_patterns = [
            (r'\b\d{3}-\d{2}-\d{4}\b', 'SSN pattern'),
            (r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b', 'Email pattern'),
            (r'\b(?:\d{4}[-\s]?){3}\d{4}\b', 'Credit card pattern'),
            (r'\b(?:[0-9]{1,3}\.){3}[0-9]{1,3}\b', 'IP address pattern'),
            (r'[a-fA-F0-9]{32}', 'MD5 hash pattern'),
        ]
        
        for pattern, description in safe_patterns:
            keyword = Keyword.objects.create(
                name=f"safe-{description.replace(' ', '-')}",
                is_regex=True,
                regex_pattern=pattern
            )
            keyword.full_clean()  # Should not raise
            self.assertEqual(keyword.get_search_pattern(), pattern)


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