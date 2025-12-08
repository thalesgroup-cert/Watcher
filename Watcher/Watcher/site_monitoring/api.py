from .models import Site, Alert
from rest_framework import viewsets, permissions
from rest_framework.pagination import PageNumberPagination
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
