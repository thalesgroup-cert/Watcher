import logging
import threading
from django.conf import settings
from rest_framework import viewsets, permissions, filters, status
from rest_framework.throttling import SimpleRateThrottle
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.pagination import PageNumberPagination
from rest_framework.views import APIView
from django.db.models import Q
from django.utils import timezone
from collections import Counter
from datetime import date, datetime, timedelta
from django.db.models import Prefetch
from .bulk import BulkActionMixin, BulkCreateMixin, normalize_domain, validate_domain
from .models import JobRun, LegitimateDomain, PendingAction, Screenshot
from .utils import job_log, registration_actions
from .core import capture_failure_message, screenshots_configured, take_screenshot_result
from .serializers import LegitimateDomainSerializer, PendingActionSerializer, ScreenshotSerializer
from django.http import HttpResponse
from django.shortcuts import get_object_or_404

logger = logging.getLogger(__name__)


# Pagination
class StandardResultsSetPagination(PageNumberPagination):
    page_size = 100
    page_size_query_param = 'page_size'
    max_page_size = 1000


# Screenshots of the objects of a module (see `take_screenshot`)
class WatcherThrottle(SimpleRateThrottle):
    """
    A limit per user (per address for an anonymous visitor). The rates are in `settings.WATCHER_THROTTLES`, read at each
    request, e.g. {'search': '60/min'}; the counters live in the cache of the process (Watcher runs one worker).
    """
    scope = None

    def get_rate(self):
        return settings.WATCHER_THROTTLES.get(self.scope)

    def get_cache_key(self, request, view):
        user = request.user
        ident = f'user-{user.pk}' if user and user.is_authenticated else self.get_ident(request)
        return self.cache_format % {'scope': self.scope, 'ident': ident}


class CaptureThrottle(WatcherThrottle):
    scope = 'screenshot'


class SearchThrottle(WatcherThrottle):
    scope = 'search'


# A capture keeps one of the 16 threads of the server busy until the page has loaded: only a few at a time
_capture_slots = threading.BoundedSemaphore(4)


class CanTakeScreenshots(permissions.BasePermission):
    """Signed in, and allowed to change the objects of the viewset."""

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.has_perm(view.screenshot_permission))


class ScreenshotMixin:
    """
    Gives a viewset the screenshots of its objects:

        GET  <id>/screenshots/                  the screenshots kept for the object (without their images)
        POST <id>/screenshots/capture/          take one now (a browser in an isolated container visits the page)
        GET  <id>/screenshots/<shot id>/image/  the image (a JPEG)

    A viewset sets `screenshot_target` (`app.model`), `screenshot_permission` (what taking one requires: the right to
    change the object) and `screenshot_url(obj)`.
    """
    screenshot_target = None
    screenshot_permission = None

    def screenshot_url(self, obj):
        raise NotImplementedError

    def get_permissions(self):
        # Whatever the viewset lets an anonymous visitor read (the legitimate domains are public), the screenshots are not
        if self.action in ('screenshots_list', 'screenshots_image'):
            return [permissions.IsAuthenticated()]
        return super().get_permissions()

    def _screenshots(self, obj):
        return Screenshot.objects.filter(target=self.screenshot_target, target_id=obj.pk)

    @action(detail=True, methods=['get'], url_path='screenshots')
    def screenshots_list(self, request, pk=None):
        obj = self.get_object()
        return Response({
            'configured': screenshots_configured(),
            'results': ScreenshotSerializer(self._screenshots(obj).select_related('taken_by').defer('image'), many=True).data,
        })

    @action(detail=True, methods=['post'], url_path='screenshots/capture', permission_classes=[CanTakeScreenshots],
            throttle_classes=[CaptureThrottle])
    def screenshots_capture(self, request, pk=None):
        obj = self.get_object()
        if not screenshots_configured():
            return Response({'error': 'The screenshot service is not configured.'}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        url = self.screenshot_url(obj)
        if not url:
            return Response({'error': 'There is no page to take a screenshot of.'}, status=status.HTTP_400_BAD_REQUEST)
        if not _capture_slots.acquire(blocking=False):
            return Response({'error': 'Screenshots are being taken: try again in a moment.'},
                            status=status.HTTP_429_TOO_MANY_REQUESTS)
        try:
            shot, reason = take_screenshot_result(self.screenshot_target, obj.pk, url, request.user)
        finally:
            _capture_slots.release()
        if shot is None:
            return Response({'error': capture_failure_message(reason)}, status=status.HTTP_502_BAD_GATEWAY)
        return Response(ScreenshotSerializer(shot).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['get'], url_path=r'screenshots/(?P<shot_id>\d+)/image')
    def screenshots_image(self, request, pk=None, shot_id=None):
        obj = self.get_object()
        shot = get_object_or_404(self._screenshots(obj).only('image'), pk=shot_id)
        response = HttpResponse(bytes(shot.image), content_type='image/jpeg')
        response['Cache-Control'] = 'private, max-age=86400'
        return response


# LegitimateDomain Viewset
class LegitimateDomainViewSet(ScreenshotMixin, BulkCreateMixin, BulkActionMixin, viewsets.ModelViewSet):
    """
    API endpoint for viewing and editing company legitimate domains.
    """
    # The domains are the organisation's own: a screenshot, taken on demand, shows what its site looks like
    screenshot_target = 'common.legitimate_domain'
    screenshot_permission = 'common.change_legitimatedomain'

    def screenshot_url(self, obj):
        return f'https://{obj.domain_name}/'

    bulk_field = 'domain_name'
    bulk_normalizer = staticmethod(normalize_domain)
    bulk_validator = staticmethod(validate_domain)
    bulk_update_fields = ('repurchased',)
    permission_classes = [permissions.DjangoModelPermissionsOrAnonReadOnly]
    serializer_class = LegitimateDomainSerializer
    pagination_class = StandardResultsSetPagination
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    ordering_fields = ['domain_name', 'ticket_id', 'contact', 'created_at', 'domain_created_at', 'expiry', 'ssl_expiry', 'repurchased']

    # Days before an expiry date at which a domain or certificate counts as "expiring soon".
    EXPIRING_SOON_DAYS = 30

    @property
    def search_fields(self):
        # Ticket ids and comments are internal: anonymous visitors only search what they can see.
        if self.request and self.request.user.is_authenticated:
            return ['domain_name', 'ticket_id', 'contact', 'comments']
        return ['domain_name', 'contact']

    def get_permissions(self):
        if self.action in ['screenshots_list', 'screenshots_image', 'screenshots_capture']:
            return super().get_permissions()
        if self.action in ['list', 'retrieve', 'get_statistics']:
            return [permissions.AllowAny()]
        return [permissions.IsAuthenticated()]

    @classmethod
    def expiry_filter(cls, field, value, today):
        """
        Q object for an expiry status of `field`: expired, expiring_soon (within EXPIRING_SOON_DAYS),
        attention (expired or expiring soon), valid (later than that) or none (no date). None if unknown.
        """
        soon = today + timedelta(days=cls.EXPIRING_SOON_DAYS)
        return {
            'expired': Q(**{f'{field}__lt': today}),
            'expiring_soon': Q(**{f'{field}__gte': today, f'{field}__lte': soon}),
            'attention': Q(**{f'{field}__lte': soon}),
            'valid': Q(**{f'{field}__gt': soon}),
            'none': Q(**{f'{field}__isnull': True}),
        }.get(value)

    @classmethod
    def domain_expiry_filter(cls, value, today, now):
        """
        Same as expiry_filter for the expiry of the domain, which also knows whether a registry confirmed the date
        (RDAP gave it and a registry answered less than LegitimateDomain.EXPIRY_VERIFIED_DAYS days ago):
          - expired: a past date the registry confirmed; unconfirmed: a past date nobody confirmed (typed by hand, or not
            checked lately), so it may be wrong;
          - unverified: no registry answered lately, whatever the date.
        """
        verified_since = now - timedelta(days=LegitimateDomain.EXPIRY_VERIFIED_DAYS)
        confirmed = Q(expiry_check='ok', expiry_source='RDAP', expiry_checked_at__gte=verified_since)
        if value == 'expired':
            return Q(expiry__lt=today) & confirmed
        if value == 'unconfirmed':
            return Q(expiry__lt=today) & ~confirmed
        if value == 'unverified':
            return Q(expiry_checked_at__isnull=True) | Q(expiry_checked_at__lt=verified_since)
        if value == 'not_registered':
            return Q(expiry_check='not_registered')
        return cls.expiry_filter('expiry', value, today)

    def get_queryset(self):
        from timeline.models import TimelineEvent
        qs = LegitimateDomain.objects.all().order_by('-created_at', '-id')

        # List filters: ?status= (domain expiry), ?ssl= (certificate expiry), ?repurchased=true|false
        params = self.request.query_params if self.request else {}
        today = date.today()
        now = datetime.now()
        for param, field in (('status', 'expiry'), ('ssl', 'ssl_expiry')):
            if param == 'status':
                condition = self.domain_expiry_filter(params.get(param), today, now)
            else:
                condition = self.expiry_filter(field, params.get(param), today)
            if condition is not None:
                qs = qs.filter(condition)
        repurchased = params.get('repurchased')
        if repurchased in ('true', 'false'):
            qs = qs.filter(repurchased=repurchased == 'true')

        qs = qs.prefetch_related(
            Prefetch(
                'timeline_events',
                queryset=TimelineEvent.objects.select_related('user__profile').order_by('-timestamp'),
                to_attr='_timeline_events',
            )
        )
        return qs

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context['request'] = self.request
        return context

    @action(detail=False, methods=['get'], permission_classes=[permissions.AllowAny], url_path='statistics')
    def get_statistics(self, request):
        """
        Get statistics for legitimate domains: status counters (same rules as the ?status= / ?ssl= list
        filters), the top TLDs, and the domain / certificate expiries of the next 12 months.
        """
        try:
            now = datetime.now()
            today = now.date()
            queryset = LegitimateDomain.objects.all()

            def count(field, value):
                return queryset.filter(self.expiry_filter(field, value, today)).count()

            def domain_count(value):
                return queryset.filter(self.domain_expiry_filter(value, today, now)).count()

            # Upcoming expiries (from today), one bucket per month from the current one
            months = [(today.year + (today.month - 1 + i) // 12, (today.month - 1 + i) % 12 + 1) for i in range(12)]
            end = date(months[-1][0] + months[-1][1] // 12, months[-1][1] % 12 + 1, 1)
            upcoming = {m: {'domains': 0, 'certificates': 0} for m in months}
            for field, key in (('expiry', 'domains'), ('ssl_expiry', 'certificates')):
                for value in queryset.filter(**{f'{field}__gte': today, f'{field}__lt': end}).values_list(field, flat=True):
                    upcoming[(value.year, value.month)][key] += 1

            tlds = Counter(
                name.rsplit('.', 1)[-1].lower()
                for name in queryset.values_list('domain_name', flat=True)
                if '.' in name
            )

            stats = {
                'total': queryset.count(),
                'repurchased': queryset.filter(repurchased=True).count(),
                'expired': domain_count('expired'),
                'unconfirmed': domain_count('unconfirmed'),
                'unverified': domain_count('unverified'),
                'notRegistered': domain_count('not_registered'),
                'expiringSoon': count('expiry', 'expiring_soon'),
                'noExpiry': count('expiry', 'none'),
                'sslExpired': count('ssl_expiry', 'expired'),
                'sslExpiringSoon': count('ssl_expiry', 'expiring_soon'),
                'sslNoExpiry': count('ssl_expiry', 'none'),
                'newToday': queryset.filter(created_at__date=today).count(),
                'newThisWeek': queryset.filter(created_at__gte=now - timedelta(days=7)).count(),
                'topTlds': [{'tld': f'.{tld}', 'count': n} for tld, n in tlds.most_common(6)],
                'upcoming': [{'month': f'{y}-{m:02d}', **upcoming[(y, m)]} for y, m in months],
            }
            return Response(stats, status=status.HTTP_200_OK)

        except Exception:
            logger.exception("Error computing Common statistics")
            return Response({
                'status': 'error',
                'message': 'An internal error occurred.'
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @action(detail=False, methods=['post'], permission_classes=[permissions.IsAuthenticated], url_path='misp')
    def export_to_misp(self, request):
        """
        Export legitimate domain to MISP using DNS Threats Monitored's logic.
        """
        from dns_finder.api import MISPViewSet
        from dns_finder.serializers import MISPSerializer
        import logging
        
        logger = logging.getLogger(__name__)
        
        domain_id = request.data.get('id')
        event_uuid = request.data.get('event_uuid', '')
        
        if not domain_id:
            return Response({
                'status': 'error',
                'message': 'Domain ID is required'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            domain = LegitimateDomain.objects.get(id=domain_id)
        except LegitimateDomain.DoesNotExist:
            return Response({
                'status': 'error',
                'message': 'Domain not found'
            }, status=status.HTTP_404_NOT_FOUND)
        
        try:
            misp_viewset = MISPViewSet()
            misp_viewset.request = request
            misp_viewset.format_kwarg = None
            
            misp_data = {
                'id': domain.id,
                'event_uuid': event_uuid,
                'domain_name': domain.domain_name,
                'fuzzer': 'legitimate_domain',
                'dns_monitored': None,
                'keyword_monitored': None
            }
            
            serializer = MISPSerializer(data=misp_data)
            
            if serializer.is_valid():
                if hasattr(request.data, '_mutable'):
                    request.data._mutable = True
                    request.data.update(misp_data)
                    request.data._mutable = False
                else:
                    request.data.update(misp_data)
                misp_response = misp_viewset.create(request)
                
                if misp_response.status_code in [200, 201]:
                    response_data = misp_response.data
                    
                    # Update domain with new MISP UUID
                    if response_data.get('misp_event_uuid'):
                        current_uuids = domain.misp_event_uuid or []
                        if isinstance(current_uuids, str):
                            current_uuids = [u.strip() for u in current_uuids.replace('[', '').replace(']', '').replace("'", '').split(',') if u.strip()]
                        
                        new_uuid = response_data['misp_event_uuid']
                        if new_uuid not in current_uuids:
                            current_uuids.append(new_uuid)
                        
                        domain.misp_event_uuid = current_uuids
                        domain.save()
                        
                        return Response({
                            'status': 'success',
                            'message': response_data.get('message', f'{domain.domain_name} exported to MISP successfully'),
                            'misp_event_uuid': new_uuid
                        }, status=status.HTTP_200_OK)
                else:
                    return Response({
                        'status': 'error',
                        'message': 'Failed to export to MISP'
                    }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
            else:
                logger.error(f"Serializer errors: {serializer.errors}")
                return Response({
                    'status': 'error',
                    'message': 'Invalid data for MISP export',
                    'errors': serializer.errors
                }, status=status.HTTP_400_BAD_REQUEST)
            
        except Exception:
            logger.exception(f"MISP export error for {domain.domain_name}")
            return Response({
                'status': 'error',
                'message': 'An internal error occurred during MISP export.'
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


def _record_resolution_event(pa, user):
    """
    Record a 'transferred' or 'cancelled' TimelineEvent after a PendingAction is resolved.
    - approved udrp_transfer → 'transferred' on the new LegitimateDomain
    - rejected udrp_transfer → 'cancelled' on the original Site (may already be deleted)
    """
    if pa.action_type != 'udrp_transfer':
        return

    from timeline.models import TimelineEvent
    from django.contrib.contenttypes.models import ContentType

    domain_name = pa.metadata.get('domain_name', '')

    if pa.status == 'approved':
        from common.models import LegitimateDomain
        try:
            legit = LegitimateDomain.objects.get(domain_name=domain_name)
        except LegitimateDomain.DoesNotExist:
            return
        ct = ContentType.objects.get_for_model(LegitimateDomain)
        TimelineEvent.objects.create(
            content_type=ct,
            object_id=legit.pk,
            action=TimelineEvent.ACTION_TRANSFERRED,
            user=user,
            diff={},
            object_repr=domain_name,
        )
    elif pa.status == 'rejected':
        from site_monitoring.models import Site
        ct = ContentType.objects.get_for_model(Site)
        site_id = pa.metadata.get('site_id')
        if not site_id:
            return
        TimelineEvent.objects.create(
            content_type=ct,
            object_id=site_id,
            action=TimelineEvent.ACTION_CANCELLED,
            user=user,
            diff={},
            object_repr=domain_name,
        )


def _execute_pending_action(pa):
    """
    Carry out the side-effect associated with a PendingAction when approved.
    """
    if pa.action_type == 'udrp_transfer':
        from site_monitoring.models import Site
        from site_monitoring.udrp import transfer_to_legitimate_domains

        site_id = pa.metadata.get('site_id')
        domain_name = pa.metadata.get('domain_name', '')

        site = None
        if site_id:
            try:
                site = Site.objects.get(pk=site_id)
            except Site.DoesNotExist:
                if domain_name:
                    try:
                        site = Site.objects.get(domain_name=domain_name)
                        logger.info(
                            "PendingAction %d: site_id %s stale, found '%s' by domain_name (new pk=%d).",
                            pa.id, site_id, domain_name, site.pk,
                        )
                    except Site.DoesNotExist:
                        pass

        if site is None:
            logger.warning(
                "PendingAction %d: '%s' no longer exists in Website Monitoring - skipping transfer.",
                pa.id, domain_name or site_id,
            )
            return

        transfer_to_legitimate_domains(site)
        site_name = site.domain_name
        site.delete()
        logger.info("PendingAction %d: Site '%s' removed from Website Monitoring after UDRP transfer.", pa.id, site_name)

    elif pa.action_type == registration_actions.SITE_AVAILABLE:
        registration_actions.execute_site_available(pa)

    elif pa.action_type == registration_actions.DOMAIN_LOST:
        registration_actions.execute_domain_lost(pa)


class GlobalSearchView(APIView):
    """GET /api/search/?q=… — results of every module the user may see, grouped by module (see common/search.py)."""
    permission_classes = [permissions.AllowAny]
    throttle_classes = [SearchThrottle]

    def get(self, request):
        from .search import run_search
        return Response(run_search(request.user, request.query_params.get('q', '')))


class PendingActionViewSet(viewsets.ReadOnlyModelViewSet):
    """
    API endpoint for viewing and managing pending actions.
    """
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = PendingActionSerializer

    def get_queryset(self):
        qs = PendingAction.objects.all()
        status_filter = self.request.query_params.get('status')
        if status_filter:
            qs = qs.filter(status=status_filter)
        return qs

    @action(detail=False, methods=['get'], url_path='count')
    def count(self, request):
        """Return the count of pending (unresolved) actions."""
        n = PendingAction.objects.filter(status='pending').count()
        return Response({'count': n})

    @action(detail=True, methods=['post'], url_path='approve')
    def approve(self, request, pk=None):
        """Approve and execute the pending action."""
        pa = self.get_object()
        if pa.status != 'pending':
            return Response(
                {'error': 'This action is no longer pending.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        _execute_pending_action(pa)
        pa.status = 'approved'
        pa.resolved_at = timezone.now()
        pa.resolved_by = request.user
        pa.save()
        _record_resolution_event(pa, request.user)
        return Response(PendingActionSerializer(pa).data)

    # Most actions that can be decided at once: a list of lost domains is as long as the list that was imported
    RESOLVE_MAX = 500

    @action(detail=False, methods=['post'], url_path='resolve')
    def resolve(self, request):
        """
        Approve or reject several pending actions in one request: {"ids": [1, 2, ...], "decision": "approve" | "reject"}.
        Each action is decided on its own: one that fails (or is no longer pending) does not stop the others, and is
        reported. Answers {"succeeded": n, "failed": [{"id": ..., "error": "..."}]}.
        """
        decision = request.data.get('decision')
        ids = request.data.get('ids')
        if decision not in ('approve', 'reject'):
            return Response({'error': "decision must be 'approve' or 'reject'."}, status=status.HTTP_400_BAD_REQUEST)
        if not isinstance(ids, list) or not ids or not all(isinstance(i, int) for i in ids):
            return Response({'error': 'ids must be a list of action numbers.'}, status=status.HTTP_400_BAD_REQUEST)
        if len(ids) > self.RESOLVE_MAX:
            return Response({'error': f'At most {self.RESOLVE_MAX} actions at once.'}, status=status.HTTP_400_BAD_REQUEST)
        found = {pa.pk: pa for pa in PendingAction.objects.filter(pk__in=ids)}
        succeeded, failed = 0, []
        for pk in dict.fromkeys(ids):
            pa = found.get(pk)
            if pa is None:
                failed.append({'id': pk, 'error': 'Not found.'})
                continue
            if pa.status != 'pending':
                failed.append({'id': pk, 'error': 'This action is no longer pending.'})
                continue
            try:
                if decision == 'approve':
                    _execute_pending_action(pa)
                pa.status = 'approved' if decision == 'approve' else 'rejected'
                pa.resolved_at = timezone.now()
                pa.resolved_by = request.user
                pa.save()
                _record_resolution_event(pa, request.user)
                succeeded += 1
            except Exception as e:
                logger.exception("Pending action %s could not be %sd", pk, decision)
                failed.append({'id': pk, 'error': str(e) or type(e).__name__})
        return Response({'succeeded': succeeded, 'failed': failed})

    @action(detail=True, methods=['post'], url_path='reject')
    def reject(self, request, pk=None):
        """Reject the pending action without executing it."""
        pa = self.get_object()
        if pa.status != 'pending':
            return Response(
                {'error': 'This action is no longer pending.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        pa.status = 'rejected'
        pa.resolved_at = timezone.now()
        pa.resolved_by = request.user
        pa.save()
        _record_resolution_event(pa, request.user)
        return Response(PendingActionSerializer(pa).data)


# The app of a job (the first part of its key) as the interface names it
MODULE_LABELS = {
    'threats_watcher': 'Threats Watcher',
    'cyber_watch': 'Cyber Watch',
    'data_leak': 'Data Leak',
    'dns_finder': 'DNS Threats',
    'site_monitoring': 'Website Monitoring',
    'common': 'Legitimate Domains',
    'connectors': 'Connectors',
}
RECENT = 10  # passages shown as the recent history of a job


class IsSuperuser(permissions.BasePermission):
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.is_superuser)


def _finished(run):
    return run.started_at + timedelta(seconds=run.duration)


class ScheduledJobsView(APIView):
    """`GET /api/common/scheduled_jobs/`: every scheduled job with its last passages. Superusers only."""
    permission_classes = [IsSuperuser]

    def get(self, request):
        running = job_log.running_jobs()
        jobs = []
        for job in job_log.scheduled_jobs():
            key = job_log.job_key(job.func)
            module = MODULE_LABELS.get(key.split('.')[0], key.split('.')[0])
            runs = list(JobRun.objects.filter(job=key).order_by('-started_at', '-id')[:RECENT])
            last = runs[0] if runs else None
            durations = [run.duration for run in runs]
            next_run = getattr(job, 'next_run_time', None)
            tracked_label = getattr(job.func, 'job_label', None)  # set by logged_job
            jobs.append({
                'key': key,
                'module': module,
                'label': last.label if last else tracked_label or job.func.__name__.replace('_', ' ').capitalize(),
                # Keeps a summary of its passes (logged_job); the small ones, such as the clean-ups, do not
                'tracked': tracked_label is not None,
                'schedule': job_log.describe_schedule(job.trigger),
                'next_run': next_run.isoformat() if next_run else None,
                'running': key in running,
                'running_since': running[key].isoformat() if key in running else None,
                'reported': last is not None,
                'last': {
                    'started_at': last.started_at.isoformat(),
                    'finished_at': _finished(last).isoformat(),
                    'duration': last.duration,
                    'failed': last.failed,
                    'error': last.error,
                    'counts': last.counts,
                } if last else None,
                'average_duration': round(sum(durations) / len(durations), 1) if durations else None,
                # Oldest first, to draw them left to right
                'recent': [{'started_at': r.started_at.isoformat(), 'duration': r.duration, 'failed': r.failed} for r in reversed(runs)],
            })
        jobs.sort(key=lambda j: (j['module'], j['label']))
        return Response({'jobs': jobs})
