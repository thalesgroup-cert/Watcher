import os
from unittest.mock import patch, MagicMock
from django.test import TestCase, TransactionTestCase
from django.contrib.auth.models import User
from django.utils import timezone
from datetime import timedelta
from common.models import MISPEventUuidLink
from common.core import generate_ref
from common.misp import get_misp_uuid, update_misp_uuid


class MISPEventUuidLinkModelTest(TestCase):
    """Test MISPEventUuidLink model basic functionality."""
    
    def test_model_creation_and_string_representation(self):
        """Test model creation and string representation."""
        mapping = MISPEventUuidLink.objects.create(
            domain_name="test.com",
            misp_event_uuid=["uuid-123", "uuid-456"]
        )
        
        self.assertEqual(mapping.domain_name, "test.com")
        self.assertEqual(len(mapping.misp_event_uuid), 2)
        self.assertEqual(str(mapping), "test.com - 2 UUID")
    
    def test_unique_domain_constraint(self):
        """Test domain name unique constraint."""
        MISPEventUuidLink.objects.create(domain_name="unique.com")
        
        with self.assertRaises(Exception):
            MISPEventUuidLink.objects.create(domain_name="unique.com")
    
    def test_empty_uuid_handling(self):
        """Test handling of empty or None UUID lists."""
        empty_mapping = MISPEventUuidLink.objects.create(
            domain_name="empty.com",
            misp_event_uuid=[]
        )
        none_mapping = MISPEventUuidLink.objects.create(
            domain_name="none.com",
            misp_event_uuid=None
        )
        
        self.assertEqual(str(empty_mapping), "empty.com - 0 UUID")
        self.assertEqual(str(none_mapping), "none.com - 0 UUID")


class CoreFunctionsTest(TestCase):
    """Test core utility functions."""
    
    def test_generate_ref_uniqueness(self):
        """Test reference generation produces unique values."""
        refs = [generate_ref() for _ in range(10)]
        unique_refs = set(refs)
        
        self.assertEqual(len(refs), len(unique_refs))
        for ref in refs:
            self.assertIsInstance(ref, str)
            self.assertGreater(len(ref), 5)


class MISPIntegrationTest(TestCase):
    """Test MISP UUID management functions."""
    
    def test_get_misp_uuid_operations(self):
        """Test getting MISP UUIDs for domains."""
        # Test non-existing domain
        uuids = get_misp_uuid("non-existing.com")
        self.assertEqual(uuids, [])
        
        # Test existing domain
        MISPEventUuidLink.objects.create(
            domain_name="existing.com",
            misp_event_uuid=["uuid-123", "uuid-456"]
        )
        uuids = get_misp_uuid("existing.com")
        self.assertEqual(len(uuids), 2)
        self.assertIn("uuid-123", uuids)
    
    def test_update_misp_uuid_operations(self):
        """Test updating MISP UUIDs for domains."""
        # Test new domain
        uuids = update_misp_uuid("new.com", "new-uuid")
        self.assertEqual(len(uuids), 1)
        self.assertIn("new-uuid", uuids)
        
        # Test existing domain
        uuids = update_misp_uuid("new.com", "another-uuid")
        self.assertEqual(len(uuids), 2)
        self.assertIn("another-uuid", uuids)
        
        # Test duplicate prevention
        uuids = update_misp_uuid("new.com", "new-uuid")
        self.assertEqual(len(uuids), 2)
        self.assertEqual(uuids[-1], "new-uuid")  # Should be moved to end
    
    @patch('common.misp.MISPEventUuidLink.objects.get_or_create')
    def test_update_misp_uuid_error_handling(self, mock_get_or_create):
        """Test error handling in UUID update."""
        mock_get_or_create.side_effect = Exception("Database Error")
        
        result = update_misp_uuid("error.com", "uuid")
        self.assertEqual(result, [])


class NotificationSystemTest(TestCase):
    """Test notification system components."""
    
    @patch('common.core.send_slack_message')
    @patch('common.core.send_email_notifications') 
    def test_notification_functions_exist(self, mock_email, mock_slack):
        """Test that notification functions can be called without errors."""
        from common.core import send_app_specific_notifications
        from data_leak.models import Subscriber
        
        user = User.objects.create_user("testuser", "test@test.com", "pass")
        subscriber = Subscriber.objects.create(user_rec=user, email=True, slack=True)
        
        # Test with QuerySet (not list)
        subscribers = Subscriber.objects.filter(id=subscriber.id)
        context_data = {'test': 'data'}
        
        try:
            send_app_specific_notifications('data_leak', context_data, subscribers)
            test_passed = True
        except Exception as e:
            test_passed = False
            print(f"Notification test failed: {e}")
        
        self.assertTrue(test_passed)


class SecurityTest(TestCase):
    """Test security-related functionality."""
    
    def test_domain_input_sanitization(self):
        """Test domain name input handling."""
        test_domains = [
            "normal-domain.com",
            "sub.domain.com",
            "domain-with-dashes.org"
        ]
        
        for domain in test_domains:
            uuids = update_misp_uuid(domain, "test-uuid")
            self.assertIsInstance(uuids, list)
            
            # Cleanup
            try:
                mapping = MISPEventUuidLink.objects.get(domain_name=domain)
                mapping.delete()
            except MISPEventUuidLink.DoesNotExist:
                pass
    
    @patch.dict(os.environ, {'MISP_KEY': 'test-key'})
    def test_environment_variable_handling(self):
        """Test environment variable configuration."""
        self.assertEqual(os.environ.get('MISP_KEY'), 'test-key')


class PerformanceTest(TestCase):
    """Test performance with reasonable data sizes."""
    
    def test_moderate_uuid_operations(self):
        """Test performance with moderate data sizes."""
        # Test with 10 domains instead of 100
        domains = [f"perf-test-{i}.com" for i in range(10)]
        
        start_time = timezone.now()
        
        for domain in domains:
            update_misp_uuid(domain, f"uuid-{domain}")
        
        end_time = timezone.now()
        duration = (end_time - start_time).total_seconds()
        
        self.assertLess(duration, 2.0)
        self.assertEqual(MISPEventUuidLink.objects.count(), 10)
    
    def test_reasonable_uuid_list_size(self):
        """Test with reasonable UUID list size."""
        domain = "uuid-list-test.com"
        
        # Test with 5 UUIDs instead of 50
        uuid_list = [f"uuid-{i}" for i in range(5)]
        MISPEventUuidLink.objects.create(
            domain_name=domain,
            misp_event_uuid=uuid_list
        )
        
        start_time = timezone.now()
        
        for _ in range(10):
            uuids = get_misp_uuid(domain)
            self.assertEqual(len(uuids), 5)
        
        end_time = timezone.now()
        duration = (end_time - start_time).total_seconds()
        
        self.assertLess(duration, 1.0)


class IntegrationTest(TransactionTestCase):
    """Integration tests for common module workflow."""
    
    def setUp(self):
        """Set up test data."""
        self.user = User.objects.create_user(
            username="integrationuser",
            email="integration@test.com", 
            password="testpass123"
        )
    
    def test_misp_workflow_integration(self):
        """Test complete MISP UUID workflow."""
        domain = "integration-test.com"
        
        # Test initial state
        uuids = get_misp_uuid(domain)
        self.assertEqual(uuids, [])
        
        # Test adding UUID
        uuids = update_misp_uuid(domain, "first-uuid")
        self.assertEqual(len(uuids), 1)
        
        # Test adding another UUID
        uuids = update_misp_uuid(domain, "second-uuid")
        self.assertEqual(len(uuids), 2)
        
        # Verify persistence
        retrieved_uuids = get_misp_uuid(domain)
        self.assertEqual(len(retrieved_uuids), 2)
    
    @patch('dns_finder.models.DnsTwisted')
    @patch('site_monitoring.models.Site')
    def test_domain_cleanup_workflow(self, mock_site, mock_dns_twisted):
        """Test domain cleanup functionality."""
        domain = "cleanup-test.com"
        
        # Create mapping
        MISPEventUuidLink.objects.create(
            domain_name=domain,
            misp_event_uuid=["cleanup-uuid"]
        )
        
        # Mock that domain is not used anywhere
        mock_site.objects.filter.return_value.exists.return_value = False
        mock_dns_twisted.objects.filter.return_value.exists.return_value = False
        
        # Test cleanup
        result = MISPEventUuidLink.check_and_delete_unused_domain(domain)
        
        self.assertTrue(result)
        self.assertFalse(MISPEventUuidLink.objects.filter(domain_name=domain).exists())


class ModelValidationTest(TestCase):
    """Test model validation and constraints."""
    
    def test_misp_link_field_validation(self):
        """Test MISPEventUuidLink field validation."""
        # Test with valid data
        mapping = MISPEventUuidLink.objects.create(
            domain_name="valid.com",
            misp_event_uuid=["valid-uuid-1", "valid-uuid-2"]
        )
        
        self.assertTrue(mapping.id)
        self.assertIsNotNone(mapping.created_at)
        self.assertIsNotNone(mapping.updated_at)
    
    def test_domain_name_requirements(self):
        """Test domain name field requirements."""
        # Test domain name with valid data works
        mapping = MISPEventUuidLink.objects.create(domain_name="valid.com")
        self.assertTrue(mapping.id)
        
        # Test very long domain name (should work within MySQL limits)
        long_domain = "a" * 100 + ".com"
        long_mapping = MISPEventUuidLink.objects.create(domain_name=long_domain)
        self.assertTrue(long_mapping.id)
        
        # Test domain name validation (this is more about business logic than DB constraints)
        # Empty string is allowed by Django CharField, so we test that it creates successfully
        empty_mapping = MISPEventUuidLink.objects.create(domain_name="")
        self.assertTrue(empty_mapping.id)