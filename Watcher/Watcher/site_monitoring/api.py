import logging
from .models import Site, Alert

logger = logging.getLogger('watcher.site_monitoring')
from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.pagination import PageNumberPagination
from datetime import datetime, timedelta
from django.db.models import Prefetch
from .serializers import SiteSerializer, AlertSerializer, MISPSerializer


# Pagination
class StandardResultsSetPagination(PageNumberPagination):
    page_size = 100
    page_size_query_param = 'page_size'
    max_page_size = 1000


# Site Viewset
class SiteViewSet(viewsets.ModelViewSet):
    permission_classes = [
        permissions.DjangoModelPermissions
    ]
    serializer_class = SiteSerializer
    pagination_class = StandardResultsSetPagination
    
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
class AlertViewSet(viewsets.ModelViewSet):
    permission_classes = [
        permissions.DjangoModelPermissions
    ]
    serializer_class = AlertSerializer
    pagination_class = StandardResultsSetPagination
    
    def get_queryset(self):
        qs = Alert.objects.select_related('site').order_by('-created_at', '-id')
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
