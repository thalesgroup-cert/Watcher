from .models import DnsMonitored, DnsTwisted, Alert, KeywordMonitored
from rest_framework import viewsets, permissions
from rest_framework.pagination import PageNumberPagination
from .serializers import AlertSerializer, DnsMonitoredSerializer, DnsTwistedSerializer, \
    MISPSerializer, KeywordMonitoredSerializer


# Pagination
class StandardResultsSetPagination(PageNumberPagination):
    page_size = 100
    page_size_query_param = 'page_size'
    max_page_size = 1000


# DnsMonitored Viewset
class DnsMonitoredViewSet(viewsets.ModelViewSet):
    queryset = DnsMonitored.objects.all().order_by('-created_at')
    permission_classes = [
        permissions.DjangoModelPermissions
    ]
    serializer_class = DnsMonitoredSerializer
    pagination_class = StandardResultsSetPagination


# KeywordMonitored Viewset
class KeywordMonitoredViewSet(viewsets.ModelViewSet):
    queryset = KeywordMonitored.objects.all().order_by('-created_at')
    permission_classes = [
        permissions.DjangoModelPermissions
    ]
    serializer_class = KeywordMonitoredSerializer
    pagination_class = StandardResultsSetPagination


# DnsTwisted Viewset
class DnsTwistedViewSet(viewsets.ModelViewSet):
    permission_classes = [
        permissions.DjangoModelPermissions
    ]
    serializer_class = DnsTwistedSerializer
    pagination_class = StandardResultsSetPagination
    
    def get_queryset(self):
        return DnsTwisted.objects.select_related(
            'dns_monitored',
            'keyword_monitored'
        ).order_by('-created_at')


# Alert Viewset
class AlertViewSet(viewsets.ModelViewSet):
    permission_classes = [
        permissions.DjangoModelPermissions
    ]    
    serializer_class = AlertSerializer
    pagination_class = StandardResultsSetPagination
    
    def get_queryset(self):
        return Alert.objects.select_related(
            'dns_twisted',
            'dns_twisted__dns_monitored',
            'dns_twisted__keyword_monitored'
        ).order_by('-created_at')


class ExportPermission(permissions.DjangoModelPermissions):
    """
    Check for export permission.
    """

    def has_permission(self, request, view):
        has_permission = False
        # If User have permission to add website, then user have permission to export it
        if request.user.has_perm('site_monitoring.add_site'):
            has_permission = True
        return has_permission


# MISP Viewset
class MISPViewSet(viewsets.ModelViewSet):
    permission_classes = [
        ExportPermission
    ]
    serializer_class = MISPSerializer
