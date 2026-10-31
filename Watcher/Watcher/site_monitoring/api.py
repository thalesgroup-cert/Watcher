import logging
from .models import Site, Alert, MonitoredPage, PageScreenshot, PageVersion

logger = logging.getLogger('watcher.site_monitoring')
from collections import Counter
from rest_framework import viewsets, permissions, status, filters
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.pagination import PageNumberPagination
from datetime import datetime, timedelta
from django.db.models import Count, Exists, Max, OuterRef, Prefetch, Q, Subquery
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from django.db.models.functions import TruncDate
import threading
from common.bulk import BulkActionMixin, BulkCreateMixin, BulkModelPermission, BulkSkip, normalize_domain
from common.misp import get_misp_uuid
from common.core import screenshots_configured
from .core import capture_for_version, check_page, compare_texts, diff_rows, monitoring_init, sites_initializing
from .serializers import (SiteSerializer, AlertSerializer, AlertListSerializer, MISPSerializer, MonitoredPageSerializer,
                          PageVersionSerializer)


# Pagination
class StandardResultsSetPagination(PageNumberPagination):
    page_size = 100
    page_size_query_param = 'page_size'
    max_page_size = 1000


EXPIRING_SOON_DAYS = 30

# Change kinds of an alert, read from its type (core.create_alert / create_rdap_alert / create_banner_alert, and
# common.core for registrar / expiry changes); an alert can be of several kinds (e.g. "Mail record + IP address").
ALERT_KINDS = {
    'hosting': Q(type__icontains='IP address'),
    'mail': Q(type__icontains='Mail record'),
    'content': Q(type__icontains='Web content'),
    'registration': Q(type__icontains='RDAP') | Q(type__icontains='Registrar') | Q(type__icontains='Domain Expiry'),
    'certificate': Q(type__icontains='SSL') | Q(new_ssl_expiry__isnull=False) | Q(old_ssl_expiry__isnull=False),
    'server': Q(type__icontains='banner'),
}

# ?period= : alerts detected since (0 = today)
PERIODS = {'today': 0, '7d': 7, '30d': 30}


def filter_sites(qs, params):
    """
    Site list filters: legitimacy (comma-separated levels), web (online: HTTP 200, error: another code,
    offline: no answer, pending: first check not done), expiry (expired, expiring_soon, valid, none: domain
    expiry, 30 days), action (takedown, legal, blocking, none: no action taken).
    """
    levels = [int(v) for v in (params.get('legitimacy') or '').split(',') if v.isdigit()]
    if levels:
        qs = qs.filter(legitimacy__in=levels)
    web = params.get('web')
    if web == 'online':
        qs = qs.filter(web_status=200)
    elif web == 'error':
        qs = qs.filter(web_status__isnull=False).exclude(web_status=200)
    elif web == 'offline':
        qs = qs.filter(web_status__isnull=True, monitored=True)
    elif web == 'pending':
        qs = qs.exclude(monitored=True)
    today = datetime.now().date()
    soon = today + timedelta(days=EXPIRING_SOON_DAYS)
    expiry = {
        'expired': Q(domain_expiry__lt=today),
        'expiring_soon': Q(domain_expiry__gte=today, domain_expiry__lte=soon),
        'valid': Q(domain_expiry__gt=soon),
        'none': Q(domain_expiry__isnull=True),
    }.get(params.get('expiry'))
    if expiry is not None:
        qs = qs.filter(expiry)
    action = {
        'takedown': Q(takedown_request=True),
        'legal': Q(legal_team=True),
        'blocking': Q(blocking_request=True),
        'none': Q(takedown_request=False, legal_team=False, blocking_request=False),
    }.get(params.get('action'))
    if action is not None:
        qs = qs.filter(action)
    return qs


# Site Viewset
class SiteViewSet(BulkCreateMixin, BulkActionMixin, viewsets.ModelViewSet):
    bulk_field = 'domain_name'
    bulk_normalizer = staticmethod(normalize_domain)
    bulk_update_fields = ('legitimacy', 'takedown_request', 'legal_team', 'blocking_request')
    permission_classes = [
        permissions.DjangoModelPermissions
    ]
    serializer_class = SiteSerializer
    pagination_class = StandardResultsSetPagination
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['domain_name', 'ticket_id', 'registrar']
    ordering_fields = ['domain_name', 'ticket_id', 'registrar', 'legitimacy', 'created_at', 'domain_expiry',
                       'ssl_expiry', 'web_status', 'alerts_count', 'open_alerts_count', 'last_alert_at']

    def get_permissions(self):
        # Same rights as the single exports: any authenticated user for Legitimate Domains,
        # the "add site" permission for MISP (see ExportPermission).
        if self.action == 'bulk_export_legitimate':
            # The exported sites are deleted afterwards, so the "delete site" permission is required too.
            return [permissions.IsAuthenticated(), BulkModelPermission()]
        if self.action == 'bulk_export_misp':
            return [ExportPermission()]
        return super().get_permissions()

    @action(detail=False, methods=['get'], url_path='init_progress')
    def init_progress(self, request):
        """
        Number of sites whose first monitoring check is not finished yet (new sites are checked in the background,
        one after the other).
        """
        return Response({'pending': sites_initializing().count()})

    @action(detail=False, methods=['post'], url_path='bulk_export_legitimate')
    def bulk_export_legitimate(self, request):
        """
        Export the selected sites to Legitimate Domains, then remove them from Website Monitoring. Both steps
        are done in one transaction per site: a site is never deleted unless its legitimate domain was created.
        """
        from common.models import LegitimateDomain
        from common.serializers import LegitimateDomainSerializer

        ids, error = self._bulk_ids(request)
        if error:
            return error
        comment = request.data.get('comment') or ''

        def export(site):
            if LegitimateDomain.objects.filter(domain_name=site.domain_name).exists():
                raise BulkSkip('Already exists in Legitimate Domains')
            default_comment = 'Exported from Website Monitoring'
            if site.legitimacy:
                default_comment += f' - Original legitimacy: {site.legitimacy}'
            serializer = LegitimateDomainSerializer(data={
                'domain_name': site.domain_name,
                'ticket_id': site.ticket_id or '',
                'contact': '',
                'expiry': site.domain_expiry,
                'repurchased': False,
                'comments': comment or default_comment,
            }, context={'request': request})
            serializer.is_valid(raise_exception=True)
            serializer.save()
            self.perform_destroy(site)
            return 'Exported to Legitimate Domains and removed from Website Monitoring'

        return self._bulk_each(request, ids, 'exported', export)

    @action(detail=False, methods=['post'], url_path='bulk_export_misp')
    def bulk_export_misp(self, request):
        """
        Export the selected sites to MISP, one event per site: a site that was already exported updates
        its latest event (like the single export does by default), the others get a new event.
        """
        ids, error = self._bulk_ids(request)
        if error:
            return error

        def export(site):
            data = {'id': site.pk}
            uuids = get_misp_uuid(site.domain_name)
            if uuids:
                data['event_uuid'] = uuids[-1]
            serializer = MISPSerializer(data=data)
            serializer.is_valid(raise_exception=True)
            serializer.save()

        return self._bulk_each(request, ids, 'exported', export)

    def get_bulk_serializer_context(self):
        # One sequential background thread for the whole batch instead of one thread per site.
        return {'defer_monitoring_init': True}

    def after_bulk_create(self, sites):
        def run():
            for site in sites:
                try:
                    monitoring_init(site)
                except Exception:
                    logger.exception("Init monitoring failed for %s", site.domain_name)
        threading.Thread(target=run, daemon=True).start()

    def get_queryset(self):
        from timeline.models import TimelineEvent
        qs = Site.objects.annotate(
            alerts_count=Count('alert'),
            open_alerts_count=Count('alert', filter=Q(alert__status=True)),
            last_alert_at=Max('alert__created_at'),
        ).order_by('-created_at', '-id')
        if self.action == 'list':
            qs = filter_sites(qs, self.request.query_params)
        return qs.prefetch_related(
            Prefetch(
                'timeline_events',
                queryset=TimelineEvent.objects.select_related('user__profile').order_by('-timestamp'),
                to_attr='_timeline_events',
            )
        )

    @action(detail=False, methods=['get'], permission_classes=[permissions.IsAuthenticated], url_path='statistics')
    def get_statistics(self, request):
        """
        Get statistics for site monitoring.
        Returns total, malicious, takedown requests, and legal team counts.
        """
        
        try:
            # Base queryset
            queryset = Site.objects.all()
            
            # Total count
            total = queryset.count()
            
            # Malicious count (legitimacy 5 or 6)
            malicious = queryset.filter(legitimacy__in=[5, 6]).count()
            
            # Takedown requests
            takedown_requests = queryset.filter(takedown_request=True).count()
            
            # Legal team involvement
            legal_team = queryset.filter(legal_team=True).count()

            today = datetime.now().date()
            week_ago = datetime.now() - timedelta(days=7)
            new_today = queryset.filter(created_at__date=today).count()
            new_this_week = queryset.filter(created_at__gte=week_ago).count()

            alerts = Alert.objects.all()
            days = [today - timedelta(days=i) for i in range(29, -1, -1)]
            per_day = dict.fromkeys(days, 0)
            for row in (alerts.filter(created_at__gte=days[0]).annotate(day=TruncDate('created_at'))
                        .values('day').annotate(n=Count('id'))):
                if row['day'] in per_day:
                    per_day[row['day']] = row['n']
            registrars = Counter(r for r in queryset.values_list('registrar', flat=True) if r)

            stats = {
                'total': total,
                'malicious': malicious,
                'takedownRequests': takedown_requests,
                'legalTeam': legal_team,
                'blockingRequests': queryset.filter(blocking_request=True).count(),
                'newToday': new_today,
                'newThisWeek': new_this_week,
                'offline': queryset.filter(web_status__isnull=True, monitored=True).count(),
                'expiringSoon': queryset.filter(
                    domain_expiry__gte=today, domain_expiry__lte=today + timedelta(days=EXPIRING_SOON_DAYS)).count(),
                'byLegitimacy': {str(level): n for level, n in
                                 queryset.values_list('legitimacy').annotate(n=Count('id')).order_by()},
                'openAlerts': alerts.filter(status=True).count(),
                'archivedAlerts': alerts.filter(status=False).count(),
                'alertsByKind': {kind: alerts.filter(condition).count() for kind, condition in ALERT_KINDS.items()},
                'alertsPerDay': [{'date': d.isoformat(), 'count': per_day[d]} for d in days],
                'topRegistrars': [{'name': name, 'count': n} for name, n in registrars.most_common(8)],
            }
                        
            return Response(stats, status=status.HTTP_200_OK)
            
        except Exception:
            logger.exception("Error computing Site Monitoring statistics")
            return Response({
                'status': 'error',
                'message': 'An internal error occurred.'
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


# Alert Viewset
class AlertViewSet(BulkActionMixin, viewsets.ModelViewSet):
    bulk_update_fields = ('status',)
    permission_classes = [
        permissions.DjangoModelPermissions
    ]
    serializer_class = AlertSerializer
    pagination_class = StandardResultsSetPagination
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['site__domain_name', 'type']
    ordering_fields = ['id', 'created_at', 'type', 'site__domain_name']

    def get_serializer_class(self):
        return AlertListSerializer if self.action == 'list' else AlertSerializer

    def get_queryset(self):
        qs = Alert.objects.select_related('site').order_by('-created_at', '-id')
        params = self.request.query_params
        site = params.get('site')
        if site is not None:
            qs = qs.filter(site_id=site) if site.isdigit() else qs.none()
        if self.action != 'list':
            return qs
        # List filters: ?status=active|archived, ?kind=<ALERT_KINDS key>, ?period=today|7d|30d
        state = params.get('status')
        if state in ('active', 'archived'):
            qs = qs.filter(status=state == 'active')
        if params.get('kind') in ALERT_KINDS:
            qs = qs.filter(ALERT_KINDS[params['kind']])
        if params.get('period') in PERIODS:
            qs = qs.filter(created_at__date__gte=datetime.now().date() - timedelta(days=PERIODS[params['period']]))
        return qs


class ExportPermission(permissions.DjangoModelPermissions):
    """
    Check for export permission.
    """

    def has_permission(self, request, view):
        return request.user.has_perm('site_monitoring.add_site')


# MISP Viewset
class MISPViewSet(viewsets.ModelViewSet):
    permission_classes = [
        ExportPermission
    ]
    serializer_class = MISPSerializer


# Monitored pages
class MonitoredPageViewSet(BulkActionMixin, viewsets.ModelViewSet):
    """
    Web pages whose text is watched. Filters: ?search (name, url), ?active=yes|no.
    Extra: `GET <id>/versions/` (history), `GET <id>/versions/<version id>/` (text of a version),
    `GET <id>/diff/?from=<version id>&to=<version id>` (rows of the difference; by default the last two versions),
    `POST <id>/check/` (check now).
    """
    bulk_update_fields = ('is_active',)
    permission_classes = [permissions.DjangoModelPermissions]
    serializer_class = MonitoredPageSerializer
    pagination_class = StandardResultsSetPagination
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['name', 'url']
    ordering_fields = ['name', 'url', 'last_checked', 'last_changed', 'last_status', 'threshold', 'created_at',
                       'versions_count']

    def get_queryset(self):
        newest = PageVersion.objects.filter(page=OuterRef('pk')).order_by('-created_at', '-id')
        qs = MonitoredPage.objects.annotate(
            versions_count=Count('versions'),
            last_ratio=Subquery(newest.values('change_ratio')[:1]),
        )
        active = self.request.query_params.get('active')
        if self.action == 'list' and active in ('yes', 'no'):
            qs = qs.filter(is_active=active == 'yes')
        return qs

    @staticmethod
    def page_versions(page):
        """The versions of a page, each flagged with whether it has a screenshot (the images are not read)."""
        return page.versions.annotate(has_screenshot=Exists(PageScreenshot.objects.filter(version=OuterRef('pk'))))

    @action(detail=True, methods=['get'], url_path='versions')
    def versions(self, request, pk=None):
        page = self.get_object()
        return Response(PageVersionSerializer(self.page_versions(page), many=True).data)

    @action(detail=True, methods=['get'], url_path=r'versions/(?P<version_id>\d+)')
    def version(self, request, pk=None, version_id=None):
        page = self.get_object()
        version = get_object_or_404(self.page_versions(page), pk=version_id)
        return Response({**PageVersionSerializer(version).data, 'text': version.text})

    @action(detail=True, methods=['get'], url_path=r'versions/(?P<version_id>\d+)/screenshot')
    def version_screenshot(self, request, pk=None, version_id=None):
        """The screenshot kept with a version (a JPEG)."""
        page = self.get_object()
        shot = get_object_or_404(PageScreenshot.objects.only('image'), version__page=page, version_id=version_id)
        response = HttpResponse(bytes(shot.image), content_type='image/jpeg')
        response['Cache-Control'] = 'private, max-age=86400'
        return response

    @action(detail=True, methods=['post'], url_path='screenshot')
    def screenshot(self, request, pk=None):
        """Take a screenshot of the page now and keep it with the newest version (replacing its own)."""
        page = self.get_object()
        if not screenshots_configured():
            return Response({'error': 'The screenshot service is not configured.'}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        version = page.versions.first()
        if version is None:
            return Response({'error': 'This page has no version yet: wait for its first check.'}, status=status.HTTP_400_BAD_REQUEST)
        if not capture_for_version(page, version):
            return Response({'error': 'The screenshot could not be taken (see the log of Watcher).'}, status=status.HTTP_502_BAD_GATEWAY)
        return Response(PageVersionSerializer(self.page_versions(page).get(pk=version.pk)).data)

    @action(detail=True, methods=['get'], url_path='diff')
    def diff(self, request, pk=None):
        page = self.get_object()
        params = request.query_params
        if params.get('from') and params.get('to'):
            if not (params['from'].isdigit() and params['to'].isdigit()):
                return Response({'error': '"from" and "to" must be version ids.'}, status=status.HTTP_400_BAD_REQUEST)
            old = get_object_or_404(self.page_versions(page), pk=params['from'])
            new = get_object_or_404(self.page_versions(page), pk=params['to'])
        else:
            latest = list(self.page_versions(page)[:2])
            if len(latest) < 2:
                return Response({'error': 'This page has no previous version to compare with.'},
                                status=status.HTTP_400_BAD_REQUEST)
            new, old = latest
        ratio, _, _ = compare_texts(old.text, new.text)
        return Response({'from': PageVersionSerializer(old).data, 'to': PageVersionSerializer(new).data,
                         'ratio': ratio, 'rows': diff_rows(old.text, new.text)})

    @action(detail=True, methods=['post'], url_path='check')
    def check(self, request, pk=None):
        """Check the page now (the answer comes when the page has been downloaded: a few seconds)."""
        page = self.get_object()
        version = check_page(page)
        page.refresh_from_db()
        return Response({'changed': version is not None, 'last_status': page.last_status,
                         'version': PageVersionSerializer(version).data if version else None})
