from .models import Site, Alert
from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.pagination import PageNumberPagination
from datetime import datetime, timedelta
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
        return Site.objects.all().order_by('-created_at')

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
            
            stats = {
                'total': total,
                'malicious': malicious,
                'takedownRequests': takedown_requests,
                'legalTeam': legal_team
            }
                        
            return Response(stats, status=status.HTTP_200_OK)
            
        except Exception as e:
            return Response({
                'status': 'error',
                'message': f'Failed to calculate statistics: {str(e)}'
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


# Alert Viewset
class AlertViewSet(viewsets.ModelViewSet):
    permission_classes = [
        permissions.DjangoModelPermissions
    ]
    serializer_class = AlertSerializer
    pagination_class = StandardResultsSetPagination
    
    def get_queryset(self):
        return Alert.objects.select_related('site').order_by('-created_at')


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
