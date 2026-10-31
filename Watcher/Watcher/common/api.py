import logging
from rest_framework import viewsets, permissions, filters, status
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
from .models import LegitimateDomain, PendingAction, Screenshot
from .core import screenshots_configured, take_screenshot
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

    @action(detail=True, methods=['post'], url_path='screenshots/capture', permission_classes=[CanTakeScreenshots])
    def screenshots_capture(self, request, pk=None):
        obj = self.get_object()
        if not screenshots_configured():
            return Response({'error': 'The screenshot service is not configured.'}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        url = self.screenshot_url(obj)
        if not url:
            return Response({'error': 'There is no page to take a screenshot of.'}, status=status.HTTP_400_BAD_REQUEST)
        shot = take_screenshot(self.screenshot_target, obj.pk, url, request.user)
        if shot is None:
            return Response({'error': 'The screenshot could not be taken (the page may refuse robots, or be gone).'},
                            status=status.HTTP_502_BAD_GATEWAY)
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

    def get_queryset(self):
        from timeline.models import TimelineEvent
        qs = LegitimateDomain.objects.all().order_by('-created_at', '-id')

        # List filters: ?status= (domain expiry), ?ssl= (certificate expiry), ?repurchased=true|false
        params = self.request.query_params if self.request else {}
        today = date.today()
        for param, field in (('status', 'expiry'), ('ssl', 'ssl_expiry')):
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
                'expired': count('expiry', 'expired'),
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


class GlobalSearchView(APIView):
    """GET /api/search/?q=… — results of every module the user may see, grouped by module (see common/search.py)."""
    permission_classes = [permissions.AllowAny]

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
