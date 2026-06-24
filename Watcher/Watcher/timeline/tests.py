import uuid

from django.test import TestCase, TransactionTestCase, RequestFactory
from django.contrib.auth.models import User
from django.contrib.contenttypes.models import ContentType

from rest_framework.test import APITestCase
from rest_framework import status
from knox.models import AuthToken

from common.models import LegitimateDomain
from timeline.models import TimelineEvent
from timeline.middleware import CurrentUserMiddleware, get_current_user


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _unique_domain():
    """Return a unique domain name so tests don't clash on the unique constraint."""
    return f"test-{uuid.uuid4().hex[:8]}.com"


# ---------------------------------------------------------------------------
# Class 1 – Model tests
# ---------------------------------------------------------------------------

class TimelineEventModelTest(TestCase):
    """Unit tests for the TimelineEvent model."""

    def setUp(self):
        self.user = User.objects.create_user(
            username='modeluser', password='modelpass'
        )

    def _make_event(self, action=TimelineEvent.ACTION_CREATED, user=None, object_repr='example.com'):
        """Create a minimal TimelineEvent attached to the User content-type."""
        ct = ContentType.objects.get_for_model(User)
        return TimelineEvent.objects.create(
            content_type=ct,
            object_id=self.user.pk,
            action=action,
            user=user,
            object_repr=object_repr,
        )

    def test_str_with_user(self):
        event = self._make_event(
            action=TimelineEvent.ACTION_CREATED,
            user=self.user,
            object_repr='example.com',
        )
        result = str(event)
        self.assertIn('Created', result)
        self.assertIn('example.com', result)
        self.assertIn(self.user.username, result)

    def test_str_without_user(self):
        event = self._make_event(
            action=TimelineEvent.ACTION_DELETED,
            user=None,
            object_repr='deleted.com',
        )
        result = str(event)
        self.assertIn('Deleted', result)
        self.assertIn('system', result)

    def test_ordering_most_recent_first(self):
        """The default ordering must return the most recently created event first."""
        ct = ContentType.objects.get_for_model(User)
        first = TimelineEvent.objects.create(
            content_type=ct,
            object_id=self.user.pk,
            action=TimelineEvent.ACTION_CREATED,
            object_repr='first',
        )
        second = TimelineEvent.objects.create(
            content_type=ct,
            object_id=self.user.pk,
            action=TimelineEvent.ACTION_UPDATED,
            object_repr='second',
        )
        events = list(TimelineEvent.objects.filter(
            content_type=ct, object_id=self.user.pk
        ))
        # Most recent (second) must appear before the older one (first).
        self.assertEqual(events[0].pk, second.pk)
        self.assertEqual(events[1].pk, first.pk)


# ---------------------------------------------------------------------------
# Class 2 – Signal tests
# ---------------------------------------------------------------------------

class TimelineSignalTest(TransactionTestCase):
    """
    Tests for the pre_save / post_save / post_delete signals wired up in
    apps.py ready().  TransactionTestCase ensures each test runs in
    isolation so signal-created events don't bleed between tests.
    """

    def _domain(self, name=None):
        return LegitimateDomain.objects.create(
            domain_name=name or _unique_domain()
        )

    def _ct(self):
        return ContentType.objects.get_for_model(LegitimateDomain)

    def test_signal_created(self):
        domain = self._domain()
        events = TimelineEvent.objects.filter(
            content_type=self._ct(),
            object_id=domain.pk,
            action=TimelineEvent.ACTION_CREATED,
        )
        self.assertTrue(
            events.exists(),
            "An ACTION_CREATED TimelineEvent should be created when saving a new LegitimateDomain.",
        )

    def test_signal_updated(self):
        domain = self._domain()
        old_name = domain.domain_name
        new_name = _unique_domain()

        domain.domain_name = new_name
        domain.save()

        updated_events = TimelineEvent.objects.filter(
            content_type=self._ct(),
            object_id=domain.pk,
            action=TimelineEvent.ACTION_UPDATED,
        )
        self.assertTrue(
            updated_events.exists(),
            "An ACTION_UPDATED TimelineEvent should be created after changing domain_name.",
        )
        event = updated_events.first()
        self.assertIn('domain_name', event.diff)
        self.assertEqual(event.diff['domain_name']['old'], old_name)
        self.assertEqual(event.diff['domain_name']['new'], new_name)

    def test_signal_deleted(self):
        domain = self._domain()
        domain_pk = domain.pk
        domain.delete()

        deleted_events = TimelineEvent.objects.filter(
            content_type=self._ct(),
            object_id=domain_pk,
            action=TimelineEvent.ACTION_DELETED,
        )
        self.assertTrue(
            deleted_events.exists(),
            "An ACTION_DELETED TimelineEvent should be created after deleting a LegitimateDomain.",
        )

    def test_no_diff_no_event(self):
        """
        Modifying a field that is NOT in TRACKED_FIELDS should not create an
        ACTION_UPDATED event.  `created_at` is not in the tracked fields list.
        """
        from django.utils import timezone

        domain = self._domain()
        before_count = TimelineEvent.objects.filter(
            content_type=self._ct(),
            object_id=domain.pk,
            action=TimelineEvent.ACTION_UPDATED,
        ).count()

        # Touch only the untracked `created_at` field.
        domain.created_at = timezone.now()
        domain.save(update_fields=['created_at'])

        after_count = TimelineEvent.objects.filter(
            content_type=self._ct(),
            object_id=domain.pk,
            action=TimelineEvent.ACTION_UPDATED,
        ).count()

        self.assertEqual(
            before_count,
            after_count,
            "No ACTION_UPDATED event should be created when only an untracked field changes.",
        )


# ---------------------------------------------------------------------------
# Class 3 – Middleware tests
# ---------------------------------------------------------------------------

class TimelineMiddlewareTest(TestCase):
    """Tests for CurrentUserMiddleware thread-local lifecycle."""

    @staticmethod
    def _dummy_response(request):
        from django.http import HttpResponse
        return HttpResponse('ok')

    def test_thread_local_cleared_after_authenticated_request(self):
        """
        After a request completes the middleware must reset _thread_locals.user
        to None, even when the request was made by an authenticated user.
        """
        user = User.objects.create_user(username='mwuser', password='mwpass')
        middleware = CurrentUserMiddleware(self._dummy_response)

        request = RequestFactory().get('/')
        request.user = user  # simulates AuthenticationMiddleware
        middleware(request)

        self.assertIsNone(
            get_current_user(),
            "_thread_locals.user must be None after the request cycle ends.",
        )

    def test_thread_local_cleared_after_unauthenticated_request(self):
        """
        An anonymous request must also leave _thread_locals.user as None after
        the middleware finishes.
        """
        from django.contrib.auth.models import AnonymousUser

        middleware = CurrentUserMiddleware(self._dummy_response)
        request = RequestFactory().get('/')
        request.user = AnonymousUser()
        middleware(request)

        self.assertIsNone(
            get_current_user(),
            "_thread_locals.user must be None after an unauthenticated request.",
        )


# ---------------------------------------------------------------------------
# Class 4 – API tests
# ---------------------------------------------------------------------------

class TimelineAPITest(APITestCase):
    """Tests for GET /api/timeline/events/"""

    def setUp(self):
        self.user = User.objects.create_user(
            username='apiuser', password='apipass'
        )
        _, self.token = AuthToken.objects.create(self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {self.token}')

    # ------------------------------------------------------------------
    # Authentication
    # ------------------------------------------------------------------

    def test_requires_auth(self):
        self.client.credentials()  # remove token
        response = self.client.get('/api/timeline/events/')
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    # ------------------------------------------------------------------
    # Filtering
    # ------------------------------------------------------------------

    def test_empty_without_params(self):
        """No content_type / object_id params → empty list, no error."""
        response = self.client.get('/api/timeline/events/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.data
        results = data['results'] if isinstance(data, dict) and 'results' in data else data
        self.assertEqual(len(results), 0)

    def test_returns_events_for_object(self):
        """
        Creating a LegitimateDomain triggers ACTION_CREATED via signal.
        The API must return at least that event when queried with the
        matching content_type + object_id.
        """
        domain = LegitimateDomain.objects.create(domain_name=_unique_domain())
        url = (
            f'/api/timeline/events/'
            f'?content_type=common.legitimatedomain&object_id={domain.pk}'
        )
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.data
        results = data['results'] if isinstance(data, dict) and 'results' in data else data
        self.assertGreaterEqual(
            len(results), 1,
            "At least one TimelineEvent (ACTION_CREATED) should exist for the new domain.",
        )

    def test_invalid_content_type(self):
        """An unknown content_type returns 200 with an empty list, not a 404/500."""
        response = self.client.get(
            '/api/timeline/events/?content_type=invalid.model&object_id=1'
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.data
        results = data['results'] if isinstance(data, dict) and 'results' in data else data
        self.assertEqual(len(results), 0)

    # ------------------------------------------------------------------
    # Serializer fields
    # ------------------------------------------------------------------

    def test_serializer_fields(self):
        """
        The serialized response must include all expected fields:
        id, action, action_label, username, timestamp, diff, object_repr.
        """
        domain = LegitimateDomain.objects.create(domain_name=_unique_domain())
        url = (
            f'/api/timeline/events/'
            f'?content_type=common.legitimatedomain&object_id={domain.pk}'
        )
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.data
        results = data['results'] if isinstance(data, dict) and 'results' in data else data
        self.assertGreaterEqual(len(results), 1)

        event = results[0]
        expected_fields = {
            'id', 'action', 'action_label', 'username',
            'timestamp', 'diff', 'object_repr',
        }
        for field in expected_fields:
            self.assertIn(
                field,
                event,
                f"Field '{field}' is missing from the serialized TimelineEvent.",
            )
