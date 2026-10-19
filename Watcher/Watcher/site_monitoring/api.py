import logging
from .models import Site, Alert

logger = logging.getLogger('watcher.site_monitoring')
from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.pagination import PageNumberPagination
from datetime import datetime, timedelta
from django.db.models import Prefetch
import threading
from common.bulk import BulkActionMixin, BulkCreateMixin, BulkModelPermission, BulkSkip, normalize_domain
from common.misp import get_misp_uuid
from .core import monitoring_init
from .serializers import SiteSerializer, AlertSerializer, MISPSerializer


# Pagination
class StandardResultsSetPagination(PageNumberPagination):
    page_size = 100
    page_size_query_param = 'page_size'
    max_page_size = 1000


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

    def get_permissions(self):
        # Same rights as the single exports: any authenticated user for Legitimate Domains,
        # the "add site" permission for MISP (see ExportPermission).
        if self.action == 'bulk_export_legitimate':
            # The exported sites are deleted afterwards, so the "delete site" permission is required too.
            return [permissions.IsAuthenticated(), BulkModelPermission()]
        if self.action == 'bulk_export_misp':
            return [ExportPermission()]
        return super().get_permissions()

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
        return Site.objects.all().order_by('-created_at', '-id').prefetch_related(
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

            stats = {
                'total': total,
                'malicious': malicious,
                'takedownRequests': takedown_requests,
                'legalTeam': legal_team,
                'newToday': new_today,
                'newThisWeek': new_this_week,
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
    
    def get_queryset(self):
        qs = Alert.objects.select_related('site').order_by('-created_at', '-id')
        site = self.request.query_params.get('site')
        if site is not None:
            qs = qs.filter(site_id=site) if site.isdigit() else qs.none()
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
